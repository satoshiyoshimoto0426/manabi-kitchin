/**
 * バッチ処理 (EX-05 Sheets 未同期再送 / EX-07 タイムアウト承認 / EX-11 Storage 監視)
 * 1時間ごとに起動する想定 (Cloud Scheduler → /tasks/hourly)
 */
import { logger } from '../utils/logger';
import { store } from '../services/store';
import { appendLedgerRow } from '../services/sheets';
import { pushMessage } from '../services/lineClient';

/** EX-05: 未同期台帳の再送 */
export async function retryUnsyncedLedgers() {
  const txs = await store.transactions.list((t) => !t.syncedToSheets);
  let ok = 0;
  for (const tx of txs) {
    try {
      await appendLedgerRow(tx);
      tx.syncedToSheets = true;
      tx.syncedAt = new Date().toISOString();
      await store.transactions.upsert(tx);
      ok++;
    } catch (e) {
      logger.warn('ledger resync failed', { txId: tx.txId, err: (e as Error).message });
    }
  }
  logger.info('ledger resync batch', { total: txs.length, ok });
  return { total: txs.length, ok };
}

/** EX-07: 24時間未応答のリマインド / 48時間で自動破棄 */
export async function handleStalePendings() {
  const now = Date.now();
  const pendings = await store.pendingApprovals.list((a) => a.status === 'pending');
  let reminded = 0;
  let expired = 0;
  for (const a of pendings) {
    const created = new Date(a.createdAt).getTime();
    const expires = new Date(a.expiresAt).getTime();
    if (now >= expires) {
      await store.pendingApprovals.upsert({ ...a, status: 'expired' });
      expired++;
      continue;
    }
    const age = now - created;
    if (age >= 24 * 60 * 60 * 1000 && age < 25 * 60 * 60 * 1000) {
      try {
        const hours = Math.floor(age / 3600000);
        await pushMessage(a.lineUserId, [
          {
            type: 'text',
            text: `⏰ ${hours}時間前に送信された画像が未処理です。承認が必要です。`,
          },
        ]);
        reminded++;
      } catch (e) {
        logger.warn('reminder push failed', { err: (e as Error).message });
      }
    }
  }
  logger.info('stale pendings batch', { reminded, expired });
  return { reminded, expired };
}

/** EX-11: Storage 容量監視 (mock時は件数カウント, 本番はGCS Storage Monitoring 相当) */
export async function checkStorageCapacity() {
  const media = await store.media.list();
  const bytes = media.length * 500_000; // mock: 平均500KB想定
  const GB = bytes / 1024 / 1024 / 1024;
  const threshold = 4; // 4GB超で警告
  if (GB > threshold) {
    // Owner に通知
    const owners = (await store.users.list()).filter((u) => u.role === 'Owner' && u.active);
    for (const o of owners) {
      try {
        await pushMessage(o.lineUserId, [
          {
            type: 'text',
            text: `⚠ メディア容量が ${GB.toFixed(2)}GB に達しました。古い画像の削除を検討してください。`,
          },
        ]);
      } catch {
        /* ignore */
      }
    }
  }
  logger.info('storage capacity check', { mediaCount: media.length, estimatedGB: GB });
  return { mediaCount: media.length, estimatedGB: GB };
}

export async function runHourlyBatch() {
  return {
    ledger: await retryUnsyncedLedgers(),
    pendings: await handleStalePendings(),
    storage: await checkStorageCapacity(),
  };
}
