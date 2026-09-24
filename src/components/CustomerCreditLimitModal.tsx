import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { formatKES, type KES } from '../lib/money';
import type { UserRole } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface CustomerCreditLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  currentDebt: KES;
  cartTotal: KES;
  creditLimit: KES;
  isOverdue?: boolean;
  overdueDays?: number;
  userRole: UserRole;
  language?: Language;
  onPayCash: () => void;
  onOwnerOverride: (reason: string) => void;
}

export const CustomerCreditLimitModal: React.FC<CustomerCreditLimitModalProps> = ({
  isOpen,
  onClose,
  customerName,
  currentDebt,
  cartTotal,
  creditLimit,
  isOverdue,
  overdueDays = 30,
  userRole,
  language = 'en',
  onPayCash,
  onOwnerOverride,
}) => {
  const [reason, setReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);

  const isOwner = userRole === 'owner';
  const isEn = language === 'en';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? 'Credit Limit Exceeded' : 'Kikomo cha Deni Kimefikwa'}
      subtitle={customerName}
    >
      <div className="space-y-4 select-none">
        {/* Warning card */}
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 space-y-1">
            <p className="font-bold text-sm text-amber-900">
              {isEn
                ? 'This customer cannot take this credit without authorization.'
                : 'Mteja huyu hawezi kupewa mkopo huu bila idhini.'}
            </p>
            {isOverdue && (
              <p className="font-semibold text-rose-700">
                {isEn
                  ? `⚠ ${customerName} has debt overdue by more than ${overdueDays} days!`
                  : `⚠ ${customerName} ana deni lililochelewa zaidi ya siku ${overdueDays}!`}
              </p>
            )}
            <p className="text-slate-600">
              {isEn
                ? 'Total debt will exceed the shop allowed credit limit.'
                : 'Jumla ya deni litazidi kiwango kilichowekwa cha duka.'}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 text-sm">
          <div className="py-2 flex justify-between">
            <span className="text-slate-600">{isEn ? 'Current Outstanding Debt:' : 'Deni la Sasa:'}</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {formatKES(currentDebt)}
            </span>
          </div>
          <div className="py-2 flex justify-between">
            <span className="text-slate-600">{isEn ? 'This Sale:' : 'Mauzo Haya:'}</span>
            <span className="font-bold text-emerald-700 tabular-nums">
              {formatKES(cartTotal)}
            </span>
          </div>
          <div className="py-2 flex justify-between">
            <span className="text-slate-600">{isEn ? 'Allowed Credit Limit:' : 'Kikomo Kilichoruhusiwa:'}</span>
            <span className="font-bold text-rose-600 tabular-nums">
              {formatKES(creditLimit)}
            </span>
          </div>
        </div>

        {/* Override Input for Owner */}
        {showOverrideInput && isOwner && (
          <div className="p-3 bg-slate-100 rounded-xl space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              {isEn
                ? 'Reason for authorization (logged in shop audit report):'
                : 'Sababu ya kuruhusu (Itaingia kwenye ripoti ya duka):'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isEn
                  ? 'E.g. Paid half, promised to settle balance tomorrow...'
                  : 'Mfano: Mteja amelipa nusu, ataleta kesho...'
              }
              className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              autoFocus
            />
            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={reason.trim().length === 0}
              onClick={() => onOwnerOverride(reason)}
            >
              <Check className="w-4 h-4 mr-1.5" />
              {isEn ? 'Confirm Authorization' : 'Thibitisha Ruhusa'}
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <Button
            variant="gradient"
            size="hero"
            fullWidth
            onClick={onPayCash}
          >
            {isEn ? 'Pay with Cash instead' : 'Lipa kwa Pesa Taslimu (Cash)'}
          </Button>

          {isOwner ? (
            !showOverrideInput ? (
              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => setShowOverrideInput(true)}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <ShieldAlert className="w-4 h-4 mr-1.5" />
                {isEn ? 'Owner Override & Authorize' : 'Ruhusu Tu (Mwenye Duka)'}
              </Button>
            ) : null
          ) : (
            <div className="p-2.5 bg-slate-100 rounded-xl text-center text-xs text-slate-600 font-medium">
              {isEn
                ? 'Attendants cannot override credit limits. Please contact the shop owner.'
                : 'Mhudumu hawezi kuruhusu deni lililozidi kikomo. Wasiliana na mwenye duka.'}
            </div>
          )}

          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={onClose}
          >
            {isEn ? 'Cancel' : 'Ghairi'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
