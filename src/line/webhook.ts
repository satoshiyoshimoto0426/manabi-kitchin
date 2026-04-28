/**
 * LINE Webhook ハンドラ
 * 要件定義 FR-01/05/09, EX-02/10 準拠
 */
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import { store } from '../services/store';
import { authorize } from '../core/auth';
import {
  classifyingMessage,
  buildClassificationMenu,
  buildMainMenu,
  buildManualReceiptPrompt,
  buildReceiptGuide,
  buildRosterGuide,
  buildPhotoGuide,
  buildMembersAdmin,
  buildEventCloseConfirm,
} from './flex';
import { classifyImage } from '../services/gemini';
import { getMessageContent, replyMessage } from '../services/lineClient';
import { saveMedia } from '../services/storage';
import { randomId } from '../utils/crypto';
import { processReceipt, confirmReceiptApproval } from '../core/receiptPipeline';
import { processRoster, confirmRosterApproval } from '../core/rosterPipeline';
import { processEventPhoto, confirmPostApproval } from '../core/photoPipeline';
import { generateMonthlySummary, formatSummaryText } from '../core/summary';
import type { MediaDoc } from '../types/domain';

/** 署名検証 (LINE x-line-signature) */
export function verifySignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (isMocked.line()) return true; // mock時は検証スキップ
  if (!signature) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', env.line.channelSecret)
    .update(body)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleWebhook(req: Request, res: Response) {
  // 署名検証
  const sig = req.header('x-line-signature');
  const raw = (req as any).rawBody ?? JSON.stringify(req.body);
  if (!verifySignature(raw, sig)) {
    logger.warn('invalid LINE signature');
    return res.status(401).send('unauthorized');
  }
  // 即時 ACK: LINE側の timeout を防止
  res.status(200).send('ok');

  const events = (req.body?.events ?? []) as any[];
  for (const ev of events) {
    try {
      await dispatch(ev);
    } catch (e) {
      logger.error('event dispatch failed', { err: (e as Error).message, stack: (e as Error).stack });
    }
  }
}

async function dispatch(ev: any) {
  const userId: string = ev.source?.userId ?? '';
  if (!userId) {
    logger.warn('event without user id', { type: ev.type });
    return;
  }

  const auth = await authorize(userId);
  if (!auth.allowed) {
    // EX-10
    logger.warn('unauthorized sender', { userId, reason: auth.reason });
    if (ev.replyToken) {
      await replyMessage(ev.replyToken, [
        {
          type: 'text',
          text: '🚫 権限がありません。運営代表者にご連絡ください。',
        },
      ]);
    }
    return;
  }

  // follow イベント (友だち追加) → ウェルカム
  if (ev.type === 'follow') {
    await replyMessage(ev.replyToken, [
      {
        type: 'text',
        text:
          '🍙 まなびキッチンへようこそ!\n\n' +
          'レシート・名簿・イベント写真をそのままトークに送るだけで、AIが自動で整理します。\n\n' +
          '下のメニューから操作を選ぶこともできます。',
      },
      buildMainMenu() as any,
    ]);
    return;
  }

  if (ev.type === 'message') {
    await handleMessage(ev, userId);
    return;
  }
  if (ev.type === 'postback') {
    await handlePostback(ev, userId);
    return;
  }
  if (ev.type === 'follow') {
    // 友だち追加時: 役割に応じてリッチメニューをリンク
    const r = (auth.user?.role ?? 'Viewer').toLowerCase() as 'owner' | 'staff' | 'viewer';
    await handleFollow(ev, userId, r);
    return;
  }
  if (ev.type === 'unfollow') {
    logger.info('user unfollowed', { userId });
    return;
  }
}

/** 友だち追加時のウェルカムメッセージ + 役割別メニュー設定 */
async function handleFollow(ev: any, userId: string, role: 'owner' | 'staff' | 'viewer' | undefined) {
  const r = role ?? 'viewer';
  const welcomeText =
    r === 'owner'
      ? '🎉 ManabiOps へようこそ、Owner!\n下のメニューから「メンバー管理」「ダッシュボード」が使えます。'
      : r === 'staff'
      ? '🎉 ManabiOps へようこそ、スタッフのみなさん!\n下のメニューから領収書・名簿・写真を簡単に送信できます。'
      : '👋 友だち追加ありがとうございます。\n運営代表者に承認されると、各種メニューが使えるようになります。';

  if (ev.replyToken) {
    await replyMessage(ev.replyToken, [
      { type: 'text', text: welcomeText },
      buildMainMenu() as any,
    ]);
  }

  // 役割別リッチメニュー (環境変数からID取得)
  try {
    const { linkRichMenuByRole } = await import('./richMenu');
    const menuIds = {
      manabiops_main: process.env.RICHMENU_MAIN_ID ?? '',
      manabiops_owner: process.env.RICHMENU_OWNER_ID ?? '',
      manabiops_activity: process.env.RICHMENU_ACTIVITY_ID ?? '',
    };
    if (menuIds.manabiops_main) {
      await linkRichMenuByRole(userId, r, menuIds);
    }
  } catch (e) {
    logger.warn('rich menu link skipped', { err: (e as Error).message });
  }
}

async function handleMessage(ev: any, userId: string) {
  const msg = ev.message;

  // 画像・動画
  if (msg.type === 'image' || msg.type === 'video') {
    await handleMedia(ev, userId);
    return;
  }

  // テキスト
  if (msg.type === 'text') {
    const text = String(msg.text).trim();

    // 手入力レシート (EX-01)
    if (/^\d{4}-\d{1,2}-\d{1,2}\s*,/.test(text)) {
      await handleManualReceipt(ev, userId, text);
      return;
    }

    // コマンド
    if (/^メニュー|menu/i.test(text)) {
      await replyMessage(ev.replyToken, [buildMainMenu() as any]);
      return;
    }
    if (/^サマリ|summary/i.test(text)) {
      const s = await generateMonthlySummary();
      await replyMessage(ev.replyToken, [{ type: 'text', text: formatSummaryText(s) }]);
      return;
    }
    if (/^ヘルプ|help/i.test(text)) {
      await replyMessage(ev.replyToken, [{ type: 'text', text: HELP_TEXT }]);
      return;
    }
    if (/^手入力/.test(text)) {
      await replyMessage(ev.replyToken, [buildManualReceiptPrompt() as any]);
      return;
    }

    await replyMessage(ev.replyToken, [
      {
        type: 'text',
        text: '📷 画像を送っていただければ自動で処理します。メニューを見るには「メニュー」と送信してください。',
      },
    ]);
    return;
  }
}

async function handleMedia(ev: any, userId: string) {
  const msg = ev.message;
  const mediaId = randomId('md_');

  // 即時応答 (処理中通知) — 要件定義 第5章「3秒以内」
  await replyMessage(ev.replyToken, [classifyingMessage('unknown') as any]);

  // バイナリ取得
  let buffer: Buffer;
  try {
    buffer = await getMessageContent(msg.id);
  } catch (e) {
    logger.error('getMessageContent failed', { err: (e as Error).message });
    return;
  }
  const mimeType = msg.contentProvider?.type === 'external'
    ? guessMime(msg.contentProvider?.originalContentUrl)
    : msg.type === 'video'
    ? 'video/mp4'
    : 'image/jpeg';

  // 保存
  const saved = await saveMedia(mediaId, buffer, mimeType);

  // 初期 media ドキュメント
  const now = new Date().toISOString();
  const media: MediaDoc = {
    mediaId,
    lineUserId: userId,
    messageId: msg.id,
    contentType: mimeType,
    originalUrl: saved.signedUrl,
    classification: 'unknown',
    confidence: 0,
    status: 'classifying',
    receivedAt: now,
    updatedAt: now,
  };
  await store.media.upsert(media);

  // 分類 (FR-01)
  const cls = await classifyImage(buffer, mimeType);
  media.classification = cls.classification;
  media.confidence = cls.confidence;
  media.status = 'processing';
  media.updatedAt = new Date().toISOString();
  await store.media.upsert(media);

  // ルーティング
  if (cls.classification === 'unknown' || cls.confidence < 0.5) {
    // EX-02
    const { pushMessage } = await import('../services/lineClient');
    await pushMessage(userId, [buildClassificationMenu(mediaId) as any]);
    return;
  }

  try {
    if (cls.classification === 'receipt') {
      await processReceipt({
        media,
        buffer,
        mimeType,
        // 既にreply済なのでpushで続行
        replyToken: '', // unused
        lineUserId: userId,
      });
      // replyTokenが消費済のため push に切り替え
    } else if (cls.classification === 'roster') {
      await processRoster({
        media,
        buffer,
        mimeType,
        replyToken: '',
        lineUserId: userId,
      });
    } else if (cls.classification === 'event_photo') {
      await processEventPhoto({
        media,
        buffer,
        mimeType,
        replyToken: '',
        lineUserId: userId,
      });
    }
  } catch (e) {
    logger.error('pipeline failed', {
      kind: cls.classification,
      err: (e as Error).message,
    });
    const { pushMessage } = await import('../services/lineClient');
    await pushMessage(userId, [
      {
        type: 'text',
        text: '⚠ 現在AIが混雑しています。しばらくしてから再送してください。',
      },
    ]);
  }
}

async function handlePostback(ev: any, userId: string) {
  const data = String(ev.postback?.data ?? '');
  const params = new URLSearchParams(data);
  const action = params.get('action');
  const id = params.get('id');

  if (action === 'summary') {
    const s = await generateMonthlySummary();
    await replyMessage(ev.replyToken, [{ type: 'text', text: formatSummaryText(s) }]);
    return;
  }
  if (action === 'help') {
    await replyMessage(ev.replyToken, [{ type: 'text', text: HELP_TEXT }]);
    return;
  }
  if (action === 'manual_receipt') {
    await replyMessage(ev.replyToken, [buildManualReceiptPrompt() as any]);
    return;
  }

  // ===== リッチメニュー: 撮影ガイド =====
  if (action === 'guide') {
    const type = params.get('type');
    if (type === 'receipt') {
      await replyMessage(ev.replyToken, [buildReceiptGuide() as any]);
      return;
    }
    if (type === 'roster') {
      await replyMessage(ev.replyToken, [buildRosterGuide() as any]);
      return;
    }
    if (type === 'photo') {
      await replyMessage(ev.replyToken, [buildPhotoGuide() as any]);
      return;
    }
  }

  // ===== リッチメニュー: Owner専用 =====
  if (action === 'members') {
    const userAuth = await authorize(userId);
    if (userAuth.user?.role !== 'Owner') {
      await replyMessage(ev.replyToken, [{ type: 'text', text: '🚫 この機能はOwner専用です。' }]);
      return;
    }
    await replyMessage(ev.replyToken, [buildMembersAdmin() as any]);
    return;
  }
  if (action === 'expense_report') {
    const s = await generateMonthlySummary();
    await replyMessage(ev.replyToken, [
      { type: 'text', text: '💰 経費レポート（当月）\n' + formatSummaryText(s) },
    ]);
    return;
  }
  if (action === 'sns_history') {
    await replyMessage(ev.replyToken, [
      { type: 'text', text: '📱 直近のSNS投稿履歴は管理画面でご確認ください。\n' + (process.env.ADMIN_URL ?? '') },
    ]);
    return;
  }
  if (action === 'alerts') {
    await replyMessage(ev.replyToken, [
      { type: 'text', text: '⚠ 現在のアラート一覧\n（実装中：管理画面で確認可能）' },
    ]);
    return;
  }
  if (action === 'switch_menu') {
    const to = params.get('to');
    await replyMessage(ev.replyToken, [
      { type: 'text', text: to === 'main' ? '🔄 通常メニューに切り替えました。' : '🔄 メニューを切り替えました。' },
    ]);
    return;
  }

  // ===== 活動日メニュー: 終了報告 =====
  if (action === 'event_close') {
    await replyMessage(ev.replyToken, [buildEventCloseConfirm() as any]);
    return;
  }
  if (action === 'event_close_confirm') {
    const s = await generateMonthlySummary();
    await replyMessage(ev.replyToken, [
      { type: 'text', text: '✨ 本日の活動を終了しました。\n\n📊 当日サマリー:\n' + formatSummaryText(s) },
    ]);
    return;
  }
  if (action === 'event_close_cancel') {
    await replyMessage(ev.replyToken, [{ type: 'text', text: '❌ キャンセルしました。活動を継続します。' }]);
    return;
  }
  if (action === 'pending') {
    const list = await store.pendingApprovals.list((a) => a.status === 'pending' && a.lineUserId === userId);
    if (list.length === 0) {
      await replyMessage(ev.replyToken, [{ type: 'text', text: '📮 保留中はありません。' }]);
    } else {
      const lines = list.map((a) => {
        const p = a.payload as any;
        if (a.kind === 'receipt') return `・🧾 ${p.date} ${p.vendor ?? ''} ¥${p.total}`;
        if (a.kind === 'roster') return `・📋 ${p.eventDate} 参加者${(p.adultCount ?? 0) + (p.childCount ?? 0)}名`;
        return `・📸 ${a.kind}`;
      });
      await replyMessage(ev.replyToken, [
        { type: 'text', text: `📮 保留中 (${list.length}件)\n${lines.join('\n')}` },
      ]);
    }
    return;
  }

  if ((action === 'approve' || action === 'cancel' || action === 'edit') && id) {
    const approval = await store.pendingApprovals.get(id);
    if (!approval) {
      await replyMessage(ev.replyToken, [{ type: 'text', text: '⚠ 承認リクエストが見つかりません (期限切れの可能性)。' }]);
      return;
    }
    if (approval.status !== 'pending') {
      await replyMessage(ev.replyToken, [{ type: 'text', text: '⚠ このリクエストは既に処理済みです。' }]);
      return;
    }

    if (action === 'cancel') {
      await store.pendingApprovals.upsert({ ...approval, status: 'rejected' });
      await replyMessage(ev.replyToken, [{ type: 'text', text: '❌ 取消しました。' }]);
      return;
    }

    if (action === 'edit') {
      // 簡易版: テキストで修正値を送ってもらうフローを案内
      await replyMessage(ev.replyToken, [
        {
          type: 'text',
          text:
            '✏ 修正する項目を以下の形式で送信してください:\n' +
            '金額=1234\n科目=食材費\n店舗=○○スーパー\n日付=2026-04-16\n' +
            `(承認ID: ${approval.approvalId.slice(0, 12)}…)`,
        },
      ]);
      return;
    }

    // approve
    if (approval.kind === 'receipt') {
      const r = await confirmReceiptApproval(approval, userId);
      if (r.ok) {
        await replyMessage(ev.replyToken, [
          {
            type: 'text',
            text: `✅ 登録しました (取引ID: ${r.txId?.slice(0, 12)}…)\n会計台帳に自動記帳されます。`,
          },
        ]);
      } else {
        await replyMessage(ev.replyToken, [{ type: 'text', text: `❌ 登録失敗: ${r.reason}` }]);
      }
      return;
    }
    if (approval.kind === 'roster') {
      const r = await confirmRosterApproval(approval, userId);
      if (r.ok) {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: `✅ 名簿を登録しました (イベントID: ${r.eventId?.slice(0, 12)}…)` },
        ]);
      } else {
        await replyMessage(ev.replyToken, [{ type: 'text', text: '❌ 名簿登録に失敗しました' }]);
      }
      return;
    }
    if (approval.kind === 'post') {
      const r = await confirmPostApproval(approval, userId);
      if (r.ok) {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: `✅ Instagramに投稿しました\n${r.postUrl}` },
        ]);
      } else {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: `❌ 投稿失敗: ${r.reason}` },
        ]);
      }
      return;
    }
  }

  if (action === 'reclass' && id) {
    const as = params.get('as') as 'receipt' | 'roster' | 'event_photo' | null;
    if (!as) return;
    const media = await store.media.get(id);
    if (!media) {
      await replyMessage(ev.replyToken, [{ type: 'text', text: '⚠ メディアが見つかりません。' }]);
      return;
    }
    // メディアを再取得して該当パイプラインへ
    const buffer = await getMessageContent(media.messageId).catch(() => null);
    if (!buffer) {
      await replyMessage(ev.replyToken, [
        { type: 'text', text: '⚠ 画像の再取得に失敗しました (LINEの保持期間切れの可能性)。' },
      ]);
      return;
    }
    media.classification = as;
    await store.media.upsert(media);
    if (as === 'receipt')
      await processReceipt({ media, buffer, mimeType: media.contentType, replyToken: '', lineUserId: userId });
    else if (as === 'roster')
      await processRoster({ media, buffer, mimeType: media.contentType, replyToken: '', lineUserId: userId });
    else
      await processEventPhoto({
        media,
        buffer,
        mimeType: media.contentType,
        replyToken: '',
        lineUserId: userId,
      });
    return;
  }
}

async function handleManualReceipt(ev: any, userId: string, text: string) {
  const [date, vendor, amountStr, category] = text.split(',').map((s) => s.trim());
  const amount = Number(amountStr);
  if (!date || !vendor || !amount) {
    await replyMessage(ev.replyToken, [
      { type: 'text', text: '⚠ 形式が正しくありません。例: 2026-04-16,○○スーパー,4820,食材費' },
    ]);
    return;
  }
  const { confirmReceiptApproval } = await import('../core/receiptPipeline');
  // pending として扱わず直接承認扱いに (手入力=スタッフ自身の意志)
  const approval = {
    approvalId: randomId('apr_'),
    kind: 'receipt' as const,
    lineUserId: userId,
    payload: {
      date,
      vendor,
      total: amount,
      category: category || '雑費',
      items: ['(手入力)'],
      rawText: text,
      ocrConfidence: 1.0,
      catConfidence: 1.0,
      dedupKey: `manual|${date}|${vendor}|${amount}`,
    },
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
  await store.pendingApprovals.upsert(approval);
  const r = await confirmReceiptApproval(approval, userId);
  if (r.ok) {
    await replyMessage(ev.replyToken, [
      { type: 'text', text: `✅ 手入力で登録しました (ID: ${r.txId?.slice(0, 12)}…)` },
    ]);
  }
}

function guessMime(url?: string): string {
  if (!url) return 'image/jpeg';
  if (/\.png/i.test(url)) return 'image/png';
  if (/\.mp4/i.test(url)) return 'video/mp4';
  return 'image/jpeg';
}

const HELP_TEXT =
  '❓ 使い方\n' +
  '━━━━━━━━━━━\n' +
  '1. レシート・名簿・写真をトークに送信\n' +
  '2. AIの解析結果を確認\n' +
  '3. [✅登録] ボタンで確定\n\n' +
  'テキストコマンド:\n' +
  '・「メニュー」で操作選択\n' +
  '・「サマリ」で月次集計\n' +
  '・「手入力」でレシート直接入力';
