/**
 * ManabiOps エントリポイント (Cloud Run 対応)
 * 要件定義 第5章 非機能要件: サーバーレス(Cloud Run)で稼働
 */
import express from 'express';
import { env, isMocked } from './config/env';
import { logger } from './utils/logger';
import { handleWebhook } from './line/webhook';
import { adminRouter } from './admin/router';
import { runHourlyBatch } from './core/batch';

const app = express();

// LINE Webhook の署名検証用に raw body を保持
app.use(
  '/webhook',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
    limit: '10mb',
  }),
);

// 他エンドポイント用 JSON パーサ
app.use(express.json({ limit: '10mb' }));

// --- LINE Webhook ---
app.post('/webhook', handleWebhook);

// --- Health Check ---
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    mode: env.mockMode ? 'mock' : 'production',
    services: {
      line: !isMocked.line(),
      gemini: !isMocked.gemini(),
      docai: !isMocked.docai(),
      firestore: !isMocked.firestore(),
      sheets: !isMocked.sheets(),
      gcs: !isMocked.gcs(),
      ig: !isMocked.ig(),
    },
    time: new Date().toISOString(),
  });
});

// --- Batch Tasks (Cloud Scheduler から呼ぶ) ---
app.post('/tasks/hourly', async (_req, res) => {
  try {
    const r = await runHourlyBatch();
    res.json({ ok: true, result: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// --- Admin UI ---
app.use('/admin', adminRouter);

// --- Root ---
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>ManabiOps</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,'Hiragino Sans',sans-serif;max-width:720px;margin:40px auto;padding:20px;color:#333;line-height:1.8;}
h1{color:#ff9a3c;}
code{background:#f5f5f5;padding:2px 6px;border-radius:3px;}
.mode{display:inline-block;padding:4px 12px;border-radius:4px;background:${env.mockMode ? '#fff3cd' : '#d4edda'};color:${env.mockMode ? '#856404' : '#155724'};}
.card{background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-bottom:16px;}
a.button{display:inline-block;padding:8px 20px;background:#ff9a3c;color:white;border-radius:4px;text-decoration:none;margin-right:8px;}
</style></head><body>
<h1>🍙 ManabiOps</h1>
<p><span class="mode">モード: ${env.mockMode ? 'MOCK (開発)' : 'PRODUCTION'}</span></p>
<div class="card">
  <p>まなびキッチン運営支援システム (ManabiOps) がセットアップされました。</p>
  <ul>
    <li><b>LINE Webhook:</b> <code>POST /webhook</code></li>
    <li><b>ヘルスチェック:</b> <a href="/healthz">/healthz</a></li>
    <li><b>管理画面:</b> <a href="/admin" class="button">/admin</a> (Basic認証)</li>
    <li><b>バッチ (Cloud Scheduler用):</b> <code>POST /tasks/hourly</code></li>
  </ul>
</div>
<div class="card">
  <h2>セットアップ</h2>
  <ol>
    <li>LINE Developers で Messaging API チャネルを作成し <code>Channel Secret / Access Token</code> を取得</li>
    <li>Webhook URL に <code>${env.nodeEnv === 'production' ? 'https://YOUR-RUN-URL' : 'このサーバーのURL'}/webhook</code> を設定</li>
    <li>初めてメッセージを送ったユーザーが自動的に Owner として登録されます</li>
    <li>詳細は <code>README.md</code> を参照</li>
  </ol>
</div>
</body></html>`);
});

const port = env.port;
app.listen(port, () => {
  logger.info('ManabiOps started', {
    port,
    mockMode: env.mockMode,
    nodeEnv: env.nodeEnv,
  });
});
