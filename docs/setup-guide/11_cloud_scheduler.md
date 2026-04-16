# 11. Cloud Scheduler (1時間バッチ) 設定

> 所要時間: **15分**
> 費用: **月3ジョブまで無料** → **¥0**
> このガイドで取得するもの: 1時間ごとの自動バッチ実行環境

---

## 📝 このガイドでやること

ManabiOps は以下の **定期タスク** を裏で回す必要があります (要件定義書 EX-05, EX-07, EX-11)。

| ジョブ | 頻度 | 内容 |
|--------|:----:|------|
| **hourly-batch** | 毎時 | 承認待ち・リマインダー確認、期限切れ自動取消、ストレージ容量確認 |
| **monthly-summary** | 月初1日 9:00 | 前月の会計・参加者集計を Owner に LINE 送信 (FR-11) |
| **daily-cleanup** | 毎日 3:00 | 古い承認待ちデータ、一時ファイル削除 |

Cloud Scheduler は GCP のタスクスケジューラ (cron) です。

### ゴール

✅ 3つのジョブが作成される
✅ すべて `manabi-ops` Cloud Run サービスの `/internal/*` エンドポイントを呼び出す
✅ 認証トークン付きで実行される (サービスアカウント経由)

---

## Step 1. Cloud Scheduler を有効化

1. [GCP Console](https://console.cloud.google.com/) → プロジェクト `manabi-ops` を選択
2. 上部検索バーで **`Cloud Scheduler`** を検索 → 開く
3. 「API を有効にする」画面が出たら **「有効にする」** をクリック (初回のみ)

---

## Step 2. 共通: 認証用サービスアカウントの準備

Cloud Scheduler が Cloud Run を呼び出すのに、認証トークンが必要です。
[02_gcp_project.md](./02_gcp_project.md) で作成したサービスアカウント `manabi-ops-sa` を使います。

### 権限確認

サービスアカウントに **「Cloud Run 起動元」** (`roles/run.invoker`) が付与されているか確認:

1. GCP Console → **IAM と管理** → **IAM**
2. `manabi-ops-sa@manabi-ops.iam.gserviceaccount.com` の行を探す
3. ロール欄に **「Cloud Run 起動元」** が含まれていればOK
4. 無ければ **編集 (鉛筆アイコン)** → **「+ ロールを追加」** → `Cloud Run Invoker` を追加 → 保存

---

## Step 3. ジョブ① hourly-batch (毎時実行)

1. Cloud Scheduler 画面上部の **「+ ジョブを作成」** をクリック

### 3-1. 基本設定

| 項目 | 値 |
|------|----|
| 名前 | `manabi-ops-hourly-batch` |
| リージョン | `asia-northeast1 (東京)` |
| 説明 | `ManabiOps 毎時バッチ (EX-05/07/11)` |
| 頻度 | `0 * * * *` (毎時0分) |
| タイムゾーン | `Asia/Tokyo` (日本標準時) |

**「続行」** をクリック

### 3-2. 実行内容

| 項目 | 値 |
|------|----|
| ターゲット タイプ | **HTTP** |
| URL | `https://manabi-ops-xxxxxx-an.a.run.app/internal/hourly` (自分のCloud Run URL) |
| HTTP メソッド | **POST** |
| HTTP ヘッダー | `Content-Type: application/json` |
| 本文 | `{}` |
| Auth ヘッダー | **「OIDC トークンを追加」** |
| サービスアカウント | `manabi-ops-sa@manabi-ops.iam.gserviceaccount.com` |
| 対象 (audience) | Cloud Run URL (`https://manabi-ops-xxxxxx-an.a.run.app`) |

**「続行」** をクリック

### 3-3. 再試行設定 (任意)

- 最大再試行回数: **3**
- 最大再試行時間: **10分**
- **「作成」** をクリック

---

## Step 4. ジョブ② monthly-summary (月初実行)

同じ手順で2つ目のジョブを作成。

### 4-1. 基本設定

| 項目 | 値 |
|------|----|
| 名前 | `manabi-ops-monthly-summary` |
| 頻度 | `0 9 1 * *` (毎月1日 9:00) |
| タイムゾーン | `Asia/Tokyo` |

### 4-2. 実行内容

| 項目 | 値 |
|------|----|
| URL | `https://manabi-ops-xxxxxx-an.a.run.app/internal/monthly-summary` |
| HTTP メソッド | **POST** |
| 本文 | `{}` |
| Auth | OIDCトークン (同じサービスアカウント) |

---

## Step 5. ジョブ③ daily-cleanup (毎日3時)

### 5-1. 基本設定

| 項目 | 値 |
|------|----|
| 名前 | `manabi-ops-daily-cleanup` |
| 頻度 | `0 3 * * *` (毎日3:00) |
| タイムゾーン | `Asia/Tokyo` |

### 5-2. 実行内容

| 項目 | 値 |
|------|----|
| URL | `https://manabi-ops-xxxxxx-an.a.run.app/internal/daily-cleanup` |
| HTTP メソッド | **POST** |
| 本文 | `{}` |
| Auth | OIDCトークン (同じサービスアカウント) |

---

## Step 6. 即時テスト実行

各ジョブが正しく動くかを、次回実行を待たずに確認します。

1. Cloud Scheduler 画面でジョブ一覧を表示
2. 対象ジョブの行 → 右端の **「︙」(縦3点)** → **「今すぐ実行」**
3. 数秒後に **「最終実行結果」** が **「成功」** になればOK

---

## Step 7. ログ確認

1. ジョブ行のメニュー (縦3点) → **「ログを表示」**
2. 実行ログが並んでいるか確認
3. HTTPステータスが **200** になっているかチェック

Cloud Run 側のログも確認:
```bash
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 20
```

---

## Step 8. cron 式早見表

| やりたいこと | cron式 |
|------------|--------|
| 毎時0分 | `0 * * * *` |
| 毎時30分 | `30 * * * *` |
| 毎日9:00 | `0 9 * * *` |
| 毎日0:00と12:00 | `0 0,12 * * *` |
| 平日9:00 | `0 9 * * 1-5` |
| 月初1日9:00 | `0 9 1 * *` |
| 月末9:00 | `0 9 L * *` |

詳細: [cron 書式](https://crontab.guru/)

---

## ✅ 完了チェック

- [ ] Cloud Scheduler API 有効化
- [ ] `manabi-ops-hourly-batch` ジョブ作成 (毎時0分)
- [ ] `manabi-ops-monthly-summary` ジョブ作成 (月初1日 9:00)
- [ ] `manabi-ops-daily-cleanup` ジョブ作成 (毎日3:00)
- [ ] 各ジョブを「今すぐ実行」でテスト → 成功
- [ ] OIDC トークン認証が設定されている

---

## 📋 次のステップ

→ **Phase 3 (Instagram投稿) に進む場合**: [12_instagram_graph_api.md](./12_instagram_graph_api.md)
→ **動作確認・トラブル対応**: [13_troubleshooting.md](./13_troubleshooting.md)

Phase 1 MVP だけ使う場合、ここでセットアップ完了です！ 🎉

---

## 🆘 トラブルシューティング

### ❌ 「今すぐ実行」の結果が「失敗」

- HTTPステータスをログで確認
- **401 Unauthorized**: OIDC トークン設定が間違っている。サービスアカウントと audience を再確認
- **404 Not Found**: URL が間違い。`/internal/hourly` などのパスをチェック
- **500 Internal Server Error**: Cloud Run 側のエラー → `gcloud run services logs read` で詳細確認

### ❌ ジョブが勝手に止まる

- 最大再試行回数に達した可能性 → Cloud Scheduler で「一時停止解除」
- Cloud Run がクラッシュしていないか `/healthz` で確認

### ❌ 二重実行される

- Cloud Scheduler の再試行時のタイムアウト設定を長めに (10分以上)
- ManabiOps 側はidempotent (重複実行しても安全) に設計済みなので通常は問題なし
