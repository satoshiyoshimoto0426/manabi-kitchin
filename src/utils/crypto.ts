/**
 * 氏名のハッシュ化・暗号化ユーティリティ
 * 要件定義 第5章「参加者氏名などの機微情報は Firestore 上で暗号化して保存」
 * 要件定義 第7章 participants.nameHash (SHA-256), nameEncrypted
 */
import * as crypto from 'crypto';
import { env } from '../config/env';

/** 氏名の正規化: 空白除去・NFKC */
export function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').trim();
}

/** 照合用 SHA-256 ハッシュ (ソルト付) */
export function hashName(name: string): string {
  const normalized = normalizeName(name);
  return crypto
    .createHmac('sha256', env.security.participantHashSalt)
    .update(normalized)
    .digest('hex');
}

/** AES-256-GCM 暗号化 */
export function encryptName(name: string): string {
  const key = Buffer.from(env.security.participantEncKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PARTICIPANT_ENC_KEY must be 32 bytes (64 hex chars)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(name, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv(12) + tag(16) + enc
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** AES-256-GCM 復号 */
export function decryptName(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const key = Buffer.from(env.security.participantEncKeyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** ランダム ID (nanoid 代替; Firestore ドキュメントID用) */
export function randomId(prefix = ''): string {
  return prefix + crypto.randomBytes(8).toString('hex');
}
