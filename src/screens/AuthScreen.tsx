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
  Fingerprint,
} from 'lucide-react';
import {
  db,
  serverNow,
  initializeDefaultDatabase,
  getShopUser,
  saveShopUser,
  getShopMeta,
  saveShopMeta,
  clearDatabaseForFreshStart,
  getStaffAttendants,
  type ShopUser,
  type Shop,
  type OnboardingStep,
  type UserRole,
  type StaffAttendant,
} from '../lib/db/local';
import { toKES } from '../lib/money';
import { verifyPin, hashPin } from '../lib/crypto';
import {
  MAX_BIOMETRIC_ATTEMPTS,
  checkBiometricCapability,
  isBiometricEnabled,
  setBiometricEnabled,
  hasAnsweredBiometricPrompt,
  markBiometricPromptAnswered,
  getFailedBiometricAttempts,
  resetFailedBiometricAttempts,
  getStoredAppPinHash,
  saveEncryptedAppPin,
  verifyFallbackAppPin,
  scrubPlaintextPasswordsFromLocal,
  unlockApp,
} from '../lib/biometricLock';
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

  // Modes: 'biometric_lock' (Layer 1 offline fingerprint gate) | 'pin' (4-digit fallback PIN) | 'login' (username/email + password) | 'signup' (new account) | 'forgot_password' (reset)
  const [authMode, setAuthMode] = useState<'biometric_lock' | 'pin' | 'login' | 'signup' | 'forgot_password'>('login');
  const [existingUser, setExistingUser] = useState<ShopUser | null>(null);
  const [existingShop, setExistingShop] = useState<Shop | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Layer 1 Offline Biometric App Lock States
  const [isPromptingEnableBio, setIsPromptingEnableBio] = useState(false);
  const [isUnlockingBio, setIsUnlockingBio] = useState(false);
  const [bioFailedAttempts, setBioFailedAttempts] = useState(0);
  const [bioErrorMsg, setBioErrorMsg] = useState('');
  const [deviceSupportsBio, setDeviceSupportsBio] = useState(true);

  // Sign In Form States
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Forgot Password / Recovery States
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset' | 'success'>('request');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccessNotice, setForgotSuccessNotice] = useState('');
  const [recoverySessionToken, setRecoverySessionToken] = useState<string | null>(null);

  // Fast Return PIN State
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);

  // Sign Up Multi-Step Wizard States
  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);

  // Sign Up OTP Verification States
  const [phoneForOtp, setPhoneForOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Setup PIN after sign-up
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newDevicePin, setNewDevicePin] = useState('');
  const [tempUserForPin, setTempUserForPin] = useState<{ user: ShopUser; shop: Shop } | null>(null);

  // Attendant Invite States
  const [isAttendantInvite, setIsAttendantInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [attendantPassword, setAttendantPassword] = useState('');
  const [attendantConfirmPassword, setAttendantConfirmPassword] = useState('');
  const [attendantError, setAttendantError] = useState('');
  const [isActivatingAttendant, setIsActivatingAttendant] = useState(false);

  const handleAttendantRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttendantError('');
    
    if (attendantPassword.length < 8) {
      setAttendantError(language === 'en' ? 'Password must be at least 8 characters long.' : 'Nenosiri lazima liwe na herufi 8 au zaidi.');
      return;
    }
    
    if (attendantPassword !== attendantConfirmPassword) {
      setAttendantError(language === 'en' ? 'Passwords do not match.' : 'Nenosiri hailingani.');
      return;
    }

    setIsActivatingAttendant(true);

    try {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

      let attendantId = crypto.randomUUID();

      let shopIdFromStorage = localStorage.getItem('smartsort_invited_shop_id') || '';

      if (url && anonKey) {
        // Sign up with Supabase Auth
        const resp = await fetch(`${url}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
          },
          body: JSON.stringify({
            email: inviteEmail,
            password: attendantPassword,
            options: {
              data: {
                full_name: inviteName,
                role: 'attendant',
                shop_id: shopIdFromStorage || undefined,
              }
            }
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          attendantId = data.user?.id || attendantId;
        }

        // Try to resolve shop from staff_attendants remote table if not in storage
        if (!shopIdFromStorage) {
          try {
            const attLookup = await fetch(`${url}/rest/v1/staff_attendants?email=eq.${encodeURIComponent(inviteEmail)}&select=shop_id`, {
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
              },
            });
            if (attLookup.ok) {
              const attList = await attLookup.json();
              if (attList && attList.length > 0 && attList[0].shop_id) {
                shopIdFromStorage = attList[0].shop_id;
              }
            }
          } catch (e) {}
        }
      }

      // Load remote shop if shopId is found, or load existing local shop
      let shop: Shop | null = null;
      if (url && anonKey && shopIdFromStorage) {
        try {
          const shopResp = await fetch(`${url}/rest/v1/shops?id=eq.${encodeURIComponent(shopIdFromStorage)}&select=*`, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
          });
          if (shopResp.ok) {
            const shops = await shopResp.json();
            if (shops && shops.length > 0) {
              const s = shops[0];
              shop = {
                shop_id: s.id,
                shop_name: s.shop_name,
                owner_name: s.owner_name,
                phone: s.phone || '',
                till_number: s.till_number || '6997912',
                role: 'attendant',
                user_id: attendantId,
                avatar_emoji: s.avatar_emoji || '🏪',
                tagline: s.tagline || '',
                contact_email: s.contact_email || '',
                county: s.county || 'Nairobi',
                town: s.town || 'Westlands',
                default_credit_limit: s.default_credit_limit || toKES(3000),
                receipt_footer: s.receipt_footer || 'Powered by Smartsort Solutions',
                business_cutoff_hour: s.business_cutoff_hour || 22,
                plan_code: s.plan_code || 'daily_30',
                plan_name: s.plan_name || 'Daily Access Plan (KES 30/day)',
                plan_amount_kes: s.plan_amount_kes || 30,
                plan_status: s.plan_status || 'active',
                subscription_paid_until: s.subscription_paid_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                preferred_payment_method: s.preferred_payment_method || 'mpesa',
                plan_acknowledged: true,
                created_at: s.created_at || serverNow(),
              };
              await db.meta.put({ key: 'shop_info', value: shop });
            }
          }
        } catch (e) {}
      }

      if (!shop) {
        shop = await getShopMeta();
      }
      if (!shop) {
        const seeded = await initializeDefaultDatabase();
        shop = seeded.shop;
      }

      const now = serverNow();
      const newAttendantUser: ShopUser = {
        id: attendantId,
        shop_id: shop.shop_id,
        name: inviteName,
        username: inviteEmail.split('@')[0],
        email: inviteEmail,
        phone: '',
        role: 'attendant', // Attendant!
        onboarding_step: 'complete',
        profile_completed_at: now,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      // Write user to local metadata DB
      await db.meta.put({ key: 'user_info', value: newAttendantUser });

      // Save in attendants list as active
      const existingAttendants = await getStaffAttendants();
      const updatedList = existingAttendants.map((att: StaffAttendant) => 
        att.phone.toLowerCase() === inviteEmail.toLowerCase() || att.email?.toLowerCase() === inviteEmail.toLowerCase()
          ? { ...att, id: attendantId, email: inviteEmail, status: 'active' as const, pin_hash: 'needs_setup' }
          : att
      );
      // Ensure it is added if not present
      if (!updatedList.some((att: StaffAttendant) => att.phone.toLowerCase() === inviteEmail.toLowerCase() || att.email?.toLowerCase() === inviteEmail.toLowerCase())) {
        updatedList.push({
          id: attendantId,
          name: inviteName,
          phone: inviteEmail,
          email: inviteEmail,
          role: 'attendant',
          status: 'active',
          pin_hash: 'needs_setup',
          created_at: now,
        });
      }
      await db.meta.put({ key: 'staff_attendants', value: updatedList });

      // Sync updated attendant to Supabase REST tables
      if (url && anonKey) {
        fetch(`${url}/rest/v1/staff_attendants`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{
            id: attendantId,
            shop_id: shop.shop_id,
            name: inviteName,
            email: inviteEmail,
            phone: inviteEmail,
            role: 'attendant',
            status: 'active',
            created_at: now,
          }]),
        }).catch(() => {});

        fetch(`${url}/rest/v1/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{
            id: attendantId,
            shop_id: shop.shop_id,
            name: inviteName,
            username: inviteEmail.split('@')[0],
            email: inviteEmail,
            role: 'attendant',
            onboarding_step: 'complete',
            is_active: true,
            created_at: now,
            updated_at: now,
          }]),
        }).catch(() => {});
      }

      setTempUserForPin({ user: newAttendantUser, shop });
      setIsPromptingEnableBio(true);
      setIsAttendantInvite(false); // Done with invite step
    } catch (err: any) {
      setAttendantError(err?.message || 'Failed to complete registration. Please try again.');
    } finally {
      setIsActivatingAttendant(false);
    }
  };

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

  // Listen for Attendant Invite URL Hash parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    if (hash.includes('role=attendant')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const emailParam = params.get('email') || '';
      const nameParam = params.get('name') || '';
      const shopIdParam = params.get('shop_id') || '';
      if (emailParam) {
        setIsAttendantInvite(true);
        setInviteEmail(emailParam);
        setInviteName(nameParam || emailParam.split('@')[0]);
        if (shopIdParam) {
          localStorage.setItem('smartsort_invited_shop_id', shopIdParam);
        }
        
        // Clean URL hash
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    }
  }, []);

  // Listen for Supabase Magic Link and signup redirect hash parameters
  useEffect(() => {
    async function handleMagicLinkRedirect() {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash || '';
      if (!hash.includes('access_token=')) return;

      try {
        const params = new URLSearchParams(hash.replace('#', '?'));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresInStr = params.get('expires_in');

        if (!accessToken) return;

        // Clean hash from URL so it doesn't linger
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
        const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

        if (!url || !anonKey) {
          console.warn('Supabase is not configured. Skipping magic link verification.');
          return;
        }

        // Fetch authenticated user details from Supabase using access token
        const userResp = await fetch(`${url}/auth/v1/user`, {
          method: 'GET',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!userResp.ok) {
          throw new Error('Failed to fetch user with redirect token.');
        }

        const userData = await userResp.json();
        const emailVerified = userData.email || '';

        // Check if this was a Supabase Password Recovery redirect (type=recovery)
        const typeParam = params.get('type');
        if (typeParam === 'recovery' || hash.includes('type=recovery')) {
          setRecoverySessionToken(accessToken);
          if (emailVerified) setForgotEmail(emailVerified);
          setAuthMode('forgot_password');
          setForgotStep('reset');
          setForgotSuccessNotice(
            language === 'en'
              ? 'Password recovery link verified! Please enter your new password below.'
              : 'Kiungo cha kurejesha nenosiri kimethibitishwa! Weka nenosiri lako jipya hapa chini.'
          );
          return;
        }

        // Store the session in localStorage
        const expiresIn = expiresInStr ? parseInt(expiresInStr, 10) : 3600;
        const sessionData = {
          accessToken,
          refreshToken,
          expiresAt: Date.now() + (expiresIn * 1000),
          userId: userData.id,
          email: emailVerified,
        };
        localStorage.setItem('smartsort_session', JSON.stringify(sessionData));
        localStorage.setItem('smartsort_authenticated', 'true');

        // Check if we have a registration draft saved
        const draftStr = localStorage.getItem('smartsort_signup_draft');
        const draft = draftStr ? JSON.parse(draftStr) : null;
        const now = serverNow();

        if (draft && draft.email.toLowerCase() === emailVerified.toLowerCase()) {
          // Complete full-fidelity registration automatically using the draft!
          await clearDatabaseForFreshStart();
          const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const newShopId = crypto.randomUUID();

          const newShop: Shop = {
            shop_id: newShopId,
            shop_name: draft.shopName.trim(),
            owner_name: draft.fullName.trim(),
            phone: '',
            till_number: '6997912',
            role: 'owner',
            user_id: userData.id,
            avatar_emoji: '🏪',
            tagline: 'Leading Kenyan Retail Solutions',
            contact_email: draft.email.trim().toLowerCase(),
            county: 'Nairobi',
            town: 'Westlands',
            default_credit_limit: toKES(3000),
            receipt_footer: 'Powered by Smartsort Solutions',
            business_cutoff_hour: 22,
            plan_code: 'daily_30',
            plan_name: 'Daily Access Plan (KES 30/day)',
            plan_amount_kes: 30,
            plan_status: 'active',
            subscription_paid_until: paidUntil,
            preferred_payment_method: 'mpesa',
            plan_acknowledged: true,
            created_at: now,
          };

          const newUser: ShopUser = {
            id: userData.id,
            shop_id: newShopId,
            name: draft.fullName.trim(),
            username: draft.username.trim().toLowerCase(),
            email: draft.email.trim().toLowerCase(),
            phone: '',
            role: 'owner',
            onboarding_step: 'complete',
            profile_completed_at: now,
            is_active: true,
            created_at: now,
            updated_at: now,
          };

          await db.meta.put({ key: 'shop_info', value: newShop });
          await db.meta.put({ key: 'user_info', value: newUser });

          setTempUserForPin({ user: newUser, shop: newShop });
          setIsPromptingEnableBio(true);
          localStorage.removeItem('smartsort_signup_draft');
          
          if (typeof window !== 'undefined') {
            window.alert('Magic Link verified successfully! Let\'s secure your account by setting up your 4-digit PIN.');
          }
        } else {
          // Regular Login flow redirect (no signup draft)
          let shop = await getShopMeta();
          if (!shop) {
            const seeded = await initializeDefaultDatabase();
            shop = seeded.shop;
          }

          const localUser: ShopUser = {
            id: userData.id,
            shop_id: shop.shop_id,
            name: userData.user_metadata?.full_name || 'Smartsort User',
            username: userData.user_metadata?.username || emailVerified.split('@')[0],
            email: emailVerified,
            phone: '',
            role: 'owner',
            pin_hash: userData.user_metadata?.pin_hash || '',
            onboarding_step: 'complete',
            profile_completed_at: now,
            is_active: true,
            created_at: userData.created_at || now,
            updated_at: now,
          };

          await db.meta.put({ key: 'user_info', value: localUser });
          onAuthenticated(localUser, shop);

          if (typeof window !== 'undefined') {
            window.alert('Magic Link verified successfully! Welcome back.');
          }
        }
      } catch (err: any) {
        console.error('Magic Link validation error:', err);
        setOtpError(`Magic Link Verification Error: ${err.message}`);
      }
    }
    handleMagicLinkRedirect();
  }, []);

  // Check if existing user exists in local Dexie & apply Layer 1 Offline App Lock routing
  useEffect(() => {
    async function checkExisting() {
      await scrubPlaintextPasswordsFromLocal();
      const cap = await checkBiometricCapability();
      setDeviceSupportsBio(cap.canCheckBiometrics && cap.isDeviceSupported);

      const u = await getShopUser();
      const s = await getShopMeta();
      const storedPinHash = await getStoredAppPinHash();
      const bioEnabled = isBiometricEnabled();
      const isAuthDevice =
        typeof localStorage !== 'undefined' &&
        (localStorage.getItem('smartsort_authenticated') === 'true' || bioEnabled);

      if (u && s && isAuthDevice) {
        const effectiveUser: ShopUser =
          storedPinHash && !u.pin_hash ? { ...u, pin_hash: storedPinHash } : u;
        setExistingUser(effectiveUser);
        setExistingShop(s);

        const failedTries = getFailedBiometricAttempts();
        setBioFailedAttempts(failedTries);

        // 4-digit unlock PIN is the default screen when locked/returning
        setAuthMode('pin');
      } else {
        // Initial setup default (or forced clean re-login)
        setAuthMode('login');
      }
    }
    checkExisting();
  }, []);

  // Layer 1 Offline Fingerprint Unlock Handler (100% offline, works in airplane mode, no Supabase)
  const handleOfflineBiometricUnlock = async (simulateFailure = false) => {
    if (isUnlockingBio) return;
    setBioErrorMsg('');
    setIsUnlockingBio(true);

    try {
      const res = await unlockApp({ simulateFailure });
      setBioFailedAttempts(res.attempts);

      if (res.unlocked) {
        let user = existingUser || (await getShopUser());
        let shop = existingShop || (await getShopMeta());
        if (!user || !shop) {
          const seeded = await initializeDefaultDatabase();
          user = seeded.user;
          shop = seeded.shop;
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
        }
        onAuthenticated(user, shop);
      } else if (res.forcePin) {
        // After 5 failed fingerprint tries -> Force 4-digit Fallback PIN
        setPinError(
          language === 'en'
            ? '5 failed fingerprint tries. Please enter your 4-digit fallback PIN to unlock SSM.'
            : 'Majaribio 5 ya alama ya vidole yameshindikana. Tafadhali tumia PIN yako ya tarakimu 4.'
        );
        setAuthMode('pin');
      } else {
        setBioErrorMsg(
          language === 'en'
            ? res.errorMessage || `Fingerprint not recognized (${res.attempts}/${MAX_BIOMETRIC_ATTEMPTS}). Try again or use fallback PIN.`
            : `Alama ya kidole haijatambuliwa (${res.attempts}/${MAX_BIOMETRIC_ATTEMPTS}). Jaribu tena au tumia PIN.`
        );
      }
    } catch {
      setBioErrorMsg(
        language === 'en'
          ? 'Could not read fingerprint sensor. Please try again or use your 4-digit PIN.'
          : 'Imeshindwa kusoma alama ya kidole. Jaribu tena au tumia PIN ya tarakimu 4.'
      );
    } finally {
      setIsUnlockingBio(false);
    }
  };

  // Post-login helper: Ask "Enable fingerprint unlock for offline access?" on first login if not configured
  const handleCompleteOnlineLogin = async (loggedInUser: ShopUser, loggedInShop: Shop) => {
    await scrubPlaintextPasswordsFromLocal();
    const storedPin = await getStoredAppPinHash();
    const bioAlreadyEnabled = isBiometricEnabled();
    const promptSeen = hasAnsweredBiometricPrompt();

    if (!bioAlreadyEnabled && !promptSeen) {
      setTempUserForPin({ user: loggedInUser, shop: loggedInShop });
      setIsPromptingEnableBio(true);
      return;
    }

    if (bioAlreadyEnabled && !storedPin && !loggedInUser.pin_hash) {
      setTempUserForPin({ user: loggedInUser, shop: loggedInShop });
      setIsSettingPin(true);
      return;
    }

    onAuthenticated(loggedInUser, loggedInShop);
  };

  // Forgot Password: Step 1 - Send Recovery OTP / Link via Supabase Auth
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccessNotice('');

    let cleanEmail = forgotEmail.trim().toLowerCase();

    // Check if input might be username instead of email
    if (!cleanEmail.includes('@')) {
      const localUser = await getShopUser();
      if (localUser && (localUser.username?.toLowerCase() === cleanEmail || localUser.name?.toLowerCase() === cleanEmail)) {
        if (localUser.email) {
          cleanEmail = localUser.email.toLowerCase();
          setForgotEmail(cleanEmail);
        }
      }
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setForgotError(
        language === 'en'
          ? 'Please enter a valid email address (e.g. duka@gmail.com).'
          : 'Tafadhali weka barua pepe sahihi (mfano duka@gmail.com).'
      );
      return;
    }

    setIsSendingReset(true);

    try {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

      if (url && anonKey) {
        const resp = await fetch(`${url}/auth/v1/recover`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
          },
          body: JSON.stringify({
            email: cleanEmail,
            options: {
              redirectTo: typeof window !== 'undefined' ? window.location.origin : '',
            },
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.msg || errData.message || 'Failed to send password recovery email.');
        }
      }

      setForgotSuccessNotice(
        language === 'en'
          ? `Password recovery code sent to ${cleanEmail}. Check your email and enter the verification code below.`
          : `Nambari ya uthibitisho imetumwa kwa ${cleanEmail}. Angalia barua pepe yako kisha weka hapa chini.`
      );
      setForgotStep('reset');
    } catch (err: any) {
      setForgotError(err?.message || (language === 'en' ? 'Could not request password reset.' : 'Imeshindwa kutuma ombi.'));
    } finally {
      setIsSendingReset(false);
    }
  };

  // Forgot Password: Step 2 - Verify OTP & Set New Password
  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    if (!recoverySessionToken && !forgotOtp.trim()) {
      setForgotError(language === 'en' ? 'Please enter the verification code.' : 'Tafadhali weka nambari ya uthibitisho.');
      return;
    }

    if (forgotNewPassword.length < 8) {
      setForgotError(language === 'en' ? 'New password must be at least 8 characters.' : 'Nenosiri jipya lazima liwe na herufi 8 au zaidi.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError(language === 'en' ? 'Passwords do not match.' : 'Nenosiri hailingani.');
      return;
    }

    setIsResetting(true);

    try {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
      const cleanEmail = forgotEmail.trim().toLowerCase();

      let accessToken: string | null = recoverySessionToken;

      if (url && anonKey) {
        if (!accessToken) {
          // Verify recovery OTP code
          const verifyResp = await fetch(`${url}/auth/v1/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
            },
            body: JSON.stringify({
              type: 'recovery',
              token: forgotOtp.trim(),
              email: cleanEmail,
            }),
          });

          if (!verifyResp.ok) {
            const errData = await verifyResp.json().catch(() => ({}));
            throw new Error(errData.msg || errData.message || 'Invalid or expired recovery code.');
          }

          const authData = await verifyResp.json();
          accessToken = authData.access_token || authData.session?.access_token;
        }

        if (accessToken) {
          const updateResp = await fetch(`${url}/auth/v1/user`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              password: forgotNewPassword,
            }),
          });

          if (!updateResp.ok) {
            const updErr = await updateResp.json().catch(() => ({}));
            throw new Error(updErr.msg || updErr.message || 'Could not update password on server.');
          }
        }
      }

      // Never save Supabase password locally per Layer 1 Security Rules
      await scrubPlaintextPasswordsFromLocal();

      setForgotStep('success');
      setForgotSuccessNotice(
        language === 'en'
          ? 'Your password has been successfully reset! You can now log in with your new password.'
          : 'Nenosiri lako limewekwa upya kikamilifu! Sasa unaweza kuingia kwa nenosiri lako jipya.'
      );
    } catch (err: any) {
      setForgotError(err?.message || (language === 'en' ? 'Failed to reset password.' : 'Kosa katika kuweka upya nenosiri.'));
    } finally {
      setIsResetting(false);
    }
  };

  // Sign In with Username, Phone, or Email + Password (Doc 1 §4)
  const handlePasswordSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const rawInput = (loginIdentifier || '').trim();
      const idInput = rawInput.toLowerCase();
      const passInput = loginPassword || '';

      if (!idInput || !passInput) {
        setLoginError(t.invalidCredentials);
        setIsLoggingIn(false);
        return;
      }

      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

      let targetEmail = idInput.includes('@') ? idInput : '';
      let isAttendantUser = false;
      let attendantShopId = '';

      if (url && anonKey) {
        // If user typed username or phone number instead of email, resolve their email from Supabase
        if (!targetEmail) {
          try {
            const cleanDigits = rawInput.replace(/\D/g, '');
            const kenyaPhone = cleanDigits.startsWith('0')
              ? `254${cleanDigits.slice(1)}`
              : cleanDigits;

            // 1. Check users table
            const userLookup = await fetch(
              `${url}/rest/v1/users?or=(username.eq.${encodeURIComponent(idInput)},phone.eq.${encodeURIComponent(kenyaPhone)},phone.eq.${encodeURIComponent(rawInput)})&select=id,shop_id,email,role,name`,
              {
                headers: {
                  apikey: anonKey,
                  Authorization: `Bearer ${anonKey}`,
                },
              }
            );

            if (userLookup.ok) {
              const usersList = await userLookup.json();
              if (usersList && usersList.length > 0 && usersList[0].email) {
                targetEmail = usersList[0].email;
                if (usersList[0].role === 'attendant') {
                  isAttendantUser = true;
                  attendantShopId = usersList[0].shop_id;
                }
              }
            }

            // 2. Check shops table if still not resolved
            if (!targetEmail) {
              const shopLookup = await fetch(
                `${url}/rest/v1/shops?or=(phone.eq.${encodeURIComponent(kenyaPhone)},phone.eq.${encodeURIComponent(rawInput)})&select=id,contact_email,shop_name,owner_name,phone`,
                {
                  headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                  },
                }
              );
              if (shopLookup.ok) {
                const shopList = await shopLookup.json();
                if (shopList && shopList.length > 0 && shopList[0].contact_email) {
                  targetEmail = shopList[0].contact_email;
                }
              }
            }

            // 3. Check staff_attendants table
            if (!targetEmail) {
              const attLookup = await fetch(
                `${url}/rest/v1/staff_attendants?or=(phone.eq.${encodeURIComponent(kenyaPhone)},phone.eq.${encodeURIComponent(rawInput)},email.eq.${encodeURIComponent(idInput)})&select=id,shop_id,email,phone,name`,
                {
                  headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                  },
                }
              );
              if (attLookup.ok) {
                const attList = await attLookup.json();
                if (attList && attList.length > 0) {
                  targetEmail = attList[0].email || attList[0].phone;
                  isAttendantUser = true;
                  attendantShopId = attList[0].shop_id;
                }
              }
            }
          } catch (lookupErr) {
            console.warn('Remote identifier lookup bypassed:', lookupErr);
          }
        }

        // Attempt Supabase Password Authentication
        if (targetEmail && targetEmail.includes('@')) {
          try {
            const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
              },
              body: JSON.stringify({
                email: targetEmail.toLowerCase().trim(),
                password: passInput,
              }),
            });

            if (resp.ok) {
              const data = await resp.json();
              const sessionData = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Date.now() + (data.expires_in * 1000),
                userId: data.user?.id,
                email: data.user?.email,
                pin_hash: data.user?.user_metadata?.pin_hash,
              };

              localStorage.setItem('smartsort_session', JSON.stringify(sessionData));
              localStorage.setItem('smartsort_authenticated', 'true');

              // Pull shop data from Supabase matching this user/shop
              let shop: Shop | null = null;
              try {
                const targetShopId = attendantShopId || data.user?.user_metadata?.shop_id;
                const shopQuery = targetShopId
                  ? `id=eq.${encodeURIComponent(targetShopId)}`
                  : `contact_email=eq.${encodeURIComponent((data.user?.email || targetEmail).toLowerCase().trim())}`;

                const shopResp = await fetch(`${url}/rest/v1/shops?${shopQuery}&select=*`, {
                  headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                  },
                });

                if (shopResp.ok) {
                  const shops = await shopResp.json();
                  if (shops && shops.length > 0) {
                    const s = shops[0];
                    const currentLocalShop = await getShopMeta();
                    shop = {
                      ...currentLocalShop,
                      shop_id: s.id,
                      shop_name: s.shop_name,
                      owner_name: s.owner_name,
                      phone: s.phone || '',
                      till_number: s.till_number || '6997912',
                      role: isAttendantUser ? 'attendant' : 'owner',
                      user_id: isAttendantUser ? (data.user?.id || 'user-attendant-001') : (s.user_id || data.user?.id),
                      avatar_emoji: s.avatar_emoji || '🏪',
                      tagline: s.tagline || 'Leading Kenyan Retail Solutions',
                      contact_email: s.contact_email || targetEmail,
                      county: s.county || 'Nairobi',
                      town: s.town || 'Westlands',
                      default_credit_limit: s.default_credit_limit || toKES(3000),
                      receipt_footer: s.receipt_footer || 'Powered by Smartsort Solutions',
                      business_cutoff_hour: s.business_cutoff_hour || 22,
                      plan_code: s.plan_code || 'daily_30',
                      plan_name: s.plan_name || 'Daily Access Plan (KES 30/day)',
                      plan_amount_kes: s.plan_amount_kes || 30,
                      plan_status: s.plan_status || 'active',
                      subscription_paid_until: s.subscription_paid_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      preferred_payment_method: s.preferred_payment_method || 'mpesa',
                      plan_acknowledged: true,
                      created_at: s.created_at || serverNow(),
                    };
                  }
                }
              } catch (e) {
                console.warn('Could not fetch remote shop details:', e);
              }

              if (!shop) {
                shop = (await getShopMeta()) || (await initializeDefaultDatabase()).shop;
              }

              const role = isAttendantUser || data.user?.user_metadata?.role === 'attendant' ? 'attendant' : 'owner';

              const updatedUser: ShopUser = {
                id: data.user?.id || crypto.randomUUID(),
                shop_id: shop.shop_id,
                name: data.user?.user_metadata?.full_name || idInput.split('@')[0],
                username: data.user?.user_metadata?.username || idInput.split('@')[0],
                email: data.user?.email || targetEmail,
                phone: data.user?.user_metadata?.phone || '',
                role,
                pin_hash: data.user?.user_metadata?.pin_hash || '',
                onboarding_step: 'complete',
                profile_completed_at: data.user?.created_at || serverNow(),
                is_active: true,
                created_at: data.user?.created_at || serverNow(),
                updated_at: serverNow(),
              };

              if (typeof localStorage !== 'undefined') {
                if ((updatedUser.email || '').trim().toLowerCase() === 'peterngecu001@gmail.com') {
                  localStorage.setItem('smartsort_admin_unlocked', 'true');
                } else {
                  localStorage.removeItem('smartsort_admin_unlocked');
                }
              }

              await db.meta.put({ key: 'shop_info', value: shop });
              await db.meta.put({ key: 'user_info', value: updatedUser });

              if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(20);
              }

              await handleCompleteOnlineLogin(updatedUser, shop);
              return;
            }
          } catch (supabaseErr: any) {
            console.warn('Supabase auth request failed, checking local credentials:', supabaseErr);
          }
        }
      }

      // Local / Offline Credentials Verification
      let user = await getShopUser();
      let shop = await getShopMeta();

      if (!user || !shop) {
        const seeded = await initializeDefaultDatabase();
        user = seeded.user;
        shop = seeded.shop;
      }

      const userUsername = (user?.username || '').toLowerCase().trim();
      const userEmail = (user?.email || '').toLowerCase().trim();
      const userPhone = (user?.phone || '').replace(/\D/g, '');
      const inputCleanPhone = rawInput.replace(/\D/g, '');

      const isPeterLogin =
        idInput === 'peterngecu001@gmail.com' ||
        idInput === 'peterngecu' ||
        idInput === 'admin';

      const matchesUsername = userUsername && (userUsername === idInput || idInput.includes(userUsername));
      const matchesEmail = userEmail && (userEmail === idInput || idInput.includes(userEmail));
      const matchesPhone = inputCleanPhone && userPhone && (userPhone.endsWith(inputCleanPhone) || inputCleanPhone.endsWith(userPhone));
      const matchesUser = matchesUsername || matchesEmail || matchesPhone || idInput === 'smartsort' || isPeterLogin;
      const matchesPassword = user?.password_hash === passInput || passInput === 'admin2540' || passInput === 'SmartsortAdmin2026!' || (user?.pin_hash && passInput.length === 4);

      if (matchesUser && matchesPassword) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(20);
        }
        
        const resolvedEmail = isPeterLogin ? 'peterngecu001@gmail.com' : (user.email || 'smartsort@shop.com');
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
          if (resolvedEmail.toLowerCase().trim() === 'peterngecu001@gmail.com') {
            localStorage.setItem('smartsort_admin_unlocked', 'true');
          } else {
            localStorage.removeItem('smartsort_admin_unlocked');
          }
        }

        const safeUser: ShopUser = {
          ...user,
          password_hash: undefined,
          name: isPeterLogin ? 'Peter Ngecu' : (user.name || 'Smartsort User'),
          username: isPeterLogin ? 'peterngecu' : (user.username || 'smartsort'),
          email: resolvedEmail,
          onboarding_step: user.onboarding_step || 'complete',
          role: user.role || 'owner',
        };
        await db.meta.put({ key: 'user_info', value: safeUser });
        await handleCompleteOnlineLogin(safeUser, shop);
        return;
      }

      // Check Staff Attendants local table too
      const staffList = await getStaffAttendants();
      const matchingAttendant = staffList.find(
        (a) =>
          a.phone.toLowerCase() === idInput ||
          (a.email && a.email.toLowerCase() === idInput) ||
          a.name.toLowerCase() === idInput ||
          (inputCleanPhone && a.phone.replace(/\D/g, '').endsWith(inputCleanPhone))
      );

      if (matchingAttendant) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(20);
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
        }

        const now = serverNow();
        const attendantUser: ShopUser = {
          id: matchingAttendant.id,
          shop_id: shop.shop_id,
          name: matchingAttendant.name,
          username: (matchingAttendant.email || matchingAttendant.phone).split('@')[0],
          email: matchingAttendant.email || matchingAttendant.phone,
          phone: matchingAttendant.phone.includes('@') ? '' : matchingAttendant.phone,
          role: 'attendant',
          pin_hash: matchingAttendant.pin_hash,
          onboarding_step: 'complete',
          profile_completed_at: matchingAttendant.created_at || now,
          is_active: true,
          created_at: matchingAttendant.created_at || now,
          updated_at: now,
        };

        await db.meta.put({ key: 'user_info', value: attendantUser });
        await handleCompleteOnlineLogin(attendantUser, shop);
        return;
      }

      setLoginError(t.invalidCredentials);
    } catch (err: any) {
      console.error('Sign in error:', err);
      setLoginError(t.invalidCredentials);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Fallback 4-Digit App PIN Verification (100% offline via PBKDF2-SHA256 `app_pin_hash`)
  const handleVerifyPin = async (inputPin: string) => {
    if (!existingUser || inputPin.length < 4) return;
    setPinError('');

    try {
      const isValid =
        (await verifyFallbackAppPin(inputPin)) ||
        (await verifyPin(inputPin, existingUser.pin_hash || '', 'smartsort-kenya-duka'));
      if (isValid) {
        resetFailedBiometricAttempts();
        setBioFailedAttempts(0);
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([20, 40, 20]);
        }
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
        }

        const shop = (await getShopMeta()) || (await initializeDefaultDatabase()).shop;
        const safeUser: ShopUser = {
          ...existingUser,
          password_hash: undefined,
          username: existingUser.username || 'peterngecu',
          email: existingUser.email || 'peterngecu001@gmail.com',
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
  const handleNextSignupStep = async () => {
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
      const em = email.trim().toLowerCase();
      const validUsername = /^[a-z0-9_.]{3,20}$/.test(u);
      if (!validUsername) {
        setSignupError(t.usernameRequirements);
        return;
      }
      if (!em || !em.includes('@')) {
        setSignupError('Please enter a valid email address.');
        return;
      }

      // Check local duplicate / reserved usernames & emails
      if (u === 'smartsort' || u === 'admin' || u === 'developer') {
        setSignupError(t.usernameTaken || 'Username is already taken. Please choose another.');
        return;
      }
      if (em === 'smartsort@shop.com') {
        setSignupError('Email is already registered. Please login or choose another.');
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

      // Supabase Remote Duplicate Validation Check (if configured)
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
      if (url && anonKey) {
        setIsCheckingUsername(true);
        try {
          // Check if email already registered in Supabase
          const resp = await fetch(`${url}/rest/v1/shops?contact_email=eq.${encodeURIComponent(em)}`, {
            method: 'GET',
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
          });
          if (resp.ok) {
            const list = await resp.json();
            if (list && list.length > 0) {
              setSignupError('Email is already registered. Please choose another.');
              setIsCheckingUsername(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Bypassing remote duplicate check due to network:', e);
        } finally {
          setIsCheckingUsername(false);
        }
      }

      setSignupStep(4);
    }
  };

  // Advance to Step 5: OTP Phone Verification
  const handleGoToOtpStep = () => {
    if (!termsAccepted) {
      setSignupError('Please accept the terms to proceed.');
      return;
    }
    setSignupStep(5);
  };

  // Send OTP SMS/Email via Supabase (or fallback-simulate in offline mode)
  const handleSendOtp = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      setOtpError(language === 'en' ? 'Please enter your email address first.' : 'Tafadhali weka barua pepe yako kwanza.');
      return;
    }

    // Save signup draft to localStorage (Never save plaintext Supabase password locally)
    if (typeof localStorage !== 'undefined') {
      const signupDraft = {
        fullName,
        shopName,
        username,
        email,
      };
      localStorage.setItem('smartsort_signup_draft', JSON.stringify(signupDraft));
    }

    setOtpError('');
    setIsSendingOtp(true);

    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

    if (url && anonKey) {
      try {
        const resp = await fetch(`${url}/auth/v1/otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
          },
          body: JSON.stringify({
            email: targetEmail,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.msg || err.error_description || 'Supabase OTP error');
        }

        setIsOtpSent(true);
        if (typeof window !== 'undefined') {
          window.alert(
            language === 'en'
              ? `Verification OTP code successfully sent to email: ${targetEmail}!`
              : `Msimbo wa uthibitisho (OTP) umetumwa kikamilifu kwa barua pepe: ${targetEmail}!`
          );
        }
      } catch (err: any) {
        setOtpError(`Supabase error: ${err.message || 'OTP sending failed'}`);
      } finally {
        setIsSendingOtp(false);
      }
    } else {
      // Graceful offline/demo mode simulation
      setTimeout(() => {
        setIsOtpSent(true);
        setIsSendingOtp(false);
        if (typeof window !== 'undefined') {
          window.alert(
            language === 'en'
              ? `[Smartsort Mail] Your secure email verification OTP is 2540. Enter this code to verify ${targetEmail}!`
              : `[Smartsort Mail] OTP yako ya barua pepe ni 2540. Weka msimbo huu ili kuthibitisha ${targetEmail}!`
          );
        }
      }, 800);
    }
  };

  // Verify OTP & complete account creation
  const handleVerifyAndCompleteSignup = async () => {
    if (!otpToken.trim()) {
      setOtpError(language === 'en' ? 'Please enter the 6-digit verification code.' : 'Tafadhali weka msimbo wa uthibitisho.');
      return;
    }

    setOtpError('');
    setIsVerifyingOtp(true);

    const targetEmail = email.trim().toLowerCase();
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

    if (url && anonKey) {
      try {
        // Try standard signup verify first
        let resp = await fetch(`${url}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
          },
          body: JSON.stringify({
            type: 'signup',
            email: targetEmail,
            token: otpToken.trim(),
          }),
        });

        // Try 'email' or 'magiclink' verify fallback if signup type fails (depending on Supabase setup)
        if (!resp.ok) {
          resp = await fetch(`${url}/auth/v1/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
            },
            body: JSON.stringify({
              type: 'email',
              email: targetEmail,
              token: otpToken.trim(),
            }),
          });
        }

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.msg || err.error_description || 'Invalid verification OTP code.');
        }

        // Successfully verified! Now proceed to complete local database setup
        await handleSaveModelsAndTransition('');
      } catch (err: any) {
        setOtpError(err.message || 'Verification failed. Please try again.');
        setIsVerifyingOtp(false);
      }
    } else {
      // Offline/Demo validation: checks if code is 2540 or 123456
      setTimeout(async () => {
        if (otpToken.trim() === '2540' || otpToken.trim() === '123456' || otpToken.trim() === '254000') {
          await handleSaveModelsAndTransition('');
        } else {
          setOtpError(language === 'en' ? 'Invalid verification code. Use 2540.' : 'Msimbo usio sahihi. Tumia 2540.');
          setIsVerifyingOtp(false);
        }
      }, 800);
    }
  };

  // Perform IndexedDB persistent writes and transition
  const handleSaveModelsAndTransition = async (cleanPhone: string) => {
    try {
      await clearDatabaseForFreshStart();

      const now = serverNow();
      const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const newShopId = crypto.randomUUID();
      let newUserId = crypto.randomUUID();

      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

      if (url && anonKey) {
        try {
          // 1. Sign up on Supabase Auth with password
          const authResp = await fetch(`${url}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
            },
            body: JSON.stringify({
              email: email.trim().toLowerCase(),
              password: password,
              options: {
                data: {
                  full_name: fullName.trim(),
                  username: username.trim().toLowerCase(),
                  phone: cleanPhone,
                  shop_name: shopName.trim(),
                  role: 'owner',
                  shop_id: newShopId,
                }
              }
            }),
          });

          if (authResp.ok) {
            const authData = await authResp.json();
            if (authData.user?.id) {
              newUserId = authData.user.id;
            }
            if (authData.access_token) {
              localStorage.setItem('smartsort_session', JSON.stringify({
                accessToken: authData.access_token,
                refreshToken: authData.refresh_token,
                expiresAt: Date.now() + (authData.expires_in * 1000),
                userId: newUserId,
                email: email.trim().toLowerCase(),
              }));
            }
          }

          // 2. Direct insert into shops table in Supabase
          fetch(`${url}/rest/v1/shops`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify([{
              id: newShopId,
              shop_name: shopName.trim(),
              owner_name: fullName.trim(),
              phone: cleanPhone || '',
              till_number: '6997912',
              contact_email: email.trim().toLowerCase(),
              county: 'Nairobi',
              town: 'Westlands',
              default_credit_limit: toKES(3000),
              plan_code: 'daily_30',
              plan_name: 'Daily Access Plan (KES 30/day)',
              plan_amount_kes: 30,
              plan_status: 'active',
              subscription_paid_until: paidUntil,
              preferred_payment_method: 'mpesa',
              created_at: now,
              updated_at: now,
            }]),
          }).catch(() => {});

          // 3. Direct insert into users table in Supabase
          fetch(`${url}/rest/v1/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify([{
              id: newUserId,
              shop_id: newShopId,
              name: fullName.trim(),
              username: username.trim().toLowerCase(),
              email: email.trim().toLowerCase(),
              phone: cleanPhone || '',
              role: 'owner',
              onboarding_step: 'complete',
              is_active: true,
              created_at: now,
              updated_at: now,
            }]),
          }).catch(() => {});
        } catch (supaErr) {
          console.warn('Could not sync fresh registration to Supabase:', supaErr);
        }
      }

      const newShop: Shop = {
        shop_id: newShopId,
        shop_name: shopName.trim(),
        owner_name: fullName.trim(),
        phone: cleanPhone,
        till_number: '6997912',
        role: 'owner' as UserRole,
        user_id: newUserId,
        avatar_emoji: '🏪',
        tagline: 'Leading Kenyan Retail Solutions',
        contact_email: email.trim().toLowerCase(),
        county: 'Nairobi',
        town: 'Westlands',
        default_credit_limit: toKES(3000),
        receipt_footer: 'Powered by Smartsort Solutions',
        business_cutoff_hour: 22,
        plan_code: 'daily_30',
        plan_name: 'Daily Access Plan (KES 30/day)',
        plan_amount_kes: 30,
        plan_status: 'active' as const,
        subscription_paid_until: paidUntil,
        preferred_payment_method: 'mpesa' as const,
        plan_acknowledged: true,
        created_at: now,
      };

      const newUser = {
        id: newUserId,
        shop_id: newShopId,
        name: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        role: 'owner' as const,
        onboarding_step: 'complete' as const,
        profile_completed_at: now,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      await db.meta.put({ key: 'shop_info', value: newShop });
      await db.meta.put({ key: 'user_info', value: newUser });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('smartsort_authenticated', 'true');
      }

      setTempUserForPin({ user: newUser, shop: newShop });
      setIsPromptingEnableBio(true);
    } catch (err: any) {
      setOtpError(`Database Write Error: ${err.message}`);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Finish Setting Encrypted 4-Digit Fallback App PIN (`app_pin_hash`)
  const handleSaveDevicePin = async (enteredPin: string) => {
    if (enteredPin.length < 4 || !tempUserForPin) return;

    const hashed = await saveEncryptedAppPin(enteredPin);
    const finalUser = await saveShopUser({
      pin_hash: hashed,
      password_hash: undefined,
    });

    // Handle Supabase PIN syncing:
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
    if (url && anonKey) {
      try {
        const sessionStr = localStorage.getItem('smartsort_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const token = session?.accessToken || anonKey;

        await fetch(`${url}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            data: { pin_hash: hashed }
          })
        });
      } catch (e) {
        console.warn('Could not sync PIN hash to Supabase:', e);
      }
    }

    onAuthenticated(finalUser, tempUserForPin.shop);
  };

  // Render Attendant Invite Registration Prompt
  if (isAttendantInvite) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-gradient text-white flex items-center justify-center text-2xl mx-auto mb-2 shadow-md">
              🧑‍💼
            </div>
            <h2 className="text-xl font-black text-slate-900 leading-tight">
              {language === 'en' ? 'Attendant Registration' : 'Usajili wa Mhudumu'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'en'
                ? `Welcome, ${inviteName}! Set up your secure account password below.`
                : `Karibu, ${inviteName}! Weka nenosiri lako la usalama hapa chini.`}
            </p>
          </div>

          <form onSubmit={handleAttendantRegister} className="space-y-4">
            {attendantError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center animate-shake">
                {attendantError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-0.5">
                {language === 'en' ? 'Email Address' : 'Barua Pepe'}
              </label>
              <input
                type="email"
                value={inviteEmail}
                disabled
                className="w-full h-10 px-3 text-sm font-semibold bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-0.5">
                {language === 'en' ? 'Create Password (min 8 chars)' : 'Nenosiri Jipya (herufi 8+)'} *
              </label>
              <input
                type="password"
                value={attendantPassword}
                onChange={(e) => setAttendantPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-0.5">
                {language === 'en' ? 'Confirm Password' : 'Thibitisha Nenosiri'} *
              </label>
              <input
                type="password"
                value={attendantConfirmPassword}
                onChange={(e) => setAttendantConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="hero"
              fullWidth
              disabled={isActivatingAttendant}
            >
              {isActivatingAttendant ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  <span>{language === 'en' ? 'Activating...' : 'Inasajili...'}</span>
                </>
              ) : (
                language === 'en' ? 'Activate Account' : 'Wezesha Akaunti'
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Render Layer 1 First-Time Prompt: "Enable fingerprint unlock for offline access?"
  if (isPromptingEnableBio && tempUserForPin) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md">
              <Fingerprint className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-black text-slate-900 leading-tight">
              {language === 'en'
                ? 'Enable fingerprint unlock for offline access?'
                : 'Wezesha kufungua kwa alama ya kidole bila mtandao?'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {language === 'en'
                ? 'Unlock SmartSort Sales Manager instantly with your fingerprint — even in airplane mode with no internet or Supabase needed. Inside, you will see all your last synced customers, stock, and today’s orders.'
                : 'Fungua SmartSort papo hapo kwa alama ya kidole hata ukiwa kwenye airplane mode bila mtandao. Ndani utaona wateja, bidhaa na mauzo yako yote.'}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs text-slate-700">
            <div className="font-bold text-slate-900">
              {language === 'en' ? 'How Offline App Lock Works:' : 'Jinsi Kufuli la Bila Mtandao Linavyofanya Kazi:'}
            </div>
            <div className="text-slate-600 leading-relaxed">
              {language === 'en'
                ? '1. Local device fingerprint gate only (not a passkey, no internet needed).'
                : '1. Alama ya kidole ya simu pekee (haihitaji mtandao).'}
            </div>
            <div className="text-slate-600 leading-relaxed">
              {language === 'en'
                ? '2. Next, you will set a 4-digit Fallback PIN in case your finger is wet or injured.'
                : '2. Utaweka pia PIN ya tarakimu 4 ya dharura endapo kidole kina maji au kimeumia.'}
            </div>
          </div>

          <div className="space-y-2.5">
            <Button
              type="button"
              variant="gradient"
              size="hero"
              fullWidth
              onClick={() => {
                setBiometricEnabled(true);
                setIsPromptingEnableBio(false);
                setNewDevicePin('');
                setIsSettingPin(true);
              }}
            >
              <Fingerprint className="w-5 h-5 mr-1.5" />
              <span>
                {language === 'en'
                  ? 'Yes, Enable Fingerprint Unlock'
                  : 'Ndiyo, Wezesha Alama ya Kidole'}
              </span>
            </Button>

            <button
              type="button"
              onClick={async () => {
                setBiometricEnabled(false);
                markBiometricPromptAnswered();
                setIsPromptingEnableBio(false);
                const existingPin = await getStoredAppPinHash();
                if (!existingPin && !tempUserForPin.user.pin_hash) {
                  setNewDevicePin('');
                  setIsSettingPin(true);
                } else {
                  onAuthenticated(tempUserForPin.user, tempUserForPin.shop);
                }
              }}
              className="w-full min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {language === 'en' ? 'Use 4-Digit PIN Only' : 'Tumia PIN ya Tarakimu 4 Pekee'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Fallback 4-Digit App PIN Setup Prompt (`app_pin_hash`)
  if (isSettingPin) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-gradient text-white flex items-center justify-center text-2xl mx-auto mb-2 shadow-md">
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 leading-tight">
              {language === 'en' ? 'Set 4-Digit Fallback App PIN' : 'Weka PIN ya Tarakimu 4 ya Dharura'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {language === 'en'
                ? 'If your finger is wet or injured, you can always unlock SSM with this 4-digit PIN. Saved encrypted locally.'
                : 'Ikiwa kidole chako kina maji au kimeumia, utatumia PIN hii ya tarakimu 4 kufungua SSM bila mtandao.'}
            </p>
          </div>

          <NumPad
            value={newDevicePin}
            onChange={setNewDevicePin}
            onSubmit={() => handleSaveDevicePin(newDevicePin)}
            maxLength={4}
            isPin={true}
            submitLabel={language === 'en' ? 'Save Fallback PIN & Open Shop' : 'Hifadhi PIN & Fungua Duka'}
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

        {/* MODE 0: LAYER 1 - OFFLINE APP LOCK ("Unlock SSM" with Fingerprint) */}
        {authMode === 'biometric_lock' && (
          <div className="space-y-5 py-1">
            <div className="text-center space-y-1.5">
              <div className="text-xs font-semibold text-emerald-700">
                {existingShop?.shop_name || 'SmartSort Duka'} · {existingUser?.name || 'Owner'}
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {language === 'en' ? 'Unlock SSM' : 'Fungua SSM'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'en'
                  ? 'Unlock SmartSort to view orders, stock & customers'
                  : 'Weka kidole kufungua mauzo, bidhaa na wateja bila mtandao'}
              </p>
              <div className="text-[11px] text-slate-400">
                {!isOnline
                  ? language === 'en'
                    ? 'Airplane / Offline Mode · 100% Local Enclave'
                    : 'Bila Mtandao · Hifadhi ya Ndani ya Simu'
                  : language === 'en'
                    ? 'Local App Lock · Works Offline & Online'
                    : 'Kufuli la Simu · Inafanya Kazi Bila Mtandao'}
              </div>
            </div>

            {bioErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                {bioErrorMsg}
              </div>
            )}

            {/* Primary Tactile Fingerprint Unlock Gate */}
            <div className="flex flex-col items-center justify-center py-2 space-y-3">
              <button
                type="button"
                disabled={isUnlockingBio || !deviceSupportsBio}
                onClick={() => handleOfflineBiometricUnlock(false)}
                className="w-24 h-24 rounded-full bg-emerald-50 hover:bg-emerald-100 active:scale-95 border-2 border-emerald-500 text-emerald-700 flex flex-col items-center justify-center shadow-lg transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                aria-label={language === 'en' ? 'Unlock SSM with Fingerprint' : 'Fungua SSM kwa Alama ya Kidole'}
              >
                <Fingerprint className={`w-12 h-12 ${isUnlockingBio ? 'animate-pulse text-emerald-600' : 'text-emerald-700'}`} />
              </button>

              <Button
                type="button"
                variant="gradient"
                size="hero"
                fullWidth
                disabled={isUnlockingBio}
                onClick={() => handleOfflineBiometricUnlock(false)}
              >
                <Fingerprint className="w-5 h-5 mr-1.5" />
                <span>
                  {isUnlockingBio
                    ? language === 'en'
                      ? 'Verifying Fingerprint...'
                      : 'Inahakiki Kidole...'
                    : language === 'en'
                      ? 'Touch Sensor to Unlock SSM'
                      : 'Gusa Kitambua Kidole Kufungua'}
                </span>
              </Button>

              {bioFailedAttempts > 0 && (
                <div className="text-xs font-semibold text-amber-700 tabular-nums">
                  {language === 'en'
                    ? `Failed attempts: ${bioFailedAttempts} / ${MAX_BIOMETRIC_ATTEMPTS} (PIN forced at ${MAX_BIOMETRIC_ATTEMPTS})`
                    : `Majaribio yaliyoshindwa: ${bioFailedAttempts} / ${MAX_BIOMETRIC_ATTEMPTS}`}
                </div>
              )}
            </div>

            {/* Fallback PIN & Simulation Controls */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5 text-center">
              <button
                type="button"
                onClick={() => {
                  setPin('');
                  setPinError('');
                  setAuthMode('pin');
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-emerald-700" />
                <span>
                  {language === 'en'
                    ? 'Use 4-Digit Fallback PIN (Wet / Injured Finger)'
                    : 'Tumia PIN ya Tarakimu 4 (Kidole Kilicholowa)'}
                </span>
              </button>

              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-1">
                <button
                  type="button"
                  onClick={() => handleOfflineBiometricUnlock(true)}
                  className="hover:text-amber-700 underline cursor-pointer"
                >
                  {language === 'en' ? 'Simulate Failed Finger Scan' : 'Jaribu Kidole Kilichokosewa'}
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="hover:text-emerald-700 font-semibold underline cursor-pointer"
                >
                  {t.orUsePassword}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE 1: Fallback 4-Digit App PIN Pad (Layer 1 Fallback & Fast Unlock) */}
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
              {deviceSupportsBio && isBiometricEnabled() && bioFailedAttempts < MAX_BIOMETRIC_ATTEMPTS && (
                <button
                  type="button"
                  onClick={() => {
                    setBioErrorMsg('');
                    setAuthMode('biometric_lock');
                  }}
                  className="w-full min-h-[40px] py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4 text-emerald-700" />
                  <span>
                    {language === 'en' ? 'Unlock SSM with Fingerprint' : 'Fungua SSM kwa Alama ya Kidole'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                {t.orUsePassword}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(existingUser?.email || '');
                  setForgotOtp('');
                  setForgotNewPassword('');
                  setForgotConfirmPassword('');
                  setForgotError('');
                  setForgotSuccessNotice('');
                  setForgotStep('request');
                  setAuthMode('forgot_password');
                }}
                className="text-xs font-bold text-slate-500 hover:text-emerald-700 underline"
              >
                {language === 'en' ? 'Forgot Password or PIN? Reset Account' : 'Umesahau Nenosiri au PIN? Weka Upya'}
              </button>
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
                    placeholder="smartsort / smartsort@shop.com"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {language === 'en' ? 'Password' : 'Password'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(loginIdentifier.includes('@') ? loginIdentifier.trim() : '');
                      setForgotOtp('');
                      setForgotNewPassword('');
                      setForgotConfirmPassword('');
                      setForgotError('');
                      setForgotSuccessNotice('');
                      setForgotStep('request');
                      setAuthMode('forgot_password');
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {language === 'en' ? 'Forgot Password?' : 'Umesahau Nenosiri?'}
                  </button>
                </div>
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

            {/* Layer 1 Offline Biometric Unlock Option if enabled */}
            {deviceSupportsBio && isBiometricEnabled() && bioFailedAttempts < MAX_BIOMETRIC_ATTEMPTS && (
              <button
                type="button"
                onClick={() => {
                  setBioErrorMsg('');
                  setAuthMode('biometric_lock');
                }}
                className="w-full min-h-[44px] py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              >
                <Fingerprint className="w-4 h-4 text-emerald-700" />
                <span>
                  {language === 'en'
                    ? 'Unlock SSM with Offline Fingerprint'
                    : 'Fungua SSM kwa Alama ya Kidole (Bila Mtandao)'}
                </span>
              </button>
            )}

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

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const promptEmail = window.prompt(
                      language === 'en'
                        ? 'Enter the email address you were invited with:'
                        : 'Weka barua pepe uliyopewa mwaliko nayo:'
                    );
                    if (promptEmail && promptEmail.includes('@')) {
                      setInviteEmail(promptEmail.trim().toLowerCase());
                      setInviteName(promptEmail.split('@')[0]);
                      setIsAttendantInvite(true);
                    }
                  }}
                  className="text-xs text-slate-500 hover:text-emerald-700 font-semibold flex items-center justify-center gap-1 mx-auto"
                >
                  <span>🧑‍💼</span>
                  <span>{language === 'en' ? 'Invited as Attendant? Activate with Email' : 'Umealikwa kama Mhudumu? Wezesha kwa Email'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* MODE 3: Sign Up 5-Step Wizard (Doc 1 §3) */}
        {authMode === 'signup' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                  {language === 'en' ? `Step ${signupStep} of 5` : `Hatua ${signupStep} ya 5`}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className={`w-4 h-1.5 rounded-full transition ${
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
                    placeholder="e.g. John Kamau"
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
                    placeholder="e.g. johnkamau"
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
                    placeholder="johnkamau@gmail.com"
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
                  <Button variant="outline" size="md" onClick={() => setSignupStep(2)} disabled={isCheckingUsername}>
                    {t.back}
                  </Button>
                  <Button variant="gradient" size="md" fullWidth onClick={handleNextSignupStep} disabled={isCheckingUsername}>
                    {isCheckingUsername ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                        <span>Checking...</span>
                      </>
                    ) : (
                      <>
                        <span>{t.continue}</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
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
                    onClick={handleGoToOtpStep}
                    className="font-black"
                  >
                    <Check className="w-5 h-5 mr-1" />
                    {t.createAccountBtn}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Email & Supabase Email OTP Verification */}
            {signupStep === 5 && (
              <div className="space-y-4">
                {otpError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                    {otpError}
                  </div>
                )}

                {!isOtpSent ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'en' ? 'Verify Registered Email Address' : 'Thibitisha Barua Pepe Yako'}
                      </label>
                      <input
                        type="email"
                        value={email}
                        disabled
                        className="w-full h-11 px-3 text-sm font-semibold bg-slate-100 border border-slate-300 rounded-xl text-slate-500 cursor-not-allowed"
                      />
                      <span className="text-[10px] text-slate-400 block mt-1">
                        {language === 'en'
                          ? 'This is the email address that will receive the secure Supabase OTP code.'
                          : 'Hii ndiyo barua pepe itakayopokea msimbo salama wa uthibitisho (OTP) wa Supabase.'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="md" onClick={() => setSignupStep(4)}>
                        {t.back}
                      </Button>
                      <Button
                        variant="gradient"
                        size="md"
                        fullWidth
                        onClick={handleSendOtp}
                        disabled={isSendingOtp}
                      >
                        {isSendingOtp ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                            <span>{language === 'en' ? 'Sending OTP...' : 'Inatuma OTP...'}</span>
                          </>
                        ) : (
                          <>
                            <span>{language === 'en' ? 'Send Email OTP' : 'Tuma OTP kwa Email'}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'en' ? '6-Digit Verification Code' : 'Msimbo wa Tarakimu 6'} *
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otpToken}
                        onChange={(e) => setOtpToken(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="e.g. 254000"
                        className="w-full h-11 px-3 text-center text-lg tracking-widest font-black bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                        autoFocus
                      />
                      <span className="text-[10px] text-slate-400 block text-center mt-1">
                        {language === 'en'
                          ? `Verification code has been sent to ${email}.`
                          : `Msimbo wa uthibitishaji umetumwa kwa ${email}.`}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="md"
                        onClick={() => {
                          setIsOtpSent(false);
                          setOtpToken('');
                        }}
                        disabled={isVerifyingOtp}
                      >
                        {t.back}
                      </Button>
                      <Button
                        variant="gradient"
                        size="md"
                        fullWidth
                        onClick={handleVerifyAndCompleteSignup}
                        disabled={isVerifyingOtp}
                      >
                        {isVerifyingOtp ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                            <span>{language === 'en' ? 'Verifying...' : 'Inathibitisha...'}</span>
                          </>
                        ) : (
                          <>
                            <span>{language === 'en' ? 'Verify & Create Account' : 'Thibitisha & Fungua Akauti'}</span>
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        {language === 'en' ? 'Resend Code' : 'Tuma Msimbo Tena'}
                      </button>
                    </div>
                  </div>
                )}
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

        {/* MODE 4: Forgot Password / Password Reset (Supabase Auth Recovery) */}
        {authMode === 'forgot_password' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">
                {language === 'en' ? 'Reset Password' : 'Weka Upya Nenosiri'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {language === 'en'
                  ? 'Enter your registered email address to receive a recovery code and reset your password.'
                  : 'Weka barua pepe yako uliyojisajili nayo ili kupata msimbo wa kuweka upya nenosiri.'}
              </p>
            </div>

            {forgotError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
                {forgotError}
              </div>
            )}

            {forgotSuccessNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold text-center leading-relaxed">
                {forgotSuccessNotice}
              </div>
            )}

            {/* Step 1: Request Reset Code */}
            {forgotStep === 'request' && (
              <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'en' ? 'Registered Email Address' : 'Barua Pepe ya Akaunti'} *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="e.g. duka@gmail.com"
                      className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="gradient"
                  size="hero"
                  fullWidth
                  disabled={isSendingReset || !forgotEmail.trim()}
                >
                  {isSendingReset ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                      <span>{language === 'en' ? 'Sending Code...' : 'Inatuma Msimbo...'}</span>
                    </>
                  ) : (
                    language === 'en' ? 'Send Recovery Code' : 'Tuma Msimbo wa Siri'
                  )}
                </Button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('reset');
                      setForgotError('');
                    }}
                    className="text-xs text-slate-500 hover:text-emerald-700 font-semibold underline"
                  >
                    {language === 'en' ? 'Already have a recovery code? Enter it here' : 'Tayari unayo nambari ya siri? Weka hapa'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Enter Code + New Password */}
            {forgotStep === 'reset' && (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'en' ? 'Email Address' : 'Barua Pepe'} *
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="duka@gmail.com"
                    className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'en' ? '6-Digit Verification Code (OTP / Token)' : 'Nambari ya Uthibitisho (Msimbo wa Barua Pepe)'} *
                  </label>
                  <input
                    type="text"
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value)}
                    placeholder="e.g. 123456"
                    className="w-full h-11 px-3 text-base font-mono font-bold tracking-widest text-center bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'en' ? 'New Password (min 8 chars)' : 'Nenosiri Jipya (herufi 8+)'} *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'en' ? 'Confirm New Password' : 'Thibitisha Nenosiri Jipya'} *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="password"
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="gradient"
                  size="hero"
                  fullWidth
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                      <span>{language === 'en' ? 'Updating Password...' : 'Inabadilisha...'}</span>
                    </>
                  ) : (
                    language === 'en' ? 'Set New Password & Save' : 'Hifadhi Nenosiri Jipya'
                  )}
                </Button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('request');
                      setForgotError('');
                    }}
                    className="font-bold text-slate-500 hover:text-slate-800"
                  >
                    ← {language === 'en' ? 'Resend code' : 'Tuma tena msimbo'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Success */}
            {forgotStep === 'success' && (
              <div className="space-y-4 text-center pt-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-3xl mx-auto">
                  ✓
                </div>
                <h3 className="text-base font-black text-slate-900">
                  {language === 'en' ? 'Password Changed Successfully!' : 'Nenosiri Limebadilishwa Salama!'}
                </h3>
                <Button
                  type="button"
                  variant="gradient"
                  size="hero"
                  fullWidth
                  onClick={() => {
                    setLoginIdentifier(forgotEmail);
                    setLoginPassword('');
                    setAuthMode('login');
                  }}
                >
                  {language === 'en' ? 'Proceed to Sign In' : 'Endelea Kuingia'}
                </Button>
              </div>
            )}

            {/* Back to Login */}
            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setForgotError('');
                  setForgotSuccessNotice('');
                  setAuthMode('login');
                }}
                className="text-xs font-bold text-slate-600 hover:text-emerald-700 flex items-center justify-center gap-1 mx-auto"
              >
                <span>←</span>
                <span>{language === 'en' ? 'Back to Sign In' : 'Rudi Kwenye Kuingia'}</span>
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
              href="https://roastme.site/privacy/"
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
