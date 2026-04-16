# 12. Instagram Graph API 連携 (Phase 3)

> 所要時間: **90分** (Meta の審査待ち時間除く)
> 費用: **¥0**
> このガイドで取得するもの: `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`
> 対象: **Phase 3 (SNS自動投稿) を実施する場合のみ**

---

## 📝 このガイドでやること

要件定義書 **FR-10** (Instagram 自動投稿) を実現します。

### ゴール

✅ まなびキッチン用の **Facebook ページ** が作成される
✅ Instagram アカウントが **ビジネス (or クリエイター) アカウント** に変換される
✅ Facebook ページと Instagram が紐付けられる
✅ Meta for Developers にアプリが登録される
✅ **長寿命アクセストークン** (60日) が取得される
✅ **ビジネスアカウントID** が取得される

---

## 🎯 全体フロー

```
[1] Facebook Page 作成
  ↓
[2] Instagram を Business アカウント化
  ↓
[3] Instagram と Facebook Page を紐付け
  ↓
[4] Meta for Developers にアプリ登録
  ↓
[5] Graph API Explorer でアクセストークン取得
  ↓
[6] 短期トークン → 長期トークン (60日) に変換
  ↓
[7] ビジネスアカウントID 取得
  ↓
[8] Secret Manager に登録
```

---

## Part 1: Facebook Page 作成

## Step 1. Facebook 個人アカウントの準備

- まなびキッチン運営代表者の個人 Facebook アカウントにログイン
- 持っていない場合: https://www.facebook.com/ で新規作成
- 2段階認証を **必ず有効化** (セキュリティのため)

---

## Step 2. Facebook Page (ビジネスページ) 作成

1. https://www.facebook.com/pages/create にアクセス
2. ページ名: **「まなびキッチン」**
3. カテゴリ: **「コミュニティ組織」** または **「非営利団体」**
4. 詳細説明: 「○○市の子ども食堂 まなびキッチン」等
5. **「ページを作成」** をクリック
6. プロフィール画像・カバー画像は後で設定OK

---

## Part 2: Instagram を Business 化

## Step 3. Instagram アプリをインストール (まだの場合)

- スマホで Instagram アプリをダウンロード
- 「まなびキッチン」専用アカウントを作成
- ユーザーネーム: `manabi_kitchen` 等 (既に使用済みなら別名)

---

## Step 4. ビジネスアカウントへ切替

1. Instagram アプリで **「設定とプライバシー」** → **「アカウントの種類とツール」** (または「プロアカウントに切替」)
2. **「プロアカウントに切り替える」** を選択
3. カテゴリ: **「コミュニティ」** または **「非営利団体」**
4. **「ビジネス」** を選択 (クリエイターより API 機能が豊富)
5. 画面の指示に従って完了

---

## Step 5. Instagram と Facebook Page を紐付け

1. Instagram アプリで **「設定とプライバシー」** → **「アカウントセンター」**
2. **「アカウントを追加」** → Facebook を選択
3. Step 2 で作成した Facebook Page と連携

または PC で:
1. Facebook Page (まなびキッチン) を開く
2. 左メニュー **「設定」** → **「Instagram」**
3. **「アカウントを接続」** → Instagram ログイン → 連携完了

---

## Part 3: Meta for Developers アプリ登録

## Step 6. Meta 開発者アカウント登録

1. https://developers.facebook.com/ にアクセス
2. 右上 **「スタート」** or **「ログイン」** → 個人 Facebook アカウントでログイン
3. 開発者登録画面が出たら:
   - 電話番号認証
   - 利用規約に同意
4. 開発者アカウント完成

---

## Step 7. アプリを作成

1. https://developers.facebook.com/apps/ を開く
2. **「アプリを作成」** (Create App) をクリック
3. 「ユースケースを選択」: **「その他」** (Other)
4. 「アプリタイプを選択」: **「ビジネス」** (Business)
5. アプリ名: **`ManabiOps`**
6. メールアドレス: 運営代表者のメール
7. **「アプリを作成」** をクリック

---

## Step 8. Instagram Graph API 製品を追加

1. アプリのダッシュボードで、左メニュー **「製品」** → **「+ 製品を追加」**
2. 以下を検索して **「設定」** をクリック:
   - **「Instagram Graph API」** (または「Instagram API with Instagram Login」)
3. 次に **「Facebook ログイン」** も製品追加 (必要)

---

## Part 4: アクセストークン取得

## Step 9. Graph API Explorer でトークン取得

1. https://developers.facebook.com/tools/explorer/ を開く
2. 画面右側:
   - **「Meta App」**: `ManabiOps` を選択
   - **「User or Page」**: **「Get User Access Token」** を選択
3. **アクセス権限 (Permissions)** を追加:
   - ☑ `instagram_basic`
   - ☑ `instagram_content_publish`
   - ☑ `pages_show_list`
   - ☑ `pages_read_engagement`
   - ☑ `business_management`
4. **「Generate Access Token」** をクリック
5. Facebook ログイン画面が出る → 権限を全て許可
6. 画面に **短期トークン (2時間有効)** が表示される → コピー

---

## Step 10. 長期トークン (60日) に変換

Meta で以下の URL を生成してブラウザで開く:

```
https://graph.facebook.com/v18.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id=【APP_ID】&
  client_secret=【APP_SECRET】&
  fb_exchange_token=【短期トークン】
```

### 各値の取得場所

- `APP_ID`: アプリダッシュボード左メニュー **「設定」** → **「基本」**
- `APP_SECRET`: 同じく「基本」設定内。「表示」ボタンでパスワード入力して表示
- `短期トークン`: Step 9 でコピーしたもの

### 結果

JSON形式で返ってくる:
```json
{
  "access_token": "EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

→ この `access_token` が **`IG_ACCESS_TOKEN`** (60日有効)

---

## Step 11. ビジネスアカウントID 取得

### 11-1. Page ID を取得

Graph API Explorer で以下を実行:
```
GET /me/accounts
```
→ 配列が返り、各要素に `id` (Page ID) と `name` (ページ名) がある
→ 「まなびキッチン」の `id` をコピー

### 11-2. Instagram Business Account ID を取得

```
GET /【PAGE_ID】?fields=instagram_business_account
```
→ レスポンス:
```json
{
  "instagram_business_account": {
    "id": "17841xxxxxxxxxxx"
  },
  "id": "【PAGE_ID】"
}
```

→ `instagram_business_account.id` が **`IG_BUSINESS_ACCOUNT_ID`**

---

## Part 5: Secret Manager に登録

## Step 12. Secret Manager に追加

[08_secret_manager.md](./08_secret_manager.md) で未登録の2つを追加:

### ⑨ `ig-access-token`
- 値: Step 10 で取得した **長期トークン** (`EAAxxxxxxxxxxxx...`)

### ⑩ `ig-business-account-id`
- 値: Step 11 で取得した **ビジネスアカウントID** (`17841xxxxxxxxxxx`)

---

## Step 13. Cloud Run を再デプロイ (環境変数追加)

[09_cloud_run_deploy.md](./09_cloud_run_deploy.md) Step 5 のコマンドに、以下を追加:

```bash
gcloud run services update manabi-ops \
  --region asia-northeast1 \
  --update-secrets "IG_ACCESS_TOKEN=ig-access-token:latest,IG_BUSINESS_ACCOUNT_ID=ig-business-account-id:latest"
```

---

## Step 14. 動作確認

1. Cloud Run URL + `/healthz` にアクセス
2. `"ig": true` になっていればOK
3. LINE で写真を送って **[✅ 投稿]** ボタンを押す → 30秒以内に Instagram に投稿される

---

## Step 15. Meta アプリ審査 (本番公開)

開発中は Meta アプリは「開発モード」で、投稿できるのはアプリ管理者のみ。
**外部ユーザーが見る Instagram 投稿** として使う場合は **「本番モード」** への切り替えが必要。

### 審査が必要な権限

- `instagram_content_publish` (投稿機能)
- `pages_read_engagement`
- `business_management`

### 審査フロー

1. アプリダッシュボード → **「アプリレビュー」** → **「権限と機能」**
2. 各権限の **「リクエスト」** ボタンをクリック
3. 以下を提出:
   - **プライバシーポリシーURL** (要作成)
   - **データ削除手順URL** (要作成)
   - **デモ動画** (機能の動作を撮影・2分以内)
   - **ユースケース説明** (日本語OK)
4. 審査期間: **5営業日〜2週間**
5. 承認されるとアプリを「本番モード」に切り替え可能

### プライバシーポリシー・データ削除手順の雛形

→ ManabiOps 運営代表者に別途共有 (リポジトリ `docs/legal/` に格納予定)

---

## ✅ 完了チェック

- [ ] Facebook Page 「まなびキッチン」作成
- [ ] Instagram をビジネスアカウント化
- [ ] Facebook Page と Instagram を紐付け
- [ ] Meta アプリ `ManabiOps` 作成
- [ ] 長期アクセストークン取得 (60日)
- [ ] Business Account ID 取得
- [ ] Secret Manager 登録 (`ig-access-token`, `ig-business-account-id`)
- [ ] Cloud Run 再デプロイ → `/healthz` で `ig: true`
- [ ] テスト投稿成功
- [ ] (本番運用時) Meta アプリ審査完了

---

## 🔄 60日後のトークン更新

長期トークンは **60日間のみ有効**。期限前に更新が必要です。

### 自動更新オプション (推奨)

ManabiOps では、Cloud Scheduler に月1回の `/internal/refresh-ig-token` タスクを追加予定 (Phase 3 後半)。
手動更新の場合は、Step 10 を繰り返し、Secret Manager のバージョンを更新。

---

## 📋 次のステップ

→ **[13_troubleshooting.md](./13_troubleshooting.md)** — 動作確認・トラブルシューティング

---

## 🆘 トラブルシューティング

### ❌ `instagram_content_publish` 権限がリクエストできない

- アプリが「ビジネス」タイプで作成されているか確認
- Instagram が Business アカウント化されているか
- Facebook Page と Instagram が紐付いているか

### ❌ `Error validating access token: The session has been invalidated`

- トークンの60日が切れている → Step 10 で再取得
- Facebook パスワードを変更した → トークンが無効化される

### ❌ 投稿時に `Application does not have permission for this action`

- Meta アプリ審査が必要 (Step 15)
- 開発モードでは、アプリ管理者の Instagram にのみ投稿可能

### ❌ 投稿はされるが動画がリールにならない

- 動画の長さが3秒〜90秒か確認 (リール仕様)
- アスペクト比が 9:16 に近いか確認
