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
  }
}

export const db = new SmartSortDB();

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
  active_loan_status?: 'none' | 'pending' | 'approved' | 'disbursed' | 'paid' | 'pending_approval';
  loan_limit?: number;
  simulate_three_months_active?: boolean;
  manual_limit_set?: boolean;
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
    till_number: '542190',
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

  await db.meta.put({ key: 'shop_info', value: defaultMeta });
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

  // Queue to outbox for remote sync to Supabase subscriptions table
  await db.outbox.add({
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

  // Queue to outbox for remote sync to Supabase shops table
  try {
    const payload = {
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

    await db.outbox.add({
      id: updated.shop_id,
      table: 'shops',
      op: 'update',
      payload: payload as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });

    // Directly push to Supabase REST if online
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
    if (url && anonKey) {
      fetch(`${url}/rest/v1/shops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify([payload]),
      }).catch((err) => console.warn('Direct Supabase shop sync failed (will retry via outbox):', err));
    }
  } catch (e) {
    console.warn('Could not queue shop update to outbox:', e);
  }

  return updated;
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
    const movements = allMovements.filter((m) => m.shop_id === shop.shop_id);
    const map = new Map<string, number>();
    for (const m of movements) {
      map.set(m.product_id, (map.get(m.product_id) || 0) + m.delta);
    }
    const allProducts = await db.products.toArray();
    const products = allProducts.filter((p) => p.shop_id === shop.shop_id);
    for (const p of products) {
      const qty = map.get(p.id) || 0;
      await db.product_stock.put({
        product_id: p.id,
        shop_id: shop.shop_id,
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

  await db.transaction('rw', [db.products, db.stock_movements, db.product_stock, db.outbox], async () => {
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

      // Queue outbox for product and stock movement
      await db.outbox.add({
        id: prodId,
        table: 'products',
        op: 'insert',
        payload: product as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
      await db.outbox.add({
        id: moveId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    }
  });
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
  await db.outbox.add({
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
    created_by: shop.user_id,
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

      // 5. Enqueue Outbox Entries
      for (const entry of outboxEntries) {
        await db.outbox.add(entry);
      }
    }
  );

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

  await db.transaction(
    'rw',
    [db.sales, db.stock_movements, db.product_stock, db.debts, db.outbox, db.audit_log],
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

        await db.outbox.add({
          id: revMovementId,
          table: 'stock_movements',
          op: 'insert',
          payload: revMovement as unknown as Record<string, unknown>,
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
        await db.outbox.add({
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

      // 5. Outbox for sale update
      await db.outbox.add({
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

  await db.transaction('rw', [db.expenses, db.outbox], async () => {
    await db.expenses.put(expense);
    await db.outbox.add({
      id,
      table: 'expenses',
      op: 'insert',
      payload: expense as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });
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

  await db.transaction('rw', [db.debts, db.debt_payments, db.outbox], async () => {
    await db.debt_payments.put(payment);
    await db.debts.update(data.debtId, {
      amount_paid: newAmountPaid,
      status: newStatus,
      updated_at: now,
    });

    await db.outbox.add({
      id: paymentId,
      table: 'debt_payments',
      op: 'insert',
      payload: payment as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });

    await db.outbox.add({
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
    });
  });

  return { payment, newBalance, status: newStatus };
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

  await db.transaction('rw', [db.products, db.stock_movements, db.product_stock, db.outbox], async () => {
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

        await db.outbox.add({
          id: item.productId,
          table: 'products',
          op: 'update',
          payload: { id: item.productId, ...updates },
          attempts: 0,
          next_attempt_at: now,
        });
      }

      await db.outbox.add({
        id: movementId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    }
  });
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

export async function getStaffAttendants(): Promise<StaffAttendant[]> {
  const meta = await db.meta.get('staff_attendants');
  return meta?.value || [];
}

export async function addStaffAttendant(
  attendant: Omit<StaffAttendant, 'id' | 'created_at'>
): Promise<StaffAttendant> {
  const list = await getStaffAttendants();
  if (list.length >= 2) {
    throw new Error('Maximum limit reached: A shop can have a maximum of 2 attendants.');
  }

  const shop = await getShopMeta();
  const created: StaffAttendant = {
    ...attendant,
    id: crypto.randomUUID(),
    status: attendant.status || 'active',
    created_at: serverNow(),
  };

  const updatedList = [...list, created];
  await db.meta.put({ key: 'staff_attendants', value: updatedList });

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
  const filtered = list.filter((a) => a.id !== id && (emailOrPhone ? a.phone.toLowerCase() !== emailOrPhone.toLowerCase() && a.email?.toLowerCase() !== emailOrPhone.toLowerCase() : true));
  await db.meta.put({ key: 'staff_attendants', value: filtered });

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

    await db.outbox.add({
      id: updated.id,
      table: 'users',
      op: 'update',
      payload: userPayload as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });

    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
    if (url && anonKey) {
      fetch(`${url}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify([userPayload]),
      }).catch((err) => console.warn('Direct Supabase user sync failed:', err));
    }
  } catch (e) {
    console.warn('Could not queue user update to outbox:', e);
  }

  return updated;
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
    till_number: '6997912',
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
    password_hash: 'admin2540',
    onboarding_step: 'complete',
    profile_completed_at: now,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  await db.meta.put({ key: 'shop_info', value: shop });
  await db.meta.put({ key: 'user_info', value: user });

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


