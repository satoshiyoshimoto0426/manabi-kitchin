/**
 * LINE Messaging API クライアント
 * 要件定義 第4章 FR-05, FR-09, 第8章 外部I/F, EX-03 (障害時リトライ)
 * モック時は console に詳細ログを出力し、配信処理を擬似成功させる
 */
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

let sdkClient: any = null;
function getSdk() {
  if (sdkClient) return sdkClient;
  if (isMocked.line()) return null;
  const { Client } = require('@line/bot-sdk');
  sdkClient = new Client({
    channelAccessToken: env.line.channelAccessToken,
    channelSecret: env.line.channelSecret,
  });
  return sdkClient;
}

export async function replyMessage(replyToken: string, messages: any[]): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK LINE reply]', { replyToken, messages });
    return;
  }
  await retry(() => getSdk().replyMessage(replyToken, messages), {
    label: 'line.reply',
    maxAttempts: 3,
  });
}

export async function pushMessage(to: string, messages: any[]): Promise<void> {
  if (isMocked.line()) {
    logger.info('[MOCK LINE push]', { to, messages });
    return;
  }
  await retry(() => getSdk().pushMessage(to, messages), {
    label: 'line.push',
    maxAttempts: 3,
  });
}

export async function getMessageContent(messageId: string): Promise<Buffer> {
  if (isMocked.line()) {
    // mock: 空画像を返す (PNG minimal)
    return Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082',
      'hex',
    );
  }
  const stream = await getSdk().getMessageContent(messageId);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function getProfile(lineUserId: string): Promise<{ displayName?: string } | null> {
  if (isMocked.line()) {
    return { displayName: `MockUser-${lineUserId.slice(-4)}` };
  }
  try {
    const p = await getSdk().getProfile(lineUserId);
    return { displayName: p.displayName };
  } catch {
    return null;
  }
}
