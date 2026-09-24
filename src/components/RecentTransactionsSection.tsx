import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  History,
  RotateCcw,
  Receipt,
  Banknote,
  Smartphone,
  BookOpen,
  CheckCircle2,
  Ban,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { db, type SaleHeader, type SaleItem, type UserRole } from '../lib/db/local';
import { formatKES } from '../lib/money';
import type { Language } from '../lib/i18n';

interface RecentTransactionsSectionProps {
  language?: Language;
  userRole?: UserRole;
  defaultExpanded?: boolean;
  allowVoid?: boolean;
  onOpenReceipt: (
    sale: SaleHeader,
    items: SaleItem[],
    customerName?: string,
    customerPhone?: string
  ) => void;
  onOpenVoidModal?: (sale: SaleHeader, items: SaleItem[]) => void;
}

export const RecentTransactionsSection: React.FC<RecentTransactionsSectionProps> = ({
  language = 'en',
  defaultExpanded = true,
  allowVoid = true,
  onOpenReceipt,
  onOpenVoidModal,
}) => {
  const isEn = language === 'en';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Fetch the last 5 sales (both completed and voided for full audit transparency)
  const recentSales = useLiveQuery(
    () => db.sales.orderBy('created_at').reverse().limit(5).toArray(),
    []
  ) || [];

  // Fetch sale items corresponding to the last 5 sales
  const saleIds = useMemo(() => recentSales.map((s) => s.id), [recentSales]);
  const saleItems = useLiveQuery(
    async () => {
      if (saleIds.length === 0) return [];
      return await db.sale_items.where('sale_id').anyOf(saleIds).toArray();
    },
    [saleIds]
  ) || [];

  // Group items by sale_id
  const itemsBySaleId = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of saleItems) {
      const list = map.get(item.sale_id) || [];
      list.push(item);
      map.set(item.sale_id, list);
    }
    return map;
  }, [saleItems]);

  // Fetch customer debts to display customer names for credit (Deni) sales
  const debts = useLiveQuery(() => db.debts.toArray(), []) || [];
  const debtMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string }>();
    for (const d of debts) {
      map.set(d.id, { name: d.customer_name, phone: d.customer_phone || undefined });
      if (d.sale_id) {
        map.set(d.sale_id, { name: d.customer_name, phone: d.customer_phone || undefined });
      }
    }
    return map;
  }, [debts]);

  // Helper for human-friendly time display
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return isEn ? 'Just now' : 'Sasa hivi';
      if (diffMins < 60) return isEn ? `${diffMins}m ago` : `Dk ${diffMins} zilizopita`;

      const isToday = d.toDateString() === now.toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      if (isToday) return isEn ? `Today, ${timeStr}` : `Leo, ${timeStr}`;

      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${dateStr}, ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  if (recentSales.length === 0) {
    if (!defaultExpanded) {
      return (
        <div className="mt-4 p-4 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
          {isEn ? 'No recent transactions to display.' : 'Hakuna miamala ya hivi karibuni ya kuonyesha.'}
        </div>
      );
    }
    return null; // Keep screen ultra-clean until at least one sale exists
  }

  return (
    <div className="mt-4 select-none">
      {/* Section Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs cursor-pointer hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                {isEn ? 'Recent Transactions' : 'Miamala ya Hivi Karibuni'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-extrabold text-[10px]">
                {isEn ? `Last ${recentSales.length}` : `${recentSales.length} za Mwisho`}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {isExpanded
                ? isEn
                  ? 'Showing last 5 sales · Tap to collapse'
                  : 'Mauzo 5 ya mwisho · Gonga kufunga'
                : isEn
                ? 'Tap to expand & view last 5 sales'
                : 'Gonga kufungua na kutazama mauzo 5 ya mwisho'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Transactions List */}
      {isExpanded && (
        <div className="mt-2.5 space-y-2.5 animate-in fade-in duration-200">
          {recentSales.map((sale) => {
            const items = itemsBySaleId.get(sale.id) || [];
            const isVoid = sale.status === 'void';
            const debtInfo = sale.debt_id ? debtMap.get(sale.debt_id) : debtMap.get(sale.id);
            const customerName = debtInfo?.name;
            const customerPhone = debtInfo?.phone;

            return (
              <div
                key={sale.id}
                className={`bg-white rounded-2xl p-3.5 border transition-all shadow-xs ${
                  isVoid
                    ? 'border-rose-200 bg-rose-50/30 opacity-85'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header row: Sale #, Status badge, and Total */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 tracking-tight">
                      #{sale.sale_no}
                    </span>

                    {/* Status Badge */}
                    {isVoid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider border border-rose-200">
                        <Ban className="w-3 h-3 text-rose-600" />
                        <span>{isEn ? 'Voided' : 'Imeghairiwa'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{isEn ? 'Completed' : 'Imekamilika'}</span>
                      </span>
                    )}

                    {/* Payment Method Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        sale.payment_method === 'cash'
                          ? 'bg-slate-100 text-slate-700'
                          : sale.payment_method === 'mpesa'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {sale.payment_method === 'cash' ? (
                        <Banknote className="w-3 h-3 text-slate-600" />
                      ) : sale.payment_method === 'mpesa' ? (
                        <Smartphone className="w-3 h-3 text-blue-600" />
                      ) : (
                        <BookOpen className="w-3 h-3 text-amber-600" />
                      )}
                      <span>
                        {sale.payment_method === 'deni' && customerName
                          ? customerName
                          : sale.payment_method}
                      </span>
                    </span>
                  </div>

                  {/* Total Amount */}
                  <div className="text-right">
                    <div
                      className={`text-base font-black tabular-nums ${
                        isVoid ? 'text-rose-900 line-through' : 'text-slate-900'
                      }`}
                    >
                      {formatKES(sale.total)}
                    </div>
                  </div>
                </div>

                {/* Subtitle row: Time & Item count */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <div className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(sale.created_at)}</span>
                  </div>

                  <span className="font-semibold text-slate-600">
                    {sale.item_count} {sale.item_count === 1 ? (isEn ? 'item' : 'kitu') : (isEn ? 'items' : 'vitu')}
                  </span>
                </div>

                {/* Items Summary Preview */}
                {items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {items.map((it, idx) => (
                      <span key={it.id}>
                        <strong className="text-slate-800 font-bold">{it.qty}×</strong>{' '}
                        <span>{it.product_name}</span>
                        {idx < items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Void details if voided */}
                {isVoid && sale.void_reason && (
                  <div className="mt-2 p-2 rounded-xl bg-rose-50/80 border border-rose-200 text-[11px] text-rose-800 space-y-0.5">
                    <span className="font-bold">{isEn ? 'Void reason:' : 'Sababu ya kughairi:'}</span>{' '}
                    <span>{sale.void_reason}</span>
                    {sale.voided_at && (
                      <span className="block text-[10px] text-rose-600">
                        {formatTime(sale.voided_at)}
                      </span>
                    )}
                  </div>
                )}

                {/* Action Buttons Row */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  {/* View / Print Receipt */}
                  <button
                    type="button"
                    onClick={() => onOpenReceipt(sale, items, customerName, customerPhone)}
                    className="flex-1 h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition flex items-center justify-center gap-1.5 text-xs font-bold"
                    title={isEn ? 'View or share receipt' : 'Tazama au tuma risiti'}
                  >
                    <Receipt className="w-3.5 h-3.5 text-slate-600" />
                    <span>{isEn ? 'Receipt' : 'Risiti'}</span>
                  </button>

                  {/* Void Transaction Button */}
                  {allowVoid && onOpenVoidModal && (
                    !isVoid ? (
                      <button
                        type="button"
                        onClick={() => onOpenVoidModal(sale, items)}
                        className="h-9 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 active:scale-95 transition flex items-center justify-center gap-1.5 text-xs font-black shadow-2xs"
                        title={isEn ? 'Void sale and reverse stock' : 'Ghairi mauzo na urudishe bidhaa stoo'}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-rose-600 stroke-[2.5]" />
                        <span>{isEn ? 'Void' : 'Ghairi'}</span>
                      </button>
                    ) : (
                      <span className="h-9 px-3 rounded-xl bg-slate-50 text-slate-400 text-xs font-semibold flex items-center justify-center border border-slate-200 cursor-not-allowed">
                        {isEn ? 'Voided' : 'Imeghairiwa'}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
