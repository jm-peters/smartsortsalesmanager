import React, { useState, useEffect } from 'react';
import {
  Store,
  Shield,
  Smartphone,
  Globe,
  Database,
  RefreshCw,
  Download,
  Upload,
  Lock,
  Check,
  Info,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Wifi,
  Users,
  TrendingUp,
  Phone,
  Trash2,
  AlertTriangle,
  Fingerprint,
  Clock,
  CheckCircle2,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import {
  db,
  getShopMeta,
  saveShopMeta,
  getShopUser,
  saveShopUser,
  type UserRole,
} from '../lib/db/local';
import {
  getAllLoanApplications,
  updateLoanApplicationStatus,
  getAllEligibleShopAlerts,
  adminGrantLimitToShop,
  isAdminUser,
  ADMIN_EMAIL,
  type LoanApplication,
  type EligibleShopAlert,
} from '../lib/loans';
import { syncEngine, type SyncStatus } from '../lib/sync/engine';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { NumPad } from '../components/NumPad';
import { hashPin } from '../lib/crypto';
import {
  isBiometricEnabled,
  setBiometricEnabled,
  saveEncryptedAppPin,
  getStoredAppPinHash,
} from '../lib/biometricLock';
import { translations, type Language } from '../lib/i18n';

interface SettingsScreenProps {
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  shopName: string;
  tillNumber: string;
  onUpdateShopInfo: (name: string, till: string) => void;
  onLogout: () => void;
  onOpenAdminPortal?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  userRole,
  onChangeRole,
  language,
  onChangeLanguage,
  shopName,
  tillNumber,
  onUpdateShopInfo,
  onLogout,
  onOpenAdminPortal,
}) => {
  const isOwner = userRole === 'owner';
  const isEn = language === 'en';
  const t = translations[language];

  const [name, setName] = useState(shopName);
  const [till, setTill] = useState(tillNumber);
  const [savingShop, setSavingShop] = useState(false);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [isClearingDead, setIsClearingDead] = useState(false);
  const [healNotice, setHealNotice] = useState<string | null>(null);

  // Storage estimation
  const [storageEstimate, setStorageEstimate] = useState<{ usedMB: string; quotaMB: string } | null>(null);

  // Load Active Shop User info for admin verification
  const [currentUser, setCurrentUser] = useState<any>(null);
  const isPeterNgecu = isAdminUser(currentUser);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  // PIN Change Sheet
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');

  // Password Reset in Settings
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordResetNotice, setPasswordResetNotice] = useState('');

  const handleRequestPasswordResetFromSettings = async () => {
    if (!currentUser?.email) {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'No email registered for this account.' : 'Hakuna barua pepe iliyosajiliwa.');
      }
      return;
    }
    setIsResettingPassword(true);
    setPasswordResetNotice('');
    try {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';
      if (url && anonKey) {
        const resp = await fetch(`${url}/auth/v1/recover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey },
          body: JSON.stringify({
            email: currentUser.email.toLowerCase(),
            options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : '' }
          })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.msg || err.message || 'Failed to send recovery email.');
        }
      }
      setPasswordResetNotice(
        isEn
          ? `Password recovery instructions sent to ${currentUser.email}. Check your inbox!`
          : `Maelekezo ya kuweka upya nenosiri yametumwa kwa ${currentUser.email}. Angalia barua pepe yako!`
      );
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        window.alert(err.message || (isEn ? 'Failed to send reset link.' : 'Imeshindwa kutuma kiungo.'));
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Load storage, sync subscriptions, and active user info
  useEffect(() => {
    async function loadUser() {
      const u = await getShopUser();
      setCurrentUser(u);
    }
    loadUser();

    setBiometricsEnabled(isBiometricEnabled());

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const used = est.usage ? (est.usage / (1024 * 1024)).toFixed(1) : '0';
        const quota = est.quota ? (est.quota / (1024 * 1024)).toFixed(0) : '0';
        setStorageEstimate({ usedMB: used, quotaMB: quota });
      });
    }

    return syncEngine.subscribe((s) => setSyncStatus(s));
  }, []);

  // Save Shop Info
  const handleSaveShopInfo = async () => {
    setSavingShop(true);
    try {
      await saveShopMeta({
        shop_name: name.trim(),
        till_number: till.trim(),
      });
      onUpdateShopInfo(name.trim(), till.trim());
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Shop details saved securely!' : 'Maelezo ya duka yamehifadhiwa salama!');
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Error saving shop details.' : 'Kosa katika kuhifadhi.');
      }
    } finally {
      setSavingShop(false);
    }
  };

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Export full JSON Backup (Safe, read-only download)
  const handleExportBackup = async () => {
    try {
      const dump = {
        exportedAt: new Date().toISOString(),
        shop: { name: shopName, till: tillNumber },
        meta: await db.meta.toArray(),
        products: await db.products.toArray(),
        stocks: await db.product_stock.toArray(),
        sales: await db.sales.toArray(),
        sale_items: await db.sale_items.toArray(),
        customers: await db.customers.toArray(),
        debts: await db.debts.toArray(),
        debt_payments: await db.debt_payments.toArray(),
        expenses: await db.expenses.toArray(),
        cash_sessions: await db.cash_sessions.toArray(),
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dump, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `smartsort_backup_${shopName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Error downloading backup.' : 'Kosa katika kupakua backup.');
      }
    }
  };

  // Import full JSON Backup (Restores local IndexedDB)
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('Empty file');
        const data = JSON.parse(text);

        // Basic verification
        if (!data.meta || !data.products) {
          throw new Error('Invalid backup file format');
        }

        const confirmRestore = window.confirm(
          isEn
            ? 'Are you sure you want to restore this backup? This will replace all current duka records on this device!'
            : 'Je, una uhakika unataka kurejesha nakala hii ya backup? Hii itafuta na kubadilisha rekodi zote za sasa kwenye kifaa hiki!'
        );

        if (!confirmRestore) return;

        // Perform transactional clear and restore
        await db.transaction('rw', [
          db.meta,
          db.products,
          db.product_stock,
          db.sales,
          db.sale_items,
          db.customers,
          db.debts,
          db.debt_payments,
          db.expenses,
          db.cash_sessions,
        ], async () => {
          await db.meta.clear();
          await db.products.clear();
          await db.product_stock.clear();
          await db.sales.clear();
          await db.sale_items.clear();
          await db.customers.clear();
          await db.debts.clear();
          await db.debt_payments.clear();
          await db.expenses.clear();
          await db.cash_sessions.clear();

          if (data.meta) await db.meta.bulkPut(data.meta);
          if (data.products) await db.products.bulkPut(data.products);
          if (data.stocks) await db.product_stock.bulkPut(data.stocks);
          if (data.sales) await db.sales.bulkPut(data.sales);
          if (data.sale_items) await db.sale_items.bulkPut(data.sale_items);
          if (data.customers) await db.customers.bulkPut(data.customers);
          if (data.debts) await db.debts.bulkPut(data.debts);
          if (data.debt_payments) await db.debt_payments.bulkPut(data.debt_payments);
          if (data.expenses) await db.expenses.bulkPut(data.expenses);
          if (data.cash_sessions) await db.cash_sessions.bulkPut(data.cash_sessions);
        });

        window.alert(
          isEn
            ? 'Backup restored successfully! The application will now reload to apply changes.'
            : 'Kurejesha nakala ya backup kumekamilika kikamilifu! Mfumo utajipakia upya sasa hivi.'
        );
        window.location.reload();
      } catch (err: any) {
        window.alert(
          isEn
            ? `Failed to restore backup: ${err.message || 'Invalid file format'}`
            : `Kosa katika kurejesha backup: ${err.message || 'Mfumo hauwezi kusoma faili hili'}`
        );
      }
    };
    reader.readAsText(file);
    // Reset file input so same file can be imported again
    e.target.value = '';
  };

  // Frequently Asked Questions
  const faqs = isEn
    ? [
        {
          q: 'How does offline selling work? Will records sync when online?',
          a: 'You can make unlimited sales, manage stock, and track customer debts completely offline without internet. Every transaction is stored securely on your device using ACID-compliant local database storage. The moment your phone or computer reconnects to the internet, our background sync engine automatically and securely pushes all pending records to the cloud in chronological order, with zero risk of data loss.',
        },
        {
          q: 'Is my shop financial and customer data secure?',
          a: 'Yes, 100%. All your business sales, profits, customer balances, and staff logs are encrypted in transit via SSL/TLS and safeguarded according to the Kenya Data Protection Act 2019. Cashier and attendant access can also be restricted using Quick Unlock PINs and role-based permissions.',
        },
        {
          q: 'How do customer credit (Deni) limits and M-Pesa receipts work?',
          a: 'When selling on credit ("Deni"), the system enforces customer credit limits and alerts you if a customer has overdue debt exceeding 30 days. Receipts can be instantly shared via WhatsApp or printed with your Till / Paybill number and shop name.',
        },
        {
          q: 'How do cash drawers and shift handovers work?',
          a: 'At the start of each work shift, attendants open a cash session with their opening floating cash. At the end of the day or shift, the Day Close feature calculates total cash sales, M-Pesa payments, credit sales, and expenses, automatically highlighting any drawer shortage or overage.',
        },
        {
          q: 'Can multiple shop attendants use the system simultaneously?',
          a: 'Yes. Multiple phones, tablets, or computers can log into your shop simultaneously. Each device maintains its own reliable local cache, while cloud sync continuously harmonizes sales, receipts, and inventory across all your duka terminals.',
        },
      ]
    : [
        {
          q: 'Je, kuuza bila mtandao (offline) hufanyaje kazi? Data zitasasishwa mtandao ukirudi?',
          a: 'Unaweza kuendelea kuuza, kusimamia stoo, na kurekodi madeni bila mtandao wowote. Kila muamala unahifadhiwa salama kwenye simu yako kwa teknolojia ya ACID. Mara tu mtandao (Wi-Fi au data ya simu) unaporudi, mfumo hutuma miamala yote iliyosalia mtandaoni kiotomatiki kwa mpangilio sahihi bila kupoteza data yoyote.',
        },
        {
          q: 'Je, data na fedha za duka langu ziko salama?',
          a: 'Ndiyo, asilimia 100. Rekodi zote za mapato, faida, na madeni ya wateja zinalindwa kwa usalama wa kiwango cha juu (SSL encryption) na kufuata Sheria ya Ulinzi wa Data ya Kenya (Data Protection Act 2019). Unaweza pia kuweka PIN za siri ili watumishi wasibadilishe mipangilio.',
        },
        {
          q: 'Je, madeni ya wateja (Deni) na risiti za M-Pesa hufanyaje kazi?',
          a: 'Unapouza kwa Deni, mfumo hukukumbusha ukomo wa deni la mteja (credit limit) na kutoa tahadhari ikiwa mteja ana deni lililopitiliza siku 30. Risiti zinaweza kutumwa mara moja kwa WhatsApp au kuchapishwa zikiwa na namba yako ya Till/Paybill.',
        },
        {
          q: 'Je, kufunga siku na mahesabu ya droo ya pesa hufanyaje kazi?',
          a: 'Kila zamu, mfanyakazi hufungua droo kwa kuweka fedha za mwanzo (opening float). Mwisho wa siku, kipengele cha "Funga Siku" hukokotoa pesa taslimu, malipo ya M-Pesa, mauzo ya deni, na matumizi, na kukuonyesha ikiwa kuna upungufu au ziada ya pesa drooni.',
        },
        {
          q: 'Je, tunaweza kutumia simu au vifaa vingi kwa pamoja?',
          a: 'Ndiyo. Unaweza kutumia simu au kompyuta kadhaa kwa duka moja. Kila kifaa kinaweza kuuza hata kama hakina mtandao, na mtandao unapounganishwa, vifaa vyote hupokea taarifa zilizosasishwa za mauzo na bidhaa.',
        },
      ];

  // PIN Submit
  const handlePinSubmit = async () => {
    if (pinStep === 'enter') {
      if (newPin.length !== 4) return;
      setPinStep('confirm');
      return;
    }

    if (confirmPin !== newPin) {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'PINs do not match. Please try again.' : 'PIN hazilingani! Anza upya.');
      }
      setNewPin('');
      setConfirmPin('');
      setPinStep('enter');
      return;
    }

    try {
      const user = await getShopUser();
      if (!user) return;

      const hash = await saveEncryptedAppPin(newPin);
      await saveShopUser({
        ...user,
        pin_hash: hash,
        password_hash: undefined,
      });

      setIsPinModalOpen(false);
      setNewPin('');
      setConfirmPin('');
      setPinStep('enter');

      if (typeof window !== 'undefined') {
        window.alert(
          isEn
            ? '4-digit Fallback App PIN encrypted & saved locally!'
            : 'PIN ya tarakimu 4 ya dharura imehifadhiwa salama kwenye simu!'
        );
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Error updating PIN.' : 'Kosa katika kubadilisha PIN.');
      }
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 leading-tight">
            {t.settingsTitle}
          </h1>
          <p className="text-xs text-slate-500">
            {isEn ? 'Shop profile, roles & system configuration' : 'Mipangilio ya duka, wafanyakazi na mtandao'}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Support Callout Banner (Visible to all users) */}
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
          <Phone className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-emerald-900">
              {isEn ? 'Need Assistance / Customer Support?' : 'Unahitaji Msaada au Ushauri?'}
            </h4>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              {isEn 
                ? 'Contact Smartsort Support for any inquiries, custom settings, or active plans via Call or WhatsApp: '
                : 'Wasiliana na Smartsort Support kwa maswali, mipangilio ya duka lako, au malipaji kupitia Piga au WhatsApp: '}
              <a href="tel:0757706978" className="font-black text-emerald-950 underline hover:text-emerald-900">0757706978</a>
            </p>
          </div>
        </div>

        {/* Super-Admin Central Control Center Launcher (Strictly visible only to peterngecu001@gmail.com) */}
        {isPeterNgecu && onOpenAdminPortal && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-white shadow-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-md">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>Super-Admin Portal</span>
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    CENTRAL
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {isEn ? 'Manage subscriptions, shops, database & loan credit lines' : 'Simamia maduka, data na viwango vya mikopo'}
                </p>
              </div>
            </div>

            <Button
              variant="gradient"
              size="sm"
              onClick={onOpenAdminPortal}
              className="font-bold text-xs shrink-0 py-2 px-3 shadow-md cursor-pointer"
            >
              {isEn ? 'Launch Portal →' : 'Fungua Portal →'}
            </Button>
          </div>
        )}

        {/* Shop Information (Shop Configuration) */}
        {isOwner ? (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>{isEn ? 'Shop Information & Configuration' : 'Taarifa na Mipangilio ya Duka'}</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Shop Name:' : 'Jina la Duka:'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3 text-sm font-semibold border rounded-xl bg-slate-50 border-slate-300 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Your Shop M-Pesa Till / Paybill Number:' : 'Nambari ya Till / Paybill ya Duka Lako:'}
              </label>
              <input
                type="text"
                value={till}
                onChange={(e) => setTill(e.target.value)}
                placeholder={isEn ? 'e.g. 542190 or 123456' : 'mfano 542190 au 123456'}
                className="w-full h-11 px-3 text-sm font-semibold border rounded-xl bg-slate-50 border-slate-300 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                {isEn
                  ? 'Customers will send their payments to this Till number when paying for goods.'
                  : 'Wateja watatuma malipo yao kwenye nambari hii ya Till wanaponunua bidhaa.'}
              </p>
            </div>

            <Button
              variant="gradient"
              size="md"
              fullWidth
              disabled={savingShop}
              onClick={handleSaveShopInfo}
            >
              <Check className="w-4 h-4 mr-1" />
              {isEn ? 'Save Shop Configuration' : 'Hifadhi Mipangilio ya Duka'}
            </Button>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <Store className="w-4 h-4 text-emerald-600" />
                <span>{isEn ? 'Shop Information' : 'Taarifa za Duka'}</span>
              </div>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                {isEn ? 'Read-Only' : 'Kutazama Tu'}
              </span>
            </div>
            <div className="text-xs text-slate-700 space-y-1 bg-white p-3 rounded-xl border border-slate-200/80">
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'Shop Name:' : 'Jina la Duka:'}</span>
                <span className="font-bold text-slate-900">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isEn ? 'M-Pesa Till / Paybill:' : 'Till / Paybill:'}</span>
                <span className="font-bold text-slate-900">{till || '—'}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold text-center italic pt-0.5">
              {isEn ? 'Shop configuration can only be modified by the shop owner.' : 'Mipangilio ya duka inabadilishwa na mwenye duka pekee.'}
            </p>
          </div>
        )}

        {/* Staff Role Switcher (§8.F) */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>{isEn ? 'User Role' : 'Nafasi ya Mtumiaji (Role)'}</span>
            </div>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                isOwner ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {isOwner ? (isEn ? 'Shop Owner' : 'Mwenye Duka') : (isEn ? 'Attendant' : 'Mhudumu')}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            {isEn
              ? 'Shop Owner sees profits, wholesale costs, and can authorize customer credit overrides. Attendant sees only selling prices and cashier operations.'
              : 'Mwenye duka anaona faida, gharama za kununua, na anaweza kuruhusu mkopo uliozidi. Mhudumu anaona tu bei za kuuza na rekodi za mauzo.'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                onChangeRole('owner');
                const u = await getShopUser();
                if (u) await saveShopUser({ role: 'owner' });
              }}
              className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                isOwner
                  ? 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Shield className="w-5 h-5 text-blue-600" />
              <span>{isEn ? 'Shop Owner' : 'Mwenye Duka (Owner)'}</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                onChangeRole('attendant');
                const u = await getShopUser();
                if (u) await saveShopUser({ role: 'attendant' });
              }}
              className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                !isOwner
                  ? 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Smartphone className="w-5 h-5 text-slate-600" />
              <span>{isEn ? 'Attendant' : 'Mhudumu (Attendant)'}</span>
            </button>
          </div>
        </div>

        {/* Language Switcher */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>{isEn ? 'Language' : 'Lugha / Language'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeLanguage('en')}
              className={`py-2.5 rounded-xl border text-xs font-bold transition ${
                language === 'en'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-black'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              🇬🇧 English (Default)
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('sw')}
              className={`py-2.5 rounded-xl border text-xs font-bold transition ${
                language === 'sw'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-black'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              🇰🇪 Kiswahili
            </button>
          </div>
        </div>

        {/* Cloud Sync & Storage Status */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>{isEn ? 'Offline Storage & Sync' : 'Hifadhi na Mtandao (Storage & Sync)'}</span>
            </div>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                syncStatus.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {syncStatus.isOnline ? (isEn ? 'Online' : 'Mtandao Upo') : (isEn ? 'Offline' : 'Bila Mtandao')}
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Sync mode:' : 'Aina ya ulandanishi:'}</span>
              <span className="font-bold text-emerald-700">
                {syncStatus.isOnline
                  ? (isEn ? 'Direct Instant Cloud + Local' : 'Moja kwa Moja Mtandaoni + Simu')
                  : (isEn ? 'Offline Queue Mode' : 'Foleni ya Bila Mtandao')}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Device offline storage:' : 'Miamala kwenye simu:'}</span>
              <span className="font-bold text-slate-800 tabular-nums">
                {storageEstimate ? `${storageEstimate.usedMB} MB` : (isEn ? 'Loading...' : 'Inapakia...')}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Offline queued items:' : 'Miamala inayongoja mtandao:'}</span>
              <span
                className={`font-black tabular-nums ${
                  syncStatus.unpushedCount > 0 ? 'text-amber-600' : 'text-emerald-700'
                }`}
              >
                {syncStatus.unpushedCount}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Dead letters (isolated):' : 'Miamala iliyotengwa (Dead letters):'}</span>
              <span className="font-bold tabular-nums text-slate-700">
                {syncStatus.deadLetterCount}
              </span>
            </div>
          </div>

          {healNotice && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] font-bold text-center">
              {healNotice}
            </div>
          )}

          {isOwner && syncStatus.deadLetterCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="text-[11px] text-amber-900 font-semibold leading-tight">
                {isEn
                  ? 'There are failed sync items held in the dead-letter queue. You can auto-repair & retry them, or safely archive and clear them.'
                  : 'Kuna miamala iliyoshindwa kurushwa mtandaoni. Unaweza kuikarabati upya au kuifuta kwa usalama.'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isAutoHealing}
                  onClick={async () => {
                    setIsAutoHealing(true);
                    setHealNotice(null);
                    try {
                      const res = await syncEngine.autoHealDeadLetters();
                      setHealNotice(
                        isEn
                          ? `Auto-healed & replaying ${res.recoveredCount} items...`
                          : `Miamala ${res.recoveredCount} imerekebishwa na inarudiwa...`
                      );
                    } catch (e: any) {
                      setHealNotice(isEn ? 'Failed to auto-heal' : 'Imeshindwa kukarabati');
                    } finally {
                      setIsAutoHealing(false);
                    }
                  }}
                  className="px-2.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isAutoHealing ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Auto-Heal & Retry' : 'Karabati & Rudia'}</span>
                </button>

                <button
                  type="button"
                  disabled={isClearingDead}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        isEn
                          ? 'This will archive and clear all dead letter items from the queue. Continue?'
                          : 'Hii itahifadhi nakala na kuondoa miamala yote iliyokwama kwenye foleni. Je, unaendelea?'
                      )
                    ) {
                      return;
                    }
                    setIsClearingDead(true);
                    setHealNotice(null);
                    try {
                      const res = await syncEngine.clearDeadLetters();
                      setHealNotice(
                        isEn
                          ? `Archived & cleared ${res.clearedCount} dead letters.`
                          : `Miamala ${res.clearedCount} imehifadhiwa na kuondolewa.`
                      );
                    } catch (e: any) {
                      setHealNotice(isEn ? 'Could not clear queue' : 'Imeshindwa kuondoa');
                    } finally {
                      setIsClearingDead(false);
                    }
                  }}
                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-rose-500" />
                  <span>{isEn ? 'Clear / Archive' : 'Ondoa / Hifadhi'}</span>
                </button>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="md"
            fullWidth
            onClick={async () => {
              setIsSyncingManual(true);
              await syncEngine.triggerSync();
              setIsSyncingManual(false);
            }}
            className="flex items-center justify-center gap-2 text-xs border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${isSyncingManual ? 'animate-spin' : ''}`} />
            {isEn ? 'Sync Cloud Now' : 'Rusha Data Sasa (Sync Now)'}
          </Button>
        </div>

        {/* Safe Data Backup & Integrity */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              {isEn ? 'Data Backup & Offline Records' : 'Hifadhi ya Data na Kumbukumbu'}
            </span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              {isEn ? 'Protected' : 'Imelindwa'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isEn
              ? 'Your shop transactions are continuously saved in secure local storage. You can download an offline JSON backup anytime without affecting your active data.'
              : 'Miamala ya duka lako inahifadhiwa moja kwa moja kwenye simu yako. Unaweza kupakua nakala ya backup ya JSON wakati wowote bila kuathiri data zilizopo.'}
          </p>

          <div className={`grid gap-2 ${isOwner ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={handleExportBackup}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              {isEn ? 'Download Backup (.json)' : 'Pakua Nakala (Backup .json)'}
            </button>

            {isOwner && (
              <label className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer text-center">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>{isEn ? 'Restore Backup (.json)' : 'Rejesha Nakala (Import .json)'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Frequently Asked Questions (Expandable Accordion) */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <HelpCircle className="w-4 h-4 text-emerald-600" />
            <span>{isEn ? 'Frequently Asked Questions (FAQs)' : 'Maswali Yanayoulizwa Mara kwa Mara (FAQs)'}</span>
          </div>

          <div className="space-y-1.5 pt-1">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/60 transition"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-3 text-left flex items-center justify-between gap-2.5 hover:bg-slate-100/80 transition"
                  >
                    <span className="text-xs font-semibold text-slate-800 leading-snug">
                      {faq.q}
                    </span>
                    <span className="text-slate-400 shrink-0">
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 text-[11px] text-slate-600 leading-relaxed border-t border-slate-100 bg-white animate-in fade-in duration-150">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Security / PIN & Password Management */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <Lock className="w-4 h-4 text-slate-700" />
              <span>{isEn ? 'Account Security & Password' : 'Usalama wa Akaunti & Nenosiri'}</span>
            </div>
            {currentUser?.email && (
              <span className="text-[10px] text-slate-400 font-mono">
                {currentUser.email}
              </span>
            )}
          </div>

          {passwordResetNotice && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold text-center leading-relaxed">
              {passwordResetNotice}
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="outline"
              size="md"
              fullWidth
              disabled={isResettingPassword}
              onClick={handleRequestPasswordResetFromSettings}
              className="text-xs border-slate-300"
            >
              {isResettingPassword
                ? (isEn ? 'Sending Reset Instructions...' : 'Inatuma Maelekezo...')
                : (isEn ? 'Send Password Reset Link via Email' : 'Tuma Kiungo cha Nenosiri kwa Barua Pepe')}
            </Button>

            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => {
                setNewPin('');
                setConfirmPin('');
                setPinStep('enter');
                setIsPinModalOpen(true);
              }}
              className="text-xs border-slate-300"
            >
              {isEn ? 'Change 4-Digit Fallback App PIN' : 'Badilisha PIN ya Tarakimu 4 ya Dharura'}
            </Button>
          </div>

          {/* Layer 1 Offline Fingerprint App Lock Toggle Button */}
          <button
            type="button"
            onClick={async () => {
              const nextState = !biometricsEnabled;
              setBiometricEnabled(nextState);
              setBiometricsEnabled(nextState);

              if (nextState) {
                const existingPin = await getStoredAppPinHash();
                if (!existingPin) {
                  setNewPin('');
                  setConfirmPin('');
                  setPinStep('enter');
                  setIsPinModalOpen(true);
                  return;
                }
              }
            }}
            className={`w-full p-2.5 border rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
              biometricsEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Fingerprint className={`w-4 h-4 ${biometricsEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>{isEn ? 'Offline Fingerprint App Lock (Layer 1)' : 'Kufuli la Alama ya Kidole Bila Mtandao'}</span>
            </div>
            <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${
              biometricsEnabled ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {biometricsEnabled ? (isEn ? 'Enabled' : 'Imewezeshwa') : (isEn ? 'Disabled' : 'Imezimwa')}
            </span>
          </button>

          <Button
            variant="danger"
            size="md"
            fullWidth
            onClick={onLogout}
            className="text-xs"
          >
            {isEn ? 'Lock App Screen' : 'Funga Simu (Lock Screen)'}
          </Button>
        </div>

        {/* Privacy & Legal Notice (§8.F & Kenyan Data Protection Act 2019) */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>{isEn ? 'Privacy & Kenya Data Protection Act 2019' : 'Faragha na Sheria ya Kenya'}</span>
          </div>
          <p>
            {isEn
              ? 'All shop financial data, sales, stock levels, and customer credit ledger records are stored locally on this device in full compliance with the Kenya Data Protection Act 2019. Your business data is completely private and never shared.'
              : 'Data zote za duka lako (mauzo, faida, madeni ya wateja) zimehifadhiwa kwanza kwenye simu hii chini ya Sheria ya Ulinzi wa Data ya Kenya (Data Protection Act 2019). Hatushiriki data yako na mtu yeyote.'}
          </p>
          <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>SSM POS · Fast Retail POS</span>
            <a
              href="https://roastme.site/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-600 hover:underline"
            >
              {isEn ? 'Privacy Policy & Terms of Use' : 'Sera ya Faragha na Masharti'}
            </a>
          </div>
        </div>

        {/* Discreet Company Footer */}
        <div className="pt-2 pb-4 text-center text-[10px] text-slate-400 select-none">
          Copyright © 2026 SmartSort Solutions Company
        </div>
      </div>

      {/* PIN Change Modal */}
      <Sheet
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        title={
          pinStep === 'enter'
            ? isEn ? 'Enter New 4-Digit PIN' : 'Weka PIN Mpya'
            : isEn ? 'Confirm New PIN' : 'Thibitisha PIN Mpya'
        }
        subtitle={isEn ? 'Enter a 4-digit secret PIN you can remember' : 'Tumia tarakimu 4 za siri unazoweza kukumbuka'}
      >
        <div className="space-y-4 select-none">
          <NumPad
            value={pinStep === 'enter' ? newPin : confirmPin}
            onChange={(val) => {
              if (pinStep === 'enter') setNewPin(val);
              else setConfirmPin(val);
            }}
            onSubmit={handlePinSubmit}
            maxLength={4}
            isPin={true}
            submitLabel={
              pinStep === 'enter'
                ? isEn ? 'Continue' : 'Endelea'
                : isEn ? 'Confirm PIN' : 'Thibitisha PIN'
            }
          />
        </div>
      </Sheet>
    </div>
  );
};
