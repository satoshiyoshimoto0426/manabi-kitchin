/**
 * リッチメニュー定義 & 登録ユーティリティ
 *
 * LINE Messaging API のリッチメニューを：
 *   - main: 全Staff/Owner デフォルト (3x2 6セル)
 *   - owner: Owner専用 (3x2 6セル)
 *   - activity: 活動日専用 (2x2 4セル・大ボタン)
 *
 * の3種類で登録します。
 *
 * 関連:
 * - 要件定義 第9章 UI 原則「3タップ以内」
 * - docs/features/10_公式LINEとリッチメニュー.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';

/** リッチメニュー サイズ (LINE Messaging API 仕様) */
const FULL_SIZE = { width: 2500, height: 1686 };

/**
 * 6セルメニュー領域: 3列×2段
 * 1セル: 833x843 (端数を吸収するため最後の列だけ834)
 */
function gridAreas3x2(): Array<{ bounds: { x: number; y: number; width: number; height: number } }> {
  const colW = Math.floor(FULL_SIZE.width / 3);
  const rowH = Math.floor(FULL_SIZE.height / 2);
  const areas = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const isLastCol = c === 2;
      areas.push({
        bounds: {
          x: c * colW,
          y: r * rowH,
          width: isLastCol ? FULL_SIZE.width - c * colW : colW,
          height: r === 1 ? FULL_SIZE.height - rowH : rowH,
        },
      });
    }
  }
  return areas;
}

/** 4セルメニュー領域: 2列×2段 */
function gridAreas2x2(): Array<{ bounds: { x: number; y: number; width: number; height: number } }> {
  const colW = Math.floor(FULL_SIZE.width / 2);
  const rowH = Math.floor(FULL_SIZE.height / 2);
  const areas = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      areas.push({
        bounds: {
          x: c * colW,
          y: r * rowH,
          width: c === 1 ? FULL_SIZE.width - colW : colW,
          height: r === 1 ? FULL_SIZE.height - rowH : rowH,
        },
      });
    }
  }
  return areas;
}

/** Postback / URI アクション定義 */
type RichAction =
  | { type: 'postback'; data: string; displayText?: string }
  | { type: 'uri'; uri: string }
  | { type: 'message'; text: string };

interface RichMenuDef {
  name: string;            // 表示名（管理画面用）
  chatBarText: string;     // メニューを開く前のラベル
  size: { width: number; height: number };
  selected: boolean;       // 友だち追加直後に表示するか
  imagePath: string;       // 同梱の画像ファイル
  actions: RichAction[];   // 各セルの動作（順番がgridと対応）
  layout: '3x2' | '2x2';
}

// =============================================================
// メインメニュー（Staff/Owner デフォルト）
// 順序: 領収書 / 名簿撮影 / 活動写真 / 月次サマリー / 承認待ち / 管理画面
// =============================================================
export const MENU_MAIN: RichMenuDef = {
  name: 'manabiops_main',
  chatBarText: 'メニュー',
  size: FULL_SIZE,
  selected: true,
  layout: '3x2',
  imagePath: 'deliverables/richmenu/main_menu.png',
  actions: [
    { type: 'postback', data: 'action=guide&type=receipt', displayText: '🧾 領収書を送る' },
    { type: 'postback', data: 'action=guide&type=roster',  displayText: '📋 名簿を撮る' },
    { type: 'postback', data: 'action=guide&type=photo',   displayText: '📷 活動写真を送る' },
    { type: 'postback', data: 'action=summary',            displayText: '📊 月次サマリー' },
    { type: 'postback', data: 'action=pending',            displayText: '📮 承認待ち一覧' },
    { type: 'postback', data: 'action=help',               displayText: '⚙ ヘルプ' },
  ],
};

// =============================================================
// Owner専用メニュー
// =============================================================
export const MENU_OWNER: RichMenuDef = {
  name: 'manabiops_owner',
  chatBarText: 'Owner メニュー',
  size: FULL_SIZE,
  selected: false,
  layout: '3x2',
  imagePath: 'deliverables/richmenu/owner_menu.png',
  actions: [
    { type: 'postback', data: 'action=members',     displayText: '👥 メンバー管理' },
    { type: 'uri',      uri: `${process.env.ADMIN_URL ?? 'https://example.com/admin'}/dashboard` },
    { type: 'postback', data: 'action=expense_report', displayText: '💰 経費レポート' },
    { type: 'postback', data: 'action=sns_history', displayText: '📱 SNS投稿履歴' },
    { type: 'postback', data: 'action=alerts',      displayText: '⚠ アラート一覧' },
    { type: 'postback', data: 'action=switch_menu&to=main', displayText: '🔄 通常メニューへ' },
  ],
};

// =============================================================
// 活動日メニュー（2x2 大ボタン）
// =============================================================
export const MENU_ACTIVITY: RichMenuDef = {
  name: 'manabiops_activity',
  chatBarText: '今日のメニュー',
  size: FULL_SIZE,
  selected: false,
  layout: '2x2',
  imagePath: 'deliverables/richmenu/activity_menu.png',
  actions: [
    { type: 'postback', data: 'action=guide&type=receipt&context=shopping', displayText: '🍚 食材買い出し' },
    { type: 'postback', data: 'action=guide&type=roster',  displayText: '📋 出席名簿撮影' },
    { type: 'postback', data: 'action=guide&type=photo',   displayText: '📷 活動写真送信' },
    { type: 'postback', data: 'action=event_close',        displayText: '✨ 終了報告' },
  ],
};

export const ALL_MENUS = [MENU_MAIN, MENU_OWNER, MENU_ACTIVITY];

/**
 * リッチメニューJSON仕様を生成
 */
export function buildRichMenuObject(def: RichMenuDef) {
  const areas = def.layout === '3x2' ? gridAreas3x2() : gridAreas2x2();
  const expectedCells = def.layout === '3x2' ? 6 : 4;
  if (def.actions.length !== expectedCells) {
    throw new Error(
      `Rich menu "${def.name}" expects ${expectedCells} actions but has ${def.actions.length}`,
    );
  }
  return {
    size: def.size,
    selected: def.selected,
    name: def.name,
    chatBarText: def.chatBarText,
    areas: areas.map((a, i) => ({ ...a, action: def.actions[i] })),
  };
}

/** LINE SDK経由でリッチメニュー登録 */
async function registerOne(def: RichMenuDef): Promise<string> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] would register', { name: def.name });
    return `mock-${def.name}`;
  }
  const { Client } = require('@line/bot-sdk');
  const client = new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });

  // 1. メニュー作成
  const menuObj = buildRichMenuObject(def);
  const richMenuId: string = await client.createRichMenu(menuObj);
  logger.info('richMenu created', { name: def.name, richMenuId });

  // 2. 画像アップロード
  const imgPath = path.resolve(process.cwd(), def.imagePath);
  if (!fs.existsSync(imgPath)) {
    throw new Error(`rich menu image not found: ${imgPath}`);
  }
  const buf = fs.readFileSync(imgPath);
  await client.setRichMenuImage(richMenuId, buf, 'image/png');
  logger.info('richMenu image uploaded', { name: def.name, sizeKB: Math.round(buf.length / 1024) });
  return richMenuId;
}

/** 全メニューを登録し、デフォルト（main）を全友だちに適用 */
export async function setupAllRichMenus(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const m of ALL_MENUS) {
    ids[m.name] = await registerOne(m);
  }
  // メインを全員のデフォルトに
  if (!isMocked.line()) {
    const { Client } = require('@line/bot-sdk');
    const client = new Client({
      channelAccessToken: env.line.channelAccessToken,
      channelSecret: env.line.channelSecret,
    });
    await client.setDefaultRichMenu(ids[MENU_MAIN.name]);
    logger.info('default rich menu set', { id: ids[MENU_MAIN.name] });
  }
  return ids;
}

/** ユーザー個別のメニュー切り替え (役割別) */
export async function linkRichMenuByRole(
  lineUserId: string,
  role: 'owner' | 'staff' | 'viewer',
  menuIds: Record<string, string>,
): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] linkByRole', { lineUserId, role });
    return;
  }
  const { Client } = require('@line/bot-sdk');
  const client = new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });

  if (role === 'owner') {
    await client.linkRichMenuToUser(lineUserId, menuIds[MENU_OWNER.name]);
  } else if (role === 'staff') {
    await client.linkRichMenuToUser(lineUserId, menuIds[MENU_MAIN.name]);
  } else {
    // viewer はリッチメニュー解除（写真送信できないようにする）
    await client.unlinkRichMenuFromUser(lineUserId).catch(() => {});
  }
}

/** 活動日メニューに切り替え (Cloud Scheduler から呼ぶ想定) */
export async function switchToActivityMenu(menuIds: Record<string, string>): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] switch all to activity menu');
    return;
  }
  const { Client } = require('@line/bot-sdk');
  const client = new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });
  await client.setDefaultRichMenu(menuIds[MENU_ACTIVITY.name]);
}

/** 通常メニューに戻す */
export async function switchToMainMenu(menuIds: Record<string, string>): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] switch back to main menu');
    return;
  }
  const { Client } = require('@line/bot-sdk');
  const client = new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });
  await client.setDefaultRichMenu(menuIds[MENU_MAIN.name]);
}
