import React, { useState, useEffect } from 'react';
import { Download, Share, X, CheckCircle, Smartphone, WifiOff } from 'lucide-react';
import { Button } from './Button';
import type { Language } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallModalProps {
  language?: Language;
  forceOpen?: boolean;
  onCloseForce?: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  language = 'en',
  forceOpen = false,
  onCloseForce,
}) => {
  const isEn = language === 'en';
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // 2. Check iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIOSDevice);

    // 3. Check dismissed flag in sessionStorage
    const dismissed = sessionStorage.getItem('smartsort_pwa_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    // 4. Capture browser install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          if (onCloseForce) onCloseForce();
        }
      } catch {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('smartsort_pwa_dismissed', 'true');
    if (onCloseForce) onCloseForce();
  };

  // If already running as installed PWA, do not show pop-up
  if (isInstalled) return null;

  // If dismissed and not manually forced open, hide
  const shouldShow = forceOpen || (!isDismissed && (deferredPrompt !== null || isIOS));

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 max-w-[420px] mx-auto animate-in slide-in-from-bottom-6 duration-300 pointer-events-auto">
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-2xl border border-slate-700/80 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl shadow-lg shrink-0">
              📲
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-sm text-slate-100">
                  {isEn ? 'Install SmartSort App' : 'Weka SmartSort Kwenye Simu'}
                </h3>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {isEn ? '100% Offline' : 'Bila Mtandao'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                {isEn
                  ? 'Add to home screen to sell anytime without data bundles.'
                  : 'Weka kwenye simu kuuza popote bila bando au mtandao.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800/80 transition"
            aria-label="Close install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Features preview */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{isEn ? 'Works without internet' : 'Inafanya kazi bila neti'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{isEn ? 'Instant 1-tap open' : 'Inafunguka papo hapo'}</span>
          </div>
        </div>

        {/* Step Guide if on iOS or if direct prompt was unavailable */}
        {showGuide && (
          <div className="bg-slate-800 p-3.5 rounded-2xl border border-slate-700 text-xs space-y-2 text-slate-200">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>{isIOS ? (isEn ? 'How to install on iPhone:' : 'Jinsi ya kuweka kwenye iPhone:') : (isEn ? 'How to install:' : 'Jinsi ya kuweka:')}</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-300 pl-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-900 font-black flex items-center justify-center text-[10px]">1</span>
                <span>{isIOS ? (isEn ? 'Tap the Safari Share icon' : 'Gusa kitufe cha Shiriki') : (isEn ? 'Tap browser menu (3 dots)' : 'Gusa menyu ya browser (vidoti 3)')} <Share className="w-3 h-3 inline mx-0.5 text-emerald-400" /></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-900 font-black flex items-center justify-center text-[10px]">2</span>
                <span>{isEn ? 'Select "Add to Home Screen"' : 'Chagua "Weka kwenye Skrini ya Mwanzo"'} ➕</span>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="gradient"
            size="md"
            fullWidth
            onClick={handleInstallClick}
            className="flex items-center justify-center gap-2 font-black shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>{isEn ? 'Install App' : 'Weka Kwenye Simu'}</span>
          </Button>

          <Button
            variant="ghost"
            size="md"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white shrink-0 text-xs"
          >
            {isEn ? 'Later' : 'Baadaye'}
          </Button>
        </div>
      </div>
    </div>
  );
};
