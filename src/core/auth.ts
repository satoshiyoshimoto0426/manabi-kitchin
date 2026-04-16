/**
 * ホワイトリスト認証 (第6章 6.3)
 * - LINE User ID が users コレクションに存在 かつ active=true のみ受付
 * - 未登録は EX-10 として「権限がありません」を返す
 * - 初回ブートストラップ: users が空のとき、最初に送信したユーザーを Owner として自動登録
 */
import { store } from '../services/store';
import { getProfile } from '../services/lineClient';
import { logger } from '../utils/logger';
import type { Role, UserDoc } from '../types/domain';

export interface AuthResult {
  allowed: boolean;
  user?: UserDoc;
  reason?: 'unregistered' | 'inactive' | 'bootstrap_owner';
}

export async function authorize(lineUserId: string): Promise<AuthResult> {
  const all = await store.users.list();
  if (all.length === 0) {
    // bootstrap: 最初のユーザーを Owner として自動登録
    const profile = await getProfile(lineUserId);
    const u: UserDoc = {
      lineUserId,
      role: 'Owner',
      displayName: profile?.displayName,
      addedAt: new Date().toISOString(),
      addedBy: 'system:bootstrap',
      active: true,
    };
    await store.users.upsert(u);
    logger.info('bootstrap: first user registered as Owner', { lineUserId });
    return { allowed: true, user: u, reason: 'bootstrap_owner' };
  }
  const u = await store.users.get(lineUserId);
  if (!u) return { allowed: false, reason: 'unregistered' };
  if (!u.active) return { allowed: false, reason: 'inactive' };
  return { allowed: true, user: u };
}

export async function addUser(
  lineUserId: string,
  role: Role,
  addedBy: string,
  displayName?: string,
) {
  const u: UserDoc = {
    lineUserId,
    role,
    displayName,
    addedAt: new Date().toISOString(),
    addedBy,
    active: true,
  };
  await store.users.upsert(u);
  return u;
}

export async function disableUser(lineUserId: string) {
  const u = await store.users.get(lineUserId);
  if (!u) return null;
  u.active = false;
  await store.users.upsert(u);
  return u;
}

/** 権限マトリクス (第6章 6.2) */
const MATRIX: Record<string, Role[]> = {
  'media.send': ['Owner', 'Operator'],
  'tx.approve': ['Owner', 'Operator'],
  'ledger.edit': ['Owner', 'Accountant'],
  'roster.register': ['Owner', 'Operator'],
  'post.approve': ['Owner', 'Operator'],
  'users.manage': ['Owner'],
  'dashboard.view': ['Owner', 'Operator', 'Accountant', 'Viewer'],
  'data.export': ['Owner', 'Accountant'],
};
export function hasPermission(role: Role, action: keyof typeof MATRIX | string): boolean {
  const roles = MATRIX[action];
  if (!roles) return false;
  return roles.includes(role);
}
