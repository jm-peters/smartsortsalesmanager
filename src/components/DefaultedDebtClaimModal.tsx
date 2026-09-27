import React, { useState } from 'react';
import {
  ShieldCheck,
  Phone,
  MessageCircle,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES, type KES } from '../lib/money';
import {
  type DefaultedDebtClaimOptions,
  generateDefaultedDebtClaimText,
  openDefaultedHelplineWhatsApp,
  shareDefaultedDebtClaim,
  SMARTSORT_HELPLINE_PHONE,
  SMARTSORT_HELPLINE_DISPLAY,
} from '../lib/reminder';
import type { Language } from '../lib/i18n';

interface DefaultedDebtClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtId: string;
  customerName: string;
  customerPhone?: string | null;
  shopName: string;
  principal: number | KES;
  balance: number | KES;
  daysOld: number;
  compensationAmount: number | KES;
  language?: Language;
  sellerName?: string;
  shopPhone?: string;
}

export const DefaultedDebtClaimModal: React.FC<DefaultedDebtClaimModalProps> = ({
  isOpen,
  onClose,
  debtId,
  customerName,
  customerPhone,
  shopName,
  principal,
  balance,
  daysOld,
  compensationAmount,
  language = 'en',
  sellerName,
  shopPhone,
}) => {
  const isEn = language === 'en';
  const [copied, setCopied] = useState(false);

  const claimOptions: DefaultedDebtClaimOptions = {
    debtId,
    customerName,
    customerPhone,
    shopName,
    principal,
    balance,
    daysOld,
    compensationAmount,
    language,
    sellerName,
    shopPhone,
  };

  const claimRef = `CLAIM-70-${debtId.slice(0, 8).toUpperCase()}`;
  const claimSummaryText = generateDefaultedDebtClaimText(claimOptions);

  const handleCopyClaim = async () => {
    await shareDefaultedDebtClaim(claimOptions, 'copy');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppClaim = () => {
    openDefaultedHelplineWhatsApp(claimOptions);
  };

  const handleCallHelpline = () => {
    if (typeof window !== 'undefined') {
      window.location.href = `tel:${SMARTSORT_HELPLINE_PHONE}`;
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? 'Defaulted Debt Compensation' : 'Fidia ya Deni Lililofifia (70%)'}
      subtitle={isEn ? 'Merchant Credit Protection Helpline' : 'Dawati la Msaada wa Fidia ya Wauzaji'}
    >
      <div className="space-y-4 select-none pb-2">
        {/* Protection Shield Header Card */}
        <div className="p-4 bg-gradient-to-br from-amber-500 via-amber-600 to-rose-600 text-white rounded-2xl shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-black uppercase tracking-wider">
              {isEn ? '2+ Months Overdue' : 'Zaidi ya Miezi 2'}
            </span>
            <span className="text-xs font-bold text-amber-100 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {daysOld} {isEn ? 'days' : 'siku'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">
              🛡️
            </div>
            <div>
              <div className="text-xs font-semibold text-amber-100 uppercase tracking-wider">
                {isEn ? 'Eligible 70% Compensation' : 'Kiasi cha Fidia ya 70%'}
              </div>
              <div className="text-2xl font-black tabular-nums">
                {formatKES(compensationAmount)}
              </div>
            </div>
          </div>
        </div>

        {/* Policy Explanation Banner */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5 leading-relaxed">
          <div className="font-bold flex items-center gap-1.5 text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{isEn ? 'Merchant Default Protection Policy' : 'Sera ya Kinga ya Deni Lililofifia'}</span>
          </div>
          <p>
            {isEn
              ? 'Any product debt that has remained uncollected after 2 months (60+ days) is considered officially defaulted. As a verified merchant, you are entitled to a 70% compensation of the product price.'
              : 'Deni lolote la bidhaa ambalo halijalipwa baada ya miezi 2 (zaidi ya siku 60) huchukuliwa kama lililofifia. Kama muuzaji, unastahiki fidia ya 70% ya bei ya bidhaa.'}
          </p>
          <p className="font-semibold text-amber-950">
            {isEn
              ? 'Please contact the SmartSort Helpline below with your claim reference to request compensation assistance.'
              : 'Tafadhali wasiliana na dawati la msaada la SmartSort hapa chini na nambari yako ya ombi ili upokee msaada wa fidia.'}
          </p>
        </div>

        {/* Claim Summary Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-slate-500 font-semibold">{isEn ? 'Claim Reference:' : 'Nambari ya Ombi:'}</span>
            <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
              {claimRef}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block">{isEn ? 'Customer:' : 'Mteja:'}</span>
              <span className="font-bold text-slate-800">{customerName}</span>
              {customerPhone && <span className="text-[10px] text-slate-500 block">{customerPhone}</span>}
            </div>
            <div>
              <span className="text-slate-400 block">{isEn ? 'Overdue Time:' : 'Muda Uliopita:'}</span>
              <span className="font-bold text-rose-600">{daysOld} {isEn ? 'Days' : 'Siku'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
            <div>
              <span className="text-slate-400 block">{isEn ? 'Product Debt (100%):' : 'Deni la Awali (100%):'}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatKES(principal)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">{isEn ? 'Entitled Compensation (70%):' : 'Kiasi cha Fidia (70%):'}</span>
              <span className="font-black text-emerald-700 tabular-nums">{formatKES(compensationAmount)}</span>
            </div>
          </div>
        </div>

        {/* Helpline Contact Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* WhatsApp to Helpline */}
          <button
            type="button"
            onClick={handleWhatsAppClaim}
            className="w-full py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-black shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="text-base leading-none">💬</span>
            <span>{isEn ? 'Submit Claim via WhatsApp Helpline' : 'Tuma Ombi kwa WhatsApp ya Msaada'}</span>
          </button>

          {/* Call Helpline Desk */}
          <button
            type="button"
            onClick={handleCallHelpline}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
            <span>
              {isEn ? `Call Claims Helpline (${SMARTSORT_HELPLINE_DISPLAY})` : `Piga Simu Dawati la Fidia (${SMARTSORT_HELPLINE_DISPLAY})`}
            </span>
          </button>

          {/* Copy Claim Summary */}
          <button
            type="button"
            onClick={handleCopyClaim}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-bold">{isEn ? 'Claim Summary Copied!' : 'Ombi Limenakiliwa!'}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>{isEn ? 'Copy Full Claim Summary' : 'Nakili Maelezo ya Ombi'}</span>
              </>
            )}
          </button>
        </div>

        {/* Disclaimer note */}
        <p className="text-[10px] text-slate-400 text-center pt-1 leading-relaxed">
          {isEn
            ? 'Helpline support hours: 7:00 AM – 9:00 PM EAT. Payout verification requires shop transaction history.'
            : 'Masaa ya huduma ya simu: Saa 1:00 Asubuhi – Saa 3:00 Usiku. Uhakiki wa malipo huhitaji historia ya miamala ya duka.'}
        </p>
      </div>
    </Sheet>
  );
};
