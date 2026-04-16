/**
 * FR-11 月次サマリ自動生成
 * FR-12 ダッシュボード (Looker Studio 連携用の集計)
 * 受入基準: 月次集計値が会計台帳の手計算値と 100% 一致
 */
import { store } from '../services/store';

export interface MonthlySummary {
  yearMonth: string; // YYYY-MM
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: Array<{ category: string; amount: number }>;
  eventCount: number;
  adultCount: number;
  childCount: number;
  uniqueParticipants: number;
}

export async function generateMonthlySummary(ym?: string): Promise<MonthlySummary> {
  const target = ym ?? new Date().toISOString().slice(0, 7);

  const txs = await store.transactions.list((t) => t.date?.startsWith(target));
  let totalIncome = 0;
  let totalExpense = 0;
  const catMap = new Map<string, number>();
  for (const t of txs) {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
    if (t.type === 'expense') {
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
    }
  }

  const events = await store.events.list();
  const mEvents = events.filter((e) => e.date?.startsWith(target));
  const adultCount = mEvents.reduce((s, e) => s + (e.adultCount ?? 0), 0);
  const childCount = mEvents.reduce((s, e) => s + (e.childCount ?? 0), 0);

  // 当月の初回参加者数 = この月にfirstVisitを持つparticipants
  const participants = await store.participants.list();
  const uniqueParticipants = participants.filter((p) =>
    p.lastVisit?.startsWith(target),
  ).length;

  return {
    yearMonth: target,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    byCategory: Array.from(catMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    eventCount: mEvents.length,
    adultCount,
    childCount,
    uniqueParticipants,
  };
}

export function formatSummaryText(s: MonthlySummary): string {
  const cats = s.byCategory
    .slice(0, 6)
    .map((c) => `・${c.category}: ¥${c.amount.toLocaleString()}`)
    .join('\n');
  return (
    `📊 ${s.yearMonth} 月次サマリ\n` +
    `━━━━━━━━━━━━\n` +
    `💰 収入: ¥${s.totalIncome.toLocaleString()}\n` +
    `💸 支出: ¥${s.totalExpense.toLocaleString()}\n` +
    `🏦 残高: ¥${s.balance.toLocaleString()}\n` +
    `\n👥 参加者\n` +
    `・開催回数: ${s.eventCount}回\n` +
    `・大人: ${s.adultCount}名 / こども: ${s.childCount}名\n` +
    `・ユニーク参加者: ${s.uniqueParticipants}名\n` +
    `\n🏷 支出カテゴリ\n${cats || '・(該当なし)'}`
  );
}
