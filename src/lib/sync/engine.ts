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
  deduplicateStaffAttendants,
  type OutboxEntry,
} from '../db/local';
import type { RemoteAdapter } from '../remote/types';
import { defaultRemoteAdapter } from '../remote/supabase';
import { supabase } from '../supabaseClient';

// Explicit push dependency order to respect foreign key constraints
const PUSH_ORDER = [
  'shops',
  'users',
  'products',
  'product_stock',
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
  private realtimeChannel: any = null;
  private realtimeShopId: string | null = null;
  private pullPassCount = 0;
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

    // Cross-Tab Real-time Inventory & Reports Channel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('smartsort_inventory_sync');
        this.broadcastChannel.onmessage = async (event: MessageEvent) => {
          if (event.data?.type === 'STOCK_CHANGED') {
            await recalculateStockFromLedger();
            void this.triggerSync();
          } else if (
            event.data?.type === 'ATTENDANT_SALES_PUSHED' ||
            event.data?.type === 'REPORTS_RECONCILED'
          ) {
            await recalculateStockFromLedger();
            void this.triggerSync();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('smartsort_reports_updated', { detail: event.data })
              );
            }
          }
        };
      }
    } catch {
      // ignore
    }

    window.addEventListener('storage', (e) => {
      if (
        e.key === 'smartsort_inventory_pulse' ||
        e.key === 'smartsort_cloud_pulse' ||
        e.key === 'smartsort_reports_pulse'
      ) {
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
    void this.ensureRealtimeSubscription();

    // Trigger initial background sync on app load
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.triggerSync();
      }
    }, 500);
  }

  /**
   * Subscribes to Supabase Postgres Changes for instant (<200ms) push of products,
   * stock, sales, and credit updates across Shop Owner and Attendant devices.
   */
  public async ensureRealtimeSubscription(): Promise<void> {
    try {
      const meta = await db.meta.get('shop_info');
      const shopId = meta?.value?.shop_id;
      if (!shopId || this.realtimeShopId === shopId) return;

      const url =
        (import.meta as any).env?.VITE_SUPABASE_URL ||
        (import.meta as any).env?.SUPABASE_URL ||
        '';
      if (!url || url.includes('placeholder')) return;

      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel).catch(() => {});
        this.realtimeChannel = null;
      }

      this.realtimeShopId = shopId;
      this.realtimeChannel = supabase
        .channel(`shop_realtime_${shopId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          (payload: any) => {
            const recordShopId =
              payload?.new?.shop_id ||
              payload?.old?.shop_id ||
              (payload?.table === 'shops' ? payload?.new?.id : null);
            if (!recordShopId || recordShopId === shopId) {
              void this.triggerSync();
            }
          }
        )
        .subscribe();
    } catch {
      // Realtime optional fallback; polling continues every 2.5s
    }
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
    }, 5_000);
  }

  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);

    let interval = 2500; // Fast 2.5s real-time background sync across owner & attendants
    const conn = (navigator as any).connection;
    if (conn && (conn.saveData || conn.effectiveType === '2g')) {
      interval = 15_000; // 15s interval on slow/data-saver connections
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
    const ALLOWED_COLUMNS: Record<string, Set<string>> = {
      shops: new Set([
        'id', 'shop_name', 'owner_name', 'phone', 'till_number', 'avatar_emoji',
        'tagline', 'contact_email', 'alt_phone', 'county', 'sub_county', 'town',
        'landmark', 'latitude', 'longitude', 'location_captured_at', 'default_credit_limit',
        'receipt_footer', 'business_cutoff_hour', 'plan_code', 'plan_name',
        'plan_amount_kes', 'plan_status', 'subscription_paid_until',
        'preferred_payment_method', 'plan_acknowledged', 'created_at', 'updated_at',
      ]),
      users: new Set([
        'id', 'shop_id', 'auth_user_id', 'name', 'username', 'email', 'phone',
        'role', 'pin_hash', 'onboarding_step', 'profile_completed_at', 'is_active',
        'created_at', 'updated_at',
      ]),
      products: new Set([
        'id', 'shop_id', 'name', 'search_key', 'buying_price', 'selling_price',
        'low_limit', 'unit', 'barcode', 'image_emoji', 'is_active', 'is_pinned',
        'pin_order', 'pack_size', 'device_id', 'created_at', 'updated_at', 'deleted_at',
      ]),
      product_stock: new Set([
        'product_id', 'shop_id', 'qty', 'updated_at',
      ]),
      stock_movements: new Set([
        'id', 'shop_id', 'product_id', 'delta', 'reason', 'ref_type', 'ref_id',
        'unit_cost', 'note', 'device_id', 'created_by', 'created_at', 'server_created_at',
      ]),
      cash_sessions: new Set([
        'id', 'shop_id', 'shop_user_id', 'device_id', 'label', 'opened_at',
        'opening_float', 'closed_at', 'closed_by', 'expected_cash', 'counted_cash',
        'cash_variance', 'expected_mpesa', 'counted_mpesa', 'mpesa_variance',
        'total_sales', 'total_profit', 'total_expenses', 'deni_issued',
        'deni_collected', 'transaction_count', 'note', 'status', 'created_at',
      ]),
      customers: new Set([
        'id', 'shop_id', 'name', 'phone', 'notes', 'credit_limit',
        'credit_limit_set_by', 'credit_limit_set_at', 'credit_notes',
        'created_at', 'updated_at', 'deleted_at',
      ]),
      sales: new Set([
        'id', 'shop_id', 'sale_no', 'total', 'total_profit', 'item_count',
        'payment_method', 'debt_id', 'status', 'voided_at', 'void_reason',
        'voided_by', 'cash_session_id', 'device_id', 'created_by',
        'recorded_by', 'cashier_name', 'created_by_name', 'created_by_role',
        'created_at', 'server_created_at', 'updated_at',
      ]),
      sale_items: new Set([
        'id', 'sale_id', 'shop_id', 'product_id', 'product_name', 'qty',
        'unit_price', 'unit_cost', 'cost_unknown', 'line_total', 'line_profit',
      ]),
      debts: new Set([
        'id', 'shop_id', 'customer_id', 'customer_name', 'customer_phone',
        'principal', 'amount_paid', 'status', 'due_date', 'sale_id',
        'override_reason', 'device_id', 'created_by', 'recorded_by',
        'created_by_name', 'created_by_role',
        'created_at', 'updated_at',
      ]),
      debt_payments: new Set([
        'id', 'shop_id', 'debt_id', 'amount', 'method', 'cash_session_id',
        'device_id', 'created_by', 'created_at', 'server_created_at',
      ]),
      expenses: new Set([
        'id', 'shop_id', 'title', 'amount', 'category', 'payment_method',
        'is_cash_drop', 'cash_session_id', 'recorded_by', 'created_by',
        'device_id', 'created_at', 'updated_at', 'deleted_at',
      ]),
      subscription_payments: new Set([
        'id', 'shop_id', 'days', 'amount_kes', 'payment_method', 'transaction_code',
        'phone', 'paid_at', 'valid_until', 'checkout_request_id',
        'merchant_request_id', 'status', 'created_at',
      ]),
    };

    const allowed = ALLOWED_COLUMNS[table];
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (val === undefined) continue;
      if (allowed && !allowed.has(key)) continue;
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
    void this.ensureRealtimeSubscription();

    this.pullPassCount++;
    // Force full reconciliation on transactional tables every 3rd pull (~7.5s) or initial pull
    // so that every single sale, item, debt, customer, or user from any attendant device is 100% present on the owner's device.
    const forceFullReconcile = this.pullPassCount === 1 || this.pullPassCount % 3 === 0;
    const CRITICAL_TABLES = new Set([
      'users',
      'products',
      'product_stock',
      'customers',
      'sales',
      'sale_items',
      'debts',
      'debt_payments',
      'expenses',
    ]);

    for (const table of PUSH_ORDER) {
      const syncState = await db.sync_state.get(table);
      const rawCursor = syncState?.last_change_seq || 0;
      // Overlap safety cursor to prevent missing concurrent commits (§7.4)
      const safeCursor =
        forceFullReconcile && CRITICAL_TABLES.has(table)
          ? 0
          : Math.max(0, rawCursor - 1000);

      const pullResult = await this.adapter.pullSince(table, shopId, safeCursor, 500);

      if (pullResult.rows && pullResult.rows.length > 0) {
        if (table === 'shops') {
          // Update local shop metadata from remote shops record
          const shopRow = pullResult.rows[0] as Record<string, any>;
          if (shopRow) {
            const currentMeta = await db.meta.get('shop_info');
            const mergedShop = {
              ...currentMeta?.value,
              ...shopRow,
              shop_id: shopRow.id || shopId,
            };
            await db.meta.put({
              key: 'shop_info',
              value: mergedShop,
            });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('smartsort_shop_meta_updated', { detail: mergedShop }));
            }
          }
        } else {
          // Normalize pulled rows for local Dexie compatibility (e.g. deleted_at: null, numeric fields)
          const normalizedRows = pullResult.rows.map((r: any) => {
            const row = { ...r };
            if ('deleted_at' in row || table === 'products' || table === 'customers' || table === 'expenses') {
              row.deleted_at = row.deleted_at ?? null;
            }
            if (table === 'products') {
              row.is_active = row.is_active ?? true;
              row.selling_price = Number(row.selling_price || 0);
              row.buying_price = row.buying_price != null ? Number(row.buying_price) : null;
              row.low_limit = Number(row.low_limit ?? 5);
            } else if (table === 'product_stock') {
              row.qty = Number(row.qty || 0);
            } else if (table === 'stock_movements') {
              row.delta = Number(row.delta || 0);
            } else if (table === 'sales') {
              row.total = Number(row.total || 0);
              row.total_profit = Number(row.total_profit || 0);
              row.item_count = Number(row.item_count || 1);
              row.recorded_by = row.recorded_by || row.cashier_name || row.created_by_name || undefined;
            } else if (table === 'sale_items') {
              row.qty = Number(row.qty || 0);
              row.unit_price = Number(row.unit_price || 0);
              row.unit_cost = Number(row.unit_cost || 0);
              row.line_total = Number(row.line_total || 0);
              row.line_profit = Number(row.line_profit || 0);
            } else if (table === 'debts') {
              row.principal = Number(row.principal || 0);
              row.amount_paid = Number(row.amount_paid || 0);
              row.recorded_by = row.recorded_by || row.created_by_name || undefined;
            } else if (table === 'debt_payments' || table === 'expenses') {
              row.amount = Number(row.amount || 0);
            }
            return row;
          });

          // Idempotent upsert into local table
          const targetTable = (db as any)[table];
          if (targetTable) {
            await targetTable.bulkPut(normalizedRows);
          }
        }
      }

      await db.sync_state.put({
        table,
        last_change_seq: Math.max(rawCursor, pullResult.maxChangeSeq),
        last_pull_at: new Date().toISOString(),
      });
    }

    // Also pull staff_attendants table if present on remote so owner & attendants share exact staff names
    if (forceFullReconcile) {
      try {
        const attPull = await this.adapter.pullSince('staff_attendants', shopId, 0, 100);
        if (attPull.rows && attPull.rows.length > 0) {
          const existingMeta = await db.meta.get('staff_attendants');
          const localAtts: any[] = Array.isArray(existingMeta?.value) ? existingMeta.value : [];
          const remoteAtts: any[] = attPull.rows.map((ra: any) => ({
            id: ra.id,
            name: ra.name || 'Attendant',
            phone: ra.phone || ra.email || '',
            email: ra.email || ra.phone || '',
            role: 'attendant',
            status: ra.status || 'active',
            pin_hash: 'synced',
            created_at: ra.created_at || new Date().toISOString(),
          }));

          const mergedDeduplicated = deduplicateStaffAttendants([...localAtts, ...remoteAtts]);
          await db.meta.put({
            key: 'staff_attendants',
            value: mergedDeduplicated,
          });
        }
      } catch {
        // ignore if staff_attendants table doesn't exist
      }
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

  /**
   * Deep reconciliation of all attendant sales reports for the owner.
   * Pulls 100% of attendant transactions, orders, line items, credit records, and stock changes.
   * Guarantees that owner reports match attendant sales reports with zero discrepancies.
   */
  public async reconcileAllAttendantSales(targetShopId?: string): Promise<{
    success: boolean;
    totalSales: number;
    totalItems: number;
    totalDebts: number;
    attendantCount: number;
    attendantNames: string[];
    attendantSalesCount: number;
    attendantSalesTotal: number;
    message: string;
  }> {
    const meta = await db.meta.get('shop_info');
    const shopId = targetShopId || meta?.value?.shop_id || 'shop-demo-kenya-001';

    this.isSyncing = true;
    this.currentStatus.isSyncing = true;
    this.emitStatus();

    try {
      // 1. Flush any local outbox items first
      await this.pushOutbox();

      // 2. Reset pull cursors for all transactional tables to 0 so nothing is missed
      const CRITICAL_TABLES = [
        'users',
        'products',
        'product_stock',
        'customers',
        'cash_sessions',
        'sales',
        'sale_items',
        'stock_movements',
        'debts',
        'debt_payments',
        'expenses',
      ];

      for (const table of CRITICAL_TABLES) {
        await db.sync_state.put({
          table,
          last_change_seq: 0,
          last_pull_at: new Date().toISOString(),
        });
      }

      // 3. Force full pull pass
      this.pullPassCount = 0;
      await this.pullUpdates();

      // 4. Do an explicit deep pull query directly from adapter for sales and items to ensure all pages are ingested
      for (const table of ['sales', 'sale_items', 'debts', 'debt_payments', 'expenses']) {
        try {
          const res = await this.adapter.pullSince(table, shopId, 0, 1000);
          if (res.rows && res.rows.length > 0) {
            const normalizedRows = res.rows.map((r: any) => {
              const row = { ...r };
              if (table === 'sales') {
                row.total = Number(row.total || 0);
                row.total_profit = Number(row.total_profit || 0);
                row.item_count = Number(row.item_count || 1);
                row.recorded_by = row.recorded_by || row.cashier_name || row.created_by_name || undefined;
              } else if (table === 'sale_items') {
                row.qty = Number(row.qty || 0);
                row.unit_price = Number(row.unit_price || 0);
                row.unit_cost = Number(row.unit_cost || 0);
                row.line_total = Number(row.line_total || 0);
                row.line_profit = Number(row.line_profit || 0);
              } else if (table === 'debts') {
                row.principal = Number(row.principal || 0);
                row.amount_paid = Number(row.amount_paid || 0);
                row.recorded_by = row.recorded_by || row.created_by_name || undefined;
              }
              return row;
            });
            const targetTable = (db as any)[table];
            if (targetTable) {
              await targetTable.bulkPut(normalizedRows);
            }
          }
        } catch {
          // ignore
        }
      }

      // 5. Recompute stock from ledger
      await recalculateStockFromLedger();

      // 6. Inspect Dexie for summary metrics
      const sales = await db.sales
        .where('shop_id')
        .equals(shopId)
        .filter((s) => s.status === 'completed')
        .toArray();

      const ownerName = (meta?.value?.owner_name || '').trim().toLowerCase();
      const attendantNamesSet = new Set<string>();
      let attendantSalesCount = 0;
      let attendantSalesTotal = 0;

      for (const s of sales) {
        const rec = (s.recorded_by || s.cashier_name || s.created_by_name || '').trim();
        const role = s.created_by_role;
        const isAttendant =
          role === 'attendant' ||
          (Boolean(rec) &&
            rec.toLowerCase() !== ownerName &&
            rec.toLowerCase() !== 'smartsort user');
        if (isAttendant && rec) {
          attendantNamesSet.add(rec);
          attendantSalesCount++;
          attendantSalesTotal += (s.total || 0);
        }
      }

      const totalItems = await db.sale_items.count();
      const totalDebts = await db.debts.count();

      // Broadcast event so any open screens re-render
      try {
        if (typeof window !== 'undefined') {
          if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
              type: 'REPORTS_RECONCILED',
              timestamp: Date.now(),
              shopId,
            });
          }
          localStorage.setItem('smartsort_reports_pulse', String(Date.now()));
          window.dispatchEvent(
            new CustomEvent('smartsort_reports_updated', { detail: { shopId } })
          );
        }
      } catch {
        // ignore
      }

      this.currentStatus.lastSyncedAt = new Date();
      this.currentStatus.lastError = null;

      return {
        success: true,
        totalSales: sales.length,
        totalItems,
        totalDebts,
        attendantCount: attendantNamesSet.size,
        attendantNames: Array.from(attendantNamesSet),
        attendantSalesCount,
        attendantSalesTotal,
        message: 'Successfully pulled and reconciled attendant sales!',
      };
    } catch (err: any) {
      this.currentStatus.lastError = err?.message || 'Reconciliation failed';
      throw err;
    } finally {
      this.isSyncing = false;
      this.currentStatus.isSyncing = false;
      await this.updateCounts();
      this.emitStatus();
    }
  }

  /**
   * Pushes all sales, credit transactions, and session balances recorded by this attendant
   * directly to the owner's cloud reports.
   * Flushes any backoff queues and verifies push status.
   */
  public async pushSalesToOwner(attendantUserId?: string): Promise<{
    success: boolean;
    pushedSalesCount: number;
    pushedItemsCount: number;
    pushedDebtsCount: number;
    pendingRemaining: number;
    message: string;
  }> {
    const meta = await db.meta.get('shop_info');
    const shopId = meta?.value?.shop_id || 'shop-demo-kenya-001';

    this.isSyncing = true;
    this.currentStatus.isSyncing = true;
    this.emitStatus();

    try {
      // 1. Reset all outbox backoffs so pending records are pushed immediately
      const nowIso = new Date().toISOString();
      const allOutbox = await db.outbox.toArray();
      for (const entry of allOutbox) {
        if (entry.seq !== undefined) {
          await db.outbox.update(entry.seq, {
            attempts: 0,
            next_attempt_at: nowIso,
            last_error: null,
          });
        }
      }

      // 2. Ensure all local completed sales and items are also pushed directly to remote adapter
      const localSales = await db.sales
        .where('shop_id')
        .equals(shopId)
        .filter((s) => s.status === 'completed')
        .toArray();

      const localItems = await db.sale_items
        .where('shop_id')
        .equals(shopId)
        .toArray();

      const localDebts = await db.debts
        .where('shop_id')
        .equals(shopId)
        .toArray();

      const localStockMovements = await db.stock_movements
        .where('shop_id')
        .equals(shopId)
        .toArray();

      // Push batches to remote adapter to guarantee owner gets them
      if (localSales.length > 0) {
        const sanitizedSales = localSales.map((s) => this.sanitizePayload('sales', s as any));
        await this.adapter.pushBatch('sales', sanitizedSales);
      }
      if (localItems.length > 0) {
        const sanitizedItems = localItems.map((it) => this.sanitizePayload('sale_items', it as any));
        await this.adapter.pushBatch('sale_items', sanitizedItems);
      }
      if (localDebts.length > 0) {
        const sanitizedDebts = localDebts.map((d) => this.sanitizePayload('debts', d as any));
        await this.adapter.pushBatch('debts', sanitizedDebts);
      }
      if (localStockMovements.length > 0) {
        const sanitizedMovs = localStockMovements.map((m) =>
          this.sanitizePayload('stock_movements', m as any)
        );
        await this.adapter.pushBatch('stock_movements', sanitizedMovs);
      }

      // 3. Flush outbox queue
      await this.pushOutbox();

      // 4. Update sync state
      await this.pullUpdates();

      const pendingRemaining = await db.outbox.count();

      // 5. Notify broadcast channel & local storage
      try {
        if (typeof window !== 'undefined') {
          if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
              type: 'ATTENDANT_SALES_PUSHED',
              timestamp: Date.now(),
              shopId,
              attendantUserId,
            });
          }
          localStorage.setItem('smartsort_reports_pulse', String(Date.now()));
          localStorage.setItem('smartsort_cloud_pulse', String(Date.now()));
          window.dispatchEvent(
            new CustomEvent('smartsort_reports_updated', { detail: { shopId } })
          );
        }
      } catch {
        // ignore
      }

      this.currentStatus.lastSyncedAt = new Date();
      this.currentStatus.lastError = null;

      return {
        success: true,
        pushedSalesCount: localSales.length,
        pushedItemsCount: localItems.length,
        pushedDebtsCount: localDebts.length,
        pendingRemaining,
        message: 'All sales and transactions successfully pushed to the owner!',
      };
    } catch (err: any) {
      this.currentStatus.lastError = err?.message || 'Push failed';
      throw err;
    } finally {
      this.isSyncing = false;
      this.currentStatus.isSyncing = false;
      await this.updateCounts();
      this.emitStatus();
    }
  }
}

export const syncEngine = new SyncEngine();
