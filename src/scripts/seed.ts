/**
 * 開発用シードデータ投入
 * - サンプル users / events / transactions / participants を作成
 * - ローカル MOCK_MODE で動作確認するのに使用
 */
import { store } from '../services/store';
import { addUser } from '../core/auth';
import { hashName, encryptName, randomId } from '../utils/crypto';
import { logger } from '../utils/logger';

async function run() {
  logger.info('seeding mock data...');

  // users (ホワイトリスト)
  await addUser('U_owner_demo_000001', 'Owner', 'seed', '運営代表 (デモ)');
  await addUser('U_operator_demo_0002', 'Operator', 'seed', '当日スタッフ (デモ)');
  await addUser('U_accountant_demo_03', 'Accountant', 'seed', '経理担当 (デモ)');
  await addUser('U_viewer_demo_000004', 'Viewer', 'seed', '関係者 (デモ)');

  // events
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const date = d.toISOString().slice(0, 10);
    const adult = 3 + i;
    const child = 8 + i * 2;
    const rev = adult * 300 + child * 100;
    await store.events.upsert({
      eventId: randomId('ev_'),
      date,
      adultCount: adult,
      childCount: child,
      totalRevenue: rev,
      totalCost: 0,
      createdAt: new Date().toISOString(),
    });
    // 収入取引
    await store.transactions.upsert({
      txId: randomId('tx_'),
      type: 'income',
      category: '収入',
      amount: rev,
      vendor: '参加者利用料',
      date,
      items: [`大人${adult}名`, `こども${child}名`],
      confidence: 1,
      approvedBy: 'seed',
      approvedAt: new Date().toISOString(),
      syncedToSheets: true,
      syncedAt: new Date().toISOString(),
      dedupKey: `seed-income-${date}`,
    });
    // 支出取引 (食材費)
    await store.transactions.upsert({
      txId: randomId('tx_'),
      type: 'expense',
      category: '食材費',
      amount: 4820 + i * 500,
      vendor: '○○スーパー',
      date,
      items: ['米', '野菜', '牛乳'],
      confidence: 0.93,
      approvedBy: 'seed',
      approvedAt: new Date().toISOString(),
      syncedToSheets: true,
      syncedAt: new Date().toISOString(),
      dedupKey: `seed-exp-food-${date}`,
    });
    // 支出 (消耗品費)
    if (i === 0) {
      await store.transactions.upsert({
        txId: randomId('tx_'),
        type: 'expense',
        category: '消耗品費',
        amount: 1380,
        vendor: '△△ドラッグ',
        date,
        items: ['キッチンペーパー', '洗剤'],
        confidence: 0.88,
        approvedBy: 'seed',
        approvedAt: new Date().toISOString(),
        syncedToSheets: true,
        syncedAt: new Date().toISOString(),
        dedupKey: `seed-exp-daily-${date}`,
      });
    }
  }

  // participants
  const names = ['山田太郎', '山田花子', '佐藤一郎', '鈴木さくら', '田中健', '伊藤まり'];
  for (const n of names) {
    const isChild = /花子|さくら|まり|健/.test(n);
    await store.participants.upsert({
      participantId: randomId('pt_'),
      nameHash: hashName(n),
      nameEncrypted: encryptName(n),
      category: isChild ? 'child' : 'adult',
      firstVisit: today.toISOString().slice(0, 10),
      lastVisit: today.toISOString().slice(0, 10),
      visitCount: 1 + Math.floor(Math.random() * 5),
    });
  }

  logger.info('seed complete');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
