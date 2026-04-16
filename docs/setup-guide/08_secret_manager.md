# 08. Secret Manager にシークレット登録

> 所要時間: **20分**
> 費用: **月6シークレットまで無料** → **¥0** 想定
> このガイドで取得するもの: Cloud Run がシークレットを読み込める状態

---

## 📝 このガイドでやること

これまでのガイドで取得した **API キー・トークン等の機密情報** を、
GCP の金庫 (Secret Manager) に安全に保存します。

### ゴール

✅ 以下のシークレットがすべて登録される

| # | シークレット名 | 値 | どこで取得したか |
|---|--------------|----|----------------|
| 1 | `line-channel-secret` | LINE Channel Secret | [01](./01_line_messaging_api.md) |
| 2 | `line-channel-access-token` | LINE アクセストークン | [01](./01_line_messaging_api.md) |
| 3 | `gemini-api-key` | Gemini API キー | [03](./03_gemini_api.md) |
| 4 | `docai-receipt-processor-id` | レシートプロセッサID | [04](./04_document_ai.md) |
| 5 | `docai-roster-processor-id` | 名簿プロセッサID (Phase 2) | [04](./04_document_ai.md) |
| 6 | `sheets-spreadsheet-id` | Google Sheets ID | [07](./07_google_sheets.md) |
| 7 | `encryption-key` | 氏名暗号化用32バイトキー (新規生成) | このガイドで作成 |
| 8 | `admin-basic-auth` | 管理画面用 Basic認証 | このガイドで作成 |
| 9 | `ig-access-token` (Phase 3) | Instagram アクセストークン | [12](./12_instagram_graph_api.md) |
| 10 | `ig-business-account-id` (Phase 3) | Instagram ビジネスアカウントID | [12](./12_instagram_graph_api.md) |

✅ サービスアカウントにシークレット読取権限 (Secret Manager Secret Accessor) が付与される

---

## 🎯 なぜ Secret Manager を使うのか

要件定義書 **5.3 セキュリティ要件** より:
> 「APIキー・トークンは Secret Manager に保管し、ソースコードにベタ書きしない」

- ❌ `.env` ファイルにキーを書いて GitHub にアップロードする → 情報漏洩
- ✅ Secret Manager にキーを保管し、Cloud Run 実行時に安全に読み込み

---

## Step 1. Secret Manager を有効化

1. [GCP Console](https://console.cloud.google.com/) → プロジェクト `manabi-ops` を選択
2. 上部検索バーで **`Secret Manager`** を検索 → 開く
3. 「API を有効にする」画面が出たら **「有効にする」** をクリック (初回のみ)

---

## Step 2. シークレットを登録する共通手順

各シークレットで以下の手順を **繰り返します**。

### 共通手順

1. Secret Manager 画面上部の **「+ シークレットを作成」** をクリック
2. **名前** に上記表の「シークレット名」を入力 (例: `line-channel-secret`)
3. **シークレットの値** に実際の値 (例: LINE で取得した Channel Secret) を貼り付け
   - ⚠ 前後に空白や改行が入らないよう注意
4. その他の項目はデフォルトのまま
5. **「シークレットを作成」** をクリック

---

## Step 3. 各シークレットを登録

### ① `line-channel-secret`

- 値: [01_line_messaging_api.md](./01_line_messaging_api.md) で取得した **Channel Secret** (32文字)

### ② `line-channel-access-token`

- 値: [01_line_messaging_api.md](./01_line_messaging_api.md) で取得した **Channel Access Token** (長文字列)

### ③ `gemini-api-key`

- 値: [03_gemini_api.md](./03_gemini_api.md) で取得した **`AIza...`** で始まるキー

### ④ `docai-receipt-processor-id`

- 値: [04_document_ai.md](./04_document_ai.md) で取得した **レシート用プロセッサID** (例: `abc123...`)

### ⑤ `docai-roster-processor-id` (Phase 2 以降)

- 値: [04_document_ai.md](./04_document_ai.md) の **カスタムエクストラクタ (名簿) のID**
- Phase 2 まで未取得の場合は、仮に空文字 `""` で登録 (後で更新)

### ⑥ `sheets-spreadsheet-id`

- 値: [07_google_sheets.md](./07_google_sheets.md) で取得した **スプレッドシートID** (44文字)

### ⑦ `encryption-key` (新規生成)

要件定義書 **12章** の「参加者氏名の暗号化」に使います。以下の手順で **新規生成** してください。

#### 生成方法 (Mac/Linux)

ターミナルで以下を実行:
```bash
openssl rand -base64 32
```
出力される44文字の文字列 (例: `Kj8Fg9LmPq7Rs2Tu4VwX6YZ0aB1cD3eF5G7hI9jK=` ) をコピー。

#### 生成方法 (Windows)

PowerShell で以下を実行:
```powershell
[Convert]::ToBase64String((1..32 | %{[byte](Get-Random -Max 256)}))
```

#### 生成方法 (オンライン)

https://generate-random.org/encryption-key-generator → **256-bit** → **Base64** で生成

- ⚠ **このキーは絶対に再生成しない** (過去の参加者データが復号できなくなる)
- ⚠ キーを別途オフライン (USB等) にもバックアップ

### ⑧ `admin-basic-auth`

管理画面 (`/admin`) のBasic認証用。形式: `ユーザー名:パスワード`

- 値: `admin:【強固なパスワード16文字以上】`
- 例: `admin:Mk8pQ2xR9vN4zT7wL3y`
- パスワードは自分で決める (パスワードマネージャで生成推奨)

### ⑨ `ig-access-token` (Phase 3)

- 値: [12_instagram_graph_api.md](./12_instagram_graph_api.md) で取得
- Phase 3 実施まで未取得の場合、このシークレット登録はスキップ可

### ⑩ `ig-business-account-id` (Phase 3)

- 値: [12_instagram_graph_api.md](./12_instagram_graph_api.md) で取得
- Phase 3 まで未取得の場合、スキップ可

---

## Step 4. サービスアカウントに読取権限を付与

Cloud Run がこれらのシークレットを読めるように、
サービスアカウントに権限を付与します。

### 方法 A: 一括で全シークレットに権限付与 (推奨)

1. GCP Console → **IAM と管理** → **IAM**
2. **「+ アクセスを付与」** をクリック
3. 「新しいプリンシパル」にサービスアカウントのメールアドレスを入力:
   ```
   manabi-ops-sa@manabi-ops.iam.gserviceaccount.com
   ```
4. 「ロール」に **`Secret Manager Secret Accessor`** を選択
5. **「保存」**

### 方法 B: 各シークレットに個別付与

各シークレットを開いて「権限」タブから付与する方法もありますが、
方法Aの方が簡単で一貫性があります。

---

## Step 5. 設定確認

1. Secret Manager 画面で、以下のシークレットが **すべて** 存在することを確認:

| ✓ | シークレット名 |
|---|--------------|
| ☐ | line-channel-secret |
| ☐ | line-channel-access-token |
| ☐ | gemini-api-key |
| ☐ | docai-receipt-processor-id |
| ☐ | docai-roster-processor-id (またはスキップ) |
| ☐ | sheets-spreadsheet-id |
| ☐ | encryption-key |
| ☐ | admin-basic-auth |
| ☐ | ig-access-token (またはスキップ) |
| ☐ | ig-business-account-id (またはスキップ) |

2. いずれかのシークレットをクリック → **「バージョン」** タブに「Active」の行が1件以上あれば正常

---

## ✅ 完了チェック

- [ ] Secret Manager が有効化された
- [ ] Phase 1 必須の6シークレットが登録された
- [ ] `encryption-key` がオフラインバックアップされた
- [ ] サービスアカウントに `Secret Manager Secret Accessor` 権限付与済み

---

## 📋 次のステップ

→ **[09_cloud_run_deploy.md](./09_cloud_run_deploy.md)** — Cloud Run にアプリをデプロイへ進む

---

## 🆘 トラブルシューティング

### ❌ シークレット値を間違えて登録した

1. 該当シークレットを開く
2. **「+ 新しいバージョン」** をクリック
3. 正しい値を入力 → 保存
4. 古いバージョンは「無効化」できるが、新バージョンが自動で使われるため通常放置でOK

### ❌ サービスアカウントのメールアドレスが分からない

- GCP Console → **IAM と管理** → **サービス アカウント**
- 一覧から `manabi-ops-sa` を探して、メールアドレスをコピー

### ❌ Secret Manager APIが有効化できない

- 請求アカウントがリンクされているか [02_gcp_project.md](./02_gcp_project.md) で確認
- プロジェクトオーナー権限が自分のGoogleアカウントにあるか確認

### ❌ `encryption-key` を紛失した

- 既に暗号化した参加者氏名データが **永久に復号できなくなる** (⚠ 重大)
- 初期段階 (データが少ない) であれば、新キー生成 + Firestore `participants` コレクション削除で復旧可
- データ移行期の場合は、開発担当者に至急連絡
