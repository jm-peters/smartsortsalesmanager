import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { type OnboardingStep } from '../lib/db/local';
import { translations, type Language } from '../lib/i18n';

interface ProfileCompletionBannerProps {
  onboardingStep: OnboardingStep;
  language: Language;
  onOpenStep: (step: 'contact' | 'location' | 'plan') => void;
  onGoToProfile: () => void;
}

export const ProfileCompletionBanner: React.FC<ProfileCompletionBannerProps> = ({
  onboardingStep,
  language,
  onOpenStep,
  onGoToProfile,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const t = translations[language];

  if (onboardingStep === 'complete' || isDismissed) {
    return null;
  }

  // Calculate current step number out of 4:
  // 1: account_created (done)
  // 2: contact
  // 3: location
  // 4: plan
  let currentNum = 2;
  let targetStep: 'contact' | 'location' | 'plan' = 'contact';
  let nudgeText = t.nudgeContact;

  if (onboardingStep === 'location') {
    currentNum = 3;
    targetStep = 'location';
    nudgeText = t.nudgeLocation;
  } else if (onboardingStep === 'plan') {
    currentNum = 4;
    targetStep = 'plan';
    nudgeText = t.nudgePlan;
  }

  return (
    <div className="mx-3 my-2 p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-200/80 rounded-2xl shadow-xs flex items-center justify-between gap-3 animate-in fade-in duration-300 select-none">
      <div
        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpenStep(targetStep)}
      >
        <div className="w-8 h-8 rounded-xl bg-brand-gradient text-white flex items-center justify-center shrink-0 shadow-xs">
          <Sparkles className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-slate-900 leading-tight truncate">
              {t.profileCompletionBanner}
            </span>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded-md shrink-0">
              {t.stepOf(currentNum, 4)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 truncate mt-0.5">{nudgeText}</div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onOpenStep(targetStep)}
          className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg shadow-2xs flex items-center gap-1 transition active:scale-95"
        >
          <span>{language === 'en' ? 'Complete' : 'Kamilisha'}</span>
          <ArrowRight className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 flex items-center justify-center transition"
          aria-label={t.dismiss}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
