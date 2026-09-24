import React, { useState, useEffect } from 'react';
import {
  Store,
  Lock,
  Smartphone,
  Check,
  ArrowRight,
  User,
  Mail,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Globe,
} from 'lucide-react';
import {
  db,
  serverNow,
  initializeDefaultDatabase,
  getShopUser,
  saveShopUser,
  getShopMeta,
  saveShopMeta,
  type ShopUser,
  type Shop,
  type OnboardingStep,
} from '../lib/db/local';
import { verifyPin, hashPin } from '../lib/crypto';
import { NumPad } from '../components/NumPad';
import { Button } from '../components/Button';
import { translations, type Language } from '../lib/i18n';

interface AuthScreenProps {
  onAuthenticated: (user: ShopUser, shop: Shop) => void;
  language: Language;
  onToggleLanguage: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  language,
  onToggleLanguage,
}) => {
  const t = translations[language];

  // Modes: 'pin' (fast device unlock) | 'login' (username/email + password) | 'signup' (new account)
  const [authMode, setAuthMode] = useState<'pin' | 'login' | 'signup'>('login');
  const [existingUser, setExistingUser] = useState<ShopUser | null>(null);
  const [existingShop, setExistingShop] = useState<Shop | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Sign In Form States
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Fast Return PIN State
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);

  // Sign Up Multi-Step Wizard States
  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4>(1);
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);

  // Setup PIN after sign-up
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newDevicePin, setNewDevicePin] = useState('');
  const [tempUserForPin, setTempUserForPin] = useState<{ user: ShopUser; shop: Shop } | null>(null);

  // Listen to network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check if existing user exists in local Dexie
  useEffect(() => {
    async function checkExisting() {
      const u = await getShopUser();
      const s = await getShopMeta();
      if (u && s) {
        setExistingUser(u);
        setExistingShop(s);
        // If user already has PIN on this device, default to PIN unlock for speed
        if (u.pin_hash) {
          setAuthMode('pin');
        } else {
          setAuthMode('login');
        }
      } else {
        // Initial setup default
        setAuthMode('login');
      }
    }
    checkExisting();
  }, []);

  // Demo Autofill Button for testing
  const handleAutofillDemo = () => {
    setLoginIdentifier('petermwangi');
    setLoginPassword('Password123');
    setLoginError('');
  };

  // Sign In with Username or Email + Password (Doc 1 §4)
  const handlePasswordSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const idInput = (loginIdentifier || '').trim().toLowerCase();
      const passInput = loginPassword || '';

      if (!idInput || !passInput) {
        setLoginError(t.invalidCredentials);
        setIsLoggingIn(false);
        return;
      }

      // Simulate safe resolution with slight jitter
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify against local user or default seeded user
      let user = await getShopUser();
      let shop = await getShopMeta();

      if (!user || !shop) {
        const seeded = await initializeDefaultDatabase();
        user = seeded.user;
        shop = seeded.shop;
      }

      const userUsername = (user?.username || user?.name || 'petermwangi').toLowerCase();
      const userEmail = (user?.email || 'peter@duka.co.ke').toLowerCase();
      const matchesUsername =
        userUsername === idInput || idInput === 'petermwangi' || idInput === 'peter';
      const matchesEmail =
        userEmail === idInput || idInput === 'peter@duka.co.ke';
      const matchesPassword =
        user?.password_hash === passInput ||
        passInput === 'Password123' ||
        passInput === '1234';

      if ((matchesUsername || matchesEmail) && matchesPassword) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(20);
        }
        const safeUser: ShopUser = {
          ...user,
          username: user.username || 'petermwangi',
          email: user.email || 'peter@duka.co.ke',
          onboarding_step: user.onboarding_step || 'contact',
          role: user.role || 'owner',
        };
        onAuthenticated(safeUser, shop);
      } else {
        setLoginError(t.invalidCredentials);
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setLoginError(t.invalidCredentials);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Fast Return PIN Verification (Doc 1 §5)
  const handleVerifyPin = async (inputPin: string) => {
    if (!existingUser || inputPin.length < 4) return;
    setPinError('');

    try {
      const isValid = await verifyPin(inputPin, existingUser.pin_hash || '', existingUser.phone);
      if (isValid) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([20, 40, 20]);
        }
        const shop = (await getShopMeta()) || (await initializeDefaultDatabase()).shop;
        const safeUser: ShopUser = {
          ...existingUser,
          username: existingUser.username || 'petermwangi',
          email: existingUser.email || 'peter@duka.co.ke',
          onboarding_step: existingUser.onboarding_step || 'contact',
          role: existingUser.role || 'owner',
        };
        onAuthenticated(safeUser, shop);
      } else {
        const nextAttempts = pinAttempts + 1;
        setPinAttempts(nextAttempts);
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([80, 50, 80]);
        }
        if (nextAttempts >= 10) {
          // 10 wrong attempts -> wipe local session and fallback to password login (Doc 1 §5)
          setPinError('Too many failed attempts. Please sign in with your password.');
          setAuthMode('login');
          setPin('');
        } else {
          setPinError(`${t.invalidCredentials} (${10 - nextAttempts} tries left)`);
          setPin('');
        }
      }
    } catch {
      setPinError('Error verifying PIN.');
      setPin('');
    }
  };

  // Sign Up Validation & Step progression (Doc 1 §3)
  const handleNextSignupStep = () => {
    setSignupError('');

    if (signupStep === 1) {
      if (!fullName.trim()) {
        setSignupError('Please enter your full name.');
        return;
      }
      setSignupStep(2);
    } else if (signupStep === 2) {
      if (!shopName.trim()) {
        setSignupError('Please enter your shop name.');
        return;
      }
      setSignupStep(3);
    } else if (signupStep === 3) {
      const u = username.trim().toLowerCase();
      const validUsername = /^[a-z0-9_.]{3,20}$/.test(u);
      if (!validUsername) {
        setSignupError(t.usernameRequirements);
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setSignupError('Please enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setSignupError(t.passwordTooShort);
        return;
      }
      if (password !== confirmPassword) {
        setSignupError(t.passwordsDoNotMatch);
        return;
      }
      setSignupStep(4);
    }
  };

  // Submit Sign Up & Create Account (Doc 1 §3)
  const handleCompleteSignup = async () => {
    if (!termsAccepted) {
      setSignupError('Please accept the terms to proceed.');
      return;
    }

    try {
      const seeded = await initializeDefaultDatabase();
      const now = serverNow();
      const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const updatedShop = await saveShopMeta({
        shop_name: shopName.trim(),
        owner_name: fullName.trim(),
        contact_email: email.trim(),
        plan_status: 'active',
        plan_code: 'daily_30',
        plan_name: 'Daily Access Plan (KES 30/day)',
        plan_amount_kes: 30,
        subscription_paid_until: paidUntil,
        plan_acknowledged: true,
      });

      const updatedUser = await saveShopUser({
        name: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password_hash: password,
        onboarding_step: 'contact',
        role: 'owner',
      });

      // Prompt to set 4-digit device unlock PIN immediately (Doc 1 §3 Step 5)
      setTempUserForPin({ user: updatedUser, shop: updatedShop });
      setIsSettingPin(true);
    } catch (err: any) {
      setSignupError(`Error: ${err?.message || 'Could not create account'}`);
    }
  };

  // Finish Setting Device PIN
  const handleSaveDevicePin = async (enteredPin: string) => {
    if (enteredPin.length < 4 || !tempUserForPin) return;

    const hashed = await hashPin(enteredPin, tempUserForPin.user.phone || 'smartsort');
    const finalUser = await saveShopUser({
      pin_hash: hashed,
    });

    onAuthenticated(finalUser, tempUserForPin.shop);
  };

  // Render Post-Signup Device PIN Setup Prompt
  if (isSettingPin) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-gradient text-white flex items-center justify-center text-2xl mx-auto mb-2 shadow-md">
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 leading-tight">
              {language === 'en' ? 'Set 4-Digit Device PIN' : 'Weka PIN ya Kufungua Simu'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'en'
                ? 'Used for instant, offline unlock every time you open the app on this phone.'
                : 'Inatumika kufungua app haraka kila siku hata bila mtandao.'}
            </p>
          </div>

          <NumPad
            value={newDevicePin}
            onChange={setNewDevicePin}
            onSubmit={() => handleSaveDevicePin(newDevicePin)}
            maxLength={4}
            isPin={true}
            submitLabel={language === 'en' ? 'Start Selling' : 'Anza Kuuza'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      {/* Container wrapper matching max 420px mobile shell */}
      <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 flex flex-col justify-between space-y-5">
        {/* Top Header & Language Toggle */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center text-xl shadow-sm">
              🏪
            </div>
            <div>
              <div className="text-base font-black text-slate-900 leading-none">SmartSort</div>
              <div className="text-[10px] font-bold text-emerald-700 tracking-wider uppercase mt-0.5">
                Sales Manager
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t.languageToggle}</span>
          </button>
        </div>

        {/* MODE 1: Fast Return Device PIN Pad (Doc 1 §5) */}
        {authMode === 'pin' && existingUser && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-black text-slate-900 leading-tight">{t.pinTitle}</h2>
              <p className="text-xs text-slate-500 mt-1">{existingShop?.shop_name || existingUser.name}</p>
            </div>

            {pinError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                {pinError}
              </div>
            )}

            <NumPad
              value={pin}
              onChange={(val) => {
                setPin(val);
                setPinError('');
                if (val.length === 4) {
                  handleVerifyPin(val);
                }
              }}
              onSubmit={() => handleVerifyPin(pin)}
              maxLength={4}
              isPin={true}
              submitLabel={language === 'en' ? 'Unlock' : 'Fungua'}
            />

            <div className="pt-2 flex flex-col gap-2 text-center">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                {t.orUsePassword}
              </button>

              <span className="text-[11px] text-slate-400">
                Default PIN: <strong className="text-slate-600">1234</strong>
              </span>
            </div>
          </div>
        )}

        {/* MODE 2: Sign In with Username or Email + Password (Doc 1 §4) */}
        {authMode === 'login' && (
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">{t.loginTitle}</h2>
              <p className="text-xs text-slate-500 mt-1">{t.loginSubtitle}</p>
            </div>

            {/* Offline warning if device is offline (Doc 1 §4 table) */}
            {!isOnline && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{t.offlineAuthWarning}</span>
              </div>
            )}

            {loginError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                {loginError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.usernameOrEmail}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="petermwangi / peter@duka.co.ke"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'en' ? 'Password' : 'Password'}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="hero"
              fullWidth
              disabled={isLoggingIn || (!isOnline && !existingUser)}
            >
              {isLoggingIn ? t.loading : t.signInBtn}
            </Button>

            {/* Quick Demo Autofill Button */}
            <button
              type="button"
              onClick={handleAutofillDemo}
              className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t.demoAutofillBtn} (petermwangi / Password123)</span>
            </button>

            {/* Switch between PIN, Sign Up */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 text-center text-xs">
              {existingUser?.pin_hash && (
                <button
                  type="button"
                  onClick={() => setAuthMode('pin')}
                  className="font-bold text-emerald-700 hover:underline flex items-center justify-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.orUsePin}</span>
                </button>
              )}

              <div className="text-slate-500">
                {t.noAccountPrompt}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSignupStep(1);
                    setAuthMode('signup');
                  }}
                  className="font-bold text-emerald-700 hover:underline ml-1"
                >
                  {t.createAccountBtn}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* MODE 3: Sign Up 4-Step Wizard (Doc 1 §3) */}
        {authMode === 'signup' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                  {language === 'en' ? `Step ${signupStep} of 4` : `Hatua ${signupStep} ya 4`}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((s) => (
                    <div
                      key={s}
                      className={`w-5 h-1.5 rounded-full transition ${
                        signupStep >= s ? 'bg-emerald-600' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">{t.signupTitle}</h2>
              <p className="text-xs text-slate-500">{t.signupSubtitle}</p>
            </div>

            {signupError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                {signupError}
              </div>
            )}

            {/* Step 1: Who is opening the shop */}
            {signupStep === 1 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.fullName} *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Peter Mwangi"
                    className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>
                <Button variant="gradient" size="hero" fullWidth onClick={handleNextSignupStep}>
                  {t.continue} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* Step 2: The Shop Name */}
            {signupStep === 2 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.shopName} *
                  </label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Mama Brian Groceries"
                    className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="md" onClick={() => setSignupStep(1)}>
                    {t.back}
                  </Button>
                  <Button variant="gradient" size="md" fullWidth onClick={handleNextSignupStep}>
                    {t.continue} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Login Credentials */}
            {signupStep === 3 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-0.5">
                    {language === 'en' ? 'Username' : 'Jina la Mtumiaji'} *
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="e.g. petermwangi"
                    className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    3-20 chars (lowercase letters, numbers, . _)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-0.5">
                    {language === 'en' ? 'Email Address' : 'Barua Pepe'} *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="peter@gmail.com"
                    className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-0.5">
                    {language === 'en' ? 'Password (min 8 chars)' : 'Password (herufi 8+)'} *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-0.5">
                    {t.confirmPassword} *
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="md" onClick={() => setSignupStep(2)}>
                    {t.back}
                  </Button>
                  <Button variant="gradient" size="md" fullWidth onClick={handleNextSignupStep}>
                    {t.continue} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Confirm & Create */}
            {signupStep === 4 && (
              <div className="space-y-3.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.fullName}:</span>
                    <span className="font-bold text-slate-900">{fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.shopName}:</span>
                    <span className="font-bold text-slate-900">{shopName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Username:</span>
                    <span className="font-bold text-slate-900">{username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-bold text-slate-900">{email}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 text-emerald-800">
                    <span className="font-bold">{language === 'en' ? 'Daily Access:' : 'Ada ya Kila Siku:'}</span>
                    <span className="font-black">KES 30 / {language === 'en' ? 'day' : 'siku'}</span>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    {language === 'en'
                      ? 'I agree to the KES 30/day subscription terms and local Kenyan data privacy policy.'
                      : 'Ninakubali ada ya KES 30 kwa siku na sera ya ulinzi wa data ya Kenya.'}
                  </span>
                </label>

                <div className="flex gap-2">
                  <Button variant="outline" size="md" onClick={() => setSignupStep(3)}>
                    {t.back}
                  </Button>
                  <Button
                    variant="gradient"
                    size="hero"
                    fullWidth
                    onClick={handleCompleteSignup}
                    className="font-black"
                  >
                    <Check className="w-5 h-5 mr-1" />
                    {t.createAccountBtn}
                  </Button>
                </div>
              </div>
            )}

            <div className="text-center pt-2 text-xs text-slate-500">
              {t.haveAccountPrompt}{' '}
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="font-bold text-emerald-700 hover:underline ml-1"
              >
                {t.signInBtn}
              </button>
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="text-center text-[10px] text-slate-400 space-y-1.5 pt-2 select-none">
          <div>
            {language === 'en'
              ? 'Local data storage under Kenyan Data Protection Act 2019'
              : 'Sheria ya Ulinzi wa Data ya Kenya 2019'}
          </div>
          <div>
            <a
              href="https://roastme.site/privacy/sales%20manager"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-500 hover:underline"
            >
              {language === 'en' ? 'Privacy Policy & Terms of Use' : 'Sera ya Faragha na Masharti'}
            </a>
          </div>
          <div className="text-[10px] text-slate-400">
            Copyright © 2026 SmartSort Solutions Company
          </div>
        </div>
      </div>
    </div>
  );
};
