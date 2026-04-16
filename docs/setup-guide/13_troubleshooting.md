# 13. 動作確認・トラブルシューティング

> 所要時間: 問題発生時の随時参照
> 前提: [09_cloud_run_deploy.md](./09_cloud_run_deploy.md), [10_line_webhook.md](./10_line_webhook.md) 完了

---

## 📝 このガイドでやること

ManabiOps が本番稼働した後の **動作確認手順** と、よくある問題の **解決方法** をまとめます。

---

## Part 1: 動作確認チェックリスト

デプロイ直後の導通テストとして以下を順にチェックしてください。

### ① ヘルスチェック

```bash
curl https://manabi-ops-xxxxxx-an.a.run.app/healthz
```

**期待される出力**:
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
    "ig": false  ← Phase 3 未実施なら false でOK
  }
}
```

- [ ] `ok: true`
- [ ] `mode: production`
- [ ] Phase 1 で必要な全サービス (line/gemini/docai/firestore/sheets/gcs) が `true`

---

### ② 管理画面ログイン

1. ブラウザで `https://manabi-ops-xxxxxx-an.a.run.app/admin`
2. Basic認証を要求される → Secret Manager で設定した `admin-basic-auth` 値 (`admin:password`) を入力
3. 管理ダッシュボードが表示される

確認項目:
- [ ] ユーザー一覧に初回登録の Owner が表示される
- [ ] 承認待ち一覧が表示される (空でOK)
- [ ] ストレージ使用量が表示される

---

### ③ LINE 経由のレシート取引E2Eテスト

1. LINE アプリで「まなびキッチン」公式アカウントを開く
2. 任意のレシート画像 (実物写真でもネット画像でも可) を送信
3. **30秒以内** に Flex Message が返ってくる
4. **[✅ 登録]** ボタンをタップ
5. Google Sheets を開いて、新しい行が追加されているか確認

確認項目:
- [ ] 画像送信 → 返信 (画像認識応答)
- [ ] OCR 結果が Flex Message で表示される
- [ ] 承認後、Sheets に行が追加される
- [ ] Firestore Console の `transactions` コレクションにもレコードがある

---

### ④ LINE 経由の参加者名簿テスト (Phase 2 以降)

1. LINE に手書き名簿画像を送信
2. Flex Message で参加者リストが返ってくる
3. **[✅ 登録]** で Firestore `participants` に暗号化保存される

---

### ⑤ LINE 経由の写真投稿テスト (Phase 3)

1. LINE にイベント写真を送信
2. Flex Message で顔ぼかし済み写真 + 自動生成キャプションが返る
3. **[✅ 投稿]** で Instagram に30秒以内に投稿

---

### ⑥ バッチ動作テスト

1. GCP Console → **Cloud Scheduler** → `manabi-ops-hourly-batch`
2. **「今すぐ実行」** → 「成功」になるか

---

## Part 2: よくあるエラーと解決方法

### ❌ E1. LINE メッセージを送っても返事が来ない

**原因候補** (発生頻度順):

#### 1️⃣ LINE の応答メッセージ設定が干渉
- [LINE Official Account Manager](https://manager.line.biz/) にログイン
- **応答設定** → 「応答メッセージ」= **オフ**, 「Webhook」= **オン**

#### 2️⃣ Webhook URL が誤り
- LINE Developers Console → Messaging API 設定 → Webhook URL
- `https://manabi-ops-xxxxxx-an.a.run.app/webhook` で末尾 `/webhook` が付いているか

#### 3️⃣ Cloud Run がダウン
```bash
curl https://manabi-ops-xxxxxx-an.a.run.app/healthz
```
応答がない場合:
```bash
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 50
```
でエラーログを確認。

#### 4️⃣ Webhook 署名検証エラー
- Secret Manager の `line-channel-secret` 値が正しいか
- 前後の空白・改行を含めていないか
- 修正後: `gcloud run services update manabi-ops --region asia-northeast1` で再反映

---

### ❌ E2. 「権限がありません」エラー (EX-10)

- ホワイトリストに LINE User ID が未登録
- 解決手順:
  1. LINE 管理者が `/adduser 名前 U_xxxx` コマンドを送信
  2. または管理画面 `/admin/users` から追加

---

### ❌ E3. OCR 結果が不正確

#### レシート
- Document AI の Expense Parser は **日本語レシート対応** だが精度は画像品質に依存
- **明るい場所で・まっすぐ・平らに** 撮影するよう運用ルール化
- 金額が誤検出される場合 → 管理画面 `/admin/transactions` から手動修正

#### 名簿 (Custom Extractor)
- 訓練データが不足している可能性
- 追加で10〜20枚サンプルを与えて再訓練 ([04_document_ai.md](./04_document_ai.md) Part 2)

---

### ❌ E4. Google Sheets にデータが書き込まれない

1. Sheets へのサービスアカウント共有が **編集者** か確認
2. `SHEETS_SPREADSHEET_ID` が正しいか確認
3. シート名が **`ledger`** (半角英字) か確認
4. Cloud Run ログで `sheets:` 関連エラーを検索
```bash
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 100 | grep -i sheets
```

---

### ❌ E5. 顔ぼかしが適用されない / 処理が遅い

- MediaPipe が顔を検出できない場合 (斜めの顔、マスク等) → OpenCV fallback が動くが精度低下
- Cloud Run メモリ不足 → `--memory 2Gi` に増量
- コールドスタート遅延 → `--min-instances 1` に設定 (月¥1,500程度加算)

---

### ❌ E6. Instagram 投稿失敗

- Meta トークンの60日期限切れ → [12_instagram_graph_api.md](./12_instagram_graph_api.md) Step 10 で再発行
- アプリがまだ開発モード → [12_instagram_graph_api.md](./12_instagram_graph_api.md) Step 15 (審査)
- 動画の尺・サイズがリール仕様を満たしていない

---

### ❌ E7. 月額コストが想定より高い

1. [GCP Console 課金](https://console.cloud.google.com/billing) で項目別確認
2. 主因の候補:
   - **Document AI**: 月1,000ページ超過 → レシート枚数を確認
   - **Cloud Storage**: 古いファイルが溜まっている → ライフサイクル設定確認 ([06](./06_cloud_storage.md))
   - **Cloud Run**: `min-instances` を1以上にしている → 0に戻す
3. 月額上限アラート設定: GCP 課金 → **「予算とアラート」** → ¥10,000 で通知

---

## Part 3: ログの見方

### Cloud Run ログ

```bash
# 直近50件
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 50

# リアルタイム監視 (別ターミナルで実行)
gcloud run services logs tail manabi-ops --region asia-northeast1

# 特定キーワード検索
gcloud run services logs read manabi-ops --region asia-northeast1 --limit 500 | grep -i error
```

### GCP Console でログ検索

1. GCP Console → **Cloud Logging** → **ログエクスプローラ**
2. 左上リソースで **`Cloud Run Revision`** → `manabi-ops` を選択
3. 「クエリ」欄で `severity=ERROR` 等を指定

### ログのフィルタ例

```
# エラーだけ
severity=ERROR

# OCR関連
resource.labels.service_name="manabi-ops" AND jsonPayload.component="docai"

# 特定ユーザーの動作
jsonPayload.userId="U_xxxxxxxx"
```

---

## Part 4: 復旧手順

### 🆘 Cloud Run サービスが完全に落ちている

1. [Cloud Run Console](https://console.cloud.google.com/run) を開く
2. `manabi-ops` サービスを選択
3. **「リビジョン」** タブで、直近の成功リビジョンに戻す:
   - 動いていたリビジョン行の **︙** → **「トラフィックを100%」**
4. または再デプロイ:
```bash
gcloud run deploy manabi-ops --source . --region asia-northeast1
```

---

### 🆘 Secret Manager のキーを誤って上書きした

1. Secret Manager → 該当シークレット → **「バージョン」** タブ
2. 前のバージョン (数字が1つ小さい) の行 → **「...」** → **「このバージョンにロールバック」**
3. Cloud Run を再起動:
```bash
gcloud run services update manabi-ops --region asia-northeast1
```

---

### 🆘 Firestore に間違ったデータを入れた

- **1件だけ**: Firestore Console でドキュメントを開いて削除/編集
- **一括削除**: 管理画面 `/admin/firestore` (データ削除タブ) から削除 — Owner 権限のみ
- **全コレクション**: GCP Console → Firestore → コレクションを選択 → **データを削除**

---

## Part 5: 運用チェックリスト (月次)

毎月1日に以下を確認 (月次サマリーと一緒に):

- [ ] GCP 月額コストが ¥10,000 以下
- [ ] Cloud Storage 使用量が 5GB 以下 (無料枠内)
- [ ] Firestore 書込数が2万/日を超えていない
- [ ] Document AI 使用量が1,000ページ/月を超えていない
- [ ] Instagram トークン有効期限 (残り30日切ったら更新準備)
- [ ] Cloud Scheduler ジョブ3つすべて「成功」継続
- [ ] 月次サマリー LINE が届いている (FR-11)
- [ ] エラーログの傾向確認 (異常増加していないか)

---

## 📋 次のステップ

**セットアップ完了 🎉**

- 継続運用: 本ガイドをブックマーク
- 新機能追加: GitHub PR で開発者と相談
- データ分析: [11_looker_studio.md](./11_looker_studio.md) (任意)

---

## 🆘 それでも解決しない場合

以下を開発者に連絡:

1. **発生時刻** (JST)
2. **何をしたか** (操作手順)
3. **期待した結果**
4. **実際に起きたこと**
5. **エラーメッセージ全文**
6. **スクリーンショット**
7. Cloud Run ログ (直近100件を `gcloud logs read` で取得)
