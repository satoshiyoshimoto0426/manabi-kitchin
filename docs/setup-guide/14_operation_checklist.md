# 14. 運用開始チェックリスト

> **対象**: まなびキッチン 運営代表者・主担当者
> **利用時**: 本番稼働開始前、および月次運用確認時

---

## 📝 このガイドでやること

ManabiOps を **本番運用として開始する前の最終確認** と、
継続運用時の **月次/年次チェックリスト** をまとめます。

---

## Part 1: 本番稼働前 最終確認 (Go/No-Go)

以下 **すべて ✅** になれば本番稼働OK。1つでも ❌ があれば稼働保留。

### A. インフラ

- [ ] GCP プロジェクト `manabi-ops` が作成済み
- [ ] 請求アカウントがリンク済み、予算アラート ¥10,000 設定済み
- [ ] 必要な API が全て有効化済み (Firestore, Cloud Run, Document AI, Sheets, Storage, Secret Manager, AI Platform)
- [ ] サービスアカウント `manabi-ops-sa` 作成済み
- [ ] Cloud Run サービス `manabi-ops` が稼働中 (asia-northeast1)
- [ ] Cloud Run が `--min-instances 0` で設定されている (無料稼働)
- [ ] `/healthz` が `{"ok":true,"mode":"production"}` を返す
- [ ] 必要なサービスが全て `true` (line/gemini/docai/firestore/sheets/gcs)

### B. シークレット

- [ ] Secret Manager にPhase 1必須の6シークレット登録済み
- [ ] `encryption-key` を **オフラインで2箇所以上** バックアップ済み (USB + 紙)
- [ ] `admin-basic-auth` パスワードが16文字以上
- [ ] サービスアカウントに `Secret Accessor` ロール付与済み

### C. LINE

- [ ] LINE公式アカウント「まなびキッチン」作成済み
- [ ] Webhook URL 設定 + 検証成功
- [ ] Webhook 利用 = オン, 応答メッセージ = オフ
- [ ] 運営代表者が初回メッセージで Owner 登録済み
- [ ] テスト用レシート画像で E2E 成功

### D. Google Workspace

- [ ] Google Sheets `まなびキッチン 会計台帳` 作成済み
- [ ] シート名 `ledger`, ヘッダー10列入力済み
- [ ] サービスアカウントに編集者権限共有済み
- [ ] `SHEETS_SPREADSHEET_ID` が Secret Manager に登録済み

### E. Document AI

- [ ] レシートプロセッサ (Expense Parser) 作成済み
- [ ] Processor ID が Secret Manager に登録済み
- [ ] 実レシートで90%以上の精度確認済み (受入基準 AC-01)

### F. Cloud Scheduler

- [ ] 3ジョブ (hourly / monthly / daily) 作成済み
- [ ] すべて「今すぐ実行」テスト成功
- [ ] タイムゾーン `Asia/Tokyo` 設定

### G. 管理画面

- [ ] `/admin` に Basic認証でアクセス可能
- [ ] ユーザー管理画面で Owner 以外のスタッフを1〜2名追加済み
- [ ] 承認待ち一覧が表示される

### H. 運用ルール

- [ ] 運営代表者以外の承認権限者が2名以上 (Bus Factor対策)
- [ ] 承認者の LINE User ID が管理画面に登録済み
- [ ] トラブル時の連絡先が明文化されている
- [ ] 月次確認担当者が決まっている

### I. ドキュメント

- [ ] README.md 最新
- [ ] セットアップガイド (本ディレクトリ) 最新
- [ ] `.env.example` 最新 (機密情報は含めない)
- [ ] 個人情報保護ポリシーを運営内で周知

---

## Part 2: 月次運用チェックリスト (毎月1日)

| # | 項目 | 確認方法 | 目安 |
|:--:|------|----------|------|
| 1 | GCP 月額コスト | [GCP 課金](https://console.cloud.google.com/billing) | ¥3,000 以下推奨 |
| 2 | Cloud Storage 使用量 | Storage Console | 5GB 以下 |
| 3 | Firestore 書込数 | Firestore Usage | 1万/日以下 |
| 4 | Document AI 使用ページ数 | Document AI Console | 月1,000以下 |
| 5 | Cloud Scheduler ジョブ正常稼働 | Scheduler 画面 | 3ジョブ全て成功 |
| 6 | エラーログ数 | Cloud Logging (severity=ERROR) | 先月比で急増していない |
| 7 | 月次サマリーLINE受信 | LINE | 毎月1日 9:00 に届く |
| 8 | Instagram 投稿件数・エンゲージ | Instagram Insights | — |
| 9 | 参加者累計・新規数 | 管理画面 /admin/stats | — |
| 10 | LINEトーク返信成功率 | ログ検索 | 95% 以上 |

---

## Part 3: 半年ごと (4月・10月)

- [ ] GCP サービスアカウントキー ローテーション
- [ ] `admin-basic-auth` パスワード変更
- [ ] 運営メンバー変更を管理画面に反映
- [ ] Firestore `participants` の不要データ棚卸し
- [ ] Cloud Storage 内の肥大化フォルダ確認

---

## Part 4: 60日ごと (Phase 3 運用時)

- [ ] Instagram アクセストークン更新 ([12_instagram_graph_api.md](./12_instagram_graph_api.md) Step 10)
- [ ] Meta アプリの審査状況確認

---

## Part 5: 年次 (3月末 or 年度末)

- [ ] 年次集計エクスポート (会計台帳CSV)
- [ ] Firestore 全データバックアップ (GCP Firestore Export)
- [ ] Cloud Storage → AI Drive 長期保管 (必要分のみ)
- [ ] 要件定義書 v1.0 → v1.x 改訂検討
- [ ] 依存ライブラリ更新 (npm audit, `npm update`)
- [ ] Node.js LTS 最新版へのアップグレード検討

---

## Part 6: 緊急時対応 (インシデント発生時)

### Step 1. 事実確認

- いつから? (開始時刻)
- 何が? (現象)
- 範囲は? (全ユーザー / 一部 / 特定機能のみ)

### Step 2. 一次対応

| 状況 | 対応 |
|------|------|
| Cloud Run ダウン | 前リビジョンにロールバック ([13_troubleshooting.md](./13_troubleshooting.md) Part 4) |
| LINE 返信停止 | Webhook URL + 応答設定を再確認 |
| データ誤登録 | 管理画面から削除 + 再入力 |
| 個人情報漏洩疑い | **直ちに Cloud Run を停止**、開発者連絡 |
| Instagram 誤投稿 | Instagram アプリから削除 |

### Step 3. 復旧後

- インシデントレポート作成 (発生→原因→対応→再発防止)
- 必要に応じて参加者・保護者への連絡
- `CHANGELOG.md` に記録

---

## Part 7: Bus Factor 対策

**1人の担当者しか運用できない状態を避ける** ため:

- [ ] **最低3名** が管理画面ログイン可能
- [ ] **最低2名** が Cloud Run デプロイ操作可能 (gcloud CLI インストール済み)
- [ ] パスワード類は **1Password / Bitwarden** 等パスワードマネージャで共有
- [ ] `encryption-key` のオフラインバックアップ場所を複数人が把握
- [ ] 本ドキュメントを全員が読んでいる (読了チェック)

---

## Part 8: 退任・引継ぎ時

担当者の交代があった場合:

- [ ] GCP IAM から退任者のアカウント削除
- [ ] LINE ホワイトリストから退任者の User ID 削除
- [ ] 管理画面パスワード変更
- [ ] サービスアカウントキー再発行 (疑いがあれば)
- [ ] Google Sheets 共有から退任者削除
- [ ] Meta アプリ (Phase 3) の管理者から退任者削除

---

## ✅ 完了したら...

セットアップ完了 🎉
本ドキュメントをブックマーク・印刷して、月1回レビューしてください。

---

## 📋 その他のガイド

- [00_overview.md](./00_overview.md) — 全体概要
- [13_troubleshooting.md](./13_troubleshooting.md) — トラブル対応
- [README.md](./README.md) — ガイド一覧に戻る
