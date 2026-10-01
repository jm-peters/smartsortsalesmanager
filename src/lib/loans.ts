/**
 * Restocking Loan Applications & Admin Verification Store
 * Manages loan application records, admin approvals, 3-month eligibility tracking,
 * and quiet notifications for system administrators.
 */

import { getShopMeta, saveShopMeta, type ShopMeta } from './db/local';

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

const LOAN_APPS_STORAGE_KEY = 'smartsort_loan_applications_v1';
const ELIGIBLE_ALERTS_STORAGE_KEY = 'smartsort_eligible_shop_alerts_v1';
const SUBSCRIPTION_CLAIMS_KEY = 'smartsort_subscription_claims_v1';

export function getAllSubscriptionClaims(): SubscriptionPaymentClaim[] {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CLAIMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
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

  // Background dispatch to Formspree notification endpoint without exposing admin credentials in UI
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
    }).catch((e) => console.warn('Formspree dispatch background error:', e));
  } catch (e) {
    // ignore
  }

  return newApp;
}

/**
 * Updates status of a loan application (e.g. Approve & Disburse, Reject).
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
  apps[idx] = {
    ...apps[idx],
    status: newStatus,
    admin_note: adminNote,
    updated_at: now,
  };

  saveAllLoanApplications(apps);

  // If this matches the current local shop, synchronize ShopMeta
  const currentShop = await getShopMeta();
  if (currentShop && currentShop.shop_id === apps[idx].shop_id) {
    if (newStatus === 'disbursed' || newStatus === 'approved') {
      const amt = apps[idx].amount;
      const fee = amt <= 5000 ? amt * 0.01 : amt <= 15000 ? amt * 0.02 : amt * 0.03;
      const totalRepay = amt + fee;
      const dueDate = new Date(Date.now() + apps[idx].duration_days * 24 * 60 * 60 * 1000).toISOString();
      await saveShopMeta({
        active_loan_amount: amt,
        active_loan_balance: totalRepay,
        active_loan_status: newStatus === 'approved' ? 'approved' : 'disbursed',
        active_loan_duration: apps[idx].duration_days,
        active_loan_due_date: dueDate,
      });
    } else if (newStatus === 'rejected') {
      await saveShopMeta({
        active_loan_status: 'none',
        active_loan_amount: 0,
        active_loan_balance: 0,
      });
    }
  }

  return apps[idx];
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
  let alerts: EligibleShopAlert[] = raw ? JSON.parse(raw) : [];

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
 * Admin grants the recommended credit limit to an eligible shop.
 */
export async function adminGrantLimitToShop(
  shopId: string,
  limitKES: number
): Promise<void> {
  const raw = localStorage.getItem(ELIGIBLE_ALERTS_STORAGE_KEY);
  let alerts: EligibleShopAlert[] = raw ? JSON.parse(raw) : [];
  alerts = alerts.map(a => (a.shop_id === shopId ? { ...a, status: 'limit_granted' } : a));
  localStorage.setItem(ELIGIBLE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));

  const currentShop = await getShopMeta();
  if (currentShop && currentShop.shop_id === shopId) {
    await saveShopMeta({
      loan_limit: limitKES,
      manual_limit_set: true,
    });
  }
}
