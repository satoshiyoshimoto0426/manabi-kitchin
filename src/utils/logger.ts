/**
 * 構造化ログ (Cloud Logging 互換)
 * severity を付けた JSON 出力で、Cloud Run 上で自動的に Cloud Logging に取り込まれる
 */
type Severity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL';

function write(severity: Severity, message: string, meta?: Record<string, unknown>) {
  const entry = {
    severity,
    time: new Date().toISOString(),
    message,
    ...(meta ?? {}),
  };
  // Cloud Logging が severity フィールドを拾うように JSON 1行で出す
  const line = JSON.stringify(entry);
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('DEBUG', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('INFO', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('WARNING', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('ERROR', msg, meta),
  critical: (msg: string, meta?: Record<string, unknown>) => write('CRITICAL', msg, meta),
};
