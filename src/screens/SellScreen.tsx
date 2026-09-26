import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Check,
  X,
  PauseCircle,
  Share2,
  Trash2,
  AlertTriangle,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronDown,
  Coins,
  Calculator,
  RotateCcw,
  Scale,
} from 'lucide-react';
import {
  db,
  recordSale,
  voidSale,
  serverNow,
  generateSearchKey,
  seedKenyanCatalog,
  type Product,
  type HeldCart,
  type UserRole,
  type SaleHeader,
  type SaleItem,
  type Customer,
} from '../lib/db/local';
import {
  toKES,
  formatKES,
  addKES,
  mulKES,
  subKES,
  type KES,
} from '../lib/money';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { QuickSellRow } from '../components/QuickSellRow';
import { HeldCartsStrip } from '../components/HeldCartsStrip';
import { CustomerCreditLimitModal } from '../components/CustomerCreditLimitModal';
import { FirstProductGuide } from '../components/FirstProductGuide';
import { ReceiptModal } from '../components/ReceiptModal';
import { QuickAddActionSheet } from '../components/QuickAddActionSheet';
import { VoidSaleModal } from '../components/VoidSaleModal';
import { shareReceipt, generateReceiptSummaryText } from '../lib/receipt';
import { translations, type Language } from '../lib/i18n';

interface CartItem {
  product: Product;
  qty: number;
  unitPrice: KES;
  overridePrice?: KES | null;
  lineTotalOverride?: KES | null;
  portionLabel?: string;
}

function getFractionDisplay(qty: number, unitStr: string = 'unit'): string {
  if (qty === 0.25) return '¼ (Quarter)';
  if (qty === 0.5) return '½ (Half)';
  if (qty === 0.75) return '¾ (3/4)';
  return `${qty} ${unitStr}`;
}

interface SellScreenProps {
  userRole: UserRole;
  shopName: string;
  tillNumber: string;
  language?: Language;
  onNavigateToStock: () => void;
  onNavigateToDeni: () => void;
}

interface CompletedSaleState {
  sale: SaleHeader;
  items: SaleItem[];
  customerName?: string;
  customerPhone?: string;
  cashTendered?: KES;
  changeAmount?: KES;
}

export const SellScreen: React.FC<SellScreenProps> = ({
  userRole,
  shopName,
  tillNumber,
  language = 'en',
  onNavigateToStock,
  onNavigateToDeni,
}) => {
  const t = translations[language];
  const isEn = language === 'en';
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'mpesa' | 'deni'>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');

  // Fractional / Sub-Unit Selection Modal
  const [fractionalModalProduct, setFractionalModalProduct] = useState<Product | null>(null);
  const [customFractionQtyStr, setCustomFractionQtyStr] = useState<string>('0.5');
  const [customFractionPriceStr, setCustomFractionPriceStr] = useState<string>('');

  // Sale Success Toast & Persistent Recent Receipt
  const [lastSale, setLastSale] = useState<CompletedSaleState | null>(null);
  const [recentReceipt, setRecentReceipt] = useState<CompletedSaleState | null>(null);
  const [successToastSecondsLeft, setSuccessToastSecondsLeft] = useState<number>(0);

  // Stepper / Price Override Sheet
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [overridePriceStr, setOverridePriceStr] = useState<string>('');

  // Held Cart Name Sheet
  const [isHoldCartModalOpen, setIsHoldCartModalOpen] = useState(false);
  const [holdCartLabel, setHoldCartLabel] = useState('');

  // Quick Action Sheet (+)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Receipt Modal
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [viewingReceiptData, setViewingReceiptData] = useState<CompletedSaleState | null>(null);

  // Void Transaction State
  const [saleToVoid, setSaleToVoid] = useState<{ sale: SaleHeader; items: SaleItem[] } | null>(null);
  const [voidSuccessToast, setVoidSuccessToast] = useState<string | null>(null);

  // Finalize Sale Animation State
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSaleSuccess, setIsSaleSuccess] = useState(false);

  // Credit Limit Warning Modal
  const [creditLimitModalData, setCreditLimitModalData] = useState<{
    customer: Customer;
    currentDebt: KES;
    creditLimit: KES;
    isOverdue: boolean;
  } | null>(null);

  // Live queries from Dexie
  const products = useLiveQuery(
    () => db.products.filter((p) => p.is_active && p.deleted_at === null).toArray(),
    []
  ) || [];

  const stocks = useLiveQuery(() => db.product_stock.toArray(), []) || [];
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stocks.forEach((s) => map.set(s.product_id, s.qty));
    return map;
  }, [stocks]);

  const heldCarts = useLiveQuery(
    () => db.held_carts.orderBy('created_at').reverse().toArray(),
    []
  ) || [];

  const customers = useLiveQuery(
    () => db.customers.filter((c) => c.deleted_at === null).toArray(),
    []
  ) || [];

  const totalSalesCount = useLiveQuery(() => db.sales.count(), []) || 0;

  // Filtered products ranked by prefix match
  const filteredProducts = useMemo(() => {
    const query = generateSearchKey(searchQuery);
    if (!query) {
      return [...products].sort((a, b) => {
        // Pinned products first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return (a.pin_order || 99) - (b.pin_order || 99);
      });
    }

    return products
      .filter((p) => p.search_key.includes(query))
      .sort((a, b) => {
        const aPrefix = a.search_key.startsWith(query) ? 0 : 1;
        const bPrefix = b.search_key.startsWith(query) ? 0 : 1;
        return aPrefix - bPrefix;
      });
  }, [products, searchQuery]);

  // Cart total calculation
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.lineTotalOverride != null) {
        return addKES(sum, item.lineTotalOverride);
      }
      const price = item.overridePrice ?? item.unitPrice;
      return addKES(sum, mulKES(price, item.qty));
    }, toKES(0));
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((count, item) => count + (item.qty >= 1 ? item.qty : 1), 0);
  }, [cart]);

  const cartCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.product.id, (map.get(item.product.id) || 0) + item.qty);
    }
    return map;
  }, [cart]);

  // Cash Change Calculation (perfect integer KES)
  const tenderedClean = cashTenderedInput.replace(/[^\d.]/g, '');
  const tenderedFloat = parseFloat(tenderedClean);
  const hasTendered = !isNaN(tenderedFloat) && tenderedFloat > 0;
  const cashTenderedKES = hasTendered ? toKES(tenderedFloat) : cartTotal;
  const changeAmountKES = hasTendered && cashTenderedKES >= cartTotal
    ? subKES(cashTenderedKES, cartTotal)
    : toKES(0);
  const isUnderpaid = hasTendered && cashTenderedKES < cartTotal;
  const shortageKES = isUnderpaid ? subKES(cartTotal, cashTenderedKES) : toKES(0);

  // Dynamic quick denomination suggestions
  const quickSuggestions = useMemo(() => {
    const list: number[] = [];
    if (cartTotal <= 0) return list;
    list.push(cartTotal); // Exact

    const next50 = Math.ceil(cartTotal / 50) * 50;
    if (next50 > cartTotal && !list.includes(next50)) list.push(next50);

    const next100 = Math.ceil(cartTotal / 100) * 100;
    if (next100 > cartTotal && !list.includes(next100)) list.push(next100);

    if (cartTotal < 200 && !list.includes(200)) list.push(200);
    if (cartTotal < 500 && !list.includes(500)) list.push(500);
    if (cartTotal < 1000 && !list.includes(1000)) list.push(1000);

    if (cartTotal >= 1000) {
      const next500 = Math.ceil(cartTotal / 500) * 500;
      if (next500 > cartTotal && !list.includes(next500)) list.push(next500);
      const next1000 = Math.ceil(cartTotal / 1000) * 1000;
      if (next1000 > cartTotal && !list.includes(next1000)) list.push(next1000);
    }
    return list;
  }, [cartTotal]);

  // Breakdown of notes/coins for change to ease attendant counting
  const changeBreakdown = useMemo(() => {
    if (changeAmountKES <= 0) return [];
    const denoms = [
      { val: 1000, label: '1,000' },
      { val: 500, label: '500' },
      { val: 200, label: '200' },
      { val: 100, label: '100' },
      { val: 50, label: '50' },
      { val: 20, label: '20' },
      { val: 10, label: '10' },
      { val: 5, label: '5' },
      { val: 1, label: '1' },
    ];
    const res: Array<{ label: string; count: number }> = [];
    let rem = Number(changeAmountKES);
    for (const d of denoms) {
      if (rem >= d.val) {
        const count = Math.floor(rem / d.val);
        res.push({ label: d.label, count });
        rem -= count * d.val;
      }
    }
    return res;
  }, [changeAmountKES]);

  // Auto-dismiss Sale Success Toast countdown
  useEffect(() => {
    if (successToastSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSuccessToastSecondsLeft((prev) => {
        if (prev <= 1) {
          setLastSale(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [successToastSecondsLeft]);

  // Add 1 whole product to cart or increment
  const addToCart = (product: Product) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === product.id && !item.portionLabel
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          qty: next[existingIndex].qty + 1,
        };
        return next;
      }
      return [
        ...prev,
        {
          product,
          qty: 1,
          unitPrice: product.selling_price,
        },
      ];
    });
  };

  // Add fractional / sub-unit portion to cart
  const addFractionalToCart = (
    product: Product,
    qty: number,
    price: KES,
    portionLabel?: string
  ) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(12);
    }

    const label = portionLabel || getFractionDisplay(qty, product.unit);

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === product.id && item.portionLabel === label
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        const existing = next[existingIndex];
        const newQty = Number((existing.qty + qty).toFixed(2));
        const newLineTotal = existing.lineTotalOverride != null
          ? addKES(existing.lineTotalOverride, price)
          : mulKES(price, newQty);

        next[existingIndex] = {
          ...existing,
          qty: newQty,
          lineTotalOverride: newLineTotal,
        };
        return next;
      }

      return [
        ...prev,
        {
          product,
          qty,
          unitPrice: price,
          lineTotalOverride: price,
          portionLabel: label,
        },
      ];
    });

    setFractionalModalProduct(null);
  };

  const handleProductCardClick = (product: Product) => {
    if (product.fractional_prices && product.fractional_prices.length > 0) {
      setFractionalModalProduct(product);
      setCustomFractionQtyStr('0.5');
      setCustomFractionPriceStr(String(Math.round(product.selling_price * 0.5)));
    } else {
      addToCart(product);
    }
  };

  const updateCartQty = (productId: string, delta: number, portionLabel?: string) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
    setCart((prev) => {
      const updated = prev
        .map((item) => {
          if (
            item.product.id === productId &&
            (portionLabel === undefined || item.portionLabel === portionLabel)
          ) {
            const nextQty = Number((item.qty + delta).toFixed(2));
            if (nextQty <= 0) return null;

            const newLineTotal = item.lineTotalOverride != null
              ? toKES(Math.round((item.lineTotalOverride / item.qty) * nextQty))
              : null;

            return { ...item, qty: nextQty, lineTotalOverride: newLineTotal };
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);

      if (updated.length === 0) {
        setIsPaymentSheetOpen(false);
      }
      return updated;
    });
  };

  // Deselect / Remove specific product or portion from cart
  const removeFromCart = (productId: string, portionLabel?: string) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(12);
    }
    setCart((prev) => {
      const updated = prev.filter(
        (item) =>
          !(
            item.product.id === productId &&
            (portionLabel === undefined || item.portionLabel === portionLabel)
          )
      );
      if (updated.length === 0) {
        setIsPaymentSheetOpen(false);
      }
      return updated;
    });
  };

  // Clear entire cart
  const clearCart = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(15);
    }
    setCart([]);
    setIsPaymentSheetOpen(false);
  };

  // Park Cart (Shikilia - Feature 4)
  const handleParkCart = async (label?: string) => {
    if (cart.length === 0) return;

    if (heldCarts.length >= 5) {
      alert('Umeshikilia mikokoteni 5 (kiwango cha juu). Kamilisha au futa mmoja kwanza.');
      return;
    }

    const defaultLabel = label?.trim() || `Mteja ${heldCarts.length + 1}`;
    const heldCart: HeldCart = {
      id: crypto.randomUUID(),
      shop_id: 'shop-active',
      device_id: 'device-active',
      shop_user_id: 'user-active',
      label: defaultLabel,
      items: cart.map((c) => ({
        product_id: c.product.id,
        product_name: c.product.name,
        qty: c.qty,
        unit_price: c.overridePrice ?? c.unitPrice,
        unit_cost: c.product.buying_price ?? toKES(0),
        image_emoji: c.product.image_emoji,
      })),
      total: cartTotal,
      created_at: serverNow(),
    };

    await db.held_carts.put(heldCart);
    setCart([]);
    setIsHoldCartModalOpen(false);
    setHoldCartLabel('');
  };

  const handleResumeCart = async (heldCart: HeldCart) => {
    // If active cart not empty, prompt to hold it first
    if (cart.length > 0) {
      const confirmSwap = window.confirm(t.holdThisCartPrompt);
      if (confirmSwap) {
        await handleParkCart();
      }
    }

    // Restore items, mapping to live products if available
    const restoredItems: CartItem[] = heldCart.items.map((it) => {
      const liveProduct = products.find((p) => p.id === it.product_id);
      return {
        product: liveProduct || {
          id: it.product_id,
          shop_id: 'shop-active',
          name: it.product_name,
          search_key: generateSearchKey(it.product_name),
          buying_price: it.unit_cost,
          selling_price: it.unit_price,
          low_limit: 5,
          unit: 'pcs',
          barcode: null,
          image_emoji: it.image_emoji || '📦',
          is_active: true,
          created_at: heldCart.created_at,
          updated_at: heldCart.created_at,
          deleted_at: null,
          device_id: 'device-active',
        },
        qty: it.qty,
        unitPrice: it.unit_price,
      };
    });

    setCart(restoredItems);
    await db.held_carts.delete(heldCart.id);
  };

  // Complete Sale
  const handleProceedToPayment = () => {
    if (cart.length === 0) return;
    setCashTenderedInput('');
    setIsPaymentSheetOpen(true);
  };

  const handleConfirmSale = async (overrideReason?: string) => {
    if (selectedPaymentMethod === 'cash' && isUnderpaid) {
      alert(
        language === 'en'
          ? `Cannot complete sale: Customer provided ${formatKES(cashTenderedKES)}, but total is ${formatKES(cartTotal)}. Still need ${formatKES(shortageKES)}.`
          : `Haiwezi kukamilisha: Mteja ametoa ${formatKES(cashTenderedKES)}, lakini jumla ni ${formatKES(cartTotal)}. Bado ${formatKES(shortageKES)}.`
      );
      return;
    }

    let customerData = null;

    if (selectedPaymentMethod === 'deni') {
      let cust = customers.find((c) => c.id === selectedCustomerId);

      if (!cust && newCustomerName.trim()) {
        customerData = {
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
        };
      } else if (cust) {
        customerData = {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
        };

        // Check Credit Limits (Feature 3) if no override reason supplied yet
        if (!overrideReason) {
          const debts = await db.debts
            .where('customer_id')
            .equals(cust.id)
            .filter((d) => d.status !== 'paid' && d.status !== 'written_off')
            .toArray();

          const outstanding = debts.reduce(
            (acc, d) => addKES(acc, subKES(d.principal, d.amount_paid)),
            toKES(0)
          );

          const limit = cust.credit_limit || toKES(3000);
          const isOverLimit = addKES(outstanding, cartTotal) > limit;

          // Check if any debt older than 30 days
          const now = Date.now();
          const isOverdue = debts.some(
            (d) => (now - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24) > 30
          );

          if (isOverLimit || (isOverdue && debts.length > 0)) {
            setCreditLimitModalData({
              customer: cust,
              currentDebt: outstanding,
              creditLimit: limit,
              isOverdue,
            });
            return;
          }
        }
      } else {
        alert('Tafadhali chagua au weka jina la mteja kwa ajili ya deni.');
        return;
      }
    }

    setIsFinalizing(true);
    try {
      const result = await recordSale({
        paymentMethod: selectedPaymentMethod,
        items: cart,
        customer: customerData,
        creditOverrideReason: overrideReason,
      });

      const saleRecord: CompletedSaleState = {
        sale: result.sale,
        items: result.items,
        customerName: customerData?.name,
        customerPhone: customerData?.phone || undefined,
        cashTendered: selectedPaymentMethod === 'cash' && hasTendered ? cashTenderedKES : undefined,
        changeAmount: selectedPaymentMethod === 'cash' && hasTendered && changeAmountKES > 0 ? changeAmountKES : undefined,
      };

      // Trigger subtle green checkmark animation & pulse effect on Finalize Sale button
      setIsSaleSuccess(true);
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([30, 40, 30]);
      }

      // Allow seller to experience the reassuring positive visual feedback
      setTimeout(() => {
        setLastSale(saleRecord);
        setRecentReceipt(saleRecord);
        setSuccessToastSecondsLeft(7); // Clean confirmation banner auto-dismisses after 7s

        // Reset cart and UI
        setCart([]);
        setCashTenderedInput('');
        setIsPaymentSheetOpen(false);
        setIsFinalizing(false);
        setIsSaleSuccess(false);
        setCreditLimitModalData(null);
        setSelectedCustomerId('');
        setNewCustomerName('');
        setNewCustomerPhone('');
      }, 700);
    } catch (err: any) {
      setIsFinalizing(false);
      setIsSaleSuccess(false);
      alert(`Kosa: ${err?.message || 'Haijawezekana kukamilisha mauzo'}`);
    }
  };

  const handleDirectWhatsAppShare = async (target?: CompletedSaleState | null) => {
    const saleTarget = target || lastSale || recentReceipt;
    if (!saleTarget) return;

    await shareReceipt({
      shopName,
      saleNo: saleTarget.sale.sale_no,
      date: saleTarget.sale.created_at,
      items: saleTarget.items.map((i) => ({
        name: i.product_name,
        qty: i.qty,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
      })),
      total: saleTarget.sale.total,
      paymentMethod: saleTarget.sale.payment_method,
      customerName: saleTarget.customerName,
      customerPhone: saleTarget.customerPhone,
      tillNumber,
      language,
      cashTendered: saleTarget.cashTendered,
      changeAmount: saleTarget.changeAmount,
    }, 'whatsapp');
  };

  const handleOpenRecentReceipt = (
    sale: SaleHeader,
    items: SaleItem[],
    customerName?: string,
    customerPhone?: string
  ) => {
    setViewingReceiptData({
      sale,
      items,
      customerName,
      customerPhone,
    });
    setIsReceiptModalOpen(true);
  };

  const handleConfirmVoidSale = async (saleId: string, reason: string) => {
    const success = await voidSale(saleId, reason);
    if (success) {
      if (lastSale?.sale.id === saleId) {
        setLastSale(null);
        setSuccessToastSecondsLeft(0);
      }
      if (recentReceipt?.sale.id === saleId) {
        setRecentReceipt(null);
      }
      if (viewingReceiptData?.sale.id === saleId) {
        setViewingReceiptData(null);
      }
      const saleNo = saleToVoid?.sale.sale_no;
      setVoidSuccessToast(
        language === 'en'
          ? `Sale #${saleNo ?? ''} was voided. Items returned to inventory stock.`
          : `Mauzo #${saleNo ?? ''} yamefutwa. Bidhaa zimerudishwa stoo.`
      );
      setTimeout(() => setVoidSuccessToast(null), 5000);
      setSaleToVoid(null);
    } else {
      alert(language === 'en' ? 'Failed to void transaction.' : 'Haijawezekana kughairi muamala.');
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Search Header Bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchDukaPlaceholder}
              className="w-full h-11 pl-9 pr-3 text-sm bg-slate-100 rounded-xl border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                {t.clearSearch}
              </button>
            )}
          </div>

          {/* Quick Last Receipt Button if a sale was made in this session */}
          {recentReceipt && (
            <button
              type="button"
              onClick={() => setIsReceiptModalOpen(true)}
              className="h-11 px-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 active:scale-95 transition flex items-center gap-1.5 text-xs font-black shrink-0"
              title={language === 'en' ? `Last Receipt #${recentReceipt.sale.sale_no}` : `Risiti #${recentReceipt.sale.sale_no}`}
            >
              <span className="text-base">🧾</span>
              <span className="hidden sm:inline">#{recentReceipt.sale.sale_no}</span>
            </button>
          )}

          {/* Quick Action (+) Button for Expenses, Products, Debts (§Feature 7) */}
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 active:bg-slate-200 border border-slate-200 flex items-center justify-center font-bold"
            title={t.quickAdd}
            aria-label={t.quickAdd}
          >
            <Plus className="w-5 h-5 text-emerald-700" />
          </button>
        </div>
      </div>

      <div className="p-4 flex-1">
        {/* Held Carts Strip (Feature 4 - Shikilia) */}
        <HeldCartsStrip
          heldCarts={heldCarts}
          onResumeCart={handleResumeCart}
          onDeleteHeldCart={(id) => db.held_carts.delete(id)}
        />

        {/* Quick Sell Row (Feature 2) */}
        <QuickSellRow
          products={products}
          onSelectProduct={addToCart}
          onTogglePin={async (p) => {
            await db.products.update(p.id, { is_pinned: !p.is_pinned });
          }}
          isSearchActive={searchQuery.trim().length > 0}
          totalHistoricalSales={totalSalesCount}
          cartCounts={cartCounts}
        />

        {/* 2-Column Product Grid or First Product Guide */}
        {products.length === 0 ? (
          <FirstProductGuide
            onOpenAddProduct={() => onNavigateToStock()}
            onSeedSampleCatalog={async () => {
              await seedKenyanCatalog(true);
            }}
            language={language}
          />
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 mt-2">
            <span className="text-4xl block mb-2">🔍</span>
            <div className="font-bold text-base text-slate-800">
              {t.noProductsFound}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {t.noMatchSubtitle(searchQuery)}
            </p>
            <Button
              variant="outline"
              size="md"
              onClick={() => setSearchQuery('')}
              className="mt-4"
            >
              {t.clearSearch}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const currentStock = stockMap.get(product.id) ?? 0;
              const isOutOfStock = currentStock <= 0;
              const isLowStock = currentStock <= product.low_limit && !isOutOfStock;
              const cartItem = cart.find((c) => c.product.id === product.id && !c.portionLabel);
              const fractionalCartItems = cart.filter((c) => c.product.id === product.id && Boolean(c.portionLabel));
              const hasFractional = Boolean(product.fractional_prices && product.fractional_prices.length > 0);

              return (
                <div
                  key={product.id}
                  onClick={() => handleProductCardClick(product)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (cartItem) {
                      setEditingItem(cartItem);
                      setOverridePriceStr(String(cartItem.overridePrice ?? cartItem.unitPrice));
                    } else if (hasFractional) {
                      setFractionalModalProduct(product);
                    }
                  }}
                  className={`bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex flex-col justify-between active:scale-[0.98] transition-all relative overflow-hidden cursor-pointer ${
                    isOutOfStock ? 'opacity-70 bg-slate-50/80' : ''
                  } ${cartItem || fractionalCartItems.length > 0 ? 'ring-2 ring-emerald-500 border-emerald-500' : ''}`}
                >
                  {/* Stock Alert Badge & Quick Deselect (Cancel All) */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xl">{product.image_emoji || '📦'}</span>
                      {(cartItem || fractionalCartItems.length > 0) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromCart(product.id);
                          }}
                          className="w-5 h-5 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 flex items-center justify-center transition active:scale-90"
                          title={language === 'en' ? 'Cancel all (Deselect)' : 'Ondoa zote kwenye kikapu'}
                        >
                          <X className="w-3 h-3 stroke-[3]" />
                        </button>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : isLowStock
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {isOutOfStock && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                      {isOutOfStock
                        ? '0 (Imeisha)'
                        : `${currentStock} ${product.unit}`}
                    </span>
                  </div>

                  {/* Name & Sub-Unit Pill Indicator */}
                  <div>
                    <div className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight mb-1">
                      {product.name}
                    </div>
                    {hasFractional && (
                      <div className="mb-2">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-300">
                          <span className="font-extrabold text-emerald-700">½</span>
                          {isEn ? '¼, ½, ¾ Sub-units' : 'Robo & Nusu'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Price & Interactive Stepper / Deselect Controls */}
                  <div className="flex items-center justify-between mt-auto pt-1 gap-1">
                    <div className="text-xs sm:text-sm font-black text-emerald-700 tabular-nums truncate">
                      {formatKES(product.selling_price)}
                    </div>

                    {cartItem ? (
                      <div
                        className="flex items-center bg-emerald-50 border border-emerald-300 rounded-xl p-0.5 shadow-2xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Cancel One Button (-) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartQty(product.id, -1);
                          }}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 flex items-center justify-center border border-slate-200 active:scale-90 transition font-bold"
                          title={language === 'en' ? 'Cancel one (-1)' : 'Punguza moja (-1)'}
                        >
                          <Minus className="w-3 h-3 stroke-[3]" />
                        </button>

                        {/* Current Quantity Badge */}
                        <span className="min-w-5 px-1 font-black text-xs text-emerald-950 tabular-nums text-center">
                          {cartItem.qty}
                        </span>

                        {/* Add More Button (+) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(product);
                          }}
                          className="w-6 h-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center active:scale-90 transition font-bold shadow-2xs"
                          title={language === 'en' ? 'Add one (+1)' : 'Ongeza moja (+1)'}
                        >
                          <Plus className="w-3 h-3 stroke-[3]" />
                        </button>
                      </div>
                    ) : hasFractional ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFractionalModalProduct(product);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 text-[11px] font-black shadow-2xs active:scale-95 transition"
                      >
                        <span>½</span>
                        <span>{isEn ? 'Portions' : 'Kipimo'}</span>
                      </button>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-700 flex items-center justify-center text-xs font-bold transition">
                        +
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Void Success Notification Toast */}
      {voidSuccessToast && (
        <div className="fixed top-16 left-4 right-4 z-40 max-w-[420px] mx-auto bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-in slide-in-from-top duration-200 border border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
              <RotateCcw className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xs font-bold text-slate-100">
              {voidSuccessToast}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVoidSuccessToast(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sale Confirmation Toast */}
      {lastSale && successToastSecondsLeft > 0 && (
        <div className="fixed bottom-24 left-4 right-4 z-40 max-w-[420px] mx-auto bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom duration-200 border border-slate-700/60">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
              <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-100 truncate">
                {t.soldToast(formatKES(lastSale.sale.total))}
              </div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1.5 flex-wrap">
                <span>{lastSale.sale.payment_method.toUpperCase()} · #{lastSale.sale.sale_no}</span>
                {lastSale.changeAmount && lastSale.changeAmount > 0 ? (
                  <span className="text-emerald-300 font-bold bg-emerald-900/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    {language === 'en' ? 'Change' : 'Chenji'}: {formatKES(lastSale.changeAmount)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick 1-tap WhatsApp button directly from the sale screen */}
            <button
              type="button"
              onClick={() => handleDirectWhatsAppShare(lastSale)}
              className="px-2.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold text-xs flex items-center gap-1 transition shadow-sm active:scale-95"
              title={language === 'en' ? 'Share receipt via WhatsApp' : 'Tuma risiti kupitia WhatsApp'}
            >
              <span>💬</span>
              <span>WhatsApp</span>
            </button>

            {/* Receipt Modal view/share */}
            <button
              type="button"
              onClick={() => setIsReceiptModalOpen(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              title={t.sendReceipt}
            >
              <Share2 className="w-4 h-4" />
            </button>

            {/* Dismiss confirmation */}
            <button
              type="button"
              onClick={() => {
                setLastSale(null);
                setSuccessToastSecondsLeft(0);
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={language === 'en' ? 'Dismiss' : 'Funga'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar ("Uza — KES {total}" + "Shikilia" + "Futa") */}
      {cart.length > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-30 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200">
          <div className="max-w-[420px] mx-auto flex items-center gap-2">
            {/* Clear Entire Cart Button */}
            <Button
              variant="outline"
              size="hero"
              onClick={clearCart}
              className="px-3 border-slate-300 text-slate-500 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50"
              title={language === 'en' ? 'Clear cart (Cancel all items)' : 'Safisha kikapu (Ghairi vyote)'}
            >
              <Trash2 className="w-5 h-5 text-slate-500 hover:text-rose-600" />
            </Button>

            {/* Park Cart (Shikilia) */}
            <Button
              variant="outline"
              size="hero"
              onClick={() => setIsHoldCartModalOpen(true)}
              className="px-3 border-slate-300 text-slate-700"
              title={t.holdCart}
            >
              <PauseCircle className="w-5 h-5 mr-1" />
              {t.holdCart}
            </Button>

            {/* Primary Sell Button */}
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              onClick={handleProceedToPayment}
              className="flex-1 flex items-center justify-between px-5"
            >
              <div className="text-left">
                <div className="text-[10px] font-semibold text-emerald-100 uppercase tracking-wider">
                  {t.sell} ({cartItemCount} {language === 'en' ? (cartItemCount === 1 ? 'item' : 'items') : (cartItemCount === 1 ? 'kitu' : 'vitu')})
                </div>
                <div className="text-xl font-black tabular-nums leading-none">
                  {formatKES(cartTotal)}
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
            </Button>
          </div>
        </div>
      )}

      {/* Payment Selection Sheet */}
      <Sheet
        isOpen={isPaymentSheetOpen}
        onClose={() => setIsPaymentSheetOpen(false)}
        title={t.completeSaleBtn}
        subtitle={`${language === 'en' ? 'Total Payment' : 'Jumla ya Malipo'}: ${formatKES(cartTotal)}`}
      >
        <div className="space-y-4 select-none">
          {/* Cart Items Summary with interactive Deselect & Stepper */}
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50 rounded-2xl p-2.5 text-xs text-slate-700 border border-slate-200">
            <div className="flex items-center justify-between pb-2 px-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>{language === 'en' ? 'Selected Products' : 'Bidhaa Zilizochaguliwa'}</span>
              <button
                type="button"
                onClick={clearCart}
                className="text-rose-600 hover:text-rose-700 flex items-center gap-1 font-bold text-[11px] hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Cancel All' : 'Ghairi Zote'}</span>
              </button>
            </div>

            {cart.map((item, idx) => {
              const itemTotal = item.lineTotalOverride != null
                ? item.lineTotalOverride
                : mulKES(item.overridePrice ?? item.unitPrice, item.qty);

              return (
                <div
                  key={`${item.product.id}-${item.portionLabel || 'full'}-${idx}`}
                  className="py-2 px-1 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <span>{item.product.name}</span>
                      {item.portionLabel && (
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md border border-emerald-300">
                          {item.portionLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {item.portionLabel
                        ? `${item.portionLabel} · Total: ${formatKES(itemTotal)}`
                        : `${formatKES(item.overridePrice ?? item.unitPrice)}/ea · Total: ${formatKES(itemTotal)}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Stepper to cancel one or add more */}
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQty(
                            item.product.id,
                            item.portionLabel ? -item.qty : -1,
                            item.portionLabel
                          )
                        }
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-rose-600 hover:bg-rose-50 font-bold active:scale-90 transition"
                        title={language === 'en' ? 'Cancel / Reduce' : 'Punguza'}
                      >
                        <Minus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <span className="min-w-6 px-1 text-center font-black text-xs tabular-nums text-slate-900">
                        {item.portionLabel ? 1 : item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQty(
                            item.product.id,
                            item.portionLabel ? item.qty : 1,
                            item.portionLabel
                          )
                        }
                        className="w-6 h-6 rounded flex items-center justify-center text-emerald-700 hover:bg-emerald-50 font-bold active:scale-90 transition"
                        title={language === 'en' ? 'Add (+1)' : 'Ongeza'}
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Cancel all button for this item */}
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id, item.portionLabel)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title={language === 'en' ? 'Cancel all of this item' : 'Ondoa bidhaa hii kabisa'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {language === 'en' ? 'Select Payment Method:' : 'Chagua Njia ya Malipo:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('cash')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedPaymentMethod === 'cash'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <Banknote className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-bold">{t.paymentCash}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('mpesa')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedPaymentMethod === 'mpesa'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <Smartphone className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-bold">{t.paymentMpesa}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('deni')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedPaymentMethod === 'deni'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <CreditCard className="w-6 h-6 text-amber-600" />
                <span className="text-xs font-bold">{t.paymentDeni}</span>
              </button>
            </div>
          </div>

          {/* M-Pesa Till Display (§12) */}
          {selectedPaymentMethod === 'mpesa' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                {language === 'en' ? 'Shop Till / Paybill' : 'Nambari ya Till ya Duka'}
              </span>
              <div className="text-3xl font-black text-emerald-950 tracking-wider">
                {tillNumber || '542190'}
              </div>
              <p className="text-[11px] text-emerald-700">
                {language === 'en'
                  ? <>Customer should send <strong>{formatKES(cartTotal)}</strong> to this Till.</>
                  : <>Mteja atume <strong>{formatKES(cartTotal)}</strong> kwa Till hii.</>}
              </p>
            </div>
          )}

          {/* Cash Received & Change Calculator */}
          {selectedPaymentMethod === 'cash' && (
            <div className="p-3.5 bg-emerald-50/80 border-2 border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 leading-tight">
                      {language === 'en' ? 'Cash Received & Change Calculator' : 'Pesa Alizotoa & Hesabu ya Chenji'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {language === 'en' ? 'Enter amount handed by customer' : 'Weka kiasi cha pesa alichotoa mteja'}
                    </div>
                  </div>
                </div>

                {cashTenderedInput && (
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput('')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs active:scale-95 transition"
                  >
                    {language === 'en' ? 'Clear / Exact' : 'Futa / Kamili'}
                  </button>
                )}
              </div>

              {/* Input for Cash Tendered */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                  <span className="text-xs font-black text-slate-500">KES</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={cashTenderedInput}
                  onChange={(e) => setCashTenderedInput(e.target.value)}
                  placeholder={`${cartTotal} (${language === 'en' ? 'Exact Amount' : 'Hela Kamili'})`}
                  className="w-full h-12 pl-12 pr-10 bg-white border-2 border-emerald-400 rounded-xl text-lg font-black text-slate-900 tracking-wide focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 shadow-inner"
                />
                {cashTenderedInput && (
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-black transition"
                    title={language === 'en' ? 'Clear amount' : 'Futa kiasi'}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Quick Denomination Chips */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Coins className="w-3 h-3 text-emerald-600" />
                  <span>{language === 'en' ? 'Quick Note / Coin Tap:' : 'Bonyeza Noti / Chenji Haraka:'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quickSuggestions.map((amt) => {
                    const isSelected = cashTenderedInput === String(amt);
                    const isExact = amt === cartTotal;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTenderedInput(String(amt))}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition active:scale-95 border ${
                          isSelected
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-500/30'
                            : isExact
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                        }`}
                      >
                        {isExact
                          ? `${language === 'en' ? 'Exact' : 'Kamili'} (${formatKES(amt)})`
                          : formatKES(amt)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Change Calculation Result */}
              {hasTendered ? (
                isUnderpaid ? (
                  <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 space-y-1 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-black">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{language === 'en' ? 'Insufficient Cash' : 'Pesa Hazitoshi (Pungufu)'}</span>
                      </span>
                      <span className="text-sm font-black tabular-nums text-rose-700">
                        -{formatKES(shortageKES)}
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-800 font-medium">
                      {language === 'en'
                        ? `Customer still needs to pay ${formatKES(shortageKES)} to cover the total of ${formatKES(cartTotal)}.`
                        : `Mteja anapaswa kuongeza ${formatKES(shortageKES)} kufikia jumla ya ${formatKES(cartTotal)}.`}
                    </p>
                  </div>
                ) : changeAmountKES > 0 ? (
                  <div className="p-3.5 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-xl shadow-md space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-emerald-200" />
                        <span>{language === 'en' ? 'Change To Return (Chenji):' : 'Chenji ya Kurudisha:'}</span>
                      </span>
                      <span className="text-2xl font-black tabular-nums tracking-wide text-white drop-shadow-xs">
                        {formatKES(changeAmountKES)}
                      </span>
                    </div>

                    {/* Breakdown of notes and coins */}
                    {changeBreakdown.length > 0 && (
                      <div className="pt-2 border-t border-emerald-500/60 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-emerald-100 font-bold text-[10px] uppercase">
                          {language === 'en' ? 'Give out:' : 'Toa:'}
                        </span>
                        {changeBreakdown.map((b) => (
                          <span
                            key={b.label}
                            className="px-2 py-0.5 rounded-lg bg-emerald-800/80 text-white font-mono font-bold text-[11px] border border-emerald-400/30 shadow-2xs"
                          >
                            {b.count}× KES {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-center text-xs font-bold text-slate-700">
                    ✓ {language === 'en' ? 'Exact Cash Amount — Change: KES 0' : 'Malipo Kamili ya Pesa Taslimu — Chenji: KES 0'}
                  </div>
                )
              ) : (
                <div className="p-2 bg-emerald-100/70 rounded-xl text-center text-[11px] text-emerald-800 font-semibold border border-emerald-200/60">
                  💡 {language === 'en' ? 'Exact payment selected by default. Type amount above if customer gives a larger note.' : 'Malipo kamili yamechaguliwa. Andika hapo juu kama mteja ametoa noti kubwa kupata chenji.'}
                </div>
              )}
            </div>
          )}

          {/* Deni Customer Selection (§Feature 3) */}
          {selectedPaymentMethod === 'deni' && (
            <div className="space-y-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {language === 'en' ? 'Customer on Credit:' : 'Mteja Anayedaiwa:'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none"
                >
                  <option value="">
                    {language === 'en' ? '-- Select Existing Customer --' : '-- Chagua Mteja Aliyepo --'}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedCustomerId && (
                <div className="space-y-2 pt-1 border-t border-amber-200/60">
                  <div className="text-[11px] font-bold text-slate-600">
                    {language === 'en' ? 'Or enter new customer details:' : 'Au andika jina la mteja mpya:'}
                  </div>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder={language === 'en' ? 'Customer Name (e.g., Mama Brian)...' : 'Jina la Mteja (Mfano: Mama Brian)...'}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder={language === 'en' ? 'Phone Number (Optional: 07...)' : 'Nambari ya Simu (Hiari: 07...)'}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Finalize Sale Button with subtle green checkmark animation & pulse */}
          {isSaleSuccess ? (
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={true}
              className="mt-2 bg-emerald-600 hover:bg-emerald-600 border-none ring-4 ring-emerald-300 shadow-xl transition-all duration-300 animate-success-pulse text-white font-black scale-[1.01]"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mr-2 animate-checkmark-pop">
                <Check className="w-5 h-5 text-white stroke-[3.5]" />
              </div>
              <span className="text-base font-black tracking-wide text-white animate-in fade-in zoom-in duration-200">
                {language === 'en' ? 'Sale Finalized! ✓' : 'Mauzo Yamekamilika! ✓'}
              </span>
            </Button>
          ) : isFinalizing ? (
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={true}
              className="mt-2 opacity-95 cursor-wait"
            >
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2.5" />
              <span className="text-base font-bold">
                {language === 'en' ? 'Finalizing Sale...' : 'Inakamilisha Mauzo...'}
              </span>
            </Button>
          ) : (
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={selectedPaymentMethod === 'cash' && isUnderpaid}
              onClick={() => handleConfirmSale()}
              className="mt-2 active:scale-95 transition-all"
            >
              <Check className="w-5 h-5 mr-1.5 stroke-[2.5]" />
              {selectedPaymentMethod === 'cash' && isUnderpaid
                ? language === 'en'
                  ? `Insufficient Cash (Need ${formatKES(shortageKES)} more)`
                  : `Pesa Zimepungua (Bado ${formatKES(shortageKES)})`
                : selectedPaymentMethod === 'cash' && hasTendered && changeAmountKES > 0
                ? language === 'en'
                  ? `Finalize Sale (Change: ${formatKES(changeAmountKES)})`
                  : `Kamilisha Mauzo (Chenji: ${formatKES(changeAmountKES)})`
                : language === 'en'
                ? 'Finalize Sale'
                : 'Kamilisha Mauzo'}
            </Button>
          )}
        </div>
      </Sheet>

      {/* Credit Limit Modal */}
      {creditLimitModalData && (
        <CustomerCreditLimitModal
          isOpen={true}
          onClose={() => setCreditLimitModalData(null)}
          customerName={creditLimitModalData.customer.name}
          currentDebt={creditLimitModalData.currentDebt}
          cartTotal={cartTotal}
          creditLimit={creditLimitModalData.creditLimit}
          isOverdue={creditLimitModalData.isOverdue}
          userRole={userRole}
          language={language}
          onPayCash={() => {
            setSelectedPaymentMethod('cash');
            setCreditLimitModalData(null);
          }}
          onOwnerOverride={(reason) => {
            handleConfirmSale(reason);
          }}
        />
      )}

      {/* Hold Cart Name Modal */}
      <Sheet
        isOpen={isHoldCartModalOpen}
        onClose={() => setIsHoldCartModalOpen(false)}
        title={language === 'en' ? 'Hold Current Cart' : 'Shikilia Mkokoteni'}
        subtitle={
          language === 'en'
            ? 'Serving next customer? Hold this cart to resume later.'
            : 'Mteja anaenda kutafuta pesa? Shikilia ili uhudumie mwingine.'
        }
      >
        <div className="space-y-4">
          <input
            type="text"
            value={holdCartLabel}
            onChange={(e) => setHoldCartLabel(e.target.value)}
            placeholder={
              language === 'en'
                ? `Customer name (or "Customer ${heldCarts.length + 1}")...`
                : `Jina la mteja (au "Mteja ${heldCarts.length + 1}")...`
            }
            className="w-full h-12 px-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500"
            autoFocus
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setIsHoldCartModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              onClick={() => handleParkCart(holdCartLabel)}
            >
              {t.holdCart}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Quick Add Header Sheet (+) */}
      <QuickAddActionSheet
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onOpenNewProduct={onNavigateToStock}
        onOpenNewDeni={onNavigateToDeni}
        language={language}
        onExpenseSaved={(title, amount) => {
          if (typeof window !== 'undefined') {
            window.alert(
              language === 'en'
                ? `Expense of ${formatKES(amount)} (${title}) recorded successfully!`
                : `Matumizi ya ${formatKES(amount)} (${title}) yamerekodiwa!`
            );
          }
        }}
      />

      {/* Void Sale Confirmation Modal */}
      <VoidSaleModal
        isOpen={Boolean(saleToVoid)}
        onClose={() => setSaleToVoid(null)}
        sale={saleToVoid?.sale ?? null}
        items={saleToVoid?.items ?? []}
        language={language}
        onConfirmVoid={handleConfirmVoidSale}
      />

      {/* Text Receipt Modal (Feature 5) */}
      {(viewingReceiptData || lastSale || recentReceipt) && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setIsReceiptModalOpen(false);
            setViewingReceiptData(null);
          }}
          sale={(viewingReceiptData || lastSale || recentReceipt)!.sale}
          items={(viewingReceiptData || lastSale || recentReceipt)!.items}
          shopName={shopName}
          tillNumber={tillNumber}
          customerName={(viewingReceiptData || lastSale || recentReceipt)!.customerName}
          customerPhone={(viewingReceiptData || lastSale || recentReceipt)!.customerPhone}
          cashTendered={(viewingReceiptData || lastSale || recentReceipt)!.cashTendered}
          changeAmount={(viewingReceiptData || lastSale || recentReceipt)!.changeAmount}
          language={language}
        />
      )}

      {/* Fractional / Sub-Unit Portion Selection Sheet */}
      {fractionalModalProduct && (
        <Sheet
          isOpen={true}
          onClose={() => setFractionalModalProduct(null)}
          title={isEn ? 'Select Portion & Price' : 'Chagua Kipimo na Bei'}
          subtitle={`${fractionalModalProduct.image_emoji || '📦'} ${fractionalModalProduct.name} · ${isEn ? 'Full' : 'Nzima'}: ${formatKES(fractionalModalProduct.selling_price)} / ${fractionalModalProduct.unit}`}
        >
          <div className="space-y-4 select-none">
            {/* Quick 1-Tap Preset Portions */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                {isEn ? 'Quick Portion Presets:' : 'Vipimo vya Haraka:'}
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {fractionalModalProduct.fractional_prices?.map((fp, idx) => {
                  const label = getFractionDisplay(fp.qty, fractionalModalProduct.unit);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        addFractionalToCart(
                          fractionalModalProduct,
                          fp.qty,
                          fp.price,
                          label
                        )
                      }
                      className="p-3.5 bg-emerald-50/80 hover:bg-emerald-100/80 active:scale-95 border-2 border-emerald-300 rounded-2xl flex flex-col items-start justify-between gap-2 text-left transition shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                            {fp.qty === 0.25 ? '¼' : fp.qty === 0.5 ? '½' : fp.qty === 0.75 ? '¾' : '½'}
                          </span>
                          <span>{label}</span>
                        </span>
                      </div>
                      <div className="text-base font-black text-emerald-800 tabular-nums">
                        {formatKES(fp.price)}
                      </div>
                    </button>
                  );
                })}

                {/* 1 Whole Unit option */}
                <button
                  type="button"
                  onClick={() => {
                    addToCart(fractionalModalProduct);
                    setFractionalModalProduct(null);
                  }}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100 active:scale-95 border-2 border-slate-300 rounded-2xl flex flex-col items-start justify-between gap-2 text-left transition shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-slate-700 text-white flex items-center justify-center text-[10px] font-black">
                        1
                      </span>
                      <span>1.0 {fractionalModalProduct.unit} ({isEn ? 'Full Unit' : 'Nzima'})</span>
                    </span>
                  </div>
                  <div className="text-base font-black text-slate-900 tabular-nums">
                    {formatKES(fractionalModalProduct.selling_price)}
                  </div>
                </button>
              </div>
            </div>

            {/* Custom Decimal Portion & Price Section */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-emerald-600" />
                  <span>{isEn ? 'Or Enter Custom Quantity & Price:' : 'Au Weka Kipimo na Bei Yoyote:'}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    {isEn ? `Quantity (${fractionalModalProduct.unit}):` : `Idadi (${fractionalModalProduct.unit}):`}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.01"
                    value={customFractionQtyStr}
                    onChange={(e) => {
                      const qStr = e.target.value;
                      setCustomFractionQtyStr(qStr);
                      const qNum = Number(qStr);
                      if (qNum > 0) {
                        setCustomFractionPriceStr(
                          String(Math.round(fractionalModalProduct.selling_price * qNum))
                        );
                      }
                    }}
                    placeholder="0.5"
                    className="w-full h-11 px-3 text-sm font-black bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    {isEn ? 'Total Price (KES):' : 'Bei ya Kuuza (KES):'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={customFractionPriceStr}
                    onChange={(e) => setCustomFractionPriceStr(e.target.value)}
                    placeholder="KES"
                    className="w-full h-11 px-3 text-sm font-black text-emerald-800 bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <Button
                variant="gradient"
                size="md"
                fullWidth
                disabled={
                  !customFractionQtyStr ||
                  Number(customFractionQtyStr) <= 0 ||
                  !customFractionPriceStr ||
                  Number(customFractionPriceStr) <= 0
                }
                onClick={() => {
                  const q = Number(customFractionQtyStr);
                  const p = toKES(Number(customFractionPriceStr));
                  const label = `${q} ${fractionalModalProduct.unit}`;
                  addFractionalToCart(fractionalModalProduct, q, p, label);
                }}
              >
                <Check className="w-4 h-4 mr-1.5" />
                {isEn
                  ? `Add ${customFractionQtyStr || 0} ${fractionalModalProduct.unit} for KES ${customFractionPriceStr || 0}`
                  : `Weka ${customFractionQtyStr || 0} ${fractionalModalProduct.unit} kwa KES ${customFractionPriceStr || 0}`}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
};
