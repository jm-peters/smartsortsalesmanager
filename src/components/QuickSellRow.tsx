import React from 'react';
import { Pin, Sparkles } from 'lucide-react';
import { formatKES } from '../lib/money';
import type { Product } from '../lib/db/local';

interface QuickSellRowProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onTogglePin?: (product: Product) => void;
  isSearchActive: boolean;
  totalHistoricalSales: number;
  cartCounts?: Map<string, number>;
}

export const QuickSellRow: React.FC<QuickSellRowProps> = ({
  products,
  onSelectProduct,
  onTogglePin,
  isSearchActive,
  totalHistoricalSales,
  cartCounts,
}) => {
  // Hide if search is active or fewer than 20 historical sales (§Feature 2)
  if (isSearchActive) return null;
  if (totalHistoricalSales < 5 && products.length < 3) return null;

  // Max 8 products
  const displayed = products.slice(0, 8);
  if (displayed.length === 0) return null;

  return (
    <div className="w-full mb-3 select-none">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <div className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Uza Haraka (Top Items)</span>
        </div>
        <span className="text-[10px] text-slate-400">Gusa kuongeza</span>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1">
        {displayed.map((p) => {
          const count = cartCounts?.get(p.id) ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProduct(p)}
              onContextMenu={(e) => {
                e.preventDefault();
                onTogglePin?.(p);
              }}
              className={`flex-shrink-0 w-[108px] h-[80px] p-2 bg-white rounded-xl border shadow-xs active:scale-95 transition-all text-left flex flex-col justify-between relative group ${
                count > 0 ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20' : 'border-slate-200'
              }`}
            >
              {count > 0 ? (
                <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shadow-xs">
                  {count}
                </span>
              ) : p.is_pinned ? (
                <span className="absolute top-1.5 right-1.5 text-emerald-600">
                  <Pin className="w-3 h-3 fill-emerald-600" />
                </span>
              ) : null}

              <div className="flex items-center gap-1.5 pr-4">
                <span className="text-base leading-none shrink-0">{p.image_emoji || '📦'}</span>
                <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">
                  {p.name}
                </span>
              </div>

              <div className="text-xs font-black text-emerald-700 tabular-nums">
                {formatKES(p.selling_price)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
