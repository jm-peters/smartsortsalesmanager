import { formatKES, type KES } from './money';
import type { Language } from './i18n';
import { formatKenyanPhoneForWhatsApp } from './receipt';

export { formatKenyanPhoneForWhatsApp };

export interface DebtorReminderOptions {
  customerName: string;
  customerPhone?: string | null;
  shopName: string;
  totalBalance: number | KES;
  principal?: number | KES;
  amountPaid?: number | KES;
  daysOld?: number;
  tillNumber?: string | null;
  language?: Language;
}

/**
 * Generates a polite, clear, professional text reminder formatted with
 * markdown bold (*text*) and emojis tailored for WhatsApp and SMS.
 */
export function generateDebtorReminderText(options: DebtorReminderOptions): string {
  const {
    customerName,
    shopName,
    totalBalance,
    principal,
    amountPaid = 0,
    daysOld,
    tillNumber,
    language = 'en',
  } = options;

  const isEn = language === 'en';
  const name = customerName.trim();
  const cleanShop = shopName.trim().toUpperCase();
  const balanceStr = formatKES(totalBalance);

  const lines: string[] = [];

  if (isEn) {
    lines.push(`👋 *Hello ${name}*,`);
    lines.push('');
    lines.push(`This is a friendly payment reminder from *${cleanShop}*.`);
    lines.push('');
    lines.push('📋 *PENDING BALANCE SUMMARY:*');
    lines.push(`• *Outstanding Amount:* *${balanceStr}*`);
    if (principal && principal > totalBalance) {
      lines.push(`• *Original Credit:* ${formatKES(principal)}`);
    }
    if (amountPaid && amountPaid > 0) {
      lines.push(`• *Amount Paid So Far:* ${formatKES(amountPaid)}`);
    }
    if (typeof daysOld === 'number' && daysOld > 0) {
      lines.push(`• *Duration:* ${daysOld} ${daysOld === 1 ? 'day' : 'days'} ago`);
    }

    if (tillNumber && tillNumber.trim()) {
      lines.push('');
      lines.push('💳 *HOW TO PAY VIA M-PESA:*');
      lines.push(`• *Till Number (Buy Goods):* *${tillNumber.trim()}*`);
      lines.push(`• *Account Name:* ${name}`);
    }

    lines.push('');
    lines.push('Kindly arrange to clear this balance at your earliest convenience, or visit the shop. We appreciate your continued support and partnership! 🙏');
    lines.push('');
    lines.push(`_${shopName} · SmartSort Duka_`);
  } else {
    lines.push(`👋 *Habari ${name}*,`);
    lines.push('');
    lines.push(`Hili ni kumbusho la kirafiki kuhusu salio la duka kutoka *${cleanShop}*.`);
    lines.push('');
    lines.push('📋 *TAARIFA ZA DENI LAKO:*');
    lines.push(`• *Salio Lililobaki:* *${balanceStr}*`);
    if (principal && principal > totalBalance) {
      lines.push(`• *Kiasi cha Awali:* ${formatKES(principal)}`);
    }
    if (amountPaid && amountPaid > 0) {
      lines.push(`• *Kiasi Kilicholipwa:* ${formatKES(amountPaid)}`);
    }
    if (typeof daysOld === 'number' && daysOld > 0) {
      lines.push(`• *Muda:* Siku ${daysOld} zilizopita`);
    }

    if (tillNumber && tillNumber.trim()) {
      lines.push('');
      lines.push('💳 *JINSI YA KULIPA KWA M-PESA:*');
      lines.push(`• *Till Number (Buy Goods):* *${tillNumber.trim()}*`);
      lines.push(`• *Jina la Akaunti:* ${name}`);
    }

    lines.push('');
    lines.push('Tafadhali kamilisha malipo haya kwa wakati unaofaa au fika dukani. Tunashukuru sana kwa ushirikiano na uaminifu wako! 🙏');
    lines.push('');
    lines.push(`_${shopName} · SmartSort Duka_`);
  }

  return lines.join('\n');
}

/**
 * Generate a direct WhatsApp click-to-chat URL with the reminder message prefilled.
 * If customerPhone is present, target their direct chat (wa.me/254...).
 * If not, opens WhatsApp with the contact selector.
 */
export function generateDebtorWhatsAppUrl(options: DebtorReminderOptions): string {
  const text = generateDebtorReminderText(options);
  const formattedPhone = formatKenyanPhoneForWhatsApp(options.customerPhone);
  const encodedText = encodeURIComponent(text);

  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Opens WhatsApp directly in a new tab or window with anchor fallback.
 */
export function openDebtorWhatsApp(options: DebtorReminderOptions): boolean {
  const url = generateDebtorWhatsAppUrl(options);
  if (typeof window === 'undefined') return false;

  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    return true;
  } catch {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
}

/**
 * Share the debtor reminder via WhatsApp, native system share, or clipboard.
 */
export async function shareDebtorReminder(
  options: DebtorReminderOptions,
  channel: 'whatsapp' | 'system' | 'copy' = 'whatsapp'
): Promise<'whatsapp_opened' | 'shared' | 'copied' | 'failed'> {
  const text = generateDebtorReminderText(options);

  if (channel === 'whatsapp') {
    openDebtorWhatsApp(options);
    return 'whatsapp_opened';
  }

  if (channel === 'system') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${options.language === 'sw' ? 'Kumbusho la Deni' : 'Payment Reminder'} - ${options.shopName}`,
          text,
        });
        return 'shared';
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return 'failed';
        }
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}

export const SMARTSORT_HELPLINE_PHONE = '+254700000000';
export const SMARTSORT_HELPLINE_DISPLAY = '0700 000 000';

export interface DefaultedDebtClaimOptions {
  debtId: string;
  customerName: string;
  customerPhone?: string | null;
  shopName: string;
  principal: number | KES;
  balance: number | KES;
  daysOld: number;
  compensationAmount: number | KES;
  compensationRate?: number; // default 0.70
  language?: Language;
  shopPhone?: string;
  sellerName?: string;
}

/**
 * Checks if a product debt is defaulted (unpaid for 2 months / >= 60 days).
 */
export function isDebtDefaulted(daysOld: number, balance: number | KES): boolean {
  return daysOld >= 60 && Number(balance) > 0;
}

/**
 * Calculates the entitled 70% compensation for defaulted product debt.
 */
export function calculateDefaultCompensation(principalOrBalance: number | KES, rate: number = 0.70): number {
  return Math.round(Number(principalOrBalance) * rate);
}

/**
 * Generates an official 70% Defaulted Debt Compensation Claim message for the SmartSort Helpline.
 */
export function generateDefaultedDebtClaimText(options: DefaultedDebtClaimOptions): string {
  const {
    debtId,
    customerName,
    customerPhone,
    shopName,
    principal,
    balance,
    daysOld,
    compensationAmount,
    compensationRate = 0.70,
    language = 'en',
    sellerName,
    shopPhone,
  } = options;

  const isEn = language === 'en';
  const claimRef = `CLAIM-70-${debtId.slice(0, 8).toUpperCase()}`;
  const compPercent = Math.round(compensationRate * 100);

  const lines: string[] = [];

  if (isEn) {
    lines.push('🛡️ *SMARTSORT SELLER DEBT COMPENSATION CLAIM (70%)*');
    lines.push('----------------------------------------');
    lines.push(`📑 *Claim Reference:* \`${claimRef}\``);
    lines.push(`🏪 *Merchant / Shop:* ${shopName.trim()}`);
    if (sellerName) lines.push(`👤 *Seller Name:* ${sellerName}`);
    if (shopPhone) lines.push(`📞 *Shop Contact:* ${shopPhone}`);
    lines.push('');
    lines.push('📦 *DEFAULTED PRODUCT DEBT DETAILS:*');
    lines.push(`• *Customer:* ${customerName.trim()} ${customerPhone ? `(${customerPhone})` : ''}`);
    lines.push(`• *Original Debt Amount:* ${formatKES(principal)}`);
    lines.push(`• *Unpaid Balance:* *${formatKES(balance)}*`);
    lines.push(`• *Overdue Duration:* *${daysOld} days* (Exceeds 2 months / 60 days policy)`);
    lines.push(`• *Status:* ⚠️ *DEFAULTED*`);
    lines.push('');
    lines.push('💰 *ENTITLED COMPENSATION:*');
    lines.push(`• *Protection Rate:* ${compPercent}% of product price`);
    lines.push(`• *Compensation Claim Amount:* *${formatKES(compensationAmount)}*`);
    lines.push('');
    lines.push('I am requesting review and processing of the 70% merchant debt compensation under the SmartSort Merchant Protection Program.');
    lines.push('Please advise on payout verification requirements. Thank you! 🙏');
  } else {
    lines.push('🛡️ *OMBI LA FIDIA YA DENI LILILOFIFA (70%) - SMARTSORT*');
    lines.push('----------------------------------------');
    lines.push(`📑 *Nambari ya Ombi:* \`${claimRef}\``);
    lines.push(`🏪 *Jina la Duka:* ${shopName.trim()}`);
    if (sellerName) lines.push(`👤 *Muuza Duka:* ${sellerName}`);
    if (shopPhone) lines.push(`📞 *Mawasiliano:* ${shopPhone}`);
    lines.push('');
    lines.push('📦 *TAARIFA ZA DENI LILILOFIFA:*');
    lines.push(`• *Mteja:* ${customerName.trim()} ${customerPhone ? `(${customerPhone})` : ''}`);
    lines.push(`• *Kiasi cha Awali cha Bidhaa:* ${formatKES(principal)}`);
    lines.push(`• *Salio Lililobaki:* *${formatKES(balance)}*`);
    lines.push(`• *Muda wa Deni:* *Siku ${daysOld}* (Limezidi miezi 2 / siku 60)`);
    lines.push(`• *Hali ya Deni:* ⚠️ *LIMEFIFIA (DEFAULTED)*`);
    lines.push('');
    lines.push('💰 *KIKOMO CHA FIDIA:*');
    lines.push(`• *Kiwango cha Fidia:* ${compPercent}% ya bei ya bidhaa`);
    lines.push(`• *Kiasi cha Fidia Kinachodaiwa:* *${formatKES(compensationAmount)}*`);
    lines.push('');
    lines.push('Naomba msaada wa kuchakata fidia yangu ya 70% kulingana na sera ya kulinda wauzaji ya SmartSort.');
    lines.push('Tafadhali niongoze hatua za kupokea malipo. Asante! 🙏');
  }

  return lines.join('\n');
}

/**
 * Launches WhatsApp chat to the SmartSort Helpline with the claim message.
 */
export function openDefaultedHelplineWhatsApp(
  options: DefaultedDebtClaimOptions,
  helplinePhone: string = SMARTSORT_HELPLINE_PHONE
): boolean {
  const text = generateDefaultedDebtClaimText(options);
  const formattedPhone = formatKenyanPhoneForWhatsApp(helplinePhone) || '254700000000';
  const encodedText = encodeURIComponent(text);
  const url = `https://wa.me/${formattedPhone}?text=${encodedText}`;

  if (typeof window === 'undefined') return false;

  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    return true;
  } catch {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
}

/**
 * Share or copy the defaulted debt compensation claim.
 */
export async function shareDefaultedDebtClaim(
  options: DefaultedDebtClaimOptions,
  channel: 'whatsapp' | 'system' | 'copy' = 'whatsapp',
  helplinePhone: string = SMARTSORT_HELPLINE_PHONE
): Promise<'whatsapp_opened' | 'shared' | 'copied' | 'failed'> {
  const text = generateDefaultedDebtClaimText(options);

  if (channel === 'whatsapp') {
    openDefaultedHelplineWhatsApp(options, helplinePhone);
    return 'whatsapp_opened';
  }

  if (channel === 'system') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `70% Debt Compensation Claim - ${options.shopName}`,
          text,
        });
        return 'shared';
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return 'failed';
        }
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
