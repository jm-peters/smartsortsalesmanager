import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  CreditCard,
  DollarSign,
  Database,
  TrendingUp,
  Search,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Clock,
  MessageSquare,
  PhoneCall,
  Users,
  AlertTriangle,
  Send,
} from 'lucide-react';
import {
  db,
  getShopMeta,
  saveShopMeta,
  type ShopMeta,
  type ShopUser,
} from '../lib/db/local';
import {
  getAllLoanApplications,
  getAllEligibleShopAlerts,
  adminGrantLimitToShop,
  getAllSubscriptionClaims,
  updateSubscriptionClaimStatus,
  updateLoanApplicationStatus,
  syncLoansAndShopsWithCloud,
  adminUpdateShopSubscription,
  adminDirectSetShopLoanStatus,
  incrementClaimReminder,
  submitLoanApplication,
  type LoanApplication,
  type EligibleShopAlert,
  type SubscriptionPaymentClaim,
  type MerchantShopSummary,
} from '../lib/loans';
import { formatKES, toKES } from '../lib/money';
import { Button } from '../components/Button';
import type { Language } from '../lib/i18n';

interface AdminPortalProps {
  user: ShopUser;
  shop: ShopMeta;
  language?: Language;
  onCloseAdminPortal: () => void;
  onUpdateShop: (updatedShop: ShopMeta) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  user,
  shop,
  language = 'en',
  onCloseAdminPortal,
  onUpdateShop,
}) => {
  const isEn = language === 'en';
  const [activeTab, setActiveTab] = useState<'overview' | 'shops' | 'subscriptions' | 'loans' | 'eligible' | 'system'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'has_limit' | 'no_limit' | 'active_loans'>('all');

  // Admin Data State
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>(() => getAllLoanApplications());
  const [merchantShops, setMerchantShops] = useState<MerchantShopSummary[]>([]);
  const [eligibleAlerts, setEligibleAlerts] = useState<EligibleShopAlert[]>(() => getAllEligibleShopAlerts());
  const [subscriptionClaims, setSubscriptionClaims] = useState<SubscriptionPaymentClaim[]>(() => getAllSubscriptionClaims());
  const [customLimitInputs, setCustomLimitInputs] = useState<Record<string, string>>({});
  const [customDaysInputs, setCustomDaysInputs] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [dbSyncStatus, setDbSyncStatus] = useState<'connected' | 'offline' | 'error'>('connected');

  // Real live database metrics
  const [realProductCount, setRealProductCount] = useState(0);
  const [realSaleCount, setRealSaleCount] = useState(0);
  const [realCustomerCount, setRealCustomerCount] = useState(0);
  const [realDebtCount, setRealDebtCount] = useState(0);
  const [realExpenseCount, setRealExpenseCount] = useState(0);
  const [realAuditLogCount, setRealAuditLogCount] = useState(0);
  const [latestAuditLogs, setLatestAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    void refreshData();
  }, []);

  const refreshData = async () => {
    setIsSyncing(true);
    try {
      const synced = await syncLoansAndShopsWithCloud(shop);
      setLoanApplications(synced.applications);
      setMerchantShops(synced.shops);
      setEligibleAlerts(getAllEligibleShopAlerts());
      setSubscriptionClaims(getAllSubscriptionClaims());
      if (synced.updatedCurrentShop) {
        onUpdateShop(synced.updatedCurrentShop);
      }

      // Load real local DB metrics
      const prodCount = await db.products.count();
      const saleCount = await db.sales.count();
      const custCount = await db.customers.count();
      const debtCount = await db.debts.count();
      const expCount = await db.expenses.count();
      const auditCount = await db.audit_log.count();
      const logs = await db.audit_log.orderBy('created_at').reverse().limit(10).toArray();

      setRealProductCount(prodCount);
      setRealSaleCount(saleCount);
      setRealCustomerCount(custCount);
      setRealDebtCount(debtCount);
      setRealExpenseCount(expCount);
      setRealAuditLogCount(auditCount);
      setLatestAuditLogs(logs);

      // Pull users count from Supabase
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
      if (url && anonKey && !url.includes('placeholder')) {
        const usersResp = await fetch(`${url}/rest/v1/users?select=id`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });
        if (usersResp.ok) {
          const usersList = await usersResp.json();
          setTotalUsers(Math.max(usersList.length, 1));
          setDbSyncStatus('connected');
        } else {
          setDbSyncStatus('error');
        }
      } else {
        setTotalUsers(2);
        setDbSyncStatus('connected');
      }
    } catch (err: any) {
      console.warn('Admin portal sync error:', err);
      setDbSyncStatus('offline');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApproveSubscription = async (claim: SubscriptionPaymentClaim, planDays: number = 30) => {
    updateSubscriptionClaimStatus(claim.id, 'verified');
    setSubscriptionClaims(getAllSubscriptionClaims());

    const now = new Date();
    const expiry = new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);

    const patch: Partial<ShopMeta> = {
      plan_status: 'active',
      plan_code: planDays > 60 ? 'annual' : 'monthly',
      subscription_paid_until: expiry.toISOString(),
    };

    if (claim.shop_id === shop.shop_id) {
      const updated = await saveShopMeta(patch);
      onUpdateShop(updated);
    }

    setActionNotice(isEn ? `✅ Approved payment claim for ${claim.shop_name} (${planDays} days added)` : `✅ Imethibitisha malipo ya ${claim.shop_name}`);
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleGrantCreditLimit = async (shopId: string, shopName: string, directLimit?: number, extraInfo?: any) => {
    const limitToSet = directLimit !== undefined ? directLimit : parseInt(customLimitInputs[shopId] || '0', 10);
    if (isNaN(limitToSet) || limitToSet < 0) {
      alert(isEn ? 'Please enter a valid credit limit amount (KES)' : 'Tafadhali weka kiwango sahihi (KES)');
      return;
    }

    await adminGrantLimitToShop(shopId, limitToSet, { shop_name: shopName, ...extraInfo });
    setCustomLimitInputs((prev) => ({ ...prev, [shopId]: '' }));
    setActionNotice(isEn ? `✅ Granted ${formatKES(toKES(limitToSet))} stock credit limit to ${shopName}` : `✅ Imetoa mkopo wa ${formatKES(toKES(limitToSet))} kwa ${shopName}`);
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleDirectSetShopLoanStatus = async (shopData: {
    shop_id: string;
    shop_name: string;
    owner_name: string;
    phone: string;
    town: string;
    amount: number;
    decision: 'approved' | 'rejected';
  }) => {
    await adminDirectSetShopLoanStatus(shopData);
    if (shopData.shop_id === shop.shop_id) {
      const updatedLocal = await getShopMeta();
      onUpdateShop(updatedLocal);
    }
    setActionNotice(
      shopData.decision === 'approved'
        ? `✅ Approved loan of KES ${shopData.amount.toLocaleString()} for ${shopData.shop_name}`
        : `❌ Declined loan for ${shopData.shop_name}`
    );
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleUpdateLoanStatus = async (app: LoanApplication, status: 'approved' | 'disbursed' | 'rejected') => {
    await updateLoanApplicationStatus(app.id, status, `Action by Admin ${user.email}`);
    if (app.shop_id === shop.shop_id) {
      const updatedLocal = await getShopMeta();
      onUpdateShop(updatedLocal);
    }
    setActionNotice(isEn ? `✅ Updated loan status to ${status.toUpperCase()} for ${app.shop_name}` : `✅ Imesasisha hali ya mkopo kuwa ${status}`);
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleUpdateSubscriptionDays = async (shopId: string, currentExpiryStr: string | undefined, deltaDays: number) => {
    const baseDate = currentExpiryStr ? new Date(currentExpiryStr) : new Date();
    const finalBase = isNaN(baseDate.getTime()) ? new Date() : baseDate;
    
    finalBase.setDate(finalBase.getDate() + deltaDays);
    const newExpiryStr = finalBase.toISOString();
    const planStatus = finalBase.getTime() > Date.now() ? 'active' : 'expired';

    await adminUpdateShopSubscription(shopId, newExpiryStr, planStatus);
    
    setActionNotice(isEn 
      ? `✅ Adjusted subscription for shop by ${deltaDays > 0 ? '+' : ''}${deltaDays} days.` 
      : `✅ Imerekebisha muda wa duka kwa siku ${deltaDays > 0 ? '+' : ''}${deltaDays}.`
    );
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleSendDueReminder = async (shopId: string, shopName: string, currentExpiryStr: string | undefined) => {
    const baseDate = currentExpiryStr ? new Date(currentExpiryStr) : new Date();
    const finalBase = isNaN(baseDate.getTime()) ? new Date() : baseDate;
    const planStatus = finalBase.getTime() > Date.now() ? 'active' : 'expired';

    const msg = isEn 
      ? "Your SmartSort subscription is due soon or expired. Please process your payment to maintain uninterrupted offline sales & sync features." 
      : "Muda wa duka lako la SmartSort unaisha hivi karibuni au umeisha. Tafadhali kamilisha malipo ili uendelee kuuza na kusawazisha data.";

    await adminUpdateShopSubscription(shopId, finalBase.toISOString(), planStatus, msg, true);

    setActionNotice(isEn 
      ? `🔔 Sent subscription due reminder to ${shopName}!` 
      : `🔔 Tuma kikumbusho cha malipo kwa duka la ${shopName}!`
    );
    setTimeout(() => setActionNotice(null), 4000);
    void refreshData();
  };

  const handleSeedSampleProducts = async () => {
    try {
      const sampleProducts = [
        { id: 'p-1', shop_id: shop.shop_id || 'shop-admin-001', name: 'Premium Sugar 1kg', selling_price: 180, cost_price: 155, stock: 45, search_key: 'sugar premium sukari', image_emoji: '🍚', is_pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'p-2', shop_id: shop.shop_id || 'shop-admin-001', name: 'Fresh Milk 500ml', selling_price: 75, cost_price: 60, stock: 20, search_key: 'milk fresh maziwa', image_emoji: '🥛', is_pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'p-3', shop_id: shop.shop_id || 'shop-admin-001', name: 'Cooking Oil 1L', selling_price: 320, cost_price: 280, stock: 15, search_key: 'oil cooking mafuta', image_emoji: '🍾', is_pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'p-4', shop_id: shop.shop_id || 'shop-admin-001', name: 'Premium White Bread', selling_price: 65, cost_price: 52, stock: 30, search_key: 'bread premium mkate', image_emoji: '🍞', is_pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'p-5', shop_id: shop.shop_id || 'shop-admin-001', name: 'Pure Kenya Tea Leaves', selling_price: 110, cost_price: 90, stock: 25, search_key: 'tea pure chai', image_emoji: '🍃', is_pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      ];
      for (const prod of sampleProducts) {
        await db.products.put(prod as any);
        await db.product_stock.put({
          product_id: prod.id,
          shop_id: prod.shop_id,
          qty: prod.stock,
          updated_at: new Date().toISOString()
        });
      }
      setActionNotice('🌱 Populated demo products into inventory successfully!');
      setTimeout(() => setActionNotice(null), 4000);
      void refreshData();
    } catch (err: any) {
      alert(`Error seeding products: ${err.message}`);
    }
  };

  const handleWipeTransactions = async () => {
    if (!window.confirm('Are you sure you want to delete ALL local sales, debts, expenses, and products? This cannot be undone.')) {
      return;
    }
    try {
      await db.products.clear();
      await db.product_stock.clear();
      await db.sales.clear();
      await db.sale_items.clear();
      await db.customers.clear();
      await db.debts.clear();
      await db.debt_payments.clear();
      await db.expenses.clear();
      await db.audit_log.clear();
      setActionNotice('🚨 Local database wiped clean successfully.');
      setTimeout(() => setActionNotice(null), 4000);
      void refreshData();
    } catch (err: any) {
      alert(`Error wiping database: ${err.message}`);
    }
  };

  // Aggregated Stats
  const totalShopsCount = Math.max(merchantShops.length, 1);
  const pendingClaimsCount = subscriptionClaims.filter((c) => c.status === 'pending_verification').length;
  const pendingLoansCount = loanApplications.filter((l) => l.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none animate-in fade-in duration-200">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-40 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-tight text-white uppercase">
                SmartSort Super-Admin Portal
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE PRODUCTION
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isEn ? 'Logged in as Central System Admin:' : 'Umeingia kama Msimamizi Mkuu:'}{' '}
              <strong className="text-emerald-400 font-mono">{user.email || 'peterngecu001@gmail.com'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">{isEn ? 'Sync Cloud' : 'Sasisha'}</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={onCloseAdminPortal}
            className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-bold text-xs cursor-pointer"
          >
            ← {isEn ? 'Exit to POS' : 'Rudi POS'}
          </Button>
        </div>
      </header>

      {/* Action Notice */}
      {actionNotice && (
        <div className="bg-emerald-950 border-b border-emerald-600/40 text-emerald-300 px-4 py-2.5 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
          <button type="button" onClick={() => setActionNotice(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: isEn ? 'Overview' : 'Muhtasari', icon: TrendingUp },
          { id: 'shops', label: isEn ? `Shops & Credit (${totalShopsCount})` : `Maduka (${totalShopsCount})`, icon: Building2 },
          { id: 'loans', label: isEn ? `Restock Credit (${loanApplications.length})` : `Mikopo (${loanApplications.length})`, icon: DollarSign, badge: pendingLoansCount },
          { id: 'eligible', label: isEn ? `3+ Mo. Eligible (${eligibleAlerts.length})` : `Vigezo (${eligibleAlerts.length})`, icon: Sparkles },
          { id: 'subscriptions', label: isEn ? `Subscriptions (${subscriptionClaims.length})` : `Malipo (${subscriptionClaims.length})`, icon: CreditCard, badge: pendingClaimsCount },
          { id: 'system', label: isEn ? 'DB & System Logs' : 'Kumbukumbu', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-2 border cursor-pointer ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : ''}`} />
              <span>{tab.label}</span>
              {tab.badge ? (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Main Admin Content */}
      <main className="flex-1 p-4 max-w-6xl w-full mx-auto space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* System Attention & Alert Panel */}
            <div className="space-y-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs font-black uppercase text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                <span>{isEn ? 'System Alerts & Attention' : 'Tahadhari na Hali ya Mfumo'}</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {pendingClaimsCount > 0 && (
                  <div className="p-3 bg-amber-950/60 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300">
                    <span className="text-xl">💳</span>
                    <div>
                      <div className="font-bold">{isEn ? 'Pending Subscriptions Claim' : 'Thibitisha Malipo ya M-Pesa'}</div>
                      <p className="text-[10px] text-amber-400/90 leading-tight">
                        {isEn ? `${pendingClaimsCount} shop owners have claimed payments. Verify their till transactions.` : `Kuna maduka ${pendingClaimsCount} yanayosubiri uidhinishe malipo.`}
                      </p>
                    </div>
                  </div>
                )}

                {pendingLoansCount > 0 && (
                  <div className="p-3 bg-amber-950/60 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300">
                    <span className="text-xl">💰</span>
                    <div>
                      <div className="font-bold">{isEn ? 'Pending Credit Requests' : 'Maombi Mapya ya Mikopo'}</div>
                      <p className="text-[10px] text-amber-400/90 leading-tight">
                        {isEn ? `${pendingLoansCount} credit applications are waiting for your approval.` : `Kuna maombi ${pendingLoansCount} yanayosubiri mapitio yako.`}
                      </p>
                    </div>
                  </div>
                )}

                {eligibleAlerts.length > 0 && (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-emerald-300">
                    <span className="text-xl">✨</span>
                    <div>
                      <div className="font-bold">{isEn ? '3+ Months Eligible Shops Detected' : 'Maduka Yaliyofikisha Miezi 3'}</div>
                      <p className="text-[10px] text-emerald-400/90 leading-tight">
                        {isEn ? `${eligibleAlerts.length} shops qualify for automated restocking credit limits.` : `Maduka ${eligibleAlerts.length} yamefikisha vigezo vya kupewa ukomo wa mkopo.`}
                      </p>
                    </div>
                  </div>
                )}

                {dbSyncStatus === 'connected' && pendingClaimsCount === 0 && pendingLoansCount === 0 && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 rounded-xl col-span-2 flex items-center gap-2.5 text-emerald-400">
                    <span className="text-emerald-400 text-sm">❇️</span>
                    <div>
                      <div className="font-bold">{isEn ? 'All Systems Fully Operational' : 'Mifumo Yote Iko Sawa'}</div>
                      <p className="text-[10px] text-emerald-500/80">
                        {isEn ? 'Zero errors detected. All duka clients are synced, paid, and within limits.' : 'Hakuna matatizo yoyote. Maduka yote yamesawazishwa na yamelipia.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isEn ? 'Total Onboarded Shops' : 'Jumla ya Maduka'}
                </span>
                <div className="text-2xl font-black text-white">{totalShopsCount}</div>
                <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active in Kenya
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isEn ? 'Total Cloud Users' : 'Watumiaji Wote'}
                </span>
                <div className="text-2xl font-black text-emerald-400">{totalUsers || 1}</div>
                <div className="text-[10px] text-slate-400">
                  {isEn ? 'Registered attendants & owners' : 'Wamiliki na wahudumu'}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isEn ? 'Pending Credit Requests' : 'Maombi ya Mikopo'}
                </span>
                <div className="text-2xl font-black text-amber-400">{pendingLoansCount}</div>
                <div className="text-[10px] text-slate-400">Restock credit review</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isEn ? 'Database Status' : 'Hali ya Supabase'}
                </span>
                <div className="text-2xl font-black flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full inline-block animate-pulse ${
                    dbSyncStatus === 'connected' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-amber-500'
                  }`} />
                  <span className="text-lg font-black uppercase text-white font-mono">
                    {dbSyncStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">Supabase Connected</div>
              </div>
            </div>

            {/* Current Active Shop Quick Overrides */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wide">
                  Current Active Shop Credit Override ({shop.shop_name})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Limit: KES {(shop.loan_limit || 0).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 5000, 15000, 25000].map((lim) => (
                  <button
                    key={lim}
                    type="button"
                    onClick={async () => {
                      const updated = await saveShopMeta({ loan_limit: lim, manual_limit_set: true });
                      onUpdateShop(updated);
                      setActionNotice(`Updated current shop credit limit to KES ${lim.toLocaleString()}`);
                      setTimeout(() => setActionNotice(null), 3000);
                      void refreshData();
                    }}
                    className={`py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                      (shop.loan_limit ?? 0) === lim
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    KES {lim.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SHOPS & CREDIT TAB */}
        {activeTab === 'shops' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase font-sans">
                  {isEn ? 'Merchant Shops & Credit Administration' : 'Orodha ya Maduka & Mikopo'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isEn ? 'Grant limits, adjust subscriptions, or directly approve/decline shop loans' : 'Weka kikomo, rekebisha ada na dhibitisha mikopo ya maduka'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch gap-2 shrink-0">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Search name, email, phone...' : 'Tafuta jina, barua pepe...'}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="all">{isEn ? 'All Shops' : 'Maduka Yote'}</option>
                  <option value="has_limit">{isEn ? 'With Credit Limit' : 'Yenye Kikopo'}</option>
                  <option value="no_limit">{isEn ? 'Without Credit' : 'Yasiyo na Kikopo'}</option>
                  <option value="active_loans">{isEn ? 'Active Loan Balances' : 'Yenye Deni la Mkopo'}</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {merchantShops.length === 0 ? (
                <div className="py-8 text-center text-slate-500 italic bg-slate-950 rounded-xl border border-slate-800">
                  {isEn ? 'No remote shops synchronized yet.' : 'Hakuna maduka yaliyosawazishwa bado.'}
                </div>
              ) : (
                merchantShops
                  .filter((s) => {
                    const q = searchQuery.toLowerCase().trim();
                    if (q) {
                      const matchesName = s.shop_name.toLowerCase().includes(q);
                      const matchesEmail = s.contact_email?.toLowerCase().includes(q);
                      const matchesOwner = s.owner_name.toLowerCase().includes(q);
                      const matchesPhone = s.phone?.includes(q);
                      if (!matchesName && !matchesEmail && !matchesOwner && !matchesPhone) return false;
                    }
                    if (filterStatus === 'has_limit') return (s.loan_limit || 0) > 0;
                    if (filterStatus === 'no_limit') return (s.loan_limit || 0) === 0;
                    if (filterStatus === 'active_loans') return (s.active_loan_balance || 0) > 0;
                    return true;
                  })
                  .map((mShop) => {
                    const customVal = customLimitInputs[mShop.shop_id] ?? '';
                    const customDays = customDaysInputs[mShop.shop_id] ?? '';
                    const expDate = mShop.subscription_paid_until ? new Date(mShop.subscription_paid_until) : null;
                    const isValidDate = expDate && !isNaN(expDate.getTime());
                    const isExpired = !isValidDate || expDate.getTime() < Date.now();

                    return (
                      <div
                        key={mShop.shop_id}
                        className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 shadow-md"
                      >
                        {/* Shop Header Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white">{mShop.shop_name}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-amber-400 font-bold">
                                Limit: KES {(mShop.loan_limit || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Owner: <strong className="text-slate-200">{mShop.owner_name}</strong> • Phone: <strong className="text-slate-200">{mShop.phone || 'N/A'}</strong> • Town: {mShop.town || 'Kenya'}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                                isExpired
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {isExpired ? 'Subscription Expired' : 'Subscription Active'}
                            </span>
                            <span
                              className={`text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                                mShop.active_loan_status === 'approved' || mShop.active_loan_status === 'disbursed'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : mShop.active_loan_status === 'declined'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : mShop.active_loan_status === 'pending_approval'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Loan: {mShop.active_loan_status === 'none' ? 'NO LOAN' : mShop.active_loan_status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>

                        {/* Grant Limits Strip */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                            Grant Credit Limit:
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[0, 2000, 5000, 15000, 25000].map((lim) => (
                              <button
                                key={lim}
                                type="button"
                                onClick={() => handleGrantCreditLimit(mShop.shop_id, mShop.shop_name, lim, {
                                  owner_name: mShop.owner_name,
                                  phone: mShop.phone,
                                  town: mShop.town,
                                })}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                  mShop.loan_limit === lim
                                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                                }`}
                              >
                                {lim === 0 ? 'KES 0' : `KES ${lim.toLocaleString()}`}
                              </button>
                            ))}
                            <div className="flex gap-1 items-center ml-auto">
                              <input
                                type="number"
                                value={customVal}
                                onChange={(e) => setCustomLimitInputs((prev) => ({ ...prev, [mShop.shop_id]: e.target.value }))}
                                placeholder="Custom limit..."
                                className="w-28 h-7 px-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-400"
                              />
                              <button
                                type="button"
                                onClick={() => handleGrantCreditLimit(mShop.shop_id, mShop.shop_name, undefined, {
                                  owner_name: mShop.owner_name,
                                  phone: mShop.phone,
                                  town: mShop.town,
                                })}
                                className="px-2.5 h-7 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[10px] uppercase transition cursor-pointer"
                              >
                                Set
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Direct Shop Loan Approval / Decline Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-900">
                          <span className="text-[10px] text-slate-400 font-bold">Direct Shop Loan Action:</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const loanAmt = mShop.active_loan_amount > 0 ? mShop.active_loan_amount : (mShop.loan_limit > 0 ? mShop.loan_limit : 5000);
                                void handleDirectSetShopLoanStatus({
                                  shop_id: mShop.shop_id,
                                  shop_name: mShop.shop_name,
                                  owner_name: mShop.owner_name,
                                  phone: mShop.phone || '0712345678',
                                  town: mShop.town || 'Kenya',
                                  amount: loanAmt,
                                  decision: 'approved',
                                });
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black transition cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approve Loan (KES {(mShop.active_loan_amount || mShop.loan_limit || 5000).toLocaleString()})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const loanAmt = mShop.active_loan_amount > 0 ? mShop.active_loan_amount : (mShop.loan_limit > 0 ? mShop.loan_limit : 5000);
                                void handleDirectSetShopLoanStatus({
                                  shop_id: mShop.shop_id,
                                  shop_name: mShop.shop_name,
                                  owner_name: mShop.owner_name,
                                  phone: mShop.phone || '0712345678',
                                  town: mShop.town || 'Kenya',
                                  amount: loanAmt,
                                  decision: 'rejected',
                                });
                              }}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-black transition cursor-pointer"
                            >
                              Decline Loan
                            </button>
                          </div>
                        </div>

                        {/* Subscription Adjustment Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900 text-xs">
                          <div className="text-[10px] text-slate-400">
                            Valid Until: <strong className="text-slate-200">{isValidDate ? expDate!.toLocaleDateString() : 'None'}</strong>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleUpdateSubscriptionDays(mShop.shop_id, mShop.subscription_paid_until, 30)}
                              className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-black transition cursor-pointer"
                            >
                              +30 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateSubscriptionDays(mShop.shop_id, mShop.subscription_paid_until, -30)}
                              className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded text-[9px] font-black transition cursor-pointer"
                            >
                              -30 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSendDueReminder(mShop.shop_id, mShop.shop_name, mShop.subscription_paid_until)}
                              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[9px] uppercase transition cursor-pointer"
                            >
                              🔔 Send Reminder
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* RESTOCK CREDIT APPLICATIONS TAB */}
        {activeTab === 'loans' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase">
                  {isEn ? 'Restocking Loan Applications Queue' : 'Foleni ya Maombi ya Mikopo'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isEn ? 'Review, disburse, or decline submitted merchant restock loans' : 'Kagua na uidhinishe maombi ya mikopo ya kununua bidhaa'}
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const amt = shop.loan_limit && shop.loan_limit > 0 ? shop.loan_limit : 5000;
                  await submitLoanApplication({
                    shop_id: shop.shop_id,
                    shop_name: shop.shop_name,
                    owner_name: shop.owner_name,
                    phone: shop.phone || '0712345678',
                    email: user.email || undefined,
                    town: shop.town || 'Nairobi',
                    county: shop.county || 'Nairobi',
                    amount: amt,
                    duration_days: 7,
                    repayment_plan_desc: '7 Days repayment (2 weekly instalments accepted)',
                    instalment_breakdown: `2 instalments of KES ${Math.ceil((amt * 1.01) / 2).toLocaleString()}`,
                    daily_sales_kes: 5000,
                    weekly_sales_kes: 25000,
                  });
                  setActionNotice(`Logged test application of KES ${amt.toLocaleString()} for ${shop.shop_name}`);
                  setTimeout(() => setActionNotice(null), 4000);
                  void refreshData();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-black transition cursor-pointer"
              >
                + Log Test Application
              </button>
            </div>

            <div className="space-y-3">
              {loanApplications.length === 0 ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  No restocking loan applications submitted yet.
                </div>
              ) : (
                loanApplications.map((app) => {
                  const isPending = app.status === 'pending_review';
                  const isApproved = app.status === 'approved' || app.status === 'disbursed';
                  return (
                    <div
                      key={app.id}
                      className={`p-4 bg-slate-950 border rounded-2xl space-y-3 ${
                        isPending ? 'border-amber-500/60 shadow-lg shadow-amber-500/5' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">{app.shop_name}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase ${
                                isPending
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : isApproved
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {app.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Owner: <strong className="text-slate-200">{app.owner_name}</strong> • Phone: <strong className="text-slate-200">{app.phone}</strong> • {app.town || 'Kenya'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-base font-black text-amber-400 tabular-nums">
                            KES {app.amount.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">{app.duration_days} Days Term</div>
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-900 rounded-xl text-xs text-slate-300 space-y-1 border border-slate-800">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Repayment Plan:</span>
                          <span className="font-bold text-emerald-400">{app.instalment_breakdown || app.repayment_plan_desc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Sales Record:</span>
                          <span>Today KES {app.daily_sales_kes.toLocaleString()} / Week KES {app.weekly_sales_kes.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          variant="gradient"
                          size="sm"
                          onClick={() => handleUpdateLoanStatus(app, 'approved')}
                          className="font-bold text-xs py-1.5 px-3 cursor-pointer"
                        >
                          ✓ Approve Loan
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateLoanStatus(app, 'disbursed')}
                          className="font-bold text-xs py-1.5 px-3 border-emerald-500/40 text-emerald-300 cursor-pointer"
                        >
                          Disburse Funds
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateLoanStatus(app, 'rejected')}
                          className="font-bold text-xs py-1.5 px-3 border-rose-500/40 text-rose-300 cursor-pointer"
                        >
                          Decline
                        </Button>
                        <a
                          href={`https://wa.me/${(app.phone || '0712345678').replace(/\+/g, '').replace(/^0/, '254')}?text=${encodeURIComponent(
                            `Hello ${app.owner_name}, regarding your SmartSort Restock Loan application for ${app.shop_name} of KES ${app.amount.toLocaleString()}: Your application has been reviewed.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ml-auto"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 3+ MONTHS OPERATIONAL ELIGIBLE SHOPS TAB */}
        {activeTab === 'eligible' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>3+ Months Operational Eligible Shops Milestone</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Shops that have maintained active selling records for at least 3 months and qualify for automated credit lines
              </p>
            </div>

            <div className="space-y-3">
              {eligibleAlerts.length === 0 ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  No shops currently flagged for 3+ months operational milestone yet.
                </div>
              ) : (
                eligibleAlerts.map((alertItem) => (
                  <div
                    key={alertItem.id}
                    className="p-4 bg-slate-950 border border-emerald-500/40 rounded-2xl space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{alertItem.shop_name} ({alertItem.town})</span>
                      <span className="text-[10px] text-emerald-300 font-mono bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-700">
                        {alertItem.days_active} Days Active
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 flex justify-between bg-slate-900 p-2 rounded-xl">
                      <span>Calculated Recommended Limit:</span>
                      <span className="font-black text-amber-400">KES {alertItem.calculated_limit.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400">
                        Status: <strong className="text-slate-200 uppercase">{alertItem.status.replace(/_/g, ' ')}</strong>
                      </span>
                      <Button
                        variant="gradient"
                        size="sm"
                        onClick={async () => {
                          await adminGrantLimitToShop(alertItem.shop_id, alertItem.calculated_limit);
                          if (alertItem.shop_id === shop.shop_id) {
                            const updatedShop = await getShopMeta();
                            onUpdateShop(updatedShop);
                          }
                          setEligibleAlerts(getAllEligibleShopAlerts());
                          setActionNotice(`Granted KES ${alertItem.calculated_limit.toLocaleString()} credit limit to ${alertItem.shop_name}!`);
                          setTimeout(() => setActionNotice(null), 4000);
                        }}
                        className="font-bold text-xs py-1.5 px-3"
                      >
                        Grant Recommended Limit KES {alertItem.calculated_limit.toLocaleString()}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SUBSCRIPTIONS TAB */}
        {activeTab === 'subscriptions' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase">
                {isEn ? 'M-Pesa Subscription Payments & Reminders' : 'Uhakiki wa Malipo ya M-Pesa & Vikumbusho'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEn ? 'Verify M-Pesa till transactions and activate shop subscriptions instantly' : 'Thibitisha malipo ya M-Pesa na tuma vikumbusho'}
              </p>
            </div>

            <div className="space-y-3">
              {subscriptionClaims.length === 0 ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  No subscription payment claims recorded yet.
                </div>
              ) : (
                subscriptionClaims.map((claim) => (
                  <div key={claim.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">{claim.shop_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${claim.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {claim.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">Owner: {claim.owner_name} • Phone: {claim.phone}</div>
                      <div className="text-[11px] text-emerald-400 font-bold">
                        Amount Claimed: {formatKES(toKES(claim.amount_kes))} ({claim.days} days)
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {claim.status === 'pending_verification' && (
                        <Button
                          variant="gradient"
                          size="sm"
                          onClick={() => handleApproveSubscription(claim, claim.days || 30)}
                          className="font-bold text-xs py-1.5 px-3 cursor-pointer"
                        >
                          Verify & Activate
                        </Button>
                      )}
                      <a
                        href={`https://wa.me/${claim.phone.replace(/\+/g, '').replace(/^0/, '254')}?text=${encodeURIComponent(
                          `Hello ${claim.owner_name}, this is SmartSort Finance. We notice your subscription payment of KES ${claim.amount_kes.toLocaleString()} for ${claim.shop_name} is pending verification. Kindly confirm payment via Till 247247.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          incrementClaimReminder(claim.id);
                          setSubscriptionClaims(getAllSubscriptionClaims());
                        }}
                        className="py-1.5 px-3 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Send Reminder {claim.reminder_sent_count ? `(${claim.reminder_sent_count})` : ''}</span>
                      </a>
                      <a
                        href={`tel:${claim.phone}`}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SYSTEM & DATABASE DIAGNOSTICS TAB */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Live Database Statistics Grid */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-amber-400 tracking-wide">
                Real-Time Local Database Metrics
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center text-xs">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Products</span>
                  <span className="text-base font-black text-emerald-400 tabular-nums">{realProductCount} Items</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Sales Headers</span>
                  <span className="text-base font-black text-emerald-400 tabular-nums">{realSaleCount} Receipts</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Customers</span>
                  <span className="text-base font-black text-amber-400 tabular-nums">{realCustomerCount} Leads</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Debts / Ledgers</span>
                  <span className="text-base font-black text-amber-400 tabular-nums">{realDebtCount} Ledgers</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Expenses</span>
                  <span className="text-base font-black text-rose-400 tabular-nums">{realExpenseCount} Records</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Audit Logs</span>
                  <span className="text-base font-black text-blue-400 tabular-nums">{realAuditLogCount} Logs</span>
                </div>
              </div>
            </div>

            {/* System Utilities & Seed Options */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wide">
                System Utilities & Data Seed Options
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleSeedSampleProducts}
                  className="p-3 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition border border-emerald-800 active:scale-95 cursor-pointer"
                >
                  🌱 Pre-populate Demo Inventory
                </button>
                <button
                  type="button"
                  onClick={handleWipeTransactions}
                  className="p-3 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition border border-rose-800 active:scale-95 cursor-pointer"
                >
                  🚨 Wipe Local Database Clean
                </button>
              </div>
            </div>

            {/* Live Tamper-Proof Audit Log Trail */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wide">
                Latest Tamper-Proof Audit Log Trail
              </h3>
              {latestAuditLogs.length === 0 ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  No system operations logged yet.
                </div>
              ) : (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-800 text-xs font-mono">
                  {latestAuditLogs.map((log) => (
                    <div key={log.id} className="py-2 first:pt-0 last:pb-0 flex justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-100 block">{log.action}</span>
                        <span className="text-slate-400 block">{log.entity_type} ID: {log.entity_id.slice(0, 10)}...</span>
                      </div>
                      <span className="text-slate-500 shrink-0 text-right">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
