import React, { useState } from 'react';
import { CreditCard, Zap, ShieldAlert, Check, X, Phone } from 'lucide-react';
import { saveShopMeta, type ShopMeta } from '../lib/db/local';
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
  const [dismissed, setDismissed] = useState(false);

  if (!shop || dismissed) return null;

  const isEn = language === 'en';
  const now = Date.now();
  const paidUntilMs = shop.subscription_paid_until
    ? new Date(shop.subscription_paid_until).getTime()
    : 0;

  const msRemaining = paidUntilMs - now;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  // Expired or expiring within 16 hours
  const isExpired = msRemaining <= 0;
  const isDueSoon = hoursRemaining <= 16;
  const hasActiveAdminReminder = !!shop.subscription_reminder_active;

  if (!isExpired && !isDueSoon && !hasActiveAdminReminder) return null;

  const registeredPhone = (shop.phone || shop.alt_phone || '').trim();

  return (
    <div className="mx-3 my-2 p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-900 text-white border border-emerald-500/40 shadow-xl animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 mt-0.5">
            {isExpired || hasActiveAdminReminder ? (
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            ) : (
              <Zap className="w-5 h-5 text-emerald-300 animate-pulse" />
            )}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider bg-emerald-800/80 px-2 py-0.5 rounded-md border border-emerald-500/40">
                {hasActiveAdminReminder 
                  ? (isEn ? 'System Notice' : 'Kikumbusho cha Malipo')
                  : isEn ? 'Daily Duka Access Due' : 'Ada ya Kila Siku Inahitajika'}
              </span>
              {!hasActiveAdminReminder && (
                <span className="text-xs font-black text-amber-300">
                  KES 30 / day
                </span>
              )}
            </div>

            <p className="text-[11.5px] text-slate-200 leading-snug">
              {hasActiveAdminReminder
                ? (shop.admin_reminder_text || (isEn ? 'Subscription payment required.' : 'Malipo ya huduma yanahitajika.'))
                : isExpired
                ? (isEn
                    ? 'Your daily shop access is due. Pay to Paybill: 247247, Acc: 253499 with your registered number.'
                    : 'Ada ya duka ya leo inahitajika. Lipa kwa Paybill: 247247, Akaunti: 253499 kwa namba yako ya simu.')
                : (isEn
                    ? `Your shop access expires in ${Math.max(1, Math.round(hoursRemaining))} hours. Pay KES 30 to Equity Till (Paybill: 247247, Acc: 253499).`
                    : `Ada ya duka inaisha baada ya saa ${Math.max(1, Math.round(hoursRemaining))}. Lipa KES 30 kwa Paybill: 247247, Akaunti: 253499.`)}
            </p>

            {registeredPhone && !hasActiveAdminReminder && (
              <div className="text-[10px] text-emerald-300 font-medium flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <span>{isEn ? 'Pay from registered phone: ' : 'Lipa kwa simu iliyosajiliwa: '}<strong>{registeredPhone}</strong></span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            setDismissed(true);
            if (shop.subscription_reminder_active) {
              await saveShopMeta({ subscription_reminder_active: false });
            }
          }}
          className="p-1 text-slate-400 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
          title={isEn ? 'Dismiss' : 'Funga'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Button: I Have Paid */}
      <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-emerald-700/30">
        <button
          type="button"
          onClick={onOpenPaymentModal}
          className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>{isEn ? 'I Have Paid (Record Access)' : 'Nimelipa (Washa Huduma)'}</span>
        </button>
      </div>
    </div>
  );
};
