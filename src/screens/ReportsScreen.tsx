import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TrendingUp,
  DollarSign,
  Share2,
  Download,
  Lock,
} from 'lucide-react';
import {
  db,
  type UserRole,
  type CashSession,
  type SaleHeader,
  type SaleItem,
  getActiveCashSession,
  getShopMeta,
  voidSale,
} from '../lib/db/local';
import {
  toKES,
  formatKES,
  addKES,
  subKES,
} from '../lib/money';
import { Button } from '../components/Button';
import { DayCloseModal } from '../components/DayCloseModal';
import { RecentTransactionsSection } from '../components/RecentTransactionsSection';
import { ReceiptModal } from '../components/ReceiptModal';
import { VoidSaleModal } from '../components/VoidSaleModal';
import { translations, type Language } from '../lib/i18n';

interface ReportsScreenProps {
  userRole: UserRole;
  shopName: string;
  language?: Language;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  userRole,
  shopName,
  language = 'en',
}) => {
  const isOwner = userRole === 'owner';
  const isEn = language === 'en';
  const t = translations[language];

  const [datePeriod, setDatePeriod] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');
  const [isDayCloseOpen, setIsDayCloseOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

  // Recent transactions inspection and voiding
  const [selectedReceipt, setSelectedReceipt] = useState<{
    sale: SaleHeader;
    items: SaleItem[];
    customerName?: string;
    customerPhone?: string;
  } | null>(null);
  const [saleToVoid, setSaleToVoid] = useState<{ sale: SaleHeader; items: SaleItem[] } | null>(null);
  const [voidToast, setVoidToast] = useState<string | null>(null);

  const shopMeta = useLiveQuery(() => getShopMeta(), []);

  // Live queries
  const allSales = useLiveQuery(
    () => db.sales.orderBy('created_at').reverse().toArray(),
    []
  ) || [];

  const allItems = useLiveQuery(() => db.sale_items.toArray(), []) || [];
  const allExpenses = useLiveQuery(
    () => db.expenses.filter((e) => e.deleted_at === null).toArray(),
    []
  ) || [];

  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];

  // Compute date window
  const { startDate, endDate, label } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    const locale = isEn ? 'en-KE' : 'sw-KE';

    if (datePeriod === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }),
      };
    } else if (datePeriod === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: isEn ? 'Yesterday' : 'Jana',
      };
    } else if (datePeriod === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: isEn ? 'Past 7 Days' : 'Siku 7 Zilizopita',
      };
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: isEn ? 'This Month' : 'Mwezi Huu',
      };
    }
  }, [datePeriod, isEn]);

  // Filtered Sales within Window
  const filteredSales = useMemo(() => {
    return allSales.filter(
      (s) =>
        s.created_at >= startDate &&
        s.created_at <= endDate &&
        s.status === 'completed'
    );
  }, [allSales, startDate, endDate]);

  // Filtered Expenses within Window
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(
      (e) => e.created_at >= startDate && e.created_at <= endDate
    );
  }, [allExpenses, startDate, endDate]);

  // Totals
  const totalSales = useMemo(() => {
    return filteredSales.reduce((sum, s) => addKES(sum, s.total), toKES(0));
  }, [filteredSales]);

  const totalProfit = useMemo(() => {
    return filteredSales.reduce((sum, s) => addKES(sum, s.total_profit), toKES(0));
  }, [filteredSales]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => addKES(sum, e.amount), toKES(0));
  }, [filteredExpenses]);

  const netEarnings = subKES(totalProfit, totalExpenses);

  const transactionCount = filteredSales.length;
  const avgSale = transactionCount > 0 ? toKES(Math.round(totalSales / transactionCount)) : toKES(0);

  // Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    let cash = toKES(0);
    let mpesa = toKES(0);
    let deni = toKES(0);

    filteredSales.forEach((s) => {
      if (s.payment_method === 'cash') cash = addKES(cash, s.total);
      else if (s.payment_method === 'mpesa') mpesa = addKES(mpesa, s.total);
      else if (s.payment_method === 'deni') deni = addKES(deni, s.total);
    });

    return { cash, mpesa, deni };
  }, [filteredSales]);

  // Top 5 Products by Sales Quantity and Profit
  const topProducts = useMemo(() => {
    const saleIds = new Set(filteredSales.map((s) => s.id));
    const itemsInWindow = allItems.filter((it) => saleIds.has(it.sale_id));

    const productMap = new Map<string, { name: string; qty: number; profit: number }>();

    itemsInWindow.forEach((it) => {
      const existing = productMap.get(it.product_id) || {
        name: it.product_name,
        qty: 0,
        profit: 0,
      };
      productMap.set(it.product_id, {
        name: it.product_name,
        qty: existing.qty + it.qty,
        profit: existing.profit + (it.line_profit || 0),
      });
    });

    const sortedByQty = Array.from(productMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { byQty: sortedByQty };
  }, [filteredSales, allItems]);

  const hasItemsWithUnknownCost = useMemo(() => {
    const saleIds = new Set(filteredSales.map((s) => s.id));
    const itemsInWindow = allItems.filter((it) => saleIds.has(it.sale_id));
    return itemsInWindow.some((it) => it.cost_unknown);
  }, [filteredSales, allItems]);

  // 7-Day Trend for Sparkline
  const sparklinePoints = useMemo(() => {
    const days: number[] = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();

    allSales.forEach((s) => {
      if (s.status !== 'completed') return;
      const saleDate = new Date(s.created_at);
      const diffDays = Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        days[6 - diffDays] += s.total;
      }
    });

    const maxVal = Math.max(...days, 1);
    const height = 60;
    const width = 280;

    return days.map((val, idx) => {
      const x = (idx / 6) * width + 10;
      const y = height - (val / maxVal) * (height - 15) - 5;
      return { x, y, val };
    });
  }, [allSales]);

  const sparklinePath = useMemo(() => {
    if (sparklinePoints.length < 2) return '';
    return sparklinePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');
  }, [sparklinePoints]);

  // Handle Day Close Open
  const handleOpenDayClose = async () => {
    const session = await getActiveCashSession();
    setActiveSession(session);
    setIsDayCloseOpen(true);
  };

  // Handle Void Sale from Recent Transactions
  const handleConfirmVoid = async (saleId: string, reason: string) => {
    const success = await voidSale(saleId, reason);
    if (success) {
      if (selectedReceipt?.sale.id === saleId) {
        setSelectedReceipt(null);
      }
      const saleNo = saleToVoid?.sale.sale_no;
      setVoidToast(
        isEn
          ? `Sale #${saleNo ?? ''} was voided. Items returned to inventory stock.`
          : `Mauzo #${saleNo ?? ''} yamefutwa. Bidhaa zimerudishwa stoo.`
      );
      setTimeout(() => setVoidToast(null), 5000);
      setSaleToVoid(null);
    } else {
      alert(isEn ? 'Failed to void transaction.' : 'Haijawezekana kughairi muamala.');
    }
  };

  // Share to WhatsApp
  const handleShareReport = async () => {
    const bestItem = topProducts.byQty[0];
    const bestItemStr = bestItem ? `${bestItem.name} (${bestItem.qty})` : (isEn ? 'None' : 'Hakuna');

    const text = isEn
      ? [
          `📊 ${shopName.toUpperCase()} — ${label}`,
          `Sales: ${formatKES(totalSales)}`,
          isOwner ? `Profit: ${formatKES(totalProfit)}` : null,
          `Transactions: ${transactionCount}`,
          `New Credit (Deni): ${formatKES(paymentBreakdown.deni)}`,
          `Expenses: ${formatKES(totalExpenses)}`,
          isOwner ? `Net Profit (After Expenses): ${formatKES(netEarnings)}` : null,
          `Top Seller: ${bestItemStr}`,
          '— SmartSort Sales Manager',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `📊 ${shopName.toUpperCase()} — ${label}`,
          `Mauzo: ${formatKES(totalSales)}`,
          isOwner ? `Faida: ${formatKES(totalProfit)}` : null,
          `Manunuzi: ${transactionCount}`,
          `Deni jipya: ${formatKES(paymentBreakdown.deni)}`,
          `Matumizi: ${formatKES(totalExpenses)}`,
          isOwner ? `Faida Baada ya Matumizi (Net): ${formatKES(netEarnings)}` : null,
          `Bidhaa bora: ${bestItemStr}`,
          '— SmartSort Sales Manager',
        ]
          .filter(Boolean)
          .join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: isEn ? `${shopName} Business Report` : `Ripoti ya ${shopName}`,
          text,
        });
        return;
      } catch {
        // user cancelled
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Report copied to clipboard!' : 'Ripoti imenakiliwa! Unaweza kuituma kwa WhatsApp au SMS.');
      }
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = isEn
      ? ['Sale Number', 'Date', 'Payment Method', 'Total (KES)', 'Profit (KES)']
      : ['Nambari ya Mauzo', 'Tarehe', 'Njia ya Malipo', 'Jumla (KES)', 'Faida (KES)'];

    const rows = [
      headers,
      ...filteredSales.map((s) => [
        s.sale_no,
        new Date(s.created_at).toLocaleString('en-KE'),
        s.payment_method,
        s.total,
        isOwner ? s.total_profit : '***',
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_report_${shopName}_${datePeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 leading-tight">
            {t.reportsTitle}
          </h1>
          <p className="text-xs text-slate-500">{label}</p>
        </div>

        <Button
          variant="gradient"
          size="sm"
          onClick={handleOpenDayClose}
          className="flex items-center gap-1.5 shadow-sm text-xs font-bold"
        >
          <Lock className="w-3.5 h-3.5" />
          {t.dayCloseBtn}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Date Filter Chips */}
        <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'today', label: isEn ? 'Today' : 'Leo' },
            { id: 'yesterday', label: isEn ? 'Yesterday' : 'Jana' },
            { id: 'week', label: isEn ? 'This Week' : 'Wiki Hii' },
            { id: 'month', label: isEn ? 'Month' : 'Mwezi' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDatePeriod(tab.id as any)}
              className={`py-2 text-xs font-bold rounded-lg transition ${
                datePeriod === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Two Hero Cards: Sales green & Profit blue */}
        <div className="grid grid-cols-2 gap-3">
          {/* Sales */}
          <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between opacity-80">
              <span className="text-xs font-bold uppercase tracking-wider">{t.grossSalesLabel}</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-2xl font-black tabular-nums mt-3">
              {formatKES(totalSales)}
            </div>
            <div className="text-[10px] text-emerald-100 mt-1">
              {isEn ? `Orders: ${transactionCount}` : `Manunuzi: ${transactionCount}`}
            </div>
          </div>

          {/* Profit - Owner Only */}
          <div className="p-4 bg-blue-600 text-white rounded-2xl shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between opacity-80">
              <span className="text-xs font-bold uppercase tracking-wider">{t.estimatedProfitLabel}</span>
              <DollarSign className="w-4 h-4" />
            </div>
            {isOwner ? (
              <>
                <div className="text-2xl font-black tabular-nums mt-3">
                  {formatKES(totalProfit)}
                </div>
                <div className="text-[10px] text-blue-100 mt-1">
                  Margin: {totalSales > 0 ? Math.round((totalProfit / totalSales) * 100) : 0}%
                  {hasItemsWithUnknownCost && (
                    <span className="block text-[9px] text-blue-200 mt-0.5 opacity-90">
                      {isEn ? '*From items with buying price recorded' : '*Kutoka bidhaa zenye bei ya kununua'}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 text-xs text-blue-100 font-semibold leading-tight">
                {isEn ? '🔒 Profit hidden from attendant' : '🔒 Faida inafichwa kwa mhudumu'}
              </div>
            )}
          </div>
        </div>

        {/* Stats Row: Transactions, Avg Sale, Net */}
        <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Average Sale' : 'Wastani wa Mauzo'}
            </span>
            <div className="text-sm font-black text-slate-800 tabular-nums mt-0.5">
              {formatKES(avgSale)}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Expenses' : 'Matumizi'}
            </span>
            <div className="text-sm font-black text-rose-600 tabular-nums mt-0.5">
              {formatKES(totalExpenses)}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Net Profit' : 'Net (Faida - Matumizi)'}
            </span>
            <div
              className={`text-sm font-black tabular-nums mt-0.5 ${
                !isOwner ? 'text-slate-400' : netEarnings >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {isOwner ? formatKES(netEarnings) : '***'}
            </div>
          </div>
        </div>

        {/* 7-Day Inline SVG Sparkline Trend */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">
              {isEn ? '7-Day Sales Trend' : 'Mwenendo wa Mauzo (Siku 7)'}
            </span>
            <span className="text-[10px] text-slate-400">
              {isEn ? 'Daily totals' : 'Jumla kwa kila siku'}
            </span>
          </div>

          <div className="w-full h-16 flex items-center justify-center">
            <svg viewBox="0 0 300 70" className="w-full h-full overflow-visible">
              <path
                d={sparklinePath}
                fill="none"
                stroke="#0A9D5F"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {sparklinePoints.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill="#1E6F9F"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>

          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-semibold">
            <span>{isEn ? '7 Days Ago' : 'Siku 7 Zilizopita'}</span>
            <span>{isEn ? 'Today' : 'Leo'}</span>
          </div>
        </div>

        {/* Payment Breakdown Cards */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <span className="text-xs font-bold text-slate-700 block">
            {isEn ? 'Payment Methods Breakdown' : 'Mgawanyo wa Malipo'}
          </span>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 font-semibold block">
                {isEn ? 'Cash' : 'Taslimu (Cash)'}
              </span>
              <span className="font-black text-slate-900 tabular-nums">
                {formatKES(paymentBreakdown.cash)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="text-[10px] text-emerald-800 font-semibold block">M-Pesa</span>
              <span className="font-black text-emerald-950 tabular-nums">
                {formatKES(paymentBreakdown.mpesa)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="text-[10px] text-amber-800 font-semibold block">
                {isEn ? 'Credit (Deni)' : 'Deni'}
              </span>
              <span className="font-black text-amber-950 tabular-nums">
                {formatKES(paymentBreakdown.deni)}
              </span>
            </div>
          </div>
        </div>

        {/* Top 5 Products by Quantity & Profit */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <span className="text-xs font-bold text-slate-700 block">
            {isEn ? 'Top 5 Best-Selling Products' : 'Bidhaa Zinazoongoza (Top 5)'}
          </span>

          <div className="divide-y divide-slate-100 text-xs">
            {topProducts.byQty.length === 0 ? (
              <div className="py-4 text-center text-slate-400">
                {isEn ? 'No sales recorded in this period.' : 'Hakuna mauzo katika kipindi hiki.'}
              </div>
            ) : (
              topProducts.byQty.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800 truncate max-w-[160px]">
                      {item.name}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-slate-900 mr-2 tabular-nums">
                      {item.qty} pcs
                    </span>
                    {isOwner && (
                      <span className="text-emerald-700 font-black tabular-nums">
                        +{formatKES(item.profit)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions Section (Collapsible by default, expandable) */}
        <RecentTransactionsSection
          language={language}
          userRole={userRole}
          defaultExpanded={false}
          onOpenReceipt={(sale, items, customerName, customerPhone) => {
            setSelectedReceipt({ sale, items, customerName, customerPhone });
          }}
          onOpenVoidModal={(sale, items) => {
            setSaleToVoid({ sale, items });
          }}
        />

        {/* Action Buttons: WhatsApp Share & CSV Export */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            variant="outline"
            size="md"
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 text-xs border-slate-300"
          >
            <Download className="w-4 h-4 text-slate-500" />
            {isEn ? 'Export CSV' : 'Pakua CSV'}
          </Button>

          <Button
            variant="gradient"
            size="md"
            onClick={handleShareReport}
            className="flex items-center justify-center gap-2 text-xs"
          >
            <Share2 className="w-4 h-4" />
            {isEn ? 'Share WhatsApp' : 'Tuma WhatsApp'}
          </Button>
        </div>
      </div>

      {/* Void Notification Toast */}
      {voidToast && (
        <div className="fixed top-16 left-4 right-4 z-40 max-w-[420px] mx-auto bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-in slide-in-from-top duration-200 border border-slate-700/60">
          <div className="text-xs font-bold text-slate-100">{voidToast}</div>
          <button
            type="button"
            onClick={() => setVoidToast(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Day Close Modal (Feature 1) */}
      <DayCloseModal
        isOpen={isDayCloseOpen}
        onClose={() => setIsDayCloseOpen(false)}
        session={activeSession}
        userRole={userRole}
        language={language}
        onSessionClosed={() => {
          if (typeof window !== 'undefined') {
            window.alert(
              isEn
                ? 'Day shift successfully closed and records archived.'
                : 'Hongera! Siku imefungwa na rekodi zimehifadhiwa kikamilifu.'
            );
          }
        }}
      />

      {/* Receipt Modal for Recent Transactions */}
      {selectedReceipt && (
        <ReceiptModal
          isOpen={Boolean(selectedReceipt)}
          onClose={() => setSelectedReceipt(null)}
          sale={selectedReceipt.sale}
          items={selectedReceipt.items}
          shopName={shopName}
          tillNumber={shopMeta?.till_number}
          customerName={selectedReceipt.customerName}
          customerPhone={selectedReceipt.customerPhone}
          language={language}
        />
      )}

      {/* Void Sale Modal for Recent Transactions */}
      <VoidSaleModal
        isOpen={Boolean(saleToVoid)}
        onClose={() => setSaleToVoid(null)}
        sale={saleToVoid?.sale ?? null}
        items={saleToVoid?.items ?? []}
        language={language}
        onConfirmVoid={handleConfirmVoid}
      />
    </div>
  );
};
