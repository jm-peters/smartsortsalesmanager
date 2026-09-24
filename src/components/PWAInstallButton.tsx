import React, { useState, useEffect } from 'react';
import { Download, Share, X } from 'lucide-react';
import type { Language } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallButtonProps {
  language?: Language;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ language = 'en' }) => {
  const isEn = language === 'en';
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if running in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) return null;

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-sm active:bg-emerald-700 transition"
      >
        <Download className="w-4 h-4" />
        {isEn ? 'Install App' : 'Weka App (Install)'}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          {isEn ? 'Install App' : 'Weka kwenye iPhone'}
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {isEn ? 'Install App on iPhone' : 'Weka App kwenye iPhone'}
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-xs text-slate-600 space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold flex-shrink-0 text-[11px]">
                    1
                  </span>
                  <span>
                    {isEn ? (
                      <>
                        Tap the <strong>Share</strong>{' '}
                        <Share className="w-3.5 h-3.5 inline mx-0.5" /> button at the bottom of Safari.
                      </>
                    ) : (
                      <>
                        Gusa kitufe cha <strong>Shiriki (Share)</strong>{' '}
                        <Share className="w-3.5 h-3.5 inline mx-0.5" /> chini ya Safari.
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold flex-shrink-0 text-[11px]">
                    2
                  </span>
                  <span>
                    {isEn ? (
                      <>
                        Scroll down and tap <strong>Add to Home Screen</strong>.
                      </>
                    ) : (
                      <>
                        Shuka chini na uguse <strong>Weka kwenye Skrini ya Mwanzo (Add to Home Screen)</strong>.
                      </>
                    )}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-11 bg-slate-100 font-bold text-xs text-slate-800 rounded-xl active:bg-slate-200"
              >
                {isEn ? 'Got it' : 'Nimeelewa'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
