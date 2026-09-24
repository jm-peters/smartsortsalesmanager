export type Language = 'en' | 'sw';

export interface Translations {
  // Navigation & General
  sell: string;
  stock: string;
  deni: string;
  reports: string;
  settings: string;
  profile: string;
  owner: string;
  attendant: string;
  online: string;
  offline: string;
  syncNow: string;
  taglineDefault: string;
  save: string;
  cancel: string;
  close: string;
  edit: string;
  delete: string;
  confirm: string;
  back: string;
  continue: string;
  loading: string;
  search: string;

  // Header
  languageToggle: string;

  // Auth Screen
  loginTitle: string;
  loginSubtitle: string;
  signupTitle: string;
  signupSubtitle: string;
  usernameOrEmail: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  shopName: string;
  signInBtn: string;
  createAccountBtn: string;
  orUsePin: string;
  orUsePassword: string;
  noAccountPrompt: string;
  haveAccountPrompt: string;
  offlineAuthWarning: string;
  demoAutofillBtn: string;
  pinTitle: string;
  pinSubtitle: string;
  invalidCredentials: string;
  passwordTooShort: string;
  passwordsDoNotMatch: string;
  usernameRequirements: string;
  usernameTaken: string;

  // Profile Completion Banner & Modal
  profileCompletionBanner: string;
  stepOf: (current: number, total: number) => string;
  completeProfilePrompt: string;
  dismiss: string;

  // Profile Hub
  profileTitle: string;
  profileSubtitle: string;
  memberSince: (date: string) => string;
  taglinePrompt: string;
  editShopName: string;
  editTagline: string;
  chooseAvatar: string;
  statsToday: string;
  statsThisWeek: string;
  statsCustomers: string;
  statsProducts: string;
  noSalesYet: string;
  startSellingNow: string;

  // Completeness Ring
  profileCompletedPercent: (pct: number) => string;
  nudgeContact: string;
  nudgeLocation: string;
  nudgePlan: string;
  nudgeComplete: string;

  // Profile Detail Sections
  sectionContact: string;
  sectionLocation: string;
  sectionStaff: string;
  sectionPlan: string;
  statusComplete: string;
  statusIncomplete: string;

  // Contact Section
  phoneLabel: string;
  altPhoneLabel: string;
  contactEmailLabel: string;

  // Location Section
  countyLabel: string;
  subCountyLabel: string;
  townLabel: string;
  landmarkLabel: string;
  useGpsBtn: string;
  gpsCapturing: string;
  gpsSuccess: string;
  gpsReason: string;

  // Staff Section
  staffTitle: string;
  addStaffBtn: string;
  attendantName: string;
  attendantPhone: string;
  attendantPin: string;

  // Plan Section
  planTitle: string;
  currentPlan: string;
  trialStatus: string;
  trialEndsDate: (date: string) => string;
  pricingPendingNotice: string;
  preferredBillingMethod: string;
  mpesaOption: string;
  cashOption: string;
  consentCheckbox: string;
  payNow: string;
  dailyRate: string;
  subscriptionDue: string;
  subscriptionActive: string;
  tillPaymentNotice: string;

  // Business Card / Share
  shareShopCardBtn: string;
  shareSuccess: string;
  businessCardHeading: string;

  // Sell Screen
  searchDukaPlaceholder: string;
  clearSearch: string;
  quickAdd: string;
  noProductsFound: string;
  noProductsYet: string;
  noMatchSubtitle: (q: string) => string;
  startStockPrompt: string;
  addProductsToStock: string;
  soldToast: (amount: string) => string;
  sendReceipt: string;
  undo: string;
  holdCart: string;
  holdThisCartPrompt: string;
  heldCartRestored: string;
  sellTotal: (total: string) => string;
  currentCartTitle: string;
  emptyCartPrompt: string;
  customerLabel: string;
  paymentCash: string;
  paymentMpesa: string;
  paymentDeni: string;
  amountReceivedLabel: string;
  changeDueLabel: string;
  completeSaleBtn: string;

  // Stock Screen
  stockTitle: string;
  stockSearchPlaceholder: string;
  addProductBtn: string;
  allProductsTab: string;
  lowStockTab: string;
  buyingPriceLabel: string;
  sellingPriceLabel: string;
  marginLabel: string;
  currentStockLabel: string;
  reorderLevelLabel: string;
  packSizeLabel: string;
  restockListBtn: string;
  stockTakeBtn: string;
  noStockItems: string;
  lowStockAlert: string;

  // Deni / Credit Screen
  deniTitle: string;
  creditSearchPlaceholder: string;
  recordCreditBtn: string;
  totalOutstandingCredit: string;
  allDebtsTab: string;
  unpaidTab: string;
  overdueTab: string;
  recordPaymentBtn: string;
  remindWhatsAppBtn: string;
  remindSmsBtn: string;
  noDebtsFound: string;
  creditLimitExceeded: string;

  // Reports Screen
  reportsTitle: string;
  todayTab: string;
  yesterdayTab: string;
  thisWeekTab: string;
  thisMonthTab: string;
  grossSalesLabel: string;
  estimatedProfitLabel: string;
  totalExpensesLabel: string;
  cashInDrawerLabel: string;
  mpesaSalesLabel: string;
  topSellingProducts: string;
  dayCloseBtn: string;
  exportCsvBtn: string;

  // Settings Screen
  settingsTitle: string;
  shopInfoHeading: string;
  saveShopInfoBtn: string;
  appLanguageHeading: string;
  deviceRoleHeading: string;
  storageAndSyncHeading: string;
  cloudSyncNowBtn: string;
  backupDataBtn: string;
  restoreDataBtn: string;
  signOutBtn: string;

  // Receipt Modal
  receiptTitle: string;
  receiptSubtitle: (saleNo: string) => string;
  copyReceiptBtn: string;
  copiedBtn: string;
  shareReceiptBtn: string;
  customerReceiptLabel: string;
  totalReceiptLabel: string;
  paymentMethodReceiptLabel: string;
  thankYouReceipt: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    // Navigation & General
    sell: 'Sell',
    stock: 'Stock',
    deni: 'Credit',
    reports: 'Reports',
    settings: 'Settings',
    profile: 'Shop Profile',
    owner: 'OWNER',
    attendant: 'ATTENDANT',
    online: 'Online',
    offline: 'Offline',
    syncNow: 'Sync Now',
    taglineDefault: 'Your reliable neighborhood duka',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    edit: 'Edit',
    delete: 'Delete',
    confirm: 'Confirm',
    back: 'Back',
    continue: 'Continue',
    loading: 'Loading...',
    search: 'Search products...',

    // Header
    languageToggle: '🇰🇪 Kiswahili',

    // Auth Screen
    loginTitle: 'Sign In to Your Duka',
    loginSubtitle: 'Enter your username or email and password',
    signupTitle: 'Create Duka Account',
    signupSubtitle: 'Fast setup for small Kenyan retail shops',
    usernameOrEmail: 'Username or Email',
    username: 'Username (lowercase letters, numbers, . _)',
    email: 'Email address',
    password: 'Password (min 8 characters)',
    confirmPassword: 'Confirm Password',
    fullName: 'Owner Full Name',
    shopName: 'Shop Name',
    signInBtn: 'Sign In',
    createAccountBtn: 'Create Account',
    orUsePin: 'Quick Device PIN Unlock',
    orUsePassword: 'Sign in with Password',
    noAccountPrompt: "Don't have an account?",
    haveAccountPrompt: 'Already have an account?',
    offlineAuthWarning: 'Internet connection is required for first sign-in on this device.',
    demoAutofillBtn: ' Demo Quick Fill',
    pinTitle: 'Quick Device Unlock',
    pinSubtitle: 'Enter your 4-digit device PIN',
    invalidCredentials: 'Username/email or password is incorrect.',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordsDoNotMatch: 'Passwords do not match.',
    usernameRequirements: 'Username must be 3-20 characters with letters, numbers, or . _ only',
    usernameTaken: 'Username is already taken. Please choose another.',

    // Profile Completion Banner & Modal
    profileCompletionBanner: 'Complete your shop profile',
    stepOf: (current, total) => `(Step ${current} of ${total})`,
    completeProfilePrompt: 'Add your contact details, location, and subscription preferences.',
    dismiss: 'Dismiss',

    // Profile Hub
    profileTitle: 'Shop Profile',
    profileSubtitle: 'Your business identity and setup status',
    memberSince: (date) => `Member since ${date}`,
    taglinePrompt: 'Add a short description of your shop...',
    editShopName: 'Edit Shop Name',
    editTagline: 'Edit Tagline',
    chooseAvatar: 'Choose Shop Emoji',
    statsToday: "Today's Sales",
    statsThisWeek: 'This Week',
    statsCustomers: 'Customers',
    statsProducts: 'Products',
    noSalesYet: 'No sales recorded yet. Start selling now!',
    startSellingNow: 'Start Selling',

    // Completeness Ring
    profileCompletedPercent: (pct) => `Profile ${pct}% complete`,
    nudgeContact: 'Add owner phone & contact info',
    nudgeLocation: 'Add shop town and county location',
    nudgePlan: 'Confirm your subscription billing preferences',
    nudgeComplete: 'Your shop profile is fully set up!',

    // Profile Detail Sections
    sectionContact: 'Contact Details',
    sectionLocation: 'Shop Location',
    sectionStaff: 'Staff & Cashiers',
    sectionPlan: 'Subscription Plan',
    statusComplete: 'Complete',
    statusIncomplete: 'Incomplete',

    // Contact Section
    phoneLabel: 'Owner Phone Number (M-Pesa)',
    altPhoneLabel: 'Alternate Phone (Optional)',
    contactEmailLabel: 'Public Contact Email',

    // Location Section
    countyLabel: 'County',
    subCountyLabel: 'Sub-County',
    townLabel: 'Town / Center',
    landmarkLabel: 'Landmark / Directions (e.g., Near Naivas, Opposite Church)',
    useGpsBtn: 'Capture GPS Location',
    gpsCapturing: 'Getting GPS coordinates...',
    gpsSuccess: 'GPS Location Captured',
    gpsReason: 'This helps customers and suppliers locate your shop accurately.',

    // Staff Section
    staffTitle: 'Shop Attendants',
    addStaffBtn: '+ Add Attendant',
    attendantName: 'Attendant Name',
    attendantPhone: 'Phone Number',
    attendantPin: 'Device Unlock PIN (4 Digits)',

    // Plan Section
    planTitle: 'Daily Subscription (KES 30 / day)',
    currentPlan: 'Daily Access',
    trialStatus: 'KES 30 / Day',
    trialEndsDate: (date) => `Paid until ${date}`,
    pricingPendingNotice: 'Daily duka subscription is KES 30/day. Pay easily via M-Pesa STK Push or Buy Goods Till.',
    preferredBillingMethod: 'Payment Method',
    mpesaOption: 'M-Pesa STK Push',
    cashOption: 'Buy Goods Till (Manual)',
    consentCheckbox: 'I agree to the KES 30 daily subscription rate to access smartsort POS and inventory tools.',
    payNow: 'Pay Now',
    dailyRate: 'KES 30 / day',
    subscriptionDue: 'Payment Due (KES 30)',
    subscriptionActive: 'Active Subscription',
    tillPaymentNotice: 'Pay via Buy Goods Till 6997912 or request an M-Pesa prompt directly on your phone.',

    // Business Card / Share
    shareShopCardBtn: 'Share Shop Business Card',
    shareSuccess: 'Shop card copied to clipboard!',
    businessCardHeading: 'SmartSort Verified Duka',

    // Sell Screen
    searchDukaPlaceholder: 'Search products in shop...',
    clearSearch: 'Clear',
    quickAdd: 'Quick Add',
    noProductsFound: 'No products found',
    noProductsYet: 'No products in shop yet',
    noMatchSubtitle: (q) => `No products match "${q}". Check your spelling.`,
    startStockPrompt: 'Start adding your shop products or import Kenyan standard catalog.',
    addProductsToStock: 'Add Products to Stock',
    soldToast: (amount) => `Sold! ${amount}`,
    sendReceipt: 'Send Receipt',
    undo: 'Undo',
    holdCart: 'Hold Cart',
    holdThisCartPrompt: 'Current cart has items. Hold it before restoring this one?',
    heldCartRestored: 'Held cart restored to active sales screen.',
    sellTotal: (total) => `Sell · ${total}`,
    currentCartTitle: 'Current Cart',
    emptyCartPrompt: 'Your cart is empty. Tap products to add.',
    customerLabel: 'Customer',
    paymentCash: 'Cash',
    paymentMpesa: 'M-Pesa',
    paymentDeni: 'Credit (Deni)',
    amountReceivedLabel: 'Amount Paid (KES)',
    changeDueLabel: 'Change Due',
    completeSaleBtn: 'Complete Sale',

    // Stock Screen
    stockTitle: 'Inventory & Stock',
    stockSearchPlaceholder: 'Search inventory...',
    addProductBtn: '+ Add Product',
    allProductsTab: 'All Products',
    lowStockTab: 'Low Stock',
    buyingPriceLabel: 'Buying / Cost Price',
    sellingPriceLabel: 'Selling Price',
    marginLabel: 'Margin',
    currentStockLabel: 'Current Quantity',
    reorderLevelLabel: 'Reorder Level',
    packSizeLabel: 'Pack Size (optional)',
    restockListBtn: 'Restock List',
    stockTakeBtn: 'Stock Count',
    noStockItems: 'No inventory items registered yet.',
    lowStockAlert: 'Low Stock Alert',

    // Deni / Credit Screen
    deniTitle: 'Customer Credit & Debts',
    creditSearchPlaceholder: 'Search customer...',
    recordCreditBtn: '+ Record Debt',
    totalOutstandingCredit: 'Total Outstanding Credit',
    allDebtsTab: 'All Debts',
    unpaidTab: 'Unpaid',
    overdueTab: 'Overdue (30+ Days)',
    recordPaymentBtn: 'Record Payment',
    remindWhatsAppBtn: 'Remind on WhatsApp',
    remindSmsBtn: 'Remind via SMS',
    noDebtsFound: 'No credit records found.',
    creditLimitExceeded: 'Credit Limit Exceeded',

    // Reports Screen
    reportsTitle: 'Sales & Business Reports',
    todayTab: 'Today',
    yesterdayTab: 'Yesterday',
    thisWeekTab: 'This Week',
    thisMonthTab: 'This Month',
    grossSalesLabel: 'Gross Sales',
    estimatedProfitLabel: 'Estimated Profit',
    totalExpensesLabel: 'Total Expenses',
    cashInDrawerLabel: 'Cash in Drawer',
    mpesaSalesLabel: 'M-Pesa Sales',
    topSellingProducts: 'Top Selling Products',
    dayCloseBtn: 'Close Day / Shift',
    exportCsvBtn: 'Export CSV',

    // Settings Screen
    settingsTitle: 'Shop Settings',
    shopInfoHeading: 'Shop Information',
    saveShopInfoBtn: 'Save Shop Info',
    appLanguageHeading: 'Application Language',
    deviceRoleHeading: 'Current Device Role',
    storageAndSyncHeading: 'Storage & Cloud Sync',
    cloudSyncNowBtn: 'Sync Cloud Now',
    backupDataBtn: 'Backup & Export',
    restoreDataBtn: 'Restore Data',
    signOutBtn: 'Lock / Sign Out',

    // Receipt Modal
    receiptTitle: 'Sales Receipt',
    receiptSubtitle: (saleNo) => `Sale #${saleNo}`,
    copyReceiptBtn: 'Copy Receipt',
    copiedBtn: 'Copied!',
    shareReceiptBtn: 'Share Receipt',
    customerReceiptLabel: 'Customer',
    totalReceiptLabel: 'TOTAL',
    paymentMethodReceiptLabel: 'Payment Method',
    thankYouReceipt: 'Thank you for your business!',
  },
  sw: {
    // Navigation & General
    sell: 'Uza',
    stock: 'Stock',
    deni: 'Deni',
    reports: 'Ripoti',
    settings: 'Mipangilio',
    profile: 'Wasifu wa Duka',
    owner: 'MWENYE DUKA',
    attendant: 'MHUDUMU',
    online: 'Mtandaoni',
    offline: 'Bila Mtandao',
    syncNow: 'Rusha Data Sasa',
    taglineDefault: 'Duka lako la mahitaji ya nyumbani',
    save: 'Hifadhi',
    cancel: 'Ghairi',
    close: 'Funga',
    edit: 'Hariri',
    delete: 'Futa',
    confirm: 'Thibitisha',
    back: 'Rudi Nyuma',
    continue: 'Endelea',
    loading: 'Inapakia...',
    search: 'Tafuta bidhaa...',

    // Header
    languageToggle: '🇬🇧 English',

    // Auth Screen
    loginTitle: 'Ingia kwenye Duka Lako',
    loginSubtitle: 'Weka jina la mtumiaji au barua pepe na password',
    signupTitle: 'Fungua Akaunti ya Duka',
    signupSubtitle: 'Usajili wa haraka kwa maduka ya rejareja nchini Kenya',
    usernameOrEmail: 'Jina la Mtumiaji au Barua Pepe',
    username: 'Jina la Mtumiaji (herufi ndogo, nambari, . _)',
    email: 'Barua pepe',
    password: 'Password (zisizopungua 8)',
    confirmPassword: 'Rudia Password',
    fullName: 'Jina Kamili la Mmiliki',
    shopName: 'Jina la Duka',
    signInBtn: 'Ingia',
    createAccountBtn: 'Unda Akaunti',
    orUsePin: 'Fungua kwa PIN ya Simu',
    orUsePassword: 'Ingia kwa Password',
    noAccountPrompt: 'Huna akaunti bado?',
    haveAccountPrompt: 'Tayari una akaunti?',
    offlineAuthWarning: 'Unahitaji intaneti kwa mara ya kwanza kwenye simu hii.',
    demoAutofillBtn: '⚡ Jaza Demo Haraka',
    pinTitle: 'Fungua Simu Yako',
    pinSubtitle: 'Weka PIN yako ya tarakimu 4',
    invalidCredentials: 'Jina la mtumiaji/barua pepe au password si sahihi.',
    passwordTooShort: 'Password lazima iwe na angalau herufi 8.',
    passwordsDoNotMatch: 'Password hazilingani.',
    usernameRequirements: 'Jina la mtumiaji liwe na herufi 3-20 (herufi ndogo, nambari, . _)',
    usernameTaken: 'Jina hili la mtumiaji limetumika. Chagua jingine.',

    // Profile Completion Banner & Modal
    profileCompletionBanner: 'Kamilisha wasifu wa duka lako',
    stepOf: (current, total) => `(Hatua ${current} ya ${total})`,
    completeProfilePrompt: 'Weka mawasiliano, mahali duka lilipo, na mpango wa malipo.',
    dismiss: 'Ondoa',

    // Profile Hub
    profileTitle: 'Wasifu wa Duka',
    profileSubtitle: 'Utambulisho wa biashara na hali ya usanidi',
    memberSince: (date) => `Mwanachama tangu ${date}`,
    taglinePrompt: 'Ongeza maelezo mafupi ya duka lako...',
    editShopName: 'Hariri Jina la Duka',
    editTagline: 'Hariri Maelezo Mafupi',
    chooseAvatar: 'Chagua Emoji ya Duka',
    statsToday: 'Mauzo ya Leo',
    statsThisWeek: 'Wiki Hii',
    statsCustomers: 'Wateja',
    statsProducts: 'Bidhaa',
    noSalesYet: 'Bado hujafanya mauzo. Anza sasa!',
    startSellingNow: 'Anza Kuuza',

    // Completeness Ring
    profileCompletedPercent: (pct) => `Wasifu umekamilika kwa ${pct}%`,
    nudgeContact: 'Weka nambari ya simu ya mmiliki',
    nudgeLocation: 'Weka mji na kaunti ya duka lako',
    nudgePlan: 'Thibitisha mapendeleo ya malipo ya kila siku',
    nudgeComplete: 'Wasifu wa duka lako umekamilika kikamilifu!',

    // Profile Detail Sections
    sectionContact: 'Mawasiliano',
    sectionLocation: 'Mahali Lilipo Duka',
    sectionStaff: 'Wafanyakazi na Wahudumu',
    sectionPlan: 'Mpango wa Malipo',
    statusComplete: 'Kamili',
    statusIncomplete: 'Haijakamilika',

    // Contact Section
    phoneLabel: 'Nambari ya Simu ya Mmiliki (M-Pesa)',
    altPhoneLabel: 'Nambari Mbadala (Hiari)',
    contactEmailLabel: 'Barua Pepe ya Duka',

    // Location Section
    countyLabel: 'Kaunti',
    subCountyLabel: 'Sub-Kaunti',
    townLabel: 'Mji / Kituo',
    landmarkLabel: 'Kituo Maarufu / Maelekezo (mfano: Karibu na Naivas, Mkabili wa Kanisa)',
    useGpsBtn: 'Weka Mahali kwa GPS',
    gpsCapturing: 'Inapata majira ya GPS...',
    gpsSuccess: 'GPS Imehifadhiwa',
    gpsReason: 'Hii itasaidia wateja na wasambazaji kupata duka lako kwa urahisi.',

    // Staff Section
    staffTitle: 'Wahudumu wa Duka',
    addStaffBtn: '+ Ongeza Mhudumu',
    attendantName: 'Jina la Mhudumu',
    attendantPhone: 'Nambari ya Simu',
    attendantPin: 'PIN ya Kufungua Simu (Tarakimu 4)',

    // Plan Section
    planTitle: 'Mpango wa Ada ya Kila Siku (KES 30 / siku)',
    currentPlan: 'Ufikiaji wa Kila Siku wa Duka',
    trialStatus: 'KES 30 / Siku',
    trialEndsDate: (date) => `Umelipa hadi ${date}`,
    pricingPendingNotice: 'Ada ya duka ni KES 30 kwa siku. Lipa kwa urahisi kupitia M-Pesa STK Push au Buy Goods Till.',
    preferredBillingMethod: 'Njia ya Kulipa',
    mpesaOption: 'M-Pesa STK Push',
    cashOption: 'Buy Goods Till (Moja kwa Moja)',
    consentCheckbox: 'Ninakubali ada ya KES 30 ya kila siku ili kutumia mfumo wa mauzo na bidhaa wa SmartSort.',
    payNow: 'Lipa Sasa',
    dailyRate: 'KES 30 / siku',
    subscriptionDue: 'Malipo ya Ada Yanahitajika',
    subscriptionActive: 'Uanachama Uko Hai',
    tillPaymentNotice: 'Lipa kupitia Buy Goods Till 542190 au tuma ombi la M-Pesa moja kwa moja kwenye simu yako.',

    // Business Card / Share
    shareShopCardBtn: 'Shiriki Wasifu wa Duka',
    shareSuccess: 'Kadi ya duka imenakiliwa!',
    businessCardHeading: 'Duka Lililothibitishwa la SmartSort',

    // Sell Screen
    searchDukaPlaceholder: 'Tafuta bidhaa dukani...',
    clearSearch: 'Futa',
    quickAdd: 'Ongeza Haraka',
    noProductsFound: 'Hakuna bidhaa iliyopatikana',
    noProductsYet: 'Duka halina bidhaa bado',
    noMatchSubtitle: (q) => `Hakuna bidhaa inayolingana na "${q}". Angalia tahajia yako.`,
    startStockPrompt: 'Anza kuongeza bidhaa za duka lako au weka bidhaa za kawaida za Kenya.',
    addProductsToStock: 'Ongeza Bidhaa Kwenye Stock',
    soldToast: (amount) => `Umeuza! ${amount}`,
    sendReceipt: 'Tuma Risiti',
    undo: 'Ghairi',
    holdCart: 'Shikilia',
    holdThisCartPrompt: 'Kikapu cha sasa kina bidhaa. Je, ungependa kukishikilia kabla ya kurejesha hiki?',
    heldCartRestored: 'Mkokoteni ulioshikiliwa umerejeshwa uwanjani.',
    sellTotal: (total) => `Uza · ${total}`,
    currentCartTitle: 'Kikapu cha Mauzo',
    emptyCartPrompt: 'Kikapu hakina bidhaa. Gusa bidhaa ili kuongeza.',
    customerLabel: 'Mteja',
    paymentCash: 'Pesa Taslimu',
    paymentMpesa: 'M-Pesa',
    paymentDeni: 'Deni',
    amountReceivedLabel: 'Kiasi Kilicholipwa (KES)',
    changeDueLabel: 'Chenji',
    completeSaleBtn: 'Kamilisha Mauzo',

    // Stock Screen
    stockTitle: 'Usimamizi wa Stock',
    stockSearchPlaceholder: 'Tafuta kwenye stock...',
    addProductBtn: '+ Ongeza Bidhaa',
    allProductsTab: 'Bidhaa Zote',
    lowStockTab: 'Stock Ndogo',
    buyingPriceLabel: 'Bei ya Kununua',
    sellingPriceLabel: 'Bei ya Kuuza',
    marginLabel: 'Faida %',
    currentStockLabel: 'Kiasi Kilichopo',
    reorderLevelLabel: 'Kiwango cha Kuagiza',
    packSizeLabel: 'Ukubwa wa Pakiti (hiari)',
    restockListBtn: 'Orodha ya Kununua',
    stockTakeBtn: 'Hesabu Stock',
    noStockItems: 'Bado hakuna bidhaa zilizosajiliwa.',
    lowStockAlert: 'Tahadhari ya Stock Ndogo',

    // Deni / Credit Screen
    deniTitle: 'Madeni na Mikopo ya Wateja',
    creditSearchPlaceholder: 'Tafuta mteja...',
    recordCreditBtn: '+ Rekodi Deni',
    totalOutstandingCredit: 'Jumla ya Madeni Yote',
    allDebtsTab: 'Madeni Yote',
    unpaidTab: 'Haijalipwa',
    overdueTab: 'Yaliyochelewa (Siku 30+)',
    recordPaymentBtn: 'Lipisha Deni',
    remindWhatsAppBtn: 'Kumbusha WhatsApp',
    remindSmsBtn: 'Kumbusha SMS',
    noDebtsFound: 'Hakuna rekodi za madeni.',
    creditLimitExceeded: 'Kikomo cha Deni Kimefikwa',

    // Reports Screen
    reportsTitle: 'Ripoti za Mauzo na Biashara',
    todayTab: 'Leo',
    yesterdayTab: 'Jana',
    thisWeekTab: 'Wiki Hii',
    thisMonthTab: 'Mwezi Huu',
    grossSalesLabel: 'Jumla ya Mauzo',
    estimatedProfitLabel: 'Makadirio ya Faida',
    totalExpensesLabel: 'Jumla ya Matumizi',
    cashInDrawerLabel: 'Pesa Taslimu Sandukuni',
    mpesaSalesLabel: 'Mauzo ya M-Pesa',
    topSellingProducts: 'Bidhaa Zinazouza Zaidi',
    dayCloseBtn: 'Funga Siku / Shift',
    exportCsvBtn: 'Pakua CSV',

    // Settings Screen
    settingsTitle: 'Mipangilio ya Duka',
    shopInfoHeading: 'Taarifa za Duka',
    saveShopInfoBtn: 'Hifadhi Taarifa za Duka',
    appLanguageHeading: 'Lugha ya Programu',
    deviceRoleHeading: 'Wadhifa wa Kifaa Hiki',
    storageAndSyncHeading: 'Hifadhi na Mtandao (Storage & Sync)',
    cloudSyncNowBtn: 'Rusha Data Mtandaoni',
    backupDataBtn: 'Pakua Nakala (Backup)',
    restoreDataBtn: 'Rejesha Data (Restore)',
    signOutBtn: 'Funga / Toka Nje',

    // Receipt Modal
    receiptTitle: 'Risiti ya Mauzo',
    receiptSubtitle: (saleNo) => `Mauzo #${saleNo}`,
    copyReceiptBtn: 'Nakili Risiti',
    copiedBtn: 'Imenakiliwa!',
    shareReceiptBtn: 'Shiriki Risiti',
    customerReceiptLabel: 'Mteja',
    totalReceiptLabel: 'JUMLA',
    paymentMethodReceiptLabel: 'Njia ya Malipo',
    thankYouReceipt: 'Asante sana kwa kufanya biashara nasi!',
  },
};
