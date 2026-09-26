import React, { useState } from 'react';
import {
  X,
  Check,
  Phone,
  Mail,
  MapPin,
  Compass,
  CreditCard,
  UserPlus,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  saveShopMeta,
  saveShopUser,
  getStaffAttendants,
  addStaffAttendant,
  type ShopMeta,
  type ShopUser,
  type OnboardingStep,
} from '../lib/db/local';
import { hashPin } from '../lib/crypto';
import { KENYA_COUNTIES } from '../lib/kenyaLocations';
import { Button } from './Button';
import { translations, type Language } from '../lib/i18n';

export type StepType = 'contact' | 'location' | 'plan' | 'staff';

interface ProfileStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  stepType: StepType;
  shop: ShopMeta;
  user: ShopUser;
  language: Language;
  onSuccess: (updatedShop: ShopMeta, updatedUser: ShopUser) => void;
}

export const ProfileStepModal: React.FC<ProfileStepModalProps> = ({
  isOpen,
  onClose,
  stepType,
  shop,
  user,
  language,
  onSuccess,
}) => {
  const t = translations[language];

  // Contact fields
  const [phone, setPhone] = useState(shop.phone || user.phone || '');
  const [altPhone, setAltPhone] = useState(shop.alt_phone || '');
  const [contactEmail, setContactEmail] = useState(shop.contact_email || user.email || '');

  // Location fields
  const [selectedCounty, setSelectedCounty] = useState(shop.county || 'Nairobi');
  const [selectedSubCounty, setSelectedSubCounty] = useState(shop.sub_county || 'Westlands');
  const [selectedTown, setSelectedTown] = useState(shop.town || 'Kangemi');
  const [landmark, setLandmark] = useState(shop.landmark || '');
  const [lat, setLat] = useState<number | null>(shop.latitude || null);
  const [lng, setLng] = useState<number | null>(shop.longitude || null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsCapturedAt, setGpsCapturedAt] = useState<string | null>(
    shop.location_captured_at || null
  );

  // Plan fields
  const [preferredMethod, setPreferredMethod] = useState<'mpesa' | 'cash'>(
    shop.preferred_payment_method || 'mpesa'
  );
  const [planConsent, setPlanConsent] = useState(shop.plan_acknowledged || false);

  // Staff fields
  const [attendantName, setAttendantName] = useState('');
  const [attendantPhone, setAttendantPhone] = useState('');
  const [attendantPin, setAttendantPin] = useState('');
  const [attendantEmail, setAttendantEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // County & Sub-county cascades
  const currentCountyObj = KENYA_COUNTIES.find(
    (c) =>
      c.county === selectedCounty ||
      c.county.replace(/'/g, '').toLowerCase() === (selectedCounty || '').replace(/'/g, '').toLowerCase()
  );
  const subCounties = currentCountyObj ? currentCountyObj.subCounties : [];
  const currentSubCountyObj = subCounties.find((s) => s.name === selectedSubCounty);
  const towns = currentSubCountyObj ? currentSubCountyObj.towns : [];

  // GPS Capture
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    setIsCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsCapturedAt(new Date().toISOString());
        setIsCapturingGps(false);
      },
      (err) => {
        setIsCapturingGps(false);
        alert(
          language === 'en'
            ? 'Could not access GPS. Please check location permissions or continue with town/landmark.'
            : 'Imeshindwa kupata GPS. Angalia ruhusa za simu au endelea na mji/eneo.'
        );
      },
      { timeout: 10000 }
    );
  };

  // Submit Handler
  const handleSave = async () => {
    setErrorMsg('');
    setSaving(true);

    try {
      let updatedShop = shop;
      let updatedUser = user;

      if (stepType === 'contact') {
        if (!phone.trim()) {
          setErrorMsg(language === 'en' ? 'Phone number is required.' : 'Nambari ya simu inahitajika.');
          setSaving(false);
          return;
        }

        updatedShop = await saveShopMeta({
          phone: phone.trim(),
          alt_phone: altPhone.trim() || null,
          contact_email: contactEmail.trim() || null,
        });

        // Advance onboarding step if contact was current
        let nextStep: OnboardingStep = user.onboarding_step;
        if (nextStep === 'contact' || nextStep === 'account_created') {
          nextStep = 'location';
        }

        updatedUser = await saveShopUser({
          phone: phone.trim(),
          email: contactEmail.trim() || user.email,
          onboarding_step: nextStep,
        });
      } else if (stepType === 'location') {
        if (!selectedTown.trim()) {
          setErrorMsg(language === 'en' ? 'Town/center is required.' : 'Mji au kituo kinahitajika.');
          setSaving(false);
          return;
        }

        updatedShop = await saveShopMeta({
          county: selectedCounty,
          sub_county: selectedSubCounty,
          town: selectedTown.trim(),
          landmark: landmark.trim() || null,
          latitude: lat,
          longitude: lng,
          location_captured_at: gpsCapturedAt,
        });

        let nextStep: OnboardingStep = user.onboarding_step;
        if (nextStep === 'location') {
          nextStep = 'plan';
        }

        updatedUser = await saveShopUser({
          onboarding_step: nextStep,
        });
      } else if (stepType === 'plan') {
        if (!planConsent) {
          setErrorMsg(
            language === 'en'
              ? 'Please acknowledge the subscription terms to proceed.'
              : 'Tafadhali thibitisha masharti ya mpango ili kuendelea.'
          );
          setSaving(false);
          return;
        }

        updatedShop = await saveShopMeta({
          preferred_payment_method: preferredMethod,
          plan_acknowledged: true,
        });

        updatedUser = await saveShopUser({
          onboarding_step: 'complete',
          profile_completed_at: new Date().toISOString(),
        });
      } else if (stepType === 'staff') {
        const cleanEmail = attendantEmail.trim().toLowerCase();
        if (!attendantName.trim() || !cleanEmail || !cleanEmail.includes('@')) {
          setErrorMsg(
            language === 'en'
              ? 'Please provide attendant name and a valid email address.'
              : 'Tafadhali weka jina la mhudumu na barua pepe sahihi.'
          );
          setSaving(false);
          return;
        }

        const currentAttendants = await getStaffAttendants();
        if (currentAttendants.length >= 2) {
          setErrorMsg(
            language === 'en'
              ? 'Maximum limit reached: A shop can have a maximum of 2 attendants.'
              : 'Kiwango cha juu cha wahudumu 2 kimefikiwa kwa duka hili.'
          );
          setSaving(false);
          return;
        }

        const url = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
        const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

        // Pre-register user via Supabase OTP or invite if configured
        if (url && anonKey) {
          try {
            await fetch(`${url}/auth/v1/otp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
              },
              body: JSON.stringify({
                email: cleanEmail,
              }),
            });
          } catch (otpErr) {
            console.warn('Supabase OTP pre-register failed:', otpErr);
          }
        }

        // Store attendant locally
        await addStaffAttendant({
          name: attendantName.trim(),
          phone: cleanEmail,
          email: cleanEmail,
          role: 'attendant',
          pin_hash: 'pending', // Marks as pending invite
          status: 'invited',
        });

        // Generate copyable invitation link with shop_id
        const link = `${window.location.origin}/#role=attendant&email=${encodeURIComponent(cleanEmail)}&name=${encodeURIComponent(attendantName.trim())}&shop_id=${encodeURIComponent(shop.shop_id)}`;
        setGeneratedLink(link);
        return; // Wait for user to copy link and dismiss
      }

      onSuccess(updatedShop, updatedUser);
      onClose();
    } catch (err: any) {
      setErrorMsg(`Error: ${err?.message || 'Could not save'}`);
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    switch (stepType) {
      case 'contact':
        return t.sectionContact;
      case 'location':
        return t.sectionLocation;
      case 'plan':
        return t.sectionPlan;
      case 'staff':
        return t.addStaffBtn;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[85vh] flex flex-col justify-between space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">{getTitle()}</h3>
            <p className="text-xs text-slate-500">
              {language === 'en'
                ? 'Updates save locally and sync automatically'
                : 'Marekebisho yanahifadhiwa kwenye simu yako'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
            {errorMsg}
          </div>
        )}

        <div className="overflow-y-auto space-y-3.5 pr-1">
          {/* STEP: CONTACT */}
          {stepType === 'contact' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.phoneLabel} *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712345678"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.altPhoneLabel}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    value={altPhone}
                    onChange={(e) => setAltPhone(e.target.value)}
                    placeholder="0722334455"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.contactEmailLabel}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="duka@gmail.com"
                    className="w-full h-11 pl-9 pr-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP: LOCATION */}
          {stepType === 'location' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.countyLabel} *
                </label>
                <select
                  value={selectedCounty}
                  onChange={(e) => {
                    const newCounty = e.target.value;
                    setSelectedCounty(newCounty);
                    const c = KENYA_COUNTIES.find((item) => item.county === newCounty);
                    if (c && c.subCounties.length > 0) {
                      setSelectedSubCounty(c.subCounties[0].name);
                      setSelectedTown(c.subCounties[0].towns[0] || '');
                    }
                  }}
                  className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  {KENYA_COUNTIES.map((c) => (
                    <option key={c.county} value={c.county}>
                      {c.county}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.subCountyLabel}
                  </label>
                  <select
                    value={selectedSubCounty}
                    onChange={(e) => {
                      const newSub = e.target.value;
                      setSelectedSubCounty(newSub);
                      const s = subCounties.find((item) => item.name === newSub);
                      if (s && s.towns.length > 0) {
                        setSelectedTown(s.towns[0]);
                      }
                    }}
                    className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  >
                    {subCounties.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.townLabel} *
                  </label>
                  <input
                    type="text"
                    value={selectedTown}
                    onChange={(e) => setSelectedTown(e.target.value)}
                    placeholder="e.g. Kangemi"
                    className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.landmarkLabel}
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Next to stage, opposite mosque"
                  className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* GPS Capture with Offline-Safe SVG Map Pin Thumbnail */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      {lat && lng ? t.gpsSuccess : t.useGpsBtn}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    disabled={isCapturingGps}
                    className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                  >
                    {isCapturingGps ? t.gpsCapturing : lat ? 'Re-capture' : 'Capture GPS'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-tight">{t.gpsReason}</p>

                {lat && lng && (
                  <div className="relative w-full h-20 bg-emerald-50 rounded-xl border border-emerald-200 overflow-hidden flex items-center justify-center">
                    {/* Offline-safe SVG grid and location pin */}
                    <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
                          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#059669" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                    <div className="relative flex flex-col items-center z-10">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg animate-bounce">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-900 mt-0.5">
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: PLAN */}
          {stepType === 'plan' && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">{t.currentPlan}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900 uppercase">
                    KES 30 / {language === 'en' ? 'Day' : 'Siku'}
                  </span>
                </div>
                <div className="text-xs font-medium text-emerald-800">
                  {t.trialEndsDate(
                    new Date(shop.subscription_paid_until || Date.now() + 86400000).toLocaleDateString()
                  )}
                </div>
                <p className="text-[11.5px] text-emerald-700 leading-snug">{t.pricingPendingNotice}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.preferredBillingMethod}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                      preferredMethod === 'mpesa'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="billing"
                      checked={preferredMethod === 'mpesa'}
                      onChange={() => setPreferredMethod('mpesa')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs">{t.mpesaOption}</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                      preferredMethod === 'cash'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="billing"
                      checked={preferredMethod === 'cash'}
                      onChange={() => setPreferredMethod('cash')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs">{t.cashOption}</span>
                  </label>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-slate-800 block">
                  {language === 'en' ? 'Payment Channels:' : 'Njia za Malipo:'}
                </span>
                <p>{t.tillPaymentNotice}</p>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={planConsent}
                  onChange={(e) => setPlanConsent(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="leading-tight">{t.consentCheckbox}</span>
              </label>
            </div>
          )}

          {/* STEP: ADD STAFF */}
          {stepType === 'staff' && (
            <div className="space-y-4">
              {generatedLink ? (
                <div className="space-y-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                    ✉️
                  </div>
                  <h3 className="text-sm font-black text-emerald-900">
                    {language === 'en' ? 'Invitation Generated!' : 'Mwaliko Umetengenezwa!'}
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    {language === 'en'
                      ? 'The attendant has been pre-registered in Supabase. Copy the secure link below to send to them:'
                      : 'Mhudumu amesajiliwa kwenye Supabase. Nakili kiunga hapa chini ili umtumie:'}
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="flex items-center gap-1.5 p-2 bg-white border border-emerald-300 rounded-xl w-full flex-1">
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="w-full text-[10px] font-mono text-slate-700 bg-transparent outline-none border-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(generatedLink);
                            window.alert(language === 'en' ? 'Link copied to clipboard!' : 'Kiunga kimenakiliwa!');
                          }
                        }}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-bold active:scale-[0.98] shrink-0"
                      >
                        {language === 'en' ? 'Copy Link' : 'Nakili'}
                      </button>
                    </div>

                    <a
                      href={`mailto:${encodeURIComponent(attendantEmail.trim())}?subject=${encodeURIComponent(`Invitation to join ${shop.shop_name} on Smartsort`)}&body=${encodeURIComponent(`Hello ${attendantName.trim()},\n\nYou have been invited to join ${shop.shop_name} as an attendant on Smartsort.\n\nPlease click the link below to set up your account and access the shop:\n${generatedLink}\n\nKaribu!`)}`}
                      className="w-full sm:w-auto px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center transition flex items-center justify-center gap-1 shrink-0"
                    >
                      <span>📧 {language === 'en' ? 'Open Email' : 'Fungua Email'}</span>
                    </a>
                  </div>
                  
                  <span className="text-[9px] text-slate-400 block pt-1">
                    {language === 'en'
                      ? 'They will follow this link to set their password and 4-digit unlock code.'
                      : 'Watafuata kiunga hiki ili kuweka nenosiri na nambari ya siri ya kufungua.'}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.attendantName} *
                    </label>
                    <input
                      type="text"
                      value={attendantName}
                      onChange={(e) => setAttendantName(e.target.value)}
                      placeholder="e.g. Brian Omondi"
                      className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'en' ? 'Attendant Email Address' : 'Barua Pepe ya Mhudumu'} *
                    </label>
                    <input
                      type="email"
                      value={attendantEmail}
                      onChange={(e) => setAttendantEmail(e.target.value)}
                      placeholder="e.g. brian@gmail.com"
                      className="w-full h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {language === 'en'
                        ? 'Pre-registers them securely in Supabase Auth to enable remote access.'
                        : 'Inawasajili salama kwenye Supabase Auth ili kuwawezesha kuingia duka.'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" size="md" onClick={onClose} disabled={saving}>
            {generatedLink ? (language === 'en' ? 'Close' : 'Funga') : t.cancel}
          </Button>
          {!generatedLink && (
            <Button
              variant="gradient"
              size="md"
              fullWidth
              onClick={handleSave}
              disabled={saving}
              className="font-bold"
            >
              {saving
                ? t.loading
                : stepType === 'staff'
                ? language === 'en'
                  ? 'Send Invite Link'
                  : 'Tuma Mwaliko'
                : stepType === 'location'
                ? language === 'en'
                  ? 'Save Location'
                  : 'Hifadhi Eneo'
                : stepType === 'plan'
                ? language === 'en'
                  ? 'Confirm & Finish'
                  : 'Thibitisha & Kamilisha'
                : language === 'en'
                ? 'Save Changes'
                : 'Hifadhi Mabadiliko'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
