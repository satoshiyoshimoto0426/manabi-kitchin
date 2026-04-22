/**
 * データストア抽象化層
 * - 本番: Firestore
 * - モック: インメモリ + ローカル JSON 永続化 (.mock-data/)
 * 要件定義 第6章 6.4「すべてのコレクションはサーバー側からのみ書き込み可能」に対応
 *          (= クライアント直アクセスなし・本ファイル経由でのみアクセス)
 */
import * as fs from 'fs';
import * as path from 'path';
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';
import type {
  UserDoc,
  EventDoc,
  TransactionDoc,
  ParticipantDoc,
  MediaDoc,
  PostDoc,
  PendingApprovalDoc,
} from '../types/domain';

type Collection =
  | 'users'
  | 'events'
  | 'transactions'
  | 'participants'
  | 'media'
  | 'posts'
  | 'pendingApprovals';

interface Store {
  upsert<T extends { [k: string]: any }>(col: Collection, id: string, doc: T): Promise<T>;
  get<T>(col: Collection, id: string): Promise<T | null>;
  list<T>(col: Collection, filter?: (d: T) => boolean): Promise<T[]>;
  delete(col: Collection, id: string): Promise<void>;
}

// ---------------- Mock Store (ローカルJSON) ----------------
class MockStore implements Store {
  private baseDir = path.resolve(process.cwd(), '.mock-data');
  private cache: Record<string, Record<string, any>> = {};

  constructor() {
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
  }
  private file(col: Collection) {
    return path.join(this.baseDir, `${col}.json`);
  }
  private load(col: Collection): Record<string, any> {
    if (this.cache[col]) return this.cache[col];
    const f = this.file(col);
    if (fs.existsSync(f)) {
      try {
        this.cache[col] = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        this.cache[col] = {};
      }
    } else {
      this.cache[col] = {};
    }
    return this.cache[col];
  }
  private persist(col: Collection) {
    fs.writeFileSync(this.file(col), JSON.stringify(this.cache[col] ?? {}, null, 2), 'utf8');
  }
  async upsert<T extends { [k: string]: any }>(col: Collection, id: string, doc: T): Promise<T> {
    const data = this.load(col);
    data[id] = { ...doc };
    this.persist(col);
    return doc;
  }
  async get<T>(col: Collection, id: string): Promise<T | null> {
    const data = this.load(col);
    return (data[id] as T) ?? null;
  }
  async list<T>(col: Collection, filter?: (d: T) => boolean): Promise<T[]> {
    const data = this.load(col);
    const values = Object.values(data) as T[];
    return filter ? values.filter(filter) : values;
  }
  async delete(col: Collection, id: string): Promise<void> {
    const data = this.load(col);
    delete data[id];
    this.persist(col);
  }
}

// ---------------- Firestore Store (本番) ----------------
class FirestoreStore implements Store {
  private fs: any;
  constructor() {
    // 遅延ロードで mock モード時は @google-cloud/firestore を読み込まない
    const { Firestore } = require('@google-cloud/firestore');
    this.fs = new Firestore({
      projectId: env.gcp.projectId,
      databaseId: env.firestore.databaseId,
    });
  }
  async upsert<T extends { [k: string]: any }>(col: Collection, id: string, doc: T): Promise<T> {
    await this.fs.collection(col).doc(id).set(doc, { merge: true });
    return doc;
  }
  async get<T>(col: Collection, id: string): Promise<T | null> {
    const snap = await this.fs.collection(col).doc(id).get();
    return (snap.exists ? (snap.data() as T) : null) ?? null;
  }
  async list<T>(col: Collection, filter?: (d: T) => boolean): Promise<T[]> {
    const snap = await this.fs.collection(col).get();
    const arr: T[] = [];
    snap.forEach((d: any) => arr.push(d.data() as T));
    return filter ? arr.filter(filter) : arr;
  }
  async delete(col: Collection, id: string): Promise<void> {
    await this.fs.collection(col).doc(id).delete();
  }
}

// ---------------- Facade ----------------
const backend: Store = isMocked.firestore() ? new MockStore() : new FirestoreStore();
logger.info('Store backend initialized', { backend: isMocked.firestore() ? 'mock' : 'firestore' });

export const store = {
  // --- users (ホワイトリスト) ---
  users: {
    upsert: (u: UserDoc) => backend.upsert('users', u.lineUserId, u),
    get: (lineUserId: string) => backend.get<UserDoc>('users', lineUserId),
    list: () => backend.list<UserDoc>('users'),
    delete: (lineUserId: string) => backend.delete('users', lineUserId),
  },
  events: {
    upsert: (e: EventDoc) => backend.upsert('events', e.eventId, e),
    get: (id: string) => backend.get<EventDoc>('events', id),
    list: () => backend.list<EventDoc>('events'),
  },
  transactions: {
    upsert: (t: TransactionDoc) => backend.upsert('transactions', t.txId, t),
    get: (id: string) => backend.get<TransactionDoc>('transactions', id),
    list: (filter?: (t: TransactionDoc) => boolean) =>
      backend.list<TransactionDoc>('transactions', filter),
    findByDedup: async (dedupKey: string) => {
      const all = await backend.list<TransactionDoc>('transactions');
      return all.find((t) => t.dedupKey === dedupKey) ?? null;
    },
  },
  participants: {
    upsert: (p: ParticipantDoc) => backend.upsert('participants', p.participantId, p),
    get: (id: string) => backend.get<ParticipantDoc>('participants', id),
    findByHash: async (hash: string) => {
      const all = await backend.list<ParticipantDoc>('participants');
      return all.find((p) => p.nameHash === hash) ?? null;
    },
    list: () => backend.list<ParticipantDoc>('participants'),
  },
  media: {
    upsert: (m: MediaDoc) => backend.upsert('media', m.mediaId, m),
    get: (id: string) => backend.get<MediaDoc>('media', id),
    list: () => backend.list<MediaDoc>('media'),
  },
  posts: {
    upsert: (p: PostDoc) => backend.upsert('posts', p.postId, p),
    get: (id: string) => backend.get<PostDoc>('posts', id),
    list: () => backend.list<PostDoc>('posts'),
  },
  pendingApprovals: {
    upsert: (a: PendingApprovalDoc) => backend.upsert('pendingApprovals', a.approvalId, a),
    get: (id: string) => backend.get<PendingApprovalDoc>('pendingApprovals', id),
    list: (filter?: (a: PendingApprovalDoc) => boolean) =>
      backend.list<PendingApprovalDoc>('pendingApprovals', filter),
    delete: (id: string) => backend.delete('pendingApprovals', id),
  },
};
