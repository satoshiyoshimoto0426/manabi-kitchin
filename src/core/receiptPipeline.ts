/**
 * レシート処理パイプライン (FR-02, FR-03, FR-09)
 * 受信 → OCR → 科目推論 → 承認待ち登録 → Flex 提示
 * EX-01: OCR信頼度低 → 手入力フォーム誘導
 * EX-08: 重複検知
 */
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { store } from '../services/store';
import { ocrReceipt } from '../services/documentai';
import { inferAccountCategory } from '../services/gemini';
import { appendLedgerRow } from '../services/sheets';
import { randomId } from '../utils/crypto';
import type { TransactionDoc, PendingApprovalDoc, MediaDoc } from '../types/domain';
import {
  buildReceiptApprovalFlex,
  buildManualReceiptPrompt,
} from '../line/flex';
import { replyMessage, pushMessage } from '../services/lineClient';

export async function processReceipt(params: {
  media: MediaDoc;
  buffer: Buffer;
  mimeType: string;
  replyToken: string;
  lineUserId: string;
}) {
  const { media, buffer, mimeType, replyToken, lineUserId } = params;

  // 1) OCR 実行
  const ocr = await ocrReceipt(buffer, mimeType);
  logger.info('receipt OCR done', {
    mediaId: media.mediaId,
    vendor: ocr.vendor,
    total: ocr.total,
    conf: ocr.confidence,
  });

  // EX-01: 信頼度低 → 手入力フォーム誘導
  if (ocr.confidence < env.ocr.confidenceThreshold || ocr.total <= 0) {
    await replyMessage(replyToken, [
      {
        type: 'text',
        text: '🧾 文字が読み取れませんでした。手入力するか、明るい場所で再撮影をお願いします。',
      },
      buildManualReceiptPrompt() as any,
    ]);
    await store.media.upsert({ ...media, status: 'error', updatedAt: new Date().toISOString() });
    return;
  }

  // 2) 勘定科目推論
  const inf = await inferAccountCategory({
    vendor: ocr.vendor,
    items: ocr.items,
    total: ocr.total,
  });

  // 3) 重複検出 (EX-08)
  const date = ocr.date ?? new Date().toISOString().slice(0, 10);
  const dedupKey = `${date}|${ocr.vendor ?? ''}|${ocr.total}`;
  const dup = await store.transactions.findByDedup(dedupKey);

  // 4) pendingApproval 登録
  const approvalId = randomId('apr_');
  const now = new Date();
  const expires = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h
  const pending: PendingApprovalDoc = {
    approvalId,
    kind: 'receipt',
    lineUserId,
    payload: {
      mediaId: media.mediaId,
      date,
      vendor: ocr.vendor,
      total: ocr.total,
      category: inf.category,
      items: ocr.items,
      rawText: ocr.rawText,
      ocrConfidence: ocr.confidence,
      catConfidence: inf.confidence,
      dedupKey,
      dupTxId: dup?.txId ?? null,
    },
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  await store.pendingApprovals.upsert(pending);

  // 5) 応答
  const flex = buildReceiptApprovalFlex({
    approvalId,
    vendor: ocr.vendor ?? '',
    total: ocr.total,
    date,
    category: inf.category,
    items: ocr.items,
    confidence: Math.min(ocr.confidence, inf.confidence),
  });

  const msgs: any[] = [flex];
  if (dup) {
    msgs.unshift({
      type: 'text',
      text: `⚠ 同一内容のレシートが既に登録されています (${dup.date} ${dup.vendor ?? ''} ¥${dup.amount}).\n重複登録する場合は「登録」を押してください。`,
    });
  }
  await replyMessage(replyToken, msgs);

  await store.media.upsert({
    ...media,
    status: 'pending_approval',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 承認時の確定処理
 */
export async function confirmReceiptApproval(
  approval: PendingApprovalDoc,
  approvedBy: string,
): Promise<{ ok: boolean; txId?: string; reason?: string }> {
  if (approval.kind !== 'receipt') return { ok: false, reason: 'not a receipt approval' };
  const p = approval.payload as any;

  const tx: TransactionDoc = {
    txId: randomId('tx_'),
    eventId: null,
    type: 'expense',
    category: p.category,
    amount: Number(p.total),
    vendor: p.vendor,
    date: p.date,
    items: p.items ?? [],
    rawOcrText: p.rawText,
    confidence: Math.min(Number(p.ocrConfidence ?? 0), Number(p.catConfidence ?? 0)),
    approvedBy,
    approvedAt: new Date().toISOString(),
    syncedToSheets: false,
    dedupKey: p.dedupKey,
  };
  await store.transactions.upsert(tx);

  // Sheets 書き込み (EX-05: 失敗時は未同期で残す)
  try {
    await appendLedgerRow(tx);
    tx.syncedToSheets = true;
    tx.syncedAt = new Date().toISOString();
    await store.transactions.upsert(tx);
  } catch (e) {
    logger.error('sheets append failed (will be retried by batch)', {
      txId: tx.txId,
      err: (e as Error).message,
    });
    try {
      await pushMessage(approvedBy, [
        {
          type: 'text',
          text: '⚠ 台帳への書き込みに失敗しました。1時間後に自動で再送します。',
        },
      ]);
    } catch {
      /* ignore */
    }
  }

  // 承認ドキュメント更新
  await store.pendingApprovals.upsert({
    ...approval,
    status: 'approved',
  });

  return { ok: true, txId: tx.txId };
}
