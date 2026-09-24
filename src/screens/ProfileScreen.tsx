import React, { useState, useEffect } from 'react';
import {
  Store,
  Phone,
  Mail,
  MapPin,
  Users,
  CreditCard,
  Share2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Copy,
  Calendar,
} from 'lucide-react';
import {
  db,
  serverNow,
  getShopMeta,
  saveShopMeta,
  getShopUser,
  saveShopUser,
  getStaffAttendants,
  type ShopMeta,
  type ShopUser,
  type StaffAttendant,
} from '../lib/db/local';
import { translations, type Language } from '../lib/i18n';
import { EmojiPickerModal } from '../components/EmojiPickerModal';
import { ProfileStepModal, type StepType } from '../components/ProfileStepModal';
import { SubscriptionPaymentModal } from '../components/SubscriptionPaymentModal';
import { Money } from '../components/Money';
import { toKES } from '../lib/money';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';

// Lightweight count-up hook (Doc 2 §4)
function useCountUp(target: number, durationMs = 300): number {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }
    const start = 0;
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(start + (target - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  }, [target, durationMs]);

  return current;
}

interface ProfileScreenProps {
  shop: ShopMeta;
  user: ShopUser;
  language: Language;
  onUpdateShop: (shop: ShopMeta) => void;
  onUpdateUser: (user: ShopUser) => void;
  onNavigateTab: (tab: 'sell' | 'stock' | 'deni' | 'reports') => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  shop,
  user,
  language,
  onUpdateShop,
  onUpdateUser,
  onNavigateTab,
}) => {
  const t = translations[language];

  // Repayment & Instalments plan helper
  const getRepaymentPlan = (amount: number) => {
    if (amount <= 5000) {
      return {
        days: 7,
        instalments: 2,
        feePercent: 0.01,
        descriptionEn: '7 Days repayment (2 weekly instalments accepted)',
        descriptionSw: 'Muda wa siku 7 (Malipo ya awamu 2 za kila wiki yanakubaliwa)',
        breakdownEn: `2 instalments of KES ${Math.ceil((amount * 1.01) / 2).toLocaleString()}`,
        breakdownSw: `Awamu 2 za KES ${Math.ceil((amount * 1.01) / 2).toLocaleString()}`,
      };
    } else if (amount <= 15000) {
      return {
        days: 14,
        instalments: 3,
        feePercent: 0.02,
        descriptionEn: '14 Days repayment (3 instalments accepted)',
        descriptionSw: 'Muda wa siku 14 (Malipo ya awamu 3 yanakubaliwa)',
        breakdownEn: `3 instalments of KES ${Math.ceil((amount * 1.02) / 3).toLocaleString()}`,
        breakdownSw: `Awamu 3 za KES ${Math.ceil((amount * 1.02) / 3).toLocaleString()}`,
      };
    } else {
      return {
        days: 30,
        instalments: 4,
        feePercent: 0.03,
        descriptionEn: '30 Days repayment (4 weekly instalments accepted)',
        descriptionSw: 'Muda wa siku 30 (Malipo ya awamu 4 za kila wiki yanakubaliwa)',
        breakdownEn: `4 instalments of KES ${Math.ceil((amount * 1.03) / 4).toLocaleString()}`,
        breakdownSw: `Awamu 4 za KES ${Math.ceil((amount * 1.03) / 4).toLocaleString()}`,
      };
    }
  };

  // Modals & Sheets
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeStepModal, setActiveStepModal] = useState<StepType | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Restock Loans
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isProcessingLoan, setIsProcessingLoan] = useState(false);
  const [loanSuccess, setLoanSuccess] = useState(false);
  const [selectedLoanAmount, setSelectedLoanAmount] = useState<number>(5000);
  const [loanDurationDays, setLoanDurationDays] = useState<number>(7);
  const [loanError, setLoanError] = useState('');

  // Admin & Instalments
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [copyrightTaps, setCopyrightTaps] = useState(0);
  const [instalmentAmount, setInstalmentAmount] = useState<string>('');
  const [isPayingInstalment, setIsPayingInstalment] = useState(false);

  // Inline editing state for Shop Name & Tagline (Doc 2 §3)
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(shop.shop_name);
  const [isEditingTagline, setIsEditingTagline] = useState(false);
  const [taglineInput, setTaglineInput] = useState(shop.tagline || '');
  const [saveFlashElement, setSaveFlashElement] = useState<'name' | 'tagline' | 'avatar' | null>(
    null
  );

  // Accordion expansion state (Doc 2 §6)
  const [expandedSection, setExpandedSection] = useState<'contact' | 'location' | 'staff' | 'plan' | 'loan' | null>(
    'contact'
  );

  // Live Stats computed locally from Dexie (Doc 2 §4)
  const [todaySalesKES, setTodaySalesKES] = useState(0);
  const [weekSalesKES, setWeekSalesKES] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [staffList, setStaffList] = useState<StaffAttendant[]>([]);

  // Share feedback
  const [shareCopied, setShareCopied] = useState(false);

  // Load stats from Dexie
  useEffect(() => {
    async function loadStats() {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfDayISO = startOfDay.toISOString();

        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const startOfWeekISO = startOfWeek.toISOString();

        // Query sales
        const sales = await db.sales.filter((s) => s.status === 'completed').toArray();
        let todaySum = 0;
        let weekSum = 0;

        for (const s of sales) {
          if (s.created_at >= startOfDayISO) todaySum += s.total;
          if (s.created_at >= startOfWeekISO) weekSum += s.total;
        }

        setTodaySalesKES(todaySum);
        setWeekSalesKES(weekSum);

        const custs = await db.customers.count();
        setCustomerCount(custs);

        const prods = await db.products.filter((p) => p.is_active && !p.deleted_at).count();
        setProductCount(prods);

        const attendants = await getStaffAttendants();
        setStaffList(attendants);

        // System Auto-Evaluation of credit limit based on activity
        let awardedLimit = 0;
        const isThreeMonths = shop.simulate_three_months_active || (shop.created_at ? (Date.now() - new Date(shop.created_at).getTime() >= 90 * 24 * 60 * 60 * 1000) : false);

        if (isThreeMonths) {
          if (todaySum >= 5000 || weekSum >= 10000) {
            awardedLimit = 25000;
          } else if (todaySum >= 100 || weekSum >= 500) {
            awardedLimit = 5000;
          }
        }

        const currentLimit = shop.loan_limit ?? 0;
        if (awardedLimit !== currentLimit && !shop.manual_limit_set) {
          const updated = await saveShopMeta({ loan_limit: awardedLimit });
          onUpdateShop(updated);
        }
      } catch (e) {
        console.error('Error loading profile stats', e);
      }
    }
    loadStats();
  }, [shop, todaySalesKES, weekSalesKES]);

  // Animated counters
  const animatedToday = useCountUp(todaySalesKES);
  const animatedWeek = useCountUp(weekSalesKES);
  const animatedCusts = useCountUp(customerCount);
  const animatedProds = useCountUp(productCount);

  // Warm pulse micro-interaction on save (Doc 2 §3)
  const triggerSavePulse = (el: 'name' | 'tagline' | 'avatar') => {
    setSaveFlashElement(el);
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(15);
    }
    setTimeout(() => setSaveFlashElement(null), 500);
  };

  // Save Shop Name inline
  const handleSaveShopName = async () => {
    if (!nameInput.trim()) return;
    const updated = await saveShopMeta({ shop_name: nameInput.trim() });
    onUpdateShop(updated);
    setIsEditingName(false);
    triggerSavePulse('name');
  };

  // Save Tagline inline
  const handleSaveTagline = async () => {
    const updated = await saveShopMeta({ tagline: taglineInput.trim() || null });
    onUpdateShop(updated);
    setIsEditingTagline(false);
    triggerSavePulse('tagline');
  };

  // Choose Avatar Emoji
  const handleSelectEmoji = async (emoji: string) => {
    const updated = await saveShopMeta({ avatar_emoji: emoji });
    onUpdateShop(updated);
    triggerSavePulse('avatar');
  };

  // Calculate Completeness Percentage (Doc 2 §5)
  // Step 1: Account (always complete)
  // Step 2: Contact (phone required)
  // Step 3: Location (town & county required)
  // Step 4: Plan (plan acknowledged)
  const hasContact = Boolean(shop.phone);
  const hasLocation = Boolean(shop.county && shop.town);
  const hasPlan = Boolean(shop.plan_acknowledged);

  let completedStepsCount = 1; // Account is step 1
  if (hasContact) completedStepsCount++;
  if (hasLocation) completedStepsCount++;
  if (hasPlan) completedStepsCount++;

  const completenessPercent = Math.round((completedStepsCount / 4) * 100);
  const isProfileComplete = user.onboarding_step === 'complete' || completenessPercent === 100;

  // Nudge text for next missing step
  let nextStepNudge = t.nudgeComplete;
  let nextStepModalType: StepType = 'contact';
  if (!hasContact) {
    nextStepNudge = t.nudgeContact;
    nextStepModalType = 'contact';
  } else if (!hasLocation) {
    nextStepNudge = t.nudgeLocation;
    nextStepModalType = 'location';
  } else if (!hasPlan) {
    nextStepNudge = t.nudgePlan;
    nextStepModalType = 'plan';
  }

  // Share Shop Profile (Doc 2 §7)
  const handleShareShopProfile = async () => {
    const shareText = `🏪 ${shop.shop_name}\n${shop.tagline || t.taglineDefault}\n📍 ${
      shop.town || 'Kenya'
    }, ${shop.county || ''}\n📞 ${shop.phone || ''}\n\nPowered by SmartSort Sales Manager`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shop.shop_name,
          text: shareText,
        });
      } catch {
        // Fallback to clipboard
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  const isOwner = user.role === 'owner';

  return (
    <div className="flex flex-col min-h-full pb-28 select-none bg-slate-50">
      {/* ======================================================== */}
      {/* ZONE A: IDENTITY HEADER (Doc 2 §3)                       */}
      {/* ======================================================== */}
      <div className="relative bg-white border-b border-slate-200">
        {/* Animated Brand Gradient Banner (#0A9D5F -> #1E6F9F, 135deg, 140px) */}
        <div className="relative h-[130px] w-full overflow-hidden bg-gradient-to-br from-[#0A9D5F] via-[#128877] to-[#1E6F9F] shadow-inner">
          {/* Subtle drift background pattern */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Member Since Trust Signal (Doc 2 §3) */}
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/25 backdrop-blur-xs text-[10px] font-bold text-white/90 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-white/80" />
            <span>{t.memberSince(new Date(shop.created_at || '2026-03-01').toLocaleDateString())}</span>
          </div>
        </div>

        {/* Avatar + Shop Identity Container */}
        <div className="px-4 pb-4">
          <div className="flex items-end justify-between -mt-11 mb-2">
            {/* Shop Avatar (88px, chosen emoji on soft white circle, tap to change) */}
            <button
              type="button"
              onClick={() => setIsEmojiPickerOpen(true)}
              className={`relative w-[84px] h-[84px] rounded-3xl bg-white border-4 border-white shadow-xl flex items-center justify-center text-4xl cursor-pointer transition transform active:scale-95 ${
                saveFlashElement === 'avatar' ? 'ring-4 ring-emerald-400 scale-105' : ''
              }`}
              title={t.chooseAvatar}
            >
              <span>{shop.avatar_emoji || '🏪'}</span>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Edit2 className="w-3 h-3" />
              </div>
            </button>

            {/* Owner / Attendant Role Pill */}
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide uppercase shadow-2xs ${
                  isOwner
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}
              >
                {isOwner ? t.owner : t.attendant}
              </span>
            </div>
          </div>

          {/* Shop Name (22px bold, tap-to-edit inline) */}
          <div className="mt-1">
            {isEditingName ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="text-lg font-black text-slate-900 border-b-2 border-emerald-500 bg-transparent focus:outline-none px-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveShopName}
                  className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setNameInput(shop.shop_name);
                  setIsEditingName(true);
                }}
                className={`group flex items-center gap-1.5 cursor-pointer rounded-lg hover:bg-slate-100 px-1 py-0.5 transition ${
                  saveFlashElement === 'name' ? 'bg-emerald-50 text-emerald-900' : ''
                }`}
              >
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                  {shop.shop_name}
                </h1>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 opacity-60 group-hover:opacity-100 transition" />
              </div>
            )}
          </div>

          {/* Tagline (small, muted, tap-to-edit inline with 60 char cap) */}
          <div className="mt-0.5">
            {isEditingTagline ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  maxLength={60}
                  value={taglineInput}
                  onChange={(e) => setTaglineInput(e.target.value)}
                  placeholder={t.taglineDefault}
                  className="text-xs text-slate-700 border-b border-emerald-500 bg-transparent focus:outline-none px-1 w-full"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTagline}
                  className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setTaglineInput(shop.tagline || '');
                  setIsEditingTagline(true);
                }}
                className={`group flex items-center gap-1 cursor-pointer rounded-lg hover:bg-slate-100 px-1 py-0.5 transition ${
                  saveFlashElement === 'tagline' ? 'bg-emerald-50 text-emerald-900' : ''
                }`}
              >
                <p className="text-xs text-slate-500 italic">
                  {shop.tagline || t.taglinePrompt}
                </p>
                <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
              </div>
            )}
          </div>

          {/* Owner details line */}
          <div className="text-xs font-semibold text-slate-600 mt-1 px-1 flex items-center gap-2">
            <span>{shop.owner_name}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">@{user.username || 'petermwangi'}</span>
          </div>
        </div>
      </div>

      <div className="p-3.5 space-y-3.5">
        {/* ======================================================== */}
        {/* ZONE B: LIVE STATS STRIP (Doc 2 §4)                      */}
        {/* ======================================================== */}
        <div>
          {todaySalesKES === 0 && weekSalesKES === 0 ? (
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900">{t.noSalesYet}</div>
                <div className="text-[11px] text-slate-500">
                  {language === 'en'
                    ? 'Scan barcode or tap items to record your first sale'
                    : 'Changanua msimbo au gusa bidhaa kurekodi mauzo ya kwanza'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('sell')}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition"
              >
                {t.startSellingNow}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {/* Card 1: Today's Sales (Owner-only KES, Doc 2 §4) */}
              {isOwner && (
                <div
                  onClick={() => onNavigateTab('reports')}
                  className="p-3 bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs cursor-pointer transition active:scale-98"
                >
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t.statsToday}
                  </div>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    KES {animatedToday.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5">
                    <span>{t.reports}</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </div>
                </div>
              )}

              {/* Card 2: This Week's Sales (Owner-only KES) */}
              {isOwner && (
                <div
                  onClick={() => onNavigateTab('reports')}
                  className="p-3 bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs cursor-pointer transition active:scale-98"
                >
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t.statsThisWeek}
                  </div>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    KES {animatedWeek.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5">
                    <span>{t.reports}</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </div>
                </div>
              )}

              {/* Card 3: Customers */}
              <div
                onClick={() => onNavigateTab('deni')}
                className="p-3 bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs cursor-pointer transition active:scale-98"
              >
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t.statsCustomers}
                </div>
                <div className="text-base font-black text-slate-900 mt-0.5">{animatedCusts}</div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5">
                  <span>{t.deni}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* Card 4: Products */}
              <div
                onClick={() => onNavigateTab('stock')}
                className="p-3 bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs cursor-pointer transition active:scale-98"
              >
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t.statsProducts}
                </div>
                <div className="text-base font-black text-slate-900 mt-0.5">{animatedProds}</div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5">
                  <span>{t.stock}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* ZONE C: COMPLETENESS RING (Doc 2 §5)                     */}
        {/* ======================================================== */}
        {!isProfileComplete && (
          <div
            onClick={() => setActiveStepModal(nextStepModalType)}
            className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200 rounded-2xl shadow-xs flex items-center gap-3.5 cursor-pointer transition hover:border-emerald-300 active:scale-98"
          >
            {/* SVG Circular Progress Ring (72px, brand gradient fill) */}
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-200"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-600"
                  strokeDasharray={`${completenessPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-black text-xs text-slate-900">
                {completenessPercent}%
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-slate-900">
                {t.profileCompletedPercent(completenessPercent)}
              </div>
              <div className="text-[11px] text-emerald-800 font-medium mt-0.5 truncate">
                👉 {nextStepNudge}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {language === 'en' ? 'Tap here to complete' : 'Gusa hapa ukamilishe'}
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
        )}

        {/* ======================================================== */}
        {/* ZONE D: DETAIL SECTIONS (Doc 2 §6)                       */}
        {/* ======================================================== */}
        <div className="space-y-2.5">
          {/* Section 1: Contact Details */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() =>
                setExpandedSection(expandedSection === 'contact' ? null : 'contact')
              }
              className="w-full p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{t.sectionContact}</div>
                  <div className="text-[10px] text-slate-500">
                    {shop.phone || 'No phone set'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    hasContact
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {hasContact ? t.statusComplete : t.statusIncomplete}
                </span>
                {expandedSection === 'contact' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedSection === 'contact' && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.phoneLabel}:</span>
                  <span className="font-bold text-slate-900">{shop.phone || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.altPhoneLabel}:</span>
                  <span className="font-bold text-slate-900">{shop.alt_phone || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.contactEmailLabel}:</span>
                  <span className="font-bold text-slate-900">
                    {shop.contact_email || user.email || '—'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStepModal('contact')}
                  className="w-full mt-2 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t.edit} {t.sectionContact}</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Location */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() =>
                setExpandedSection(expandedSection === 'location' ? null : 'location')
              }
              className="w-full p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{t.sectionLocation}</div>
                  <div className="text-[10px] text-slate-500">
                    {shop.town ? `${shop.town}, ${shop.county}` : 'Location pending'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    hasLocation
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {hasLocation ? t.statusComplete : t.statusIncomplete}
                </span>
                {expandedSection === 'location' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedSection === 'location' && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.countyLabel}:</span>
                  <span className="font-bold text-slate-900">{shop.county || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.townLabel}:</span>
                  <span className="font-bold text-slate-900">{shop.town || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.landmarkLabel}:</span>
                  <span className="font-bold text-slate-900">{shop.landmark || '—'}</span>
                </div>

                {/* Offline-Safe SVG Map Thumbnail Preview (Doc 2 §6) */}
                <div className="mt-2 relative w-full h-20 bg-emerald-50/60 rounded-xl border border-emerald-200 overflow-hidden flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="grid-prof" width="16" height="16" patternUnits="userSpaceOnUse">
                        <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#059669" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid-prof)" />
                  </svg>
                  <div className="relative flex items-center gap-2 z-10">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="text-[11px] font-bold text-slate-800">
                      {shop.town || 'Kenya'} • {shop.county || 'Nairobi'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveStepModal('location')}
                  className="w-full mt-2 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t.edit} {t.sectionLocation}</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Staff & Cashiers (Doc 2 §6) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() =>
                setExpandedSection(expandedSection === 'staff' ? null : 'staff')
              }
              className="w-full p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{t.sectionStaff}</div>
                  <div className="text-[10px] text-slate-500">
                    1 Owner • {staffList.length} Attendants
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                  {1 + staffList.length} Active
                </span>
                {expandedSection === 'staff' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedSection === 'staff' && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 space-y-2 text-xs">
                {/* Owner entry */}
                <div className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    <div>
                      <div className="font-bold text-slate-900">{user.name}</div>
                      <div className="text-[10px] text-slate-400">@{user.username || 'petermwangi'}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase">
                    {t.owner}
                  </span>
                </div>

                {/* Attendants entries */}
                {staffList.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧑‍💼</span>
                      <div>
                        <div className="font-bold text-slate-900">{att.name}</div>
                        <div className="text-[10px] text-slate-400">{att.phone || 'Attendant'}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 uppercase">
                      {t.attendant}
                    </span>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setActiveStepModal('staff')}
                  className="w-full mt-2 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t.addStaffBtn}</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 4: Subscription Plan (KES 30/day) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() =>
                setExpandedSection(expandedSection === 'plan' ? null : 'plan')
              }
              className="w-full p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{t.sectionPlan}</div>
                  <div className="text-[10px] text-slate-500">
                    KES 30 / day • {shop.plan_status === 'active' ? (language === 'en' ? 'Active' : 'Hai') : (language === 'en' ? 'Due' : 'Inahitajika')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                  KES 30 / {language === 'en' ? 'day' : 'siku'}
                </span>
                {expandedSection === 'plan' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedSection === 'plan' && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.planTitle}:</span>
                  <span className="font-bold text-slate-900">KES 30 / {language === 'en' ? 'day' : 'siku'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-emerald-700 uppercase">{shop.plan_status || 'active'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{language === 'en' ? 'Valid Until:' : 'Inaisha Tarehe:'}</span>
                  <span className="font-bold text-slate-800">
                    {shop.subscription_paid_until
                      ? new Date(shop.subscription_paid_until).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : (language === 'en' ? 'Active today' : 'Hai leo')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">{t.preferredBillingMethod}:</span>
                  <span className="font-bold text-slate-900 uppercase">
                    {shop.preferred_payment_method || 'M-Pesa'}
                  </span>
                </div>

                {/* Instant Pay Now Button */}
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2 active:scale-[0.99] transition cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{language === 'en' ? 'Pay Subscription Now (STK / Till)' : 'Lipa Ada Sasa (STK / Till)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveStepModal('plan')}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t.edit} {t.sectionPlan}</span>
                </button>
              </div>
            )}
          </div>

          {/* Admin Dashboard / Developer Portal */}
          {isAdminMode && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl border-2 border-amber-500 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-wider text-amber-400 uppercase">
                  🛠 ADMIN / DEVELOPER PORTAL
                </span>
                <span className="text-[9px] font-mono text-slate-400">peterngecu001@gmail.com</span>
              </div>

              <p className="text-[11px] text-slate-300">
                Manage restocking loan limits, evaluate sales eligibility, and approve/review pending loan requests.
              </p>

              {/* Set Limit */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase block">
                  Set Credit Limit Periodically (Owner/Admin Override):
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 5000, 15000, 25000].map((lim) => (
                    <button
                      key={lim}
                      type="button"
                      onClick={async () => {
                        const updated = await saveShopMeta({ loan_limit: lim, manual_limit_set: true });
                        onUpdateShop(updated);
                        alert(`Shop credit limit updated periodically to KES ${lim.toLocaleString()}`);
                      }}
                      className={`py-1.5 rounded-lg text-[9px] font-black transition cursor-pointer ${
                        (shop.loan_limit ?? 0) === lim
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      KES {lim.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulate 3+ Months Toggle */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-black uppercase text-amber-400">Account Age Simulation</div>
                  <div className="text-[9px] text-slate-400">Simulate shop active for 3+ months</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const nextVal = !shop.simulate_three_months_active;
                    const updated = await saveShopMeta({ 
                      simulate_three_months_active: nextVal,
                      // If toggling off, force limit back to 0 by default to demonstrate the 3 months rule
                      loan_limit: nextVal ? shop.loan_limit : 0,
                      manual_limit_set: nextVal ? shop.manual_limit_set : false
                    });
                    onUpdateShop(updated);
                    alert(nextVal 
                      ? 'Simulated active state: Shop is now treated as active for over 3 months!'
                      : 'Simulated active state removed: Shop is now subject to standard 3-month restriction.'
                    );
                  }}
                  className={`px-2.5 py-1.5 rounded text-[9px] font-black border transition cursor-pointer uppercase ${
                    shop.simulate_three_months_active
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {shop.simulate_three_months_active ? '✅ Simulated (3+ Months)' : '❌ Not Simulated'}
                </button>
              </div>

              {/* Auto award limit */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[9px] text-slate-400 font-bold uppercase">Activity Evaluator:</span>
                <button
                  type="button"
                  onClick={async () => {
                    const isThreeMonths = shop.simulate_three_months_active || (shop.created_at ? (Date.now() - new Date(shop.created_at).getTime() >= 90 * 24 * 60 * 60 * 1000) : false);
                    if (!isThreeMonths) {
                      alert('Auto-Evaluation failed: Shop must be active for at least 3 months first!');
                      return;
                    }
                    let lim = 0;
                    if (todaySalesKES >= 5000 || weekSalesKES >= 10000) lim = 25000;
                    else if (todaySalesKES >= 100 || weekSalesKES >= 500) lim = 5000;
                    const updated = await saveShopMeta({ loan_limit: lim, manual_limit_set: false });
                    onUpdateShop(updated);
                    alert(`Auto-Evaluation complete!\nSales activity analyzed.\nAwarded Credit Limit: KES ${lim.toLocaleString()}`);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[9px] font-black text-amber-400 border border-slate-700 transition cursor-pointer"
                >
                  Evaluate Sales & Award
                </button>
              </div>

              {/* Approve/Decline request */}
              {shop.active_loan_status === 'pending_approval' && (
                <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl space-y-2 mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <span>🚨 Pending Loan Request</span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-normal">
                    Shop requested a restocking loan of <strong>KES {shop.active_loan_amount?.toLocaleString()}</strong> for <strong>{shop.active_loan_duration || 7} Days</strong>.
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const amount = shop.active_loan_amount || 5000;
                        const duration = shop.active_loan_duration || 7;
                        const plan = getRepaymentPlan(amount);
                        const fee = amount * plan.feePercent;
                        const totalRepay = amount + fee;
                        const updated = await saveShopMeta({
                          active_loan_status: 'disbursed',
                          active_loan_balance: totalRepay,
                          active_loan_due_date: new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString(),
                        });
                        onUpdateShop(updated);
                        alert(`Loan of KES ${amount.toLocaleString()} approved and successfully disbursed!`);
                      }}
                      className="py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black transition active:scale-95 cursor-pointer"
                    >
                      Approve & Disburse
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await saveShopMeta({
                          active_loan_status: 'none',
                          active_loan_amount: 0,
                          active_loan_balance: 0,
                        });
                        onUpdateShop(updated);
                        alert('Loan request declined.');
                      }}
                      className="py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-black transition active:scale-95 cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 5: Merchant Loans & Financing (Mikopo ya Duka) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() =>
                setExpandedSection(expandedSection === 'loan' ? null : 'loan')
              }
              className="w-full p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm">
                  💰
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">
                    {language === 'en' ? 'Merchant Restock Loans' : 'Mikopo ya Kununua Bidhaa'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {shop.active_loan_amount && shop.active_loan_amount > 0
                      ? (shop.active_loan_status === 'pending_approval'
                          ? (language === 'en' ? 'Approval Pending...' : 'Inasubiri Kuidhinishwa...')
                          : (language === 'en' ? `Loan Balance: KES ${shop.active_loan_balance?.toLocaleString()}` : `Deni la Mkopo: KES ${shop.active_loan_balance?.toLocaleString()}`))
                      : (language === 'en' ? `Credit Limit: KES ${(shop.loan_limit ?? 0).toLocaleString()}` : `Kikomo cha Mkopo: KES ${(shop.loan_limit ?? 0).toLocaleString()}`)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                  shop.active_loan_amount && shop.active_loan_amount > 0
                    ? (shop.active_loan_status === 'pending_approval' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800 border border-rose-200')
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {shop.active_loan_amount && shop.active_loan_amount > 0
                    ? (shop.active_loan_status === 'pending_approval' ? (language === 'en' ? 'Pending' : 'Inasubiri') : (language === 'en' ? 'Repayment Due' : 'Unadaiwa'))
                    : (shop.loan_limit && shop.loan_limit > 0 ? (language === 'en' ? 'Eligible' : 'Unastahili') : (language === 'en' ? 'Inactive' : 'Bado'))}
                </span>
                {expandedSection === 'loan' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedSection === 'loan' && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 space-y-2.5 text-xs">
                {/* 1. LOAN DISBURSED (ACTIVE & ACCEPT INSTALMENTS) */}
                {shop.active_loan_status === 'disbursed' && shop.active_loan_balance && shop.active_loan_balance > 0 ? (
                  <>
                    <div className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="font-medium text-[11px] uppercase tracking-wider text-rose-800">
                          {language === 'en' ? 'Outstanding Balance' : 'Salio la Mkopo'}
                        </span>
                        <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded-full text-[10px]">
                          {language === 'en' ? 'Instalments Accepted' : 'Inakubali Awamu'}
                        </span>
                      </div>
                      <div className="text-3xl font-black text-rose-950 tabular-nums">
                        KES {shop.active_loan_balance.toLocaleString()}
                      </div>
                      <p className="text-[11px] text-rose-800 leading-relaxed">
                        {language === 'en'
                          ? `Repayment of KES ${shop.active_loan_balance.toLocaleString()} is due by ${shop.active_loan_due_date ? new Date(shop.active_loan_due_date).toLocaleDateString() : 'next week'}. You can pay in full or make partial instalment payments below.`
                          : `Malipo ya KES ${shop.active_loan_balance.toLocaleString()} yanatakiwa kabla ya ${shop.active_loan_due_date ? new Date(shop.active_loan_due_date).toLocaleDateString() : 'wiki ijayo'}. Unaweza kulipa lote au kulipa kwa awamu hapa chini.`}
                      </p>
                    </div>

                    {/* Instalment Repayment form */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase">
                        {language === 'en' ? 'Pay Instalment (KES):' : 'Lipa kwa Awamu (KES):'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={instalmentAmount}
                          onChange={(e) => setInstalmentAmount(e.target.value)}
                          placeholder={language === 'en' ? 'Enter amount (e.g. 1000)...' : 'Weka kiasi (mfano 1000)...'}
                          className="flex-1 h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isPayingInstalment || !instalmentAmount}
                          onClick={async () => {
                            const amt = parseFloat(instalmentAmount);
                            if (isNaN(amt) || amt <= 0) return;
                            setIsPayingInstalment(true);
                            try {
                              const remaining = Math.max(0, (shop.active_loan_balance || 0) - amt);
                              const updated = await saveShopMeta({
                                active_loan_balance: remaining,
                                active_loan_status: remaining <= 0 ? 'none' : 'disbursed',
                                active_loan_amount: remaining <= 0 ? 0 : shop.active_loan_amount,
                              });
                              onUpdateShop(updated);
                              setInstalmentAmount('');
                              alert(remaining <= 0 
                                ? (language === 'en' ? 'Congratulations! Restock Loan has been fully paid and cleared.' : 'Hongera! Mkopo umelipwa kikamilifu na kufungwa.')
                                : (language === 'en' ? `Instalment payment of KES ${amt.toLocaleString()} received. Remaining balance: KES ${remaining.toLocaleString()}` : `Malipo ya awamu ya KES ${amt.toLocaleString()} yamepokelewa. Salio lililobaki: KES ${remaining.toLocaleString()}`)
                              );
                            } finally {
                              setIsPayingInstalment(false);
                            }
                          }}
                          className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {language === 'en' ? 'Pay' : 'Lipa'}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await saveShopMeta({
                          active_loan_amount: 0,
                          active_loan_balance: 0,
                          active_loan_due_date: undefined,
                          active_loan_status: 'none',
                        });
                        onUpdateShop(updated);
                        alert(language === 'en' ? 'Loan successfully paid in full!' : 'Mkopo umelipwa kikamilifu!');
                      }}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                    >
                      <span>💳</span>
                      <span>{language === 'en' ? 'Repay Full Loan in One Go' : 'Lipa Salio Lote kwa Mara Moja'}</span>
                    </button>
                  </>
                ) : shop.active_loan_status === 'pending_approval' ? (
                  /* 2. LOAN PENDING APPROVAL */
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2 animate-pulse">
                    <span className="text-2xl">⏳</span>
                    <h4 className="font-bold text-slate-800 text-xs">
                      {language === 'en' ? 'Application Under Review' : 'Ombi Linalokaguliwa'}
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {language === 'en'
                        ? `Your request for a restocking loan of KES ${shop.active_loan_amount?.toLocaleString()} is awaiting administrator review. peterngecu001@gmail.com has been notified for approval.`
                        : `Ombi lako la mkopo wa KES ${shop.active_loan_amount?.toLocaleString()} linasubiri kuidhinishwa na admin. peterngecu001@gmail.com amearifiwa.`}
                    </p>
                    <div className="text-[10px] text-amber-800 bg-amber-100 rounded-lg p-1.5 font-bold uppercase inline-block">
                      {language === 'en' ? 'Awaiting Admin Approval' : 'Inasubiri Idhini ya Admin'}
                    </div>
                  </div>
                ) : !shop.loan_limit || shop.loan_limit === 0 ? (
                  /* 3. LOAN LIMIT IS 0 (EVERYONE BY DEFAULT) */
                  <>
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-center">
                      <span className="text-xl">🔒</span>
                      <h4 className="font-black text-slate-700 text-xs uppercase tracking-wide">
                        {language === 'en' ? 'CURRENT LOAN LIMIT: KES 0' : 'KIKOMO CHA MKOPO: KES 0'}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium leading-normal">
                        {language === 'en'
                          ? 'All new shops start with a KES 0 credit limit. Your account will automatically be evaluated for restocking credit once active for at least 3 months.'
                          : 'Maduka yote huanza na kikomo cha KES 0. Akaunti yako itakaguliwa kiotomatiki kwa mikopo mara tu duka litakapokuwa hai kwa angalau miezi 3.'}
                      </p>
                      <div className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 inline-block animate-pulse">
                        ⚠️ {language === 'en' ? 'Eligible when active for at least 3 months' : 'Unastahili duka likiwa hai kwa angalau miezi 3'}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 bg-slate-200 text-slate-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-300"
                    >
                      <span>🔒</span>
                      <span>{language === 'en' ? 'Eligible after 3 months activity' : 'Utastahili baada ya miezi 3 ya kazi'}</span>
                    </button>
                  </>
                ) : (
                  /* 4. LOAN LIMIT > 0 & ELIGIBLE TO APPLY */
                  <>
                    <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-2">
                      <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                        <span className="animate-pulse text-xs">✨</span>
                        {language === 'en' ? 'VERIFIED CREDIT LIMIT' : 'KIKOMO KILICHOTHIBITISHWA'}
                      </div>
                      <div className="text-2xl font-black text-slate-950 tabular-nums">
                        KES {shop.loan_limit.toLocaleString()}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {language === 'en'
                          ? 'Get restocking financing. Repay easily with flexible repayment plan extensions & payment in instalments accepted.'
                          : 'Pata mkopo wa kununua bidhaa. Lipa kwa urahisi ukitumia awamu za muda mrefu za kulipa na malipo ya awamu yanakubaliwa.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoanAmount(shop.loan_limit || 5000);
                        setLoanError('');
                        setLoanSuccess(false);
                        setIsLoanModalOpen(true);
                      }}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                    >
                      <span>🚀</span>
                      <span>{language === 'en' ? 'Request Instant Loan' : 'Omba Mkopo wa Papo Hapo'}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* ZONE E: SHOP CARD / SHARE (Doc 2 §7)                     */}
        {/* ======================================================== */}
        <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">
              {t.businessCardHeading}
            </span>
            <span className="text-2xl">{shop.avatar_emoji || '🏪'}</span>
          </div>

          <div>
            <h3 className="text-lg font-black tracking-tight">{shop.shop_name}</h3>
            <p className="text-xs text-slate-300 italic mt-0.5">
              {shop.tagline || t.taglineDefault}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>{shop.town || 'Kangemi'}, {shop.county || 'Nairobi'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{shop.phone || '0712345678'}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleShareShopProfile}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 shadow-md"
          >
            {shareCopied ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t.shareSuccess}</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>{t.shareShopCardBtn}</span>
              </>
            )}
          </button>
        </div>

        {/* Admin Portal Dashboard Switcher (Hidden to standard users unless developer/admin is logged in or triple taps copyright) */}
        {(user.email === 'peterngecu001@gmail.com' || shop.contact_email === 'peterngecu001@gmail.com' || copyrightTaps >= 3) && (
          <div className="pt-4 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => setIsAdminMode(!isAdminMode)}
              className="px-3.5 py-2 bg-slate-100 border border-slate-200 text-[9px] font-black tracking-wider text-amber-700 hover:text-amber-900 rounded-xl transition active:scale-95 cursor-pointer uppercase shadow-2xs flex items-center gap-1"
            >
              <span>🛠</span>
              <span>{isAdminMode ? 'Hide Admin Dashboard' : 'Developer Admin Dashboard (Authorized Only)'}</span>
            </button>
          </div>
        )}

        {/* Discreet Company Footer */}
        <div className="pt-6 pb-2 text-center text-[10px] text-slate-400 space-y-1 select-none">
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
          <div
            onClick={() => {
              const nextTaps = copyrightTaps + 1;
              setCopyrightTaps(nextTaps);
              if (nextTaps === 3) {
                setIsAdminMode(true);
                if (typeof window !== 'undefined') {
                  window.alert('Developer Mode unlocked! Admin controls are now available in your profile hub.');
                }
              }
            }}
            className="cursor-pointer active:opacity-60 hover:text-slate-500 transition py-1"
            title="Double check credentials or tap 3 times to unlock developer controls"
          >
            Copyright © 2026 SmartSort Solutions Company
          </div>
        </div>
      </div>

      {/* Emoji Picker Modal */}
      <EmojiPickerModal
        isOpen={isEmojiPickerOpen}
        onClose={() => setIsEmojiPickerOpen(false)}
        currentEmoji={shop.avatar_emoji || '🏪'}
        onSelect={handleSelectEmoji}
        language={language}
      />

      {/* Detail Section Edit Modal */}
      {activeStepModal && (
        <ProfileStepModal
          isOpen={Boolean(activeStepModal)}
          onClose={() => setActiveStepModal(null)}
          stepType={activeStepModal}
          shop={shop}
          user={user}
          language={language}
          onSuccess={(s, u) => {
            onUpdateShop(s);
            onUpdateUser(u);
          }}
        />
      )}

      {/* Subscription Pay Now Modal */}
      <SubscriptionPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        shop={shop}
        language={language}
        onSubscriptionUpdated={(updatedShop) => {
          onUpdateShop(updatedShop);
        }}
      />

      {/* Restock Loan Application Modal */}
      <Sheet
        isOpen={isLoanModalOpen}
        onClose={() => {
          if (!isProcessingLoan) setIsLoanModalOpen(false);
        }}
        title={language === 'en' ? 'Duka Restock Loan' : 'Mkopo wa Kununua Bidhaa'}
        subtitle={language === 'en' ? 'Powered by Safaricom Merchant Credit' : 'Inatolewa na Safaricom Merchant Credit'}
      >
        <div className="space-y-4 select-none pb-2">
          {loanSuccess ? (
            <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-3xl text-center space-y-3 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-emerald-950">
                  {language === 'en' ? 'Request Submitted Successfully!' : 'Ombi Limetumwa Kikamilifu!'}
                </h3>
                <p className="text-xs text-emerald-800 mt-1 font-medium leading-relaxed">
                  {language === 'en'
                    ? `Your loan request of KES ${selectedLoanAmount.toLocaleString()} has been queued and emailed. To fast-track your B2C disbursement, please call or WhatsApp our customer care desk directly.`
                    : `Ombi lako la mkopo la KES ${selectedLoanAmount.toLocaleString()} limetumwa kwa barua pepe na kuhifadhiwa. Kuidhinishwa haraka, piga simu au ututumie ujumbe wa WhatsApp sasa.`}
                </p>
              </div>

              <div className="p-3 bg-white/90 border border-emerald-200 rounded-2xl text-xs space-y-1 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-500">{language === 'en' ? 'Requested Amount:' : 'Kiasi Kilichoombwa:'}</span>
                  <span className="font-black text-slate-900">KES {selectedLoanAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{language === 'en' ? 'Repayment Period:' : 'Muda wa Kulipa:'}</span>
                  <span className="font-bold text-slate-800">{loanDurationDays} {language === 'en' ? 'Days' : 'Siku'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{language === 'en' ? 'Repayment Plan:' : 'Mpango wa Kulipa:'}</span>
                  <span className="font-bold text-emerald-800">{getRepaymentPlan(selectedLoanAmount).breakdownEn}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {/* Call Customer Care Call Link */}
                <a
                  href="tel:+254712345678"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm text-center"
                >
                  <span>📞</span>
                  <span>{language === 'en' ? 'Call Customer Care (0712345678)' : 'Piga Simu ya Huduma (0712345678)'}</span>
                </a>

                {/* WhatsApp call line */}
                <a
                  href={`https://wa.me/254712345678?text=${encodeURIComponent(
                    `Hello SmartSort Finance, my shop is ${shop.shop_name} (Phone: ${shop.phone || '0712345678'}). I have requested a restocking loan of KES ${selectedLoanAmount.toLocaleString()} with repayment of ${loanDurationDays} Days. Kindly disburse.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md text-center"
                >
                  <span>💬</span>
                  <span>{language === 'en' ? 'WhatsApp Fast-Track' : 'Tuma WhatsApp Harakishe'}</span>
                </a>
              </div>

              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => setIsLoanModalOpen(false)}
                className="mt-1"
              >
                {language === 'en' ? 'Close' : 'Funga'}
              </Button>
            </div>
          ) : (
            <>
              {/* Promotion Banner */}
              <div className="p-3.5 bg-gradient-to-br from-emerald-800 to-teal-900 text-white rounded-2xl shadow-sm flex items-center gap-3">
                <span className="text-2xl shrink-0">✨</span>
                <div>
                  <div className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">
                    {language === 'en' ? 'Flexible Instalment Restocking Credit' : 'Mkopo wa Bidhaa wa Awamu Flexi'}
                  </div>
                  <div className="text-sm font-black">
                    {language === 'en' ? 'Higher loan amounts receive longer repayment extensions!' : 'Kiasi kikubwa zaidi hupata muda mrefu wa kulipa!'}
                  </div>
                </div>
              </div>

              {/* Amount Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {language === 'en' ? '1. Select Loan Amount:' : '1. Chagua Kiasi cha Mkopo:'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[2000, 5000, 15000, 25000].filter(amt => amt <= (shop.loan_limit ?? 0)).map((amt) => {
                    const isSelected = selectedLoanAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setSelectedLoanAmount(amt);
                          setLoanDurationDays(getRepaymentPlan(amt).days);
                        }}
                        className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base font-black text-slate-900 tabular-nums">
                          KES {amt.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Repayment plan display */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                  {language === 'en' ? 'DURATIONAL REPAYMENT PLAN & INSTALMENTS' : 'MPANGO WA MALIPO YA AWAMU'}
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                  <span>{language === 'en' ? 'Repayment Period Extension:' : 'Muda wa Kulipa Uliorefushwa:'}</span>
                  <span className="text-emerald-800 text-sm font-black">
                    {getRepaymentPlan(selectedLoanAmount).days} {language === 'en' ? 'Days' : 'Siku'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  {language === 'en' ? getRepaymentPlan(selectedLoanAmount).descriptionEn : getRepaymentPlan(selectedLoanAmount).descriptionSw}
                </p>
                <div className="pt-1.5 border-t border-emerald-200/50 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">{language === 'en' ? 'Repay in instalments as:' : 'Malipo ya awamu:'}</span>
                  <span className="font-black text-emerald-950">
                    {language === 'en' ? getRepaymentPlan(selectedLoanAmount).breakdownEn : getRepaymentPlan(selectedLoanAmount).breakdownSw}
                  </span>
                </div>
              </div>

              {/* Verification Details */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>{language === 'en' ? 'Disbursed To:' : 'Inatumwa Kwa:'}</span>
                  <span className="font-bold text-slate-800">{shop.owner_name} ({shop.phone || '0712345678'})</span>
                </div>
                <div className="flex justify-between">
                  <span>{language === 'en' ? 'Daily Sales Base:' : 'Kipimo cha Mauzo ya Kila Siku:'}</span>
                  <span className="font-bold text-emerald-700">KES {todaySalesKES.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>{language === 'en' ? 'Service Fee:' : 'Ada ya Huduma:'}</span>
                  <span className="font-bold text-slate-800">
                    KES {(selectedLoanAmount * getRepaymentPlan(selectedLoanAmount).feePercent).toLocaleString()}
                  </span>
                </div>
              </div>

              {loanError && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                  {loanError}
                </div>
              )}

              <Button
                variant="gradient"
                size="hero"
                fullWidth
                disabled={isProcessingLoan}
                onClick={async () => {
                  setIsProcessingLoan(true);
                  setLoanError('');
                  try {
                    // 1. Submit email request to Formspree for peterngecu001@gmail.com
                    try {
                      await fetch('https://formspree.io/f/mqkrbnzo', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                          _subject: `SmartSort New Duka Loan Request from ${shop.shop_name}`,
                          shopName: shop.shop_name,
                          ownerName: shop.owner_name,
                          phoneNumber: shop.phone || 'No phone',
                          requestedAmount: selectedLoanAmount,
                          repaymentTerm: `${getRepaymentPlan(selectedLoanAmount).days} Days`,
                          instalmentBreakdown: getRepaymentPlan(selectedLoanAmount).breakdownEn,
                          dailySalesToday: todaySalesKES,
                          weeklySales: weekSalesKES,
                          userEmail: user.email || 'No email'
                        })
                      });
                    } catch (e) {
                      console.warn('Formspree dispatch failed (offline or network block):', e);
                    }

                    // 2. Commit pending approval status to local Dexie ShopMeta
                    const plan = getRepaymentPlan(selectedLoanAmount);
                    const updated = await saveShopMeta({
                      active_loan_amount: selectedLoanAmount,
                      active_loan_duration: plan.days,
                      active_loan_status: 'pending_approval',
                    });
                    
                    onUpdateShop(updated);
                    setLoanSuccess(true);
                    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                      window.navigator.vibrate([40, 40, 40]);
                    }
                  } catch (err: any) {
                    setLoanError(err?.message || 'Error processing your loan request.');
                  } finally {
                    setIsProcessingLoan(false);
                  }
                }}
                className="font-black"
              >
                {isProcessingLoan ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    <span>{language === 'en' ? 'Submitting Request...' : 'Inatuma Ombi...'}</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>{language === 'en' ? `Apply for KES ${selectedLoanAmount.toLocaleString()}` : `Omba KES ${selectedLoanAmount.toLocaleString()}`}</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
};
