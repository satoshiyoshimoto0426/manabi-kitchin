/**
 * 指数バックオフ付き再試行
 * 要件定義 EX-03 (LINE API 最大3回), EX-04 (Gemini 指数バックオフ3回)
 */
import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  label?: string;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const initialDelay = opts.initialDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const factor = opts.factor ?? 2;
  const label = opts.label ?? 'retry';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts) break;
      const delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
      logger.warn(`[${label}] attempt ${attempt} failed, retry in ${delay}ms`, {
        error: (e as Error)?.message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
