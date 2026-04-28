# 第15章 リッチメニュー セットアップ（5分）

> 所要時間：5〜10分
> 前提：第01章（LINE Messaging API）完了済
> 対象：運営代表者またはシステム担当者
> 関連：`docs/features/10_公式LINEとリッチメニュー.md` (設計思想)

---

## このガイドで作るもの

LINEトーク画面の下半分にいつも出ている「ボタン群」を3種類登録します。

| 名前 | 表示対象 | ボタン数 |
|------|----------|---------|
| **main**（メイン） | Staff / Owner（デフォルト） | 6（3列×2段） |
| **owner**（管理者用） | Owner専用に切替可 | 6（3列×2段） |
| **activity**（活動日用） | 活動日の朝に自動切替 | 4（2列×2段・大ボタン） |

---

## ステップ1：画像を準備（既に同梱済）

`deliverables/richmenu/` に以下3枚があります：

```
deliverables/richmenu/
├─ main_menu.png       ← メイン (2500×1686 PNG)
├─ owner_menu.png      ← Owner専用
└─ activity_menu.png   ← 活動日用
```

**カスタマイズしたい場合**：

```bash
# 画像を再生成（色やラベル調整したいとき）
npm run richmenu:images
# → scripts/generate_richmenu_images.py が走り、3枚を上書き
```

ラベル文言を変えたい場合は `scripts/generate_richmenu_images.py` の `main_cells` 配列を編集してください。

---

## ステップ2：環境変数を確認

`.env` または Cloud Run の環境変数に以下が設定されていることを確認：

```bash
LINE_CHANNEL_ACCESS_TOKEN=...   # 第01章で取得
LINE_CHANNEL_SECRET=...
ADMIN_URL=https://admin.example.com  # 任意
```

---

## ステップ3：登録コマンドを実行

```bash
cd /path/to/webapp
npm run setup:richmenu
```

成功すると以下のような出力：

```
═══════════════════════════════════════════════
  ManabiOps リッチメニュー セットアップ
═══════════════════════════════════════════════

✅ 全メニュー登録完了

📋 以下のIDを保存してください:

  RICHMENU_MAIN_ID=richmenu-abc123def456
  RICHMENU_OWNER_ID=richmenu-ghi789jkl012
  RICHMENU_ACTIVITY_ID=richmenu-mno345pqr678

💡 Secret Manager に保存:
  echo -n "richmenu-abc123def456" | gcloud secrets create richmenu-main-id --data-file=-
  echo -n "richmenu-ghi789jkl012" | gcloud secrets create richmenu-owner-id --data-file=-
  echo -n "richmenu-mno345pqr678" | gcloud secrets create richmenu-activity-id --data-file=-

🎉 完了！LINE Bot 友だち追加すると即座にメニューが表示されます。
```

---

## ステップ4：表示されたIDを保存

### A. 開発環境（`.env`）

```bash
RICHMENU_MAIN_ID=richmenu-abc123def456
RICHMENU_OWNER_ID=richmenu-ghi789jkl012
RICHMENU_ACTIVITY_ID=richmenu-mno345pqr678
```

### B. 本番（Secret Manager）

出力された `gcloud secrets create` コマンドをそのまま実行 → 完了。

Cloud Run 側で参照する：

```bash
gcloud run services update manabi-ops \
  --update-secrets RICHMENU_MAIN_ID=richmenu-main-id:latest \
  --update-secrets RICHMENU_OWNER_ID=richmenu-owner-id:latest \
  --update-secrets RICHMENU_ACTIVITY_ID=richmenu-activity-id:latest
```

---

## ステップ5：動作確認

1. **自分のLINEで公式アカウントを「友だち追加」**
   - QRコードは LINE Official Account Manager → 友だち追加 から取得
   - 初回追加者は自動的に Owner として登録（auth.tsのbootstrap）

2. **トーク画面下に6ボタンメニューが出るか確認**

3. **各ボタンをタップ → ガイドFlex Messageが返ってくるか確認**

4. **🧾 領収書送信 をタップ → 「📷 カメラを起動」がカメラを起動するか確認**

---

## トラブルシューティング

### ❌ メニューが表示されない
- 友だち追加から最大10秒程度遅延することがあります → 一度トークを閉じて再表示
- それでも出ない時：`LINE Official Account Manager → リッチメニュー → 表示中のID` を確認

### ❌ ボタンを押しても反応しない
- Cloud Run のログを確認：`gcloud run logs read manabi-ops --limit 20`
- Webhook URL が正しく登録されているか（第10章参照）
- 署名検証エラー → `LINE_CHANNEL_SECRET` を再確認

### ❌ 画像が荒く表示される
- 画像サイズは **必ず 2500×1686** (PNG/JPG, 1MB以下)
- AI生成版を使う場合：`deliverables/richmenu/preview/*_ai.png` も同サイズだが装飾が異なります

### ❌ 古いメニューが残っている
- 全削除：

```bash
# LINE CLI（messaging-api-cli）または直接API
curl -X DELETE "https://api.line.me/v2/bot/richmenu/<ID>" \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN"
```

  または管理画面：LINE Official Account Manager → リッチメニュー → 各メニューの「停止」

---

## メニュー切替の自動化（オプション）

### Cloud Scheduler で活動日メニューを朝8時に自動切替

```bash
# 月曜と木曜の朝8時にactivityメニューに切替
gcloud scheduler jobs create http richmenu-activity-on \
  --location=asia-northeast1 \
  --schedule="0 8 * * 1,4" \
  --time-zone="Asia/Tokyo" \
  --uri="https://manabi-ops-xxx.run.app/tasks/richmenu/activity-on" \
  --http-method=POST \
  --oidc-service-account-email=scheduler-sa@PROJECT.iam.gserviceaccount.com

# 同日17時に通常メニューに戻す
gcloud scheduler jobs create http richmenu-activity-off \
  --location=asia-northeast1 \
  --schedule="0 17 * * 1,4" \
  --time-zone="Asia/Tokyo" \
  --uri="https://manabi-ops-xxx.run.app/tasks/richmenu/activity-off" \
  --http-method=POST \
  --oidc-service-account-email=scheduler-sa@PROJECT.iam.gserviceaccount.com
```

エンドポイント実装は `src/index.ts` に追加する形で拡張可能です。

---

## 章まとめチェックリスト

- [ ] `deliverables/richmenu/*.png` を確認した
- [ ] `npm run setup:richmenu` が成功した
- [ ] 3つのIDをメモ／Secret Managerに保存した
- [ ] 環境変数を Cloud Run に反映した
- [ ] 友だち追加でメニューが表示される
- [ ] 各ボタンが正しいFlex Messageを返す
- [ ] （任意）Cloud Scheduler で活動日切替を設定

---

➡️ 次：第13章「Troubleshooting」で運用中のトラブル対応を確認
