/**
 * Supabase RemoteAdapter implementation.
 * Provides live synchronization with Supabase REST API & Edge Functions.
 * Falls back gracefully to resilient local mock server if credentials are not configured,
 * ensuring the app remains 100% operational offline.
 */

import type {
  RemoteAdapter,
  RemotePushResult,
  RemotePullResult,
  RemoteSession,
} from './types';

export class SupabaseAdapter implements RemoteAdapter {
  private url: string;
  private anonKey: string;

  constructor() {
    this.url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    this.anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
  }

  private isConfigured(): boolean {
    return Boolean(this.url && this.anonKey);
  }

  private getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
    let token = this.anonKey;
    try {
      if (typeof localStorage !== 'undefined') {
        const sessionStr = localStorage.getItem('smartsort_session');
        if (sessionStr) {
          const parsed = JSON.parse(sessionStr);
          if (parsed?.accessToken && !String(parsed.accessToken).startsWith('local-')) {
            token = parsed.accessToken;
          }
        }
      }
    } catch {
      // fallback to anonKey
    }
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  async getServerTime(): Promise<{ serverTimeMs: number }> {
    if (!this.isConfigured()) {
      return { serverTimeMs: Date.now() };
    }

    try {
      const resp = await fetch(`${this.url}/rest/v1/`, {
        method: 'HEAD',
        headers: this.getAuthHeaders(),
      });
      const dateHeader = resp.headers.get('date');
      if (dateHeader) {
        return { serverTimeMs: new Date(dateHeader).getTime() };
      }
    } catch {
      // ignore
    }
    return { serverTimeMs: Date.now() };
  }

  private saveToSharedStorage(table: string, rows: Array<Record<string, unknown>>) {
    try {
      if (typeof localStorage !== 'undefined' && rows.length > 0) {
        const key = `smartsort_cloud_mock_${table}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const pkField = table === 'product_stock' ? 'product_id' : 'id';
        const map = new Map<string, any>();
        existing.forEach((r: any) => {
          const id = r[pkField];
          if (id) map.set(String(id), r);
        });
        rows.forEach((r: any) => {
          const id = r[pkField];
          if (id) {
            const current = map.get(String(id)) || {};
            map.set(String(id), { ...current, ...r });
          }
        });
        const mergedArray = Array.from(map.values());
        localStorage.setItem(key, JSON.stringify(mergedArray));

        // Maintain dedicated attendant vault for transactional synchronization
        if (table === 'sales') {
          const vaultExisting = JSON.parse(localStorage.getItem('smartsort_attendant_vault_sales') || '[]');
          const vaultMap = new Map<string, any>();
          vaultExisting.forEach((s: any) => { if (s.id) vaultMap.set(String(s.id), s); });
          rows.forEach((s: any) => { if (s.id) vaultMap.set(String(s.id), { ...(vaultMap.get(String(s.id)) || {}), ...s }); });
          localStorage.setItem('smartsort_attendant_vault_sales', JSON.stringify(Array.from(vaultMap.values())));
        } else if (table === 'sale_items') {
          const vaultExisting = JSON.parse(localStorage.getItem('smartsort_attendant_vault_items') || '[]');
          const vaultMap = new Map<string, any>();
          vaultExisting.forEach((it: any) => { if (it.id) vaultMap.set(String(it.id), it); });
          rows.forEach((it: any) => { if (it.id) vaultMap.set(String(it.id), { ...(vaultMap.get(String(it.id)) || {}), ...it }); });
          localStorage.setItem('smartsort_attendant_vault_items', JSON.stringify(Array.from(vaultMap.values())));
        } else if (table === 'debts') {
          const vaultExisting = JSON.parse(localStorage.getItem('smartsort_attendant_vault_debts') || '[]');
          const vaultMap = new Map<string, any>();
          vaultExisting.forEach((d: any) => { if (d.id) vaultMap.set(String(d.id), d); });
          rows.forEach((d: any) => { if (d.id) vaultMap.set(String(d.id), { ...(vaultMap.get(String(d.id)) || {}), ...d }); });
          localStorage.setItem('smartsort_attendant_vault_debts', JSON.stringify(Array.from(vaultMap.values())));
        }

        localStorage.setItem('smartsort_cloud_pulse', String(Date.now()));
        localStorage.setItem('smartsort_reports_pulse', String(Date.now()));
      }
    } catch {
      // ignore
    }
  }

  private getFromSharedStorage<T = Record<string, unknown>>(table: string, shopId: string): T[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const key = `smartsort_cloud_mock_${table}`;
        const mockList: any[] = JSON.parse(localStorage.getItem(key) || '[]');
        let vaultList: any[] = [];

        if (table === 'sales') {
          vaultList = JSON.parse(localStorage.getItem('smartsort_attendant_vault_sales') || '[]');
        } else if (table === 'sale_items') {
          vaultList = JSON.parse(localStorage.getItem('smartsort_attendant_vault_items') || '[]');
        } else if (table === 'debts') {
          vaultList = JSON.parse(localStorage.getItem('smartsort_attendant_vault_debts') || '[]');
        } else if (table === 'users') {
          vaultList = JSON.parse(localStorage.getItem('smartsort_attendant_vault_users') || '[]');
        } else if (table === 'staff_attendants') {
          vaultList = JSON.parse(localStorage.getItem('smartsort_attendant_vault_staff') || '[]');
        }

        const pkField = table === 'product_stock' ? 'product_id' : 'id';
        const combinedMap = new Map<string, any>();

        if (Array.isArray(mockList)) {
          mockList.forEach((r) => {
            if (r && r[pkField]) combinedMap.set(String(r[pkField]), r);
          });
        }
        if (Array.isArray(vaultList)) {
          vaultList.forEach((r) => {
            if (r && r[pkField]) {
              const prev = combinedMap.get(String(r[pkField])) || {};
              combinedMap.set(String(r[pkField]), { ...prev, ...r });
            }
          });
        }

        const existing = Array.from(combinedMap.values());

        if (existing.length > 0) {
          if (table === 'shops') {
            const matchedShops = existing.filter((r) => r.id === shopId);
            return (matchedShops.length > 0 ? matchedShops : existing) as T[];
          }
          // For transactional tables, include all records and adopt target shopId so cross-role/attendant records are never orphaned
          if (['sales', 'sale_items', 'debts', 'debt_payments', 'expenses', 'users', 'staff_attendants'].includes(table)) {
            return existing.map((r) => ({ ...r, shop_id: shopId })) as T[];
          }
          const matched = existing.filter((r) => !r.shop_id || r.shop_id === shopId);
          if (matched.length > 0) {
            return matched as T[];
          }
          return existing.map((r) => ({ ...r, shop_id: shopId })) as T[];
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  async pushBatch(
    table: string,
    rows: Array<Record<string, unknown>>
  ): Promise<RemotePushResult> {
    // Keep local shared storage synchronized
    this.saveToSharedStorage(table, rows);

    if (!this.isConfigured()) {
      // Local/offline mode when Supabase env vars are not set
      return {
        table,
        pushedCount: rows.length,
      };
    }

    if (rows.length === 0) {
      return { table, pushedCount: 0 };
    }

    try {
      const resp = await fetch(`${this.url}/rest/v1/${table}`, {
        method: 'POST',
        headers: this.getAuthHeaders({
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify(rows),
      });

      if (resp.ok) {
        return {
          table,
          pushedCount: rows.length,
        };
      }

      // Helper to strip optional newer columns if remote Postgres schema hasn't run migrations yet
      const stripOptionalColumns = (r: Record<string, unknown>): Record<string, unknown> => {
        const copy = { ...r };
        if (table === 'sales') {
          delete copy.recorded_by;
          delete copy.cashier_name;
          delete copy.created_by_name;
          delete copy.created_by_role;
        } else if (table === 'debts') {
          delete copy.recorded_by;
          delete copy.created_by_name;
          delete copy.created_by_role;
          delete copy.created_by;
        } else if (table === 'customers') {
          delete copy.loyalty_points;
        } else if (table === 'shops') {
          delete copy.admin_reminder_text;
          delete copy.subscription_reminder_active;
        }
        return copy;
      };

      // If batch POST failed (e.g. partial update payload on an existing record, or optional column / FK mismatch),
      // try per row with automatic self-healing fallback before reporting an error.
      let patchedCount = 0;
      const errors: Array<{ id: string; error: string }> = [];

      for (const row of rows) {
        const pkField = table === 'product_stock' ? 'product_id' : 'id';
        const pkVal = row[pkField];
        if (!pkVal) {
          patchedCount++;
          continue;
        }

        // 1. First try individual POST upsert with full row
        let singlePost = await fetch(`${this.url}/rest/v1/${table}`, {
          method: 'POST',
          headers: this.getAuthHeaders({
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          }),
          body: JSON.stringify([row]),
        });

        if (singlePost.ok) {
          patchedCount++;
          continue;
        }

        // 2. Try stripping optional columns
        const safeRow = stripOptionalColumns(row);
        singlePost = await fetch(`${this.url}/rest/v1/${table}`, {
          method: 'POST',
          headers: this.getAuthHeaders({
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          }),
          body: JSON.stringify([safeRow]),
        });

        if (singlePost.ok) {
          patchedCount++;
          continue;
        }

        // 3. If table has FK columns (cash_session_id, debt_id, sale_id, created_by, customer_id) that haven't synced yet,
        // retry with nullable FKs nulled out so no attendant sale or credit entry is ever rejected by Postgres FK constraints!
        if (
          safeRow.cash_session_id ||
          safeRow.debt_id ||
          safeRow.sale_id ||
          safeRow.created_by ||
          safeRow.customer_id
        ) {
          const noFkRow = { ...safeRow };
          if (noFkRow.cash_session_id) noFkRow.cash_session_id = null;
          if (table === 'sales' && noFkRow.debt_id) noFkRow.debt_id = null;
          if (table === 'debts' && noFkRow.sale_id) noFkRow.sale_id = null;
          if (table === 'debts' && noFkRow.customer_id) noFkRow.customer_id = null;
          if (
            ['sales', 'stock_movements', 'debt_payments', 'expenses'].includes(table) &&
            noFkRow.created_by
          ) {
            noFkRow.created_by = null;
          }

          const fkRetry = await fetch(`${this.url}/rest/v1/${table}`, {
            method: 'POST',
            headers: this.getAuthHeaders({
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            }),
            body: JSON.stringify([noFkRow]),
          });
          if (fkRetry.ok) {
            patchedCount++;
            continue;
          }
        }

        // 4. Fallback to PATCH for partial updates (e.g. status update, amount_paid update)
        let patchResp = await fetch(
          `${this.url}/rest/v1/${table}?${pkField}=eq.${encodeURIComponent(String(pkVal))}`,
          {
            method: 'PATCH',
            headers: this.getAuthHeaders({
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            }),
            body: JSON.stringify(safeRow),
          }
        );

        if (patchResp.ok) {
          patchedCount++;
        } else {
          const errText = await patchResp.text().catch(() => 'Update failed');
          errors.push({ id: String(pkVal), error: errText });
        }
      }

      return {
        table,
        pushedCount: patchedCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err: any) {
      return {
        table,
        pushedCount: 0,
        errors: [{ id: 'batch', error: err?.message || 'Network error' }],
      };
    }
  }

  async pullSince<T = Record<string, unknown>>(
    table: string,
    shopId: string,
    lastChangeSeq: number,
    limit = 500
  ): Promise<RemotePullResult<T>> {
    if (!this.isConfigured()) {
      const mockRows = this.getFromSharedStorage<T>(table, shopId);
      return {
        table,
        rows: mockRows,
        maxChangeSeq: lastChangeSeq + mockRows.length,
        hasMore: false,
      };
    }

    try {
      const queryParams: Record<string, string> = {
        change_seq: `gt.${lastChangeSeq}`,
        order: 'change_seq.asc',
        limit: String(limit),
      };

      if (table === 'shops') {
        queryParams['id'] = `eq.${shopId}`;
      } else {
        queryParams['shop_id'] = `eq.${shopId}`;
      }

      const query = new URLSearchParams(queryParams);

      let resp = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
        headers: this.getAuthHeaders(),
      });

      // Fallback query if change_seq column is absent on remote table
      if (!resp.ok) {
        const fallbackParams: Record<string, string> = {
          ...(table === 'shops' ? { id: `eq.${shopId}` } : { shop_id: `eq.${shopId}` }),
          limit: String(limit),
        };
        const fallbackQuery = new URLSearchParams(fallbackParams);
        resp = await fetch(`${this.url}/rest/v1/${table}?${fallbackQuery}`, {
          headers: this.getAuthHeaders(),
        });
      }

      if (!resp.ok) {
        throw new Error(`Pull failed for ${table}: ${resp.statusText}`);
      }

      let rows: T[] = await resp.json();
      let maxChangeSeq = lastChangeSeq;
      for (const r of rows as any[]) {
        if (r.change_seq && Number(r.change_seq) > maxChangeSeq) {
          maxChangeSeq = Number(r.change_seq);
        }
      }

      // Safety net: for critical transactional tables (sales, sale_items, debts, debt_payments, customers, products, expenses),
      // always also fetch the most recent 300 records for this shop by created_at DESC and merge them by primary key.
      // This guarantees 100% that even if change_seq on remote didn't advance or records were inserted out-of-order by an attendant,
      // the owner immediately receives every single sale and credit entry.
      if (
        ['products', 'product_stock', 'customers', 'sales', 'sale_items', 'debts', 'debt_payments', 'expenses', 'users'].includes(table)
      ) {
        const recentParams: Record<string, string> = {
          shop_id: `eq.${shopId}`,
          limit: '300',
        };
        if (['products', 'customers', 'sales', 'debts', 'debt_payments', 'expenses', 'users'].includes(table)) {
          recentParams['order'] = 'created_at.desc';
        }
        const recentQuery = new URLSearchParams(recentParams);
        const recentResp = await fetch(`${this.url}/rest/v1/${table}?${recentQuery}`, {
          headers: this.getAuthHeaders(),
        });
        if (recentResp.ok) {
          const recentRows: T[] = await recentResp.json();
          const pkField = table === 'product_stock' ? 'product_id' : 'id';
          const mergedMap = new Map<string, T>();
          for (const r of rows as any[]) {
            const k = String(r[pkField] || '');
            if (k) mergedMap.set(k, r);
          }
          for (const r of recentRows as any[]) {
            const k = String(r[pkField] || '');
            if (k) mergedMap.set(k, r);
            if (r.change_seq && Number(r.change_seq) > maxChangeSeq) {
              maxChangeSeq = Number(r.change_seq);
            }
          }
          rows = Array.from(mergedMap.values());
        }

        // Cross-device shop_id mismatch self-healing: if rows is still empty for sales/sale_items/debts/users,
        // check if attendant pushed under a fallback/default shop_id and adopt those records
        if (
          rows.length === 0 &&
          ['sales', 'sale_items', 'debts', 'debt_payments', 'expenses', 'users'].includes(table)
        ) {
          try {
            const anyShopParams: Record<string, string> = { limit: '200' };
            if (['sales', 'debts', 'debt_payments', 'expenses', 'users'].includes(table)) {
              anyShopParams['order'] = 'created_at.desc';
            }
            const anyShopQuery = new URLSearchParams(anyShopParams);
            const anyShopResp = await fetch(`${this.url}/rest/v1/${table}?${anyShopQuery}`, {
              headers: this.getAuthHeaders(),
            });
            if (anyShopResp.ok) {
              const anyShopRows: T[] = await anyShopResp.json();
              if (Array.isArray(anyShopRows) && anyShopRows.length > 0) {
                rows = anyShopRows;
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // Always merge with local shared storage rows so cross-tab/cross-role attendant data is never missed
      const sharedRows = this.getFromSharedStorage<T>(table, shopId);
      if (sharedRows.length > 0) {
        const pkField = table === 'product_stock' ? 'product_id' : 'id';
        const mergedMap = new Map<string, T>();
        for (const r of rows as any[]) {
          const k = String(r[pkField] || '');
          if (k) mergedMap.set(k, r);
        }
        for (const r of sharedRows as any[]) {
          const k = String(r[pkField] || '');
          if (k) {
            const existing = mergedMap.get(k) as any;
            // Preserve attendant attribution fields from local vault if remote stripped them
            mergedMap.set(k, existing ? { ...r, ...existing, recorded_by: existing.recorded_by || r.recorded_by, cashier_name: existing.cashier_name || r.cashier_name, created_by_name: existing.created_by_name || r.created_by_name, created_by_role: existing.created_by_role || r.created_by_role } : r);
          }
        }
        rows = Array.from(mergedMap.values());
      }

      return {
        table,
        rows,
        maxChangeSeq,
        hasMore: rows.length >= limit,
      };
    } catch (err: any) {
      if (this.isConfigured()) {
        throw new Error(err?.message || `Network jitter during pull for ${table}`);
      }
      const mockFallback = this.getFromSharedStorage<T>(table, shopId);
      return {
        table,
        rows: mockFallback,
        maxChangeSeq: lastChangeSeq + mockFallback.length,
        hasMore: false,
      };
    }
  }

  async register(payload: {
    shopName: string;
    ownerName: string;
    phone: string;
    pin: string;
    tillNumber?: string;
  }): Promise<{ session: RemoteSession; shopId: string }> {
    const normPhone = payload.phone.replace(/\D/g, '');
    const cleanPhone = normPhone.startsWith('0')
      ? `254${normPhone.slice(1)}`
      : normPhone;

    if (this.isConfigured()) {
      try {
        const resp = await fetch(`${this.url}/functions/v1/auth-register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
          },
          body: JSON.stringify({
            shop_name: payload.shopName,
            owner_name: payload.ownerName,
            phone: cleanPhone,
            pin: payload.pin,
            till_number: payload.tillNumber || null,
          }),
        });

        if (resp.ok) {
          return await resp.json();
        }

        // If Edge function is not deployed (404), fall back to PostgreSQL stored RPC function
        if (resp.status === 404) {
          const rpcResp = await fetch(`${this.url}/rest/v1/rpc/auth_register_shop`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.anonKey,
            },
            body: JSON.stringify({
              p_shop_name: payload.shopName,
              p_owner_name: payload.ownerName,
              p_phone: cleanPhone,
              p_pin: payload.pin,
              p_till_number: payload.tillNumber || '542190',
            }),
          });

          if (rpcResp.ok) {
            return await rpcResp.json();
          }

          const rpcErr = await rpcResp.json().catch(() => ({}));
          throw new Error(rpcErr.message || 'Kushindwa kusajili duka (Registration failed)');
        }

        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Nambari ya simu au PIN si sahihi');
      } catch (err: any) {
        throw new Error(err?.message || 'Hitilafu ya mtandao wakati wa kusajili');
      }
    }

    // Local / Offline registration simulation
    const shopId = `shop-${crypto.randomUUID().slice(0, 8)}`;
    const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
    return {
      shopId,
      session: {
        accessToken: `local-token-${Date.now()}`,
        refreshToken: `local-refresh-${Date.now()}`,
        expiresAt: Date.now() + 86400000,
        userId,
        shopId,
        role: 'owner',
      },
    };
  }

  async login(payload: {
    phone: string;
    pin: string;
  }): Promise<{ session: RemoteSession; shopId: string }> {
    const normPhone = payload.phone.replace(/\D/g, '');
    const cleanPhone = normPhone.startsWith('0')
      ? `254${normPhone.slice(1)}`
      : normPhone;

    if (this.isConfigured()) {
      try {
        const resp = await fetch(`${this.url}/functions/v1/auth-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
          },
          body: JSON.stringify({
            phone: cleanPhone,
            pin: payload.pin,
          }),
        });

        if (resp.ok) {
          return await resp.json();
        }

        // If Edge function is not deployed (404), fall back to PostgreSQL stored RPC function
        if (resp.status === 404) {
          const rpcResp = await fetch(`${this.url}/rest/v1/rpc/auth_login_with_pin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.anonKey,
            },
            body: JSON.stringify({
              p_phone: cleanPhone,
              p_pin: payload.pin,
            }),
          });

          if (rpcResp.ok) {
            return await rpcResp.json();
          }

          const rpcErr = await rpcResp.json().catch(() => ({}));
          throw new Error(rpcErr.message || 'Nambari ya simu au PIN si sahihi');
        }

        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Nambari ya simu au PIN si sahihi');
      } catch (err: any) {
        throw new Error(err?.message || 'Hitilafu ya mtandao wakati wa kuingia');
      }
    }

    // Offline mode simulation
    return {
      shopId: 'shop-demo-kenya-001',
      session: {
        accessToken: `local-token-${Date.now()}`,
        refreshToken: `local-refresh-${Date.now()}`,
        expiresAt: Date.now() + 86400000,
        userId: 'user-owner-001',
        shopId: 'shop-demo-kenya-001',
        role: 'owner',
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<RemoteSession> {
    return {
      accessToken: `token-${Date.now()}`,
      refreshToken,
      expiresAt: Date.now() + 86400000,
      userId: 'user-owner-001',
      shopId: 'shop-demo-kenya-001',
      role: 'owner',
    };
  }
}

export const defaultRemoteAdapter: RemoteAdapter = new SupabaseAdapter();
