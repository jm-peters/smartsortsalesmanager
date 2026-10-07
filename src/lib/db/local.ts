/**
 * Local Dexie IndexedDB Database & Repositories
 * Source of truth for the running app.
 * All mutations hit Dexie first, queue in the outbox, and run 100% offline.
 */

import Dexie, { type Table } from 'dexie';
import { type KES, toKES, addKES, subKES, mulKES, calculateLineProfit } from '../money';

// Standard Kenyan Currency Types
export type PaymentMethod = 'cash' | 'mpesa' | 'deni';
export type UserRole = 'owner' | 'attendant';

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  search_key: string;
  buying_price: KES | null;
  selling_price: KES;
  low_limit: number;
  unit: string;
  barcode: string | null;
  image_emoji: string;
  is_active: boolean;
  is_pinned?: boolean;
  pin_order?: number | null;
  pack_size?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  change_seq?: number;
  device_id: string;
  fractional_prices?: { qty: number; price: KES }[];
}

export type StockReason =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'void'
  | 'adjustment'
  | 'damage'
  | 'return';

export interface StockMovement {
  id: string;
  shop_id: string;
  product_id: string;
  delta: number; // +ve purchase/return, -ve sale/damage
  reason: StockReason;
  ref_type: string | null;
  ref_id: string | null;
  unit_cost: KES | null;
  note: string | null;
  created_at: string;
  server_created_at?: string;
  change_seq?: number;
  device_id: string;
  created_by: string;
}

export interface ProductStock {
  product_id: string;
  shop_id: string;
  qty: number;
  updated_at: string;
}

export interface SaleHeader {
  id: string;
  shop_id: string;
  sale_no: number;
  total: KES;
  total_profit: KES;
  item_count: number;
  payment_method: PaymentMethod;
  debt_id: string | null;
  status: 'completed' | 'void';
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  created_at: string;
  server_created_at?: string;
  updated_at: string;
  change_seq?: number;
  device_id: string;
  created_by: string;
  recorded_by?: string;
  cashier_name?: string;
  created_by_name?: string;
  created_by_role?: string;
  cash_session_id?: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  shop_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: KES;
  unit_cost: KES;
  cost_unknown: boolean;
  line_total: KES;
  line_profit: KES;
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  credit_limit: KES | null;
  credit_limit_set_by?: string | null;
  credit_limit_set_at?: string | null;
  credit_notes?: string | null;
  loyalty_points?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  change_seq?: number;
}

export interface Debt {
  id: string;
  shop_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  principal: KES;
  amount_paid: KES;
  status: 'open' | 'partial' | 'paid' | 'written_off';
  due_date: string | null;
  sale_id: string | null;
  override_reason?: string | null;
  created_at: string;
  updated_at: string;
  change_seq?: number;
  device_id: string;
  created_by?: string;
  recorded_by?: string;
  created_by_name?: string;
  created_by_role?: string;
}

export interface DebtPayment {
  id: string;
  shop_id: string;
  debt_id: string;
  amount: KES;
  method: 'cash' | 'mpesa';
  created_at: string;
  server_created_at?: string;
  change_seq?: number;
  device_id: string;
  created_by: string;
  cash_session_id?: string | null;
}

export type ExpenseCategory =
  | 'stock'
  | 'transport'
  | 'rent'
  | 'airtime'
  | 'electricity'
  | 'water'
  | 'wages'
  | 'licence'
  | 'food'
  | 'cash_drop'
  | 'other';

export interface Expense {
  id: string;
  shop_id: string;
  title: string;
  amount: KES;
  category: ExpenseCategory;
  payment_method: 'cash' | 'mpesa';
  is_cash_drop: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  change_seq?: number;
  device_id: string;
  created_by: string;
  cash_session_id?: string | null;
}

export interface CashSession {
  id: string;
  shop_id: string;
  shop_user_id: string;
  device_id: string;
  label: string;
  opened_at: string;
  opening_float: KES;
  closed_at: string | null;
  closed_by: string | null;
  expected_cash: KES | null;
  counted_cash: KES | null;
  cash_variance: KES | null;
  expected_mpesa: KES | null;
  counted_mpesa: KES | null;
  mpesa_variance: KES | null;
  total_sales: KES | null;
  total_profit: KES | null;
  total_expenses: KES | null;
  deni_issued: KES | null;
  deni_collected: KES | null;
  transaction_count: number | null;
  note: string | null;
  status: 'open' | 'closed' | 'abandoned';
}

// LOCAL-ONLY: Held Carts (never synced)
export interface HeldCart {
  id: string;
  shop_id: string;
  device_id: string;
  shop_user_id: string;
  label: string;
  items: Array<{
    product_id: string;
    product_name: string;
    qty: number;
    unit_price: KES;
    unit_cost: KES;
    image_emoji?: string;
  }>;
  total: KES;
  created_at: string;
}

// LOCAL-ONLY: Product stats for quick-sell scoring
export interface ProductStats {
  product_id: string;
  shop_id: string;
  sold_count_30d: number;
  last_sold_at: string;
  score: number;
}

export interface OutboxEntry {
  seq?: number;
  id: string;
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  attempts: number;
  next_attempt_at: string;
  last_error?: string | null;
}

export interface SyncState {
  table: string;
  last_change_seq: number;
  last_pull_at: string;
}

export interface MetaEntry {
  key: string;
  value: any;
}

export interface AuditLog {
  id: string;
  shop_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: any;
  after: any;
  created_at: string;
}

export class SmartSortDB extends Dexie {
  users!: Table<ShopUser, string>;
  products!: Table<Product, string>;
  stock_movements!: Table<StockMovement, string>;
  product_stock!: Table<ProductStock, string>;
  sales!: Table<SaleHeader, string>;
  sale_items!: Table<SaleItem, string>;
  customers!: Table<Customer, string>;
  debts!: Table<Debt, string>;
  debt_payments!: Table<DebtPayment, string>;
  expenses!: Table<Expense, string>;
  cash_sessions!: Table<CashSession, string>;
  held_carts!: Table<HeldCart, string>;
  product_stats!: Table<ProductStats, string>;
  outbox!: Table<OutboxEntry, number>;
  sync_state!: Table<SyncState, string>;
  meta!: Table<MetaEntry, string>;
  audit_log!: Table<AuditLog, string>;

  constructor() {
    super('SmartSortDB');
    this.version(1).stores({
      products: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+updated_at], search_key, is_pinned',
      stock_movements: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+product_id], ref_id',
      product_stock: 'product_id, shop_id, [shop_id+product_id]',
      sales: 'id, shop_id, created_at, [shop_id+created_at], sale_no, status, cash_session_id',
      sale_items: 'id, sale_id, product_id, shop_id',
      customers: 'id, shop_id, created_at, [shop_id+created_at], phone',
      debts: 'id, shop_id, created_at, [shop_id+created_at], customer_id, status',
      debt_payments: 'id, shop_id, debt_id, created_at, [shop_id+created_at], cash_session_id',
      expenses: 'id, shop_id, created_at, [shop_id+created_at], category, cash_session_id',
      cash_sessions: 'id, shop_id, opened_at, [shop_id+opened_at], status',
      held_carts: 'id, shop_id, created_at',
      product_stats: 'product_id, shop_id, score',
      outbox: '++seq, id, table, next_attempt_at, attempts',
      sync_state: 'table',
      meta: 'key',
      audit_log: 'id, shop_id, created_at, [shop_id+created_at], entity_id',
    });

    this.version(2).stores({
      products: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+updated_at], search_key, is_pinned',
      stock_movements: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+product_id], ref_id',
      product_stock: 'product_id, shop_id, [shop_id+product_id]',
      sales: 'id, shop_id, created_at, [shop_id+created_at], sale_no, status, cash_session_id',
      sale_items: 'id, sale_id, product_id, shop_id',
      customers: 'id, shop_id, created_at, [shop_id+created_at], phone',
      debts: 'id, shop_id, created_at, [shop_id+created_at], customer_id, status',
      debt_payments: 'id, shop_id, debt_id, created_at, [shop_id+created_at], cash_session_id',
      expenses: 'id, shop_id, created_at, [shop_id+created_at], category, cash_session_id',
      cash_sessions: 'id, shop_id, opened_at, [shop_id+opened_at], status',
      held_carts: 'id, shop_id, created_at',
      product_stats: 'product_id, shop_id, score',
      outbox: '++seq, id, table, next_attempt_at, attempts',
      sync_state: 'table',
      meta: 'key',
      audit_log: 'id, shop_id, created_at, [shop_id+created_at], entity_id',
    });

    this.version(3).stores({
      users: 'id, shop_id, email, phone, role',
      products: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+updated_at], search_key, is_pinned',
      stock_movements: 'id, shop_id, created_at, [shop_id+created_at], [shop_id+product_id], ref_id',
      product_stock: 'product_id, shop_id, [shop_id+product_id]',
      sales: 'id, shop_id, created_at, [shop_id+created_at], sale_no, status, cash_session_id',
      sale_items: 'id, sale_id, product_id, shop_id',
      customers: 'id, shop_id, created_at, [shop_id+created_at], phone',
      debts: 'id, shop_id, created_at, [shop_id+created_at], customer_id, status',
      debt_payments: 'id, shop_id, debt_id, created_at, [shop_id+created_at], cash_session_id',
      expenses: 'id, shop_id, created_at, [shop_id+created_at], category, cash_session_id',
      cash_sessions: 'id, shop_id, opened_at, [shop_id+opened_at], status',
      held_carts: 'id, shop_id, created_at',
      product_stats: 'product_id, shop_id, score',
      outbox: '++seq, id, table, next_attempt_at, attempts',
      sync_state: 'table',
      meta: 'key',
      audit_log: 'id, shop_id, created_at, [shop_id+created_at], entity_id',
    });
  }
}

export const db = new SmartSortDB();

// Direct Online Write-Through Sync Dispatcher
type DirectSyncDispatcher = (entries: OutboxEntry | OutboxEntry[]) => Promise<void>;
let directSyncDispatcher: DirectSyncDispatcher | null = null;

export function registerDirectSyncDispatcher(dispatcher: DirectSyncDispatcher) {
  directSyncDispatcher = dispatcher;
}

/**
 * Sends changes directly to Supabase immediately when online (without queueing in outbox),
 * and only queues to `db.outbox` when offline or if the direct network call fails.
 */
export async function syncWriteThrough(input: OutboxEntry | OutboxEntry[]): Promise<void> {
  const entries = Array.isArray(input) ? input : [input];
  if (entries.length === 0) return;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('smartsort_inventory_pulse', String(Date.now()));
    }
  } catch {
    // ignore
  }

  if (directSyncDispatcher) {
    await directSyncDispatcher(entries);
    return;
  }

  // Fallback if sync engine has not finished initializing yet
  await db.outbox.bulkAdd(entries);
}

// Clock skew compensation
let localClockSkewMs = 0;

export function setClockSkew(skewMs: number) {
  localClockSkewMs = skewMs;
}

export function serverNow(): string {
  const adjusted = Date.now() + localClockSkewMs;
  return new Date(adjusted).toISOString();
}

/**
 * Generate normalized search key: lowercased, unaccented, trimmed
 */
export function generateSearchKey(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Ensure device ID exists and persists
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.meta.get('device_id');
  if (existing?.value) return existing.value;
  const newId = crypto.randomUUID();
  await db.meta.put({ key: 'device_id', value: newId });
  return newId;
}

/**
 * Get active shop profile or default
 */
export interface ShopMeta {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  till_number: string;
  paybill_number?: string;
  account_number?: string;
  include_credit_in_gross_sales?: boolean;
  role: UserRole;
  user_id: string;
  avatar_emoji?: string;
  tagline?: string | null;
  contact_email?: string | null;
  alt_phone?: string | null;
  county?: string | null;
  sub_county?: string | null;
  town?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_captured_at?: string | null;
  pin_hash?: string;
  pin_salt?: string;
  default_credit_limit?: KES;
  receipt_footer?: string;
  business_cutoff_hour?: number;
  plan_code?: string;
  plan_name?: string;
  plan_amount_kes?: number | null;
  plan_status?: 'active' | 'past_due' | 'suspended' | 'cancelled';
  subscription_paid_until?: string | null;
  trial_ends_at?: string | null; // legacy fallback
  preferred_payment_method?: 'mpesa' | 'cash' | null;
  plan_acknowledged?: boolean;
  created_at?: string;
  active_loan_amount?: number;
  active_loan_balance?: number;
  active_loan_due_date?: string;
  active_loan_duration?: number;
  active_loan_status?: 'none' | 'pending' | 'approved' | 'disbursed' | 'paid' | 'pending_approval' | 'declined';
  loan_limit?: number;
  simulate_three_months_active?: boolean;
  manual_limit_set?: boolean;
  loyalty_enabled?: boolean;
  loyalty_points_per_100_kes?: number;
  admin_reminder_text?: string | null;
  subscription_reminder_active?: boolean;
}

export interface SubscriptionPaymentRecord {
  id: string;
  shop_id: string;
  days: number;
  amount_kes: number;
  payment_method: 'mpesa_stk' | 'mpesa_till' | 'manual';
  transaction_code?: string | null;
  phone?: string | null;
  paid_at: string;
  valid_until: string;
  created_at: string;
}

export async function getShopMeta(): Promise<ShopMeta> {
  const meta = await db.meta.get('shop_info');

  const defaultMeta: ShopMeta = {
    shop_id: 'shop-demo-kenya-001',
    shop_name: 'Smartsort Shop',
    owner_name: 'Smartsort User',
    phone: '',
    till_number: '247247',
    paybill_number: '247247',
    account_number: '253499',
    include_credit_in_gross_sales: true,
    role: 'owner',
    user_id: 'user-owner-001',
    avatar_emoji: '🏪',
    tagline: 'Leading Kenyan Retail Solutions',
    contact_email: 'smartsort@shop.com',
    county: 'Nairobi',
    sub_county: 'Westlands',
    town: 'Westlands',
    landmark: 'Smartsort HQ',
    default_credit_limit: toKES(3000),
    receipt_footer: 'Powered by Smartsort Solutions',
    business_cutoff_hour: 22,
    plan_code: 'daily_30',
    plan_name: 'Daily Access Plan (KES 30/day)',
    plan_amount_kes: 30,
    plan_status: 'active',
    subscription_paid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    preferred_payment_method: 'mpesa',
    plan_acknowledged: true,
    created_at: new Date().toISOString(),
  };

  if (meta?.value) {
    return {
      ...defaultMeta,
      ...meta.value,
      shop_name: meta.value.shop_name || meta.value.name || defaultMeta.shop_name,
      avatar_emoji: meta.value.avatar_emoji || defaultMeta.avatar_emoji,
      county: meta.value.county || defaultMeta.county,
      town: meta.value.town || defaultMeta.town,
    };
  }

  return defaultMeta;
}

/**
 * Record a subscription payment (KES 30/day), advance the subscription expiry,
 * update shop meta, and queue for Supabase cloud sync via Outbox.
 */
export async function recordSubscriptionPayment(payload: {
  days: number;
  amount: number;
  paymentMethod: 'mpesa_stk' | 'mpesa_till' | 'manual';
  transactionCode?: string;
  phone?: string;
}): Promise<ShopMeta> {
  const current = await getShopMeta();
  const nowMs = Date.now();
  const currentExpiry = current.subscription_paid_until
    ? new Date(current.subscription_paid_until).getTime()
    : nowMs;
  const baseTime = currentExpiry > nowMs ? currentExpiry : nowMs;
  const newExpiry = new Date(baseTime + payload.days * 24 * 60 * 60 * 1000).toISOString();
  const paymentId = crypto.randomUUID();
  const nowIso = serverNow();

  const paymentRecord: SubscriptionPaymentRecord = {
    id: paymentId,
    shop_id: current.shop_id,
    days: payload.days,
    amount_kes: payload.amount,
    payment_method: payload.paymentMethod,
    transaction_code: payload.transactionCode || null,
    phone: payload.phone || current.phone || null,
    paid_at: nowIso,
    valid_until: newExpiry,
    created_at: nowIso,
  };

  const updatedShop = await saveShopMeta({
    plan_status: 'active',
    plan_code: 'daily_30',
    plan_name: 'Daily Access Plan (KES 30/day)',
    plan_amount_kes: 30,
    subscription_paid_until: newExpiry,
    plan_acknowledged: true,
  });

  // Send directly to Supabase if online (or queue in outbox if offline)
  void syncWriteThrough({
    id: paymentId,
    table: 'subscription_payments',
    op: 'insert',
    payload: paymentRecord as unknown as Record<string, unknown>,
    attempts: 0,
    next_attempt_at: nowIso,
  });

  return updatedShop;
}

export async function saveShopMeta(shopInfo: Partial<ShopMeta>): Promise<ShopMeta> {
  const current = await getShopMeta();
  const updated = { ...current, ...shopInfo };
  await db.meta.put({ key: 'shop_info', value: updated });
  try {
    const branchesMeta = await db.meta.get('owner_branches');
    if (Array.isArray(branchesMeta?.value)) {
      const nextBranches = branchesMeta.value.map((b: ShopMeta) =>
        b.shop_id === updated.shop_id ? { ...b, ...updated } : b
      );
      await db.meta.put({ key: 'owner_branches', value: nextBranches });
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smartsort_shop_meta_updated', { detail: updated }));
  }

  const now = serverNow();

  // Audit log if shop name has changed
  if (shopInfo.shop_name && shopInfo.shop_name !== current.shop_name) {
    try {
      await db.audit_log.put({
        id: crypto.randomUUID(),
        shop_id: updated.shop_id,
        actor_user_id: updated.user_id,
        action: 'update_shop_name',
        entity_type: 'shops',
        entity_id: updated.shop_id,
        before: { shop_name: current.shop_name },
        after: { shop_name: updated.shop_name },
        created_at: now,
      });
    } catch (e) {
      console.warn('Could not record shop rename audit log:', e);
    }
  }

  // Sync directly to Supabase shops table if online, or queue to outbox if offline
  try {
    const payload: Record<string, unknown> = {
      id: updated.shop_id,
      shop_name: updated.shop_name,
      owner_name: updated.owner_name,
      phone: updated.phone,
      till_number: updated.till_number,
      avatar_emoji: updated.avatar_emoji,
      tagline: updated.tagline,
      contact_email: updated.contact_email,
      alt_phone: updated.alt_phone,
      county: updated.county,
      sub_county: updated.sub_county,
      town: updated.town,
      landmark: updated.landmark,
      latitude: updated.latitude,
      longitude: updated.longitude,
      receipt_footer: updated.receipt_footer,
      default_credit_limit: updated.default_credit_limit,
      plan_code: updated.plan_code,
      plan_name: updated.plan_name,
      plan_status: updated.plan_status,
      subscription_paid_until: updated.subscription_paid_until,
      preferred_payment_method: updated.preferred_payment_method,
      updated_at: now,
    };

    void syncWriteThrough({
      id: updated.shop_id,
      table: 'shops',
      op: 'update',
      payload,
      attempts: 0,
      next_attempt_at: now,
    });
  } catch (e) {
    console.warn('Could not sync shop update:', e);
  }

  return updated;
}

export async function adjustCustomerLoyaltyPoints(customerId: string, pointsDelta: number): Promise<void> {
  const now = serverNow();
  const cust = await db.customers.get(customerId);
  if (!cust) return;
  const newPoints = Math.max(0, (cust.loyalty_points || 0) + pointsDelta);
  await db.customers.update(customerId, {
    loyalty_points: newPoints,
    updated_at: now,
  });
  void syncWriteThrough({
    id: customerId,
    table: 'customers',
    op: 'update',
    payload: { id: customerId, loyalty_points: newPoints, updated_at: now },
    attempts: 0,
    next_attempt_at: now,
  });
}

/**
 * Recalculate stock for all products or a single product from append-only ledger
 */
export async function recalculateStockFromLedger(productId?: string): Promise<void> {
  const shop = await getShopMeta();
  const now = serverNow();

  if (productId) {
    const movements = await db.stock_movements
      .where('[shop_id+product_id]')
      .equals([shop.shop_id, productId])
      .toArray();
    const sumDelta = movements.reduce((acc, m) => acc + m.delta, 0);
    await db.product_stock.put({
      product_id: productId,
      shop_id: shop.shop_id,
      qty: sumDelta,
      updated_at: now,
    });
  } else {
    const allMovements = await db.stock_movements.toArray();
    const movements = allMovements.filter((m) => !m.shop_id || m.shop_id === shop.shop_id);
    const map = new Map<string, number>();
    for (const m of movements) {
      map.set(m.product_id, (map.get(m.product_id) || 0) + m.delta);
    }
    const allProducts = await db.products.toArray();
    const products = allProducts.filter((p) => !p.deleted_at && (!p.shop_id || p.shop_id === shop.shop_id));

    const existingStocks = await db.product_stock.toArray();
    const existingMap = new Map<string, number>();
    for (const es of existingStocks) {
      existingMap.set(es.product_id, es.qty);
    }

    for (const p of products) {
      let qty = 0;
      if (map.has(p.id)) {
        qty = map.get(p.id)!;
      } else if ((p as any).stock !== undefined && (p as any).stock !== null) {
        qty = Number((p as any).stock);
      } else if (existingMap.has(p.id)) {
        qty = existingMap.get(p.id)!;
      }

      await db.product_stock.put({
        product_id: p.id,
        shop_id: p.shop_id || shop.shop_id,
        qty,
        updated_at: now,
      });
    }
  }
}

/**
 * Seed Kenyan Duka Demo Catalog
 */
export async function seedKenyanDukaDemo(force = false): Promise<void> {
  const count = await db.products.count();
  if (count > 0 && !force) return;

  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();

  const demoCatalog = [
    {
      name: 'Sukari 1kg (Sugar)',
      buy: 150,
      sell: 175,
      emoji: '🧂',
      unit: 'kg',
      low: 5,
      pack: 20,
      fractional: [
        { qty: 0.25, price: toKES(45) },
        { qty: 0.5, price: toKES(90) },
        { qty: 0.75, price: toKES(135) },
      ],
    },
    {
      name: 'Mchele Pishori 1kg (Rice)',
      buy: 180,
      sell: 220,
      emoji: '🍚',
      unit: 'kg',
      low: 5,
      pack: 20,
      fractional: [
        { qty: 0.25, price: toKES(60) },
        { qty: 0.5, price: toKES(115) },
        { qty: 0.75, price: toKES(170) },
      ],
    },
    {
      name: 'Mafuta Rina 1L (Cooking Oil)',
      buy: 230,
      sell: 270,
      emoji: '🫒',
      unit: 'ltr',
      low: 4,
      pack: 12,
      fractional: [
        { qty: 0.25, price: toKES(70) },
        { qty: 0.5, price: toKES(140) },
        { qty: 0.75, price: toKES(205) },
      ],
    },
    { name: 'Unga Jogoo 2kg (Maize meal)', buy: 140, sell: 165, emoji: '🌽', unit: 'pcs', low: 10, pack: 12 },
    { name: 'Maziwa KCC 500ml (Fresh Milk)', buy: 55, sell: 65, emoji: '🥛', unit: 'pcs', low: 8, pack: 18 },
    { name: 'Mkate Festo 400g (Bread)', buy: 55, sell: 65, emoji: '🍞', unit: 'pcs', low: 6, pack: 20 },
    { name: 'Majani Ketepa Chai 50g', buy: 45, sell: 55, emoji: '☕', unit: 'pcs', low: 8, pack: 24 },
    { name: 'Omo / Sunlight 200g', buy: 50, sell: 60, emoji: '🧼', unit: 'pcs', low: 5, pack: 24 },
    { name: 'Mayai (Egg single)', buy: 13, sell: 18, emoji: '🥚', unit: 'pcs', low: 15, pack: 30 },
    { name: 'Soda Coca-Cola 300ml Glass', buy: 35, sell: 45, emoji: '🥤', unit: 'pcs', low: 12, pack: 24 },
    { name: 'Royco Mchuzi Mix 200g', buy: 85, sell: 100, emoji: '🍲', unit: 'pcs', low: 5, pack: 12 },
    { name: 'Sabuni Geisha 225g', buy: 85, sell: 105, emoji: '🧼', unit: 'pcs', low: 6, pack: 24 },
    { name: 'Chumvi Kensalt 500g', buy: 25, sell: 35, emoji: '🧂', unit: 'pcs', low: 8, pack: 40 },
    { name: 'Airtime Safaricom 100', buy: 96, sell: 100, emoji: '📱', unit: 'pcs', low: 10, pack: 50 },
    { name: 'Kiberiti (Matches Box)', buy: 4, sell: 5, emoji: '🔥', unit: 'pcs', low: 20, pack: 100 },
  ];

  const demoOutboxEntries: OutboxEntry[] = [];

  await db.transaction('rw', [db.products, db.stock_movements, db.product_stock], async () => {
    for (let i = 0; i < demoCatalog.length; i++) {
      const item = demoCatalog[i] as any;
      const prodId = `prod-kenya-${i + 1}`;
      const product: Product = {
        id: prodId,
        shop_id: shop.shop_id,
        name: item.name,
        search_key: generateSearchKey(item.name),
        buying_price: toKES(item.buy),
        selling_price: toKES(item.sell),
        low_limit: item.low,
        unit: item.unit,
        barcode: null,
        image_emoji: item.emoji,
        is_active: true,
        is_pinned: i < 3, // Pin top 3 by default
        pin_order: i < 3 ? i + 1 : null,
        pack_size: item.pack,
        fractional_prices: item.fractional || undefined,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
      };

      await db.products.put(product);

      // Initial opening stock
      const openingStock = item.low * 3;
      const moveId = crypto.randomUUID();
      const movement: StockMovement = {
        id: moveId,
        shop_id: shop.shop_id,
        product_id: prodId,
        delta: openingStock,
        reason: 'opening',
        ref_type: 'opening',
        ref_id: null,
        unit_cost: toKES(item.buy),
        note: 'Mwanzo wa duka',
        created_at: now,
        device_id: deviceId,
        created_by: shop.user_id,
      };
      await db.stock_movements.put(movement);

      await db.product_stock.put({
        product_id: prodId,
        shop_id: shop.shop_id,
        qty: openingStock,
        updated_at: now,
      });

      demoOutboxEntries.push({
        id: prodId,
        table: 'products',
        op: 'insert',
        payload: product as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
      demoOutboxEntries.push({
        id: moveId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    }
  });

  void syncWriteThrough(demoOutboxEntries);
}

/**
 * Get or automatically open active cash session for current user and device
 */
export async function getActiveCashSession(): Promise<CashSession> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();

  const openSession = await db.cash_sessions
    .where('shop_id')
    .equals(shop.shop_id)
    .filter((s) => s.status === 'open' && s.shop_user_id === shop.user_id && s.device_id === deviceId)
    .first();

  if (openSession) {
    // Check if session has been open more than 18 hours -> auto-abandon
    const openedTime = new Date(openSession.opened_at).getTime();
    const hoursOpen = (Date.now() - openedTime) / (1000 * 60 * 60);
    if (hoursOpen > 18) {
      await db.cash_sessions.update(openSession.id, {
        status: 'abandoned',
        closed_at: now,
        note: 'Auto-closed after 18h inactivity',
      });
    } else {
      return openSession;
    }
  }

  // Open fresh session
  const newSessionId = crypto.randomUUID();
  const newSession: CashSession = {
    id: newSessionId,
    shop_id: shop.shop_id,
    shop_user_id: shop.user_id,
    device_id: deviceId,
    label: new Date().getHours() < 13 ? 'Asubuhi' : 'Jioni',
    opened_at: now,
    opening_float: toKES(0),
    closed_at: null,
    closed_by: null,
    expected_cash: null,
    counted_cash: null,
    cash_variance: null,
    expected_mpesa: null,
    counted_mpesa: null,
    mpesa_variance: null,
    total_sales: null,
    total_profit: null,
    total_expenses: null,
    deni_issued: null,
    deni_collected: null,
    transaction_count: null,
    note: null,
    status: 'open',
  };

  await db.cash_sessions.put(newSession);
  void syncWriteThrough({
    id: newSessionId,
    table: 'cash_sessions',
    op: 'insert',
    payload: newSession as unknown as Record<string, unknown>,
    attempts: 0,
    next_attempt_at: now,
  });

  return newSession;
}

/**
 * Recompute Expected Cash for a session locally from Dexie:
 * expected_cash = opening_float + cash_sales + cash_debt_payments - cash_expenses (including cash drops)
 */
export async function calculateSessionExpectedCash(sessionId: string): Promise<{
  expectedCash: KES;
  cashSales: KES;
  cashDeniPayments: KES;
  cashExpenses: KES;
  cashDrops: KES;
  totalSales: KES;
  totalProfit: KES;
  totalExpenses: KES;
  deniIssued: KES;
  transactionCount: number;
  mpesaSales: KES;
}> {
  const session = await db.cash_sessions.get(sessionId);
  if (!session) {
    return {
      expectedCash: toKES(0),
      cashSales: toKES(0),
      cashDeniPayments: toKES(0),
      cashExpenses: toKES(0),
      cashDrops: toKES(0),
      totalSales: toKES(0),
      totalProfit: toKES(0),
      totalExpenses: toKES(0),
      deniIssued: toKES(0),
      transactionCount: 0,
      mpesaSales: toKES(0),
    };
  }

  const sales = await db.sales
    .where('cash_session_id')
    .equals(sessionId)
    .filter((s) => s.status === 'completed')
    .toArray();

  let cashSales = toKES(0);
  let mpesaSales = toKES(0);
  let deniIssued = toKES(0);
  let totalSales = toKES(0);
  let totalProfit = toKES(0);

  for (const s of sales) {
    totalSales = addKES(totalSales, s.total);
    totalProfit = addKES(totalProfit, s.total_profit);
    if (s.payment_method === 'cash') cashSales = addKES(cashSales, s.total);
    else if (s.payment_method === 'mpesa') mpesaSales = addKES(mpesaSales, s.total);
    else if (s.payment_method === 'deni') deniIssued = addKES(deniIssued, s.total);
  }

  const debtPayments = await db.debt_payments
    .where('cash_session_id')
    .equals(sessionId)
    .toArray();

  let cashDeniPayments = toKES(0);
  for (const dp of debtPayments) {
    if (dp.method === 'cash') {
      cashDeniPayments = addKES(cashDeniPayments, dp.amount);
    }
  }

  const expenses = await db.expenses
    .where('cash_session_id')
    .equals(sessionId)
    .filter((e) => e.deleted_at === null)
    .toArray();

  let cashExpenses = toKES(0);
  let cashDrops = toKES(0);
  let totalExpenses = toKES(0);

  for (const exp of expenses) {
    if (exp.is_cash_drop) {
      cashDrops = addKES(cashDrops, exp.amount);
    } else {
      totalExpenses = addKES(totalExpenses, exp.amount);
    }

    if (exp.payment_method === 'cash') {
      cashExpenses = addKES(cashExpenses, exp.amount);
    }
  }

  // expected_cash = opening_float + cash_sales + cash_debt_payments - cash_expenses (all cash expenses + drops)
  const expectedCash = subKES(
    addKES(addKES(session.opening_float, cashSales), cashDeniPayments),
    cashExpenses
  );

  return {
    expectedCash,
    cashSales,
    cashDeniPayments,
    cashExpenses,
    cashDrops,
    totalSales,
    totalProfit,
    totalExpenses,
    deniIssued,
    transactionCount: sales.length,
    mpesaSales,
  };
}

/**
 * Record Sale Transaction
 * Single Dexie transaction writes:
 * 1. Sale header
 * 2. Sale line items
 * 3. Append-only stock movements (delta = -qty)
 * 4. Updates product_stock cache
 * 5. If Deni, creates/updates debt
 * 6. Queues all outbox entries
 */
export async function recordSale(saleData: {
  paymentMethod: PaymentMethod;
  items: Array<{
    product: Product;
    qty: number;
    unitPrice: KES;
    overridePrice?: KES | null;
    lineTotalOverride?: KES | null;
    portionLabel?: string;
  }>;
  customer?: {
    id?: string;
    name: string;
    phone?: string | null;
  } | null;
  creditOverrideReason?: string | null;
}): Promise<{ sale: SaleHeader; items: SaleItem[] }> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();
  const activeSession = await getActiveCashSession();

  const saleId = crypto.randomUUID();
  const existingSalesCount = await db.sales.count();
  const saleNo = existingSalesCount + 1;

  let totalAmount = toKES(0);
  let totalProfit = toKES(0);
  let itemCount = 0;

  const saleItems: SaleItem[] = [];
  const stockMovements: StockMovement[] = [];
  const outboxEntries: OutboxEntry[] = [];

  for (const line of saleData.items) {
    const finalUnitPrice = line.overridePrice ?? line.unitPrice;
    const lineTotal = line.lineTotalOverride != null ? line.lineTotalOverride : mulKES(finalUnitPrice, line.qty);
    const unitCost = line.product.buying_price;

    const { lineProfit, costUnknown } = calculateLineProfit(
      line.lineTotalOverride != null && line.qty > 0 ? toKES(Math.round(line.lineTotalOverride / line.qty)) : finalUnitPrice,
      unitCost,
      line.qty
    );

    totalAmount = addKES(totalAmount, lineTotal);
    totalProfit = addKES(totalProfit, lineProfit);
    itemCount += line.qty;

    const displayName = line.portionLabel
      ? `${line.portionLabel} ${line.product.name}`
      : line.product.name;

    const itemId = crypto.randomUUID();
    const saleItem: SaleItem = {
      id: itemId,
      sale_id: saleId,
      shop_id: shop.shop_id,
      product_id: line.product.id,
      product_name: displayName,
      qty: line.qty,
      unit_price: line.lineTotalOverride != null && line.qty > 0 ? toKES(Math.round(line.lineTotalOverride / line.qty)) : finalUnitPrice,
      unit_cost: unitCost ?? toKES(0),
      cost_unknown: costUnknown,
      line_total: lineTotal,
      line_profit: lineProfit,
    };
    saleItems.push(saleItem);

    // Append-only stock movement
    const movementId = crypto.randomUUID();
    const movement: StockMovement = {
      id: movementId,
      shop_id: shop.shop_id,
      product_id: line.product.id,
      delta: -line.qty,
      reason: 'sale',
      ref_type: 'sale',
      ref_id: saleId,
      unit_cost: unitCost ?? null,
      note: `Sale #${saleNo}`,
      created_at: now,
      device_id: deviceId,
      created_by: shop.user_id,
    };
    stockMovements.push(movement);
  }

  let debtId: string | null = null;
  let debtRecord: Debt | null = null;

  if (saleData.paymentMethod === 'deni' && saleData.customer) {
    debtId = crypto.randomUUID();
    let customerId = saleData.customer.id;

    if (!customerId) {
      // Create customer first
      customerId = crypto.randomUUID();
      const newCust: Customer = {
        id: customerId,
        shop_id: shop.shop_id,
        name: saleData.customer.name,
        phone: saleData.customer.phone || null,
        notes: null,
        credit_limit: shop.default_credit_limit ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      await db.customers.put(newCust);
      outboxEntries.push({
        id: customerId,
        table: 'customers',
        op: 'insert',
        payload: newCust as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    }

    debtRecord = {
      id: debtId,
      shop_id: shop.shop_id,
      customer_id: customerId,
      customer_name: saleData.customer.name,
      customer_phone: saleData.customer.phone || null,
      principal: totalAmount,
      amount_paid: toKES(0),
      status: 'open',
      due_date: null,
      sale_id: saleId,
      override_reason: saleData.creditOverrideReason || null,
      created_at: now,
      updated_at: now,
      device_id: deviceId,
    };
  }

  // Loyalty points calculation if enabled
  if (shop.loyalty_enabled && saleData.customer && saleData.customer.name.trim()) {
    let custId = saleData.customer.id;
    let existingCust = custId ? await db.customers.get(custId) : null;
    if (!existingCust && saleData.customer.name) {
      const allC = await db.customers.where('name').equalsIgnoreCase(saleData.customer.name.trim()).toArray();
      existingCust = allC.find(c => c.deleted_at === null);
      if (existingCust) custId = existingCust.id;
    }

    const pointsPer100 = shop.loyalty_points_per_100_kes ?? 1;
    const pointsEarned = Math.floor(totalAmount / 100) * pointsPer100;
    if (pointsEarned > 0) {
      if (existingCust && custId) {
        const newPoints = (existingCust.loyalty_points || 0) + pointsEarned;
        await db.customers.update(custId, { loyalty_points: newPoints, updated_at: now });
        outboxEntries.push({
          id: custId,
          table: 'customers',
          op: 'update',
          payload: { id: custId, loyalty_points: newPoints, updated_at: now },
          attempts: 0,
          next_attempt_at: now,
        });
      } else {
        const newCustId = custId || crypto.randomUUID();
        const newCust: Customer = {
          id: newCustId,
          shop_id: shop.shop_id,
          name: saleData.customer.name.trim(),
          phone: saleData.customer.phone || null,
          notes: null,
          credit_limit: shop.default_credit_limit ?? null,
          loyalty_points: pointsEarned,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        await db.customers.put(newCust);
        outboxEntries.push({
          id: newCustId,
          table: 'customers',
          op: 'insert',
          payload: newCust as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });
      }
    }
  }

  const activeUser = await getShopUser();
  const staffAttendants = await getStaffAttendants();
  let creatorRole: UserRole = activeUser?.role || shop.role || 'owner';
  let creatorId = activeUser?.id || shop.user_id;

  // Match against staff attendants if logged in as attendant
  const matchedAtt = staffAttendants.find(
    (a) =>
      a.id === creatorId ||
      (activeUser?.email && a.email?.toLowerCase() === activeUser.email.toLowerCase()) ||
      (activeUser?.phone && a.phone.toLowerCase() === activeUser.phone.toLowerCase())
  );
  if (matchedAtt) {
    creatorRole = 'attendant';
  }

  const rawCashierName =
    (matchedAtt?.name || activeUser?.name || '').trim();
  const isGenericDefaultName =
    !rawCashierName ||
    rawCashierName.toLowerCase() === 'smartsort user' ||
    rawCashierName.toLowerCase() === 'cashier';

  const cashierName = isGenericDefaultName
    ? creatorRole === 'owner'
      ? (shop.owner_name && shop.owner_name !== 'Smartsort User' ? shop.owner_name : activeUser?.username || 'Shop Owner')
      : (matchedAtt?.name || activeUser?.username || 'Attendant')
    : rawCashierName;

  if (debtRecord) {
    debtRecord.created_by = creatorId;
    debtRecord.recorded_by = cashierName;
    debtRecord.created_by_name = cashierName;
    debtRecord.created_by_role = creatorRole;
  }

  const saleHeader: SaleHeader = {
    id: saleId,
    shop_id: shop.shop_id,
    sale_no: saleNo,
    total: totalAmount,
    total_profit: totalProfit,
    item_count: itemCount,
    payment_method: saleData.paymentMethod,
    debt_id: debtId,
    status: 'completed',
    voided_at: null,
    void_reason: null,
    voided_by: null,
    created_at: now,
    updated_at: now,
    device_id: deviceId,
    created_by: creatorId,
    recorded_by: cashierName,
    cashier_name: cashierName,
    created_by_name: cashierName,
    created_by_role: creatorRole,
    cash_session_id: activeSession.id,
  };

  // Perform transactional atomic write in Dexie
  await db.transaction(
    'rw',
    [
      db.sales,
      db.sale_items,
      db.stock_movements,
      db.product_stock,
      db.debts,
      db.customers,
      db.outbox,
      db.audit_log,
    ],
    async () => {
      // 1. Write Header
      await db.sales.put(saleHeader);
      outboxEntries.push({
        id: saleId,
        table: 'sales',
        op: 'insert',
        payload: saleHeader as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });

      // 2. Write Items
      for (const it of saleItems) {
        await db.sale_items.put(it);
        outboxEntries.push({
          id: it.id,
          table: 'sale_items',
          op: 'insert',
          payload: it as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });
      }

      // 3. Write Stock Movements & update stock cache
      for (const sm of stockMovements) {
        await db.stock_movements.put(sm);
        outboxEntries.push({
          id: sm.id,
          table: 'stock_movements',
          op: 'insert',
          payload: sm as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });

        // Update local product_stock cache
        const currentStock = await db.product_stock.get(sm.product_id);
        const newQty = (currentStock?.qty || 0) + sm.delta;
        await db.product_stock.put({
          product_id: sm.product_id,
          shop_id: shop.shop_id,
          qty: newQty,
          updated_at: now,
        });
        outboxEntries.push({
          id: sm.product_id,
          table: 'product_stock',
          op: 'update',
          payload: {
            product_id: sm.product_id,
            shop_id: shop.shop_id,
            qty: newQty,
            updated_at: now,
          },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      // 4. If Deni, write debt
      if (debtRecord) {
        await db.debts.put(debtRecord);
        outboxEntries.push({
          id: debtRecord.id,
          table: 'debts',
          op: 'insert',
          payload: debtRecord as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });

        if (saleData.creditOverrideReason) {
          await db.audit_log.put({
            id: crypto.randomUUID(),
            shop_id: shop.shop_id,
            actor_user_id: shop.user_id,
            action: 'credit_limit_override',
            entity_type: 'debts',
            entity_id: debtRecord.id,
            before: null,
            after: { reason: saleData.creditOverrideReason, amount: totalAmount },
            created_at: now,
          });
        }
      }
    }
  );

  // 5. Direct online write-through to Supabase (or queue in outbox if offline)
  void syncWriteThrough(outboxEntries);

  return { sale: saleHeader, items: saleItems };
}

/**
 * 30-Second Undo: Void a sale
 * Reverses stock movements (delta = +qty), marks sale void, preserves audit trail
 */
export async function voidSale(saleId: string, reason = 'Customer mis-tap / 30s undo'): Promise<boolean> {
  const sale = await db.sales.get(saleId);
  if (!sale || sale.status === 'void') return false;

  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();

  const items = await db.sale_items.where('sale_id').equals(saleId).toArray();
  const voidSyncEntries: OutboxEntry[] = [];

  await db.transaction(
    'rw',
    [db.sales, db.stock_movements, db.product_stock, db.debts, db.audit_log],
    async () => {
      // 1. Mark sale void
      await db.sales.update(saleId, {
        status: 'void',
        voided_at: now,
        void_reason: reason,
        voided_by: shop.user_id,
        updated_at: now,
      });

      // 2. Reverse stock movements
      for (const it of items) {
        const revMovementId = crypto.randomUUID();
        const revMovement: StockMovement = {
          id: revMovementId,
          shop_id: shop.shop_id,
          product_id: it.product_id,
          delta: it.qty, // Reversing negative sale delta
          reason: 'void',
          ref_type: 'sale_void',
          ref_id: saleId,
          unit_cost: it.unit_cost,
          note: `Void sale #${sale.sale_no}`,
          created_at: now,
          device_id: deviceId,
          created_by: shop.user_id,
        };
        await db.stock_movements.put(revMovement);

        const currentStock = await db.product_stock.get(it.product_id);
        const newQty = (currentStock?.qty || 0) + it.qty;
        await db.product_stock.put({
          product_id: it.product_id,
          shop_id: shop.shop_id,
          qty: newQty,
          updated_at: now,
        });

        voidSyncEntries.push({
          id: revMovementId,
          table: 'stock_movements',
          op: 'insert',
          payload: revMovement as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });
        voidSyncEntries.push({
          id: it.product_id,
          table: 'product_stock',
          op: 'update',
          payload: {
            product_id: it.product_id,
            shop_id: shop.shop_id,
            qty: newQty,
            updated_at: now,
          },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      // 3. Void debt if applicable
      if (sale.debt_id) {
        await db.debts.update(sale.debt_id, {
          status: 'written_off',
          updated_at: now,
        });
        voidSyncEntries.push({
          id: sale.debt_id,
          table: 'debts',
          op: 'update',
          payload: { id: sale.debt_id, status: 'written_off', updated_at: now },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      // 4. Audit log
      await db.audit_log.put({
        id: crypto.randomUUID(),
        shop_id: shop.shop_id,
        actor_user_id: shop.user_id,
        action: 'void_sale',
        entity_type: 'sales',
        entity_id: saleId,
        before: { status: 'completed' },
        after: { status: 'void', reason },
        created_at: now,
      });

      // 5. Sale update entry
      voidSyncEntries.push({
        id: saleId,
        table: 'sales',
        op: 'update',
        payload: {
          id: saleId,
          status: 'void',
          voided_at: now,
          void_reason: reason,
          voided_by: shop.user_id,
          updated_at: now,
        },
        attempts: 0,
        next_attempt_at: now,
      });
    }
  );

  void syncWriteThrough(voidSyncEntries);

  return true;
}

/**
 * Record Quick Expense (Feature 7)
 */
export async function recordExpense(data: {
  title: string;
  amount: KES;
  category: ExpenseCategory;
  paymentMethod: 'cash' | 'mpesa';
}): Promise<Expense> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();
  const activeSession = await getActiveCashSession();

  const id = crypto.randomUUID();
  const isCashDrop = data.category === 'cash_drop';

  const expense: Expense = {
    id,
    shop_id: shop.shop_id,
    title: data.title,
    amount: data.amount,
    category: data.category,
    payment_method: data.paymentMethod,
    is_cash_drop: isCashDrop,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    device_id: deviceId,
    created_by: shop.user_id,
    cash_session_id: activeSession.id,
  };

  await db.expenses.put(expense);
  void syncWriteThrough({
    id,
    table: 'expenses',
    op: 'insert',
    payload: expense as unknown as Record<string, unknown>,
    attempts: 0,
    next_attempt_at: now,
  });

  return expense;
}

/**
 * Record Partial / Full Debt Payment
 */
export async function recordDebtPayment(data: {
  debtId: string;
  amount: KES;
  method: 'cash' | 'mpesa';
}): Promise<{ payment: DebtPayment; newBalance: KES; status: string }> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();
  const activeSession = await getActiveCashSession();

  const debt = await db.debts.get(data.debtId);
  if (!debt) throw new Error('Debt not found');

  const newAmountPaid = addKES(debt.amount_paid, data.amount);
  const newBalance = subKES(debt.principal, newAmountPaid);
  const newStatus = newBalance <= 0 ? 'paid' : 'partial';

  const paymentId = crypto.randomUUID();
  const payment: DebtPayment = {
    id: paymentId,
    shop_id: shop.shop_id,
    debt_id: data.debtId,
    amount: data.amount,
    method: data.method,
    created_at: now,
    device_id: deviceId,
    created_by: shop.user_id,
    cash_session_id: activeSession.id,
  };

  await db.transaction('rw', [db.debts, db.debt_payments], async () => {
    await db.debt_payments.put(payment);
    await db.debts.update(data.debtId, {
      amount_paid: newAmountPaid,
      status: newStatus,
      updated_at: now,
    });
  });

  void syncWriteThrough([
    {
      id: paymentId,
      table: 'debt_payments',
      op: 'insert',
      payload: payment as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    },
    {
      id: data.debtId,
      table: 'debts',
      op: 'update',
      payload: {
        id: data.debtId,
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: now,
      },
      attempts: 0,
      next_attempt_at: now,
    },
  ]);

  return { payment, newBalance, status: newStatus };
}

/**
 * Record Customer Debt Payment (Lump-sum applied across customer's chronological open debts)
 */
export async function recordCustomerDebtPayment(data: {
  customerId: string;
  amount: KES;
  method: 'cash' | 'mpesa';
}): Promise<{ totalPaid: KES; remainingBalance: KES }> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();
  const activeSession = await getActiveCashSession();

  // Find all open debts for this customer, sorted oldest first
  const openDebts = await db.debts
    .where('customer_id')
    .equals(data.customerId)
    .filter((d) => d.status !== 'paid' && d.status !== 'written_off')
    .sortBy('created_at');

  let amountLeftToApply = data.amount;
  const syncEntries: OutboxEntry[] = [];
  let totalPaid = toKES(0);

  await db.transaction('rw', [db.debts, db.debt_payments], async () => {
    for (const debt of openDebts) {
      if (amountLeftToApply <= 0) break;

      const debtRemaining = subKES(debt.principal, debt.amount_paid);
      const paymentForThisDebt = toKES(Math.min(amountLeftToApply, debtRemaining));

      const newAmountPaid = addKES(debt.amount_paid, paymentForThisDebt);
      const newBalance = subKES(debt.principal, newAmountPaid);
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      const paymentId = crypto.randomUUID();
      const payment: DebtPayment = {
        id: paymentId,
        shop_id: shop.shop_id,
        debt_id: debt.id,
        amount: paymentForThisDebt,
        method: data.method,
        created_at: now,
        device_id: deviceId,
        created_by: shop.user_id,
        cash_session_id: activeSession.id,
      };

      await db.debt_payments.put(payment);
      await db.debts.update(debt.id, {
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: now,
      });

      syncEntries.push(
        {
          id: paymentId,
          table: 'debt_payments',
          op: 'insert',
          payload: payment as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        },
        {
          id: debt.id,
          table: 'debts',
          op: 'update',
          payload: {
            id: debt.id,
            amount_paid: newAmountPaid,
            status: newStatus,
            updated_at: now,
          },
          attempts: 0,
          next_attempt_at: now,
        }
      );

      amountLeftToApply = subKES(amountLeftToApply, paymentForThisDebt);
      totalPaid = addKES(totalPaid, paymentForThisDebt);
    }
  });

  void syncWriteThrough(syncEntries);

  // Calculate new total remaining balance for customer
  const updatedDebts = await db.debts
    .where('customer_id')
    .equals(data.customerId)
    .filter((d) => d.status !== 'paid' && d.status !== 'written_off')
    .toArray();

  const remainingBalance = updatedDebts.reduce(
    (sum, d) => addKES(sum, subKES(d.principal, d.amount_paid)),
    toKES(0)
  );

  return { totalPaid, remainingBalance };
}

/**
 * Batch Purchase / Restock Flow (Feature 6)
 */
export async function recordBatchPurchase(
  purchases: Array<{
    productId: string;
    qty: number;
    unitCost: KES;
    updateBuyingPrice?: boolean;
    updateSellingPrice?: KES | null;
  }>
): Promise<void> {
  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();

  const batchSyncEntries: OutboxEntry[] = [];

  await db.transaction('rw', [db.products, db.stock_movements, db.product_stock], async () => {
    for (const item of purchases) {
      if (item.qty <= 0) continue;

      const movementId = crypto.randomUUID();
      const movement: StockMovement = {
        id: movementId,
        shop_id: shop.shop_id,
        product_id: item.productId,
        delta: item.qty,
        reason: 'purchase',
        ref_type: 'purchase_batch',
        ref_id: null,
        unit_cost: item.unitCost,
        note: 'Restock list purchase',
        created_at: now,
        device_id: deviceId,
        created_by: shop.user_id,
      };

      await db.stock_movements.put(movement);

      const currentStock = await db.product_stock.get(item.productId);
      const newQty = (currentStock?.qty || 0) + item.qty;
      await db.product_stock.put({
        product_id: item.productId,
        shop_id: shop.shop_id,
        qty: newQty,
        updated_at: now,
      });

      if (item.updateBuyingPrice || item.updateSellingPrice) {
        const updates: Partial<Product> = { updated_at: now };
        if (item.updateBuyingPrice) updates.buying_price = item.unitCost;
        if (item.updateSellingPrice) updates.selling_price = item.updateSellingPrice;
        await db.products.update(item.productId, updates);

        batchSyncEntries.push({
          id: item.productId,
          table: 'products',
          op: 'update',
          payload: { id: item.productId, ...updates },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      batchSyncEntries.push({
        id: movementId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
      batchSyncEntries.push({
        id: item.productId,
        table: 'product_stock',
        op: 'update',
        payload: {
          product_id: item.productId,
          shop_id: shop.shop_id,
          qty: newQty,
          updated_at: now,
        },
        attempts: 0,
        next_attempt_at: now,
      });
    }
  });

  void syncWriteThrough(batchSyncEntries);
}

/**
 * Record Single Product Restock (Immediate individual stock addition)
 */
export async function recordSingleProductRestock(payload: {
  productId: string;
  qtyToAdd: number;
  unitCost?: KES | null;
  newSellingPrice?: KES | null;
  paymentMethod?: 'cash' | 'mpesa' | 'credit' | 'none';
  recordAsExpense?: boolean;
  supplierNote?: string | null;
}): Promise<{ newStock: number }> {
  if (payload.qtyToAdd <= 0) {
    throw new Error('Quantity to add must be greater than zero');
  }

  const shop = await getShopMeta();
  const deviceId = await getOrCreateDeviceId();
  const now = serverNow();
  const activeSession = await getActiveCashSession();

  const product = await db.products.get(payload.productId);
  if (!product) throw new Error('Product not found');

  const unitCost =
    payload.unitCost !== undefined && payload.unitCost !== null
      ? payload.unitCost
      : (product.buying_price ?? toKES(0));

  const movementId = crypto.randomUUID();
  const movement: StockMovement = {
    id: movementId,
    shop_id: shop.shop_id,
    product_id: payload.productId,
    delta: payload.qtyToAdd,
    reason: 'purchase',
    ref_type: 'single_restock',
    ref_id: null,
    unit_cost: unitCost,
    note: payload.supplierNote || `Restocked +${payload.qtyToAdd} ${product.unit}`,
    created_at: now,
    device_id: deviceId,
    created_by: shop.user_id,
  };

  let newQty = 0;
  const restockSyncEntries: OutboxEntry[] = [];

  await db.transaction(
    'rw',
    [db.products, db.stock_movements, db.product_stock, db.expenses],
    async () => {
      await db.stock_movements.put(movement);

      const currentStockEntry = await db.product_stock.get(payload.productId);
      newQty = (currentStockEntry?.qty || 0) + payload.qtyToAdd;

      await db.product_stock.put({
        product_id: payload.productId,
        shop_id: shop.shop_id,
        qty: newQty,
        updated_at: now,
      });

      const productUpdates: Partial<Product> = { updated_at: now };
      if (payload.unitCost !== undefined && payload.unitCost !== null && payload.unitCost > 0) {
        productUpdates.buying_price = payload.unitCost;
      }
      if (payload.newSellingPrice !== undefined && payload.newSellingPrice !== null && payload.newSellingPrice > 0) {
        productUpdates.selling_price = payload.newSellingPrice;
      }

      if (Object.keys(productUpdates).length > 1) {
        await db.products.update(payload.productId, productUpdates);
        restockSyncEntries.push({
          id: payload.productId,
          table: 'products',
          op: 'update',
          payload: { id: payload.productId, ...productUpdates },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      // Record as business expense if requested and cost > 0
      if (
        payload.recordAsExpense &&
        unitCost > 0 &&
        payload.qtyToAdd > 0 &&
        (payload.paymentMethod === 'cash' || payload.paymentMethod === 'mpesa')
      ) {
        const totalExpenseAmount = mulKES(unitCost, payload.qtyToAdd);
        const expenseId = crypto.randomUUID();
        const expense: Expense = {
          id: expenseId,
          shop_id: shop.shop_id,
          title: `Restock: ${product.name} (+${payload.qtyToAdd} ${product.unit})`,
          amount: totalExpenseAmount,
          category: 'stock',
          payment_method: payload.paymentMethod,
          is_cash_drop: false,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: deviceId,
          created_by: shop.user_id,
          cash_session_id: activeSession.id,
        };
        await db.expenses.put(expense);
        restockSyncEntries.push({
          id: expenseId,
          table: 'expenses',
          op: 'insert',
          payload: expense as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });
      }

      restockSyncEntries.push({
        id: movementId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
      restockSyncEntries.push({
        id: payload.productId,
        table: 'product_stock',
        op: 'update',
        payload: {
          product_id: payload.productId,
          shop_id: shop.shop_id,
          qty: newQty,
          updated_at: now,
        },
        attempts: 0,
        next_attempt_at: now,
      });
    }
  );

  void syncWriteThrough(restockSyncEntries);

  return { newStock: newQty };
}

export const recalculateAllStock = recalculateStockFromLedger;
export const seedKenyanCatalog = seedKenyanDukaDemo;

export type Shop = ShopMeta;

export type OnboardingStep = 'account_created' | 'contact' | 'location' | 'plan' | 'complete';

export interface ShopUser {
  id: string;
  shop_id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  pin_hash?: string;
  password_hash?: string;
  onboarding_step: OnboardingStep;
  profile_completed_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendant {
  id: string;
  name: string;
  phone: string; // can be phone or email
  email?: string;
  role: 'attendant';
  pin_hash: string;
  status?: 'active' | 'invited';
  created_at: string;
}

/**
 * Strict Deduplication of Staff Attendants
 * Prevents identical attendants from appearing multiple times across local IndexedDB and cloud sync.
 * Matches by ID, email, normalized phone number, or exact attendant name.
 */
export function deduplicateStaffAttendants(list: StaffAttendant[]): StaffAttendant[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result: StaffAttendant[] = [];

  for (const raw of list) {
    if (!raw) continue;
    const cleanEmail = (raw.email || (raw.phone && raw.phone.includes('@') ? raw.phone : '')).trim().toLowerCase();
    const cleanPhone = (raw.phone || '').trim().replace(/\D/g, '');
    const cleanName = (raw.name || '').trim().toLowerCase();
    const rawId = (raw.id || '').trim();

    // Skip placeholder / invalid empty entries
    if (!cleanName && !cleanEmail && !cleanPhone) continue;

    // Check if matching entry already exists in result accumulator
    const existingIndex = result.findIndex((item) => {
      if (rawId && item.id && rawId === item.id) return true;
      if (cleanEmail && item.email && item.email.trim().toLowerCase() === cleanEmail) return true;
      if (cleanEmail && item.phone && item.phone.trim().toLowerCase() === cleanEmail) return true;
      if (cleanPhone && cleanPhone.length >= 7 && item.phone) {
        const itemPhoneDigits = item.phone.replace(/\D/g, '');
        if (itemPhoneDigits.endsWith(cleanPhone) || cleanPhone.endsWith(itemPhoneDigits)) return true;
      }
      if (cleanName && item.name && item.name.trim().toLowerCase() === cleanName) return true;
      return false;
    });

    if (existingIndex >= 0) {
      // Merge records: prefer active status, real UUID, and fuller fields
      const existing = result[existingIndex];
      const preferredStatus =
        existing.status === 'active' || raw.status === 'active' ? 'active' : (raw.status || existing.status || 'active');
      const preferredPin =
        raw.pin_hash && raw.pin_hash !== 'pending' && raw.pin_hash !== 'synced'
          ? raw.pin_hash
          : existing.pin_hash && existing.pin_hash !== 'pending' && existing.pin_hash !== 'synced'
          ? existing.pin_hash
          : (raw.pin_hash || existing.pin_hash || 'synced');

      const merged: StaffAttendant = {
        id: (existing.id && !existing.id.startsWith('temp-')) ? existing.id : (raw.id || existing.id || crypto.randomUUID()),
        name: raw.name && raw.name !== 'Attendant' ? raw.name : existing.name,
        email: cleanEmail || existing.email || undefined,
        phone: raw.phone || existing.phone,
        role: 'attendant',
        pin_hash: preferredPin,
        status: preferredStatus,
        created_at: existing.created_at || raw.created_at || serverNow(),
      };
      result[existingIndex] = merged;
    } else {
      result.push({
        id: raw.id || crypto.randomUUID(),
        name: raw.name || 'Attendant',
        phone: raw.phone || '',
        email: cleanEmail || undefined,
        role: 'attendant',
        pin_hash: raw.pin_hash || 'pending',
        status: raw.status || 'active',
        created_at: raw.created_at || serverNow(),
      });
    }
  }

  return result;
}

export async function getStaffAttendants(): Promise<StaffAttendant[]> {
  const meta = await db.meta.get('staff_attendants');
  const rawList = Array.isArray(meta?.value) ? meta.value : [];
  const deduplicated = deduplicateStaffAttendants(rawList);
  // Self-heal storage if duplicates were found
  if (deduplicated.length !== rawList.length) {
    await db.meta.put({ key: 'staff_attendants', value: deduplicated });
  }
  return deduplicated;
}

export async function addStaffAttendant(
  attendant: Omit<StaffAttendant, 'id' | 'created_at'>
): Promise<StaffAttendant> {
  const list = await getStaffAttendants();
  const shop = await getShopMeta();
  const now = serverNow();

  const cleanEmail = (attendant.email || (attendant.phone && attendant.phone.includes('@') ? attendant.phone : '')).trim().toLowerCase();
  const cleanPhoneDigits = (attendant.phone || '').trim().replace(/\D/g, '');
  const cleanName = attendant.name.trim().toLowerCase();

  // Find if already exists in current attendants list
  const existingIdx = list.findIndex((a) => {
    if (cleanEmail && a.email && a.email.trim().toLowerCase() === cleanEmail) return true;
    if (cleanEmail && a.phone && a.phone.trim().toLowerCase() === cleanEmail) return true;
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 7 && a.phone) {
      const aPhoneDigits = a.phone.replace(/\D/g, '');
      if (aPhoneDigits.endsWith(cleanPhoneDigits) || cleanPhoneDigits.endsWith(aPhoneDigits)) return true;
    }
    if (cleanName && a.name && a.name.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  let created: StaffAttendant;
  let updatedList: StaffAttendant[];

  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    created = {
      ...existing,
      name: attendant.name.trim() || existing.name,
      phone: attendant.phone || existing.phone,
      email: cleanEmail || existing.email,
      status: attendant.status || existing.status || 'active',
      pin_hash: attendant.pin_hash && attendant.pin_hash !== 'pending' ? attendant.pin_hash : existing.pin_hash,
    };
    updatedList = list.map((a, i) => (i === existingIdx ? created : a));
  } else {
    if (list.length >= 5) {
      throw new Error('Maximum limit reached: A shop can have a maximum of 5 attendants.');
    }
    created = {
      ...attendant,
      id: crypto.randomUUID(),
      email: cleanEmail || undefined,
      status: attendant.status || 'active',
      created_at: now,
    };
    updatedList = [...list, created];
  }

  const deduplicated = deduplicateStaffAttendants(updatedList);
  await db.meta.put({ key: 'staff_attendants', value: deduplicated });

  // Also store in local db.users and sync to remote users table so all devices resolve attendant name by ID
  const attendantUserRecord: ShopUser = {
    id: created.id,
    shop_id: shop.shop_id,
    name: created.name,
    username: (created.email || created.phone || created.name).split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, ''),
    email: created.email || created.phone,
    phone: created.phone,
    role: 'attendant',
    pin_hash: created.pin_hash,
    onboarding_step: 'complete',
    profile_completed_at: now,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  try {
    await db.users.put(attendantUserRecord);
    void syncWriteThrough({
      id: created.id,
      table: 'users',
      op: 'insert',
      payload: attendantUserRecord as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });
  } catch {
    // ignore
  }

  // Sync to Supabase staff_attendants table if configured
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
  if (url && anonKey) {
    fetch(`${url}/rest/v1/staff_attendants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([
        {
          id: created.id,
          shop_id: shop.shop_id,
          name: created.name,
          email: created.email || created.phone,
          phone: created.phone,
          role: 'attendant',
          status: created.status,
          created_at: created.created_at,
        },
      ]),
    }).catch((err) => console.warn('Could not sync attendant to Supabase:', err));
  }

  return created;
}

export async function removeStaffAttendant(id: string, emailOrPhone?: string): Promise<void> {
  const list = await getStaffAttendants();
  const cleanEmailOrPhone = (emailOrPhone || '').trim().toLowerCase();
  const cleanPhoneDigits = (emailOrPhone || '').replace(/\D/g, '');

  const filtered = list.filter((a) => {
    if (a.id === id) return false;
    if (cleanEmailOrPhone) {
      if (a.email && a.email.trim().toLowerCase() === cleanEmailOrPhone) return false;
      if (a.phone && a.phone.trim().toLowerCase() === cleanEmailOrPhone) return false;
    }
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 7) {
      if (a.phone && a.phone.replace(/\D/g, '').endsWith(cleanPhoneDigits)) return false;
    }
    return true;
  });

  const deduplicated = deduplicateStaffAttendants(filtered);
  await db.meta.put({ key: 'staff_attendants', value: deduplicated });

  // Delete from Supabase REST staff_attendants, users & revoke credentials
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
  if (url && anonKey) {
    try {
      // 1. Delete from staff_attendants table by ID
      await fetch(`${url}/rest/v1/staff_attendants?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      // 2. If email is known, delete from staff_attendants and users tables
      if (emailOrPhone && emailOrPhone.includes('@')) {
        const cleanEmail = emailOrPhone.trim().toLowerCase();
        await fetch(`${url}/rest/v1/staff_attendants?email=eq.${encodeURIComponent(cleanEmail)}`, {
          method: 'DELETE',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });

        await fetch(`${url}/rest/v1/users?email=eq.${encodeURIComponent(cleanEmail)}`, {
          method: 'DELETE',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });
      }

      // 3. Delete from users table by ID
      await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      // 4. Call Supabase RPC delete_attendant_user if created
      fetch(`${url}/rest/v1/rpc/delete_attendant_user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          p_attendant_id: id,
          p_email: emailOrPhone || null,
        }),
      }).catch(() => {});

      // 5. Call backend edge function to remove auth user credentials if edge function deployed
      fetch(`${url}/functions/v1/delete-attendant-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({ attendant_id: id, email: emailOrPhone }),
      }).catch(() => {});
    } catch (e) {
      console.warn('Could not delete attendant from Supabase:', e);
    }
  }
}

export async function getShopUser(): Promise<ShopUser | null> {
  const entry = await db.meta.get('user_info');
  if (!entry?.value) return null;
  const val = entry.value;
  return {
    ...val,
    id: val.id || 'user-owner-001',
    name: val.name || 'Smartsort User',
    username: val.username || 'smartsort',
    email: val.email || 'smartsort@shop.com',
    phone: val.phone || '',
    role: (val.role as UserRole) || 'owner',
    onboarding_step: (val.onboarding_step as OnboardingStep) || 'contact',
    profile_completed_at: val.profile_completed_at || null,
    is_active: val.is_active ?? true,
    created_at: val.created_at || '2026-03-01T08:00:00Z',
    updated_at: val.updated_at || serverNow(),
  };
}

export async function saveShopUser(user: Partial<ShopUser>): Promise<ShopUser> {
  const current = (await getShopUser()) || {
    id: 'user-owner-001',
    shop_id: 'shop-demo-kenya-001',
    name: 'Smartsort User',
    username: 'smartsort',
    email: 'smartsort@shop.com',
    phone: '',
    role: 'owner' as UserRole,
    onboarding_step: 'contact' as OnboardingStep,
    profile_completed_at: null,
    is_active: true,
    created_at: serverNow(),
    updated_at: serverNow(),
  };
  const updated: ShopUser = { ...current, ...user, updated_at: serverNow() };
  await db.meta.put({ key: 'user_info', value: updated });
  try {
    await db.users.put(updated);
  } catch {
    // ignore
  }

  // Sync to Supabase users table and outbox
  const now = serverNow();
  try {
    const userPayload = {
      id: updated.id,
      shop_id: updated.shop_id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      onboarding_step: updated.onboarding_step,
      profile_completed_at: updated.profile_completed_at,
      updated_at: now,
    };

    void syncWriteThrough({
      id: updated.id,
      table: 'users',
      op: 'update',
      payload: userPayload as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });
  } catch (e) {
    console.warn('Could not sync user update:', e);
  }

  return updated;
}

/**
 * Resolves the exact human-readable name and role of the person who recorded a sale
 */
export function resolveSaleCashierDisplay(
  sale: SaleHeader,
  usersMap?: Map<string, { name: string; role?: string }>,
  shop?: ShopMeta | null,
  isEn = true
): { name: string; roleLabel: string; isAttendant: boolean } {
  // 1. Check explicit fields on sale (including recorded_by)
  let rawName = (sale.recorded_by || sale.cashier_name || sale.created_by_name || '').trim();
  let rawRole = (sale.created_by_role || '').trim();

  if (rawName.toLowerCase() === 'smartsort user' || rawName.toLowerCase() === 'cashier') {
    rawName = '';
  }

  // 2. Look up in synchronized users / staff_attendants map by created_by ID
  if (sale.created_by && usersMap?.has(sale.created_by)) {
    const u = usersMap.get(sale.created_by)!;
    if (!rawName && u.name && u.name.toLowerCase() !== 'smartsort user') {
      rawName = u.name.trim();
    }
    if (!rawRole && u.role) {
      rawRole = u.role;
    }
  }

  // 3. Check if created_by matches shop owner user_id
  if (shop) {
    const isShopOwnerId =
      sale.created_by === shop.user_id ||
      sale.created_by === 'user-owner-001' ||
      sale.created_by === 'user-admin-001' ||
      rawRole === 'owner';

    if (isShopOwnerId && rawRole !== 'attendant') {
      if (!rawName && shop.owner_name && shop.owner_name.toLowerCase() !== 'smartsort user') {
        rawName = shop.owner_name.trim();
      }
      if (!rawRole) rawRole = 'owner';
    } else if (!rawRole && sale.created_by && sale.created_by !== shop.user_id) {
      rawRole = 'attendant';
    }
  }

  const isAttendant = rawRole === 'attendant';
  const roleLabel = isAttendant
    ? isEn
      ? 'Attendant'
      : 'Mhudumu'
    : isEn
    ? 'Owner'
    : 'Mwenye Duka';

  const finalName =
    rawName ||
    (isAttendant
      ? isEn
        ? 'Attendant'
        : 'Mhudumu'
      : (shop?.owner_name && shop.owner_name.toLowerCase() !== 'smartsort user'
          ? shop.owner_name
          : isEn
          ? 'Owner'
          : 'Mwenye Duka'));

  return {
    name: finalName,
    roleLabel,
    isAttendant,
  };
}

/**
 * Resolves the exact human-readable name and role of the person who recorded a credit (Deni) entry
 */
export function resolveDebtRecorderDisplay(
  debt: Debt,
  linkedSale?: SaleHeader | null,
  usersMap?: Map<string, { name: string; role?: string }>,
  shop?: ShopMeta | null,
  isEn = true
): { name: string; roleLabel: string; isAttendant: boolean } {
  if (linkedSale) {
    return resolveSaleCashierDisplay(linkedSale, usersMap, shop, isEn);
  }

  let rawName = (debt.recorded_by || debt.created_by_name || '').trim();
  let rawRole = (debt.created_by_role || '').trim();

  if (rawName.toLowerCase() === 'smartsort user' || rawName.toLowerCase() === 'cashier') {
    rawName = '';
  }

  if (debt.created_by && usersMap?.has(debt.created_by)) {
    const u = usersMap.get(debt.created_by)!;
    if (!rawName && u.name && u.name.toLowerCase() !== 'smartsort user') {
      rawName = u.name.trim();
    }
    if (!rawRole && u.role) {
      rawRole = u.role;
    }
  }

  if (shop) {
    const isShopOwnerId =
      debt.created_by === shop.user_id ||
      debt.created_by === 'user-owner-001' ||
      debt.created_by === 'user-admin-001' ||
      rawRole === 'owner';

    if (isShopOwnerId && rawRole !== 'attendant') {
      if (!rawName && shop.owner_name && shop.owner_name.toLowerCase() !== 'smartsort user') {
        rawName = shop.owner_name.trim();
      }
      if (!rawRole) rawRole = 'owner';
    } else if (!rawRole && debt.created_by && debt.created_by !== shop.user_id) {
      rawRole = 'attendant';
    }
  }

  const isAttendant = rawRole === 'attendant';
  const roleLabel = isAttendant
    ? isEn
      ? 'Attendant'
      : 'Mhudumu'
    : isEn
    ? 'Owner'
    : 'Mwenye Duka';

  const finalName =
    rawName ||
    (isAttendant
      ? isEn
        ? 'Attendant'
        : 'Mhudumu'
      : shop?.owner_name && shop.owner_name.toLowerCase() !== 'smartsort user'
      ? shop.owner_name
      : isEn
      ? 'Owner'
      : 'Mwenye Duka');

  return {
    name: finalName,
    roleLabel,
    isAttendant,
  };
}

/**
 * Multi-Branch / Multi-Shop Management for Owners with more than 1 shop.
 * Each branch has its own isolated shop_id, products, stock, customers, debts, sales,
 * and its own independent subscription payment status (KES 30/day per shop).
 */
export async function getOwnerBranches(): Promise<ShopMeta[]> {
  const current = await getShopMeta();
  const metaEntry = await db.meta.get('owner_branches');
  let list: ShopMeta[] = Array.isArray(metaEntry?.value) ? [...metaEntry.value] : [];

  // Ensure current active shop is always present and up-to-date in the branches list
  const idx = list.findIndex((b) => b.shop_id === current.shop_id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...current };
  } else {
    list = [current, ...list];
  }

  return list;
}

export async function createNewShopBranch(params: {
  shopName: string;
  town?: string;
  county?: string;
  tillNumber?: string;
  avatarEmoji?: string;
}): Promise<ShopMeta> {
  const current = await getShopMeta();
  const branches = await getOwnerBranches();
  const now = serverNow();
  const newShopId = crypto.randomUUID();

  const newBranch: ShopMeta = {
    shop_id: newShopId,
    shop_name: params.shopName.trim(),
    owner_name: current.owner_name,
    phone: current.phone,
    till_number: (params.tillNumber || current.till_number || '247247').trim(),
    paybill_number: current.paybill_number || '247247',
    account_number: current.account_number || '253499',
    include_credit_in_gross_sales: true,
    role: 'owner',
    user_id: current.user_id,
    avatar_emoji: params.avatarEmoji || '🏪',
    tagline: `${params.shopName.trim()} — ${params.town || current.town || 'Branch'}`,
    contact_email: current.contact_email,
    alt_phone: current.alt_phone,
    county: params.county || current.county || 'Nairobi',
    sub_county: current.sub_county || 'Westlands',
    town: params.town || current.town || 'Nairobi',
    landmark: null,
    default_credit_limit: current.default_credit_limit || toKES(3000),
    receipt_footer: `Thank you for shopping at ${params.shopName.trim()}!`,
    business_cutoff_hour: 22,
    plan_code: 'daily_30',
    plan_name: 'Daily Access Plan (KES 30/day)',
    plan_amount_kes: 30,
    plan_status: 'active',
    // New branch gets a 24h starter window; subscription is paid per shop
    subscription_paid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    preferred_payment_method: 'mpesa',
    plan_acknowledged: true,
    created_at: now,
  };

  const updatedBranches = [...branches.filter((b) => b.shop_id !== newShopId), newBranch];
  await db.meta.put({ key: 'owner_branches', value: updatedBranches });

  // Sync new shop branch to Supabase shops table
  void syncWriteThrough({
    id: newShopId,
    table: 'shops',
    op: 'insert',
    payload: {
      id: newShopId,
      shop_name: newBranch.shop_name,
      owner_name: newBranch.owner_name,
      phone: newBranch.phone,
      till_number: newBranch.till_number,
      avatar_emoji: newBranch.avatar_emoji,
      tagline: newBranch.tagline,
      contact_email: newBranch.contact_email,
      county: newBranch.county,
      town: newBranch.town,
      default_credit_limit: newBranch.default_credit_limit,
      receipt_footer: newBranch.receipt_footer,
      plan_code: newBranch.plan_code,
      plan_name: newBranch.plan_name,
      plan_amount_kes: newBranch.plan_amount_kes,
      plan_status: newBranch.plan_status,
      subscription_paid_until: newBranch.subscription_paid_until,
      preferred_payment_method: newBranch.preferred_payment_method,
      plan_acknowledged: true,
      created_at: now,
      updated_at: now,
    },
    attempts: 0,
    next_attempt_at: now,
  });

  return newBranch;
}

export async function switchActiveShopBranch(targetShopId: string): Promise<ShopMeta> {
  const current = await getShopMeta();
  const branches = await getOwnerBranches();

  // Save current shop state + current shop's staff attendants into branch-scoped meta
  const currentAttendants = await getStaffAttendants();
  await db.meta.put({ key: `staff_attendants_${current.shop_id}`, value: currentAttendants });

  const updatedBranches = branches.map((b) => (b.shop_id === current.shop_id ? { ...b, ...current } : b));
  const target = updatedBranches.find((b) => b.shop_id === targetShopId);
  if (!target) {
    throw new Error('Target shop branch not found');
  }

  await db.meta.put({ key: 'owner_branches', value: updatedBranches });
  await db.meta.put({ key: 'shop_info', value: target });

  // Load target shop's staff attendants
  const targetAttMeta = await db.meta.get(`staff_attendants_${targetShopId}`);
  await db.meta.put({
    key: 'staff_attendants',
    value: Array.isArray(targetAttMeta?.value) ? targetAttMeta.value : [],
  });

  // Reset sync_state cursors so syncEngine pulls all data for the newly selected branch
  await db.sync_state.clear();

  // Update user_info shop_id to match active branch
  const user = await getShopUser();
  if (user) {
    const updatedUser = { ...user, shop_id: target.shop_id };
    await db.meta.put({ key: 'user_info', value: updatedUser });
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smartsort_shop_meta_updated', { detail: target }));
  }

  return target;
}

/**
 * Initialize default shop, user, and demo catalog on first run
 */
export async function initializeDefaultDatabase(): Promise<{ shop: Shop; user: ShopUser }> {
  const existingMeta = await db.meta.get('shop_info');
  const existingUserMeta = await db.meta.get('user_info');

  if (existingMeta?.value && existingUserMeta?.value) {
    const s = await getShopMeta();
    const u = await getShopUser();
    if (s && u) {
      return { shop: s, user: u };
    }
  }

  const now = serverNow();
  const shopId = 'shop-admin-001';
  const userId = 'user-admin-001';

  // Hashed PIN of "2540" -> 13990937ab8ca4413751a9012a31255e72a18ba3ac8d5c83dd511df50cf2a3e1
  const adminPinHash = '13990937ab8ca4413751a9012a31255e72a18ba3ac8d5c83dd511df50cf2a3e1';

  const shop: Shop = {
    shop_id: shopId,
    shop_name: 'Smartsort solutions',
    owner_name: 'Peter Ngecu',
    phone: '',
    till_number: '247247',
    paybill_number: '247247',
    account_number: '253499',
    include_credit_in_gross_sales: true,
    role: 'owner',
    user_id: userId,
    avatar_emoji: '🏪',
    tagline: 'Leading Kenyan Retail Solutions',
    contact_email: 'peterngecu001@gmail.com',
    alt_phone: null,
    county: 'Nairobi',
    sub_county: 'Westlands',
    town: 'Westlands',
    landmark: 'Smartsort Center',
    latitude: -1.2675,
    longitude: 36.807,
    location_captured_at: now,
    default_credit_limit: toKES(3000),
    receipt_footer: 'Thank you for shopping with Smartsort solutions. Karibu tena!',
    business_cutoff_hour: 22,
    plan_code: 'daily_30',
    plan_name: 'Daily Access Plan (KES 30/day)',
    plan_amount_kes: 30,
    plan_status: 'active',
    subscription_paid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    preferred_payment_method: 'mpesa',
    plan_acknowledged: true,
    created_at: now,
  };

  const user: ShopUser = {
    id: userId,
    shop_id: shopId,
    name: 'Peter Ngecu',
    username: 'peterngecu',
    email: 'peterngecu001@gmail.com',
    phone: '',
    role: 'owner',
    pin_hash: adminPinHash,
    onboarding_step: 'complete',
    profile_completed_at: now,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  await db.meta.put({ key: 'shop_info', value: shop });
  await db.meta.put({ key: 'user_info', value: user });
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('app_pin_hash')) {
    localStorage.setItem('app_pin_hash', adminPinHash);
  }

  // New shops start with zero products so owners can create their own catalog
  // Sample catalog can be manually loaded from Settings anytime

  return { shop, user };
}

/**
 * Clear all products, stock movements, and stock levels to start fresh
 */
export async function clearAllProducts(): Promise<void> {
  await db.transaction('rw', [db.products, db.stock_movements, db.product_stock], async () => {
    await db.products.clear();
    await db.stock_movements.clear();
    await db.product_stock.clear();
  });
}

/**
 * Clear all tables to start completely fresh for a new user/shop
 */
export async function clearDatabaseForFreshStart(): Promise<void> {
  await db.transaction('rw', [
    db.products,
    db.stock_movements,
    db.product_stock,
    db.sales,
    db.sale_items,
    db.customers,
    db.debts,
    db.debt_payments,
    db.expenses,
    db.cash_sessions,
    db.held_carts,
    db.product_stats,
    db.outbox,
    db.audit_log,
    db.meta
  ], async () => {
    await db.products.clear();
    await db.stock_movements.clear();
    await db.product_stock.clear();
    await db.sales.clear();
    await db.sale_items.clear();
    await db.customers.clear();
    await db.debts.clear();
    await db.debt_payments.clear();
    await db.expenses.clear();
    await db.cash_sessions.clear();
    await db.held_carts.clear();
    await db.product_stats.clear();
    await db.outbox.clear();
    await db.audit_log.clear();

    // delete specific keys from meta table
    await db.meta.delete('staff_attendants');
    await db.meta.delete('shop_info');
    await db.meta.delete('user_info');
  });
}

/**
 * Universal Barcode Lookup across shops (Global Product Catalog)
 * Enables Shop 2 onwards to instantly recognize scanned universal barcodes,
 * inheriting product name, emoji, and unit while allowing custom price & stock adjustments.
 */
export async function lookupGlobalProductByBarcode(barcode: string): Promise<Product | null> {
  const cleanCode = barcode.trim();
  if (!cleanCode) return null;

  // 1. Check local DB first (works 100% offline)
  const localMatch = await db.products
    .filter((p) => p.deleted_at === null && Boolean(p.barcode) && p.barcode!.toLowerCase() === cleanCode.toLowerCase())
    .first();
  if (localMatch) return localMatch;

  // 2. If offline, return null immediately
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  // 3. Check remote Supabase catalog if online
  try {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
    if (url && anonKey && !url.includes('placeholder')) {
      const resp = await fetch(`${url}/rest/v1/products?barcode=eq.${encodeURIComponent(cleanCode)}&limit=1`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0) {
          const remoteProd = rows[0];
          return {
            id: remoteProd.id || crypto.randomUUID(),
            shop_id: remoteProd.shop_id,
            name: remoteProd.name,
            search_key: remoteProd.search_key || remoteProd.name.toLowerCase(),
            buying_price: remoteProd.buying_price != null ? toKES(Number(remoteProd.buying_price)) : null,
            selling_price: remoteProd.selling_price != null ? toKES(Number(remoteProd.selling_price)) : toKES(100),
            low_limit: remoteProd.low_limit ?? 5,
            unit: remoteProd.unit || 'pcs',
            barcode: remoteProd.barcode,
            image_emoji: remoteProd.image_emoji || '📦',
            is_active: true,
            pack_size: remoteProd.pack_size ?? null,
            fractional_prices: remoteProd.fractional_prices || undefined,
            created_at: remoteProd.created_at || serverNow(),
            updated_at: remoteProd.updated_at || serverNow(),
            deleted_at: null,
            device_id: 'global-catalog',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Could not query global catalog from Supabase:', err);
  }

  return null;
}


