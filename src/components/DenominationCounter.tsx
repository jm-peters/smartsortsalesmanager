import React, { useState } from 'react';
import { Plus, Minus, Calculator } from 'lucide-react';
import { type KES, toKES, formatKES } from '../lib/money';
import type { Language } from '../lib/i18n';

export interface DenominationBreakdown {
  [denom: number]: number; // count of notes/coins
}

const DENOMINATIONS = [1000, 500, 200, 100, 50, 40, 20, 10, 5, 1];

interface DenominationCounterProps {
  onTotalChange: (total: KES, counts: DenominationBreakdown) => void;
  initialCounts?: DenominationBreakdown;
  language?: Language;
}

export const DenominationCounter: React.FC<DenominationCounterProps> = ({
  onTotalChange,
  initialCounts = {},
  language = 'en',
}) => {
  const isEn = language === 'en';
  const [counts, setCounts] = useState<DenominationBreakdown>(initialCounts);
  const [manualMode, setManualMode] = useState(false);
  const [manualTotal, setManualTotal] = useState('');

  const calculateSum = (c: DenominationBreakdown): KES => {
    let sum = 0;
    for (const d of DENOMINATIONS) {
      sum += d * (c[d] || 0);
    }
    return toKES(sum);
  };

  const updateCount = (denom: number, delta: number) => {
    const current = counts[denom] || 0;
    const next = Math.max(0, current + delta);
    const updated = { ...counts, [denom]: next };
    setCounts(updated);
    onTotalChange(calculateSum(updated), updated);

    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(8);
    }
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setManualTotal(val);
    const kes = toKES(Number(val) || 0);
    onTotalChange(kes, {});
  };

  const currentTotal = manualMode ? toKES(Number(manualTotal) || 0) : calculateSum(counts);

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {isEn ? 'Total Counted Cash' : 'Jumla ya Pesa Zilizopo'}
          </span>
          <div className="text-2xl font-black text-slate-900 tabular-nums">
            {formatKES(currentTotal)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setManualMode(!manualMode)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
        >
          <Calculator className="w-4 h-4 text-slate-500" />
          {manualMode
            ? isEn ? 'Use Denominations' : 'Tumia Viwango'
            : isEn ? 'Type Total' : 'Andika Jumla'}
        </button>
      </div>

      {manualMode ? (
        <div className="py-6">
          <label className="block text-xs font-bold text-slate-700 mb-2">
            {isEn ? 'Enter total cash counted (KES):' : 'Weka kiasi kamili cha pesa ulizohesabu (KES):'}
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={manualTotal}
            onChange={handleManualChange}
            placeholder="0"
            className="w-full h-14 text-2xl font-black text-center border-2 border-emerald-500 rounded-xl tabular-nums focus:outline-none bg-emerald-50/30 text-emerald-950"
            autoFocus
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-100 mt-2 max-h-[360px] overflow-y-auto no-scrollbar">
          {DENOMINATIONS.map((denom) => {
            const count = counts[denom] || 0;
            const subtotal = denom * count;
            const isNote = denom >= 50;

            return (
              <div
                key={denom}
                className="py-2.5 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-[90px]">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black ${
                      isNote
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}
                  >
                    {isNote ? '💵' : '🪙'}
                  </span>
                  <div>
                    <div className="font-bold text-sm text-slate-900 tabular-nums">
                      KES {denom}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      = {formatKES(subtotal)}
                    </div>
                  </div>
                </div>

                {/* Counter Steppers */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCount(denom, -1)}
                    disabled={count === 0}
                    className="w-10 h-10 rounded-xl bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 font-bold flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition"
                    aria-label={isEn ? `Decrease KES ${denom}` : `Punguza KES ${denom}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <span className="w-10 text-center font-black text-base text-slate-900 tabular-nums">
                    {count}
                  </span>

                  <button
                    type="button"
                    onClick={() => updateCount(denom, 1)}
                    className="w-10 h-10 rounded-xl bg-emerald-50 active:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold flex items-center justify-center transition"
                    aria-label={isEn ? `Increase KES ${denom}` : `Ongeza KES ${denom}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
