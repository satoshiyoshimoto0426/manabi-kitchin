/**
 * 管理画面 (FR-12 簡易ダッシュボード + 6章 Owner のみホワイトリスト管理 + EX-11 ストレージ監視)
 * - ブラウザで /admin にアクセス (Basic認証)
 * - 要件定義は「日常運用は LINE 完結」だが、本画面はセットアップ・監査用
 */
import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { basicAuth } from './basicAuth';
import { store } from '../services/store';
import { addUser, disableUser } from '../core/auth';
import { generateMonthlySummary } from '../core/summary';
import { readMockLedger } from '../services/sheets';
import { decryptName } from '../utils/crypto';
import { env, isMocked } from '../config/env';
import type { Role } from '../types/domain';

export const adminRouter = Router();
adminRouter.use(basicAuth);

// ---------- Dashboard (FR-12) ----------
adminRouter.get('/', async (_req, res) => {
  const summary = await generateMonthlySummary();
  const users = await store.users.list();
  const pendings = await store.pendingApprovals.list((a) => a.status === 'pending');
  const txs = (await store.transactions.list()).slice(-10).reverse();
  const events = await store.events.list();
  const media = await store.media.list();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderDashboard({ summary, users, pendings, txs, events, media }));
});

// ---------- Users (6章) ----------
adminRouter.get('/users', async (_req, res) => {
  const users = await store.users.list();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderUsers(users));
});

adminRouter.post('/users/add', express_urlencoded, async (req: any, res) => {
  const { lineUserId, role, displayName } = req.body ?? {};
  if (!lineUserId || !role) return res.redirect('/admin/users?error=missing');
  await addUser(String(lineUserId), String(role) as Role, 'admin', displayName);
  res.redirect('/admin/users');
});

adminRouter.post('/users/disable', express_urlencoded, async (req: any, res) => {
  const { lineUserId } = req.body ?? {};
  if (lineUserId) await disableUser(String(lineUserId));
  res.redirect('/admin/users');
});

// ---------- Participants (閲覧のみ) ----------
adminRouter.get('/participants', async (_req, res) => {
  const participants = await store.participants.list();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderParticipants(participants));
});

// ---------- Transactions ----------
adminRouter.get('/transactions', async (_req, res) => {
  const txs = await store.transactions.list();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderTransactions(txs));
});

// ---------- CSV Export (7.3 データ保持・FAQ: エクスポート) ----------
adminRouter.get('/export/transactions.csv', async (_req, res) => {
  const txs = await store.transactions.list();
  const header = 'txId,date,type,category,amount,vendor,syncedToSheets\n';
  const body = txs
    .map(
      (t) =>
        `${t.txId},${t.date},${t.type},${csv(t.category)},${t.amount},${csv(t.vendor ?? '')},${t.syncedToSheets}`,
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(header + body);
});

adminRouter.get('/ledger.csv', (_req, res) => {
  const csvText = readMockLedger();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csvText || '(no rows yet)');
});

// ---------- Media preview (mock mode) ----------
adminRouter.get('/media/:filename', (req, res) => {
  const dir = path.resolve(process.cwd(), '.mock-data', 'media');
  const p = path.join(dir, req.params.filename);
  if (!p.startsWith(dir) || !fs.existsSync(p)) return res.status(404).send('not found');
  res.sendFile(p);
});

// ---------- Webhook 疎通デバッグ ----------
adminRouter.post(
  '/debug/send',
  express_urlencoded,
  async (req: any, res) => {
    // テスト用: 疑似レシート/名簿/写真を指定ユーザーに向けて処理
    const { userId, kind } = req.body ?? {};
    if (!userId || !kind) return res.status(400).send('userId and kind required');
    const { randomId } = await import('../utils/crypto');
    const { processReceipt } = await import('../core/receiptPipeline');
    const { processRoster } = await import('../core/rosterPipeline');
    const { processEventPhoto } = await import('../core/photoPipeline');
    const media = {
      mediaId: randomId('md_'),
      lineUserId: String(userId),
      messageId: 'debug',
      contentType: 'image/jpeg',
      originalUrl: '',
      classification: kind as any,
      confidence: 1,
      status: 'processing' as const,
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.media.upsert(media);
    const buffer = Buffer.from('mock', 'utf8');
    const args = { media, buffer, mimeType: 'image/jpeg', replyToken: '', lineUserId: String(userId) };
    if (kind === 'receipt') await processReceipt(args);
    else if (kind === 'roster') await processRoster(args);
    else if (kind === 'event_photo') await processEventPhoto(args);
    res.redirect('/admin');
  },
);

// ---------------- render helpers ----------------
function renderDashboard(data: any): string {
  const { summary, users, pendings, txs, events, media } = data;
  return layout(
    'Dashboard',
    `
    <h1>📊 ManabiOps ダッシュボード</h1>
    <p class="mode ${isMocked.firestore() ? 'mock' : 'prod'}">
      モード: ${isMocked.firestore() ? 'MOCK (ローカル)' : 'PRODUCTION (GCP)'}
    </p>

    <div class="grid">
      <section class="card">
        <h2>当月サマリ (${summary.yearMonth})</h2>
        <div class="kv"><span>収入</span><b>¥${summary.totalIncome.toLocaleString()}</b></div>
        <div class="kv"><span>支出</span><b>¥${summary.totalExpense.toLocaleString()}</b></div>
        <div class="kv"><span>残高</span><b class="${summary.balance >= 0 ? 'pos' : 'neg'}">¥${summary.balance.toLocaleString()}</b></div>
        <div class="kv"><span>開催回数</span><b>${summary.eventCount}回</b></div>
        <div class="kv"><span>大人/こども</span><b>${summary.adultCount} / ${summary.childCount}</b></div>
        <h3>支出カテゴリ</h3>
        <ul>${(summary.byCategory as any[])
          .map((c: any) => `<li>${esc(c.category)}: ¥${c.amount.toLocaleString()}</li>`)
          .join('') || '<li>(該当なし)</li>'}</ul>
      </section>

      <section class="card">
        <h2>⏳ 承認待ち (${pendings.length}件)</h2>
        <ul>
          ${pendings
            .slice(0, 10)
            .map((a: any) => `<li><code>${esc(a.kind)}</code> by ${esc(a.lineUserId.slice(0, 10))}… <small>${esc(a.createdAt)}</small></li>`)
            .join('') || '<li>なし</li>'}
        </ul>
      </section>

      <section class="card">
        <h2>👤 ユーザー (${users.length})</h2>
        <ul>
          ${users
            .map(
              (u: any) =>
                `<li><b>${esc(u.role)}</b> ${esc(u.displayName ?? '')} <small>${esc(u.lineUserId.slice(0, 12))}…</small> ${u.active ? '' : '<span class=neg>[無効]</span>'}</li>`,
            )
            .join('')}
        </ul>
        <p><a href="/admin/users">管理 →</a></p>
      </section>

      <section class="card">
        <h2>📜 最近の取引</h2>
        <table>
          <tr><th>日付</th><th>種別</th><th>科目</th><th>金額</th><th>店舗</th><th>Sheets</th></tr>
          ${txs
            .map(
              (t: any) =>
                `<tr><td>${esc(t.date)}</td><td>${t.type}</td><td>${esc(t.category)}</td><td class=num>¥${t.amount.toLocaleString()}</td><td>${esc(t.vendor ?? '')}</td><td>${t.syncedToSheets ? '✅' : '⏳'}</td></tr>`,
            )
            .join('') || '<tr><td colspan=6>(データなし)</td></tr>'}
        </table>
        <p><a href="/admin/transactions">全件 →</a> | <a href="/admin/export/transactions.csv">CSV</a> | <a href="/admin/ledger.csv">会計台帳CSV</a></p>
      </section>

      <section class="card">
        <h2>📅 イベント (${events.length})</h2>
        <ul>
          ${events
            .slice(-10)
            .reverse()
            .map(
              (e: any) =>
                `<li>${esc(e.date)} — 大人${e.adultCount}/こども${e.childCount} (収入¥${e.totalRevenue.toLocaleString()})</li>`,
            )
            .join('') || '<li>なし</li>'}
        </ul>
      </section>

      <section class="card">
        <h2>🖼 メディア (${media.length}件)</h2>
        <p>受信メディアの最新状態:</p>
        <ul>
          ${media
            .slice(-10)
            .reverse()
            .map(
              (m: any) =>
                `<li>[${esc(m.classification)}] conf=${(m.confidence * 100).toFixed(0)}% <code>${esc(m.status)}</code></li>`,
            )
            .join('') || '<li>なし</li>'}
        </ul>
      </section>

      <section class="card">
        <h2>🧪 デバッグ送信</h2>
        <form method="post" action="/admin/debug/send">
          <input name="userId" placeholder="LINE User ID" required style="width:100%">
          <select name="kind">
            <option value="receipt">receipt</option>
            <option value="roster">roster</option>
            <option value="event_photo">event_photo</option>
          </select>
          <button>疑似送信</button>
        </form>
        <p><small>※ Mock 時のみ動作確認用。本番では LINE からの実送信を推奨。</small></p>
      </section>
    </div>
  `,
  );
}

function renderUsers(users: any[]): string {
  return layout(
    'Users',
    `
  <h1>👤 ホワイトリスト管理</h1>
  <p><a href="/admin">← Dashboard</a></p>
  <table>
    <tr><th>LINE User ID</th><th>ロール</th><th>表示名</th><th>追加日時</th><th>状態</th><th>操作</th></tr>
    ${users
      .map(
        (u: any) => `
      <tr>
        <td><code>${esc(u.lineUserId)}</code></td>
        <td>${esc(u.role)}</td>
        <td>${esc(u.displayName ?? '')}</td>
        <td><small>${esc(u.addedAt)}</small></td>
        <td>${u.active ? '✅' : '<span class=neg>無効</span>'}</td>
        <td>
          ${u.active ? `<form method="post" action="/admin/users/disable" style="display:inline"><input type=hidden name=lineUserId value="${esc(u.lineUserId)}"><button>無効化</button></form>` : ''}
        </td>
      </tr>`,
      )
      .join('')}
  </table>
  <h2>追加</h2>
  <form method="post" action="/admin/users/add">
    <input name="lineUserId" placeholder="LINE User ID (Uxxxx...)" required>
    <select name="role">
      <option value="Owner">Owner</option>
      <option value="Operator" selected>Operator</option>
      <option value="Accountant">Accountant</option>
      <option value="Viewer">Viewer</option>
    </select>
    <input name="displayName" placeholder="表示名">
    <button>追加</button>
  </form>
  `,
  );
}

function renderParticipants(ps: any[]): string {
  return layout(
    'Participants',
    `
  <h1>🧒 参加者マスタ</h1>
  <p><a href="/admin">← Dashboard</a> ｜ 全 ${ps.length} 名 (氏名は暗号化保存、表示時に復号)</p>
  <table>
    <tr><th>氏名</th><th>区分</th><th>初回</th><th>最終</th><th>回数</th></tr>
    ${ps
      .map((p) => {
        let name = '(復号失敗)';
        try {
          name = decryptName(p.nameEncrypted);
        } catch {
          /* ignore */
        }
        return `<tr><td>${esc(name)}</td><td>${esc(p.category)}</td><td>${esc(p.firstVisit)}</td><td>${esc(p.lastVisit)}</td><td class=num>${p.visitCount}</td></tr>`;
      })
      .join('') || '<tr><td colspan=5>なし</td></tr>'}
  </table>
  `,
  );
}

function renderTransactions(txs: any[]): string {
  return layout(
    'Transactions',
    `
  <h1>💴 取引一覧</h1>
  <p><a href="/admin">← Dashboard</a> ｜ <a href="/admin/export/transactions.csv">CSVダウンロード</a></p>
  <table>
    <tr><th>日付</th><th>種別</th><th>科目</th><th>金額</th><th>店舗</th><th>信頼度</th><th>Sheets</th></tr>
    ${txs
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(
        (t) =>
          `<tr><td>${esc(t.date)}</td><td>${t.type}</td><td>${esc(t.category)}</td><td class=num>¥${t.amount.toLocaleString()}</td><td>${esc(t.vendor ?? '')}</td><td>${(t.confidence * 100).toFixed(0)}%</td><td>${t.syncedToSheets ? '✅' : '⏳'}</td></tr>`,
      )
      .join('') || '<tr><td colspan=7>なし</td></tr>'}
  </table>
  `,
  );
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="ja"><head>
  <meta charset="utf-8">
  <title>${esc(title)} - ManabiOps</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { --primary:#ff9a3c; --bg:#fffaf4; --card:#ffffff; --text:#333; --muted:#888; }
    body { margin:0; font-family:-apple-system, 'Hiragino Sans', sans-serif; background:var(--bg); color:var(--text); }
    h1 { padding:16px 20px; margin:0; background:var(--primary); color:white; }
    h2 { border-bottom:2px solid var(--primary); padding-bottom:4px; margin-top:0; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; padding:20px; }
    .card { background:var(--card); padding:16px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.06); }
    .kv { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dotted #eee; }
    .kv b { color:var(--primary); }
    .kv b.neg { color:#c00; }
    .kv b.pos { color:#060; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { padding:6px 8px; border-bottom:1px solid #eee; text-align:left; }
    td.num, th.num { text-align:right; }
    .mode { margin: 0 20px; padding: 6px 10px; border-radius: 4px; display: inline-block; }
    .mode.mock { background:#fff3cd; color:#856404; }
    .mode.prod { background:#d4edda; color:#155724; }
    form { margin-top:10px; }
    form input, form select { padding:6px; margin-right:6px; }
    button { background:var(--primary); color:white; border:0; padding:6px 12px; border-radius:4px; cursor:pointer; }
    button:hover { opacity:0.9; }
    code { background:#f5f5f5; padding:1px 4px; border-radius:3px; font-size:12px; }
    .neg { color:#c00; }
    ul { padding-left: 20px; }
    a { color:var(--primary); text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
  </head><body>
    ${body}
  </body></html>`;
}

function esc(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// urlencoded middleware (express を lazy import せずに済むよう簡易ラッパ)
function express_urlencoded(req: any, res: any, next: any) {
  const express = require('express');
  return express.urlencoded({ extended: true })(req, res, next);
}
