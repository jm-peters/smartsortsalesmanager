import React from 'react';
import { PauseCircle, X } from 'lucide-react';
import { formatKES } from '../lib/money';
import type { HeldCart } from '../lib/db/local';

interface HeldCartsStripProps {
  heldCarts: HeldCart[];
  onResumeCart: (cart: HeldCart) => void;
  onDeleteHeldCart: (cartId: string) => void;
}

export const HeldCartsStrip: React.FC<HeldCartsStripProps> = ({
  heldCarts,
  onResumeCart,
  onDeleteHeldCart,
}) => {
  if (heldCarts.length === 0) return null;

  return (
    <div className="w-full mb-3 bg-amber-50/80 border border-amber-200 rounded-xl p-2 select-none">
      <div className="flex items-center gap-1 text-[11px] font-bold text-amber-900 mb-1.5 px-1">
        <PauseCircle className="w-3.5 h-3.5 text-amber-700" />
        <span>Mikokoteni Iliyoshikiliwa ({heldCarts.length}/5):</span>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {heldCarts.map((cart) => (
          <div
            key={cart.id}
            className="flex-shrink-0 flex items-center bg-white border border-amber-300 rounded-lg shadow-xs overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onResumeCart(cart)}
              className="px-2.5 py-1.5 text-left active:bg-amber-50 transition"
            >
              <span className="text-xs font-bold text-slate-800">
                {cart.label || 'Mteja'}
              </span>
              <span className="text-xs font-black text-amber-700 ml-1.5 tabular-nums">
                {formatKES(cart.total)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDeleteHeldCart(cart.id)}
              className="px-1.5 py-1.5 text-slate-400 hover:text-rose-600 border-l border-slate-100 active:bg-slate-100"
              aria-label="Futa mkokoteni huu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
