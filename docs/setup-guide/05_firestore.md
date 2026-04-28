# 05. Firestore データベース作成

> 所要時間: **15分**
> 費用: 無料枠 (1日2万書込まで無料) — まなびキッチン規模では **ほぼ¥0**
> このガイドで取得するもの: Firestore が使える状態 (取得する値は無し)

---

## 📝 このガイドでやること

Firestore は ManabiOps が **参加者名簿・取引履歴・承認待ちデータ** を保存するデータベースです。
ここではデータベースを作成し、セキュリティルールを設定します。

### ゴール

✅ `manabi-ops` プロジェクトに Firestore (ネイティブモード) が作成される
✅ リージョンは `asia-northeast1 (東京)`
✅ 初期セキュリティルールが設定される

---

## 🎯 重要な用語

| 用語 | 意味 |
|------|------|
| **コレクション** | データの「フォルダ」のようなもの (例: `participants` = 参加者一覧) |
| **ドキュメント** | 1件のレコード (例: 田中太郎さんの情報) |
| **ネイティブモード** | 今から作る標準モード (推奨) |
| **Datastore モード** | 旧方式 — **使いません** |

---

## Step 1. Firestore コンソールを開く

1. [GCP Console](https://console.cloud.google.com/) を開き、画面上部でプロジェクトが **`manabi-ops`** になっていることを確認
2. 画面左メニュー (☰) → **「Firestore」**
   - 左メニューに無い場合は、上部検索バーで `Firestore` と検索

---

## Step 2. データベースを作成

初回は「データベースを作成」画面が表示されます。

1. **「データベースを作成」** (Create database) をクリック
2. **モード選択** の画面で:
   - **「ネイティブモード」** を選択 (⭐ 必ずこちら)
   - ❌ 「Datastore モード」は選ばないでください
3. **「続行」** をクリック
4. **ロケーション** 選択で:
   - 種類: **「リージョン」** (Region)
   - リージョン: **`asia-northeast1 (Tokyo)`** ⭐ 東京を選択
   - ⚠ **ロケーションは後から変更できません** — 必ず東京を選択
5. **「データベースを作成」** をクリック
6. 1〜2分待つとデータベースが作成される

---

## Step 3. コレクションは自動作成される

ManabiOps のコードが動き出すと、以下のコレクションが自動的に作られます。
**この画面で手動作成する必要はありません**。

| コレクション名 | 用途 | 主なフィールド |
|---------------|------|--------------|
| `events` | イベント(こども食堂開催日) | `eventId`, `date`, `adultCount`, `childCount`, `totalRevenue` |
| `participants` | 参加者名簿 (氏名は暗号化) | `participantId`, `nameEncrypted`, `nameHash`, `category` |
| `transactions` | 収支記録 | `txId`, `date`, `type`, `amount`, `vendor`, `receiptUrl` |
| `media` | 受信した画像/動画 | `mediaId`, `type`, `gcsPath`, `uploadedBy` |
| `posts` | Instagram投稿 | `postId`, `caption`, `mediaIds`, `approvedBy` |
| `users` | LINE ホワイトリスト | `lineUserId`, `role`, `displayName` |
| `pendingApprovals` | 承認待ちデータ | `approvalId`, `type`, `payload`, `status` |

---

## Step 4. セキュリティルールを設定

**重要**: 初期状態では「30日後にすべて拒否」の仮ルールになっています。本番運用に合わせて変更します。

1. 左メニュー → **「ルール」** (Rules) タブ
2. 以下のルールをコピーして貼り付け:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ManabiOps のサーバーサイド (Cloud Run) からのみアクセス
    // サービスアカウント経由のアクセスは Admin SDK が使用するため
    // このルールに関係なく通る。クライアントからの直接アクセスは全て拒否。
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. **「公開」** (Publish) をクリック

> 💡 **なぜ全拒否でよいのか**:
> ManabiOps のサーバーは **Firebase Admin SDK** を使用します。Admin SDK はこのセキュリティルールを **バイパス** してアクセスできるため、サーバーは問題なく動作します。
> 一方、悪意のある第三者がブラウザから直接 Firestore にアクセスしようとしても、このルールで **100% 拒否** されます。

---

## Step 5. 動作確認

1. 左メニュー → **「データ」** (Data) タブに戻る
2. 画面上部に **「asia-northeast1」** と表示されていればOK
3. 空のコレクション一覧が表示されれば準備完了

---

## ✅ 完了チェック

- [ ] Firestore データベースが **ネイティブモード** で作成された
- [ ] ロケーションは **asia-northeast1** である
- [ ] セキュリティルールが「全拒否」で公開された
- [ ] エラー画面が表示されていない

---

## 📋 次のステップ

→ **[06_cloud_storage.md](./06_cloud_storage.md)** — Cloud Storage バケット作成へ進む

---

## 🆘 トラブルシューティング

### ❌ 「データベースを作成」ボタンがグレーアウトして押せない

- 請求アカウントがリンクされていない可能性 → [02_gcp_project.md Step 3](./02_gcp_project.md) を再確認
- API が未有効 → 上部検索バーで `Firestore API` → **有効にする**

### ❌ 「このロケーションには Firestore を作成できません」

- `asia-northeast1` を選んでいるか確認
- プロジェクト ID にスペースや日本語が含まれていないか確認

### ❌ 後からロケーションを変更したい

- **Firestore のロケーションは変更できません**
- 対処法: プロジェクトごと削除して `02` からやり直し (データが無い状態でのみ推奨)
