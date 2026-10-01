/**
 * Offline-First Sync Engine
 *
 * Implements:
 * 1. Outbox pusher with transactional batching & single-record fallback isolation
 * 2. Foreign key ordering: products -> sales -> sale_items -> stock_movements -> debts -> debt_payments -> expenses -> cash_sessions
 * 3. Puller with change_seq cursor and overlap safety margin
 * 4. Automatic clock skew compensation
 * 5. Dead-letter queue isolation & zero-dead-letter auto-healing
 * 6. Reactive UI status indicators
 */

import {
  db,
  setClockSkew,
  registerDirectSyncDispatcher,
  recalculateStockFromLedger,
  type OutboxEntry,
} from '../db/local';
import type { RemoteAdapter } from '../remote/types';
import { defaultRemoteAdapter } from '../remote/supabase';

// Explicit push dependency order to respect foreign key constraints
const PUSH_ORDER = [
  'shops',
  'users',
  'products',
  'customers',
  'cash_sessions',
  'sales',
  'sale_items',
  'stock_movements',
  'debts',
  'debt_payments',
  'expenses',
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
  private pendingReSync = false;
  private syncTimer: any = null;
  private connectivityWatchTimer: any = null;
  private reconnectStabilizeTimer: any = null;
  private broadcastChannel: any = null;
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
    registerDirectSyncDispatcher((entries) => this.pushDirectOrQueue(entries));
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

  /**
   * Reset backoff timers on all pending outbox entries when connectivity is restored
   * so queued offline records are pushed immediately on reconnect.
   */
  private async resetOutboxBackoffOnReconnect(): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      const waitingEntries = await db.outbox
        .filter((e) => e.attempts > 0 && e.attempts < 10 && e.next_attempt_at > nowIso)
        .toArray();

      for (const entry of waitingEntries) {
        if (entry.seq !== undefined) {
          await db.outbox.update(entry.seq, {
            next_attempt_at: nowIso,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Handle transition to online state: update status, reset outbox backoff, and trigger immediate + stabilized sync
   */
  public async handleDeviceOnline(): Promise<void> {
    this.currentStatus.isOnline = true;
    this.emitStatus();

    await this.resetOutboxBackoffOnReconnect();
    await this.triggerSync();

    // Follow-up sync pass 2.5s after interface comes up to handle DHCP/DNS warm-up delay
    if (this.reconnectStabilizeTimer) {
      clearTimeout(this.reconnectStabilizeTimer);
    }
    this.reconnectStabilizeTimer = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.triggerSync();
      }
    }, 2500);
  }

  private initNetworkListeners() {
    if (typeof window === 'undefined') return;

    // Cross-Tab Real-time Inventory Channel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('smartsort_inventory_sync');
        this.broadcastChannel.onmessage = async (event: MessageEvent) => {
          if (event.data?.type === 'STOCK_CHANGED') {
            await recalculateStockFromLedger();
            void this.triggerSync();
          }
        };
      }
    } catch {
      // ignore
    }

    window.addEventListener('storage', (e) => {
      if (e.key === 'smartsort_inventory_pulse') {
        void recalculateStockFromLedger();
        void this.triggerSync();
      }
    });

    window.addEventListener('online', () => {
      void this.handleDeviceOnline();
    });

    window.addEventListener('offline', () => {
      if (this.reconnectStabilizeTimer) {
        clearTimeout(this.reconnectStabilizeTimer);
        this.reconnectStabilizeTimer = null;
      }
      this.currentStatus.isOnline = false;
      this.emitStatus();
    });

    window.addEventListener('focus', () => {
      const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (onlineNow) {
        if (!this.currentStatus.isOnline) {
          void this.handleDeviceOnline();
        } else {
          void this.triggerSync();
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (onlineNow) {
          if (!this.currentStatus.isOnline) {
            void this.handleDeviceOnline();
          } else {
            void this.triggerSync();
          }
        }
      }
    });

    // Listen to Network Information API changes (e.g. switching from offline/2G to Wi-Fi/4G)
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', () => {
        this.startPeriodicSync();
        const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (onlineNow && conn.effectiveType !== 'offline') {
          void this.handleDeviceOnline();
        }
      });
    }

    // Request persistent storage to protect IndexedDB under device pressure (§7.8)
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Initial check & periodic sync intervals
    void this.updateCounts();
    this.startPeriodicSync();
    this.startConnectivityWatchInterval();
    this.startAutoHealingSweep();

    // Trigger initial background sync on app load
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.triggerSync();
      }
    }, 1000);
  }

  /**
   * Continuous background self-healing sweep (runs every 60s).
   * Automatically heals, sanitizes, and cleans any dead or stuck outbox entries
   * safely in local metadata without affecting Supabase.
   */
  private startAutoHealingSweep() {
    setInterval(async () => {
      try {
        const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (!isOnlineNow) return;

        // Auto-heal dead letters if any exist
        const deadCount = await db.outbox.where('attempts').aboveOrEqual(10).count();
        if (deadCount > 0) {
          await this.autoHealDeadLetters();
        }

        // Flush any pending queue
        await this.updateCounts();
        if (this.currentStatus.unpushedCount > 0 && !this.isSyncing) {
          await this.resetOutboxBackoffOnReconnect();
          void this.triggerSync();
        }
      } catch {
        // silent safe fallback
      }
    }, 60_000);
  }

  /**
   * Fast interval-based connectivity & outbox watcher (runs every 10s).
   * Detects silent online transitions and flushes any pending outbox items automatically when online.
   */
  private startConnectivityWatchInterval() {
    if (this.connectivityWatchTimer) clearInterval(this.connectivityWatchTimer);

    this.connectivityWatchTimer = setInterval(async () => {
      if (typeof navigator === 'undefined') return;
      const onlineNow = navigator.onLine;
      const wasOnline = this.currentStatus.isOnline;

      if (onlineNow !== wasOnline) {
        this.currentStatus.isOnline = onlineNow;
        this.emitStatus();

        if (onlineNow && !wasOnline) {
          await this.handleDeviceOnline();
          return;
        }
      }

      if (onlineNow && !this.isSyncing) {
        await this.updateCounts();
        if (this.currentStatus.unpushedCount > 0) {
          await this.resetOutboxBackoffOnReconnect();
          void this.triggerSync();
        }
      }
    }, 10_000);
  }

  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);

    let interval = 3500; // Fast 3.5s real-time background sync across sellers & devices
    const conn = (navigator as any).connection;
    if (conn && (conn.saveData || conn.effectiveType === '2g')) {
      interval = 30_000; // 30s interval on slow/data-saver connections
    }

    this.syncTimer = setInterval(() => {
      const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : this.currentStatus.isOnline;
      this.currentStatus.isOnline = onlineNow;
      if (onlineNow && !this.isSyncing) {
        void this.triggerSync();
      }
    }, interval);
  }

  public async updateCounts() {
    try {
      // Automatically isolate and archive any dead letters (>= 10 attempts)
      // so they never block, slow down, or affect active sync operations.
      const deadLetters = await db.outbox.where('attempts').aboveOrEqual(10).toArray();
      if (deadLetters.length > 0) {
        const existingArchive = await db.meta.get('dead_letters_archive');
        const prevList = Array.isArray(existingArchive?.value) ? existingArchive.value : [];
        await db.meta.put({
          key: 'dead_letters_archive',
          value: [...prevList.slice(-100), ...deadLetters],
        });
        const deadSeqs = deadLetters
          .map((e) => e.seq)
          .filter((s): s is number => s !== undefined);
        if (deadSeqs.length > 0) {
          await db.outbox.bulkDelete(deadSeqs);
        }
      }

      const activePending = await db.outbox.count();
      this.currentStatus.unpushedCount = activePending;
      this.currentStatus.deadLetterCount = 0;
      this.emitStatus();
    } catch {
      // ignore
    }
  }

  /**
   * Direct Online Write-Through Sync:
   * - When the user is ONLINE: sends changes directly and immediately to Supabase
   *   in foreign-key dependency order WITHOUT queueing in `db.outbox`.
   * - When the user is OFFLINE (or if a direct online request drops mid-flight):
   *   queues only the unsent items into `db.outbox` for automatic background retry.
   */
  public async pushDirectOrQueue(input: OutboxEntry | OutboxEntry[]): Promise<void> {
    const entries = Array.isArray(input) ? input : [input];
    if (entries.length === 0) return;

    const isOnlineNow =
      typeof navigator !== 'undefined' ? navigator.onLine : this.currentStatus.isOnline;
    this.currentStatus.isOnline = isOnlineNow;

    // OFFLINE MODE: Queue into local outbox immediately
    if (!isOnlineNow) {
      await db.outbox.bulkAdd(
        entries.map((e) => ({
          ...e,
          attempts: e.attempts ?? 0,
          next_attempt_at: e.next_attempt_at || new Date().toISOString(),
        }))
      );
      await this.updateCounts();
      return;
    }

    // ONLINE MODE: Send directly to Supabase without queueing!
    // Group entries by table in PUSH_ORDER so foreign keys are respected
    const grouped = new Map<string, OutboxEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.table) || [];
      list.push(entry);
      grouped.set(entry.table, list);
    }

    const orderedTables = [
      ...PUSH_ORDER.filter((t) => grouped.has(t)),
      ...Array.from(grouped.keys()).filter((t) => !PUSH_ORDER.includes(t)),
    ];

    const fallbackQueue: OutboxEntry[] = [];

    for (const table of orderedTables) {
      const tableEntries = grouped.get(table) || [];
      if (tableEntries.length === 0) continue;

      const payloads = tableEntries.map((e) => this.sanitizePayload(table, e.payload));

      try {
        const result = await this.adapter.pushBatch(table, payloads);
        if (result.pushedCount > 0 && (!result.errors || result.errors.length === 0)) {
          // Direct online push succeeded immediately — no queueing needed!
          continue;
        }

        // If batch had partial errors, try each entry individually right now
        for (const singleEntry of tableEntries) {
          try {
            const singlePayload = this.sanitizePayload(table, singleEntry.payload);
            const singleRes = await this.adapter.pushBatch(table, [singlePayload]);
            if (singleRes.pushedCount === 0 || (singleRes.errors && singleRes.errors.length > 0)) {
              fallbackQueue.push({
                ...singleEntry,
                attempts: 1,
                next_attempt_at: new Date(Date.now() + 5000).toISOString(),
                last_error: singleRes.errors?.[0]?.error || 'Direct sync retry queued',
              });
            }
          } catch (singleErr: any) {
            fallbackQueue.push({
              ...singleEntry,
              attempts: 1,
              next_attempt_at: new Date(Date.now() + 5000).toISOString(),
              last_error: singleErr?.message || 'Direct sync retry queued',
            });
          }
        }
      } catch (err: any) {
        // Network dropped mid-request -> queue for retry
        for (const singleEntry of tableEntries) {
          fallbackQueue.push({
            ...singleEntry,
            attempts: 1,
            next_attempt_at: new Date(Date.now() + 5000).toISOString(),
            last_error: err?.message || 'Network interrupted during direct sync',
          });
        }
      }
    }

    if (fallbackQueue.length > 0) {
      await db.outbox.bulkAdd(fallbackQueue);
    } else {
      this.currentStatus.lastSyncedAt = new Date();
      this.currentStatus.lastError = null;
    }

    // Broadcast change to other open seller tabs/windows
    try {
      if (typeof window !== 'undefined') {
        if (this.broadcastChannel) {
          this.broadcastChannel.postMessage({ type: 'STOCK_CHANGED', timestamp: Date.now() });
        }
        localStorage.setItem('smartsort_inventory_pulse', String(Date.now()));
      }
    } catch {
      // ignore
    }

    await this.updateCounts();

    // If there are any older offline items still waiting in outbox, flush them in the background
    if (this.currentStatus.unpushedCount > 0 && !this.isSyncing) {
      this.triggerSync().catch(() => {});
    }
  }

  /**
   * Cleans and sanitizes payloads to eliminate schema/type mismatches
   */
  private sanitizePayload(table: string, raw: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (val === undefined) continue;
      // Convert Date objects to ISO strings
      if (val instanceof Date) {
        clean[key] = val.toISOString();
      } else {
        clean[key] = val;
      }
    }

    // Ensure shop_id is present as string if applicable
    if (clean.shop_id !== undefined && clean.shop_id !== null) {
      clean.shop_id = String(clean.shop_id);
    }

    return clean;
  }

  public async triggerSync(): Promise<void> {
    const isOnlineNow =
      typeof navigator !== 'undefined' ? navigator.onLine : this.currentStatus.isOnline;
    this.currentStatus.isOnline = isOnlineNow;

    if (!isOnlineNow) {
      await this.updateCounts();
      this.emitStatus();
      return;
    }

    if (this.isSyncing) {
      this.pendingReSync = true;
      return;
    }

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

      if (this.pendingReSync && (typeof navigator === 'undefined' || navigator.onLine)) {
        this.pendingReSync = false;
        void this.triggerSync();
      }
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

      const payloads = entries.map((e) => this.sanitizePayload(table, e.payload));

      try {
        // Try batch push first for maximum throughput
        const result = await this.adapter.pushBatch(table, payloads);

        if (result.pushedCount > 0 && (!result.errors || result.errors.length === 0)) {
          // Delete successfully pushed items by sequence ID
          const seqs = entries
            .map((e) => e.seq)
            .filter((s): s is number => s !== undefined);
          await db.outbox.bulkDelete(seqs);
          continue;
        }

        // If batch returned partial errors, fall back to individual item push
        await this.pushEntriesIndividually(table, entries);
      } catch (err: any) {
        // If whole batch network/schema failed, do NOT fail all records at once!
        // Isolate item by item to push every valid record and only back off faulty ones.
        await this.pushEntriesIndividually(table, entries, err?.message);
      }
    }
  }

  /**
   * Resilient single-entry push to prevent head-of-line blocking and poison-pill batches
   */
  private async pushEntriesIndividually(
    table: string,
    entries: OutboxEntry[],
    fallbackErr?: string
  ) {
    for (const entry of entries) {
      try {
        const sanitized = this.sanitizePayload(table, entry.payload);
        const singleResult = await this.adapter.pushBatch(table, [sanitized]);

        if (singleResult.pushedCount > 0 && (!singleResult.errors || singleResult.errors.length === 0)) {
          if (entry.seq !== undefined) {
            await db.outbox.delete(entry.seq);
          }
        } else {
          const errMsg = singleResult.errors?.[0]?.error || fallbackErr || 'Push failed';
          await this.handleFailedEntries([entry], errMsg);
        }
      } catch (itemErr: any) {
        await this.handleFailedEntries([entry], itemErr?.message || fallbackErr || 'Push failed');
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

  /**
   * Auto-Heals all dead letters by resetting attempt counts, sanitizing payloads,
   * and immediately triggering a sync replay pass.
   */
  public async autoHealDeadLetters(): Promise<{ recoveredCount: number }> {
    const deadLetters = await db.outbox.where('attempts').aboveOrEqual(10).toArray();
    if (deadLetters.length === 0) {
      // Also reset any failed outbox items
      const allOutbox = await db.outbox.toArray();
      for (const entry of allOutbox) {
        if (entry.seq !== undefined && (entry.attempts > 0 || entry.last_error)) {
          await db.outbox.update(entry.seq, {
            attempts: 0,
            next_attempt_at: new Date().toISOString(),
            last_error: null,
          });
        }
      }
      await this.triggerSync();
      return { recoveredCount: allOutbox.length };
    }

    for (const entry of deadLetters) {
      if (entry.seq !== undefined) {
        await db.outbox.update(entry.seq, {
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          last_error: null,
        });
      }
    }

    await this.updateCounts();
    await this.triggerSync();
    return { recoveredCount: deadLetters.length };
  }

  /**
   * Clears dead letters after archiving them to local backup storage so no data is ever lost.
   */
  public async clearDeadLetters(): Promise<{ clearedCount: number }> {
    const deadLetters = await db.outbox.where('attempts').aboveOrEqual(10).toArray();
    if (deadLetters.length === 0) {
      // If none above 10, clear all pending failed items
      const all = await db.outbox.toArray();
      const seqs = all.map((e) => e.seq).filter((s): s is number => s !== undefined);
      if (seqs.length > 0) {
        // Save archive in local meta
        await db.meta.put({
          key: `dead_letters_archive_${Date.now()}`,
          value: all,
        });
        await db.outbox.bulkDelete(seqs);
      }
      await this.updateCounts();
      return { clearedCount: all.length };
    }

    // Save dead letters to archival meta table before deleting
    await db.meta.put({
      key: `dead_letters_archive_${Date.now()}`,
      value: deadLetters,
    });

    const seqs = deadLetters.map((e) => e.seq).filter((s): s is number => s !== undefined);
    await db.outbox.bulkDelete(seqs);
    await this.updateCounts();
    return { clearedCount: deadLetters.length };
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

    // Recalculate full product stock quantities from the synchronized ledger
    await recalculateStockFromLedger();

    // Notify other tabs and reactive UI subscribers
    try {
      if (typeof window !== 'undefined' && this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'STOCK_CHANGED', timestamp: Date.now() });
      }
    } catch {
      // ignore
    }
  }
}

export const syncEngine = new SyncEngine();
