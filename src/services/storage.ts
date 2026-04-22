/**
 * メディア保存層 (Cloud Storage 抽象化)
 * - 本番: GCS バケットへ保存 + 署名付きURL
 * - モック: ローカル .mock-data/media/ へ保存
 * 要件定義 第6章「Cloud Storage 画像原本バケットは非公開設定。署名付き URL で一時アクセス」
 * 要件定義 第7章「画像原本: 1年間保持後、自動削除ライフサイクル」
 */
import * as fs from 'fs';
import * as path from 'path';
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';

export interface SavedMedia {
  mediaId: string;
  localPath?: string; // mock時
  gcsUri?: string; // 本番
  signedUrl: string; // 表示用
  contentType: string;
  bytes: number;
}

export async function saveMedia(
  mediaId: string,
  buffer: Buffer,
  contentType: string,
): Promise<SavedMedia> {
  if (isMocked.gcs()) {
    const dir = path.resolve(process.cwd(), '.mock-data', 'media');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = extFromMime(contentType);
    const file = path.join(dir, `${mediaId}${ext}`);
    fs.writeFileSync(file, buffer);
    const signedUrl = `/admin/media/${mediaId}${ext}`;
    logger.info('media saved (mock)', { mediaId, bytes: buffer.length, file });
    return { mediaId, localPath: file, signedUrl, contentType, bytes: buffer.length };
  }

  // 本番: GCS
  const { Storage } = require('@google-cloud/storage');
  const storage = new Storage({ projectId: env.gcp.projectId });
  const bucket = storage.bucket(env.gcs.mediaBucket);
  const ext = extFromMime(contentType);
  const objectName = `${new Date().toISOString().slice(0, 10)}/${mediaId}${ext}`;
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1h
    version: 'v4',
  });
  const gcsUri = `gs://${env.gcs.mediaBucket}/${objectName}`;
  logger.info('media saved (gcs)', { mediaId, gcsUri });
  return { mediaId, gcsUri, signedUrl, contentType, bytes: buffer.length };
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '.bin';
}

/** mock 保存パスから buffer 取得 (管理画面プレビュー用) */
export function readMockMedia(filename: string): Buffer | null {
  const dir = path.resolve(process.cwd(), '.mock-data', 'media');
  const p = path.join(dir, filename);
  if (!p.startsWith(dir)) return null; // path traversal guard
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
