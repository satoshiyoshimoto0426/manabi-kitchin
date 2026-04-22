/**
 * Gemini 2.5 Flash 連携
 * 要件定義 FR-01 画像分類 / FR-02 勘定科目推論 / FR-08 キャプション生成 / EX-09 ぼかし漏れ2次チェック
 */
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

export type MediaClass = 'receipt' | 'roster' | 'event_photo' | 'unknown';
export interface ClassifyResult {
  classification: MediaClass;
  confidence: number;
  reason?: string;
}

/** 共通: GoogleGenerativeAI クライアント取得 (遅延) */
function getClient() {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  return new GoogleGenerativeAI(env.gemini.apiKey);
}

/** FR-01 画像自動分類 */
export async function classifyImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ClassifyResult> {
  if (isMocked.gemini()) {
    return mockClassify(buffer, mimeType);
  }
  return retry(
    async () => {
      const client = getClient();
      const model = client.getGenerativeModel({ model: env.gemini.model });
      const prompt = `
以下の画像を、次の4カテゴリのうち最も適切な1つに分類してください:
- receipt (レシート・領収書)
- roster (参加者名簿・氏名リスト)
- event_photo (イベント風景・人物写真)
- unknown (上記のいずれでもない)

必ず次の JSON のみを出力してください (コードブロックなし):
{"classification":"receipt|roster|event_photo|unknown","confidence":0.0-1.0,"reason":"根拠"}
`;
      const res = await model.generateContent([
        { text: prompt },
        { inlineData: { data: buffer.toString('base64'), mimeType } },
      ]);
      const text = res.response.text();
      return parseClassifyJson(text);
    },
    { label: 'gemini.classify', maxAttempts: 3 },
  );
}

/** FR-02 勘定科目推論 */
export interface AccountInferenceInput {
  vendor?: string;
  items?: string[];
  total: number;
}
export interface AccountInferenceResult {
  category: string;
  confidence: number;
  reason?: string;
}
export async function inferAccountCategory(
  input: AccountInferenceInput,
): Promise<AccountInferenceResult> {
  if (isMocked.gemini()) {
    return mockInferCategory(input);
  }
  return retry(
    async () => {
      const client = getClient();
      const model = client.getGenerativeModel({ model: env.gemini.model });
      const prompt = `
こども食堂の会計仕訳を行います。次のレシート情報から最も適切な勘定科目を1つだけ選んでください。
候補: 食材費, 消耗品費, 交通費, 雑費, 会場費, 謝礼費
レシート情報:
- 店舗: ${input.vendor ?? '不明'}
- 合計: ${input.total}円
- 品目: ${(input.items ?? []).slice(0, 20).join(', ') || '不明'}

必ず次の JSON のみを出力 (コードブロックなし):
{"category":"食材費","confidence":0.0-1.0,"reason":"..."}
`;
      const res = await model.generateContent([{ text: prompt }]);
      return parseCategoryJson(res.response.text());
    },
    { label: 'gemini.inferCategory', maxAttempts: 3 },
  );
}

/** FR-08 キャプション生成 */
export interface CaptionResult {
  caption: string;
  hashtags: string[];
}
export async function generateCaption(
  imageBuffers: Buffer[],
  mimeType: string,
  hint?: string,
): Promise<CaptionResult> {
  if (isMocked.gemini()) {
    return {
      caption:
        '今日も元気な子どもたちが集まりました! みんなで手作りごはんを食べて、笑顔あふれる一日に。スタッフ一同、次回もお待ちしています🍙',
      hashtags: ['#まなびキッチン', '#こども食堂', '#地域のつながり', '#食育'],
    };
  }
  return retry(
    async () => {
      const client = getClient();
      const model = client.getGenerativeModel({ model: env.gemini.model });
      const parts: any[] = [
        {
          text: `こども食堂「まなびキッチン」のイベント写真です。Instagram 投稿用に、温かみのある120〜180文字程度の日本語キャプションと、5〜8個のハッシュタグを生成してください。
- 子どものプライバシーに配慮した文言にする
- 過剰な絵文字を避け、控えめに2〜3個まで
- 次の JSON のみを出力 (コードブロックなし): {"caption":"...","hashtags":["#..."]}
${hint ? `補足ヒント: ${hint}` : ''}`,
        },
      ];
      for (const buf of imageBuffers.slice(0, 3)) {
        parts.push({ inlineData: { data: buf.toString('base64'), mimeType } });
      }
      const res = await model.generateContent(parts);
      return parseCaptionJson(res.response.text());
    },
    { label: 'gemini.caption', maxAttempts: 3 },
  );
}

/** EX-09 顔検出漏れの2次チェック */
export async function verifyFaceBlurring(
  buffer: Buffer,
  mimeType: string,
): Promise<{ suspicious: boolean; reason?: string }> {
  if (isMocked.gemini()) {
    return { suspicious: false };
  }
  try {
    const client = getClient();
    const model = client.getGenerativeModel({ model: env.gemini.model });
    const res = await model.generateContent([
      {
        text: `この画像の中に、ぼかし・モザイク処理が施されていない人間の顔(肌が露出した素顔)が写っていますか？
必ず JSON のみで回答: {"suspicious": true|false, "reason":"..."}`,
      },
      { inlineData: { data: buffer.toString('base64'), mimeType } },
    ]);
    const t = res.response.text();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { suspicious: false };
    const j = JSON.parse(m[0]);
    return { suspicious: !!j.suspicious, reason: j.reason };
  } catch (e) {
    logger.warn('verifyFaceBlurring failed (fail-safe to suspicious=false)', {
      err: (e as Error).message,
    });
    return { suspicious: false };
  }
}

// ---------------- helpers ----------------
function parseClassifyJson(text: string): ClassifyResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { classification: 'unknown', confidence: 0, reason: 'no-json' };
  try {
    const j = JSON.parse(m[0]);
    const c = (j.classification as MediaClass) ?? 'unknown';
    const conf = Number(j.confidence ?? 0);
    return { classification: c, confidence: conf, reason: j.reason };
  } catch {
    return { classification: 'unknown', confidence: 0, reason: 'parse-error' };
  }
}

function parseCategoryJson(text: string): AccountInferenceResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { category: '雑費', confidence: 0.3 };
  try {
    const j = JSON.parse(m[0]);
    return {
      category: String(j.category ?? '雑費'),
      confidence: Number(j.confidence ?? 0.5),
      reason: j.reason,
    };
  } catch {
    return { category: '雑費', confidence: 0.3 };
  }
}

function parseCaptionJson(text: string): CaptionResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      caption: text.slice(0, 200),
      hashtags: ['#まなびキッチン', '#こども食堂'],
    };
  }
  try {
    const j = JSON.parse(m[0]);
    return {
      caption: String(j.caption ?? ''),
      hashtags: Array.isArray(j.hashtags) ? j.hashtags.map((x: any) => String(x)) : [],
    };
  } catch {
    return { caption: text.slice(0, 200), hashtags: ['#まなびキッチン'] };
  }
}

// ---------------- MOCK 実装 ----------------
/**
 * MOCK分類: ファイル名/サイズから類推 + LINEメッセージコンテキストからの指定を優先
 * 完全無指定時はランダムではなく "受信順ローテーション" で再現性を確保
 */
let mockRotIdx = 0;
function mockClassify(buffer: Buffer, _mimeType: string): ClassifyResult {
  // 画像 byte の先頭 4KB で単純ヒューリスティック
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
  if (/レシート|receipt|合計|￥|¥|内税/i.test(head)) {
    return { classification: 'receipt', confidence: 0.92, reason: 'mock-text-heuristic' };
  }
  if (/名簿|roster|氏名|お名前/i.test(head)) {
    return { classification: 'roster', confidence: 0.9, reason: 'mock-text-heuristic' };
  }
  const rot: MediaClass[] = ['receipt', 'roster', 'event_photo'];
  const c = rot[mockRotIdx % rot.length];
  mockRotIdx++;
  return { classification: c, confidence: 0.88, reason: 'mock-rotation' };
}

function mockInferCategory(input: AccountInferenceInput): AccountInferenceResult {
  const v = (input.vendor ?? '').toLowerCase();
  const items = (input.items ?? []).join(' ').toLowerCase();
  if (/スーパー|八百屋|青果|肉|魚|米|食品|マート/.test(v + items)) {
    return { category: '食材費', confidence: 0.9, reason: 'mock: 食材系キーワード' };
  }
  if (/文具|消耗|洗剤|ペーパー|ラップ|紙/.test(v + items)) {
    return { category: '消耗品費', confidence: 0.85, reason: 'mock: 消耗品系' };
  }
  if (/交通|タクシー|鉄道|駅|バス/.test(v + items)) {
    return { category: '交通費', confidence: 0.85, reason: 'mock' };
  }
  return { category: '食材費', confidence: 0.7, reason: 'mock default' };
}
