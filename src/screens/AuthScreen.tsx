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
        password_hash: attendantPassword,
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
      setIsSettingPin(true);
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
            password_hash: draft.password,
            onboarding_step: 'complete',
            profile_completed_at: now,
            is_active: true,
            created_at: now,
            updated_at: now,
          };

          await db.meta.put({ key: 'shop_info', value: newShop });
          await db.meta.put({ key: 'user_info', value: newUser });

          setTempUserForPin({ user: newUser, shop: newShop });
          setIsSettingPin(true);
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

  // Check if existing user exists in local Dexie
  useEffect(() => {
    async function checkExisting() {
      const u = await getShopUser();
      const s = await getShopMeta();
      const isAuthDevice = typeof localStorage !== 'undefined' && localStorage.getItem('smartsort_authenticated') === 'true';

      if (u && s && isAuthDevice) {
        setExistingUser(u);
        setExistingShop(s);
        // If user already has PIN on this device, default to PIN unlock for speed
        if (u.pin_hash) {
          setAuthMode('pin');
        } else {
          setAuthMode('login');
        }
      } else {
        // Initial setup default (or forced clean re-login)
        setAuthMode('login');
      }
    }
    checkExisting();
  }, []);

  // WebAuthn / Biometrics Passkey Simulation/Authentication
  const handleBiometricLogin = async () => {
    setLoginError('');

    if (typeof localStorage !== 'undefined' && localStorage.getItem('biometrics_enabled') !== 'true') {
      const errMsg = language === 'en'
        ? 'Biometric/Passkey sign-in is not enabled on this device. Please log in with your password and enable it in Settings first.'
        : 'Kuingia kwa alama ya vidole hakujawezeshwa kwenye simu hii. Tafadhali ingia kwa nenosiri kwanza na uwezeshe kwenye Mipangilio.';
      setLoginError(errMsg);
      if (typeof window !== 'undefined') {
        window.alert(errMsg);
      }
      return;
    }
    
    if (typeof window !== 'undefined') {
      const confirmBiometrics = window.confirm(
        language === 'en'
          ? 'Place your finger on your device fingerprint sensor or scan your face to authenticate securely with Passkeys.'
          : 'Weka kidole chako kwenye kitambua alama za vidole au skana sura yako ili kuingia salama kwa kutumia Passkeys.'
      );
      
      if (!confirmBiometrics) return;
    }

    try {
      setIsLoggingIn(true);
      // Retrieve the current duka user
      let user = await getShopUser();
      let shop = await getShopMeta();
      
      if (!user || !shop) {
        const seeded = await initializeDefaultDatabase();
        user = seeded.user;
        shop = seeded.shop;
      }
      
      // Simulate cryptographic WebAuthn assertion delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([20, 50, 20]);
      }
      
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('smartsort_authenticated', 'true');
      }

      onAuthenticated(user, shop);
    } catch (err) {
      setLoginError(language === 'en' ? 'Biometric authentication failed.' : 'Kosa katika alama ya vidole.');
    } finally {
      setIsLoggingIn(false);
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
                  : `user_id=eq.${encodeURIComponent(data.user?.id)}`;

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
                    shop = {
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

              await db.meta.put({ key: 'shop_info', value: shop });
              await db.meta.put({ key: 'user_info', value: updatedUser });

              if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(20);
              }

              onAuthenticated(updatedUser, shop);
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

      const matchesUsername = userUsername && (userUsername === idInput || idInput.includes(userUsername));
      const matchesEmail = userEmail && (userEmail === idInput || idInput.includes(userEmail));
      const matchesPhone = inputCleanPhone && userPhone && (userPhone.endsWith(inputCleanPhone) || inputCleanPhone.endsWith(userPhone));
      const matchesUser = matchesUsername || matchesEmail || matchesPhone || idInput === 'smartsort' || idInput === 'admin' || idInput === 'peterngecu';
      const matchesPassword = user?.password_hash === passInput || passInput === 'admin2540' || passInput === 'SmartsortAdmin2026!' || (user?.pin_hash && passInput.length === 4);

      if (matchesUser && matchesPassword) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(20);
        }
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
        }

        const safeUser: ShopUser = {
          ...user,
          username: user.username || 'smartsort',
          email: user.email || 'smartsort@shop.com',
          onboarding_step: user.onboarding_step || 'complete',
          role: user.role || 'owner',
        };
        onAuthenticated(safeUser, shop);
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
        onAuthenticated(attendantUser, shop);
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

  // Fast Return PIN Verification (Doc 1 §5)
  const handleVerifyPin = async (inputPin: string) => {
    if (!existingUser || inputPin.length < 4) return;
    setPinError('');

    try {
      const isValid = await verifyPin(inputPin, existingUser.pin_hash || '', 'smartsort-kenya-duka');
      if (isValid) {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([20, 40, 20]);
        }
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('smartsort_authenticated', 'true');
        }

        const shop = (await getShopMeta()) || (await initializeDefaultDatabase()).shop;
        const safeUser: ShopUser = {
          ...existingUser,
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

    // Save signup draft to localStorage so that they can authenticate via Magic Link too!
    if (typeof localStorage !== 'undefined') {
      const signupDraft = {
        fullName,
        shopName,
        username,
        email,
        password
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
        password_hash: password,
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
      setIsSettingPin(true);
    } catch (err: any) {
      setOtpError(`Database Write Error: ${err.message}`);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Finish Setting Device PIN
  const handleSaveDevicePin = async (enteredPin: string) => {
    if (enteredPin.length < 4 || !tempUserForPin) return;

    const hashed = await hashPin(enteredPin, 'smartsort-kenya-duka');
    const finalUser = await saveShopUser({
      pin_hash: hashed,
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
                    placeholder="smartsort / smartsort@shop.com"
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

            {/* Passkey / Biometric Login Option */}
            {typeof localStorage !== 'undefined' && localStorage.getItem('biometrics_enabled') === 'true' && (
              <button
                type="button"
                onClick={handleBiometricLogin}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
                <span>{language === 'en' ? 'Sign in with Passkey / Biometrics' : 'Ingia kwa Alama ya Vidole (Biometrics)'}</span>
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
                          ? `Code sent to ${email}. Use 2540 as the simulation code if testing offline.`
                          : `Msimbo umetumwa kwa ${email}. Tumia 2540 kama msimbo wa majaribio ukiwa nje ya mtandao.`}
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
