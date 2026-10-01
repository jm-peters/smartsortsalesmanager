/**
 * Restocking Loan Applications & Admin Verification Store
 * Manages loan application records, admin approvals, 3-month eligibility tracking,
 * cross-shop Supabase cloud synchronization, and merchant loan limit management.
 */

import { getShopMeta, saveShopMeta, type ShopMeta } from './db/local';

export const ADMIN_EMAIL = 'peterngecu001@gmail.com';

export interface LoanApplication {
  id: string;
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  town?: string;
  county?: string;
  amount: number;
  duration_days: number;
  repayment_plan_desc: string;
  instalment_breakdown: string;
  daily_sales_kes: number;
  weekly_sales_kes: number;
  status: 'pending_review' | 'approved' | 'disbursed' | 'rejected';
  created_at: string;
  updated_at: string;
  admin_note?: string;
}

export interface EligibleShopAlert {
  id: string;
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  town: string;
  county: string;
  created_at: string;
  days_active: number;
  calculated_limit: number;
  daily_sales_kes: number;
  weekly_sales_kes: number;
  status: 'pending_admin_action' | 'limit_granted' | 'dismissed';
  detected_at: string;
}

export interface SubscriptionPaymentClaim {
  id: string;
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  amount_kes: number;
  days: number;
  status: 'pending_verification' | 'verified' | 'unresolved';
  created_at: string;
  reminder_sent_count: number;
}

export interface ShopLoanStateSync {
  shop_id: string;
  shop_name?: string;
  owner_name?: string;
  phone?: string;
  town?: string;
  loan_limit?: number;
  manual_limit_set?: boolean;
  active_loan_amount?: number;
  active_loan_balance?: number;
  active_loan_status?: 'none' | 'pending' | 'approved' | 'disbursed' | 'paid' | 'pending_approval' | 'declined';
  active_loan_duration?: number;
  active_loan_due_date?: string;
  updated_at: string;
}

export interface MerchantShopSummary {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  town: string;
  county: string;
  contact_email?: string;
  loan_limit: number;
  active_loan_status: string;
  active_loan_amount: number;
  active_loan_balance: number;
  created_at: string;
}

const LOAN_APPS_STORAGE_KEY = 'smartsort_loan_applications_v1';
const ELIGIBLE_ALERTS_STORAGE_KEY = 'smartsort_eligible_shop_alerts_v1';
const SUBSCRIPTION_CLAIMS_KEY = 'smartsort_subscription_claims_v1';
const SHOP_LOAN_STATES_KEY = 'smartsort_shop_loan_states_v1';

/**
 * Checks whether the current user/shop belongs to the authorized system administrator (peterngecu001@gmail.com).
 */
export function isAdminUser(
  user?: { email?: string | null; username?: string | null } | null,
  shop?: { contact_email?: string | null } | null
): boolean {
  const uEmail = (user?.email || '').trim().toLowerCase();
  const uName = (user?.username || '').trim().toLowerCase();
  const sEmail = (shop?.contact_email || '').trim().toLowerCase();
  if (uEmail === ADMIN_EMAIL || sEmail === ADMIN_EMAIL || uName === 'peterngecu') {
    return true;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const sessionStr = localStorage.getItem('smartsort_session');
      if (sessionStr) {
        const parsed = JSON.parse(sessionStr);
        if ((parsed?.email || '').trim().toLowerCase() === ADMIN_EMAIL) {
          return true;
        }
      }
      if (localStorage.getItem('smartsort_admin_unlocked') === 'true') {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  try {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
    if (url && anonKey && !url.includes('placeholder')) {
      return { url, anonKey };
    }
  } catch {
    // ignore
  }
  return null;
}

export function getShopLoanStatesMap(): Record<string, ShopLoanStateSync> {
  try {
    const raw = localStorage.getItem(SHOP_LOAN_STATES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveShopLoanStateToMap(shopId: string, state: Partial<ShopLoanStateSync>): ShopLoanStateSync {
  const map = getShopLoanStatesMap();
  const existing = map[shopId] || { shop_id: shopId, updated_at: new Date().toISOString() };
  const merged: ShopLoanStateSync = {
    ...existing,
    ...state,
    shop_id: shopId,
    updated_at: state.updated_at || new Date().toISOString(),
  };
  map[shopId] = merged;
  try {
    localStorage.setItem(SHOP_LOAN_STATES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  return merged;
}

export function getAllSubscriptionClaims(): SubscriptionPaymentClaim[] {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CLAIMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSubscriptionClaim(payload: {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  amount_kes: number;
  days: number;
}): SubscriptionPaymentClaim {
  const existing = getAllSubscriptionClaims();
  const now = new Date().toISOString();
  const newClaim: SubscriptionPaymentClaim = {
    id: `subclaim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    ...payload,
    status: 'pending_verification',
    created_at: now,
    reminder_sent_count: 0,
  };
  const updated = [newClaim, ...existing.filter(c => c.shop_id !== payload.shop_id || c.status !== 'pending_verification')];
  localStorage.setItem(SUBSCRIPTION_CLAIMS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('smartsort_subscription_claims_changed'));
  return newClaim;
}

export function updateSubscriptionClaimStatus(id: string, status: 'verified' | 'unresolved'): void {
  const claims = getAllSubscriptionClaims();
  const updated = claims.map(c => c.id === id ? { ...c, status } : c);
  localStorage.setItem(SUBSCRIPTION_CLAIMS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('smartsort_subscription_claims_changed'));
}

export function incrementClaimReminder(id: string): void {
  const claims = getAllSubscriptionClaims();
  const updated = claims.map(c => c.id === id ? { ...c, reminder_sent_count: (c.reminder_sent_count || 0) + 1 } : c);
  localStorage.setItem(SUBSCRIPTION_CLAIMS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('smartsort_subscription_claims_changed'));
}

/**
 * Loads all loan applications from persistent local storage.
 */
export function getAllLoanApplications(): LoanApplication[] {
  try {
    const raw = localStorage.getItem(LOAN_APPS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read loan applications store:', err);
    return [];
  }
}

/**
 * Saves all loan applications to persistent local storage.
 */
function saveAllLoanApplications(apps: LoanApplication[]): void {
  try {
    localStorage.setItem(LOAN_APPS_STORAGE_KEY, JSON.stringify(apps));
    window.dispatchEvent(new CustomEvent('smartsort_loan_apps_changed'));
  } catch (err) {
    console.warn('Could not write loan applications store:', err);
  }
}

/**
 * Helper to push loan application or loan limit events to Supabase public.audit_log
 * so they sync seamlessly across devices and shops without requiring custom DDL migrations.
 */
async function pushLoanAuditEventToSupabase(params: {
  id: string;
  shop_id: string;
  action: string;
  entity_type: 'loan_application' | 'shop_loan_limit';
  entity_id: string;
  after: Record<string, unknown>;
}): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const cfg = getSupabaseConfig();
  if (!cfg) return;

  try {
    await fetch(`${cfg.url}/rest/v1/audit_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          id: params.id,
          shop_id: params.shop_id,
          actor_user_id: ADMIN_EMAIL,
          action: params.action,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          after: params.after,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  } catch (e) {
    console.warn('Cloud loan event push skipped:', e);
  }
}

/**
 * Submits a new restocking loan request from a shop.
 */
export async function submitLoanApplication(payload: {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  town?: string;
  county?: string;
  amount: number;
  duration_days: number;
  repayment_plan_desc: string;
  instalment_breakdown: string;
  daily_sales_kes: number;
  weekly_sales_kes: number;
}): Promise<LoanApplication> {
  const existing = getAllLoanApplications();
  const now = new Date().toISOString();

  const newApp: LoanApplication = {
    id: `loan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...payload,
    status: 'pending_review',
    created_at: now,
    updated_at: now,
  };

  // Add new application to the front of list
  const updated = [newApp, ...existing.filter(a => a.shop_id !== payload.shop_id || a.status !== 'pending_review')];
  saveAllLoanApplications(updated);

  // Save per-shop loan state locally
  saveShopLoanStateToMap(payload.shop_id, {
    shop_name: payload.shop_name,
    owner_name: payload.owner_name,
    phone: payload.phone,
    town: payload.town,
    active_loan_amount: payload.amount,
    active_loan_duration: payload.duration_days,
    active_loan_status: 'pending_approval',
    updated_at: now,
  });

  // Push to Supabase audit_log so Admin (peterngecu001@gmail.com) sees it across devices
  void pushLoanAuditEventToSupabase({
    id: `audit-${newApp.id}`,
    shop_id: payload.shop_id,
    action: 'loan_application_submitted',
    entity_type: 'loan_application',
    entity_id: newApp.id,
    after: newApp as unknown as Record<string, unknown>,
  });

  // Background dispatch to Formspree notification endpoint
  try {
    fetch('https://formspree.io/f/mqkrbnzo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        _subject: `New Duka Loan Application: ${payload.shop_name} (KES ${payload.amount.toLocaleString()})`,
        applicationId: newApp.id,
        shopName: payload.shop_name,
        ownerName: payload.owner_name,
        phone: payload.phone || 'N/A',
        amountKES: payload.amount,
        durationDays: payload.duration_days,
        repaymentPlan: payload.repayment_plan_desc,
        instalments: payload.instalment_breakdown,
        todaySalesKES: payload.daily_sales_kes,
        weeklySalesKES: payload.weekly_sales_kes,
        location: `${payload.town || ''}, ${payload.county || ''}`,
        appliedAt: now,
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }

  return newApp;
}

/**
 * Updates status of a loan application (Approve or Decline/Reject)
 * and automatically syncs the 'approved' or 'declined' status to the shop's account.
 */
export async function updateLoanApplicationStatus(
  applicationId: string,
  newStatus: 'approved' | 'disbursed' | 'rejected',
  adminNote?: string
): Promise<LoanApplication | null> {
  const apps = getAllLoanApplications();
  const idx = apps.findIndex(a => a.id === applicationId);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const targetApp: LoanApplication = {
    ...apps[idx],
    status: newStatus,
    admin_note: adminNote,
    updated_at: now,
  };
  apps[idx] = targetApp;

  saveAllLoanApplications(apps);

  const amt = targetApp.amount;
  const fee = amt <= 5000 ? amt * 0.01 : amt <= 15000 ? amt * 0.02 : amt * 0.03;
  const totalRepay = Math.ceil(amt + fee);
  const durationDays = targetApp.duration_days || 7;
  const dueDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const isApproved = newStatus === 'approved' || newStatus === 'disbursed';

  const shopStatePatch: Partial<ShopLoanStateSync> = isApproved
    ? {
        shop_name: targetApp.shop_name,
        owner_name: targetApp.owner_name,
        phone: targetApp.phone,
        town: targetApp.town,
        active_loan_amount: amt,
        active_loan_balance: totalRepay,
        active_loan_status: 'approved',
        active_loan_duration: durationDays,
        active_loan_due_date: dueDate,
        updated_at: now,
      }
    : {
        shop_name: targetApp.shop_name,
        owner_name: targetApp.owner_name,
        phone: targetApp.phone,
        town: targetApp.town,
        active_loan_status: 'declined',
        active_loan_amount: amt,
        active_loan_balance: 0,
        active_loan_due_date: undefined,
        updated_at: now,
      };

  // 1. Save to local cross-shop state map
  const syncedShopState = saveShopLoanStateToMap(targetApp.shop_id, shopStatePatch);

  // 2. If the active local shop matches targetApp.shop_id OR has a pending loan on this device, update ShopMeta immediately
  const currentShop = await getShopMeta();
  if (
    currentShop &&
    (currentShop.shop_id === targetApp.shop_id ||
      currentShop.active_loan_status === 'pending_approval')
  ) {
    if (isApproved) {
      await saveShopMeta({
        active_loan_amount: amt,
        active_loan_balance: totalRepay,
        active_loan_status: 'approved',
        active_loan_duration: durationDays,
        active_loan_due_date: dueDate,
      });
    } else {
      await saveShopMeta({
        active_loan_status: 'declined',
        active_loan_amount: amt,
        active_loan_balance: 0,
        active_loan_due_date: undefined,
      });
    }
  }

  // 3. Push decision to Supabase audit_log so remote shop devices sync automatically
  void pushLoanAuditEventToSupabase({
    id: `decision-${targetApp.id}-${Date.now()}`,
    shop_id: targetApp.shop_id,
    action: isApproved ? 'loan_application_approved' : 'loan_application_declined',
    entity_type: 'loan_application',
    entity_id: targetApp.id,
    after: {
      ...targetApp,
      shop_loan_state: syncedShopState,
    },
  });

  return targetApp;
}

/**
 * Allows Admin (peterngecu001@gmail.com) to directly approve or decline a loan for any shop,
 * creating an application entry if one does not already exist.
 */
export async function adminDirectSetShopLoanStatus(params: {
  shop_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  town?: string;
  amount: number;
  decision: 'approved' | 'rejected';
}): Promise<LoanApplication | null> {
  const apps = getAllLoanApplications();
  let target = apps.find(a => a.shop_id === params.shop_id && a.status === 'pending_review');
  if (!target) {
    target = apps.find(a => a.shop_id === params.shop_id);
  }

  if (!target) {
    const durationDays = params.amount <= 5000 ? 7 : params.amount <= 15000 ? 14 : 30;
    const feePct = params.amount <= 5000 ? 1.01 : params.amount <= 15000 ? 1.02 : 1.03;
    const instalments = params.amount <= 5000 ? 2 : params.amount <= 15000 ? 3 : 4;
    target = await submitLoanApplication({
      shop_id: params.shop_id,
      shop_name: params.shop_name,
      owner_name: params.owner_name,
      phone: params.phone || '0712345678',
      town: params.town || 'Nairobi',
      amount: params.amount,
      duration_days: durationDays,
      repayment_plan_desc: `${durationDays} Days repayment (${instalments} instalments)`,
      instalment_breakdown: `${instalments} instalments of KES ${Math.ceil((params.amount * feePct) / instalments).toLocaleString()}`,
      daily_sales_kes: 0,
      weekly_sales_kes: 0,
    });
  }

  return updateLoanApplicationStatus(
    target.id,
    params.decision,
    params.decision === 'approved' ? 'Approved by Admin (peterngecu001@gmail.com)' : 'Declined by Admin (peterngecu001@gmail.com)'
  );
}

/**
 * Checks if current shop or any shop has reached 3 months (90 days) of active operations,
 * and securely & quietly logs an eligible shop alert for the Admin Portal.
 */
export async function checkAndRegisterShopEligibility(
  shop: ShopMeta,
  todaySalesKES: number = 0,
  weekSalesKES: number = 0
): Promise<EligibleShopAlert | null> {
  const shopCreated = shop.created_at ? new Date(shop.created_at).getTime() : Date.now();
  const daysActive = Math.floor((Date.now() - shopCreated) / (24 * 60 * 60 * 1000));
  const isThreeMonths = shop.simulate_three_months_active || daysActive >= 90;

  if (!isThreeMonths) {
    return null;
  }

  // Calculate suggested limit based on turnover
  let recommendedLimit = 5000;
  if (todaySalesKES >= 5000 || weekSalesKES >= 10000) {
    recommendedLimit = 25000;
  } else if (todaySalesKES >= 2000 || weekSalesKES >= 4000) {
    recommendedLimit = 15000;
  }

  const raw = localStorage.getItem(ELIGIBLE_ALERTS_STORAGE_KEY);
  const alerts: EligibleShopAlert[] = raw ? JSON.parse(raw) : [];

  const existingIdx = alerts.findIndex(a => a.shop_id === shop.shop_id);
  const now = new Date().toISOString();

  const alertObj: EligibleShopAlert = {
    id: `alert-${shop.shop_id}`,
    shop_id: shop.shop_id,
    shop_name: shop.shop_name,
    owner_name: shop.owner_name,
    phone: shop.phone || '0712345678',
    town: shop.town || 'Nairobi',
    county: shop.county || 'Nairobi',
    created_at: shop.created_at || now,
    days_active: Math.max(daysActive, 90),
    calculated_limit: recommendedLimit,
    daily_sales_kes: todaySalesKES,
    weekly_sales_kes: weekSalesKES,
    status: (existingIdx >= 0 && alerts[existingIdx].status) ? alerts[existingIdx].status : 'pending_admin_action',
    detected_at: (existingIdx >= 0 && alerts[existingIdx].detected_at) ? alerts[existingIdx].detected_at : now,
  };

  if (existingIdx >= 0) {
    alerts[existingIdx] = { ...alerts[existingIdx], ...alertObj };
  } else {
    alerts.unshift(alertObj);
  }

  localStorage.setItem(ELIGIBLE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  return alertObj;
}

/**
 * Returns all eligible shop alerts for the Admin Dashboard.
 */
export function getAllEligibleShopAlerts(): EligibleShopAlert[] {
  try {
    const raw = localStorage.getItem(ELIGIBLE_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read eligible alerts:', err);
    return [];
  }
}

/**
 * Admin grants a credit limit to a merchant shop (syncs locally and via Supabase cloud).
 */
export async function adminGrantLimitToShop(
  shopId: string,
  limitKES: number,
  shopInfo?: { shop_name?: string; owner_name?: string; phone?: string; town?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const raw = localStorage.getItem(ELIGIBLE_ALERTS_STORAGE_KEY);
  let alerts: EligibleShopAlert[] = raw ? JSON.parse(raw) : [];
  alerts = alerts.map(a => (a.shop_id === shopId ? { ...a, status: 'limit_granted', calculated_limit: limitKES } : a));
  localStorage.setItem(ELIGIBLE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));

  const syncedState = saveShopLoanStateToMap(shopId, {
    ...shopInfo,
    loan_limit: limitKES,
    manual_limit_set: true,
    updated_at: now,
  });

  const currentShop = await getShopMeta();
  if (currentShop && currentShop.shop_id === shopId) {
    await saveShopMeta({
      loan_limit: limitKES,
      manual_limit_set: true,
    });
  }

  void pushLoanAuditEventToSupabase({
    id: `limit-${shopId}-${Date.now()}`,
    shop_id: shopId,
    action: 'loan_limit_granted',
    entity_type: 'shop_loan_limit',
    entity_id: shopId,
    after: syncedState as unknown as Record<string, unknown>,
  });
}

/**
 * Synchronizes loan applications, shop loan limits, and merchant shop summaries
 * between local storage, Dexie ShopMeta, and Supabase cloud.
 */
export async function syncLoansAndShopsWithCloud(currentShop?: ShopMeta | null): Promise<{
  applications: LoanApplication[];
  shops: MerchantShopSummary[];
  updatedCurrentShop: ShopMeta | null;
}> {
  let localApps = getAllLoanApplications();
  const statesMap = getShopLoanStatesMap();
  const shop = currentShop || (await getShopMeta());

  // 1. Ensure if the active shop has a pending loan in ShopMeta, it's in the applications list
  if (
    shop &&
    shop.active_loan_status === 'pending_approval' &&
    shop.active_loan_amount &&
    shop.active_loan_amount > 0
  ) {
    const hasPendingInList = localApps.some(
      a => a.shop_id === shop.shop_id && a.status === 'pending_review'
    );
    if (!hasPendingInList) {
      const dur = shop.active_loan_duration || 7;
      const autoApp: LoanApplication = {
        id: `loan-${shop.shop_id}-pending`,
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        owner_name: shop.owner_name,
        phone: shop.phone || '0712345678',
        email: shop.contact_email,
        town: shop.town || 'Nairobi',
        county: shop.county || 'Nairobi',
        amount: shop.active_loan_amount,
        duration_days: dur,
        repayment_plan_desc: `${dur} Days repayment`,
        instalment_breakdown: `${dur <= 7 ? 2 : dur <= 14 ? 3 : 4} instalments`,
        daily_sales_kes: 0,
        weekly_sales_kes: 0,
        status: 'pending_review',
        created_at: shop.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      localApps = [autoApp, ...localApps];
      saveAllLoanApplications(localApps);
    }
  }

  const shopsMap = new Map<string, MerchantShopSummary>();

  // Always include current shop in shopsMap
  if (shop) {
    const st = statesMap[shop.shop_id];
    shopsMap.set(shop.shop_id, {
      shop_id: shop.shop_id,
      shop_name: shop.shop_name,
      owner_name: shop.owner_name,
      phone: shop.phone || '',
      town: shop.town || 'Nairobi',
      county: shop.county || 'Nairobi',
      contact_email: shop.contact_email,
      loan_limit: st?.loan_limit !== undefined ? st.loan_limit : (shop.loan_limit ?? 0),
      active_loan_status: st?.active_loan_status || shop.active_loan_status || 'none',
      active_loan_amount: st?.active_loan_amount ?? shop.active_loan_amount ?? 0,
      active_loan_balance: st?.active_loan_balance ?? shop.active_loan_balance ?? 0,
      created_at: shop.created_at || new Date().toISOString(),
    });
  }

  // Include any shops from local applications or statesMap
  for (const app of localApps) {
    if (!shopsMap.has(app.shop_id)) {
      const st = statesMap[app.shop_id];
      shopsMap.set(app.shop_id, {
        shop_id: app.shop_id,
        shop_name: app.shop_name,
        owner_name: app.owner_name,
        phone: app.phone || '',
        town: app.town || 'Nairobi',
        county: app.county || 'Nairobi',
        contact_email: app.email,
        loan_limit: st?.loan_limit ?? 5000,
        active_loan_status:
          st?.active_loan_status ||
          (app.status === 'approved' || app.status === 'disbursed'
            ? 'approved'
            : app.status === 'rejected'
            ? 'declined'
            : 'pending_approval'),
        active_loan_amount: st?.active_loan_amount ?? app.amount,
        active_loan_balance: st?.active_loan_balance ?? app.amount,
        created_at: app.created_at,
      });
    }
  }

  // 2. If online and Supabase configured, pull remote shops and remote loan audit events
  const cfg = getSupabaseConfig();
  if (cfg && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      // Pull loan events from audit_log
      const auditResp = await fetch(
        `${cfg.url}/rest/v1/audit_log?entity_type=in.(loan_application,shop_loan_limit)&order=created_at.asc&limit=300`,
        {
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.anonKey}`,
          },
        }
      );

      if (auditResp.ok) {
        const auditRows: any[] = await auditResp.json();
        const remoteAppsMap = new Map<string, LoanApplication>();
        for (const a of localApps) {
          remoteAppsMap.set(a.id, a);
        }

        for (const row of auditRows) {
          if (row.entity_type === 'loan_application' && row.after) {
            const appData = row.after as any;
            if (appData && appData.id) {
              const existing = remoteAppsMap.get(appData.id);
              if (!existing || new Date(appData.updated_at || row.created_at) >= new Date(existing.updated_at || existing.created_at)) {
                remoteAppsMap.set(appData.id, {
                  id: appData.id,
                  shop_id: appData.shop_id || row.shop_id,
                  shop_name: appData.shop_name || 'Duka',
                  owner_name: appData.owner_name || 'Owner',
                  phone: appData.phone || '',
                  email: appData.email,
                  town: appData.town,
                  county: appData.county,
                  amount: Number(appData.amount) || 0,
                  duration_days: Number(appData.duration_days) || 7,
                  repayment_plan_desc: appData.repayment_plan_desc || '',
                  instalment_breakdown: appData.instalment_breakdown || '',
                  daily_sales_kes: Number(appData.daily_sales_kes) || 0,
                  weekly_sales_kes: Number(appData.weekly_sales_kes) || 0,
                  status: appData.status || 'pending_review',
                  created_at: appData.created_at || row.created_at,
                  updated_at: appData.updated_at || row.created_at,
                  admin_note: appData.admin_note,
                });
              }
              if (appData.shop_loan_state && row.shop_id) {
                saveShopLoanStateToMap(row.shop_id, appData.shop_loan_state);
              }
            }
          } else if (row.entity_type === 'shop_loan_limit' && row.after && row.shop_id) {
            const limData = row.after as any;
            saveShopLoanStateToMap(row.shop_id, {
              loan_limit: Number(limData.loan_limit) || 0,
              manual_limit_set: true,
              updated_at: limData.updated_at || row.created_at,
            });
          }
        }

        localApps = Array.from(remoteAppsMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        saveAllLoanApplications(localApps);
      }

      // Pull all shops from Supabase public.shops
      const shopsResp = await fetch(
        `${cfg.url}/rest/v1/shops?select=*&order=created_at.desc&limit=100`,
        {
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.anonKey}`,
          },
        }
      );

      if (shopsResp.ok) {
        const remoteShops: any[] = await shopsResp.json();
        const latestStates = getShopLoanStatesMap();
        for (const s of remoteShops) {
          if (!s.id) continue;
          const st = latestStates[s.id];
          const existing = shopsMap.get(s.id);
          shopsMap.set(s.id, {
            shop_id: s.id,
            shop_name: s.shop_name || existing?.shop_name || 'Duka',
            owner_name: s.owner_name || existing?.owner_name || 'Owner',
            phone: s.phone || existing?.phone || '',
            town: s.town || existing?.town || 'Nairobi',
            county: s.county || existing?.county || 'Nairobi',
            contact_email: s.contact_email || existing?.contact_email,
            loan_limit: st?.loan_limit !== undefined ? st.loan_limit : (existing?.loan_limit ?? 0),
            active_loan_status: st?.active_loan_status || existing?.active_loan_status || 'none',
            active_loan_amount: st?.active_loan_amount ?? existing?.active_loan_amount ?? 0,
            active_loan_balance: st?.active_loan_balance ?? existing?.active_loan_balance ?? 0,
            created_at: s.created_at || existing?.created_at || new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn('Cloud loan sync fallback to local:', e);
    }
  }

  // 3. Reconcile active local shop with any updated loan state from Admin
  let updatedCurrentShop: ShopMeta | null = shop || null;
  if (shop) {
    const latestStates = getShopLoanStatesMap();
    const myState = latestStates[shop.shop_id];
    const myLatestApp = localApps.find(a => a.shop_id === shop.shop_id);

    const patch: Partial<ShopMeta> = {};
    let needsSave = false;

    if (myState?.loan_limit !== undefined && myState.loan_limit !== shop.loan_limit) {
      patch.loan_limit = myState.loan_limit;
      patch.manual_limit_set = true;
      needsSave = true;
    }

    if (myLatestApp) {
      if (
        (myLatestApp.status === 'approved' || myLatestApp.status === 'disbursed') &&
        shop.active_loan_status !== 'approved' &&
        shop.active_loan_status !== 'disbursed' &&
        shop.active_loan_status !== 'paid'
      ) {
        const amt = myLatestApp.amount;
        const fee = amt <= 5000 ? amt * 0.01 : amt <= 15000 ? amt * 0.02 : amt * 0.03;
        patch.active_loan_status = 'approved';
        patch.active_loan_amount = amt;
        patch.active_loan_balance = myState?.active_loan_balance ?? Math.ceil(amt + fee);
        patch.active_loan_duration = myLatestApp.duration_days || 7;
        patch.active_loan_due_date =
          myState?.active_loan_due_date ||
          new Date(Date.now() + (myLatestApp.duration_days || 7) * 24 * 60 * 60 * 1000).toISOString();
        needsSave = true;
      } else if (
        myLatestApp.status === 'rejected' &&
        shop.active_loan_status === 'pending_approval'
      ) {
        patch.active_loan_status = 'declined';
        patch.active_loan_balance = 0;
        needsSave = true;
      }
    }

    if (needsSave) {
      updatedCurrentShop = await saveShopMeta(patch);
    }
  }

  return {
    applications: localApps,
    shops: Array.from(shopsMap.values()),
    updatedCurrentShop,
  };
}
