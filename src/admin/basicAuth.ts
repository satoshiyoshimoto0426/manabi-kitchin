/**
 * 管理画面用 Basic 認証
 * (LINE で運用完結を原則とするが、設定作業/ダッシュボード補完用として提供)
 */
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.header('authorization') ?? '';
  if (!h.startsWith('Basic ')) return unauthorized(res);
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const [u, p] = decoded.split(':');
  if (u === env.security.adminUser && p === env.security.adminPassword) return next();
  return unauthorized(res);
}
function unauthorized(res: Response) {
  res.setHeader('WWW-Authenticate', 'Basic realm="ManabiOps Admin"');
  res.status(401).send('Authentication required');
}
