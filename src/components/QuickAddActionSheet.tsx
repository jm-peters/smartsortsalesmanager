import React, { useState } from 'react';
import { Plus, ArrowDownRight, UserPlus, AlertCircle } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { NumPad } from './NumPad';
import { toKES, formatKES, type KES } from '../lib/money';
import { recordExpense, type ExpenseCategory } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface QuickAddActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewProduct: () => void;
  onOpenNewDeni: () => void;
  onExpenseSaved: (title: string, amount: KES) => void;
  language?: Language;
}

const CATEGORIES_EN: Array<{ id: ExpenseCategory; label: string; icon: string }> = [
  { id: 'stock', label: 'Stock / Goods', icon: '📦' },
  { id: 'transport', label: 'Transport / Boda', icon: '🛵' },
  { id: 'rent', label: 'Shop Rent', icon: '🏠' },
  { id: 'food', label: 'Food / Meals', icon: '☕' },
  { id: 'airtime', label: 'Airtime / Data', icon: '📱' },
  { id: 'electricity', label: 'Electricity / Tokens', icon: '⚡' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'wages', label: 'Wages / Helper', icon: '👷' },
  { id: 'cash_drop', label: 'Cash Withdrawal (Drop)', icon: '💰' },
  { id: 'other', label: 'Other', icon: '📝' },
];

const CATEGORIES_SW: Array<{ id: ExpenseCategory; label: string; icon: string }> = [
  { id: 'stock', label: 'Bidhaa (Stock)', icon: '📦' },
  { id: 'transport', label: 'Usafiri / Boda', icon: '🛵' },
  { id: 'rent', label: 'Kodi ya Chumba', icon: '🏠' },
  { id: 'food', label: 'Chakula / Chai', icon: '☕' },
  { id: 'airtime', label: 'Kadi / Data', icon: '📱' },
  { id: 'electricity', label: 'Stima / Tokens', icon: '⚡' },
  { id: 'water', label: 'Maji', icon: '💧' },
  { id: 'wages', label: 'Mshahara / Kibarua', icon: '👷' },
  { id: 'cash_drop', label: 'Kutoa Pesa (Bank/Binafsi)', icon: '💰' },
  { id: 'other', label: 'Mengineyo', icon: '📝' },
];

export const QuickAddActionSheet: React.FC<QuickAddActionSheetProps> = ({
  isOpen,
  onClose,
  onOpenNewProduct,
  onOpenNewDeni,
  onExpenseSaved,
  language = 'en',
}) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'expense'>('menu');
  const [amountStr, setAmountStr] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>('transport');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [saving, setSaving] = useState(false);

  const isEn = language === 'en';
  const categories = isEn ? CATEGORIES_EN : CATEGORIES_SW;

  const resetForm = () => {
    setAmountStr('');
    setNote('');
    setSelectedCategory('transport');
    setPaymentMethod('cash');
    setActiveTab('menu');
  };

  const handleSaveExpense = async () => {
    const num = Number(amountStr);
    if (!num || num <= 0) return;

    setSaving(true);
    try {
      const kes = toKES(num);
      const catObj = categories.find((c) => c.id === selectedCategory);
      const title = note.trim() || catObj?.label || (isEn ? 'Expense' : 'Matumizi');

      await recordExpense({
        title,
        amount: kes,
        category: selectedCategory,
        paymentMethod,
      });

      onExpenseSaved(title, kes);
      resetForm();
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={
        activeTab === 'menu'
          ? isEn ? 'Quick Add' : 'Ongeza Haraka'
          : isEn ? 'Record Expense' : 'Rekodi Matumizi'
      }
      subtitle={
        activeTab === 'menu'
          ? isEn ? 'Select what you want to add' : 'Chagua kile unachotaka kuweka'
          : isEn ? 'Enter amount and expense category' : 'Weka kiasi na kundi la matumizi'
      }
    >
      {activeTab === 'menu' ? (
        <div className="grid grid-cols-1 gap-3 py-2">
          {/* Quick Expense Action */}
          <button
            type="button"
            onClick={() => setActiveTab('expense')}
            className="flex items-center gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left active:bg-amber-100 transition shadow-xs"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl font-bold shadow-xs">
              💸
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-slate-900">
                {isEn ? 'Record Expense' : 'Rekodi Matumizi'}
              </div>
              <div className="text-xs text-slate-500">
                {isEn ? 'Transport, electricity, food, or cash withdrawal' : 'Usafiri, stima, chakula, au kutoa pesa'}
              </div>
            </div>
            <ArrowDownRight className="w-5 h-5 text-amber-600" />
          </button>

          {/* Quick Product Action */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenNewProduct();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-left active:bg-emerald-100 transition shadow-xs"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shadow-xs">
              📦
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-slate-900">
                {isEn ? 'New Product' : 'Bidhaa Mpya'}
              </div>
              <div className="text-xs text-slate-500">
                {isEn ? 'Add a new product to shop inventory' : 'Weka bidhaa mpya kwenye stock ya duka'}
              </div>
            </div>
            <Plus className="w-5 h-5 text-emerald-600" />
          </button>

          {/* Quick Deni Action */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenNewDeni();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-left active:bg-blue-100 transition shadow-xs"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow-xs">
              👥
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-slate-900">
                {isEn ? 'New Customer Credit' : 'Deni Jipya la Mteja'}
              </div>
              <div className="text-xs text-slate-500">
                {isEn ? 'Record manual credit without active sale' : 'Andika deni kwa mteja bila mauzo ya sasa'}
              </div>
            </div>
            <UserPlus className="w-5 h-5 text-blue-600" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Amount Display */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {isEn ? 'Expense Amount' : 'Kiasi cha Matumizi'}
            </span>
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {formatKES(toKES(Number(amountStr) || 0))}
            </div>
          </div>

          {/* Category Chips */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {isEn ? 'Expense Category:' : 'Kundi la Matumizi:'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition text-left ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Contextual Hints */}
          {selectedCategory === 'cash_drop' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                {isEn ? (
                  <><strong>Cash Drop (Withdrawal):</strong> Reduces drawer cash for evening count without decreasing shop profit.</>
                ) : (
                  <><strong>Kutoa Pesa (Cash Drop):</strong> Inapunguza pesa kwenye droo ya jioni lakini <strong>haipunguzi faida</strong> ya duka.</>
                )}
              </span>
            </div>
          )}

          {selectedCategory === 'stock' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                {isEn ? (
                  <><strong>Buying Stock:</strong> If you want inventory counts to auto-increment, use <strong>Restock List</strong> in Stock tab.</>
                ) : (
                  <><strong>Kununua Bidhaa:</strong> Ukitaka stock iongezeke kiotomatiki, tumia <strong>Orodha ya Manunuzi</strong> kwenye Stock.</>
                )}
              </span>
            </div>
          )}

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

          {/* Optional Note */}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isEn ? 'Short note (e.g., Boda transport for flour)...' : 'Maelezo mafupi (mfano: Boda kuleta unga)...'}
            className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500"
          />

          {/* Large Numpad */}
          <NumPad
            value={amountStr}
            onChange={setAmountStr}
            onSubmit={handleSaveExpense}
            submitLabel={saving ? (isEn ? 'Saving...' : 'Inahifadhi...') : (isEn ? 'Save Expense' : 'Hifadhi Matumizi')}
          />

          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => setActiveTab('menu')}
          >
            {isEn ? 'Back' : 'Rudi Nyuma'}
          </Button>
        </div>
      )}
    </Sheet>
  );
};
