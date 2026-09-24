import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  Search,
  MessageCircle,
  Check,
  Clock,
  Phone,
  ExternalLink,
} from 'lucide-react';
import {
  db,
  serverNow,
  recordDebtPayment,
  type Debt,
  type Customer,
  type UserRole,
} from '../lib/db/local';
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
import {
  openDebtorWhatsApp,
  type DebtorReminderOptions,
} from '../lib/reminder';
import { translations, type Language } from '../lib/i18n';

interface DeniScreenProps {
  userRole: UserRole;
  shopName: string;
  tillNumber?: string;
  language?: Language;
}

export const DeniScreen: React.FC<DeniScreenProps> = ({
  userRole,
  shopName,
  tillNumber,
  language = 'en',
}) => {
  const isOwner = userRole === 'owner';
  const isEn = language === 'en';
  const t = translations[language];

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'overdue'>('open');

  // Record Payment Sheet
  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [paymentAmountStr, setPaymentAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  // Add Standalone Debt Sheet
  const [isAddDeniOpen, setIsAddDeniOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [amountStr, setAmountStr] = useState('');

  // Customer Credit Limit Setting Sheet (Feature 3)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [creditLimitStr, setCreditLimitStr] = useState('');

  // Debtor WhatsApp Reminder State
  const [reminderDebt, setReminderDebt] = useState<Debt | null>(null);
  const [reminderToast, setReminderToast] = useState<{ message: string; debt: Debt } | null>(null);

  // Live queries
  const debts = useLiveQuery(
    () => db.debts.orderBy('created_at').reverse().toArray(),
    []
  ) || [];

  const customers = useLiveQuery(
    () => db.customers.filter((c) => c.deleted_at === null).toArray(),
    []
  ) || [];

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  // Aggregate customer debt totals
  const customerDebtTotals = useMemo(() => {
    const map = new Map<string, { totalOutstanding: KES; oldestDays: number }>();
    const now = Date.now();

    debts.forEach((d) => {
      if (d.status === 'paid' || d.status === 'written_off') return;
      const balance = subKES(d.principal, d.amount_paid);
      const days = Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));

      const existing = map.get(d.customer_id) || {
        totalOutstanding: toKES(0),
        oldestDays: 0,
      };

      map.set(d.customer_id, {
        totalOutstanding: addKES(existing.totalOutstanding, balance),
        oldestDays: Math.max(existing.oldestDays, days),
      });
    });

    return map;
  }, [debts]);

  const totalDeniAmount = useMemo(() => {
    return debts
      .filter((d) => d.status !== 'paid' && d.status !== 'written_off')
      .reduce((sum, d) => addKES(sum, subKES(d.principal, d.amount_paid)), toKES(0));
  }, [debts]);

  // Filtered debts
  const filteredDebts = useMemo(() => {
    const now = Date.now();
    return debts.filter((d) => {
      const balance = subKES(d.principal, d.amount_paid);
      const isOpen = balance > 0 && d.status !== 'paid' && d.status !== 'written_off';
      const days = Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));

      if (filterStatus === 'open' && !isOpen) return false;
      if (filterStatus === 'overdue' && (!isOpen || days < 30)) return false;

      if (searchQuery.trim()) {
        const q = (searchQuery || '').toLowerCase();
        return (
          (d.customer_name || '').toLowerCase().includes(q) ||
          Boolean(d.customer_phone && d.customer_phone.includes(q))
        );
      }
      return true;
    });
  }, [debts, filterStatus, searchQuery]);

  // Kumbusha (Remind via WhatsApp) (§8.D)
  const handleRemindCustomer = async (debt: Debt, forceModal = false) => {
    const customer = customerMap.get(debt.customer_id);
    const phone = (debt.customer_phone || customer?.phone || '').trim();
    const balance = subKES(debt.principal, debt.amount_paid);
    const daysOld = Math.floor(
      (Date.now() - new Date(debt.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // If phone number is missing, or if user explicitly clicked preview/edit, open the modal
    if (!phone || forceModal) {
      setReminderDebt(debt);
      return;
    }

    // Customer has phone -> immediately launch WhatsApp to debtor's number!
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

  const handleSaveDebtorPhone = async (debt: Debt, newPhone: string) => {
    const cleanPhone = newPhone.trim();
    if (!cleanPhone) return;
    const now = serverNow();

    await db.debts.update(debt.id, {
      customer_phone: cleanPhone,
      updated_at: now,
    });

    if (debt.customer_id) {
      await db.customers.update(debt.customer_id, {
        phone: cleanPhone,
        updated_at: now,
      });
    }
  };

  const handleOpenPayment = (debt: Debt) => {
    const balance = subKES(debt.principal, debt.amount_paid);
    setPaymentDebt(debt);
    setPaymentAmountStr(String(balance));
    setPaymentMethod('cash');
  };

  const handleSavePayment = async () => {
    if (!paymentDebt) return;
    const amountNum = Number(paymentAmountStr);
    if (!amountNum || amountNum <= 0) return;

    setSavingPayment(true);
    try {
      const kes = toKES(amountNum);
      const res = await recordDebtPayment({
        debtId: paymentDebt.id,
        amount: kes,
        method: paymentMethod,
      });

      if (typeof window !== 'undefined') {
        window.alert(
          res.newBalance <= 0
            ? isEn
              ? 'Congratulations! Debt fully settled and closed.'
              : 'Hongera! Deni limelipwa lote na limefungwa.'
            : isEn
            ? `Payment of ${formatKES(kes)} recorded. Remaining balance: ${formatKES(res.newBalance)}`
            : `Malipo ya ${formatKES(kes)} yamerekodiwa. Salio lililobaki: ${formatKES(res.newBalance)}`
        );
      }

      setPaymentDebt(null);
    } catch {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Error recording payment.' : 'Kosa katika kurekodi malipo.');
      }
    } finally {
      setSavingPayment(false);
    }
  };

  // Add Standalone Debt
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
        shop_id: 'shop-active',
        name: custName.trim(),
        phone: custPhone.trim() || null,
        notes: null,
        credit_limit: toKES(3000),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      await db.customers.put(newC);
      await db.outbox.add({
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

    const debtId = crypto.randomUUID();
    const newDebt: Debt = {
      id: debtId,
      shop_id: 'shop-active',
      customer_id: finalCustId,
      customer_name: selectedCust.name,
      customer_phone: selectedCust.phone,
      principal: toKES(amountNum),
      amount_paid: toKES(0),
      status: 'open',
      due_date: null,
      sale_id: null,
      created_at: now,
      updated_at: now,
      device_id: 'device-active',
    };

    await db.transaction('rw', [db.debts, db.outbox], async () => {
      await db.debts.put(newDebt);
      await db.outbox.add({
        id: debtId,
        table: 'debts',
        op: 'insert',
        payload: newDebt as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
    });

    setIsAddDeniOpen(false);
    setAmountStr('');
    setCustName('');
    setCustPhone('');
    setCustomerId('');
  };

  // Update Customer Credit Limit (Feature 3)
  const handleSaveCreditLimit = async () => {
    if (!editingCustomer) return;
    const limit = toKES(Number(creditLimitStr) || 3000);
    const now = serverNow();

    await db.customers.update(editingCustomer.id, {
      credit_limit: limit,
      updated_at: now,
    });
    await db.outbox.add({
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
          <p className="text-xs text-slate-500">
            {isEn ? 'Track customer credit & pending balances' : 'Fuatilia wateja wanaodaiwa dukani'}
          </p>
        </div>

        <Button
          variant="gradient"
          size="sm"
          onClick={() => setIsAddDeniOpen(true)}
          className="flex items-center gap-1.5 shadow-sm"
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
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
            📖
          </div>
        </div>

        {/* Filter Chips & Search Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.creditSearchPlaceholder}
              className="w-full h-10 pl-9 pr-3 text-xs bg-slate-100 rounded-xl border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilterStatus('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterStatus === 'open'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {isEn ? 'Unpaid (Open)' : 'Yasiyolipwa'}
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('overdue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterStatus === 'overdue'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {isEn ? 'Overdue 30+ Days ⚠' : 'Zaidi ya Siku 30 ⚠'}
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterStatus === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {isEn ? 'All Debts' : 'Yote'}
            </button>
          </div>
        </div>

        {/* Debts List */}
        {filteredDebts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <Check className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <div className="font-bold text-base text-slate-800">
              {isEn ? 'No Debts Found' : 'Hakuna Deni Lililopatikana'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isEn
                ? 'Your customers have no outstanding credit under these filter criteria.'
                : 'Wateja wako hawana madeni yasiyolipwa chini ya masharti haya.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredDebts.map((d) => {
              const balance = subKES(d.principal, d.amount_paid);
              const isPaid = balance <= 0 || d.status === 'paid';
              const daysOld = Math.floor(
                (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );

              // Coloured Age Dot (§8.D)
              const dotColor =
                daysOld < 7
                  ? 'bg-emerald-500'
                  : daysOld < 30
                  ? 'bg-amber-500'
                  : 'bg-rose-600 animate-pulse';

              const customer = customerMap.get(d.customer_id);
              const limit = customer?.credit_limit ?? toKES(3000);
              const custTotal = customerDebtTotals.get(d.customer_id)?.totalOutstanding ?? balance;
              const limitUsagePercent = Math.min(100, Math.round((custTotal / limit) * 100));

              return (
                <div key={d.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${dotColor}`}
                        title={isEn ? `Debt is ${daysOld} days old` : `Deni hili lina siku ${daysOld}`}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900">
                            {d.customer_name}
                          </span>
                          {customer && isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCustomer(customer);
                                setCreditLimitStr(String(limit));
                              }}
                              className="text-[10px] text-slate-400 hover:text-emerald-700 underline"
                              title={isEn ? 'Set customer credit limit' : 'Weka kikomo cha mkopo'}
                            >
                              {isEn ? `Limit: ${formatKES(limit)}` : `Kikomo: ${formatKES(limit)}`}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {daysOld === 0
                              ? isEn ? 'Today' : 'Leo'
                              : isEn ? `${daysOld} days ago` : `Siku ${daysOld}`}
                          </span>
                          {d.customer_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {d.customer_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-base font-black tabular-nums ${
                          isPaid ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        {formatKES(balance)}
                      </div>
                      {d.amount_paid > 0 && !isPaid && (
                        <div className="text-[10px] text-emerald-700 font-semibold tabular-nums">
                          {isEn ? `Paid ${formatKES(d.amount_paid)}` : `Umelipa ${formatKES(d.amount_paid)}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Credit Limit Progress Bar (Feature 3) */}
                  {!isPaid && (
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

                  {/* Action Buttons */}
                  {!isPaid && (
                    <div className="flex items-center gap-1.5 pt-1 justify-end">
                      {/* Remind via WhatsApp Button */}
                      <button
                        type="button"
                        onClick={() => handleRemindCustomer(d)}
                        className="px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-black shadow-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                        title={
                          isEn
                            ? `Send WhatsApp reminder to ${d.customer_name}`
                            : `Tuma kumbusho la WhatsApp kwa ${d.customer_name}`
                        }
                      >
                        <span className="text-sm leading-none">💬</span>
                        <span>{isEn ? 'Remind' : 'Kumbusha'}</span>
                      </button>

                      {/* Options / Preview Reminder Sheet */}
                      <button
                        type="button"
                        onClick={() => handleRemindCustomer(d, true)}
                        className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                        title={isEn ? 'Preview / Edit Reminder' : 'Angalia / Badilisha Kumbusho'}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <Button
                        variant="gradient"
                        size="sm"
                        onClick={() => handleOpenPayment(d)}
                        className="px-3 py-1.5 text-xs font-bold"
                      >
                        {isEn ? 'Record Payment' : 'Rekodi Malipo'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Partial / Full Payment Sheet */}
      <Sheet
        isOpen={Boolean(paymentDebt)}
        onClose={() => setPaymentDebt(null)}
        title={isEn ? 'Record Debt Payment' : 'Rekodi Malipo ya Deni'}
        subtitle={paymentDebt ? `${isEn ? 'Customer' : 'Mteja'}: ${paymentDebt.customer_name}` : ''}
      >
        {paymentDebt && (
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
                {formatKES(subKES(paymentDebt.principal, paymentDebt.amount_paid))}
              </div>
            </div>

            {/* Payment Method Toggle */}
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
                📱 M-Pesa
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

      {/* Add Standalone Debt Sheet */}
      <Sheet
        isOpen={isAddDeniOpen}
        onClose={() => setIsAddDeniOpen(false)}
        title={isEn ? 'Record New Credit' : 'Weka Deni Jipya'}
        subtitle={isEn ? 'Customer took goods or cash on credit' : 'Mteja amechukua bidhaa au fedha za mkopo'}
      >
        <div className="space-y-4 select-none">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Select Customer:' : 'Chagua Mteja:'}
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
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
                placeholder={isEn ? 'Phone Number (Optional: 07...)' : 'Nambari ya Simu (Hiari: 07...)'}
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

          <Button
            variant="gradient"
            size="hero"
            fullWidth
            onClick={handleSaveNewDeni}
          >
            {isEn ? 'Save Credit' : 'Hifadhi Deni'}
          </Button>
        </div>
      </Sheet>

      {/* Credit Limit Setting Modal (Feature 3) */}
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
