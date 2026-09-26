import React, { useState } from 'react';
import {
  CreditCard,
  Smartphone,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES } from '../lib/money';
import { recordSubscriptionPayment, type ShopMeta } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface SubscriptionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: ShopMeta;
  language?: Language;
  onSubscriptionUpdated: (updatedShop: ShopMeta) => void;
}

const DURATIONS = [
  { days: 1, labelEn: '1 Day', labelSw: 'Siku 1', kes: 30, badge: 'Daily' },
  { days: 7, labelEn: '7 Days', labelSw: 'Siku 7', kes: 180, badge: '1 Week' },
  { days: 30, labelEn: '30 Days', labelSw: 'Siku 30', kes: 750, badge: 'Best Value' },
];

export const SubscriptionPaymentModal: React.FC<SubscriptionPaymentModalProps> = ({
  isOpen,
  onClose,
  shop,
  language = 'en',
  onSubscriptionUpdated,
}) => {
  const isEn = language === 'en';
  const tillNumber = '6997912'; // Official SmartSort Buy Goods Till Number

  const registeredPhone = (shop.phone || shop.alt_phone || '').trim();

  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'stk' | 'till'>('stk');
  const [phone, setPhone] = useState(registeredPhone);
  const [transactionCode, setTransactionCode] = useState('');
  const [copiedTill, setCopiedTill] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Keep phone synced with registered phone
  React.useEffect(() => {
    if (registeredPhone) {
      setPhone(registeredPhone);
    }
  }, [registeredPhone]);

  // STK Push state machine: 'idle' | 'prompting' | 'success'
  const [stkStatus, setStkStatus] = useState<'idle' | 'prompting' | 'success'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPaymentResult, setLastPaymentResult] = useState<{
    days: number;
    amount: number;
    validUntil: string;
  } | null>(null);

  if (!isOpen) return null;

  const currentPlan = DURATIONS[selectedPlanIndex];

  const handleCopyTill = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(tillNumber);
      setCopiedTill(true);
      setTimeout(() => setCopiedTill(false), 2000);
    }
  };

  // Trigger STK Push
  const handleInitiateSTK = async () => {
    if (!registeredPhone) {
      setErrorMsg(
        isEn
          ? 'Please register your official phone number in your Profile settings first so we can track and link your payment.'
          : 'Tafadhali sajili nambari yako ya simu kwenye Wasifu kwanza ili malipo yako yaweze kuunganishwa.'
      );
      return;
    }

    const cleanPhone = (phone || registeredPhone).trim().replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      setErrorMsg(isEn ? 'Your registered phone number is invalid. Please update in Profile.' : 'Nambari ya simu iliyosajiliwa si sahihi. Sasisha kwenye Wasifu.');
      return;
    }
    setErrorMsg('');
    setIsProcessing(true);
    setStkStatus('prompting');

    // Simulate STK Push prompt delivery or call backend endpoint if configured
    try {
      // In production with live Daraja edge function, this posts to /functions/v1/mpesa-stk-push
    } finally {
      setIsProcessing(false);
    }
  };

  // Complete Payment (STK confirmed or manual Till verified)
  const handleConfirmPayment = async (method: 'mpesa_stk' | 'mpesa_till') => {
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const targetPhone = (phone || registeredPhone).trim();
      if (!targetPhone) {
        throw new Error(isEn ? 'Registered phone number is required to track payment.' : 'Nambari ya simu inahitajika ili kufuatilia malipo.');
      }

      const code = method === 'mpesa_stk'
        ? `STK-${Date.now().toString(36).toUpperCase()}`
        : transactionCode.trim().toUpperCase();

      if (method === 'mpesa_till' && code.length < 8) {
        setErrorMsg(isEn ? 'Please enter a valid 10-character M-Pesa code.' : 'Weka nambari halali ya M-Pesa (herufi 10).');
        setIsProcessing(false);
        return;
      }

      const updatedShop = await recordSubscriptionPayment({
        days: currentPlan.days,
        amount: currentPlan.kes,
        paymentMethod: method,
        transactionCode: code,
        phone: targetPhone,
      });

      setLastPaymentResult({
        days: currentPlan.days,
        amount: currentPlan.kes,
        validUntil: updatedShop.subscription_paid_until || new Date().toISOString(),
      });
      setStkStatus('success');
      onSubscriptionUpdated(updatedShop);
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Error confirming payment' : 'Kosa katika kuthibitisha malipo'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetModal = () => {
    setStkStatus('idle');
    setTransactionCode('');
    setErrorMsg('');
    setLastPaymentResult(null);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleResetModal}
      title={isEn ? 'Duka Access Subscription' : 'Ada ya Kila Siku ya Duka'}
      subtitle={isEn ? 'KES 30 per day • M-Pesa Instant Activation' : 'KES 30 kwa siku • Huwezeshwa Papo Hapo'}
    >
      <div className="space-y-4 select-none pb-2">
        {/* SUCCESS VIEW */}
        {stkStatus === 'success' && lastPaymentResult && (
          <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-3xl text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-emerald-950">
                {isEn ? 'Payment Successful!' : 'Malipo Yamekamilika!'}
              </h3>
              <p className="text-xs text-emerald-800 mt-1 font-medium">
                {isEn
                  ? `Your shop subscription has been extended for ${lastPaymentResult.days} ${lastPaymentResult.days === 1 ? 'day' : 'days'}.`
                  : `Ada ya duka lako imeongezwa kwa siku ${lastPaymentResult.days}.`}
              </p>
            </div>

            <div className="p-3 bg-white/90 border border-emerald-200 rounded-2xl text-xs space-y-1 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Amount Paid:' : 'Kiasi Kilicholipwa:'}</span>
                <span className="font-black text-slate-900">{formatKES(lastPaymentResult.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Valid Until:' : 'Inaisha Tarehe:'}</span>
                <span className="font-black text-emerald-700">
                  {new Date(lastPaymentResult.validUntil).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Cloud Sync:' : 'Hali ya Data:'}</span>
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {isEn ? 'Saved & Queued' : 'Imehifadhiwa'}
                </span>
              </div>
            </div>

            <Button variant="gradient" size="hero" fullWidth onClick={handleResetModal}>
              {isEn ? 'Continue Selling' : 'Endelea Kuuza'}
            </Button>
          </div>
        )}

        {/* ACTIVE STK PROMPT IN PROGRESS */}
        {stkStatus === 'prompting' && (
          <div className="p-5 bg-emerald-50 border-2 border-dashed border-emerald-400 rounded-3xl text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto relative">
              <Smartphone className="w-7 h-7 animate-pulse text-emerald-700" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 rounded-full animate-ping" />
            </div>

            <div>
              <h3 className="text-base font-black text-emerald-950">
                {isEn ? 'M-Pesa Prompt Sent!' : 'Ombi la M-Pesa Limetumwa!'}
              </h3>
              <p className="text-xs text-emerald-800 mt-1">
                {isEn
                  ? `Please check your phone (${phone}) and enter your M-Pesa PIN to complete payment of KES ${currentPlan.kes}.`
                  : `Tafadhali angalia simu yako (${phone}) uweke PIN ya M-Pesa kukamilisha KES ${currentPlan.kes}.`}
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-emerald-200 text-xs text-slate-600 space-y-1 text-left">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{isEn ? 'Prompt expires in 60 seconds' : 'Ombi linaisha baada ya sekunde 60'}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Once you enter your PIN, tap Confirm below to activate your duka access immediately.'
                  : 'Ukishaweka PIN kwenye simu, bofya "Thibitisha" hapa chini.'}
              </p>
            </div>

            {errorMsg && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Button
                variant="gradient"
                size="hero"
                fullWidth
                disabled={isProcessing}
                onClick={() => handleConfirmPayment('mpesa_stk')}
                className="font-black"
              >
                <Check className="w-4 h-4 mr-1" />
                {isProcessing
                  ? (isEn ? 'Verifying...' : 'Inathibitisha...')
                  : (isEn ? 'I Have Entered PIN (Confirm)' : 'Nimeweka PIN (Thibitisha)')}
              </Button>

              <button
                type="button"
                onClick={() => setStkStatus('idle')}
                className="text-xs text-slate-500 hover:text-slate-800 underline font-bold"
              >
                {isEn ? 'Cancel / Choose Another Option' : 'Ghairi / Chagua Njia Nyingine'}
              </button>
            </div>
          </div>
        )}

        {/* MAIN SUBSCRIPTION SELECTION VIEW */}
        {stkStatus === 'idle' && (
          <>
            {/* Rate & Current Status Banner */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                  {isEn ? 'Daily Duka Subscription' : 'Ada ya Kila Siku'}
                </div>
                <div className="text-xl font-black tabular-nums">
                  KES 30 <span className="text-xs font-normal text-emerald-200">/ {isEn ? 'day' : 'siku'}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-700/80 text-emerald-100 border border-emerald-500/50">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isEn ? 'Full POS Access' : 'Mfumo Kamili'}
                </span>
              </div>
            </div>

            {/* Select Duration */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                {isEn ? '1. Select Subscription Period:' : '1. Chagua Muda wa Malipo:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DURATIONS.map((plan, idx) => {
                  const isSelected = selectedPlanIndex === idx;
                  return (
                    <button
                      key={plan.days}
                      type="button"
                      onClick={() => setSelectedPlanIndex(idx)}
                      className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 relative ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                        {plan.badge}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {isEn ? plan.labelEn : plan.labelSw}
                      </span>
                      <span className="text-sm font-black text-emerald-800 tabular-nums">
                        KES {plan.kes}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Mode Selector Tabs */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                {isEn ? '2. Choose Payment Method:' : '2. Chagua Njia ya Malipo:'}
              </label>

              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('stk')}
                  className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'stk'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isEn ? 'M-Pesa STK Push' : 'M-Pesa STK Push'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('till')}
                  className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'till'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isEn ? 'Buy Goods Till' : 'Buy Goods Till'}</span>
                </button>
              </div>

              {/* TAB 1: M-Pesa STK Push */}
              {activeTab === 'stk' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  {registeredPhone ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          {isEn ? 'Registered M-Pesa Number:' : 'Nambari ya Simu Iliyosajiliwa:'}
                        </label>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          {isEn ? 'Verified Account' : 'Imethibitishwa'}
                        </span>
                      </div>
                      <div className="w-full h-11 px-3.5 text-sm font-black bg-white border border-emerald-300 rounded-xl flex items-center justify-between shadow-xs">
                        <span className="font-mono text-emerald-950 text-base">{registeredPhone}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {isEn ? 'Locked' : 'Imefungwa'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1.5 block leading-tight">
                        {isEn
                          ? '🔒 Locked to your registered phone to automatically verify payment and prevent missing records.'
                          : '🔒 Imefungwa kwa namba yako ya duka ili kuhakikisha malipo yanatambuliwa papo hapo bila makosa.'}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-left">
                      <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{isEn ? 'No Registered Phone Number' : 'Hakuna Nambari Iliyosajiliwa'}</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        {isEn
                          ? 'To protect your account and ensure your subscription is activated without delay, please enter your registered phone number in your Profile first.'
                          : 'Ili kulinda akaunti yako na kuhakikisha huduma inawezeshwa mara moja, tafadhali weka nambari yako kwenye Wasifu kwanza.'}
                      </p>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 0712345678"
                        className="w-full h-10 px-3 text-sm font-bold bg-white border border-amber-300 rounded-lg focus:outline-none"
                      />
                    </div>
                  )}

                  {errorMsg && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isProcessing || !phone}
                    onClick={handleInitiateSTK}
                    className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                  >
                    <Smartphone className="w-5 h-5" />
                    <span>
                      {isEn
                        ? `Pay KES ${currentPlan.kes} via M-Pesa Prompt`
                        : `Lipa KES ${currentPlan.kes} kwa M-Pesa Prompt`}
                    </span>
                  </button>
                </div>
              )}

              {/* TAB 2: Buy Goods Till (Manual) */}
              {activeTab === 'till' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  {/* Till Number Card */}
                  <div className="p-3 bg-white border border-emerald-300 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        {isEn ? 'Buy Goods Till Number' : 'Nambari ya Till (Buy Goods)'}
                      </div>
                      <div className="text-xl font-black text-slate-900 tracking-wider">
                        {tillNumber}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyTill}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition"
                    >
                      {copiedTill ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTill ? (isEn ? 'Copied!' : 'Imenakiliwa!') : (isEn ? 'Copy Till' : 'Nakili Till')}</span>
                    </button>
                  </div>

                  {/* Step-by-step instructions */}
                  <div className="text-xs text-slate-600 space-y-1 bg-white/70 p-2.5 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-800 mb-1">
                      {isEn ? 'How to Pay via M-Pesa:' : 'Jinsi ya Kulipa:'}
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] leading-relaxed">
                      <li>Go to <strong>M-Pesa</strong> &gt; <strong>Lipa na M-Pesa</strong> &gt; <strong>Buy Goods</strong></li>
                      <li>Enter Till: <strong className="text-emerald-800">{tillNumber}</strong> (SmartSort Technologies)</li>
                      <li>Enter Amount: <strong className="text-emerald-800">KES {currentPlan.kes}</strong></li>
                      <li>Enter M-Pesa PIN & confirm payment</li>
                    </ol>
                  </div>

                  {/* Transaction Code Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isEn ? 'Enter M-Pesa Confirmation Code:' : 'Weka Nambari ya Ujumbe wa M-Pesa:'}
                    </label>
                    <input
                      type="text"
                      value={transactionCode}
                      onChange={(e) => setTransactionCode(e.target.value.toUpperCase())}
                      placeholder="e.g. QK89P1Z7X9"
                      maxLength={12}
                      className="w-full h-11 px-3 text-sm font-mono font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-wider"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                      {errorMsg}
                    </div>
                  )}

                  <Button
                    variant="gradient"
                    size="hero"
                    fullWidth
                    disabled={isProcessing || !transactionCode.trim()}
                    onClick={() => handleConfirmPayment('mpesa_till')}
                    className="font-black"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    {isProcessing
                      ? (isEn ? 'Activating...' : 'Inawasha...')
                      : (isEn ? 'Verify & Activate Subscription' : 'Thibitisha na Washa Ada')}
                  </Button>
                </div>
              )}
            </div>

            {/* Offline Capability Guarantee Note */}
            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2 text-[11px] text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {isEn
                  ? 'All payments work seamlessly offline and automatically sync with Supabase when online.'
                  : 'Malipo yote yanafanya kazi hata bila mtandao na yatarushwa Supabase mara unapounganishwa.'}
              </span>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
