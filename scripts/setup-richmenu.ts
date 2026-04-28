#!/usr/bin/env -S npx ts-node --transpile-only
/**
 * リッチメニュー一括セットアップ CLI
 *
 * 使い方:
 *   npm run setup:richmenu              # 本番モード (LINE API呼び出し)
 *   MOCK_MODE=true npm run setup:richmenu  # ドライラン
 *
 * 完了後、以下のIDを Secret Manager / .env に保存してください:
 *   - RICHMENU_MAIN_ID
 *   - RICHMENU_OWNER_ID
 *   - RICHMENU_ACTIVITY_ID
 */

import { setupAllRichMenus, ALL_MENUS } from '../src/line/richMenu';
import { logger } from '../src/utils/logger';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  ManabiOps リッチメニュー セットアップ');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n登録予定: ${ALL_MENUS.map((m) => m.name).join(', ')}\n`);

  try {
    const ids = await setupAllRichMenus();

    console.log('\n✅ 全メニュー登録完了');
    console.log('\n📋 以下のIDを保存してください:\n');
    console.log('───────────────────────────────────────────────');
    Object.entries(ids).forEach(([name, id]) => {
      const envKey =
        name === 'manabiops_main' ? 'RICHMENU_MAIN_ID' :
        name === 'manabiops_owner' ? 'RICHMENU_OWNER_ID' :
        name === 'manabiops_activity' ? 'RICHMENU_ACTIVITY_ID' :
        name.toUpperCase();
      console.log(`  ${envKey}=${id}`);
    });
    console.log('───────────────────────────────────────────────');
    console.log('\n💡 Secret Manager に保存:');
    Object.entries(ids).forEach(([name, id]) => {
      const sm =
        name === 'manabiops_main' ? 'richmenu-main-id' :
        name === 'manabiops_owner' ? 'richmenu-owner-id' :
        'richmenu-activity-id';
      console.log(`  echo -n "${id}" | gcloud secrets create ${sm} --data-file=-`);
    });
    console.log('\n🎉 完了！LINE Bot 友だち追加すると即座にメニューが表示されます。');
  } catch (e) {
    logger.error('richMenu setup failed', { err: (e as Error).message });
    console.error('\n❌ セットアップ失敗:', (e as Error).message);
    process.exit(1);
  }
}

main();
