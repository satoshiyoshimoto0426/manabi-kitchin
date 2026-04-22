/**
 * ドメインモデル型定義 (要件定義 第7章 データ要件 準拠)
 */

/** ロール定義 (第6章 6.1) */
export type Role = 'Owner' | 'Operator' | 'Accountant' | 'Viewer';

/** users コレクション */
export interface UserDoc {
  lineUserId: string;
  role: Role;
  displayName?: string;
  addedAt: string; // ISO8601
  addedBy?: string;
  active: boolean;
}

/** events コレクション */
export interface EventDoc {
  eventId: string;
  date: string; // YYYY-MM-DD
  adultCount: number;
  childCount: number;
  totalRevenue: number;
  totalCost: number;
  createdAt: string;
}

/** 勘定科目 (要件定義 第4章 FR-02) */
export type AccountCategory =
  | '食材費'
  | '消耗品費'
  | '交通費'
  | '雑費'
  | '会場費'
  | '謝礼費'
  | '収入';

/** transactions コレクション */
export interface TransactionDoc {
  txId: string;
  eventId?: string | null;
  type: 'income' | 'expense';
  category: AccountCategory | string;
  amount: number;
  vendor?: string;
  date: string;
  items?: string[];
  receiptUrl?: string;
  rawOcrText?: string;
  confidence: number;
  approvedBy: string;
  approvedAt: string;
  syncedToSheets: boolean;
  syncedAt?: string;
  // EX-08 重複検出用
  dedupKey: string;
}

/** participants コレクション */
export interface ParticipantDoc {
  participantId: string;
  nameHash: string;
  nameEncrypted: string;
  category: 'adult' | 'child';
  firstVisit: string;
  lastVisit: string;
  visitCount: number;
}

/** media コレクション (メディア原本メタデータ) */
export interface MediaDoc {
  mediaId: string;
  lineUserId: string;
  messageId: string;
  contentType: string;
  originalUrl: string; // GCS 署名付き URL or path
  classification: 'receipt' | 'roster' | 'event_photo' | 'unknown';
  confidence: number;
  status:
    | 'received'
    | 'classifying'
    | 'processing'
    | 'pending_approval'
    | 'approved'
    | 'rejected'
    | 'error';
  receivedAt: string;
  updatedAt: string;
}

/** posts コレクション (SNS投稿履歴) */
export interface PostDoc {
  postId: string;
  channel: 'instagram';
  postType: 'feed' | 'reel' | 'story';
  mediaIds: string[];
  caption: string;
  status: 'draft' | 'approved' | 'published' | 'failed';
  igPostUrl?: string;
  approvedBy?: string;
  createdAt: string;
  publishedAt?: string;
}

/** pendingApprovals: 承認待ち (FR-09, EX-07) */
export interface PendingApprovalDoc {
  approvalId: string;
  kind: 'receipt' | 'roster' | 'post';
  lineUserId: string;
  payload: Record<string, unknown>; // 表示・実行内容のスナップショット
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string; // 48h
}
