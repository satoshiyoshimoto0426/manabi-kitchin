# 第15章 リッチメニュー登録（5分）

> 対象：運営代表者・システム担当者
> 所要時間：**5分**（画像が用意済の場合）
> 前提：第01章「LINE Messaging API 接続」完了

---

## 0. ゴール

LINEトーク画面の下半分に、**6ボタン**（Staff用）または **6ボタン**（Owner用）または **4大ボタン**（活動日用）の「リッチメニュー」を表示できるようにします。

```
┌────────────────────────────────┐
│   普通のチャット入力欄          │
├────────────────────────────────┤
│ 🧾領収書 │ 📋名簿 │ 📷写真      │
│ 📊月次  │ 📮承認  │ ⚙ヘルプ    │ ← これがリッチメニュー
└────────────────────────────────┘
```

設計の詳細は `docs/features/10_公式LINEとリッチメニュー.md` をご覧ください。

---

## 1. 画像の準備（既に同梱済 or 自作）

### A. 同梱画像をそのまま使う（推奨・最速）

```bash
ls deliverables/richmenu/
# main_menu.png       (98 KB)
# owner_menu.png      (111 KB)
# activity_menu.png   (72 KB)
# preview/            (AI生成版・確認用)
```

これらは `scripts/generate_richmenu_images.py` (Pillow + Noto Sans CJK) で生成済。
日本語文字化けゼロ、LINE規定の **2500×1686 / 1MB以内** を満たします。

### B. 画像を再生成したい

```bash
npm run richmenu:images
```

`scripts/generate_richmenu_images.py` を編集すれば配色・ラベル・絵文字を変更できます。

### C. デザイナーに作ってもらう

LINE公式の規定：
| 項目 | 値 |
|------|-----|
| 推奨サイズ | 2500×1686 px |
| 形式 | PNG または JPEG |
| ファイルサイズ | **1MB以下** |
| カラー | RGB（CMYK不可） |

セル境界はAPIの `areas[]` で別途指定するので、画像内の罫線は装飾扱いです。

---

## 2. LINE Messaging API への登録

### 2-1. 環境変数を確認

```bash
# .env or Cloud Run 環境変数
LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxx....
LINE_CHANNEL_SECRET=xxxxxxxxxxxx
ADMIN_URL=https://your-cloud-run-url/admin   # OwnerメニューのダッシュボードURI
```

### 2-2. 登録コマンド

```bash
# 初回 / 再登録（既存削除→新規登録）
npm run setup:richmenu -- --clean

# 追加のみ（既存メニューを残す）
npm run setup:richmenu

# モック確認（実APIに触れない）
MOCK_MODE=true npm run setup:richmenu
```

実行すると以下が出力されます：

```
✅ Rich menus registered successfully:

   manabiops_main         = richmenu-abcd1234...
   manabiops_owner        = richmenu-efgh5678...
   manabiops_activity     = richmenu-ijkl9012...

📁 IDs saved: deliverables/richmenu/rich-menu-ids.json
```

### 2-3. 結果確認

LINE 公式アカウントを開発者モードで確認：
1. https://manager.line.biz/ → 該当アカウント
2. 「ホーム」→「リッチメニュー」
3. 3つのメニューが表示されていればOK

---

## 3. メニューIDをサーバに反映

### 本番（Cloud Run）

**Secret Manager に登録**：

```bash
# JSONそのまま登録
gcloud secrets create RICH_MENU_IDS_JSON \
  --data-file=deliverables/richmenu/rich-menu-ids.json

# Cloud Run サービスに環境変数として注入
gcloud run services update manabiops \
  --update-secrets=RICH_MENU_IDS_JSON=RICH_MENU_IDS_JSON:latest
```

### ローカル開発

`deliverables/richmenu/rich-menu-ids.json` を webhook が自動で読み込むため、追加作業なし。

---

## 4. 役割別メニュー切り替えの動作確認

### 4-1. テストアカウントを作成

1. 公式LINEに友だち追加（個人LINEアカウントから）
2. `/admin/users` でそのユーザーの role を `Owner` に設定
3. 一度ブロック → ブロック解除 で `follow` イベントを再発火させる

webhook ログに以下が出れば成功：

```
INFO rich menu linked on follow {"userId":"U....", "role":"owner"}
```

### 4-2. 期待される表示

| 役割 | 表示されるメニュー |
|------|-----------------|
| Owner | 👥メンバー / 📊ダッシュ / 💰経費 / 📱SNS / ⚠アラート / 🔄通常へ |
| Staff | 🧾領収書 / 📋名簿 / 📷写真 / 📊月次 / 📮承認待ち / ⚙ヘルプ |
| Viewer | （リッチメニューなし） |

---

## 5. 活動日メニューに切り替える（Cloud Scheduler）

### 5-1. 切替APIエンドポイントを公開（管理用）

`/admin/richmenu/activity` を Owner 認証付きで公開する想定（実装は admin/index.ts 参照）。

### 5-2. Cloud Scheduler 設定例

```bash
# 毎週土曜 8:00 JST に活動日メニューへ
gcloud scheduler jobs create http switch-to-activity-menu \
  --schedule="0 8 * * 6" \
  --time-zone="Asia/Tokyo" \
  --uri="https://manabiops-xxxx.a.run.app/admin/richmenu/activity" \
  --http-method=POST \
  --oidc-service-account-email=scheduler@PROJECT.iam.gserviceaccount.com

# 毎週土曜 18:00 JST に通常メニューへ戻す
gcloud scheduler jobs create http switch-back-main-menu \
  --schedule="0 18 * * 6" \
  --time-zone="Asia/Tokyo" \
  --uri="https://manabiops-xxxx.a.run.app/admin/richmenu/main" \
  --http-method=POST \
  --oidc-service-account-email=scheduler@PROJECT.iam.gserviceaccount.com
```

詳細は `docs/setup-guide/11_cloud_scheduler.md`。

---

## 6. トラブルシューティング

### Q. 「rich menu image not found」エラーが出る
- A. `deliverables/richmenu/main_menu.png` が無い。
  → `npm run richmenu:images` を実行してから再度 `npm run setup:richmenu`

### Q. 「Invalid rich menu image size (Status 400)」
- A. 画像が 1MB を超えている。
  → Pillow版（98 KB）を使うか、ImageMagick で圧縮：
  ```bash
  convert input.png -quality 85 -resize 2500x1686 output.png
  ```

### Q. メニューは登録されたが、表示されない
1. Default rich menu が設定されているか確認：
   ```bash
   curl -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
     https://api.line.me/v2/bot/user/all/richmenu
   ```
2. ユーザーがブロック解除して再friends追加すると即反映

### Q. ボタンを押しても何も起きない
1. webhook URL が正しく設定されているか（第10章 参照）
2. Cloud Run のログで `postback` イベントを確認
3. Postback の `action=` の値が `webhook.ts` の `handlePostback` に存在するか

### Q. Postback 408 タイムアウト
- A. `webhook.ts` で重い処理を await している。
  → 即時 `res.status(200).send('ok')` 後に async で処理する設計（既に対応済）

---

## 7. 改廃・移行

### 既存リッチメニューがある場合

```bash
# 既存をすべて削除して新規登録
npm run setup:richmenu -- --clean
```

### A/Bテストしたい場合

`src/line/richMenu.ts` の `MENU_MAIN` を複製して `MENU_MAIN_B` を定義 →
特定ユーザーIDだけ `linkRichMenuToUser` で B にリンク → 1週間後にデータ比較。

### 完全に削除したい

```typescript
import { cleanupRichMenus } from './src/line/richMenu';
await cleanupRichMenus();
```

---

## ✅ チェックリスト

- [ ] `deliverables/richmenu/main_menu.png` 等3画像が存在
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` 設定済
- [ ] `npm run setup:richmenu -- --clean` 成功
- [ ] `rich-menu-ids.json` が生成された
- [ ] LINE Manager で3メニュー表示確認
- [ ] 自分のスマホで実際にメニュー表示・タップで動作確認
- [ ] Owner役のテストユーザーで Owner メニュー切替確認
- [ ] (本番) Secret Manager に `RICH_MENU_IDS_JSON` 登録
- [ ] (本番) Cloud Run に環境変数として注入
- [ ] (任意) Cloud Scheduler で活動日メニュー自動切替

---

📚 関連
- `docs/features/10_公式LINEとリッチメニュー.md` — 設計思想・UX原則
- `docs/setup-guide/01_line_messaging_api.md` — LINE公式アカウント開設
- `docs/setup-guide/10_line_webhook.md` — webhook URL設定
- `docs/setup-guide/11_cloud_scheduler.md` — 自動切替の設定
- `src/line/richMenu.ts` — 実装コード
- `scripts/setup-richmenu.ts` — 登録スクリプト
