/**
 * Google Sheets 会計台帳連携
 * 要件定義 FR-03: 「Google Sheets の指定行にデータを追記」
 * 要件定義 EX-05: Sheets API エラー時は Firestore には保存、1時間ごとのバッチで再送
 * 要件定義 第5章 保守性: 運営者が Sheets 上で直接修正可能
 */
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import type { TransactionDoc } from '../types/domain';
import * as fs from 'fs';
import * as path from 'path';

const MOCK_LEDGER = path.resolve(process.cwd(), '.mock-data', 'ledger.csv');

/** 会計台帳への行追加 */
export async function appendLedgerRow(tx: TransactionDoc): Promise<void> {
  const row = [
    tx.date,
    tx.type === 'income' ? '収入' : '支出',
    tx.category,
    String(tx.amount),
    tx.vendor ?? '',
    (tx.items ?? []).join(' / '),
    tx.txId,
    tx.approvedBy,
    tx.approvedAt,
    tx.receiptUrl ?? '',
  ];

  if (isMocked.sheets()) {
    if (!fs.existsSync(path.dirname(MOCK_LEDGER)))
      fs.mkdirSync(path.dirname(MOCK_LEDGER), { recursive: true });
    if (!fs.existsSync(MOCK_LEDGER)) {
      fs.writeFileSync(
        MOCK_LEDGER,
        '日付,種別,勘定科目,金額,店舗,品目,取引ID,承認者,承認日時,レシートURL\n',
        'utf8',
      );
    }
    fs.appendFileSync(MOCK_LEDGER, row.map(csvEscape).join(',') + '\n', 'utf8');
    logger.info('ledger appended (mock)', { txId: tx.txId });
    return;
  }

  await retry(
    async () => {
      const { google } = require('googleapis');
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.values.append({
        spreadsheetId: env.sheets.spreadsheetId,
        range: `${env.sheets.ledgerName}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
      logger.info('ledger appended (sheets)', { txId: tx.txId });
    },
    { label: 'sheets.append', maxAttempts: 3 },
  );
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** EX-05: 未同期トランザクションの再送バッチ */
export async function retryUnsyncedLedger(
  transactions: TransactionDoc[],
  update: (tx: TransactionDoc) => Promise<void>,
): Promise<{ retried: number; succeeded: number }> {
  let ok = 0;
  for (const tx of transactions) {
    if (tx.syncedToSheets) continue;
    try {
      await appendLedgerRow(tx);
      tx.syncedToSheets = true;
      tx.syncedAt = new Date().toISOString();
      await update(tx);
      ok++;
    } catch (e) {
      logger.warn('ledger resync failed', { txId: tx.txId, err: (e as Error).message });
    }
  }
  return { retried: transactions.length, succeeded: ok };
}

/** mock CSV を取得 (管理画面確認用) */
export function readMockLedger(): string {
  if (!fs.existsSync(MOCK_LEDGER)) return '';
  return fs.readFileSync(MOCK_LEDGER, 'utf8');
}
