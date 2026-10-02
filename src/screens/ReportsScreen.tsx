import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TrendingUp,
  DollarSign,
  Share2,
  Download,
  Lock,
  Search,
  Calendar,
  Filter,
  Package,
  AlertTriangle,
  Award,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  X,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  db,
  type UserRole,
  type CashSession,
  type SaleHeader,
  type SaleItem,
  type Product,
  getActiveCashSession,
  getShopMeta,
  saveShopMeta,
  voidSale,
  getShopUser,
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

  // Date filters
  const [datePeriod, setDatePeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Decision toggle: Include Credit in Gross Sales
  const [includeCreditInGrossSales, setIncludeCreditInGrossSales] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('include_credit_in_gross_sales');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

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

  // Active view tab for reports: 'overview' | 'stock_velocity' | 'past_sales'
  const [activeTab, setActiveTab] = useState<'overview' | 'stock_velocity' | 'past_sales'>('overview');

  const shopMeta = useLiveQuery(() => getShopMeta(), []);
  const loggedInUser = useLiveQuery(() => getShopUser(), []);

  // Update credit in gross sales setting when shopMeta loads
  useEffect(() => {
    if (shopMeta?.include_credit_in_gross_sales !== undefined) {
      setIncludeCreditInGrossSales(shopMeta.include_credit_in_gross_sales);
    }
  }, [shopMeta?.include_credit_in_gross_sales]);

  const handleToggleCreditSetting = async (val: boolean) => {
    setIncludeCreditInGrossSales(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('include_credit_in_gross_sales', String(val));
    }
    await saveShopMeta({ include_credit_in_gross_sales: val });
  };

  // Live queries
  const allSales = useLiveQuery(
    () => db.sales.orderBy('created_at').reverse().toArray(),
    []
  ) || [];

  const allItems = useLiveQuery(() => db.sale_items.toArray(), []) || [];
  const allExpenses = useLiveQuery(
    () => db.expenses.filter((e) => !e.deleted_at).toArray(),
    []
  ) || [];

  const allProducts = useLiveQuery(() => db.products.filter((p) => !p.deleted_at).toArray(), []) || [];
  const allStock = useLiveQuery(() => db.product_stock.toArray(), []) || [];
  const allDebts = useLiveQuery(() => db.debts.toArray(), []) || [];

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    allStock.forEach((s) => map.set(s.product_id, s.qty));
    return map;
  }, [allStock]);

  const debtMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string }>();
    for (const d of allDebts) {
      map.set(d.id, { name: d.customer_name, phone: d.customer_phone || undefined });
      if (d.sale_id) {
        map.set(d.sale_id, { name: d.customer_name, phone: d.customer_phone || undefined });
      }
    }
    return map;
  }, [allDebts]);

  // Group items by sale_id
  const itemsBySaleId = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of allItems) {
      const list = map.get(item.sale_id) || [];
      list.push(item);
      map.set(item.sale_id, list);
    }
    return map;
  }, [allItems]);

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
        label: isEn ? 'Weekly Report (Past 7 Days)' : 'Ripoti ya Wiki (Siku 7 Zilizopita)',
      };
    } else if (datePeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: isEn ? 'Monthly Report (This Month)' : 'Ripoti ya Mwezi (Mwezi Huu)',
      };
    } else {
      // Custom date range
      const s = new Date(customStartDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEndDate);
      e.setHours(23, 59, 59, 999);
      return {
        startDate: s.toISOString(),
        endDate: e.toISOString(),
        label: `${customStartDate} – ${customEndDate}`,
      };
    }
  }, [datePeriod, customStartDate, customEndDate, isEn]);

  // Filtered Sales within Window
  const filteredSalesInWindow = useMemo(() => {
    return allSales.filter(
      (s) =>
        s.created_at >= startDate &&
        s.created_at <= endDate &&
        s.status === 'completed' &&
        (isOwner || !loggedInUser || s.created_by === loggedInUser.id)
    );
  }, [allSales, startDate, endDate, isOwner, loggedInUser]);

  // Search-filtered sales (for Past Sales list & search bar)
  const searchFilteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredSalesInWindow;

    return filteredSalesInWindow.filter((s) => {
      const saleNoStr = String(s.sale_no);
      const saleNoMatch = saleNoStr.includes(q) || `#${saleNoStr}`.includes(q);
      const cust = s.debt_id ? debtMap.get(s.debt_id) : debtMap.get(s.id);
      const custMatch = Boolean(cust && cust.name.toLowerCase().includes(q));
      
      const items = itemsBySaleId.get(s.id) || [];
      const itemMatch = items.some((it) => it.product_name.toLowerCase().includes(q));

      return saleNoMatch || custMatch || itemMatch;
    });
  }, [filteredSalesInWindow, searchQuery, debtMap, itemsBySaleId]);

  // Filtered Expenses within Window
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(
      (e) => e.created_at >= startDate && e.created_at <= endDate
    );
  }, [allExpenses, startDate, endDate]);

  // Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    let cash = toKES(0);
    let mpesa = toKES(0);
    let deni = toKES(0);

    filteredSalesInWindow.forEach((s) => {
      if (s.payment_method === 'cash') cash = addKES(cash, s.total);
      else if (s.payment_method === 'mpesa') mpesa = addKES(mpesa, s.total);
      else if (s.payment_method === 'deni') deni = addKES(deni, s.total);
    });

    const collectedCashAndTill = addKES(cash, mpesa);
    const totalAllSales = addKES(collectedCashAndTill, deni);

    return { cash, mpesa, deni, collectedCashAndTill, totalAllSales };
  }, [filteredSalesInWindow]);

  // Totals based on user's decision whether Credit Sales appear under Gross Sales
  const totalGrossSales = useMemo(() => {
    if (includeCreditInGrossSales) {
      return paymentBreakdown.totalAllSales;
    }
    return paymentBreakdown.collectedCashAndTill;
  }, [includeCreditInGrossSales, paymentBreakdown]);

  const totalProfit = useMemo(() => {
    return filteredSalesInWindow.reduce((sum, s) => {
      if (!includeCreditInGrossSales && s.payment_method === 'deni') {
        return sum; // Do not include unrealized credit profit if credit excluded
      }
      return addKES(sum, s.total_profit);
    }, toKES(0));
  }, [filteredSalesInWindow, includeCreditInGrossSales]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => addKES(sum, e.amount), toKES(0));
  }, [filteredExpenses]);

  const netEarnings = subKES(totalProfit, totalExpenses);
  const transactionCount = filteredSalesInWindow.length;
  const avgSale = transactionCount > 0 ? toKES(Math.round(totalGrossSales / transactionCount)) : toKES(0);

  // Product Sales & Stock Movement Velocity Analyzer
  const stockMovementAnalysis = useMemo(() => {
    const saleIds = new Set(filteredSalesInWindow.map((s) => s.id));
    const itemsInWindow = allItems.filter((it) => saleIds.has(it.sale_id));

    const productSalesMap = new Map<string, {
      productId: string;
      name: string;
      qtySold: number;
      revenue: number;
      profit: number;
      timesSold: number;
    }>();

    itemsInWindow.forEach((it) => {
      const existing = productSalesMap.get(it.product_id) || {
        productId: it.product_id,
        name: it.product_name,
        qtySold: 0,
        revenue: 0,
        profit: 0,
        timesSold: 0,
      };
      productSalesMap.set(it.product_id, {
        productId: it.product_id,
        name: it.product_name,
        qtySold: existing.qtySold + it.qty,
        revenue: existing.revenue + (it.line_total || 0),
        profit: existing.profit + (it.line_profit || 0),
        timesSold: existing.timesSold + 1,
      });
    });

    const rankedSold = Array.from(productSalesMap.values()).sort((a, b) => b.qtySold - a.qtySold);
    const mostSoldProduct = rankedSold[0] || null;

    // Calculate max velocity for benchmarking
    const maxQtySold = rankedSold.length > 0 ? rankedSold[0].qtySold : 0;

    // Fast, Medium, and Slow / Stagnant classification across all products in inventory
    const fastMoving: Array<{ product: Product; stats: any; currentStock: number }> = [];
    const mediumMoving: Array<{ product: Product; stats: any; currentStock: number }> = [];
    const slowMoving: Array<{ product: Product; stats: any; currentStock: number }> = [];

    allProducts.forEach((p) => {
      const stats = productSalesMap.get(p.id) || {
        productId: p.id,
        name: p.name,
        qtySold: 0,
        revenue: 0,
        profit: 0,
        timesSold: 0,
      };
      const currentStock = stockMap.get(p.id) ?? 0;

      if (stats.qtySold >= Math.max(5, maxQtySold * 0.4) && stats.qtySold > 0) {
        fastMoving.push({ product: p, stats, currentStock });
      } else if (stats.qtySold >= 1) {
        mediumMoving.push({ product: p, stats, currentStock });
      } else {
        // Zero or near zero sales in the window -> Slow/Stagnant mover
        slowMoving.push({ product: p, stats, currentStock });
      }
    });

    // Sort categories
    fastMoving.sort((a, b) => b.stats.qtySold - a.stats.qtySold);
    mediumMoving.sort((a, b) => b.stats.qtySold - a.stats.qtySold);
    slowMoving.sort((a, b) => b.currentStock - a.currentStock); // Most stuck stock first

    return {
      mostSoldProduct,
      rankedSold,
      fastMoving,
      mediumMoving,
      slowMoving,
    };
  }, [filteredSalesInWindow, allItems, allProducts, stockMap]);

  const hasItemsWithUnknownCost = useMemo(() => {
    const saleIds = new Set(filteredSalesInWindow.map((s) => s.id));
    const itemsInWindow = allItems.filter((it) => saleIds.has(it.sale_id));
    return itemsInWindow.some((it) => it.cost_unknown);
  }, [filteredSalesInWindow, allItems]);

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
    const bestItem = stockMovementAnalysis.mostSoldProduct;
    const bestItemStr = bestItem ? `${bestItem.name} (${bestItem.qtySold} sold, ${formatKES(bestItem.revenue)})` : (isEn ? 'None' : 'Hakuna');
    const slowCount = stockMovementAnalysis.slowMoving.length;

    const text = isEn
      ? [
          `📊 ${shopName.toUpperCase()} — ${label.toUpperCase()}`,
          `Gross Sales: ${formatKES(totalGrossSales)} ${!includeCreditInGrossSales ? '(Cash & Till Only)' : ''}`,
          `Cash & Equity Till: ${formatKES(paymentBreakdown.collectedCashAndTill)}`,
          `Credit Sales (Deni): ${formatKES(paymentBreakdown.deni)}`,
          isOwner ? `Estimated Profit: ${formatKES(totalProfit)}` : null,
          `Total Transactions: ${transactionCount}`,
          `Expenses: ${formatKES(totalExpenses)}`,
          isOwner ? `Net Earnings: ${formatKES(netEarnings)}` : null,
          `⭐ Most Sold Product: ${bestItemStr}`,
          `⚠️ Slow Moving (Do Not Rush Restock): ${slowCount} items`,
          '— SmartSort Sales Manager',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `📊 ${shopName.toUpperCase()} — ${label.toUpperCase()}`,
          `Jumla ya Mauzo: ${formatKES(totalGrossSales)} ${!includeCreditInGrossSales ? '(Taslimu na Till Pekee)' : ''}`,
          `Taslimu na Equity Till: ${formatKES(paymentBreakdown.collectedCashAndTill)}`,
          `Mauzo ya Deni: ${formatKES(paymentBreakdown.deni)}`,
          isOwner ? `Faida Iliyokadiriwa: ${formatKES(totalProfit)}` : null,
          `Idadi ya Manunuzi: ${transactionCount}`,
          `Matumizi: ${formatKES(totalExpenses)}`,
          isOwner ? `Faida Halisi (Net): ${formatKES(netEarnings)}` : null,
          `⭐ Bidhaa Iliyouzwa Zaidi: ${bestItemStr}`,
          `⚠️ Bidhaa Zisizotembea (Usiongeze Stoo): Bidhaa ${slowCount}`,
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
        window.alert(isEn ? 'Report copied to clipboard! Share on WhatsApp.' : 'Ripoti imenakiliwa! Unaweza kuituma kwa WhatsApp.');
      }
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = isEn
      ? ['Sale Number', 'Date', 'Payment Method', 'Customer', 'Total (KES)', 'Profit (KES)']
      : ['Nambari ya Mauzo', 'Tarehe', 'Njia ya Malipo', 'Mteja', 'Jumla (KES)', 'Faida (KES)'];

    const rows = [
      headers,
      ...filteredSalesInWindow.map((s) => {
        const cust = s.debt_id ? debtMap.get(s.debt_id) : debtMap.get(s.id);
        return [
          s.sale_no,
          new Date(s.created_at).toLocaleString('en-KE'),
          s.payment_method,
          cust?.name || '-',
          s.total,
          isOwner ? s.total_profit : '***',
        ];
      }),
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
          <p className="text-xs text-slate-500 font-medium">{label}</p>
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
        {/* Date Filter Chips & Period Selector */}
        <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'today', label: isEn ? 'Today' : 'Leo' },
            { id: 'yesterday', label: isEn ? 'Yesterday' : 'Jana' },
            { id: 'week', label: isEn ? 'Weekly' : 'Wiki' },
            { id: 'month', label: isEn ? 'Monthly' : 'Mwezi' },
            { id: 'custom', label: isEn ? 'Custom' : 'Tarehe' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDatePeriod(tab.id as any)}
              className={`py-2 text-[11px] font-bold rounded-lg transition ${
                datePeriod === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Custom Date Range Pickers (shown when 'custom' is active) */}
        {datePeriod === 'custom' && (
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 animate-in fade-in">
            <span className="text-[11px] font-bold text-slate-700 block">
              {isEn ? 'Select Custom Date Range:' : 'Chagua Kipindi cha Tarehe:'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">
                  {isEn ? 'From Date' : 'Kuanzia'}
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full h-10 px-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">
                  {isEn ? 'To Date' : 'Hadi'}
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full h-10 px-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Search Bar for filtering past sales by customer name, sale #, or item */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search past sales by customer name, product, or #sale...' : 'Tafuta mauzo kwa jina la mteja, bidhaa au nambari...'}
            className="w-full h-11 pl-10 pr-9 text-xs bg-white border border-slate-200 rounded-xl shadow-2xs focus:outline-none focus:border-emerald-500 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sub-view Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'overview'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isEn ? '📊 Overview' : '📊 Jumla'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stock_velocity')}
            className={`py-2 text-xs font-bold rounded-lg transition relative ${
              activeTab === 'stock_velocity'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>{isEn ? '⚡ Stock Velocity' : '⚡ Mwenendo wa Stoo'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('past_sales')}
            className={`py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'past_sales'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isEn ? `🧾 Sales (${searchFilteredSales.length})` : `🧾 Mauzo (${searchFilteredSales.length})`}
          </button>
        </div>

        {/* Credit in Gross Sales Decision Card */}
        <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-xs font-black text-slate-800 block">
              {isEn ? 'Include Credit in Gross Sales' : 'Jumuisha Deni kwenye Jumla ya Mauzo'}
            </span>
            <p className="text-[11px] text-slate-500 leading-tight">
              {includeCreditInGrossSales
                ? isEn
                  ? 'Credit sales are included in gross sales total.'
                  : 'Mauzo ya deni yanajumuishwa kwenye jumla ya mauzo.'
                : isEn
                ? 'Only cash & Equity Till collected count towards gross sales.'
                : 'Pesa zilizokusanywa pekee (Cash & Till) ndizo zinazohesabiwa.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleToggleCreditSetting(!includeCreditInGrossSales)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
              includeCreditInGrossSales ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-md block transition-transform absolute top-0.5 ${
                includeCreditInGrossSales ? 'translate-x-6.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* TAB 1: OVERVIEW & FINANCIALS */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Two Hero Cards: Sales green & Profit blue */}
            <div className="grid grid-cols-2 gap-3">
              {/* Sales */}
              <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between opacity-80">
                  <span className="text-xs font-bold uppercase tracking-wider">{t.grossSalesLabel}</span>
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black tabular-nums mt-3">
                  {formatKES(totalGrossSales)}
                </div>
                <div className="text-[10px] text-emerald-100 mt-1">
                  {isEn
                    ? `Orders: ${transactionCount} · ${includeCreditInGrossSales ? 'Includes Deni' : 'Collected Only'}`
                    : `Manunuzi: ${transactionCount} · ${includeCreditInGrossSales ? 'Pamoja na Deni' : 'Iliyokusanywa Tu'}`}
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
                      Margin: {totalGrossSales > 0 ? Math.round((totalProfit / totalGrossSales) * 100) : 0}%
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

            {/* Payment Breakdown Cards */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isEn ? 'Payment Methods Breakdown' : 'Mgawanyo wa Malipo'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {isEn ? 'M-Pesa & Cash' : 'M-Pesa & Taslimu'}
                </span>
              </div>

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
                  <span className="text-[10px] text-emerald-800 font-semibold block">
                    M-Pesa
                  </span>
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

            {/* Most Sold Product Champion Highlight */}
            {stockMovementAnalysis.mostSoldProduct && (
              <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-2xl shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900 uppercase tracking-wider">
                    <Award className="w-4 h-4 text-emerald-700" />
                    <span>{isEn ? 'Top #1 Most Sold Product' : 'Bidhaa Nambari 1 Iliyouzwa Zaidi'}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] font-black">
                    {isEn ? 'Best Seller' : 'Inayoongoza'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="text-base font-black text-slate-900">
                      {stockMovementAnalysis.mostSoldProduct.name}
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      {stockMovementAnalysis.mostSoldProduct.timesSold} {isEn ? 'times ordered' : 'maagizo'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-black text-emerald-800 tabular-nums">
                      {stockMovementAnalysis.mostSoldProduct.qtySold} pcs
                    </div>
                    <div className="text-xs text-slate-600 font-bold tabular-nums">
                      {formatKES(stockMovementAnalysis.mostSoldProduct.revenue)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Top 5 Products by Sales Quantity */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isEn ? 'Top 5 Best-Selling Products' : 'Bidhaa Zinazoongoza (Top 5)'}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('stock_velocity')}
                  className="text-xs text-emerald-700 font-bold hover:underline"
                >
                  {isEn ? 'View Stock Speed →' : 'Tazama Kasi ya Stoo →'}
                </button>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {stockMovementAnalysis.rankedSold.length === 0 ? (
                  <div className="py-4 text-center text-slate-400">
                    {isEn ? 'No sales recorded in this period.' : 'Hakuna mauzo katika kipindi hiki.'}
                  </div>
                ) : (
                  stockMovementAnalysis.rankedSold.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                          {item.name}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-slate-900 mr-2 tabular-nums">
                          {item.qtySold} pcs
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
          </div>
        )}

        {/* TAB 2: STOCK MOVEMENT SPEED & REORDER ADVICE */}
        {activeTab === 'stock_velocity' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Header Advice */}
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-950 space-y-1">
              <div className="font-black flex items-center gap-1.5 text-blue-900">
                <Zap className="w-4 h-4 text-blue-600" />
                <span>{isEn ? 'Stock Movement & Restocking Intelligence' : 'Uchambuzi wa Kasi ya Bidhaa & Maamuzi ya Stoo'}</span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                {isEn
                  ? 'Smart analysis identifies fast-selling items for prioritized restocking, and flags slow-moving inventory so you avoid locking up working capital.'
                  : 'Uchambuzi huu unakusaidia kujua bidhaa za kuongeza kwa haraka na bidhaa zisizotembea ili usifungie mtaji wako.'}
              </p>
            </div>

            {/* 1. FAST MOVING PRODUCTS */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                  <span className="text-xs font-black text-emerald-900 uppercase tracking-wider">
                    {isEn ? 'Fast-Moving Products (High Priority)' : 'Bidhaa Zinazotembea Haraka (Weka Stoo)'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                  {stockMovementAnalysis.fastMoving.length} {isEn ? 'items' : 'bidhaa'}
                </span>
              </div>

              {stockMovementAnalysis.fastMoving.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">
                  {isEn ? 'No high-velocity sales in this period.' : 'Hakuna bidhaa za kasi kubwa katika kipindi hiki.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {stockMovementAnalysis.fastMoving.map(({ product, stats, currentStock }) => (
                    <div key={product.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{product.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {isEn ? `Sold: ${stats.qtySold} ${product.unit}` : `Imeuzwa: ${stats.qtySold} ${product.unit}`} · {formatKES(stats.revenue)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-black text-slate-800">
                          {currentStock} {product.unit} {isEn ? 'left' : 'zimebaki'}
                        </div>
                        <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                          {isEn ? 'Keep Stocked' : 'Ongeza Stoo'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. STEADY / MEDIUM MOVING PRODUCTS */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500 stroke-[2.5]" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    {isEn ? 'Steady Moving Products' : 'Bidhaa za Wastani'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black">
                  {stockMovementAnalysis.mediumMoving.length} {isEn ? 'items' : 'bidhaa'}
                </span>
              </div>

              {stockMovementAnalysis.mediumMoving.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">
                  {isEn ? 'No medium-velocity sales.' : 'Hakuna mauzo ya wastani.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto">
                  {stockMovementAnalysis.mediumMoving.map(({ product, stats, currentStock }) => (
                    <div key={product.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{product.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {stats.qtySold} sold · {formatKES(stats.revenue)}
                        </div>
                      </div>
                      <div className="text-right text-xs font-bold text-slate-700">
                        {currentStock} {product.unit} {isEn ? 'in stock' : 'dukani'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. SLOW MOVING / STAGNANT PRODUCTS (DO NOT RUSH RESTOCKING) */}
            <div className="p-4 bg-rose-50/60 border-2 border-rose-300 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-black text-rose-950 uppercase tracking-wider">
                    {isEn ? 'Slow Moving (Do Not Rush Restocking)' : 'Zisizotembea (Usikimbilie Kuongeza Stoo)'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black">
                  {stockMovementAnalysis.slowMoving.length} {isEn ? 'items' : 'bidhaa'}
                </span>
              </div>

              <p className="text-[11px] text-rose-800 leading-tight">
                {isEn
                  ? '⚠️ These products have 0 sales during this period. Avoid buying more to prevent capital stagnation.'
                  : '⚠️ Bidhaa hizi hazijauzwa kabisa katika kipindi hiki. Epuka kununua zaidi ili usifungie mtaji wako.'}
              </p>

              {stockMovementAnalysis.slowMoving.length === 0 ? (
                <div className="py-3 text-center text-xs text-emerald-700 font-bold">
                  {isEn ? '🎉 Great job! All products in your shop have sales activity.' : '🎉 Safi sana! Bidhaa zote dukani zinauzika.'}
                </div>
              ) : (
                <div className="divide-y divide-rose-100 text-xs max-h-64 overflow-y-auto">
                  {stockMovementAnalysis.slowMoving.map(({ product, currentStock }) => (
                    <div key={product.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-rose-950">{product.name}</div>
                        <div className="text-[11px] text-rose-700">
                          {isEn ? '0 units sold in period' : 'Haijauzwa kipindi hiki'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-black text-rose-900">
                          {currentStock} {product.unit} {isEn ? 'remaining' : 'stoo'}
                        </div>
                        <span className="inline-block text-[9px] font-black text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded uppercase mt-0.5">
                          {isEn ? 'Hold Restock' : 'Usiongeze'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PAST SALES LIST WITH SEARCH & DETAILS */}
        {activeTab === 'past_sales' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
              <span>
                {isEn ? `Showing ${searchFilteredSales.length} transactions` : `Inaonyesha miamala ${searchFilteredSales.length}`}
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-emerald-700 font-bold hover:underline"
                >
                  {isEn ? 'Clear Search' : 'Futa Utafutaji'}
                </button>
              )}
            </div>

            {searchFilteredSales.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                <Search className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="font-bold text-sm text-slate-800">
                  {isEn ? 'No sales match your search' : 'Hakuna mauzo yaliyopatikana'}
                </div>
                <p className="text-xs text-slate-400">
                  {isEn ? 'Try adjusting your search keyword or date range.' : 'Jaribu kubadilisha neno la utafutaji au tarehe.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                {searchFilteredSales.map((sale) => {
                  const items = itemsBySaleId.get(sale.id) || [];
                  const cust = sale.debt_id ? debtMap.get(sale.debt_id) : debtMap.get(sale.id);
                  const isVoided = sale.status === 'void';

                  return (
                    <div key={sale.id} className="p-3.5 space-y-2 hover:bg-slate-50/70 transition">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900">
                              #{sale.sale_no}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                sale.payment_method === 'cash'
                                  ? 'bg-slate-100 text-slate-800'
                                  : sale.payment_method === 'mpesa'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {sale.payment_method === 'mpesa' ? 'M-Pesa' : sale.payment_method}
                            </span>
                            {isVoided && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                                {isEn ? 'Voided' : 'Imeghairiwa'}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>
                              📅 {new Date(sale.created_at).toLocaleString('en-KE', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                              🏷️ {isEn ? 'Served by:' : 'Mhudumu:'}{' '}
                              <strong>
                                {sale.cashier_name || sale.created_by_name || (sale.created_by_role === 'attendant' ? (isEn ? 'Attendant' : 'Mhudumu') : (isEn ? 'Owner' : 'Mwenyewe'))}
                              </strong>
                            </span>
                            {cust && (
                              <span className="font-bold text-slate-700">
                                • 👤 {cust.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-base font-black text-slate-900 tabular-nums">
                            {formatKES(sale.total)}
                          </div>
                          {isOwner && !isVoided && (
                            <div className="text-[10px] font-black text-emerald-700 tabular-nums">
                              +{formatKES(sale.total_profit)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Items Summary */}
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        {items.length === 0 ? (
                          <span className="text-slate-400">{isEn ? 'Items info unavailable' : 'Taarifa za bidhaa hazipatikani'}</span>
                        ) : (
                          <div className="space-y-0.5">
                            {items.map((it, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="truncate max-w-[200px]">{it.product_name} x{it.qty}</span>
                                <span className="font-bold tabular-nums">{formatKES(it.line_total)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Receipt Action Button */}
                      <div className="flex justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt({
                            sale,
                            items,
                            customerName: cust?.name,
                            customerPhone: cust?.phone,
                          })}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{isEn ? 'View Receipt' : 'Risiti'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

      {/* Day Close Modal */}
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
