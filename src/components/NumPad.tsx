import React from 'react';
import { Delete, Check } from 'lucide-react';

interface NumPadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
  isPin?: boolean;
  allowDecimals?: boolean;
  submitLabel?: string;
}

export const NumPad: React.FC<NumPadProps> = ({
  value,
  onChange,
  onSubmit,
  maxLength = 10,
  isPin = false,
  allowDecimals = false,
  submitLabel,
}) => {
  const vibrate = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(12);
    }
  };

  const handleDigit = (digit: string) => {
    vibrate();
    if (value.length >= maxLength) return;
    if (value === '0' && digit !== '.') {
      onChange(digit);
    } else {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    vibrate();
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    vibrate();
    onChange('');
  };

  return (
    <div className="w-full max-w-sm mx-auto select-none">
      {/* PIN Dots or Value Display */}
      {isPin ? (
        <div className="flex items-center justify-center gap-3 my-4 py-2">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full transition-all duration-150 ${
                i < value.length
                  ? 'bg-emerald-600 scale-110 shadow-sm'
                  : 'bg-slate-200 border border-slate-300'
              }`}
            />
          ))}
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 p-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="h-16 rounded-xl bg-white border border-slate-200 text-2xl font-bold text-slate-800 shadow-sm active:bg-slate-100 active:scale-95 transition-all flex items-center justify-center focus:outline-none"
          >
            {digit}
          </button>
        ))}

        {allowDecimals ? (
          <button
            type="button"
            onClick={() => handleDigit('.')}
            className="h-16 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200 transition-all flex items-center justify-center focus:outline-none"
          >
            .
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClear}
            className="h-16 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 active:bg-slate-200 transition-all flex items-center justify-center focus:outline-none"
          >
            Futa
          </button>
        )}

        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="h-16 rounded-xl bg-white border border-slate-200 text-2xl font-bold text-slate-800 shadow-sm active:bg-slate-100 active:scale-95 transition-all flex items-center justify-center focus:outline-none"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Futa herufi moja"
          className="h-16 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 active:bg-rose-100 active:scale-95 transition-all flex items-center justify-center focus:outline-none"
        >
          <Delete className="w-7 h-7" />
        </button>
      </div>

      {onSubmit && (
        <button
          type="button"
          onClick={() => {
            vibrate();
            onSubmit();
          }}
          disabled={value.length === 0}
          className="w-full mt-3 h-14 bg-brand-gradient text-white font-bold text-lg rounded-xl shadow-md flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40 transition-all"
        >
          <Check className="w-5 h-5" />
          {submitLabel || 'Wasilisha'}
        </button>
      )}
    </div>
  );
};
