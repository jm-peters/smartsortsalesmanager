import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  Search,
  MessageCircle,
  Check,
  Clock,
  Phone,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  User,
  Calendar,
  AlertTriangle,
  Receipt,
  Layers,
  ArrowDownCircle,
  History,
  ShieldAlert,
} from 'lucide-react';
import {
  db,
  serverNow,
  recordDebtPayment,
  recordCustomerDebtPayment,
  getShopMeta,
  saveShopMeta,
  adjustCustomerLoyaltyPoints,
  getOrCreateDeviceId,
  syncWriteThrough,
  getShopUser,
  getStaffAttendants,
  resolveSaleCashierDisplay,
  type OutboxEntry,
  type Debt,
  type Customer,
  type UserRole,
  type SaleHeader,
  type SaleItem,
} from '../lib/db/local';
import { syncEngine } from '../lib/sync/engine';
import {
  toKES,
  formatKES,
  subKES,
  addKES,
  type KES,
} from '../lib/money';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { NumPad } from '../components/NumPad';
import { DebtorReminderModal } from '../components/DebtorReminderModal';
import { DefaultedDebtClaimModal } from '../components/DefaultedDebtClaimModal';
import {
  openDebtorWhatsApp,
  isDebtDefaulted,
  calculateDefaultCompensation,
  type DebtorReminderOptions,
} from '../lib/reminder';
import { translations, type Language } from '../lib/i18n';

interface DeniScreenProps {
  userRole: UserRole;
  shopName: string;
  tillNumber?: string;
  language?: Language;
}

interface CustomerGroupedDebts {
  customer: Customer | { id: string; name: string; phone?: string | null; credit_limit?: KES | null };
  debts: Debt[];
  totalOutstanding: KES;
  totalOriginal: KES;
  totalPaid: KES;
  oldestDays: number;
  isDefaulted: boolean;
  hasOverdue: boolean;
}

export const DeniScreen: React.FC<DeniScreenProps> = ({
  userRole,
  shopName,
  tillNumber = '247247 (Acc: 253499)',
  language = 'en',
}) => {
  const isOwner = userRole === 'owner';
  const isEn = language === 'en';
  const t = translations[language];

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'overdue' | 'defaulted'>('open');
  const [viewMode, setViewMode] = useState<'customer_ledger' | 'single_entries'>('customer_ledger');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());

  // Record Payment Sheet (Single debt or Customer Account)
  const [paymentTarget, setPaymentTarget] = useState<{
    type: 'customer' | 'debt';
    customerId?: string;
    customerName: string;
    debtId?: string;
    outstanding: KES;
  } | null>(null);
  const [paymentAmountStr, setPaymentAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  // Add Standalone / Additional Credit Sheet
  const [isAddDeniOpen, setIsAddDeniOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [noteStr, setNoteStr] = useState('');

  // Customer Credit Limit Setting Sheet
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [creditLimitStr, setCreditLimitStr] = useState('');

  // Debtor WhatsApp Reminder State
  const [reminderDebt, setReminderDebt] = useState<Debt | null>(null);
  const [reminderToast, setReminderToast] = useState<{ message: string; debt: Debt } | null>(null);

  // Defaulted Debt Helpline Claim Modal State (2+ Months 70% Compensation)
  const [claimDebt, setClaimDebt] = useState<Debt | null>(null);

  // Loyalty Points Modal State
  const [loyaltyModalCustomer, setLoyaltyModalCustomer] = useState<Customer | null>(null);
  const [loyaltyDeltaStr, setLoyaltyDeltaStr] = useState('');

  // Live queries scoped strictly to active shop branch
  const shopMeta = useLiveQuery(() => getShopMeta(), []);
  const activeShopId = shopMeta?.shop_id;
  const loggedInUser = useLiveQuery(() => getShopUser(), []);
  const allUsers = useLiveQuery(() => db.users.toArray(), []) || [];
  const staffAttendants = useLiveQuery(() => getStaffAttendants(), []) || [];

  // Trigger an immediate sync pass when DeniScreen mounts so all credit entries recorded by attendants appear immediately for the owner
  useEffect(() => {
    void syncEngine.triggerSync();
  }, [activeShopId, filterStatus]);

  const usersMap = useMemo(() => {
    const map = new Map<string, { name: string; role?: string }>();
    for (const u of allUsers) {
      if (u.id && u.name) map.set(u.id, { name: u.name, role: u.role });
    }
    for (const att of staffAttendants) {
      if (att.id && att.name) map.set(att.id, { name: att.name, role: 'attendant' });
    }
    if (loggedInUser?.id && loggedInUser?.name) {
      map.set(loggedInUser.id, { name: loggedInUser.name, role: loggedInUser.role });
    }
    if (shopMeta?.user_id && shopMeta?.owner_name && !map.has(shopMeta.user_id)) {
      map.set(shopMeta.user_id, { name: shopMeta.owner_name, role: 'owner' });
    }
    return map;
  }, [allUsers, staffAttendants, loggedInUser, shopMeta]);

  const debts = useLiveQuery(
    () =>
      db.debts
        .orderBy('created_at')
        .reverse()
        .filter((d) => !activeShopId || !d.shop_id || d.shop_id === activeShopId)
        .toArray(),
    [activeShopId]
  ) || [];

  const customers = useLiveQuery(
    () =>
      db.customers
        .filter((c) => c.deleted_at === null && (!activeShopId || !c.shop_id || c.shop_id === activeShopId))
        .toArray(),
    [activeShopId]
  ) || [];

  const allSales = useLiveQuery(
    () =>
      db.sales
        .filter((s) => !activeShopId || !s.shop_id || s.shop_id === activeShopId)
        .toArray(),
    [activeShopId]
  ) || [];
  const allSaleItems = useLiveQuery(
    () =>
      db.sale_items
        .filter((it) => !activeShopId || !it.shop_id || it.shop_id === activeShopId)
        .toArray(),
    [activeShopId]
  ) || [];

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const salesMap = useMemo(() => {
    const map = new Map<string, SaleHeader>();
    allSales.forEach((s) => map.set(s.id, s));
    return map;
  }, [allSales]);

  const saleItemsBySaleId = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of allSaleItems) {
      const list = map.get(item.sale_id) || [];
      list.push(item);
      map.set(item.sale_id, list);
    }
    return map;
  }, [allSaleItems]);

  const totalDeniAmount = useMemo(() => {
    return debts
      .filter((d) => {
        return d.status !== 'paid' && d.status !== 'written_off';
      })
      .reduce((sum, d) => addKES(sum, subKES(d.principal, d.amount_paid)), toKES(0));
  }, [debts]);

  // Defaulted Debts (Product debts unrecovered for 2+ months / >= 60 days)
  const defaultedDebts = useMemo(() => {
    const now = Date.now();
    return debts.filter((d) => {
      const balance = subKES(d.principal, d.amount_paid);
      const isOpen = balance > 0 && d.status !== 'paid' && d.status !== 'written_off';
      const days = Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return isOpen && isDebtDefaulted(days, balance);
    });
  }, [debts]);

  const totalCompensationEligible = useMemo(() => {
    return defaultedDebts.reduce((sum, d) => {
      const balance = subKES(d.principal, d.amount_paid);
      return sum + calculateDefaultCompensation(balance);
    }, 0);
  }, [defaultedDebts]);

  // Group debts by customer for continuous chronological credit ledger
  const customerGroupedDebts = useMemo(() => {
    const now = Date.now();
    const groups = new Map<string, CustomerGroupedDebts>();

    debts.forEach((d) => {
      const key = d.customer_id || d.customer_name || 'unknown';
      const balance = subKES(d.principal, d.amount_paid);
      const days = Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const isDefault = balance > 0 && d.status !== 'paid' && d.status !== 'written_off' && isDebtDefaulted(days, balance);
      const isOverdue = balance > 0 && d.status !== 'paid' && d.status !== 'written_off' && days >= 30;

      let group = groups.get(key);
      if (!group) {
        const custObj = customerMap.get(d.customer_id) || {
          id: d.customer_id || key,
          name: d.customer_name,
          phone: d.customer_phone || null,
          credit_limit: null,
        };
        group = {
          customer: custObj,
          debts: [],
          totalOutstanding: toKES(0),
          totalOriginal: toKES(0),
          totalPaid: toKES(0),
          oldestDays: 0,
          isDefaulted: false,
          hasOverdue: false,
        };
        groups.set(key, group);
      }

      group.debts.push(d);
      group.totalOriginal = addKES(group.totalOriginal, d.principal);
      group.totalPaid = addKES(group.totalPaid, d.amount_paid);

      if (d.status !== 'paid' && d.status !== 'written_off') {
        group.totalOutstanding = addKES(group.totalOutstanding, balance);
        group.oldestDays = Math.max(group.oldestDays, days);
        if (isDefault) group.isDefaulted = true;
        if (isOverdue) group.hasOverdue = true;
      }
    });

    // Sort debts inside each group chronologically (newest first for display, with dates)
    groups.forEach((g) => {
      g.debts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    let result = Array.from(groups.values());

    // Filter by tab
    if (filterStatus === 'open') {
      result = result.filter((g) => g.totalOutstanding > 0);
    } else if (filterStatus === 'overdue') {
      result = result.filter((g) => g.totalOutstanding > 0 && g.hasOverdue);
    } else if (filterStatus === 'defaulted') {
      result = result.filter((g) => g.totalOutstanding > 0 && g.isDefaulted);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((g) => {
        const nameMatch = (g.customer.name || '').toLowerCase().includes(q);
        const phoneMatch = Boolean(g.customer.phone && g.customer.phone.includes(q));
        return nameMatch || phoneMatch;
      });
    }

    // Sort by largest outstanding balance first
    result.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    return result;
  }, [debts, customerMap, filterStatus, searchQuery]);

  // Filtered single debts for individual view
  const filteredSingleDebts = useMemo(() => {
    const now = Date.now();
    return debts.filter((d) => {
      const balance = subKES(d.principal, d.amount_paid);
      const isOpen = balance > 0 && d.status !== 'paid' && d.status !== 'written_off';
      const days = Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));

      if (filterStatus === 'open' && !isOpen) return false;
      if (filterStatus === 'overdue' && (!isOpen || days < 30)) return false;
      if (filterStatus === 'defaulted' && (!isOpen || days < 60)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (d.customer_name || '').toLowerCase().includes(q) ||
          Boolean(d.customer_phone && d.customer_phone.includes(q))
        );
      }
      return true;
    });
  }, [debts, filterStatus, searchQuery]);

  const toggleCustomerExpand = (custId: string) => {
    setExpandedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) {
        next.delete(custId);
      } else {
        next.add(custId);
      }
      return next;
    });
  };

  // Kumbusha (Remind via WhatsApp)
  const handleRemindCustomer = async (debt: Debt, forceModal = false) => {
    const customer = customerMap.get(debt.customer_id);
    const phone = (debt.customer_phone || customer?.phone || '').trim();
    const balance = subKES(debt.principal, debt.amount_paid);
    const daysOld = Math.floor(
      (Date.now() - new Date(debt.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (!phone || forceModal) {
      setReminderDebt(debt);
      return;
    }

    const reminderOptions: DebtorReminderOptions = {
      customerName: debt.customer_name,
      customerPhone: phone,
      shopName,
      totalBalance: balance,
      principal: debt.principal,
      amountPaid: debt.amount_paid,
      daysOld,
      tillNumber,
      language,
    };

    openDebtorWhatsApp(reminderOptions);

    setReminderToast({
      message: isEn
        ? `WhatsApp reminder sent to ${debt.customer_name} (${phone})`
        : `Kumbusho la WhatsApp limetumwa kwa ${debt.customer_name} (${phone})`,
      debt,
    });
    setTimeout(() => {
      setReminderToast(null);
    }, 5000);
  };

  // Remind entire customer account statement
  const handleRemindCustomerAccount = (group: CustomerGroupedDebts) => {
    const openDebt = group.debts.find((d) => subKES(d.principal, d.amount_paid) > 0) || group.debts[0];
    if (openDebt) {
      const debtToRemind: Debt = {
        ...openDebt,
        principal: group.totalOriginal,
        amount_paid: group.totalPaid,
      };
      handleRemindCustomer(debtToRemind);
    }
  };

  const handleSaveDebtorPhone = async (debt: Debt, newPhone: string) => {
    const cleanPhone = newPhone.trim();
    if (!cleanPhone) return;
    const now = serverNow();
    const entries: OutboxEntry[] = [];

    await db.debts.update(debt.id, {
      customer_phone: cleanPhone,
      updated_at: now,
    });
    entries.push({
      id: debt.id,
      table: 'debts',
      op: 'update',
      payload: { id: debt.id, customer_phone: cleanPhone, updated_at: now },
      attempts: 0,
      next_attempt_at: now,
    });

    if (debt.customer_id) {
      await db.customers.update(debt.customer_id, {
        phone: cleanPhone,
        updated_at: now,
      });
      entries.push({
        id: debt.customer_id,
        table: 'customers',
        op: 'update',
        payload: { id: debt.customer_id, phone: cleanPhone, updated_at: now },
        attempts: 0,
        next_attempt_at: now,
      });
    }

    void syncWriteThrough(entries);
  };

  // Open Payment for single debt
  const handleOpenSingleDebtPayment = (debt: Debt) => {
    const balance = subKES(debt.principal, debt.amount_paid);
    setPaymentTarget({
      type: 'debt',
      debtId: debt.id,
      customerName: debt.customer_name,
      outstanding: balance,
    });
    setPaymentAmountStr(String(balance));
    setPaymentMethod('cash');
  };

  // Open Payment for entire Customer Account
  const handleOpenCustomerPayment = (group: CustomerGroupedDebts) => {
    setPaymentTarget({
      type: 'customer',
      customerId: group.customer.id,
      customerName: group.customer.name,
      outstanding: group.totalOutstanding,
    });
    setPaymentAmountStr(String(group.totalOutstanding));
    setPaymentMethod('cash');
  };

  const handleSavePayment = async () => {
    if (!paymentTarget) return;
    const amountNum = Number(paymentAmountStr);
    if (!amountNum || amountNum <= 0) return;

    setSavingPayment(true);
    try {
      const kes = toKES(amountNum);
      if (paymentTarget.type === 'customer' && paymentTarget.customerId) {
        const res = await recordCustomerDebtPayment({
          customerId: paymentTarget.customerId,
          amount: kes,
          method: paymentMethod,
        });

        if (typeof window !== 'undefined') {
          window.alert(
            res.remainingBalance <= 0
              ? isEn
                ? `Payment of ${formatKES(kes)} recorded! Customer account fully cleared.`
                : `Malipo ya ${formatKES(kes)} yamerekodiwa! Akaunti ya mteja huyu imelipwa yote.`
              : isEn
              ? `Payment of ${formatKES(kes)} recorded. Remaining customer balance: ${formatKES(res.remainingBalance)}`
              : `Malipo ya ${formatKES(kes)} yamerekodiwa. Salio lililobaki kwa mteja: ${formatKES(res.remainingBalance)}`
          );
        }
      } else if (paymentTarget.debtId) {
        const res = await recordDebtPayment({
          debtId: paymentTarget.debtId,
          amount: kes,
          method: paymentMethod,
        });

        if (typeof window !== 'undefined') {
          window.alert(
            res.newBalance <= 0
              ? isEn
                ? 'Debt fully settled and closed.'
                : 'Deni limelipwa lote na limefungwa.'
              : isEn
              ? `Payment of ${formatKES(kes)} recorded. Remaining balance: ${formatKES(res.newBalance)}`
              : `Malipo ya ${formatKES(kes)} yamerekodiwa. Salio: ${formatKES(res.newBalance)}`
          );
        }
      }

      setPaymentTarget(null);
    } catch {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Error recording payment.' : 'Kosa katika kurekodi malipo.');
      }
    } finally {
      setSavingPayment(false);
    }
  };

  // Open "Add Credit" pre-filled for a specific customer
  const handleOpenAddCreditForCustomer = (cust: { id: string; name: string; phone?: string | null }) => {
    setCustomerId(cust.id);
    setCustName(cust.name);
    setCustPhone(cust.phone || '');
    setAmountStr('');
    setNoteStr('');
    setIsAddDeniOpen(true);
  };

  // Add Standalone / Additional Debt
  const handleSaveNewDeni = async () => {
    const amountNum = Number(amountStr);
    if (!amountNum || amountNum <= 0) {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Please enter a valid credit amount.' : 'Weka kiasi halali cha deni.');
      }
      return;
    }

    let finalCustId = customerId;
    const now = serverNow();
    const shop = await getShopMeta();
    const deviceId = await getOrCreateDeviceId();
    const syncEntries: OutboxEntry[] = [];

    if (!finalCustId) {
      if (!custName.trim()) {
        if (typeof window !== 'undefined') {
          window.alert(isEn ? 'Please enter customer name.' : 'Weka jina la mteja.');
        }
        return;
      }
      finalCustId = crypto.randomUUID();
      const newC: Customer = {
        id: finalCustId,
        shop_id: shop.shop_id,
        name: custName.trim(),
        phone: custPhone.trim() || null,
        notes: null,
        credit_limit: shop.default_credit_limit ?? toKES(3000),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      await db.customers.put(newC);
      syncEntries.push({
        id: finalCustId,
        table: 'customers',
        op: 'insert',
        payload: newC as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    }

    const selectedCust = customerMap.get(finalCustId) || {
      name: custName.trim(),
      phone: custPhone.trim() || null,
    };

    const activeUser = await getShopUser();
    const recordedByName =
      (activeUser?.name && activeUser.name !== 'Smartsort User'
        ? activeUser.name
        : shop.owner_name || activeUser?.username || 'Cashier');

    const debtId = crypto.randomUUID();
    const newDebt: Debt = {
      id: debtId,
      shop_id: shop.shop_id,
      customer_id: finalCustId,
      customer_name: selectedCust.name,
      customer_phone: selectedCust.phone,
      principal: toKES(amountNum),
      amount_paid: toKES(0),
      status: 'open',
      due_date: null,
      sale_id: null,
      override_reason: noteStr.trim() ? `Note: ${noteStr.trim()}` : null,
      created_at: now,
      updated_at: now,
      device_id: deviceId,
      created_by: activeUser?.id || shop.user_id,
      recorded_by: recordedByName,
    };

    await db.debts.put(newDebt);
    syncEntries.push({
      id: debtId,
      table: 'debts',
      op: 'insert',
      payload: newDebt as unknown as Record<string, unknown>,
      attempts: 0,
      next_attempt_at: now,
    });

    void syncWriteThrough(syncEntries);

    // Auto expand this customer
    setExpandedCustomerIds((prev) => new Set([...prev, finalCustId]));

    setIsAddDeniOpen(false);
    setAmountStr('');
    setNoteStr('');
    setCustName('');
    setCustPhone('');
    setCustomerId('');

    if (typeof window !== 'undefined') {
      window.alert(
        isEn
          ? `Added new credit of ${formatKES(toKES(amountNum))} to ${selectedCust.name}'s account.`
          : `Deni jipya la ${formatKES(toKES(amountNum))} limeongezwa kwa ${selectedCust.name}.`
      );
    }
  };

  // Update Customer Credit Limit
  const handleSaveCreditLimit = async () => {
    if (!editingCustomer) return;
    const limit = toKES(Number(creditLimitStr) || 3000);
    const now = serverNow();

    await db.customers.update(editingCustomer.id, {
      credit_limit: limit,
      updated_at: now,
    });
    void syncWriteThrough({
      id: editingCustomer.id,
      table: 'customers',
      op: 'update',
      payload: { id: editingCustomer.id, credit_limit: limit, updated_at: now },
      attempts: 0,
      next_attempt_at: now,
    });

    const savedName = editingCustomer.name;
    setEditingCustomer(null);
    if (typeof window !== 'undefined') {
      window.alert(
        isEn
          ? `Credit limit for ${savedName} set to KES ${limit}.`
          : `Kikomo cha mkopo kwa ${savedName} kimewekwa KES ${limit}.`
      );
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 leading-tight">
            {t.deniTitle}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isEn ? 'Customer Credit Accounts & Dated Ledgers' : 'Akaunti za Madeni ya Wateja & Kumbukumbu za Tarehe'}
          </p>
        </div>

        <Button
          variant="gradient"
          size="sm"
          onClick={() => {
            setCustomerId('');
            setCustName('');
            setCustPhone('');
            setAmountStr('');
            setNoteStr('');
            setIsAddDeniOpen(true);
          }}
          className="flex items-center gap-1.5 shadow-sm text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          {isEn ? 'New Credit' : 'Deni Jipya'}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Total Outstanding Hero Card */}
        <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-100 uppercase tracking-wider">
              {t.totalOutstandingCredit}
            </span>
            <div className="text-3xl font-black tabular-nums mt-0.5">
              {formatKES(totalDeniAmount)}
            </div>
            <div className="text-[10px] text-amber-100 mt-1">
              {isEn
                ? `${customerGroupedDebts.length} active customer accounts`
                : `Akaunti za wateja ${customerGroupedDebts.length}`}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
            📖
          </div>
        </div>

        {/* Customer Loyalty Points Program Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-emerald-500/10 border border-amber-200/60 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎁</span>
              <h3 className="font-black text-sm text-slate-900">
                {isEn ? 'Customer Loyalty Points Program' : 'Mpango wa Pointi za Uaminifu za Wateja'}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                shopMeta?.loyalty_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {shopMeta?.loyalty_enabled ? (isEn ? 'Active' : 'Inatumika') : (isEn ? 'Inactive' : 'Imezimwa')}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {isEn
                ? 'Reward repeat buyers automatically. Customers earn loyalty points on every purchase (default: 1 pt per KES 100 spent).'
                : 'Zawadi wateja waaminifu moja kwa moja. Wateja wanapata pointi kwa kila ununuzi (wastani: pointi 1 kwa KES 100).'}
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={async () => {
                const newState = !shopMeta?.loyalty_enabled;
                await saveShopMeta({ loyalty_enabled: newState });
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black shadow-xs transition shrink-0 cursor-pointer ${
                shopMeta?.loyalty_enabled
                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {shopMeta?.loyalty_enabled
                ? (isEn ? 'Disable Loyalty Points' : 'Zima Pointi za Uaminifu')
                : (isEn ? 'Enable Loyalty Points' : 'Washa Pointi za Uaminifu')}
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search customer name or phone number...' : 'Tafuta jina la mteja au nambari ya simu...'}
            className="w-full h-11 pl-10 pr-4 text-xs bg-white border border-slate-200 rounded-xl shadow-2xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* View Mode & Filter Tabs */}
        <div className="space-y-2">
          {/* View Mode Toggle: Customer Grouped Ledger vs Single Entries */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('customer_ledger')}
              className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                viewMode === 'customer_ledger'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isEn ? 'Customer Ledgers (Grouped)' : 'Akaunti za Wateja (Pamoja)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('single_entries')}
              className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                viewMode === 'single_entries'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isEn ? 'Single Entries' : 'Miamala Moja Moja'}</span>
            </button>
          </div>

          {/* Status Filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <button
              type="button"
              onClick={() => setFilterStatus('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                filterStatus === 'open'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <span>{isEn ? 'Open Credit' : 'Madeni Yaliyopo'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('overdue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                filterStatus === 'overdue'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <span>{isEn ? '30+ Days Overdue' : 'Siku 30+'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('defaulted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filterStatus === 'defaulted'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <span>{isEn ? '🛡️ 60+ Days Defaulted (70% Claim)' : '🛡️ Miezi 2+ Fidia 70%'}</span>
              {defaultedDebts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  {defaultedDebts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                filterStatus === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {isEn ? 'All Records' : 'Yote'}
            </button>
          </div>
        </div>

        {/* 70% Seller Compensation Alert Banner */}
        {defaultedDebts.length > 0 && filterStatus !== 'defaulted' && (
          <div className="p-3.5 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border border-amber-300 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                <span className="text-sm">🛡️</span>
                <span>
                  {isEn
                    ? `${defaultedDebts.length} Defaulted Debt(s) Eligible for 70% Compensation`
                    : `Madeni ${defaultedDebts.length} Yaliyofifia Yanastahili Fidia ya 70%`}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-tight">
                {isEn
                  ? `Uncleared after 2 months. Total compensation entitlement: ${formatKES(totalCompensationEligible)}.`
                  : `Hayajalipwa baada ya miezi 2. Fidia unayostahili: ${formatKES(totalCompensationEligible)}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFilterStatus('defaulted')}
              className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 shadow-xs cursor-pointer"
            >
              {isEn ? 'View & Claim' : 'Angalia Fidia'}
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 1: CUSTOMER GROUPED CONTINUOUS CREDIT LEDGER (DEFAULT)          */}
        {/* ========================================================================= */}
        {viewMode === 'customer_ledger' && (
          <div className="space-y-3 animate-in fade-in">
            {customerGroupedDebts.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                <Check className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                <div className="font-bold text-base text-slate-800">
                  {isEn ? 'No Customer Debts Found' : 'Hakuna Madeni ya Wateja'}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isEn
                    ? 'No customer accounts matching this filter criteria.'
                    : 'Hakuna akaunti za wateja zilizolingana na vigezo hivi.'}
                </p>
              </div>
            ) : (
              customerGroupedDebts.map((group) => {
                const isExpanded = expandedCustomerIds.has(group.customer.id);
                const limit = (group.customer as Customer)?.credit_limit ?? toKES(3000);
                const isPaidOff = group.totalOutstanding <= 0;
                const limitUsagePercent = Math.min(100, Math.round((group.totalOutstanding / limit) * 100));

                const dotColor = group.isDefaulted
                  ? 'bg-rose-600 ring-2 ring-rose-300 animate-pulse'
                  : group.oldestDays < 7
                  ? 'bg-emerald-500'
                  : group.oldestDays < 30
                  ? 'bg-amber-500'
                  : 'bg-rose-600 animate-pulse';

                return (
                  <div
                    key={group.customer.id}
                    className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition ${
                      group.isDefaulted ? 'border-l-4 border-l-rose-600' : ''
                    }`}
                  >
                    {/* Customer Account Header Card */}
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${dotColor}`}
                            title={
                              group.isDefaulted
                                ? isEn ? 'Defaulted (2+ Months Overdue)' : 'Deni Lililofifia (Miezi 2+)'
                                : isEn ? `Oldest transaction is ${group.oldestDays} days old` : `Deni la zamani lina siku ${group.oldestDays}`
                            }
                          />

                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-sm text-slate-900">
                                {group.customer.name}
                              </span>
                              {group.isDefaulted && (
                                <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider border border-rose-200">
                                  {isEn ? '⚠️ Defaulted' : '⚠️ Lililofifia'}
                                </span>
                              )}
                              {(group.customer as Customer) && isOwner && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCustomer(group.customer as Customer);
                                    setCreditLimitStr(String(limit));
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-emerald-700 underline font-medium"
                                  title={isEn ? 'Set customer credit limit' : 'Weka kikomo cha mkopo'}
                                >
                                  {isEn ? `Limit: ${formatKES(limit)}` : `Kikomo: ${formatKES(limit)}`}
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              {group.customer.phone ? (
                                <span className="flex items-center gap-1 font-medium">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {group.customer.phone}
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-600">
                                  {isEn ? 'No phone added' : 'Hakuna namba ya simu'}
                                </span>
                              )}
                              <span className="text-slate-300">•</span>
                              <span className="text-[11px] text-slate-500">
                                {group.debts.length} {group.debts.length === 1 ? (isEn ? 'entry' : 'muamala') : (isEn ? 'entries' : 'miamala')}
                              </span>
                            </div>

                            {/* Loyalty Points Badge */}
                            {shopMeta?.loyalty_enabled && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fullCust = customerMap.get(group.customer.id) || (group.customer as Customer);
                                    if (fullCust && fullCust.id) {
                                      setLoyaltyModalCustomer(fullCust as Customer);
                                      setLoyaltyDeltaStr('');
                                    }
                                  }}
                                  className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-lg text-amber-900 text-[11px] font-bold transition shadow-2xs cursor-pointer"
                                  title={isEn ? 'Manage customer loyalty points' : 'Simamia pointi za uaminifu za mteja'}
                                >
                                  <span>⭐</span>
                                  <span>{isEn ? 'Loyalty Balance:' : 'Salio la Uaminifu:'} {((group.customer as Customer).loyalty_points || 0)} pts</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-lg font-black tabular-nums ${
                              isPaidOff ? 'text-slate-400 line-through' : 'text-slate-900'
                            }`}
                          >
                            {formatKES(group.totalOutstanding)}
                          </div>
                          {group.totalPaid > 0 && !isPaidOff && (
                            <div className="text-[10px] text-emerald-700 font-bold tabular-nums">
                              {isEn ? `Paid ${formatKES(group.totalPaid)}` : `Umelipa ${formatKES(group.totalPaid)}`}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Credit Limit Progress Bar */}
                      {!isPaidOff && !group.isDefaulted && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              limitUsagePercent >= 100
                                ? 'bg-rose-600'
                                : limitUsagePercent >= 80
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${limitUsagePercent}%` }}
                          />
                        </div>
                      )}

                      {/* Account Action Buttons */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 flex-wrap">
                        {/* Toggle Statement View */}
                        <button
                          type="button"
                          onClick={() => toggleCustomerExpand(group.customer.id)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>{isExpanded ? (isEn ? 'Hide Dated History' : 'Funga Historia') : (isEn ? 'View Dated History' : 'Tazama Historia ya Tarehe')}</span>
                        </button>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Add Credit (Take Products Today) */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddCreditForCustomer({
                              id: group.customer.id,
                              name: group.customer.name,
                              phone: group.customer.phone,
                            })}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1 active:scale-95 transition cursor-pointer"
                            title={isEn ? 'Add new credit taken today' : 'Ongeza deni lililochukuliwa leo'}
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-700" />
                            <span>{isEn ? 'Add Credit Today' : 'Ongeza Deni Leo'}</span>
                          </button>

                          {/* WhatsApp Statement */}
                          {!isPaidOff && (
                            <button
                              type="button"
                              onClick={() => handleRemindCustomerAccount(group)}
                              className="px-2.5 py-1 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-black shadow-2xs active:scale-95 transition flex items-center gap-1 cursor-pointer"
                            >
                              <span className="text-xs">💬</span>
                              <span>{isEn ? 'Statement' : 'Taarifa'}</span>
                            </button>
                          )}

                          {/* Record Payment */}
                          {!isPaidOff && (
                            <Button
                              variant="gradient"
                              size="sm"
                              onClick={() => handleOpenCustomerPayment(group)}
                              className="px-2.5 py-1 text-xs font-bold"
                            >
                              {isEn ? 'Pay Balance' : 'Lipa Deni'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Chronological Dated Ledger */}
                    {isExpanded && (
                      <div className="bg-slate-50/90 border-t border-slate-200 p-3 space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                          <span>{isEn ? 'Dated Purchases & Items Taken' : 'Historia ya Bidhaa & Tarehe Zilizochukuliwa'}</span>
                          <span>{group.debts.length} {isEn ? 'Records' : 'Kumbukumbu'}</span>
                        </div>

                        <div className="divide-y divide-slate-200/80 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                          {group.debts.map((d) => {
                            const dBalance = subKES(d.principal, d.amount_paid);
                            const dPaid = dBalance <= 0 || d.status === 'paid';
                            const dDays = Math.floor(
                              (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)
                            );
                            const sale = d.sale_id ? salesMap.get(d.sale_id) : null;
                            const items = d.sale_id ? saleItemsBySaleId.get(d.sale_id) || [] : [];
                            const creditRecorder = sale
                              ? resolveSaleCashierDisplay(sale, usersMap, shopMeta, isEn).name
                              : d.recorded_by ||
                                (d.created_by && usersMap.get(d.created_by)?.name) ||
                                shopMeta?.owner_name ||
                                (isEn ? 'Shop Staff' : 'Mhudumu');

                            return (
                              <div key={d.id} className="p-3 space-y-1.5 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="font-bold text-slate-800">
                                        {new Date(d.created_at).toLocaleDateString('en-KE', {
                                          weekday: 'short',
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        })}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        ({new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-semibold">
                                        👤 {isEn ? 'Recorded by:' : 'Imerekodiwa na:'} <strong>{creditRecorder}</strong>
                                      </span>
                                    </div>

                                    <div className="text-[11px] text-slate-500 mt-0.5 pl-5">
                                      {sale ? (
                                        <span>
                                          {isEn ? `Sale #${sale.sale_no}` : `Mauzo #${sale.sale_no}`} · {items.length} {items.length === 1 ? (isEn ? 'item' : 'bidhaa') : (isEn ? 'items' : 'bidhaa')}
                                        </span>
                                      ) : d.override_reason ? (
                                        <span>{d.override_reason}</span>
                                      ) : (
                                        <span>{isEn ? 'Direct store credit' : 'Deni la moja kwa moja'}</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <div className="font-bold text-slate-900 tabular-nums">
                                      {formatKES(d.principal)}
                                    </div>
                                    <div className={`text-[10px] font-semibold tabular-nums ${dPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      {dPaid
                                        ? isEn ? '✓ Paid' : '✓ Limelipwa'
                                        : isEn
                                        ? `Rem: ${formatKES(dBalance)}`
                                        : `Bado: ${formatKES(dBalance)}`}
                                    </div>
                                  </div>
                                </div>

                                {/* Itemized product breakdown for this date */}
                                {items.length > 0 && (
                                  <div className="ml-5 p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 space-y-0.5 border border-slate-100">
                                    {items.map((it, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {it.product_name} x{it.qty}</span>
                                        <span className="font-bold tabular-nums">{formatKES(it.line_total)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Single Entry Actions inside ledger */}
                                {!dPaid && (
                                  <div className="flex justify-end gap-1.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleRemindCustomer(d)}
                                      className="px-2 py-0.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 cursor-pointer"
                                    >
                                      💬 {isEn ? 'Remind This' : 'Kumbusha Hili'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSingleDebtPayment(d)}
                                      className="px-2 py-0.5 text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                    >
                                      💵 {isEn ? 'Pay Entry' : 'Lipa Muamala'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 2: SINGLE ENTRIES VIEW (LEGACY AUDIT VIEW)                      */}
        {/* ========================================================================= */}
        {viewMode === 'single_entries' && (
          <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in">
            {filteredSingleDebts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {isEn ? 'No debts found.' : 'Hakuna madeni yaliyopatikana.'}
              </div>
            ) : (
              filteredSingleDebts.map((d) => {
                const balance = subKES(d.principal, d.amount_paid);
                const isPaid = balance <= 0 || d.status === 'paid';
                const daysOld = Math.floor(
                  (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)
                );
                const isDefaulted = !isPaid && isDebtDefaulted(daysOld, balance);
                const compAmount = calculateDefaultCompensation(balance);
                const linkedSale = d.sale_id ? salesMap.get(d.sale_id) : null;
                const recorderName = linkedSale
                  ? resolveSaleCashierDisplay(linkedSale, usersMap, shopMeta, isEn).name
                  : d.recorded_by ||
                    (d.created_by && usersMap.get(d.created_by)?.name) ||
                    shopMeta?.owner_name ||
                    (isEn ? 'Shop Staff' : 'Mhudumu');

                return (
                  <div key={d.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900">{d.customer_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span>
                            {new Date(d.created_at).toLocaleDateString()} · {daysOld} {isEn ? 'days ago' : 'siku zilizopita'}
                          </span>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-semibold">
                            👤 {isEn ? 'Recorded by:' : 'Imerekodiwa na:'} <strong>{recorderName}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-black tabular-nums ${isPaid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                          {formatKES(balance)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold tabular-nums">
                          {isEn ? `Orig: ${formatKES(d.principal)}` : `Awali: ${formatKES(d.principal)}`}
                        </div>
                      </div>
                    </div>

                    {!isPaid && (
                      <div className="flex justify-end gap-1.5 pt-1">
                        {isDefaulted && (
                          <button
                            type="button"
                            onClick={() => setClaimDebt(d)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                          >
                            🛡️ {isEn ? '70% Claim' : 'Dai 70%'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemindCustomer(d)}
                          className="px-2.5 py-1 rounded-lg bg-[#25D366] text-white text-xs font-bold"
                        >
                          💬 {isEn ? 'Remind' : 'Kumbusha'}
                        </button>
                        <Button
                          variant="gradient"
                          size="sm"
                          onClick={() => handleOpenSingleDebtPayment(d)}
                          className="px-2.5 py-1 text-xs font-bold"
                        >
                          {isEn ? 'Record Payment' : 'Lipa'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Partial / Full Payment Sheet */}
      <Sheet
        isOpen={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title={isEn ? 'Record Debt Payment' : 'Rekodi Malipo ya Deni'}
        subtitle={paymentTarget ? `${isEn ? 'Customer' : 'Mteja'}: ${paymentTarget.customerName}` : ''}
      >
        {paymentTarget && (
          <div className="space-y-4 select-none">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                {isEn ? 'Amount to Pay (KES)' : 'Kiasi cha Kulipwa (KES)'}
              </span>
              <div className="text-3xl font-black text-slate-900 tabular-nums">
                {formatKES(toKES(Number(paymentAmountStr) || 0))}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {isEn ? 'Total outstanding balance:' : 'Salio lote:'}{' '}
                {formatKES(paymentTarget.outstanding)}
              </div>
            </div>

            {/* Payment Method Toggle: Cash vs Equity Till */}
            <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  paymentMethod === 'cash' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                💵 {isEn ? 'Cash' : 'Pesa Taslimu'}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('mpesa')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  paymentMethod === 'mpesa' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'
                }`}
              >
                📱 {isEn ? 'M-Pesa / Till' : 'M-Pesa / Till'}
              </button>
            </div>

            <NumPad
              value={paymentAmountStr}
              onChange={setPaymentAmountStr}
              onSubmit={handleSavePayment}
              submitLabel={
                savingPayment
                  ? isEn ? 'Saving...' : 'Inahifadhi...'
                  : isEn ? 'Confirm Payment' : 'Thibitisha Malipo'
              }
            />
          </div>
        )}
      </Sheet>

      {/* Add Standalone / Additional Debt Sheet */}
      <Sheet
        isOpen={isAddDeniOpen}
        onClose={() => setIsAddDeniOpen(false)}
        title={isEn ? 'Record Credit Purchase' : 'Weka Deni Jipya la Leo'}
        subtitle={isEn ? 'Add dated credit entry to customer ledger' : 'Weka bidhaa au fedha alizochukua mteja leo'}
      >
        <div className="space-y-4 select-none">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Select Customer:' : 'Chagua Mteja:'}
            </label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const found = customers.find((c) => c.id === e.target.value);
                if (found) {
                  setCustName(found.name);
                  setCustPhone(found.phone || '');
                }
              }}
              className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none"
            >
              <option value="">{isEn ? '-- New Customer --' : '-- Mteja Mpya --'}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {!customerId && (
            <div className="space-y-2">
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder={isEn ? 'Customer Name...' : 'Jina la Mteja...'}
                className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs"
              />
              <input
                type="tel"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder={isEn ? 'Phone Number (e.g. 07...)' : 'Nambari ya Simu (mfano 07...)'}
                className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Credit Amount (KES):' : 'Kiasi cha Deni (KES):'}
            </label>
            <input
              type="number"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
              className="w-full h-12 px-3 text-xl font-bold bg-white border border-slate-300 rounded-xl tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Products Taken / Note (Optional):' : 'Bidhaa Alizochukua / Maelezo (Hiari):'}
            </label>
            <input
              type="text"
              value={noteStr}
              onChange={(e) => setNoteStr(e.target.value)}
              placeholder={isEn ? 'e.g. Sugar 1kg + Cooking Oil 500ml' : 'mfano Sukari 1kg + Mafuta 500ml'}
              className="w-full h-11 px-3 text-xs bg-white border border-slate-300 rounded-xl"
            />
          </div>

          <Button
            variant="gradient"
            size="hero"
            fullWidth
            onClick={handleSaveNewDeni}
          >
            {isEn ? 'Save to Customer Account' : 'Hifadhi kwenye Akaunti ya Mteja'}
          </Button>
        </div>
      </Sheet>

      {/* Credit Limit Setting Modal */}
      <Sheet
        isOpen={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        title={isEn ? 'Set Customer Credit Limit' : 'Weka Kikomo cha Mkopo'}
        subtitle={editingCustomer ? editingCustomer.name : ''}
      >
        {editingCustomer && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              {isEn
                ? 'Maximum cumulative credit allowed for this customer before attendants require owner override.'
                : 'Kiwango cha juu cha deni ambacho mteja huyu anaruhusiwa kuchukua kabla ya mfumo kumzuia mhudumu.'}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isEn ? 'Credit Limit (KES):' : 'Kikomo cha Mkopo (KES):'}
              </label>
              <input
                type="number"
                min="500"
                step="500"
                value={creditLimitStr}
                onChange={(e) => setCreditLimitStr(e.target.value)}
                className="w-full h-12 px-3 text-xl font-bold bg-white border border-slate-300 rounded-xl tabular-nums"
              />
            </div>

            <Button
              variant="gradient"
              size="hero"
              fullWidth
              onClick={handleSaveCreditLimit}
            >
              {isEn ? 'Save Credit Limit' : 'Hifadhi Kikomo'}
            </Button>
          </div>
        )}
      </Sheet>

      {/* Debtor WhatsApp Reminder Modal */}
      {reminderDebt && (
        <DebtorReminderModal
          isOpen={Boolean(reminderDebt)}
          onClose={() => setReminderDebt(null)}
          customerName={reminderDebt.customer_name}
          customerPhone={
            reminderDebt.customer_phone || customerMap.get(reminderDebt.customer_id)?.phone
          }
          shopName={shopName}
          totalBalance={subKES(reminderDebt.principal, reminderDebt.amount_paid)}
          principal={reminderDebt.principal}
          amountPaid={reminderDebt.amount_paid}
          daysOld={Math.floor(
            (Date.now() - new Date(reminderDebt.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )}
          tillNumber={tillNumber}
          language={language}
          onSavePhone={(newPhone) => handleSaveDebtorPhone(reminderDebt, newPhone)}
        />
      )}

      {/* Defaulted Debt 70% Compensation Helpline Claim Modal */}
      {claimDebt && (
        <DefaultedDebtClaimModal
          isOpen={Boolean(claimDebt)}
          onClose={() => setClaimDebt(null)}
          debtId={claimDebt.id}
          customerName={claimDebt.customer_name}
          customerPhone={
            claimDebt.customer_phone || customerMap.get(claimDebt.customer_id)?.phone
          }
          shopName={shopName}
          principal={claimDebt.principal}
          balance={subKES(claimDebt.principal, claimDebt.amount_paid)}
          daysOld={Math.floor(
            (Date.now() - new Date(claimDebt.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )}
          compensationAmount={calculateDefaultCompensation(
            subKES(claimDebt.principal, claimDebt.amount_paid)
          )}
          language={language}
        />
      )}

      {/* Loyalty Points Adjustment / Redemption Modal */}
      {loyaltyModalCustomer && (
        <Sheet
          isOpen={Boolean(loyaltyModalCustomer)}
          onClose={() => setLoyaltyModalCustomer(null)}
          title={isEn ? 'Customer Loyalty Points' : 'Pointi za Uaminifu za Mteja'}
          subtitle={loyaltyModalCustomer.name}
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  {isEn ? 'Current Balance' : 'Salio la Sasa'}
                </span>
                <div className="text-2xl font-black text-amber-900 mt-0.5">
                  ⭐ {loyaltyModalCustomer.loyalty_points || 0} pts
                </div>
              </div>
              <div className="text-right text-xs text-amber-700">
                {loyaltyModalCustomer.phone || (isEn ? 'No Phone' : 'Hakuna Simu')}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                {isEn ? 'Adjust Points (Add + or Redeem -):' : 'Rekebisha Pointi (Ongeza + au Tumia -):'}
              </label>
              <input
                type="number"
                value={loyaltyDeltaStr}
                onChange={(e) => setLoyaltyDeltaStr(e.target.value)}
                placeholder={isEn ? 'e.g. 50 (add) or -20 (redeem)...' : 'mfano 50 (ongeza) au -20 (tumia)...'}
                className="w-full h-11 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 font-bold tabular-nums"
              />
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Enter positive value to award bonus loyalty points, or negative value to redeem/deduct points.'
                  : 'Weka namba chanya kuongeza pointi za zawadi, au namba hasi kupunguza/kutoa pointi zilizotumiwa.'}
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setLoyaltyModalCustomer(null)}
                className="flex-1 text-xs"
              >
                {isEn ? 'Cancel' : 'Ghairi'}
              </Button>
              <Button
                variant="gradient"
                onClick={async () => {
                  const delta = Number(loyaltyDeltaStr);
                  if (!delta) return;
                  const currentPts = loyaltyModalCustomer.loyalty_points || 0;
                  const newPts = currentPts + delta;
                  await adjustCustomerLoyaltyPoints(loyaltyModalCustomer.id, delta);
                  if (typeof window !== 'undefined') {
                    window.alert(
                      isEn
                        ? `Loyalty points updated successfully. New balance: ${Math.max(0, newPts)} pts`
                        : `Pointi za uaminifu zimesasishwa. Salio jipya: ${Math.max(0, newPts)} pts`
                    );
                  }
                  setLoyaltyModalCustomer(null);
                }}
                className="flex-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white"
              >
                {isEn ? 'Save Points' : 'Hifadhi Pointi'}
              </Button>
            </div>
          </div>
        </Sheet>
      )}

      {/* WhatsApp Sent Floating Toast */}
      {reminderToast && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-[420px] mx-auto bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg flex-shrink-0">💬</span>
            <span className="text-xs font-medium truncate">{reminderToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setReminderDebt(reminderToast.debt);
              setReminderToast(null);
            }}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline shrink-0 cursor-pointer"
          >
            {isEn ? 'Preview' : 'Angalia'}
          </button>
        </div>
      )}
    </div>
  );
};
