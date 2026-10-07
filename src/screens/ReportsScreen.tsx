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
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  db,
  type UserRole,
  type CashSession,
  type SaleHeader,
  type SaleItem,
  type Product,
  type ShopMeta,
  getActiveCashSession,
  getShopMeta,
  saveShopMeta,
  voidSale,
  getShopUser,
  getStaffAttendants,
  resolveSaleCashierDisplay,
  resolveDebtRecorderDisplay,
  getOwnerBranches,
  switchActiveShopBranch,
} from '../lib/db/local';
import { syncEngine } from '../lib/sync/engine';
import {
  toKES,
  formatKES,
  addKES,
  subKES,
} from '../lib/money';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
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
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
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
  const ownerBranches = useLiveQuery(() => getOwnerBranches(), [shopMeta?.shop_id]) || [];
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('active');
  const targetShopId =
    selectedBranchFilter === 'active' || !isOwner
      ? shopMeta?.shop_id
      : selectedBranchFilter === 'all'
      ? 'all'
      : selectedBranchFilter;

  const loggedInUser = useLiveQuery(() => getShopUser(), []);
  const allUsers = useLiveQuery(() => db.users.toArray(), []) || [];
  const staffAttendants = useLiveQuery(() => getStaffAttendants(), []) || [];

  // Trigger an immediate sync pass when ReportsScreen opens so the Owner always sees 100% up-to-date sales from all attendants
  useEffect(() => {
    void syncEngine.triggerSync();
  }, [activeTab, datePeriod, shopMeta?.shop_id]);

  // Build lookup map of user ID -> { name, role } across users table, staff_attendants, and active user
  const usersMap = useMemo(() => {
    const map = new Map<string, { name: string; role?: string }>();
    for (const u of allUsers) {
      if (u.id && u.name) {
        map.set(u.id, { name: u.name, role: u.role });
      }
    }
    for (const att of staffAttendants) {
      if (att.id && att.name) {
        map.set(att.id, { name: att.name, role: 'attendant' });
      }
    }
    if (loggedInUser?.id && loggedInUser?.name) {
      map.set(loggedInUser.id, { name: loggedInUser.name, role: loggedInUser.role });
    }
    if (shopMeta?.user_id && shopMeta?.owner_name) {
      if (!map.has(shopMeta.user_id)) {
        map.set(shopMeta.user_id, { name: shopMeta.owner_name, role: 'owner' });
      }
    }
    return map;
  }, [allUsers, staffAttendants, loggedInUser, shopMeta]);

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

  // Live queries scoped to selected branch (or all branches if 'all' is selected by a multi-shop owner)
  const branchShopIdsSet = useMemo(() => {
    return new Set(ownerBranches.map((b) => b.shop_id));
  }, [ownerBranches]);

  const matchesTargetShop = (recordShopId?: string | null) => {
    if (!targetShopId || !recordShopId) return true;
    if (targetShopId === 'all') {
      return branchShopIdsSet.size > 0 ? branchShopIdsSet.has(recordShopId) : true;
    }
    return recordShopId === targetShopId;
  };

  const allSales = useLiveQuery(
    () =>
      db.sales
        .orderBy('created_at')
        .reverse()
        .filter((s) => matchesTargetShop(s.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];

  const allItems = useLiveQuery(
    () =>
      db.sale_items
        .filter((it) => matchesTargetShop(it.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];
  const allExpenses = useLiveQuery(
    () =>
      db.expenses
        .filter((e) => !e.deleted_at && matchesTargetShop(e.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];

  const allProducts = useLiveQuery(
    () =>
      db.products
        .filter((p) => !p.deleted_at && matchesTargetShop(p.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];
  const allStock = useLiveQuery(
    () =>
      db.product_stock
        .filter((s) => matchesTargetShop(s.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];
  const allDebts = useLiveQuery(
    () =>
      db.debts
        .filter((d) => matchesTargetShop(d.shop_id))
        .toArray(),
    [targetShopId, ownerBranches.length]
  ) || [];

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

  // Compute date window using local calendar boundaries + safe parsing so no sale is ever missed due to UTC/local day boundary differences
  const { startDateMs, endDateMs, label } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    const locale = isEn ? 'en-KE' : 'sw-KE';

    if (datePeriod === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDateMs: start.getTime(),
        endDateMs: end.getTime(),
        label: now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }),
      };
    } else if (datePeriod === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return {
        startDateMs: start.getTime(),
        endDateMs: end.getTime(),
        label: isEn ? 'Yesterday' : 'Jana',
      };
    } else if (datePeriod === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDateMs: start.getTime(),
        endDateMs: end.getTime(),
        label: isEn ? 'Weekly Report (Past 7 Days)' : 'Ripoti ya Wiki (Siku 7 Zilizopita)',
      };
    } else if (datePeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDateMs: start.getTime(),
        endDateMs: end.getTime(),
        label: isEn ? 'Monthly Report (This Month)' : 'Ripoti ya Mwezi (Mwezi Huu)',
      };
    } else {
      // Custom date range
      const s = new Date(`${customStartDate}T00:00:00`);
      const e = new Date(`${customEndDate}T23:59:59.999`);
      return {
        startDateMs: s.getTime(),
        endDateMs: e.getTime(),
        label: `${customStartDate} – ${customEndDate}`,
      };
    }
  }, [datePeriod, customStartDate, customEndDate, isEn]);

  // Filtered Sales within Window (Owner sees 100% of completed sales in the shop; Attendant sees their own)
  const filteredSalesInWindow = useMemo(() => {
    return allSales.filter((s) => {
      if (s.status !== 'completed') return false;
      const tMs = new Date(s.created_at).getTime();
      if (Number.isNaN(tMs) || tMs < startDateMs || tMs > endDateMs) return false;
      if (isOwner) return true;
      return !loggedInUser || s.created_by === loggedInUser.id || s.recorded_by === loggedInUser.name;
    });
  }, [allSales, startDateMs, endDateMs, isOwner, loggedInUser]);

  // Search-filtered sales (for Past Sales list & search bar)
  const searchFilteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredSalesInWindow;

    return filteredSalesInWindow.filter((s) => {
      const saleNoStr = String(s.sale_no);
      const saleNoMatch = saleNoStr.includes(q) || `#${saleNoStr}`.includes(q);
      const cust = s.debt_id ? debtMap.get(s.debt_id) : debtMap.get(s.id);
      const custMatch = Boolean(cust && cust.name.toLowerCase().includes(q));
      const cashierInfo = resolveSaleCashierDisplay(s, usersMap, shopMeta, isEn);
      const cashierMatch =
        cashierInfo.name.toLowerCase().includes(q) ||
        cashierInfo.roleLabel.toLowerCase().includes(q);
      
      const items = itemsBySaleId.get(s.id) || [];
      const itemMatch = items.some((it) => it.product_name.toLowerCase().includes(q));

      return saleNoMatch || custMatch || cashierMatch || itemMatch;
    });
  }, [filteredSalesInWindow, searchQuery, debtMap, itemsBySaleId, usersMap, shopMeta, isEn]);

  // Breakdown of Sales by Person (Owner & Attendants)
  const salesByPerson = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        roleLabel: string;
        isAttendant: boolean;
        count: number;
        totalSales: number;
        totalProfit: number;
      }
    >();

    for (const s of filteredSalesInWindow) {
      const info = resolveSaleCashierDisplay(s, usersMap, shopMeta, isEn);
      const key = `${info.name.toLowerCase()}_${info.isAttendant ? 'attendant' : 'owner'}`;
      const existing = map.get(key) || {
        key,
        name: info.name,
        roleLabel: info.roleLabel,
        isAttendant: info.isAttendant,
        count: 0,
        totalSales: 0,
        totalProfit: 0,
      };
      existing.count += 1;
      if (includeCreditInGrossSales || s.payment_method !== 'deni') {
        existing.totalSales += (s.total || 0);
        existing.totalProfit += (s.total_profit || 0);
      }
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredSalesInWindow, usersMap, shopMeta, isEn, includeCreditInGrossSales]);

  // Filtered Expenses within Window
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((e) => {
      const tMs = new Date(e.created_at).getTime();
      return !Number.isNaN(tMs) && tMs >= startDateMs && tMs <= endDateMs;
    });
  }, [allExpenses, startDateMs, endDateMs]);

  // Filtered Credit (Deni) Entries within Window (both from Credit Sales and Direct Credit Entries)
  const filteredDebtsInWindow = useMemo(() => {
    return allDebts.filter((d) => {
      if (d.status === 'written_off') return false;
      const tMs = new Date(d.created_at).getTime();
      if (Number.isNaN(tMs) || tMs < startDateMs || tMs > endDateMs) return false;
      if (isOwner) return true;
      return !loggedInUser || d.created_by === loggedInUser.id || d.recorded_by === loggedInUser.name;
    });
  }, [allDebts, startDateMs, endDateMs, isOwner, loggedInUser]);

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

  // Escape CSV cell safely
  const csvEscape = (val: unknown): string => {
    const str = val == null ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Export Comprehensive CSV (Summary + Sales By Person + Detailed Sales + Credit/Deni Entries + Stock & Velocity)
  const handleExportCSV = () => {
    const exportedByName =
      loggedInUser?.name && loggedInUser.name !== 'Smartsort User'
        ? loggedInUser.name
        : shopMeta?.owner_name || (isOwner ? 'Shop Owner' : 'Attendant');
    const exportedRole = isOwner ? 'Owner' : 'Attendant';
    const salesMapById = new Map<string, SaleHeader>();
    allSales.forEach((s) => salesMapById.set(s.id, s));

    const lines: string[][] = [];

    // SECTION 1: REPORT HEADER & RECONCILIATION SUMMARY
    lines.push(['SMARTSORT DUKA — FULL SALES, CREDIT & STOCK AUDIT REPORT']);
    lines.push(['Shop Name', shopName]);
    lines.push(['Period', label]);
    lines.push(['Generated At', new Date().toLocaleString('en-KE')]);
    lines.push(['Generated By', `${exportedByName} (${exportedRole})`]);
    lines.push([]);
    lines.push(['1. FINANCIAL & RECONCILIATION SUMMARY']);
    lines.push(['Metric', 'Value (KES / Count)']);
    lines.push(['Gross Sales (All Completed Sales)', String(paymentBreakdown.totalAllSales)]);
    lines.push(['Cash Sales', String(paymentBreakdown.cash)]);
    lines.push(['M-Pesa / Till Sales', String(paymentBreakdown.mpesa)]);
    lines.push(['Credit Sales (Deni)', String(paymentBreakdown.deni)]);
    lines.push(['Total Completed Sales Count', String(transactionCount)]);
    lines.push(['Total Credit Entries Recorded in Period', String(filteredDebtsInWindow.length)]);
    lines.push(['Total Expenses', String(totalExpenses)]);
    if (isOwner) {
      lines.push(['Estimated Gross Profit', String(totalProfit)]);
      lines.push(['Net Profit (Profit - Expenses)', String(netEarnings)]);
    }
    lines.push([]);

    // SECTION 2: SALES BY PERSON (OWNER VS ATTENDANT RECONCILIATION)
    lines.push(['2. SALES BY PERSON (OWNER & ATTENDANT COMPARISON)']);
    lines.push([
      'Recorded By (Name)',
      'Role',
      'Transactions Count',
      'Total Sales (KES)',
      isOwner ? 'Total Profit (KES)' : 'Role Verification',
    ]);
    for (const p of salesByPerson) {
      lines.push([
        p.name,
        p.roleLabel,
        String(p.count),
        String(p.totalSales),
        isOwner ? String(p.totalProfit) : p.roleLabel,
      ]);
    }
    lines.push([]);

    // SECTION 3: DETAILED SALES TRANSACTIONS (INCLUDING CREDIT SALES & ITEMS)
    lines.push(['3. ALL SALES TRANSACTIONS (CASH, M-PESA & CREDIT/DENI)']);
    lines.push([
      'Sale #',
      'Date & Time',
      'Recorded By',
      'Role',
      'Payment Method',
      'Customer Name',
      'Items Sold (Qty & Price)',
      'Total (KES)',
      isOwner ? 'Profit (KES)' : 'Status',
    ]);
    for (const s of filteredSalesInWindow) {
      const cust = s.debt_id ? debtMap.get(s.debt_id) : debtMap.get(s.id);
      const cashierInfo = resolveSaleCashierDisplay(s, usersMap, shopMeta, isEn);
      const saleItems = itemsBySaleId.get(s.id) || [];
      const itemsSummary = saleItems
        .map((it) => `${it.product_name} x${it.qty} (${it.line_total})`)
        .join('; ');
      lines.push([
        `#${s.sale_no}`,
        new Date(s.created_at).toLocaleString('en-KE'),
        s.recorded_by || cashierInfo.name,
        cashierInfo.roleLabel,
        s.payment_method.toUpperCase(),
        cust?.name || '-',
        itemsSummary || `${s.item_count} items`,
        String(s.total),
        isOwner ? String(s.total_profit) : s.status,
      ]);
    }
    lines.push([]);

    // SECTION 4: CREDIT (DENI) ENTRIES IN PERIOD (SALES CREDIT + DIRECT CREDIT)
    lines.push(['4. CREDIT (DENI) ENTRIES CAPTURED IN PERIOD']);
    lines.push([
      'Date & Time',
      'Customer Name',
      'Customer Phone',
      'Recorded By',
      'Role',
      'Source',
      'Credit Principal (KES)',
      'Amount Paid (KES)',
      'Balance Remaining (KES)',
      'Status',
    ]);
    for (const d of filteredDebtsInWindow) {
      const linkedSale = d.sale_id ? salesMapById.get(d.sale_id) : null;
      const recInfo = resolveDebtRecorderDisplay(d, linkedSale, usersMap, shopMeta, isEn);
      const bal = subKES(d.principal, d.amount_paid);
      lines.push([
        new Date(d.created_at).toLocaleString('en-KE'),
        d.customer_name,
        d.customer_phone || '-',
        d.recorded_by || recInfo.name,
        recInfo.roleLabel,
        linkedSale ? `Sale #${linkedSale.sale_no}` : d.override_reason || 'Direct Credit',
        String(d.principal),
        String(d.amount_paid),
        String(bal),
        d.status.toUpperCase(),
      ]);
    }
    lines.push([]);

    // SECTION 5: STOCK INVENTORY & MOVEMENT VELOCITY
    lines.push(['5. STOCK INVENTORY & SALES VELOCITY']);
    lines.push([
      'Product Name',
      'Unit',
      'Current Stock Qty',
      'Low Stock Limit',
      'Units Sold in Period',
      'Sales Revenue in Period (KES)',
      'Selling Price (KES)',
      isOwner ? 'Buying Price (KES)' : 'Stock Status',
    ]);
    for (const p of allProducts) {
      const currentQty = stockMap.get(p.id) ?? 0;
      const soldEntry = stockMovementAnalysis.rankedSold.find((r) => r.productId === p.id);
      const qtySold = soldEntry?.qtySold || 0;
      const rev = soldEntry?.revenue || 0;
      lines.push([
        p.name,
        p.unit,
        String(currentQty),
        String(p.low_limit),
        String(qtySold),
        String(rev),
        String(p.selling_price),
        isOwner
          ? String(p.buying_price ?? 0)
          : currentQty <= p.low_limit
          ? 'LOW STOCK'
          : 'IN STOCK',
      ]);
    }

    const csvString =
      '\uFEFF' + lines.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeShop = shopName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeShop}_report_${datePeriod}_${exportedRole.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsDownloadModalOpen(false);
  };

  // Export Comprehensive PDF Report (Owner & Attendant Reconciliation + Sales + Credits + Stock)
  const handleExportPDF = () => {
    const exportedByName =
      loggedInUser?.name && loggedInUser.name !== 'Smartsort User'
        ? loggedInUser.name
        : shopMeta?.owner_name || (isOwner ? 'Shop Owner' : 'Attendant');
    const exportedRole = isOwner ? 'Owner' : 'Attendant';
    const salesMapById = new Map<string, SaleHeader>();
    allSales.forEach((s) => salesMapById.set(s.id, s));

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 14;

    const ensureSpace = (neededMm: number) => {
      if (y + neededMm > pageHeight - 14) {
        doc.addPage();
        y = 14;
      }
    };

    // Header Banner
    doc.setFillColor(5, 150, 105);
    doc.rect(10, y - 6, pageWidth - 20, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${shopName.toUpperCase()} — SALES, CREDIT & STOCK REPORT`, 14, y + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Period: ${label}   |   Exported By: ${exportedByName} (${exportedRole})   |   Generated: ${new Date().toLocaleString('en-KE')}`,
      14,
      y + 8
    );
    y += 22;

    // 1. Summary Box
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('1. RECONCILIATION SUMMARY (ALL SALES & CREDIT)', 10, y);
    y += 4;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(10, y, pageWidth - 20, 24, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gross Sales (incl. Credit): ${formatKES(paymentBreakdown.totalAllSales)}`, 14, y + 6);
    doc.text(`Cash Sales: ${formatKES(paymentBreakdown.cash)}`, 14, y + 12);
    doc.text(`M-Pesa / Till: ${formatKES(paymentBreakdown.mpesa)}`, 14, y + 18);

    doc.text(`Credit Sales (Deni): ${formatKES(paymentBreakdown.deni)}`, 105, y + 6);
    doc.text(`Completed Orders: ${transactionCount} sales (${filteredDebtsInWindow.length} credit entries)`, 105, y + 12);
    doc.text(
      isOwner
        ? `Est. Profit: ${formatKES(totalProfit)}   |   Net: ${formatKES(netEarnings)}`
        : `Expenses: ${formatKES(totalExpenses)}`,
      105,
      y + 18
    );
    y += 30;

    // 2. Sales by Person (Owner vs Attendant Comparison)
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('2. SALES BY PERSON (OWNER & ATTENDANTS)', 10, y);
    y += 5;

    if (salesByPerson.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('No sales recorded in this period.', 12, y);
      y += 6;
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(10, y - 3.5, pageWidth - 20, 6, 'F');
      doc.setFontSize(8);
      doc.text('Person Name', 12, y);
      doc.text('Role', 80, y);
      doc.text('Orders', 115, y);
      doc.text('Total Sales', 140, y);
      if (isOwner) doc.text('Profit', 175, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const p of salesByPerson) {
        ensureSpace(6);
        doc.text(String(p.name).slice(0, 32), 12, y);
        doc.text(String(p.roleLabel), 80, y);
        doc.text(String(p.count), 115, y);
        doc.text(formatKES(p.totalSales), 140, y);
        if (isOwner) doc.text(formatKES(p.totalProfit), 175, y);
        y += 5;
      }
      y += 3;
    }

    // 3. Detailed Sales Transactions
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`3. DETAILED SALES TRANSACTIONS (${filteredSalesInWindow.length})`, 10, y);
    y += 5;

    if (filteredSalesInWindow.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('No transactions in this period.', 12, y);
      y += 6;
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(10, y - 3.5, pageWidth - 20, 6, 'F');
      doc.setFontSize(7.5);
      doc.text('Sale #', 12, y);
      doc.text('Date/Time', 26, y);
      doc.text('Recorded By (Role)', 60, y);
      doc.text('Method / Customer', 105, y);
      doc.text('Items', 145, y);
      doc.text('Total', 178, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const s of filteredSalesInWindow) {
        ensureSpace(7);
        const cust = s.debt_id ? debtMap.get(s.debt_id) : debtMap.get(s.id);
        const cashierInfo = resolveSaleCashierDisplay(s, usersMap, shopMeta, isEn);
        const recorderStr = `${s.recorded_by || cashierInfo.name} (${cashierInfo.roleLabel})`;
        const methodCust = `${s.payment_method.toUpperCase()}${cust?.name ? ` - ${cust.name}` : ''}`;
        const saleItems = itemsBySaleId.get(s.id) || [];
        const firstItem = saleItems[0]
          ? `${saleItems[0].product_name} x${saleItems[0].qty}${saleItems.length > 1 ? ` +${saleItems.length - 1}` : ''}`
          : `${s.item_count} items`;

        doc.text(`#${s.sale_no}`, 12, y);
        doc.text(
          new Date(s.created_at).toLocaleString('en-KE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
          26,
          y
        );
        doc.text(recorderStr.slice(0, 24), 60, y);
        doc.text(methodCust.slice(0, 22), 105, y);
        doc.text(firstItem.slice(0, 18), 145, y);
        doc.text(formatKES(s.total), 178, y);
        y += 5;
      }
      y += 3;
    }

    // 4. Credit (Deni) Entries
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`4. CREDIT (DENI) ENTRIES IN PERIOD (${filteredDebtsInWindow.length})`, 10, y);
    y += 5;

    if (filteredDebtsInWindow.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('No credit entries recorded in this period.', 12, y);
      y += 6;
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(10, y - 3.5, pageWidth - 20, 6, 'F');
      doc.setFontSize(7.5);
      doc.text('Date', 12, y);
      doc.text('Customer', 44, y);
      doc.text('Recorded By (Role)', 84, y);
      doc.text('Principal', 132, y);
      doc.text('Paid', 156, y);
      doc.text('Balance', 176, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const d of filteredDebtsInWindow) {
        ensureSpace(6);
        const linkedSale = d.sale_id ? salesMapById.get(d.sale_id) : null;
        const recInfo = resolveDebtRecorderDisplay(d, linkedSale, usersMap, shopMeta, isEn);
        const bal = subKES(d.principal, d.amount_paid);

        doc.text(
          new Date(d.created_at).toLocaleString('en-KE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
          12,
          y
        );
        doc.text(String(d.customer_name || '-').slice(0, 20), 44, y);
        doc.text(`${d.recorded_by || recInfo.name} (${recInfo.roleLabel})`.slice(0, 25), 84, y);
        doc.text(formatKES(d.principal), 132, y);
        doc.text(formatKES(d.amount_paid), 156, y);
        doc.text(formatKES(bal), 176, y);
        y += 5;
      }
      y += 3;
    }

    // 5. Stock & Inventory Snapshot
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`5. STOCK INVENTORY & SALES VELOCITY (${allProducts.length} ITEMS)`, 10, y);
    y += 5;

    doc.setFillColor(241, 245, 249);
    doc.rect(10, y - 3.5, pageWidth - 20, 6, 'F');
    doc.setFontSize(7.5);
    doc.text('Product Name', 12, y);
    doc.text('Stock Left', 90, y);
    doc.text('Sold in Period', 120, y);
    doc.text('Revenue', 150, y);
    doc.text('Price', 178, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    for (const p of allProducts) {
      ensureSpace(6);
      const currentQty = stockMap.get(p.id) ?? 0;
      const soldEntry = stockMovementAnalysis.rankedSold.find((r) => r.productId === p.id);
      const qtySold = soldEntry?.qtySold || 0;
      const rev = soldEntry?.revenue || 0;

      doc.text(p.name.slice(0, 40), 12, y);
      doc.text(`${currentQty} ${p.unit}`, 90, y);
      doc.text(`${qtySold} ${p.unit}`, 120, y);
      doc.text(formatKES(rev), 150, y);
      doc.text(formatKES(p.selling_price), 178, y);
      y += 5;
    }

    const safeShop = shopName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeShop}_report_${datePeriod}_${exportedRole.toLowerCase()}.pdf`);
    setIsDownloadModalOpen(false);
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-900 leading-tight truncate">
            {t.reportsTitle}
          </h1>
          <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDownloadModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>{isEn ? 'Download Report' : 'Pakua Ripoti'}</span>
          </Button>

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
      </div>

      <div className="p-4 space-y-4">
        {/* Multi-Branch Selector for Owners with more than 1 shop */}
        {isOwner && ownerBranches.length > 1 && (
          <div className="p-3 bg-white rounded-2xl border border-emerald-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider">
                🏪 {isEn ? `Shop Branch Reports (${ownerBranches.length} Shops)` : `Ripoti za Matawi (${ownerBranches.length} Maduka)`}
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                {selectedBranchFilter === 'all'
                  ? isEn
                    ? 'All Branches Combined'
                    : 'Matawi Yote Pamoja'
                  : isEn
                  ? 'Single Shop View'
                  : 'Tawi Moja'}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedBranchFilter('active')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                  selectedBranchFilter === 'active' || selectedBranchFilter === shopMeta?.shop_id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {shopMeta?.avatar_emoji || '🏪'} {shopMeta?.shop_name} ({isEn ? 'Current' : 'Sasa'})
              </button>
              {ownerBranches
                .filter((b) => b.shop_id !== shopMeta?.shop_id)
                .map((branch) => (
                  <button
                    key={branch.shop_id}
                    type="button"
                    onClick={async () => {
                      await switchActiveShopBranch(branch.shop_id);
                      setSelectedBranchFilter('active');
                      void syncEngine.triggerSync();
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 transition cursor-pointer"
                  >
                    {branch.avatar_emoji || '🏪'} {branch.shop_name}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setSelectedBranchFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                  selectedBranchFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📊 {isEn ? 'All Shops Combined' : 'Maduka Yote'}
              </button>
            </div>
          </div>
        )}

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

            {/* Sales by Person (Owner & Attendants Breakdown) */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isEn ? 'Sales by Person (Owner & Attendants)' : 'Mauzo kwa Kila Mtu (Mwenye Duka & Wahudumu)'}
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {isOwner
                    ? isEn
                      ? 'All Shop Sales'
                      : 'Mauzo Yote ya Duka'
                    : isEn
                    ? 'Your Sales'
                    : 'Mauzo Yako'}
                </span>
              </div>

              {salesByPerson.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">
                  {isEn ? 'No sales recorded in this period.' : 'Hakuna mauzo katika kipindi hiki.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {salesByPerson.map((person) => (
                    <div key={person.key} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            person.isAttendant
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {person.roleLabel}
                        </span>
                        <div>
                          <div className="font-black text-slate-900">{person.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {person.count} {person.count === 1 ? (isEn ? 'sale' : 'mauzo') : (isEn ? 'sales' : 'mauzo')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-black text-slate-900 tabular-nums">
                          {formatKES(person.totalSales)}
                        </div>
                        {isOwner && (
                          <div className="text-[10px] font-bold text-emerald-700 tabular-nums">
                            +{formatKES(person.totalProfit)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

            {/* Transaction History View inside Reports Overview */}
            <RecentTransactionsSection
              language={language}
              userRole={userRole}
              defaultExpanded={true}
              allowVoid={true}
              onOpenReceipt={(sale, items, customerName, customerPhone) =>
                setSelectedReceipt({ sale, items, customerName, customerPhone })
              }
              onOpenVoidModal={(sale, items) => setSaleToVoid({ sale, items })}
            />
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
                  const cashierInfo = resolveSaleCashierDisplay(sale, usersMap, shopMeta, isEn);

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
                            <span
                              className={`font-semibold px-1.5 py-0.5 rounded text-[11px] border ${
                                cashierInfo.isAttendant
                                  ? 'bg-blue-50 text-blue-900 border-blue-200'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              }`}
                            >
                              👤 {isEn ? 'Recorded by:' : 'Imerekodiwa na:'}{' '}
                              <strong>{sale.recorded_by || cashierInfo.name}</strong>{' '}
                              <span className="opacity-75">({cashierInfo.roleLabel})</span>
                            </span>
                            {cust && (
                              <span className="font-bold text-slate-700">
                                • 🛍️ {cust.name}
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

        {/* Action Buttons: Download Report (CSV / PDF) & WhatsApp Share */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => setIsDownloadModalOpen(true)}
            className="flex items-center justify-center gap-2 text-xs font-bold border-emerald-300 text-emerald-900 bg-emerald-50/70 hover:bg-emerald-100"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            {isEn ? 'Download Report (CSV / PDF)' : 'Pakua Ripoti (CSV / PDF)'}
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

      {/* Download Report Sheet Modal (CSV or PDF for Owner vs Attendant Comparison) */}
      <Sheet
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        title={isEn ? 'Download Audit Report (CSV or PDF)' : 'Pakua Ripoti Kamili (CSV au PDF)'}
        subtitle={`${shopName} · ${label}`}
      >
        <div className="space-y-4 select-none">
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-1.5">
            <div className="font-black flex items-center justify-between">
              <span>
                📋 {isEn ? 'Owner & Attendant Reconciliation Ready' : ' Uhakiki wa Mwenye Duka na Mhudumu'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                {transactionCount} {isEn ? 'Sales' : 'Mauzo'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              {isEn
                ? 'Includes all Cash, M-Pesa, and Credit (Deni) sales with exact "Recorded by" names, itemized products, standalone credit entries, and current stock levels so Owner and Attendant reports can be compared side-by-side.'
                : 'Inajumuisha mauzo yote ya Cash, M-Pesa na Deni pamoja na jina la aliyerekodi, orodha ya madeni na stoo ili kulinganisha ripoti ya Mwenye Duka na Mhudumu.'}
            </p>
          </div>

          {/* Quick Preview of Included Data */}
          <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                {isEn ? 'Gross Sales' : 'Mauzo Yote'}
              </span>
              <span className="font-black text-slate-900 tabular-nums">
                {formatKES(paymentBreakdown.totalAllSales)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                {isEn ? 'Credit (Deni)' : 'Mauzo ya Deni'}
              </span>
              <span className="font-black text-amber-800 tabular-nums">
                {formatKES(paymentBreakdown.deni)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                {isEn ? 'Stock Items' : 'Bidhaa Stoo'}
              </span>
              <span className="font-black text-slate-900 tabular-nums">
                {allProducts.length}
              </span>
            </div>
          </div>

          {/* Format Selection Buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleExportPDF}
              className="w-full p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-between shadow-md active:scale-[0.99] transition cursor-pointer"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-black">
                    {isEn ? 'Download PDF Report (.pdf)' : 'Pakua Ripoti ya PDF (.pdf)'}
                  </div>
                  <div className="text-[11px] text-emerald-100">
                    {isEn
                      ? 'Printable document with Sales by Person, Credit & Stock tables'
                      : 'Ripoti safi ya kuchapisha au kutuma WhatsApp'}
                  </div>
                </div>
              </div>
              <Download className="w-5 h-5 text-emerald-100 shrink-0" />
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="w-full p-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-200 flex items-center justify-between shadow-2xs active:scale-[0.99] transition cursor-pointer"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">
                    {isEn ? 'Download Excel / CSV (.csv)' : 'Pakua Excel / CSV (.csv)'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isEn
                      ? 'Spreadsheet with full sales, credit ledger & stock inventory'
                      : 'Faili la Excel lenye miamala yote, madeni na stoo'}
                  </div>
                </div>
              </div>
              <Download className="w-5 h-5 text-slate-400 shrink-0" />
            </button>
          </div>
        </div>
      </Sheet>

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
