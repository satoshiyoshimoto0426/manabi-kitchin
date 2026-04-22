/**
 * 名簿処理パイプライン (FR-04, FR-09)
 * OCR → 氏名ハッシュ化 → 既存participantsと照合 → サマリ提示 → 承認後DB登録
 */
import { logger } from '../utils/logger';
import { store } from '../services/store';
import { ocrRoster } from '../services/documentai';
import { hashName, encryptName, randomId } from '../utils/crypto';
import type { MediaDoc, PendingApprovalDoc, ParticipantDoc, EventDoc } from '../types/domain';
import { buildRosterApprovalFlex } from '../line/flex';
import { replyMessage } from '../services/lineClient';

export async function processRoster(params: {
  media: MediaDoc;
  buffer: Buffer;
  mimeType: string;
  replyToken: string;
  lineUserId: string;
}) {
  const { media, buffer, mimeType, replyToken, lineUserId } = params;

  const ocr = await ocrRoster(buffer, mimeType);
  logger.info('roster OCR done', { mediaId: media.mediaId, entries: ocr.entries.length });

  // 既存照合
  const today = new Date().toISOString().slice(0, 10);
  const processed: Array<
    { name: string; nameHash: string; category: 'adult' | 'child'; fee: number; isNew: boolean }
  > = [];
  for (const e of ocr.entries) {
    const h = hashName(e.name);
    const existing = await store.participants.findByHash(h);
    processed.push({
      name: e.name,
      nameHash: h,
      category: e.category,
      fee: e.fee ?? (e.category === 'adult' ? 300 : 100),
      isNew: !existing,
    });
  }
  const adultCount = processed.filter((p) => p.category === 'adult').length;
  const childCount = processed.filter((p) => p.category === 'child').length;
  const newcomerCount = processed.filter((p) => p.isNew).length;
  const totalFee = processed.reduce((s, p) => s + p.fee, 0);

  const approvalId = randomId('apr_');
  const approval: PendingApprovalDoc = {
    approvalId,
    kind: 'roster',
    lineUserId,
    payload: {
      mediaId: media.mediaId,
      eventDate: today,
      entries: processed,
      adultCount,
      childCount,
      newcomerCount,
      totalFee,
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
  await store.pendingApprovals.upsert(approval);

  const flex = buildRosterApprovalFlex({
    approvalId,
    eventDate: today,
    adultCount,
    childCount,
    newcomerCount,
    totalFee,
  });
  await replyMessage(replyToken, [flex]);

  await store.media.upsert({
    ...media,
    status: 'pending_approval',
    updatedAt: new Date().toISOString(),
  });
}

export async function confirmRosterApproval(
  approval: PendingApprovalDoc,
  _approvedBy: string,
): Promise<{ ok: boolean; eventId?: string }> {
  if (approval.kind !== 'roster') return { ok: false };
  const p = approval.payload as any;
  const entries: Array<any> = p.entries ?? [];
  const eventDate: string = p.eventDate;

  // event upsert (日付をキーに簡易マージ: 同日イベントがあれば合算)
  const events = await store.events.list();
  let ev = events.find((e) => e.date === eventDate);
  const newAdult = p.adultCount ?? 0;
  const newChild = p.childCount ?? 0;
  const newRev = p.totalFee ?? 0;
  if (!ev) {
    ev = {
      eventId: randomId('ev_'),
      date: eventDate,
      adultCount: newAdult,
      childCount: newChild,
      totalRevenue: newRev,
      totalCost: 0,
      createdAt: new Date().toISOString(),
    };
  } else {
    ev = {
      ...ev,
      adultCount: ev.adultCount + newAdult,
      childCount: ev.childCount + newChild,
      totalRevenue: ev.totalRevenue + newRev,
    };
  }
  await store.events.upsert(ev);

  // participants upsert
  for (const e of entries) {
    const existing = await store.participants.findByHash(e.nameHash);
    if (existing) {
      await store.participants.upsert({
        ...existing,
        lastVisit: eventDate,
        visitCount: existing.visitCount + 1,
      });
    } else {
      const p: ParticipantDoc = {
        participantId: randomId('pt_'),
        nameHash: e.nameHash,
        nameEncrypted: encryptName(e.name),
        category: e.category,
        firstVisit: eventDate,
        lastVisit: eventDate,
        visitCount: 1,
      };
      await store.participants.upsert(p);
    }
  }

  // 収入 (利用料) を transactions にも記録
  const { randomId: rid } = await import('../utils/crypto');
  const { store: s } = await import('../services/store');
  if (newRev > 0) {
    await s.transactions.upsert({
      txId: rid('tx_'),
      eventId: ev.eventId,
      type: 'income',
      category: '収入',
      amount: newRev,
      vendor: '参加者利用料',
      date: eventDate,
      items: [`大人${newAdult}名`, `こども${newChild}名`],
      confidence: 1.0,
      approvedBy: _approvedBy,
      approvedAt: new Date().toISOString(),
      syncedToSheets: false,
      dedupKey: `roster|${eventDate}|${newRev}`,
    });
  }

  await store.pendingApprovals.upsert({ ...approval, status: 'approved' });
  return { ok: true, eventId: ev.eventId };
}
