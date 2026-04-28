# ManabiOps セットアップガイド

> **対象読者**: まなびキッチン 運営代表者・IT作業を担当するボランティアスタッフ
> **前提知識**: スマホ・ブラウザの基本操作ができる方
> **必要なもの**: パソコン (Windows / Mac どちらでも可) + インターネット環境 + Gmail アカウント + クレジットカード

本ガイドは、ManabiOps を **ゼロから本番稼働させる** ための完全手順書です。
順番通りに進めれば、IT 専門家でなくても構築を完遂できるよう設計しています。

---

## 📚 ガイド一覧 (上から順に進めてください)

| # | ガイド | 所要時間目安 | 必須? |
|---|--------|:------------:|:-----:|
| [00](./00_overview.md) | **概要・全体地図・事前準備** — これから何をやるのかの全体像 | 15分 | ✅ |
| [01](./01_line_messaging_api.md) | **LINE Messaging API セットアップ** — LINE 公式アカウント作成 | 30分 | ✅ |
| [02](./02_gcp_project.md) | **GCP プロジェクト作成・請求設定・サービスアカウント** | 40分 | ✅ |
| [03](./03_gemini_api.md) | **Gemini API キー取得** | 10分 | ✅ |
| [04](./04_document_ai.md) | **Document AI プロセッサ作成** (レシート + 名簿) | 60分 + PoC | ✅ |
| [05](./05_firestore.md) | **Firestore データベース作成** | 15分 | ✅ |
| [06](./06_cloud_storage.md) | **Cloud Storage バケット作成** | 15分 | ✅ |
| [07](./07_google_sheets.md) | **Google Sheets 会計台帳作成** | 15分 | ✅ |
| [08](./08_secret_manager.md) | **Secret Manager にシークレット登録** | 20分 | ✅ |
| [09](./09_cloud_run_deploy.md) | **Cloud Run にアプリをデプロイ** | 30分 | ✅ |
| [10](./10_line_webhook.md) | **LINE Webhook URL を設定** | 10分 | ✅ |
| [11](./11_cloud_scheduler.md) | **Cloud Scheduler (1時間バッチ)** | 15分 | ✅ |
| [12](./12_instagram_graph_api.md) | **Instagram Graph API 連携** (Phase 3) | 90分 | ⚠ Phase 3 のみ |
| [13](./13_troubleshooting.md) | **動作確認・トラブルシューティング** | — | ✅ |
| [14](./14_operation_checklist.md) | **運用開始チェックリスト** | — | ✅ |

**合計所要時間 (Phase 1 MVP まで): 約 4〜6時間** (1日で完了可能)
**Phase 3 含む全機能: 約 2〜3日 + Document AI 訓練のPoC 2週間**

---

## 🚀 クイックスタート (最短で動かしたい方へ)

**「まず Phase 1 (経理自動化) だけ本番稼働させたい」** 場合、以下のみでOKです:

1. [00_overview.md](./00_overview.md) を読む (全体像把握)
2. [01_line_messaging_api.md](./01_line_messaging_api.md)
3. [02_gcp_project.md](./02_gcp_project.md)
4. [03_gemini_api.md](./03_gemini_api.md)
5. [04_document_ai.md](./04_document_ai.md) — **レシートプロセッサのみ作成**
6. [05_firestore.md](./05_firestore.md)
7. [06_cloud_storage.md](./06_cloud_storage.md)
8. [07_google_sheets.md](./07_google_sheets.md)
9. [08_secret_manager.md](./08_secret_manager.md)
10. [09_cloud_run_deploy.md](./09_cloud_run_deploy.md)
11. [10_line_webhook.md](./10_line_webhook.md)
12. [11_cloud_scheduler.md](./11_cloud_scheduler.md)
13. [13_troubleshooting.md](./13_troubleshooting.md) で動作確認

Phase 2 (名簿DB) は `04` で名簿プロセッサを追加で作るだけ、Phase 3 (SNS投稿) は `12` を追加で行うだけです。

---

## 🆘 困ったら

- わからない用語が出てきたら [00_overview.md#用語集](./00_overview.md#用語集) を参照
- エラーが出たら [13_troubleshooting.md](./13_troubleshooting.md) を参照
- それでも解決しない場合は開発担当者に以下を連絡:
  - 何番のガイドの、どのステップで問題が起きたか
  - 画面のスクリーンショット
  - エラーメッセージの全文

---

## 📋 費用見積 (月額)

| サービス | 無料枠内の想定月額 | 無料枠を超えた場合 |
|----------|:------------------:|:------------------:|
| LINE Messaging API | **¥0** (月200通以内) | ¥5,000 (月5,000通) |
| Google Cloud Platform | **¥500〜¥2,000** | 利用量次第 |
| 　├ Gemini API | 無料枠で足りる見込み | $0.10〜/1万トークン |
| 　├ Document AI | 1,000ページ/月無料 | $0.10〜$0.30/ページ |
| 　├ Firestore | 2万書込/日無料 | ほぼ無料 |
| 　├ Cloud Run | 月200万リクエスト無料 | ¥0〜 |
| 　├ Cloud Storage | 5GB無料 | ¥3/GB |
| Instagram Graph API | **¥0** | — |
| **合計** | **月 ¥500〜¥3,000** | 小規模運用想定 |

→ 要件定義書の目標 **「月額10,000円以内」** を達成可能

---

## 📞 本ガイドの前提

- 画面のボタン名や配置は Google / LINE / Meta の仕様変更で変わることがあります。
  本ガイドは **2026年4月時点** の画面を基準に記述しています。
- 画面が異なっていた場合は、記載のボタン名に近いものをクリックしてください。
- 「ムリ」と感じたら一旦保存して、運営代表者・開発担当者に相談してください。
