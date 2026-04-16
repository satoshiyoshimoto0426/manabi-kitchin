# ManabiOps — まなびキッチン運営支援システム

> LINEを中核としたこども食堂 運営自動化プラットフォーム
> 要件定義書 Ver 1.0 (2026-04-16) に準拠した実装

## 📌 概要

**ManabiOps** は、こども食堂「まなびキッチン」の運営事務作業を極限まで省力化するシステムです。
専用LINEアカウントに **レシート / 名簿 / イベント写真** を送るだけで、AIが内容を判別・仕訳・DB登録・画像加工・SNS投稿準備まで全自動で行います。

### コアコンセプト
> **「写真を送るだけで全部終わる」**

スタッフは LINE のみで完結し、PC作業・手入力・人物顔のマスキング作業から解放されます。

## ✨ 実装済み機能一覧 (要件定義 第4章 全機能)

| ID     | 機能名                     | 実装 | 備考                                                                 |
|--------|----------------------------|------|----------------------------------------------------------------------|
| FR-01  | 画像自動分類               | ✅   | Gemini 2.5 Flash による receipt/roster/event_photo/unknown 4分類 |
| FR-02  | レシートOCRと勘定仕訳      | ✅   | Document AI (Receipt Processor) + Gemini で科目推論                  |
| FR-03  | 会計台帳 Google Sheets 登録 | ✅   | Sheets API (モック時は CSV)                                          |
| FR-04  | 名簿OCRと参加者DB登録      | ✅   | Document AI Custom Extractor + Firestore、氏名はSHA-256ハッシュ/AES-256-GCM暗号化 |
| FR-05  | イベント写真・動画受付     | ✅   | LINE Messaging API 経由、GCS保存                                     |
| FR-06  | 顔自動ぼかし処理           | ✅   | MediaPipe Face Detection + OpenCV/FFmpeg (Python sub-process)        |
| FR-07  | リール/ストーリー自動編集  | ✅   | Instagram Graph API の media_type 切替で対応                         |
| FR-08  | SNSキャプション自動生成    | ✅   | Gemini によるキャプション + ハッシュタグ生成                         |
| FR-09  | 承認フロー (Human-in-the-Loop) | ✅ | Flex Message `[✅登録] [✏修正] [❌取消]` の3ボタン                |
| FR-10  | Instagram 自動投稿         | ✅   | Graph API Container→Publish                                          |
| FR-11  | 月次サマリ自動生成         | ✅   | `/admin` または LINE「サマリ」テキスト                               |
| FR-12  | ダッシュボード表示         | ✅   | 管理画面 `/admin` + Looker Studio用データ (Firestore/Sheets) 接続可 |

## 🛡 例外処理 (EX-01 〜 EX-12) 全対応

| 例外ID | 対応状況 | 実装箇所 |
|--------|----------|----------|
| EX-01 OCR信頼度低 | ✅ | `receiptPipeline.ts` 手入力フォーム誘導 |
| EX-02 種別判別不可 | ✅ | `buildClassificationMenu` 手動選択メニュー |
| EX-03 LINE API障害 | ✅ | `retry.ts` 指数バックオフ最大3回 |
| EX-04 Gemini API障害 | ✅ | `retry.ts` 指数バックオフ |
| EX-05 Sheets連携失敗 | ✅ | Firestoreに保存して `/tasks/hourly` バッチで再送 |
| EX-06 IGトークン切れ | ✅ | `instagram.ts` code=190検出、Ownerに通知 |
| EX-07 承認タイムアウト | ✅ | `batch.ts` 24h でリマインド、48h で expired |
| EX-08 重複登録検知 | ✅ | `dedupKey=date|vendor|total` で既存検索、確認 |
| EX-09 顔検出漏れ2次チェック | ✅ | `verifyFaceBlurring` でGeminiが再検査 |
| EX-10 未許可ユーザー | ✅ | `auth.ts` ホワイトリスト照合 |
| EX-11 Storage容量超過 | ✅ | `batch.ts` Ownerに警告通知 |
| EX-12 ネットワーク切断 | ✅ | LINE標準再送で対応 (本システム側不要) |

## 🏗 アーキテクチャ

```
                 ┌──────────────┐
スタッフ ──LINE──▶│  LINE Bot    │(Messaging API)
                 └──────┬───────┘
                        │ webhook
                 ┌──────▼───────────────┐
                 │  Cloud Run (Node.js) │ ManabiOps
                 │  - 画像分類 (Gemini) │
                 │  - OCR (Document AI) │
                 │  - 顔ぼかし (MediaPipe)
                 │  - 承認フロー        │
                 └──┬───┬────┬──────┬───┘
                    │   │    │      │
         ┌──────────┘   │    │      └──────────┐
         ▼              ▼    ▼                 ▼
    Firestore    Cloud Storage    Google Sheets    Instagram Graph API
    (DB)         (原本メディア)   (会計台帳)       (SNS投稿)
```

### 技術スタック
- **Runtime**: Node.js 20 / TypeScript / Express
- **インフラ**: Google Cloud Run (サーバーレス)
- **AI**: Gemini 2.5 Flash + Google Document AI
- **DB**: Firestore
- **ストレージ**: Cloud Storage (原本1年保持ライフサイクル)
- **外部連携**: LINE Messaging API, Google Sheets API, Instagram Graph API

## 🚀 セットアップ

> ### 👉 本番API接続・運用開始の詳細手順は **[docs/setup-guide/README.md](./docs/setup-guide/README.md)** を参照
>
> 00〜14 の連番ガイドを順に進めれば、IT専門家でなくても **ゼロから本番稼働** まで完遂できます。
> 所要時間: Phase 1 MVP 約 4〜6時間 / 全Phase 2〜3日 + Document AI 訓練PoC 2週間

### 1. ローカル起動 (MOCK モード: 外部API未接続でフル動作)

```bash
npm install
npm run build
MOCK_MODE=true node dist/scripts/seed.js     # サンプルデータ投入
MOCK_MODE=true npm start
```

- http://localhost:8080/ — ランディング
- http://localhost:8080/healthz — ヘルスチェック
- http://localhost:8080/admin — 管理画面 (Basic認証: `admin` / `manabi-admin`)

MOCK モード時でも **レシート処理→承認→CSV台帳** の完全フローが確認できます。

### 2. 本番デプロイ (Cloud Run)

#### 2.1 必要な GCP リソース

```bash
PROJECT_ID=your-gcp-project
REGION=asia-northeast1

# 必要なAPIを有効化
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  documentai.googleapis.com \
  sheets.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --project=$PROJECT_ID

# Firestore (Native モード) を作成
gcloud firestore databases create --location=$REGION --project=$PROJECT_ID

# メディア保存用 GCS バケット (第7章 1年ライフサイクル)
gsutil mb -p $PROJECT_ID -l $REGION gs://manabi-ops-media
cat > lifecycle.json <<EOF
{ "lifecycle": { "rule": [
  { "action": {"type":"Delete"}, "condition": {"age": 365} }
]}}
EOF
gsutil lifecycle set lifecycle.json gs://manabi-ops-media

# Document AI プロセッサを2つ作成 (Console からGUIで)
#  - Receipt Processor (FR-02)
#  - Custom Extractor (FR-04, 氏名/区分/料金を抽出するよう訓練)

# LINE チャネル作成 → Channel Secret / Access Token 取得
# Instagram Graph API トークン取得 (長期トークン推奨)
```

#### 2.2 Secret Manager にシークレット登録 (第5章 推奨)

```bash
gcloud secrets create LINE_CHANNEL_SECRET --data-file=- <<< "xxxxxxxx"
gcloud secrets create LINE_CHANNEL_ACCESS_TOKEN --data-file=- <<< "xxxxxxxx"
gcloud secrets create GEMINI_API_KEY --data-file=- <<< "xxxxxxxx"
gcloud secrets create IG_ACCESS_TOKEN --data-file=- <<< "xxxxxxxx"
gcloud secrets create PARTICIPANT_ENC_KEY --data-file=- <<< "$(openssl rand -hex 32)"
gcloud secrets create PARTICIPANT_HASH_SALT --data-file=- <<< "$(openssl rand -hex 16)"
```

#### 2.3 Cloud Run デプロイ

```bash
gcloud run deploy manabi-ops \
  --source=. \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=60 \
  --min-instances=0 \
  --max-instances=5 \
  --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,\
DOCAI_LOCATION=us,DOCAI_RECEIPT_PROCESSOR_ID=xxxxxx,DOCAI_ROSTER_PROCESSOR_ID=xxxxxx,\
GCS_BUCKET_MEDIA=manabi-ops-media,SHEETS_SPREADSHEET_ID=xxxxxx,IG_BUSINESS_ACCOUNT_ID=xxxxxx \
  --set-secrets=LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest,\
LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest,\
IG_ACCESS_TOKEN=IG_ACCESS_TOKEN:latest,\
PARTICIPANT_ENC_KEY=PARTICIPANT_ENC_KEY:latest,\
PARTICIPANT_HASH_SALT=PARTICIPANT_HASH_SALT:latest
```

#### 2.4 LINE Webhook URL 設定

LINE Developers Console → Messaging API → Webhook URL に
`https://manabi-ops-xxxxx.a.run.app/webhook`  を設定し、「Webhookの利用」をON。

#### 2.5 Cloud Scheduler 設定 (1時間バッチ)

```bash
gcloud scheduler jobs create http manabi-hourly \
  --location=$REGION \
  --schedule="0 * * * *" \
  --uri="https://manabi-ops-xxxxx.a.run.app/tasks/hourly" \
  --http-method=POST \
  --attempt-deadline=60s
```

#### 2.6 会計台帳 Google Sheets

- スプレッドシートを新規作成し、シート名を `会計台帳` に
- 1行目に `日付,種別,勘定科目,金額,店舗,品目,取引ID,承認者,承認日時,レシートURL` を入力
- Cloud Run のサービスアカウントに **編集権限** を共有
- SpreadsheetID を環境変数 `SHEETS_SPREADSHEET_ID` に設定

### 3. 運用開始

1. スタッフが LINE 公式アカウントを友だち追加
2. **最初に友だち追加してメッセージを送ったユーザーが自動的に Owner** として登録 (Bootstrap)
3. 以降の追加は `/admin/users` 画面、または LINE の Owner メニューから

## 📱 使い方 (スタッフ向け)

1. LINE を開き「まなびキッチン」公式アカウントを選択
2. レシート・名簿・イベント写真を**そのまま送信**
3. AIの解析結果が Flex Message で届く (約3〜10秒)
4. 内容を確認して **[✅登録]** をタップ → 完了!

### テキストコマンド

| コマンド   | 動作                    |
|-----------|-------------------------|
| `メニュー` | 操作メニューを表示     |
| `サマリ`   | 当月の収支・参加者数表示 |
| `手入力`   | レシート手入力フォーム  |

## 📂 プロジェクト構成

```
src/
├── index.ts              # Express エントリポイント
├── config/env.ts         # 環境変数ローダー
├── types/domain.ts       # ドメインモデル型定義 (第7章)
├── utils/
│   ├── logger.ts         # Cloud Logging 互換構造化ログ
│   ├── crypto.ts         # 氏名ハッシュ化/暗号化
│   └── retry.ts          # 指数バックオフ (EX-03/04)
├── services/
│   ├── store.ts          # Firestore抽象化 (mock⇔本番)
│   ├── storage.ts        # Cloud Storage抽象化
│   ├── gemini.ts         # 画像分類/科目推論/キャプション/顔検査
│   ├── documentai.ts     # レシート/名簿OCR
│   ├── sheets.ts         # 会計台帳書込 (EX-05対応)
│   ├── instagram.ts      # Graph API投稿 (EX-06対応)
│   ├── faceBlur.ts       # FR-06 顔ぼかし (Python subprocess)
│   └── lineClient.ts     # LINE API ラッパー
├── line/
│   ├── flex.ts           # Flex Message ビルダー (FR-09)
│   └── webhook.ts        # Webhook ハンドラ (全フロー統合)
├── core/
│   ├── auth.ts           # ホワイトリスト/権限マトリクス (6章)
│   ├── receiptPipeline.ts  # レシート処理 (FR-02/03)
│   ├── rosterPipeline.ts   # 名簿処理 (FR-04)
│   ├── photoPipeline.ts    # 写真処理 (FR-05〜10)
│   ├── summary.ts          # 月次サマリ (FR-11)
│   └── batch.ts            # 1時間バッチ (EX-05/07/11)
├── admin/
│   ├── basicAuth.ts      # 管理画面認証
│   └── router.ts         # ダッシュボード/ユーザー管理/CSV出力
└── scripts/
    └── seed.ts           # サンプルデータ投入
scripts/
├── face_blur.py          # MediaPipe 顔ぼかし実装
└── requirements.txt      # Python依存
Dockerfile                # Cloud Run 用マルチステージビルド
```

## 🔒 セキュリティ (第5章・第12章 対応)

- 全通信 **TLS 1.3** (Cloud Run デフォルト)
- シークレットは **Google Secret Manager** で管理
- 参加者氏名は **SHA-256 ハッシュ + AES-256-GCM 暗号化** で Firestore 保存
- LINE User ID **ホワイトリスト** によるアクセス制御 (EX-10)
- 写真はデフォルトで **顔ぼかし必須** (FR-06、回避不可)
- Firestore Security Rules: サーバー側からのみ書込可、クライアント直アクセス禁止

## 📊 データ保持 (第7章 7.3)

| データ種別                | 保持期間     | 実装                                             |
|---------------------------|--------------|--------------------------------------------------|
| 会計帳簿 (transactions)   | 7年          | Firestore + Sheets (手動バックアップ推奨)        |
| 参加者名簿 (participants) | 最終参加から3年 | バッチ削除ジョブで運用 (`/tasks/hourly` 拡張可) |
| 画像原本 (Storage)        | 1年          | GCS ライフサイクルで自動削除                     |

## 🧪 受入テスト (第14章)

| 観点                  | 合格条件                                       | 確認方法                       |
|-----------------------|-----------------------------------------------|--------------------------------|
| 画像分類              | 10枚のテスト画像で90%以上正しく分類           | `scripts/test-classify.sh`     |
| レシートOCR           | 合計金額・日付が100%正確                       | 実レシートで検証               |
| 顔ぼかし              | 全顔領域が自動マスキング                       | `scripts/face_blur.py` 単体実行 |
| LINE完結              | PC を開かずLINEのみで送信→承認完了            | 実機確認                       |
| Instagram 投稿        | 承認後 30 秒以内に投稿反映                     | 実機確認                       |
| ダッシュボード        | 月次集計値が手計算と100%一致                   | `/admin` と Sheets 比較        |
| 権限制御              | 未登録ユーザー送信が100%遮断                   | EX-10 自動テスト済             |

## 📖 参考

- 要件定義書: `docs/manabi-ops-requirements.pdf` (別途提供)
- こども家庭庁「こども食堂の運営に関するガイドライン」
- 個人情報の保護に関する法律
- LINE Messaging API / Meta Platform Terms / GCP 利用規約

## 📝 ライセンス
社外秘 (Confidential) — まなびキッチン運営主体による指定ライセンス
