/**
 * Offline-First Sync Engine
 *
 * Implements:
 * 1. Outbox pusher with transactional batching & exponential backoff with jitter
 * 2. Foreign key ordering: products -> sales -> sale_items -> stock_movements -> debts -> debt_payments -> expenses -> cash_sessions
 * 3. Puller with change_seq cursor and overlap safety margin
 * 4. Automatic clock skew compensation
 * 5. Dead-letter queue tracking after 10 retries
 * 6. Reactive UI status indicators
 */

import { db, setClockSkew, type OutboxEntry } from '../db/local';
import type { RemoteAdapter } from '../remote/types';
import { defaultRemoteAdapter } from '../remote/supabase';

// Explicit push dependency order to respect foreign key constraints
const PUSH_ORDER = [
  'shops',
  'products',
  'sales',
  'sale_items',
  'stock_movements',
  'customers',
  'debts',
  'debt_payments',
  'expenses',
  'cash_sessions',
  'subscription_payments',
];

export interface SyncStatus {
  isSyncing: boolean;
  unpushedCount: number;
  deadLetterCount: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
  isOnline: boolean;
}

type SyncListener = (status: SyncStatus) => void;

class SyncEngine {
  private adapter: RemoteAdapter;
  private isSyncing = false;
  private syncTimer: any = null;
  private listeners: SyncListener[] = [];
  private currentStatus: SyncStatus = {
    isSyncing: false,
    unpushedCount: 0,
    deadLetterCount: 0,
    lastSyncedAt: null,
    lastError: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  constructor(adapter: RemoteAdapter = defaultRemoteAdapter) {
    this.adapter = adapter;
    this.initNetworkListeners();
  }

  public setAdapter(adapter: RemoteAdapter) {
    this.adapter = adapter;
  }

  public getStatus(): SyncStatus {
    return { ...this.currentStatus };
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.push(listener);
    listener(this.getStatus());
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emitStatus() {
    const status = this.getStatus();
    this.listeners.forEach((fn) => fn(status));
  }

  private initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.currentStatus.isOnline = true;
      this.emitStatus();
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.currentStatus.isOnline = false;
      this.emitStatus();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.currentStatus.isOnline) {
        this.triggerSync();
      }
    });

    // Request persistent storage to protect IndexedDB under device pressure (§7.8)
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Initial check & periodic sync interval (90s, or 5 min on slow connections)
    this.updateCounts();
    this.startPeriodicSync();
  }

  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);

    let interval = 90_000;
    const conn = (navigator as any).connection;
    if (conn && (conn.saveData || conn.effectiveType === '2g')) {
      interval = 300_000; // 5 min interval to conserve user data
    }

    this.syncTimer = setInterval(() => {
      if (this.currentStatus.isOnline && !this.isSyncing) {
        this.triggerSync();
      }
    }, interval);
  }

  public async updateCounts() {
    try {
      const total = await db.outbox.count();
      const dead = await db.outbox.where('attempts').aboveOrEqual(10).count();
      this.currentStatus.unpushedCount = total;
      this.currentStatus.deadLetterCount = dead;
      this.emitStatus();
    } catch {
      // ignore
    }
  }

  public async triggerSync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.currentStatus.isSyncing = true;
    this.emitStatus();

    try {
      // 1. Clock skew check
      await this.syncClockSkew();

      // 2. Push outbox items
      await this.pushOutbox();

      // 3. Pull remote updates
      await this.pullUpdates();

      this.currentStatus.lastSyncedAt = new Date();
      this.currentStatus.lastError = null;
    } catch (err: any) {
      this.currentStatus.lastError = err?.message || 'Sync error';
    } finally {
      this.isSyncing = false;
      this.currentStatus.isSyncing = false;
      await this.updateCounts();
      this.emitStatus();
    }
  }

  private async syncClockSkew() {
    try {
      const { serverTimeMs } = await this.adapter.getServerTime();
      const localNow = Date.now();
      const skew = serverTimeMs - localNow;
      setClockSkew(skew);
      await db.meta.put({ key: 'clock_skew_ms', value: skew });
    } catch {
      // keep existing skew
    }
  }

  private async pushOutbox() {
    const nowIso = new Date().toISOString();

    for (const table of PUSH_ORDER) {
      // Find up to 200 entries for this table ready for attempt
      const entries = await db.outbox
        .where('table')
        .equals(table)
        .filter((e) => e.attempts < 10 && e.next_attempt_at <= nowIso)
        .limit(200)
        .toArray();

      if (entries.length === 0) continue;

      const payloads = entries.map((e) => e.payload);

      try {
        const result = await this.adapter.pushBatch(table, payloads);

        if (result.pushedCount > 0) {
          // Delete successfully pushed items by sequence ID
          const seqs = entries
            .map((e) => e.seq)
            .filter((s): s is number => s !== undefined);
          await db.outbox.bulkDelete(seqs);
        }

        if (result.errors && result.errors.length > 0) {
          // Handle failed items with exponential backoff + jitter
          await this.handleFailedEntries(entries);
        }
      } catch (err: any) {
        await this.handleFailedEntries(entries, err?.message);
        break; // Stop pushing dependent tables until this table succeeds
      }
    }
  }

  private async handleFailedEntries(entries: OutboxEntry[], errorMessage?: string) {
    const now = Date.now();
    for (const entry of entries) {
      const newAttempts = entry.attempts + 1;
      // Exponential backoff: min(2^attempts * 1s, 5 min) * (0.5 + Math.random())
      const baseMs = Math.min(Math.pow(2, newAttempts) * 1000, 300_000);
      const jitterMs = baseMs * (0.5 + Math.random());
      const nextAttemptAt = new Date(now + jitterMs).toISOString();

      if (entry.seq !== undefined) {
        await db.outbox.update(entry.seq, {
          attempts: newAttempts,
          next_attempt_at: nextAttemptAt,
          last_error: errorMessage || 'Push failed',
        });
      }
    }
  }

  private async pullUpdates() {
    const meta = await db.meta.get('shop_info');
    if (!meta?.value?.shop_id) return;
    const shopId = meta.value.shop_id;

    for (const table of PUSH_ORDER) {
      const syncState = await db.sync_state.get(table);
      const rawCursor = syncState?.last_change_seq || 0;
      // Overlap safety cursor to prevent missing concurrent commits (§7.4)
      const safeCursor = Math.max(0, rawCursor - 1000);

      const pullResult = await this.adapter.pullSince(table, shopId, safeCursor, 500);

      if (pullResult.rows && pullResult.rows.length > 0) {
        if (table === 'shops') {
          // Update local shop metadata from remote shops record
          const shopRow = pullResult.rows[0] as Record<string, any>;
          if (shopRow) {
            const currentMeta = await db.meta.get('shop_info');
            await db.meta.put({
              key: 'shop_info',
              value: {
                ...currentMeta?.value,
                ...shopRow,
                shop_id: shopRow.id || shopId,
              },
            });
          }
        } else {
          // Idempotent upsert into local table
          const targetTable = (db as any)[table];
          if (targetTable) {
            await targetTable.bulkPut(pullResult.rows);
          }
        }
      }

      await db.sync_state.put({
        table,
        last_change_seq: Math.max(rawCursor, pullResult.maxChangeSeq),
        last_pull_at: new Date().toISOString(),
      });
    }
  }
}

export const syncEngine = new SyncEngine();
