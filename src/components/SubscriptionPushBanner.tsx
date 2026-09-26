import React from 'react';
import { CreditCard, Zap, Clock, ShieldAlert, ArrowRight, X } from 'lucide-react';
import type { ShopMeta } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface SubscriptionPushBannerProps {
  shop: ShopMeta | null;
  language: Language;
  onOpenPaymentModal: () => void;
}

export const SubscriptionPushBanner: React.FC<SubscriptionPushBannerProps> = ({
  shop,
  language,
  onOpenPaymentModal,
}) => {
  const [dismissed, setDismissed] = React.useState(false);

  if (!shop || dismissed) return null;

  const isEn = language === 'en';
  const now = Date.now();
  const paidUntilMs = shop.subscription_paid_until
    ? new Date(shop.subscription_paid_until).getTime()
    : 0;

  const msRemaining = paidUntilMs - now;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  // Check if daily or weekly plan
  const isWeekly = shop.plan_code?.includes('weekly') || shop.plan_name?.toLowerCase().includes('week');
  const isExpired = msRemaining <= 0;
  // Daily triggers if expired or expiring within 12 hours. Weekly triggers when ending (<24h)
  const isDueSoon = isWeekly ? hoursRemaining <= 24 : hoursRemaining <= 12;

  if (!isExpired && !isDueSoon) return null;

  const amount = isWeekly ? 180 : 30;
  const periodLabel = isWeekly ? (isEn ? 'Weekly' : 'Wiki') : (isEn ? 'Daily' : 'Kila Siku');

  return (
    <div className="mx-3 my-2 p-3 rounded-2xl bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-700 text-white shadow-lg animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 mt-0.5">
            {isExpired ? (
              <ShieldAlert className="w-5 h-5 text-amber-200" />
            ) : (
              <Zap className="w-5 h-5 text-emerald-200 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-md">
                {periodLabel} {isEn ? 'Subscription Due' : 'Ada Inahitajika'}
              </span>
              <span className="text-xs font-black text-amber-200">
                KES {amount}
              </span>
            </div>
            <p className="text-[11px] text-white/90 mt-0.5 leading-snug">
              {isExpired
                ? (isEn
                    ? 'Your daily shop access is due today. Renew instantly to keep selling and sync uninterrupted.'
                    : 'Ada ya leo ya duka inahitajika. Lipa sasa ili uendelee kuuza bila kukatizwa.')
                : (isEn
                    ? `Your ${periodLabel.toLowerCase()} access expires in ${Math.max(1, Math.round(hoursRemaining))} hours.`
                    : `Ada yako ya ${periodLabel.toLowerCase()} inaisha baada ya saa ${Math.max(1, Math.round(hoursRemaining))}.`)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 text-white/60 hover:text-white rounded-lg transition shrink-0"
          title={isEn ? 'Dismiss' : 'Funga'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-2 pt-1 border-t border-white/20">
        <button
          type="button"
          onClick={onOpenPaymentModal}
          className="px-4 py-1.5 bg-white hover:bg-emerald-50 text-emerald-900 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
        >
          <span>{isEn ? `Pay KES ${amount} (M-Pesa STK)` : `Lipa KES ${amount} (M-Pesa)`}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
