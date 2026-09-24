import React from 'react';
import { Plus, Sparkles, CheckCircle, HelpCircle, Package, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import type { Language } from '../lib/i18n';

export interface ProductStarterTemplate {
  name: string;
  emoji: string;
  sellingPrice: number;
  buyingPrice?: number;
  unit: string;
  initialQty: number;
}

interface FirstProductGuideProps {
  onOpenAddProduct: (template?: ProductStarterTemplate) => void;
  onSeedSampleCatalog?: () => void;
  language?: Language;
}

const STARTER_TEMPLATES: ProductStarterTemplate[] = [
  { name: 'Sugar 1kg (Sukari)', emoji: '🧂', sellingPrice: 160, unit: 'kg', initialQty: 10 },
  { name: 'Maize Flour 2kg (Unga)', emoji: '🌽', sellingPrice: 140, unit: 'pcs', initialQty: 12 },
  { name: 'Milk 500ml (Maziwa)', emoji: '🥛', sellingPrice: 65, unit: 'pkt', initialQty: 15 },
  { name: 'White Bread 400g (Mkate)', emoji: '🍞', sellingPrice: 65, unit: 'pcs', initialQty: 10 },
  { name: 'Cooking Oil 1L (Mafuta)', emoji: '🫒', sellingPrice: 260, unit: 'ltr', initialQty: 8 },
  { name: 'Eggs (Mayai)', emoji: '🥚', sellingPrice: 18, unit: 'pcs', initialQty: 30 },
  { name: 'Bar Soap (Sabuni)', emoji: '🧼', sellingPrice: 35, unit: 'pcs', initialQty: 10 },
];

export const FirstProductGuide: React.FC<FirstProductGuideProps> = ({
  onOpenAddProduct,
  onSeedSampleCatalog,
  language = 'en',
}) => {
  const isEn = language === 'en';

  return (
    <div className="p-4 space-y-4 select-none">
      {/* Welcome Banner Card */}
      <div className="bg-linear-to-br from-emerald-700 via-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl shadow-inner">
            🏪
          </div>
          <div>
            <h2 className="text-lg font-black leading-tight">
              {isEn ? 'Welcome to Your Shop!' : 'Karibu kwenye Duka Lako!'}
            </h2>
            <p className="text-xs text-emerald-100 font-medium">
              {isEn
                ? 'Your shop is ready. Let’s add your first products to start selling.'
                : 'Duka lako liko tayari. Weka bidhaa zako za kwanza kuanza kuuza.'}
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="hero"
          fullWidth
          onClick={() => onOpenAddProduct()}
          className="mt-3 bg-white text-emerald-800 hover:bg-emerald-50 font-black shadow-md flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5 text-emerald-700" />
          <span>{isEn ? '+ Add Your First Product' : '+ Ongeza Bidhaa ya Kwanza'}</span>
        </Button>
      </div>

      {/* 3-Step Quick Guide Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
            {isEn ? 'How to Add Products (3 Easy Steps)' : 'Jinsi ya Kuweka Bidhaa (Hatua 3)'}
          </h3>
        </div>

        <div className="space-y-3">
          {/* Step 1 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              1
            </span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                {isEn ? 'Enter Product Name & Emoji' : 'Weka Jina la Bidhaa na Emoji'}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {isEn
                  ? 'Give it a clear name like "Sugar 1kg" or "Fresh Milk".'
                  : 'Weka jina rahisi kueleweka kama "Sukari 1kg" au "Maziwa".'}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100/80">
            <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              2
            </span>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>{isEn ? 'Selling Price' : 'Bei ya Kuuza'}</span>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800">
                  {isEn ? 'Buying Price Optional' : 'Cost Si Lazima'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                {isEn ? (
                  <>
                    Set your <strong>Selling Price</strong>. The <strong>Buying Price (Cost)</strong> is completely optional!
                    Leave it blank if you only want to record sales and skip profit calculation.
                  </>
                ) : (
                  <>
                    Weka <strong>Bei ya Kuuza</strong>. Bei ya <strong>Kununua (Cost)</strong> si lazima!
                    Acha wazi ikiwa unataka kurekodi mauzo tu bila kuhesabu faida.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              3
            </span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                {isEn ? 'Starting Stock Count' : 'Idadi ya Stock Uliyonayo'}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {isEn
                  ? 'Enter how many units you currently have on the shelf (e.g. 10 packets).'
                  : 'Weka idadi uliyonayo dukani kwa sasa (mfano pakiti 10).'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 1-Click Starter Suggestions */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {isEn ? 'Popular Kenyan Starter Templates' : 'Mifano ya Haraka ya Kenya'}
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold">
            {isEn ? 'Tap to prefill' : 'Bofya kujaza'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {STARTER_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => onOpenAddProduct(tpl)}
              className="p-3 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0">{tpl.emoji}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{tpl.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {isEn ? 'Selling:' : 'Kuuza:'}{' '}
                    <strong className="text-emerald-700">KES {tpl.sellingPrice}</strong> ·{' '}
                    {isEn ? 'Cost:' : 'Kununua:'} <span className="text-slate-400 italic">{isEn ? 'Optional' : 'Si lazima'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">
                <span>{isEn ? 'Use' : 'Tumia'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>

        {/* Optional Demo Catalog Loader */}
        {onSeedSampleCatalog && (
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={onSeedSampleCatalog}
              className="text-xs font-bold text-slate-500 hover:text-emerald-700 transition"
            >
              {isEn
                ? '📦 Or load all 14 sample Kenyan items for instant demo testing'
                : '📦 Au weka bidhaa 14 za mfano kwa majaribio ya haraka'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
