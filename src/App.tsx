import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Boxes,
  BookOpen,
  BarChart3,
  Settings as SettingsIcon,
  Store,
  User as UserIcon,
  Globe,
  Sparkles,
} from 'lucide-react';
import {
  db,
  initializeDefaultDatabase,
  getShopUser,
  getShopMeta,
  saveShopMeta,
  saveShopUser,
  type ShopUser,
  type UserRole,
  type Shop,
} from './lib/db/local';
import { syncEngine } from './lib/sync/engine';
import { SellScreen } from './screens/SellScreen';
import { StockScreen } from './screens/StockScreen';
import { DeniScreen } from './screens/DeniScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OfflineBanner } from './components/OfflineBanner';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ProfileCompletionBanner } from './components/ProfileCompletionBanner';
import { ProfileStepModal, type StepType } from './components/ProfileStepModal';
import { PWAInstallModal } from './components/PWAInstallModal';
import { translations, type Language } from './lib/i18n';

type Tab = 'sell' | 'stock' | 'deni' | 'reports' | 'profile' | 'settings';

export default function App() {
  const [user, setUser] = useState<ShopUser | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [currentTab, setCurrentTab] = useState<Tab>('sell');
  const [userRole, setUserRole] = useState<UserRole>('owner');
  // Default language is English (as requested: "make english the default language with a change language option at the top etc")
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('smartsort_lang');
      if (saved === 'sw' || saved === 'en') return saved;
    }
    return 'en';
  });
  const [isInitializing, setIsInitializing] = useState(true);

  // Active step modal from completion banner
  const [activeStepModal, setActiveStepModal] = useState<StepType | null>(null);

  const t = translations[language];

  // Save language preference
  const handleToggleLanguage = () => {
    const nextLang: Language = language === 'en' ? 'sw' : 'en';
    setLanguage(nextLang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('smartsort_lang', nextLang);
    }
  };

  // Initialize and check user session
  useEffect(() => {
    async function init() {
      try {
        const existingUser = await getShopUser();
        const existingShop = await getShopMeta();
        if (!existingUser) {
          // Seed initial Kenyan duka data
          const seeded = await initializeDefaultDatabase();
          setUser(seeded.user);
          setShop(seeded.shop);
          setUserRole(seeded.user.role);
        } else {
          // Shop already setup, await PIN or password unlock
          setShop(existingShop);
        }
      } catch (err) {
        console.error('Database initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    init();

    // Start background sync listeners
    syncEngine.triggerSync();
  }, []);

  // Update shop info
  const handleUpdateShop = (name: string, till: string) => {
    setShop((prev: Shop | null) => (prev ? { ...prev, shop_name: name, till_number: till } : null));
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center text-3xl animate-pulse mb-3">
          🏪
        </div>
        <div className="font-bold text-base text-slate-100">SmartSort Sales Manager</div>
        <div className="text-xs text-slate-400 mt-1">Starting up your duka...</div>
      </div>
    );
  }

  // If user not unlocked/authenticated, display Auth screen (Login, Sign up, or PIN unlock)
  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(authenticatedUser, authenticatedShop) => {
          setUser(authenticatedUser);
          setShop(authenticatedShop);
          setUserRole(authenticatedUser.role);
        }}
        language={language}
        onToggleLanguage={handleToggleLanguage}
      />
    );
  }

  const shopName = shop?.shop_name || 'SmartSort Duka';
  const tillNumber = shop?.till_number || '542190';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center">
      {/* Mobile Shell Wrapper (max 420px mobile viewport) */}
      <div className="w-full max-w-[420px] bg-slate-50 min-h-screen shadow-2xl flex flex-col relative">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shadow-2xs">
          {/* Left: Avatar button (tap to open Profile) + Shop Name */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentTab('profile')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition active:scale-95 shrink-0 ${
                currentTab === 'profile'
                  ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
              }`}
              title={t.profile}
              aria-label={t.profile}
            >
              <span>{shop?.avatar_emoji || '🏪'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('profile')}
              className="text-left truncate focus:outline-none"
            >
              <div className="font-black text-sm text-slate-900 truncate leading-tight flex items-center gap-1.5">
                <span className="truncate">{shopName}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-md uppercase tracking-wider ${
                    userRole === 'owner'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {userRole === 'owner' ? t.owner : t.attendant}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  • {shop?.town || 'Kangemi'}
                </span>
              </div>
            </button>
          </div>

          {/* Right: Language Switcher, Offline Indicator, Settings Gear */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Language Switcher Option at the Top (English default, toggle to Kiswahili) */}
            <button
              type="button"
              onClick={handleToggleLanguage}
              className="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1 transition shadow-2xs border border-slate-200"
              title="Change Language / Badili Lugha"
            >
              <Globe className="w-3 h-3 text-emerald-600" />
              <span>{language === 'en' ? '🇰🇪 SW' : '🇬🇧 EN'}</span>
            </button>

            <PWAInstallButton language={language} />
            <OfflineBanner language={language} />

            {/* Settings Gear */}
            <button
              type="button"
              onClick={() => setCurrentTab('settings')}
              className={`p-1.5 rounded-xl border transition ${
                currentTab === 'settings'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-200'
              }`}
              title={t.settings}
              aria-label={t.settings}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Profile Completion Non-Blocking Banner (Doc 1 §6) */}
        {currentTab === 'sell' && (
          <ProfileCompletionBanner
            onboardingStep={user.onboarding_step}
            language={language}
            onOpenStep={(step) => setActiveStepModal(step)}
            onGoToProfile={() => setCurrentTab('profile')}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {currentTab === 'sell' && (
            <SellScreen
              userRole={userRole}
              shopName={shopName}
              tillNumber={tillNumber}
              language={language}
              onNavigateToStock={() => setCurrentTab('stock')}
              onNavigateToDeni={() => setCurrentTab('deni')}
            />
          )}

          {currentTab === 'stock' && (
            <StockScreen userRole={userRole} shopName={shopName} language={language} />
          )}

          {currentTab === 'deni' && (
            <DeniScreen
              userRole={userRole}
              shopName={shopName}
              tillNumber={tillNumber}
              language={language}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsScreen userRole={userRole} shopName={shopName} language={language} />
          )}

          {currentTab === 'profile' && shop && (
            <ProfileScreen
              shop={shop}
              user={user}
              language={language}
              onUpdateShop={(s) => setShop(s)}
              onUpdateUser={(u) => setUser(u)}
              onNavigateTab={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsScreen
              userRole={userRole}
              onChangeRole={setUserRole}
              language={language}
              onChangeLanguage={setLanguage}
              shopName={shopName}
              tillNumber={tillNumber}
              onUpdateShopInfo={handleUpdateShop}
              onLogout={() => setUser(null)}
            />
          )}
        </main>

        {/* Bottom Navigation Bar (5 Primary Tabs) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200">
          <div className="w-full max-w-[420px] mx-auto flex items-center justify-around h-16 px-1">
            {/* Sell (Uza) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                  window.navigator.vibrate(10);
                }
                setCurrentTab('sell');
              }}
              className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 transition ${
                currentTab === 'sell'
                  ? 'text-emerald-700 font-black scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="text-[11px] font-bold">{t.sell}</span>
            </button>

            {/* Stock */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                  window.navigator.vibrate(10);
                }
                setCurrentTab('stock');
              }}
              className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 transition ${
                currentTab === 'stock'
                  ? 'text-emerald-700 font-black scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Boxes className="w-5 h-5" />
              <span className="text-[11px] font-bold">{t.stock}</span>
            </button>

            {/* Deni (Credit) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                  window.navigator.vibrate(10);
                }
                setCurrentTab('deni');
              }}
              className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 transition ${
                currentTab === 'deni'
                  ? 'text-emerald-700 font-black scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="text-[11px] font-bold">{t.deni}</span>
            </button>

            {/* Reports (Ripoti) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                  window.navigator.vibrate(10);
                }
                setCurrentTab('reports');
              }}
              className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 transition ${
                currentTab === 'reports'
                  ? 'text-emerald-700 font-black scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="text-[11px] font-bold">{t.reports}</span>
            </button>

            {/* Profile (Wasifu wa Duka) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                  window.navigator.vibrate(10);
                }
                setCurrentTab('profile');
              }}
              className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 transition ${
                currentTab === 'profile'
                  ? 'text-emerald-700 font-black scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="text-[11px] font-bold">{language === 'en' ? 'Profile' : 'Wasifu'}</span>
            </button>
          </div>
        </nav>

        {/* Profile Step Modal when clicked from banner */}
        {activeStepModal && shop && (
          <ProfileStepModal
            isOpen={Boolean(activeStepModal)}
            onClose={() => setActiveStepModal(null)}
            stepType={activeStepModal}
            shop={shop}
            user={user}
            language={language}
            onSuccess={(updatedShop, updatedUser) => {
              setShop(updatedShop);
              setUser(updatedUser);
            }}
          />
        )}

        {/* PWA Offline Install Pop-up */}
        <PWAInstallModal language={language} />
      </div>
    </div>
  );
}
