/**
 * 環境変数ローダー
 * 要件定義書 第5章「API キーや Secret は Google Secret Manager で管理」に準拠
 * ローカル開発時は .env / 本番は Secret Manager から注入 (Cloud Run 環境変数)
 */
import * as dotenv from 'dotenv';
dotenv.config();

function toBool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function toNumber(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const env = {
  port: toNumber(process.env.PORT, 8080),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /**
   * モード:
   *  - MOCK_MODE=true または 必要な外部キー未設定 → MOCK動作
   *  - それ以外 → 本番モード (各外部APIを実呼び出し)
   */
  mockMode: toBool(process.env.MOCK_MODE, false),

  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
  },

  gcp: {
    projectId: process.env.GCP_PROJECT_ID ?? '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  },

  docai: {
    location: process.env.DOCAI_LOCATION ?? 'us',
    receiptProcessorId: process.env.DOCAI_RECEIPT_PROCESSOR_ID ?? '',
    rosterProcessorId: process.env.DOCAI_ROSTER_PROCESSOR_ID ?? '',
  },

  firestore: {
    databaseId: process.env.FIRESTORE_DATABASE_ID ?? '(default)',
  },

  gcs: {
    mediaBucket: process.env.GCS_BUCKET_MEDIA ?? '',
  },

  sheets: {
    spreadsheetId: process.env.SHEETS_SPREADSHEET_ID ?? '',
    ledgerName: process.env.SHEETS_LEDGER_NAME ?? '会計台帳',
  },

  ig: {
    businessAccountId: process.env.IG_BUSINESS_ACCOUNT_ID ?? '',
    accessToken: process.env.IG_ACCESS_TOKEN ?? '',
  },

  security: {
    participantHashSalt: process.env.PARTICIPANT_HASH_SALT ?? 'dev-salt',
    participantEncKeyHex:
      process.env.PARTICIPANT_ENC_KEY ??
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    adminUser: process.env.ADMIN_USER ?? 'admin',
    adminPassword: process.env.ADMIN_PASSWORD ?? 'manabi-admin',
  },

  ocr: {
    confidenceThreshold: Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? '0.70'),
  },

  owner: {
    email: process.env.OWNER_EMAIL ?? '',
  },
};

/**
 * 外部サービス別の MOCK 判定
 * 明示的に MOCK_MODE=true なら常にMOCK。
 * そうでない場合、必要キーが揃っていなければ該当サービスのみMOCK動作。
 */
export const isMocked = {
  line: () => env.mockMode || !env.line.channelSecret || !env.line.channelAccessToken,
  gemini: () => env.mockMode || !env.gemini.apiKey,
  docai: () =>
    env.mockMode || !env.gcp.projectId || !env.docai.receiptProcessorId,
  docaiRoster: () =>
    env.mockMode || !env.gcp.projectId || !env.docai.rosterProcessorId,
  firestore: () => env.mockMode || !env.gcp.projectId,
  sheets: () => env.mockMode || !env.sheets.spreadsheetId,
  gcs: () => env.mockMode || !env.gcs.mediaBucket,
  ig: () => env.mockMode || !env.ig.businessAccountId || !env.ig.accessToken,
};
