import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  ArrowRight,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Truck,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import {
  toKES,
  formatKES,
  mulKES,
  addKES,
  type KES,
} from '../lib/money';
import {
  recordSingleProductRestock,
  type Product,
} from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface SingleProductRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  currentStock: number;
  language?: Language;
  onRestockSuccess?: (newStock: number, qtyAdded: number) => void;
}

export const SingleProductRestockModal: React.FC<SingleProductRestockModalProps> = ({
  isOpen,
  onClose,
  product,
  currentStock,
  language = 'en',
  onRestockSuccess,
}) => {
  const isEn = language === 'en';

  const [qtyToAddStr, setQtyToAddStr] = useState('10');
  const [unitCostStr, setUnitCostStr] = useState('');
  const [sellingPriceStr, setSellingPriceStr] = useState('');
  const [recordExpense, setRecordExpense] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [supplierNote, setSupplierNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (product) {
      setQtyToAddStr(product.pack_size ? String(product.pack_size) : '10');
      setUnitCostStr(
        product.buying_price && product.buying_price > 0
          ? String(product.buying_price)
          : ''
      );
      setSellingPriceStr(String(product.selling_price || ''));
      setRecordExpense(false);
      setPaymentMethod('cash');
      setSupplierNote('');
      setErrorMsg('');
    }
  }, [product, isOpen]);

  if (!product) return null;

  const qtyToAdd = Number(qtyToAddStr) || 0;
  const unitCostNum = Number(unitCostStr) || 0;
  const unitCostKES = unitCostNum > 0 ? toKES(unitCostNum) : (product.buying_price ?? toKES(0));
  const newSellingPriceNum = Number(sellingPriceStr) || 0;
  const newSellingPriceKES = newSellingPriceNum > 0 ? toKES(newSellingPriceNum) : product.selling_price;
  const newProjectedStock = Math.max(0, currentStock + qtyToAdd);
  const totalSpend = qtyToAdd > 0 && unitCostNum > 0 ? mulKES(toKES(unitCostNum), qtyToAdd) : toKES(0);

  const handleQuickPreset = (amount: number) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(8);
    }
    setQtyToAddStr(String(amount));
  };

  const handleIncrement = (amount: number) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(8);
    }
    const current = Number(qtyToAddStr) || 0;
    setQtyToAddStr(String(Math.max(1, current + amount)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyToAdd <= 0) {
      setErrorMsg(isEn ? 'Please enter a valid quantity greater than 0.' : 'Weka idadi sahihi ya kuongeza.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const result = await recordSingleProductRestock({
        productId: product.id,
        qtyToAdd,
        unitCost: unitCostNum > 0 ? toKES(unitCostNum) : null,
        newSellingPrice: newSellingPriceNum > 0 ? toKES(newSellingPriceNum) : null,
        paymentMethod: recordExpense ? paymentMethod : 'none',
        recordAsExpense: recordExpense,
        supplierNote: supplierNote.trim() || null,
      });

      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([15, 50, 15]);
      }

      onRestockSuccess?.(result.newStock, qtyToAdd);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Could not save restock.' : 'Imeshindwa kuongeza stock.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? `Restock ${product.name}` : `Ongeza Mzigo: ${product.name}`}
      subtitle={
        isEn
          ? `Current stock: ${currentStock} ${product.unit}`
          : `Stock iliyopo: ${currentStock} ${product.unit}`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 select-none pt-1">
        {/* Product Snapshot Header */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{product.image_emoji || '📦'}</span>
            <div>
              <div className="font-bold text-sm text-slate-900">{product.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>{isEn ? 'Selling:' : 'Kuuza:'} <strong className="text-emerald-700">{formatKES(product.selling_price)}</strong></span>
                {product.buying_price && product.buying_price > 0 && (
                  <span>• {isEn ? 'Cost:' : 'Gharama:'} {formatKES(product.buying_price)}</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-xs font-black px-2.5 py-1 rounded-full tabular-nums inline-block ${
                currentStock <= 0
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : currentStock <= product.low_limit
                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {currentStock <= 0 ? '0 (Out of stock)' : `${currentStock} ${product.unit}`}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Quantity to Add with Quick Presets */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            {isEn ? 'Quantity to Add (Units):' : 'Idadi ya Kuongeza (Vipande/Kilo):'} *
          </label>
          <div className="relative flex items-center">
            <input
              type="number"
              min="1"
              step="any"
              value={qtyToAddStr}
              onChange={(e) => setQtyToAddStr(e.target.value)}
              placeholder="e.g. 10"
              className="w-full h-12 px-3 text-lg font-black text-slate-900 bg-white border-2 border-emerald-500/80 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 tabular-nums"
              required
            />
            <span className="absolute right-4 text-xs font-bold text-slate-400">
              {product.unit}
            </span>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar py-0.5">
            {[1, 5, 10, 20, 50].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleIncrement(preset)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition shrink-0"
              >
                +{preset}
              </button>
            ))}
            {product.pack_size && product.pack_size > 1 && (
              <button
                key="pack"
                type="button"
                onClick={() => handleQuickPreset(product.pack_size!)}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black active:scale-95 transition shrink-0"
              >
                1 Pack ({product.pack_size})
              </button>
            )}
          </div>
        </div>

        {/* Cost & Selling Price Adjustments */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {isEn ? 'Buying Cost / Unit (KES):' : 'Bei ya Kununua (KES):'}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={unitCostStr}
              onChange={(e) => setUnitCostStr(e.target.value)}
              placeholder="e.g. 150"
              className="w-full h-10 px-3 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {isEn ? 'Selling Price / Unit (KES):' : 'Bei ya Kuuza (KES):'}
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={sellingPriceStr}
              onChange={(e) => setSellingPriceStr(e.target.value)}
              placeholder="e.g. 180"
              className="w-full h-10 px-3 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>

        {/* Record as Business Expense Toggle */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>💸</span>
              <span>{isEn ? 'Record as Cash / M-Pesa Expense?' : 'Rekodi kama matumizi dukani?'}</span>
            </span>
            <input
              type="checkbox"
              checked={recordExpense}
              onChange={(e) => setRecordExpense(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </label>

          {recordExpense && (
            <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2 animate-in fade-in">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Cash Till</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('mpesa')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  paymentMethod === 'mpesa'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>M-Pesa</span>
              </button>
            </div>
          )}
        </div>

        {/* Optional Supplier Note */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            {isEn ? 'Supplier / Note (Optional):' : 'Jina la Muuzaji / Kumbukumbu (Hiari):'}
          </label>
          <input
            type="text"
            value={supplierNote}
            onChange={(e) => setSupplierNote(e.target.value)}
            placeholder={isEn ? 'e.g. Kamau Wholesalers, Invoice #482' : 'mfano Kamau Wholesalers'}
            className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Live Calculation Preview Banner */}
        <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn ? 'New Stock Total' : 'Stock Mpya Baadaye'}
            </div>
            <div className="font-black text-slate-900 text-sm flex items-center gap-1.5 mt-0.5">
              <span>{currentStock}</span>
              <ArrowRight className="w-3 h-3 text-emerald-600" />
              <span className="text-emerald-700 font-extrabold text-base">
                {newProjectedStock} {product.unit}
              </span>
            </div>
          </div>

          {totalSpend > 0 && (
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {isEn ? 'Total Spend' : 'Jumla ya Gharama'}
              </div>
              <div className="font-black text-emerald-900 text-sm mt-0.5">
                {formatKES(totalSpend)}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" size="md" onClick={onClose} disabled={saving}>
            {isEn ? 'Cancel' : 'Ghairi'}
          </Button>
          <Button
            type="submit"
            variant="gradient"
            size="md"
            fullWidth
            disabled={saving || qtyToAdd <= 0}
            className="font-bold flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {saving
                ? (isEn ? 'Saving...' : 'Inahifadhi...')
                : (isEn ? `Add +${qtyToAdd} to Stock` : `Ongeza +${qtyToAdd} kwenye Stock`)}
            </span>
          </Button>
        </div>
      </form>
    </Sheet>
  );
};
