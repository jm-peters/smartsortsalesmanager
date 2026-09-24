import React, { useState, useEffect } from 'react';
import { Copy, Check, Share2, Phone, Sparkles } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES, type KES } from '../lib/money';
import {
  generateDebtorReminderText,
  openDebtorWhatsApp,
  shareDebtorReminder,
  type DebtorReminderOptions,
} from '../lib/reminder';
import type { Language } from '../lib/i18n';

interface DebtorReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone?: string | null;
  shopName: string;
  totalBalance: number | KES;
  principal?: number | KES;
  amountPaid?: number | KES;
  daysOld?: number;
  tillNumber?: string | null;
  language?: Language;
  onSavePhone?: (newPhone: string) => Promise<void>;
}

export const DebtorReminderModal: React.FC<DebtorReminderModalProps> = ({
  isOpen,
  onClose,
  customerName,
  customerPhone = '',
  shopName,
  totalBalance,
  principal,
  amountPaid,
  daysOld,
  tillNumber,
  language = 'en',
  onSavePhone,
}) => {
  const isEn = language === 'en';
  const [phone, setPhone] = useState(customerPhone || '');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPhone(customerPhone || '');
  }, [customerPhone, isOpen]);

  if (!isOpen) return null;

  const reminderOptions: DebtorReminderOptions = {
    customerName,
    customerPhone: phone,
    shopName,
    totalBalance,
    principal,
    amountPaid,
    daysOld,
    tillNumber,
    language,
  };

  const reminderText = generateDebtorReminderText(reminderOptions);

  const handleSendWhatsApp = async () => {
    setIsSaving(true);
    try {
      if (phone.trim() && phone.trim() !== customerPhone && onSavePhone) {
        await onSavePhone(phone.trim());
      }
      openDebtorWhatsApp(reminderOptions);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareSystem = async () => {
    await shareDebtorReminder(reminderOptions, 'system');
  };

  const handleCopy = async () => {
    const res = await shareDebtorReminder(reminderOptions, 'copy');
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? 'WhatsApp Payment Reminder' : 'Kumbusho la Deni WhatsApp'}
      subtitle={customerName}
    >
      <div className="space-y-4 select-none">
        {/* Debtor Overview Card */}
        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              {isEn ? 'Total Balance Owed' : 'Salio Linalodaiwa'}
            </div>
            <div className="text-xl font-black text-emerald-950 tabular-nums">
              {formatKES(totalBalance)}
            </div>
          </div>
          {typeof daysOld === 'number' && (
            <div className="text-right">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {daysOld === 0
                  ? isEn ? 'Today' : 'Leo'
                  : isEn ? `${daysOld} days overdue` : `Siku ${daysOld}`}
              </span>
            </div>
          )}
        </div>

        {/* WhatsApp Phone Number Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-700" />
            <span>{isEn ? "Customer's WhatsApp Number:" : "Nambari ya WhatsApp ya Mteja:"}</span>
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712 345 678 or 2547..."
              className={`w-full h-11 px-3 rounded-xl border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                !phone.trim()
                  ? 'border-amber-400 bg-amber-50/40 text-amber-950 placeholder:text-amber-700/60'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            />
          </div>
          {!phone.trim() ? (
            <p className="text-[11px] text-amber-700 font-medium">
              ⚠ {isEn
                ? 'Enter phone to open their chat directly, or tap send to pick from WhatsApp contacts.'
                : 'Weka namba ili kumtumia moja kwa moja, au chagua namba kutoka WhatsApp.'}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              {isEn
                ? 'Number will be formatted automatically (+254).'
                : 'Nambari itabadilishwa moja kwa moja (+254).'}
            </p>
          )}
        </div>

        {/* Message Preview in Chat Bubble */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              {isEn ? 'Message Preview:' : 'Muonekano wa Ujumbe:'}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? (isEn ? 'Copied' : 'Imenakiliwa') : (isEn ? 'Copy' : 'Nakili')}
            </button>
          </div>

          <div className="p-3.5 bg-[#DCF8C6]/30 border border-[#b8e49d] rounded-2xl font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto select-text shadow-xs">
            {reminderText}
          </div>
        </div>

        {/* Actions: Big WhatsApp Send Button */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSendWhatsApp}
            className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            <span className="text-xl">💬</span>
            <span>
              {isEn
                ? phone.trim()
                  ? 'Send via WhatsApp'
                  : 'Open WhatsApp Contacts'
                : phone.trim()
                ? 'Tuma kupitia WhatsApp'
                : 'Fungua WhatsApp'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 border-slate-300"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? (isEn ? 'Copied' : 'Imenakiliwa') : (isEn ? 'Copy Text' : 'Nakili Ujumbe')}
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={handleShareSystem}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800"
            >
              <Share2 className="w-4 h-4" />
              {isEn ? 'SMS / Share' : 'SMS / Shiriki'}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
};
