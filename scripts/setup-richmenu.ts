/**
 * リッチメニューを LINE Messaging API に登録するセットアップスクリプト。
 *
 * 使い方:
 *   # 1. 既存のリッチメニューを全削除して登録 (推奨：初回 / 大幅変更時)
 *   npm run setup:richmenu -- --clean
 *
 *   # 2. クリーンせず追加のみ
 *   npm run setup:richmenu
 *
 *   # 3. モック確認 (実APIには触らない)
 *   MOCK_MODE=true npm run setup:richmenu
 *
 * 出力:
 *   - 標準出力に各メニューのIDを表示
 *   - deliverables/richmenu/rich-menu-ids.json にIDマッピングを保存
 *   - 後続:
 *       * このJSONを Secret Manager の RICH_MENU_IDS_JSON に登録
 *       * Cloud Run の環境変数として注入
 *       * webhook.ts が自動で読み込み、follow時に役割別リンク
 */
import * as fs from 'fs';
import * as path from 'path';
import { setupAllRichMenus, cleanupRichMenus } from '../src/line/richMenu';
import { logger } from '../src/utils/logger';

async function main() {
  const argv = process.argv.slice(2);
  const clean = argv.includes('--clean');

  if (clean) {
    logger.info('🧹 cleaning existing rich menus ...');
    const removed = await cleanupRichMenus();
    logger.info('cleanup done', { removed });
  }

  logger.info('🎨 registering 3 rich menus (main / owner / activity) ...');
  const ids = await setupAllRichMenus();

  const out = path.resolve(process.cwd(), 'deliverables/richmenu/rich-menu-ids.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ids, null, 2), 'utf-8');

  console.log('\n✅ Rich menus registered successfully:\n');
  for (const [name, id] of Object.entries(ids)) {
    console.log(`   ${name.padEnd(22)} = ${id}`);
  }
  console.log(`\n📁 IDs saved: ${out}`);
  console.log(`\n📌 Next steps:`);
  console.log(`   1. (本番) Secret Manager: RICH_MENU_IDS_JSON = '${JSON.stringify(ids)}'`);
  console.log(`   2. Cloud Run の環境変数として上記を参照`);
  console.log(`   3. 友だち追加時に役割別 (Owner/Staff/Viewer) で自動リンクされます`);
}

main().catch((e) => {
  console.error('❌ setup-richmenu failed:', e);
  process.exit(1);
});
