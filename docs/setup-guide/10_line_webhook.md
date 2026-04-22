# 10. LINE Webhook URL を設定

> 所要時間: **10分**
> 費用: **¥0**
> 前提: [09_cloud_run_deploy.md](./09_cloud_run_deploy.md) で Cloud Run Service URL を取得済み

---

## 📝 このガイドでやること

Cloud Run にデプロイされた ManabiOps の Webhook URL を
LINE 側に登録し、LINEからのメッセージがサーバーに届くようにします。

### ゴール

✅ LINE Developers Console で Webhook URL 登録完了
✅ 「検証」ボタンで200 OK 応答を確認
✅ 実機の LINE 公式アカウントに画像を送り、自動返信が来る

---

## Step 1. Webhook URL を準備

[09_cloud_run_deploy.md](./09_cloud_run_deploy.md) で取得した Cloud Run の Service URL に
`/webhook` を追加したものが Webhook URL になります。

### 例

- Cloud Run URL: `https://manabi-ops-xxxxxx-an.a.run.app`
- Webhook URL: **`https://manabi-ops-xxxxxx-an.a.run.app/webhook`**

→ この URL をコピー

---

## Step 2. LINE Developers Console で設定

### 2-1. コンソールを開く

1. [LINE Developers Console](https://developers.line.biz/console/) を開く
2. [01_line_messaging_api.md](./01_line_messaging_api.md) で作成した **Provider** を選択
3. **「まなびキッチン」** の Messaging API チャネルを開く

### 2-2. Webhook URL を設定

1. 上部タブの **「Messaging API 設定」** (Messaging API) をクリック
2. 下にスクロールして **「Webhook 設定」** セクションを探す
3. **「Webhook URL」** 欄に、Step 1 でコピーした URL を貼り付け
4. **「更新」** (Update) をクリック

### 2-3. Webhook を有効化

1. 「Webhook の利用」(Use webhook) のトグルを **オン** (有効) に
2. すぐ右の **「検証」** (Verify) ボタンをクリック

### 2-4. 検証結果

- ✅ **「成功」** (Success) と表示されればOK
- ❌ エラーが出た場合は末尾のトラブルシューティングへ

---

## Step 3. 自動応答メッセージを無効化

LINE は既定で「ありがとうございます…」のような自動応答メッセージを返します。
これがManabiOps の返信と干渉するため **無効化** します。

1. 同じ「Messaging API 設定」ページ内、**「LINE 公式アカウント機能」** セクションを探す
2. **「応答メッセージ」** → **「編集」** をクリック
   → LINE Official Account Manager が別タブで開く
3. 左メニュー → **「応答設定」** を開く
4. 以下のように設定:
   | 項目 | 設定 |
   |------|:----:|
   | チャット | **オフ** |
   | あいさつメッセージ | お好み (オフ推奨) |
   | 応答メッセージ | **オフ** |
   | Webhook | **オン** ⭐ |
5. 保存

---

## Step 4. 初回ユーザー登録 (運営代表者)

ManabiOps は **「最初にメッセージを送った LINE ユーザーを自動で Owner 権限として登録」** する仕様になっています。
これは要件定義書 EX-10 対応 + 運用開始時の便宜のためです。

### 手順

1. 自分のスマホで LINE アプリを開く
2. まなびキッチンの **LINE 公式アカウント** を友達追加
   - QRコードは LINE Developers Console の「Messaging API 設定」→ 下部の QR で表示可
3. **任意のメッセージを送る** (例: `こんにちは`)
4. ManabiOps からの返信が来るか確認

### 期待される返信

- 初回: `"🎉 ようこそ ManabiOps へ！運営代表者として登録しました。"`
- 2回目以降: コマンドヘルプ等

---

## Step 5. 動作確認: レシート画像を送る

1. 手元のレシート (またはネットで拾ったサンプル画像) を LINE で送信
2. **30秒以内** に ManabiOps から Flex Message (確認カード) が返ってくるはず

### 期待される Flex Message

```
━━━━━━━━━━━━━━━━
レシート確認
━━━━━━━━━━━━━━━━
○○スーパー
2026/04/16
¥4,820

勘定科目: 食材費
品目: 米5kg, 人参3本, ...

[✅ 登録] [✏ 修正] [❌ 取消]
━━━━━━━━━━━━━━━━
```

→ **[✅ 登録]** をタップすると Google Sheets に自動追記される

---

## ✅ 完了チェック

- [ ] Webhook URL が LINE Developers Console に登録された
- [ ] 「検証」で成功が返った
- [ ] 応答メッセージが無効化された
- [ ] 自分 (運営代表者) が初回ログインで Owner 権限を取得できた
- [ ] レシート画像を送って Flex Message が返ってきた
- [ ] 承認すると Google Sheets に記帳された

---

## 📋 次のステップ

→ **[11_cloud_scheduler.md](./11_cloud_scheduler.md)** — Cloud Scheduler (1時間バッチ) 設定へ進む

---

## 🆘 トラブルシューティング

### ❌ 検証エラー: `The webhook returned an HTTP status code other than 200`

- Cloud Run URL が正しいか (`/webhook` を忘れていないか)
- Cloud Run が起動しているか: `curl YOUR_URL/healthz` で確認
- `--allow-unauthenticated` オプションでデプロイされているか ([09](./09_cloud_run_deploy.md) Step 5)

### ❌ 検証エラー: `The signature in the webhook request header was invalid`

- Secret Manager の `line-channel-secret` の値が正しいか再確認
- 前後の空白・改行を含めていないか

### ❌ メッセージを送っても返事が来ない

1. **応答メッセージ** がオフになっているか
2. **Webhook** がオンになっているか
3. Cloud Run のログを確認:
```bash
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 50
```
4. エラーが出ている場合 → [13_troubleshooting.md](./13_troubleshooting.md)

### ❌ 「🚫 権限がありません」と返ってきた

- 2人目以降のユーザーはホワイトリスト登録が必要
- 管理画面 (`/admin`) にログインして、**ユーザー管理** から LINE User ID を追加
- または Owner ユーザーが LINE でコマンド `/adduser スタッフ名 U_xxxx` を実行
