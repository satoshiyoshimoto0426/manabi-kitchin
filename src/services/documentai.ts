/**
 * Google Document AI 連携
 * 要件定義 FR-02 レシート OCR / FR-04 名簿 OCR (手書き)
 * - 本番: Document AI の Receipt Processor / Custom Extractor を呼び出し
 * - モック: ルールベースでレシート・名簿テキストを生成
 */
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

export interface ReceiptOcrResult {
  vendor?: string;
  total: number;
  date?: string;
  items: string[];
  rawText: string;
  confidence: number;
}

export interface RosterEntry {
  name: string;
  category: 'adult' | 'child';
  fee?: number;
}
export interface RosterOcrResult {
  entries: RosterEntry[];
  rawText: string;
  confidence: number;
}

// ---------------- Receipt ----------------
export async function ocrReceipt(
  buffer: Buffer,
  mimeType: string,
): Promise<ReceiptOcrResult> {
  if (isMocked.docai()) return mockReceipt();
  return retry(
    async () => {
      const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
      const client = new DocumentProcessorServiceClient({
        apiEndpoint: `${env.docai.location}-documentai.googleapis.com`,
      });
      const name = `projects/${env.gcp.projectId}/locations/${env.docai.location}/processors/${env.docai.receiptProcessorId}`;
      const [result] = await client.processDocument({
        name,
        rawDocument: { content: buffer, mimeType },
      });
      const doc = result.document;
      return parseReceiptDoc(doc);
    },
    { label: 'docai.receipt', maxAttempts: 3 },
  );
}

function parseReceiptDoc(doc: any): ReceiptOcrResult {
  const rawText = String(doc?.text ?? '');
  let vendor: string | undefined;
  let total = 0;
  let date: string | undefined;
  const items: string[] = [];
  let maxConf = 0;

  const entities = doc?.entities ?? [];
  for (const e of entities) {
    const type = e.type ?? '';
    const val = (e.normalizedValue?.text ?? e.mentionText ?? '').toString();
    const conf = Number(e.confidence ?? 0);
    maxConf = Math.max(maxConf, conf);
    if (type === 'supplier_name') vendor = val;
    else if (type === 'total_amount') total = parseAmount(val);
    else if (type === 'receipt_date') date = val;
    else if (type === 'line_item' || type === 'line_item/description') items.push(val);
  }
  // fallback: テキストから合計抽出
  if (!total) total = extractTotalFromText(rawText);
  if (!date) date = extractDateFromText(rawText);

  return {
    vendor,
    total,
    date,
    items,
    rawText,
    confidence: maxConf || 0.75,
  };
}

function parseAmount(s: string): number {
  const n = s.replace(/[¥,円\s]/g, '');
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function extractTotalFromText(text: string): number {
  const m =
    text.match(/合計[^\d]{0,6}([\d,]+)/) ||
    text.match(/小計[^\d]{0,6}([\d,]+)/) ||
    text.match(/total[^\d]{0,6}([\d,]+)/i);
  if (m) return parseAmount(m[1]);
  return 0;
}
function extractDateFromText(text: string): string | undefined {
  const m =
    text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/) ||
    text.match(/(\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return undefined;
  const y = m[1].length === 2 ? '20' + m[1] : m[1];
  return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// ---------------- Roster ----------------
export async function ocrRoster(
  buffer: Buffer,
  mimeType: string,
): Promise<RosterOcrResult> {
  if (isMocked.docaiRoster()) return mockRoster();
  return retry(
    async () => {
      const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
      const client = new DocumentProcessorServiceClient({
        apiEndpoint: `${env.docai.location}-documentai.googleapis.com`,
      });
      const name = `projects/${env.gcp.projectId}/locations/${env.docai.location}/processors/${env.docai.rosterProcessorId}`;
      const [result] = await client.processDocument({
        name,
        rawDocument: { content: buffer, mimeType },
      });
      return parseRosterDoc(result.document);
    },
    { label: 'docai.roster', maxAttempts: 3 },
  );
}

function parseRosterDoc(doc: any): RosterOcrResult {
  const rawText = String(doc?.text ?? '');
  const entries: RosterEntry[] = [];
  let maxConf = 0;
  // Custom Extractor の想定スキーマ: name / category / fee
  for (const e of doc?.entities ?? []) {
    maxConf = Math.max(maxConf, Number(e.confidence ?? 0));
    if (e.type === 'participant' && e.properties) {
      const name = pickProp(e.properties, 'name');
      const category = pickProp(e.properties, 'category');
      const fee = Number(pickProp(e.properties, 'fee') ?? 0) || undefined;
      if (name) {
        entries.push({
          name,
          category: /子|こども|小学|child/i.test(category ?? '') ? 'child' : 'adult',
          fee,
        });
      }
    }
  }
  // 抽出ゼロの場合は行ごとに簡易推測
  if (entries.length === 0) {
    for (const line of rawText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.length > 30) continue;
      if (/氏名|お名前|区分|料金/.test(t)) continue;
      const isChild = /子|こども|小学|中学|幼/.test(t);
      const nameMatch = t.match(/^[^\d￥¥\s]+/);
      if (nameMatch && nameMatch[0].length >= 2) {
        entries.push({ name: nameMatch[0], category: isChild ? 'child' : 'adult' });
      }
    }
  }
  return { entries, rawText, confidence: maxConf || 0.72 };
}

function pickProp(props: any[], type: string): string | undefined {
  const p = props.find((x: any) => x.type === type);
  return p?.mentionText ?? p?.normalizedValue?.text;
}

// ---------------- MOCK ----------------
function mockReceipt(): ReceiptOcrResult {
  const today = new Date().toISOString().slice(0, 10);
  return {
    vendor: '○○スーパー',
    total: 4820,
    date: today,
    items: ['米5kg', '人参3本', '玉ねぎ2kg', '牛乳1L', '豆腐'],
    rawText: '○○スーパー\n米5kg ¥2,480\n人参 ¥350\n玉ねぎ ¥480\n牛乳 ¥290\n豆腐 ¥120\n小計 ¥3,720\n合計 ¥4,820',
    confidence: 0.93,
  };
}

function mockRoster(): RosterOcrResult {
  return {
    entries: [
      { name: '山田太郎', category: 'adult', fee: 300 },
      { name: '山田花子', category: 'child', fee: 100 },
      { name: '佐藤一郎', category: 'child', fee: 100 },
      { name: '鈴木さくら', category: 'child', fee: 100 },
      { name: '田中健', category: 'adult', fee: 300 },
    ],
    rawText: 'mock roster 5 entries',
    confidence: 0.88,
  };
}
