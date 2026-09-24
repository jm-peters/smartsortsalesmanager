import React, { useState, useEffect } from 'react';
import { AlertTriangle, RotateCcw, PackageCheck, Banknote, ShieldAlert } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES } from '../lib/money';
import type { SaleHeader, SaleItem } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface VoidSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleHeader | null;
  items: SaleItem[];
  language?: Language;
  onConfirmVoid: (saleId: string, reason: string) => Promise<void>;
}

export const VoidSaleModal: React.FC<VoidSaleModalProps> = ({
  isOpen,
  onClose,
  sale,
  items,
  language = 'en',
  onConfirmVoid,
}) => {
  const isEn = language === 'en';
  const defaultReason = isEn ? 'Mistake during entry' : 'Makosa ya kuingiza';
  const [reason, setReason] = useState(defaultReason);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason(isEn ? 'Mistake during entry' : 'Makosa ya kuingiza');
      setIsSubmitting(false);
    }
  }, [isOpen, isEn]);

  if (!sale) return null;

  const quickReasons = isEn
    ? [
        'Mistake during entry',
        'Customer changed mind',
        'Wrong item or price',
        'Customer cancelled / walked away',
        'Goods returned',
      ]
    : [
        'Makosa ya kuingiza',
        'Mteja alibadili nia',
        'Bidhaa au bei si sahihi',
        'Mteja ameghairi / ameondoka',
        'Bidhaa zimerudishwa',
      ];

  const totalItemsCount = items.reduce((acc, it) => acc + it.qty, 0);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmVoid(sale.id, reason.trim() || defaultReason);
      onClose();
    } catch (err) {
      console.error('Failed to void sale:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? `Void Sale #${sale.sale_no}` : `Ghairi Mauzo #${sale.sale_no}`}
      subtitle={`${isEn ? 'Total' : 'Jumla'}: ${formatKES(sale.total)} · ${sale.payment_method.toUpperCase()}`}
    >
      <div className="space-y-4 select-none pb-2">
        {/* Warning Banner */}
        <div className="p-3.5 bg-rose-50 border-2 border-rose-200 rounded-2xl flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 stroke-[2.5]" />
          </div>
          <div className="text-xs text-rose-950 space-y-1">
            <p className="font-extrabold text-rose-900 text-sm">
              {isEn
                ? 'Are you sure you want to void this transaction?'
                : 'Una uhakika unataka kughairi muamala huu?'}
            </p>
            <p className="text-rose-800 leading-relaxed font-medium">
              {isEn
                ? 'This action will reverse the sale, return stock to inventory, and log this change in the audit trail.'
                : 'Hatua hii itabatilisha mauzo, kurudisha bidhaa stoo, na kurekodi sababu hii kwenye kumbukumbu za ukaguzi.'}
            </p>
          </div>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 border-b border-slate-200 pb-2">
            <span className="flex items-center gap-1.5 text-slate-800">
              <PackageCheck className="w-4 h-4 text-emerald-600" />
              <span>
                {isEn ? 'Restocking Items' : 'Bidhaa Zitakazorudishwa'}{' '}
                <span className="text-slate-500 font-normal">
                  ({totalItemsCount} {totalItemsCount === 1 ? (isEn ? 'item' : 'kitu') : (isEn ? 'items' : 'vitu')})
                </span>
              </span>
            </span>
            <span className="text-slate-900 font-black">{formatKES(sale.total)}</span>
          </div>

          {/* List of items */}
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="text-xs text-slate-500 py-1 italic">
                {isEn ? 'Sale items loading or recorded' : 'Vipengee vya mauzo vinarekodiwa'}
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs pt-1">
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-slate-800">{item.qty}×</span>{' '}
                    <span className="text-slate-700">{item.product_name}</span>
                  </div>
                  <span className="font-bold text-slate-800 tabular-nums shrink-0">
                    {formatKES(item.line_total)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-slate-500" />
              <span>{isEn ? 'Payment Method:' : 'Njia ya Malipo:'}</span>
            </span>
            <span className="font-bold uppercase text-slate-800">{sale.payment_method}</span>
          </div>
        </div>

        {/* Reason for Voiding */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">
            {isEn ? 'Reason for voiding:' : 'Sababu ya kughairi:'}
          </label>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {quickReasons.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => setReason(qr)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-xl transition active:scale-95 border ${
                  reason === qr
                    ? 'bg-rose-100 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {qr}
              </button>
            ))}
          </div>

          {/* Text Input */}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isEn ? 'Enter custom reason...' : 'Weka sababu maalum...'}
            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <Button
            variant="danger"
            size="hero"
            fullWidth
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="flex items-center justify-center gap-2 shadow-md bg-rose-600 hover:bg-rose-700 text-white"
          >
            <RotateCcw className="w-5 h-5" />
            <span>
              {isSubmitting
                ? isEn
                  ? 'Voiding Sale...'
                  : 'Inaghairi Mauzo...'
                : isEn
                ? `Confirm Void (Sale #${sale.sale_no})`
                : `Thibitisha Kughairi (#${sale.sale_no})`}
            </span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={onClose}
            className="border-slate-200 text-slate-600"
          >
            {isEn ? 'Cancel / Keep Sale' : 'Ghairi / Hifadhi Mauzo'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
