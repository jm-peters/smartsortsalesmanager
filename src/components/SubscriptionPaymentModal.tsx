import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Calendar,
  Phone,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES, toKES } from '../lib/money';
import { recordSubscriptionPayment, type ShopMeta } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface SubscriptionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: ShopMeta;
  language?: Language;
  onSubscriptionUpdated: (updatedShop: ShopMeta) => void;
}

const QUICK_AMOUNTS = [
  { amount: 30, days: 1, labelEn: '1 Day', labelSw: 'Siku 1', badge: 'Daily' },
  { amount: 60, days: 2, labelEn: '2 Days', labelSw: 'Siku 2', badge: '2 Days' },
  { amount: 210, days: 7, labelEn: '1 Week', labelSw: 'Wiki 1', badge: '7 Days' },
  { amount: 900, days: 30, labelEn: '1 Month', labelSw: 'Mwezi 1', badge: 'Best Value' },
];

export const SubscriptionPaymentModal: React.FC<SubscriptionPaymentModalProps> = ({
  isOpen,
  onClose,
  shop,
  language = 'en',
  onSubscriptionUpdated,
}) => {
  const isEn = language === 'en';
  const paybillNumber = '247247'; // Official Equity Till Paybill
  const accountNumber = '253499'; // Official Equity Till Account Number

  const registeredPhone = (shop.phone || shop.alt_phone || '').trim();

  const [amountStr, setAmountStr] = useState('30');
  const [copiedPaybill, setCopiedPaybill] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastPaymentResult, setLastPaymentResult] = useState<{
    days: number;
    amount: number;
    validUntil: string;
  } | null>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setAmountStr('30');
      setErrorMsg('');
      setLastPaymentResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const enteredAmount = Math.max(0, parseInt(amountStr.replace(/\D/g, ''), 10) || 0);
  // Calculate days of access based on KES 30 per day
  const calculatedDays = Math.max(1, Math.floor(enteredAmount / 30));

  // Compute calculated validity & next reminder date preview
  const nowMs = Date.now();
  const currentExpiryMs = shop.subscription_paid_until
    ? new Date(shop.subscription_paid_until).getTime()
    : nowMs;
  const baseTime = currentExpiryMs > nowMs ? currentExpiryMs : nowMs;
  const previewValidUntil = new Date(baseTime + calculatedDays * 24 * 60 * 60 * 1000);

  const handleCopyPaybill = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(paybillNumber);
      setCopiedPaybill(true);
      setTimeout(() => setCopiedPaybill(false), 2000);
    }
  };

  const handleCopyAcc = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  const handleConfirmPaid = async () => {
    if (enteredAmount < 30) {
      setErrorMsg(
        isEn
          ? 'Minimum subscription payment is KES 30 (1 day access).'
          : 'Kiwango cha chini cha malipo ya ada ni KES 30 (siku 1).'
      );
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      const updatedShop = await recordSubscriptionPayment({
        days: calculatedDays,
        amount: enteredAmount,
        paymentMethod: 'mpesa_till',
        phone: registeredPhone || null as any,
      });

      setLastPaymentResult({
        days: calculatedDays,
        amount: enteredAmount,
        validUntil: updatedShop.subscription_paid_until || previewValidUntil.toISOString(),
      });
      onSubscriptionUpdated(updatedShop);
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Error confirming payment' : 'Kosa katika kuthibitisha malipo'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseModal = () => {
    setErrorMsg('');
    setLastPaymentResult(null);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleCloseModal}
      title={isEn ? 'SmartSort Duka Access' : 'Ada ya Kila Siku ya Duka'}
      subtitle={isEn ? 'Equity Till Payment • KES 30 / Day' : 'Malipo ya Equity Till • KES 30 kwa Siku'}
    >
      <div className="space-y-4 select-none pb-2">
        {/* SUCCESS VIEW */}
        {lastPaymentResult ? (
          <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-3xl text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-emerald-950">
                {isEn ? 'Subscription Recorded!' : 'Ada Imerekodiwa!'}
              </h3>
              <p className="text-xs text-emerald-800 mt-1 font-medium">
                {isEn
                  ? `Your shop access has been extended for ${lastPaymentResult.days} ${lastPaymentResult.days === 1 ? 'day' : 'days'}.`
                  : `Ada ya duka lako imeongezwa kwa siku ${lastPaymentResult.days}.`}
              </p>
            </div>

            <div className="p-3 bg-white/90 border border-emerald-200 rounded-2xl text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Amount Paid:' : 'Kiasi Kilicholipwa:'}</span>
                <span className="font-black text-slate-900">{formatKES(lastPaymentResult.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Active Duration:' : 'Muda wa Huduma:'}</span>
                <span className="font-bold text-slate-800">{lastPaymentResult.days} {isEn ? 'Days' : 'Siku'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Valid Until & Next Reminder:' : 'Inaisha / Kumbusho Lijalo:'}</span>
                <span className="font-black text-emerald-700">
                  {new Date(lastPaymentResult.validUntil).toLocaleDateString('en-KE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            <Button variant="gradient" size="hero" fullWidth onClick={handleCloseModal}>
              {isEn ? 'Continue Selling' : 'Endelea Kuuza'}
            </Button>
          </div>
        ) : (
          <>
            {/* Header Rate Banner */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                  {isEn ? 'Daily Duka Access Rate' : 'Kiwango cha Ada ya Duka'}
                </div>
                <div className="text-xl font-black tabular-nums">
                  KES 30 <span className="text-xs font-normal text-emerald-200">/ {isEn ? 'day' : 'siku'}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-700/80 text-emerald-100 border border-emerald-500/50">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isEn ? 'Full Access' : 'Mfumo Kamili'}
              </span>
            </div>

            {/* Official Equity Till Account Card */}
            <div className="p-3.5 bg-slate-50 border-2 border-emerald-300 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider">
                  {isEn ? 'Pay to SmartSort Equity Till' : 'Lipa kwa Equity Till ya SmartSort'}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  {isEn ? 'Paybill / Till' : 'Paybill'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Paybill</span>
                  <span className="text-lg font-black text-slate-900 tracking-wider font-mono">{paybillNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyPaybill}
                    className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center gap-1 mx-auto active:scale-95 transition cursor-pointer"
                  >
                    {copiedPaybill ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPaybill ? (isEn ? 'Copied' : 'Imenakiliwa') : (isEn ? 'Copy' : 'Nakili')}</span>
                  </button>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Account No</span>
                  <span className="text-lg font-black text-emerald-700 tracking-wider font-mono">{accountNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyAcc}
                    className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center gap-1 mx-auto active:scale-95 transition cursor-pointer"
                  >
                    {copiedAcc ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedAcc ? (isEn ? 'Copied' : 'Imenakiliwa') : (isEn ? 'Copy' : 'Nakili')}</span>
                  </button>
                </div>
              </div>

              {/* Registered Phone Note */}
              <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-950">
                <Phone className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  {registeredPhone ? (
                    <span>
                      {isEn ? '⚠️ Please pay using your registered phone number: ' : '⚠️ Tafadhali lipa ukitumia namba yako iliyosajiliwa: '}
                      <strong className="font-mono text-slate-900 bg-amber-100 px-1 rounded">{registeredPhone}</strong>
                    </span>
                  ) : (
                    <span>
                      {isEn
                        ? '⚠️ Please ensure you pay from your official shop phone number so we can track and verify your payment.'
                        : '⚠️ Tafadhali hakikisha unalipa kwa namba yako rasmi ya simu ili malipo yatambuliwe.'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Amount Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                {isEn ? 'Choose or Enter Amount Paid:' : 'Chagua au Andika Kiasi Ulicholipa:'}
              </label>

              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_AMOUNTS.map((q) => {
                  const isSelected = enteredAmount === q.amount;
                  return (
                    <button
                      key={q.amount}
                      type="button"
                      onClick={() => setAmountStr(String(q.amount))}
                      className={`p-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-500">{isEn ? q.labelEn : q.labelSw}</span>
                      <span className="text-xs font-black text-slate-900 tabular-nums">KES {q.amount}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manual Amount Input Field */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600">
                {isEn ? 'Amount Paid (KES):' : 'Kiasi Kilicholipwa (KES):'}
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400">
                  KES
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, ''))}
                  placeholder="30"
                  className="w-full h-12 pl-12 pr-4 text-xl font-black bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>

            {/* Live Calculation Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">{isEn ? 'Access Duration Granted:' : 'Muda wa Huduma Utakaopata:'}</span>
                <span className="font-black text-emerald-800 text-sm">
                  {calculatedDays} {calculatedDays === 1 ? (isEn ? 'Day' : 'Siku 1') : (isEn ? 'Days' : 'Siku')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">{isEn ? 'Valid Until / Next Reminder:' : 'Inaisha / Kumbusho Lijalo:'}</span>
                <span className="font-bold text-slate-800">
                  {previewValidUntil.toLocaleDateString('en-KE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 pt-0.5">
                {isEn
                  ? 'Daily reminders are sent once daily when subscription is due.'
                  : 'Kumbusho hutumwa mara moja kwa siku wakati muda unapoisha.'}
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            {/* Confirm Paid Button */}
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={isProcessing || enteredAmount < 30}
              onClick={handleConfirmPaid}
              className="font-black shadow-md mt-2"
            >
              <Check className="w-5 h-5 mr-1" />
              {isProcessing
                ? (isEn ? 'Recording...' : 'Inarekodi...')
                : (isEn ? `I Have Paid KES ${enteredAmount} (Confirm)` : `Nimelipa KES ${enteredAmount} (Thibitisha)`)}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
};
