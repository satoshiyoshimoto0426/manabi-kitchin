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
 */
function gridAreas3x2(): Array<{
  bounds: { x: number; y: number; width: number; height: number };
}> {
  const colW = Math.floor(FULL_SIZE.width / 3);
  const rowH = Math.floor(FULL_SIZE.height / 2);
  const areas: Array<{ bounds: { x: number; y: number; width: number; height: number } }> = [];
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
function gridAreas2x2(): Array<{
  bounds: { x: number; y: number; width: number; height: number };
}> {
  const colW = Math.floor(FULL_SIZE.width / 2);
  const rowH = Math.floor(FULL_SIZE.height / 2);
  const areas: Array<{ bounds: { x: number; y: number; width: number; height: number } }> = [];
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

/** Postback / URI / Message アクション定義 */
type RichAction =
  | { type: 'postback'; data: string; displayText?: string }
  | { type: 'uri'; uri: string; label?: string }
  | { type: 'message'; text: string };

interface RichMenuDef {
  name: string; // 表示名（管理画面用）
  chatBarText: string; // メニューを開く前のラベル
  size: { width: number; height: number };
  selected: boolean; // 友だち追加直後に表示するか
  imagePath: string; // 同梱の画像ファイル
  actions: RichAction[]; // 各セルの動作（順番がgridと対応）
  layout: '3x2' | '2x2';
}

const ADMIN_URL = process.env.ADMIN_URL || 'https://example.com/admin';

// =============================================================
// メインメニュー（Staff/Owner デフォルト）
// 順序: 領収書 / 名簿撮影 / 活動写真 / 月次サマリー / 承認待ち / ヘルプ
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
    { type: 'postback', data: 'action=guide&type=roster', displayText: '📋 名簿を撮る' },
    { type: 'postback', data: 'action=guide&type=photo', displayText: '📷 活動写真を送る' },
    { type: 'postback', data: 'action=summary', displayText: '📊 月次サマリー' },
    { type: 'postback', data: 'action=pending', displayText: '📮 承認待ち一覧' },
    { type: 'postback', data: 'action=help', displayText: '⚙ ヘルプ' },
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
    { type: 'postback', data: 'action=members', displayText: '👥 メンバー管理' },
    { type: 'uri', uri: `${ADMIN_URL}/dashboard`, label: '📊 詳細ダッシュボード' },
    { type: 'postback', data: 'action=expense_report', displayText: '💰 経費レポート' },
    { type: 'postback', data: 'action=sns_history', displayText: '📱 SNS投稿履歴' },
    { type: 'postback', data: 'action=alerts', displayText: '⚠ アラート一覧' },
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
    {
      type: 'postback',
      data: 'action=guide&type=receipt&context=shopping',
      displayText: '🍚 食材買い出し',
    },
    { type: 'postback', data: 'action=guide&type=roster', displayText: '📋 出席名簿撮影' },
    { type: 'postback', data: 'action=guide&type=photo', displayText: '📷 活動写真送信' },
    { type: 'postback', data: 'action=event_close', displayText: '✨ 終了報告' },
  ],
};

export const ALL_MENUS: RichMenuDef[] = [MENU_MAIN, MENU_OWNER, MENU_ACTIVITY];

/** リッチメニューJSON仕様を生成 */
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

function getLineSdk() {
  if (isMocked.line()) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('@line/bot-sdk');
  return new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });
}

/** LINE SDK経由でリッチメニュー登録 */
async function registerOne(def: RichMenuDef): Promise<string> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] would register', { name: def.name });
    return `mock-${def.name}`;
  }
  const client = getLineSdk();

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
  logger.info('richMenu image uploaded', {
    name: def.name,
    sizeKB: Math.round(buf.length / 1024),
  });
  return richMenuId;
}

/** 全メニューを登録し、デフォルト（main）を全友だちに適用 */
export async function setupAllRichMenus(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const m of ALL_MENUS) {
    ids[m.name] = await registerOne(m);
  }
  if (!isMocked.line()) {
    const client = getLineSdk();
    await client.setDefaultRichMenu(ids[MENU_MAIN.name]);
    logger.info('default rich menu set', { id: ids[MENU_MAIN.name] });
  }
  return ids;
}

/** 既存リッチメニュー一覧を削除（再登録時のクリーンアップ用） */
export async function cleanupRichMenus(): Promise<number> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] cleanup');
    return 0;
  }
  const client = getLineSdk();
  const list = await client.getRichMenuList();
  let removed = 0;
  for (const m of list) {
    await client.deleteRichMenu(m.richMenuId);
    removed++;
  }
  logger.info('richMenu cleanup done', { removed });
  return removed;
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
  const client = getLineSdk();
  if (role === 'owner') {
    await client.linkRichMenuToUser(lineUserId, menuIds[MENU_OWNER.name]);
  } else if (role === 'staff') {
    await client.linkRichMenuToUser(lineUserId, menuIds[MENU_MAIN.name]);
  } else {
    // viewer はリッチメニュー解除（写真送信できないようにする）
    try {
      await client.unlinkRichMenuFromUser(lineUserId);
    } catch {
      /* noop */
    }
  }
}

/** 活動日メニューに切り替え (Cloud Scheduler から呼ぶ想定) */
export async function switchToActivityMenu(menuIds: Record<string, string>): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] switch all to activity menu');
    return;
  }
  const client = getLineSdk();
  await client.setDefaultRichMenu(menuIds[MENU_ACTIVITY.name]);
}

/** 通常メニューに戻す */
export async function switchToMainMenu(menuIds: Record<string, string>): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK richMenu] switch back to main menu');
    return;
  }
  const client = getLineSdk();
  await client.setDefaultRichMenu(menuIds[MENU_MAIN.name]);
}

/** ガイド系Postbackで返すFlex Messageビルダー */
export function buildGuideFlex(type: 'receipt' | 'roster' | 'photo'): any {
  const base = {
    receipt: {
      title: '🧾 領収書を送る',
      hints: [
        '1. このメッセージの「📎」をタップ',
        '2. 「カメラ」を選んで撮影',
        '3. 領収書全体が枠内に収まるように',
        '4. そのまま送信ボタンを押す',
      ],
      tips: ['💡 複数枚OK（連続で送れます）', '💡 暗いと読み取り精度が下がります', '💡 折れ目はできるだけ伸ばして'],
    },
    roster: {
      title: '📋 出席名簿を撮影',
      hints: [
        '1. 名簿用紙を平らな場所に置く',
        '2. 真上から撮影（影が入らないよう注意）',
        '3. 氏名欄が読める明るさで',
        '4. 送信ボタンを押す',
      ],
      tips: ['💡 ページごとに分けて送信OK', '💡 個人情報は自動で暗号化されます', '💡 同意がない方は撮影前に外してください'],
    },
    photo: {
      title: '📷 活動写真を送る',
      hints: [
        '1. 撮影前に保護者の同意を確認',
        '2. 複数枚OK・動画は15秒以内推奨',
        '3. 全員の顔が映っていなくて構いません',
        '4. そのまま送信',
      ],
      tips: ['💡 顔は自動でぼかします', '💡 投稿前にプレビュー確認できます', '💡 スタッフがNG出せば差し戻し可能'],
    },
  } as const;
  const cfg = base[type];

  return {
    type: 'flex',
    altText: cfg.title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2E7D32',
        paddingAll: 'md',
        contents: [
          {
            type: 'text',
            text: cfg.title,
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '📝 やり方',
            weight: 'bold',
            color: '#1B5E20',
            size: 'md',
          },
          ...cfg.hints.map((h) => ({
            type: 'text',
            text: h,
            wrap: true,
            size: 'sm',
            color: '#2C2C2C',
          })),
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: 'ヒント',
            weight: 'bold',
            color: '#F57C00',
            size: 'md',
            margin: 'md',
          },
          ...cfg.tips.map((t) => ({
            type: 'text',
            text: t,
            wrap: true,
            size: 'sm',
            color: '#6B6B6B',
          })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#F57C00',
            action: {
              type: 'uri',
              label: '📷 カメラを起動',
              uri: 'line://nv/camera/',
            },
          },
        ],
      },
    },
  };
}
