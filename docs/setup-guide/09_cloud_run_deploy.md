# 09. Cloud Run にアプリをデプロイ

> 所要時間: **30分**
> 費用: **月200万リクエスト無料** → まなびキッチン規模では **¥0〜¥300**
> このガイドで取得するもの: Cloud Run サービスURL (例: `https://manabi-ops-xxxxx.a.run.app`)

---

## 📝 このガイドでやること

ManabiOps のソースコードを Cloud Run (GCP のサーバーレス実行環境) にデプロイし、
**24時間365日稼働するサーバー** を立ち上げます。

### ゴール

✅ Cloud Run サービス `manabi-ops` が稼働
✅ HTTPS URL が発行される
✅ すべてのシークレットが自動で読み込まれる
✅ `/healthz` にアクセスして `{"ok":true, "mode":"production"}` が返る

---

## 🎯 デプロイ方法は2種類

| 方法 | 難易度 | おすすめ度 |
|------|:------:|:----------:|
| **A. Cloud Build + GitHub 連携 (自動)** | ⭐⭐ | 継続開発する場合に最適 |
| **B. gcloud CLI で手動デプロイ (1回のみ)** | ⭐ | とりあえず動かしたい場合 |

本ガイドでは **方法 B** を中心に解説します (最短)。方法Aは末尾でオプションとして紹介。

---

# 方法 B: gcloud CLI で手動デプロイ

## Step 1. gcloud CLI をインストール

Mac / Windows / Linux のいずれでも同じ手順。

### インストール手順

1. [Google Cloud CLI インストーラ](https://cloud.google.com/sdk/docs/install?hl=ja) を開く
2. OS を選択して、公式手順通りにインストール
3. インストール後、ターミナル (Mac/Linux) または PowerShell (Windows) を開く
4. 以下で動作確認:
```bash
gcloud --version
```
→ `Google Cloud SDK 4xx.x.x` のような表示が出ればOK

---

## Step 2. gcloud を初期化

```bash
gcloud auth login
```
→ ブラウザが開く → **運営代表者の Google アカウント** でログイン → 許可

```bash
gcloud config set project manabi-ops
```
→ `Updated property [core/project].` と表示されればOK

```bash
gcloud config set run/region asia-northeast1
```
→ デフォルトリージョンを東京に設定

---

## Step 3. ソースコードを取得

```bash
# 任意の作業ディレクトリで
git clone https://github.com/satoshiyoshimoto0426/manabi-kitchin.git
cd manabi-kitchin
```

---

## Step 4. 必要な API を有効化

以下を1つずつ実行 (既に有効化済みなら「already enabled」と出るだけ):

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable firestore.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable documentai.googleapis.com
gcloud services enable sheets.googleapis.com
gcloud services enable aiplatform.googleapis.com
```

---

## Step 5. Cloud Run にデプロイ

以下の **1コマンド** で、ビルド → イメージ保存 → デプロイ まで自動実行されます。

```bash
gcloud run deploy manabi-ops \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account manabi-ops-sa@manabi-ops.iam.gserviceaccount.com \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 3 \
  --min-instances 0 \
  --set-env-vars "NODE_ENV=production,MOCK_MODE=false,GCP_PROJECT_ID=manabi-ops,GCS_BUCKET_NAME=manabi-ops-media,GCP_LOCATION=asia-northeast1" \
  --set-secrets "LINE_CHANNEL_SECRET=line-channel-secret:latest,LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest,GEMINI_API_KEY=gemini-api-key:latest,DOCAI_RECEIPT_PROCESSOR_ID=docai-receipt-processor-id:latest,DOCAI_ROSTER_PROCESSOR_ID=docai-roster-processor-id:latest,SHEETS_SPREADSHEET_ID=sheets-spreadsheet-id:latest,ENCRYPTION_KEY=encryption-key:latest,ADMIN_BASIC_AUTH=admin-basic-auth:latest"
```

### 各オプションの意味

| オプション | 意味 |
|-----------|------|
| `--source .` | カレントディレクトリのソースをビルド |
| `--allow-unauthenticated` | LINE/Instagram の Webhook が匿名アクセスできるよう許可 |
| `--service-account` | [02](./02_gcp_project.md) で作ったサービスアカウント |
| `--memory 1Gi` | 顔ぼかし処理のためメモリ1GB |
| `--max-instances 3` | 同時稼働の最大数 (コスト抑制) |
| `--min-instances 0` | 使用がない時は0台 (無料) |
| `--set-env-vars` | 環境変数 (シークレット以外) |
| `--set-secrets` | Secret Manager から自動読込 |

### デプロイにかかる時間

初回: **5〜10分** (Docker イメージのビルド含む)
2回目以降 (コード更新時): **2〜5分**

---

## Step 6. Phase 3 (Instagram連携) を有効化する場合

Phase 3 で Instagram 投稿を有効にする場合は、Step 5 のコマンドに以下を **追加**:

```
,IG_ACCESS_TOKEN=ig-access-token:latest,IG_BUSINESS_ACCOUNT_ID=ig-business-account-id:latest
```

(カンマ忘れに注意)

---

## Step 7. デプロイ成功を確認

### 7-1. URL を確認

デプロイ成功時、以下のような出力が出ます:
```
Service [manabi-ops] revision [manabi-ops-00001-abc] has been deployed
and is serving 100 percent of traffic.
Service URL: https://manabi-ops-xxxxxx-an.a.run.app
```

**この Service URL をコピー・メモ** (後で LINE Webhook に設定)

### 7-2. ヘルスチェック

```bash
curl https://manabi-ops-xxxxxx-an.a.run.app/healthz
```

期待される出力:
```json
{
  "ok": true,
  "mode": "production",
  "services": {
    "line": true,
    "gemini": true,
    "docai": true,
    "firestore": true,
    "sheets": true,
    "gcs": true,
    "ig": false
  },
  "time": "2026-04-16T..."
}
```

- `mode: production` になっていればOK
- `services.*: true` の数が多いほど正しく接続できている
- `ig: false` は Phase 3 未実施なら正常

### 7-3. 管理画面にアクセス

ブラウザで:
```
https://manabi-ops-xxxxxx-an.a.run.app/admin
```

→ Basic認証を要求される → [08_secret_manager.md](./08_secret_manager.md) の `admin-basic-auth` で設定した **ユーザー名:パスワード** を入力 → 管理ダッシュボードが表示されればOK

---

## 🆘 Step 5 でエラーが出た場合

### ❌ `PERMISSION_DENIED`

- サービスアカウントに `Cloud Run 管理者` ロールが付与されているか確認
- または自分のGoogleアカウントにプロジェクトオーナー権限があるか確認

### ❌ `Secret not found`

- [08_secret_manager.md](./08_secret_manager.md) で登録漏れがないか確認
- シークレット名の綴りを確認 (`line-channel-secret` 等、ハイフン区切り)

### ❌ ビルド失敗

- `node_modules` を含めていないか確認 → `.dockerignore` で除外済みのはず
- Dockerfile がルートディレクトリにあるか確認

### ❌ メモリ不足 (顔ぼかし処理)

- `--memory 1Gi` を `--memory 2Gi` に増やす (わずかに料金増)

---

## 📋 次のステップ

→ **[10_line_webhook.md](./10_line_webhook.md)** — LINE Webhook URL を設定へ進む

---

# 方法 A: GitHub 連携による自動デプロイ (上級者向け)

コードを更新するたびに `git push` で自動的に Cloud Run にデプロイされる仕組みです。

## 概要手順

1. GCP Console → **Cloud Run** → 対象サービス `manabi-ops` を開く
2. **「編集とデプロイの新しいリビジョン」** → **「継続的デプロイ」** を設定
3. GitHub リポジトリ `satoshiyoshimoto0426/manabi-kitchin` と連携
4. ブランチ `main` にマージされたら自動デプロイ

詳細は [Cloud Run 公式ドキュメント](https://cloud.google.com/run/docs/continuous-deployment-with-cloud-build) を参照。

---

## ✅ 完了チェック

- [ ] `gcloud run deploy` が成功
- [ ] `/healthz` が `{"ok":true,"mode":"production"}` を返す
- [ ] `/admin` にログイン可能
- [ ] Service URL をメモ済み
