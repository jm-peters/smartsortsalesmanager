import React from 'react';
import { X, Check } from 'lucide-react';

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmoji: string;
  onSelect: (emoji: string) => void;
  language: 'en' | 'sw';
}

const CATEGORIES = [
  {
    nameEn: 'Retail & Shops',
    nameSw: 'Maduka na Rejareja',
    emojis: ['🏪', '🛒', '🛍️', '🏬', '🏢', '🏷️', '📦', '🎁'],
  },
  {
    nameEn: 'Food & Groceries',
    nameSw: 'Vyakula na Mboga',
    emojis: ['🌽', '🍞', '🥛', '🥩', '🥚', '🍅', '🥬', '🍌', '🥔', '🍚', '☕', '🥤'],
  },
  {
    nameEn: 'Household & General',
    nameSw: 'Vifaa vya Nyumbani',
    emojis: ['🧼', '🧴', '🧹', '🧻', '🕯️', '💡', '🔋', '🧯'],
  },
  {
    nameEn: 'Hardware & Tech',
    nameSw: 'Vifaa na Teknolojia',
    emojis: ['🔨', '🔧', '🔌', '📱', '💻', '🚗', '🛵', '🚲'],
  },
  {
    nameEn: 'Health & Beauty',
    nameSw: 'Afya na Urembo',
    emojis: ['💊', '🩹', '💄', '✂️', '🧴', '💈'],
  },
];

export const EmojiPickerModal: React.FC<EmojiPickerModalProps> = ({
  isOpen,
  onClose,
  currentEmoji,
  onSelect,
  language,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {language === 'en' ? 'Choose Shop Emoji' : 'Chagua Emoji ya Duka'}
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'en'
                ? 'Appears on your shop profile and digital receipts'
                : 'Inaonekana kwenye wasifu na risiti za duka'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Emoji Categories */}
        <div className="overflow-y-auto py-3 space-y-4">
          {CATEGORIES.map((cat, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {language === 'en' ? cat.nameEn : cat.nameSw}
              </div>
              <div className="grid grid-cols-6 gap-2">
                {cat.emojis.map((emoji) => {
                  const isSelected = emoji === currentEmoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSelect(emoji);
                        onClose();
                      }}
                      className={`h-12 rounded-2xl flex items-center justify-center text-2xl transition transform active:scale-95 ${
                        isSelected
                          ? 'bg-emerald-100 border-2 border-emerald-500 ring-2 ring-emerald-200'
                          : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
