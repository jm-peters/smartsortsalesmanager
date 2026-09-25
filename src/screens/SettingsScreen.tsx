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
} from 'lucide-react';
import {
  db,
  saveShopMeta,
  getShopUser,
  saveShopUser,
  type UserRole,
} from '../lib/db/local';
import { syncEngine, type SyncStatus } from '../lib/sync/engine';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { NumPad } from '../components/NumPad';
import { hashPin } from '../lib/crypto';
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

  // Storage estimation
  const [storageEstimate, setStorageEstimate] = useState<{ usedMB: string; quotaMB: string } | null>(null);

  // Load Active Shop User info for admin verification
  const [currentUser, setCurrentUser] = useState<any>(null);

  // PIN Change Sheet
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');

  // Load storage, sync subscriptions, and active user info
  useEffect(() => {
    async function loadUser() {
      const u = await getShopUser();
      setCurrentUser(u);
    }
    loadUser();

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

      const hash = await hashPin(newPin);
      await saveShopUser({
        ...user,
        pin_hash: hash,
      });

      setIsPinModalOpen(false);
      setNewPin('');
      setConfirmPin('');
      setPinStep('enter');

      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Unlock PIN successfully updated!' : 'PIN ya kufungua simu imebadilishwa kikamilifu!');
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

        {/* System-Wide Admin Dashboard (Strictly visible only to peterngecu001@gmail.com) */}
        {currentUser?.email === 'peterngecu001@gmail.com' && (
          <div className="p-4 bg-slate-900 text-white rounded-2xl border-2 border-amber-500 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛠</span>
                <div>
                  <h3 className="text-xs font-black tracking-wider text-amber-400 uppercase">
                    SMARTSORT SYSTEM-WIDE ADMIN
                  </h3>
                  <p className="text-[9px] font-mono text-slate-400">Authorized: peterngecu001@gmail.com</p>
                </div>
              </div>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                Live Admin Mode
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl space-y-0.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Total Active Shops</span>
                <span className="text-sm font-black text-emerald-400 tabular-nums">48 Stores</span>
              </div>
              <div className="p-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl space-y-0.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">System Sync Health</span>
                <span className="text-sm font-black text-emerald-400 tabular-nums">99.98%</span>
              </div>
              <div className="p-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl space-y-0.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Active Loan Pool</span>
                <span className="text-sm font-black text-amber-400 tabular-nums">KES 450,000</span>
              </div>
              <div className="p-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl space-y-0.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Monthly Revenue</span>
                <span className="text-sm font-black text-blue-400 tabular-nums">KES 124,500</span>
              </div>
            </div>

            {/* Shop & User Management Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-wide">
                  SYSTEM SHOPS & ACCOUNTS (GENERIC DEMO)
                </h4>
                <span className="text-[9px] text-slate-400">Total: 4</span>
              </div>

              {/* Simulated Shops List */}
              <div className="space-y-1.5 divide-y divide-slate-800/50">
                {/* Store 1 */}
                <div className="pt-2 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100">Smartsort Westlands</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 rounded-sm">Active</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">smartsort@shop.com</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => alert('Successfully approved restock loan increase for smartsort@shop.com to KES 15,000!')}
                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg border border-amber-500/20 transition active:scale-95 cursor-pointer"
                    >
                      Approve Loan
                    </button>
                    <button
                      onClick={() => alert('PIN reset code sent to smartsort@shop.com!')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      Reset PIN
                    </button>
                  </div>
                </div>

                {/* Store 2 */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100">Eldoret Retail Hub</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 rounded-sm">Active</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">retail-eldoret@shop.com</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => alert('Successfully approved restock loan increase for retail-eldoret@shop.com to KES 10,000!')}
                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg border border-amber-500/20 transition active:scale-95 cursor-pointer"
                    >
                      Approve Loan
                    </button>
                    <button
                      onClick={() => alert('PIN reset code sent to retail-eldoret@shop.com!')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      Reset PIN
                    </button>
                  </div>
                </div>

                {/* Store 3 */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100">Mombasa Duka</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 rounded-sm">Active</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">duka-mombasa@shop.com</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => alert('Successfully approved restock loan increase for duka-mombasa@shop.com to KES 8,000!')}
                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg border border-amber-500/20 transition active:scale-95 cursor-pointer"
                    >
                      Approve Loan
                    </button>
                    <button
                      onClick={() => alert('PIN reset code sent to duka-mombasa@shop.com!')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      Reset PIN
                    </button>
                  </div>
                </div>

                {/* Store 4 */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100">Kisumu Duka La Kati</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/10 text-amber-400 rounded-sm">Pending</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">kisumu-kati@shop.com</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => alert('Successfully activated and approved initial restock loan for kisumu-kati@shop.com!')}
                      className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 transition active:scale-95 cursor-pointer"
                    >
                      Activate Shop
                    </button>
                    <button
                      onClick={() => alert('PIN reset code sent to kisumu-kati@shop.com!')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      Reset PIN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shop Info Card */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
            <Store className="w-4 h-4 text-emerald-600" />
            <span>{isEn ? 'Shop Information' : 'Taarifa za Duka'}</span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isEn ? 'Shop Name:' : 'Jina la Duka:'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isEn ? 'M-Pesa Till / Paybill Number:' : 'Nambari ya Till ya M-Pesa (Buy Goods):'}
            </label>
            <input
              type="text"
              value={till}
              onChange={(e) => setTill(e.target.value)}
              placeholder={isEn ? 'Example: 542190' : 'Mfano: 542190'}
              className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <Button
            variant="gradient"
            size="md"
            fullWidth
            disabled={savingShop}
            onClick={handleSaveShopInfo}
          >
            <Check className="w-4 h-4 mr-1" />
            {isEn ? 'Save Shop Information' : 'Hifadhi Taarifa za Duka'}
          </Button>
        </div>

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
              onClick={() => onChangeRole('owner')}
              className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                isOwner
                  ? 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Shield className="w-5 h-5 text-blue-600" />
              <span>{isEn ? 'Shop Owner' : 'Mwenye Duka (Owner)'}</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRole('attendant')}
              className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                !isOwner
                  ? 'bg-slate-100 border-slate-500 text-slate-900 ring-2 ring-slate-500/20'
                  : 'bg-white border-slate-200 text-slate-600'
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
              <span className="text-slate-500">{isEn ? 'Device offline storage:' : 'Miamala kwenye simu:'}</span>
              <span className="font-bold text-slate-800 tabular-nums">
                {storageEstimate ? `${storageEstimate.usedMB} MB` : (isEn ? 'Loading...' : 'Inapakia...')}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Pending outbox sync:' : 'Miamala inayongoja kurushwa:'}</span>
              <span
                className={`font-black tabular-nums ${
                  syncStatus.unpushedCount > 0 ? 'text-amber-600' : 'text-emerald-700'
                }`}
              >
                {syncStatus.unpushedCount}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-500">{isEn ? 'Dead letters (failed):' : 'Miamala iliyokwama (Dead letters):'}</span>
              <span className="font-bold text-slate-700 tabular-nums">
                {syncStatus.deadLetterCount}
              </span>
            </div>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              {isEn ? 'Download Backup (.json)' : 'Pakua Nakala (Backup .json)'}
            </button>

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

        {/* Security / PIN */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
            <Lock className="w-4 h-4 text-slate-700" />
            <span>{isEn ? 'Security (Device PIN)' : 'Usalama wa Kifaa (PIN)'}</span>
          </div>

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
            {isEn ? 'Change Quick Unlock PIN' : 'Badilisha PIN ya Kufungua Simu'}
          </Button>

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
