import { formatKES, type KES } from './money';
import type { Language } from './i18n';

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPrice: number | KES;
  lineTotal: number | KES;
  unit?: string;
}

export interface ReceiptSummaryOptions {
  shopName: string;
  saleNo: string | number;
  date?: string | Date;
  items: ReceiptItem[];
  total: number | KES;
  paymentMethod: string;
  customerName?: string | null;
  customerPhone?: string | null;
  tillNumber?: string | null;
  receiptFooter?: string | null;
  language?: Language;
  cashTendered?: number | KES;
  changeAmount?: number | KES;
}

/**
 * Format a Kenyan phone number into an international format for WhatsApp (e.g. 2547XXXXXXXX)
 */
export function formatKenyanPhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.substring(1);
  }
  if (digits.startsWith('254') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('7') && digits.length === 9) {
    return '254' + digits;
  }
  if (digits.startsWith('1') && digits.length === 9) {
    return '254' + digits;
  }
  return digits;
}

/**
 * Generates a clean, simple, text-based receipt summary formatted with
 * markdown bold (*text*) and emojis for WhatsApp and other messaging apps (SMS, Telegram).
 */
export function generateReceiptSummaryText(options: ReceiptSummaryOptions): string {
  const {
    shopName,
    saleNo,
    date = new Date(),
    items,
    total,
    paymentMethod,
    customerName,
    tillNumber,
    receiptFooter,
    language = 'en',
  } = options;

  const isEn = language === 'en';
  const saleDate = typeof date === 'string' ? new Date(date) : date;
  const locale = isEn ? 'en-KE' : 'sw-KE';

  const dateStr = saleDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = saleDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines: string[] = [];

  // Header
  lines.push(`🏪 *${shopName.trim().toUpperCase()}*`);
  lines.push(`🧾 *${isEn ? 'RECEIPT' : 'RISITI'} #${saleNo}*`);
  lines.push(`📅 ${dateStr}, ${timeStr}`);

  if (customerName && customerName.trim()) {
    lines.push(`👤 *${isEn ? 'Customer' : 'Mteja'}:* ${customerName.trim()}`);
  }

  lines.push('─────────────────────────');
  lines.push(`📦 *${isEn ? 'ITEMS PURCHASED' : 'BIDHAA ZILIZONUNULIWA'}:*`);

  // Items
  items.forEach((item) => {
    const unitPart = item.unit ? ` ${item.unit}` : '';
    lines.push(`• *${item.name}*`);
    lines.push(`   ${item.qty}${unitPart} × ${formatKES(item.unitPrice)} = *${formatKES(item.lineTotal)}*`);
  });

  lines.push('─────────────────────────');

  // Total
  lines.push(`💰 *${isEn ? 'TOTAL AMOUNT' : 'JUMLA KUU'}:* *${formatKES(total)}*`);

  // Payment Method
  let methodLabel = isEn ? 'Cash' : 'Pesa Taslimu (Cash)';
  if (paymentMethod === 'mpesa') {
    methodLabel = `M-Pesa ${tillNumber ? `(Till: ${tillNumber})` : ''}`.trim();
  } else if (paymentMethod === 'deni') {
    methodLabel = isEn ? 'Credit (Deni / Unpaid)' : 'Deni (Mkopo)';
  } else if (paymentMethod === 'split') {
    methodLabel = isEn ? 'Split Payment' : 'Malipo ya Pamoja';
  }
  lines.push(`💳 *${isEn ? 'Payment Method' : 'Njia ya Malipo'}:* ${methodLabel}`);

  if (paymentMethod === 'cash' && options.cashTendered && Number(options.cashTendered) > Number(total)) {
    lines.push(`💵 *${isEn ? 'Cash Received' : 'Pesa Zilizolipwa'}:* ${formatKES(options.cashTendered)}`);
    lines.push(`🪙 *${isEn ? 'Change Given' : 'Chenji Iliyotolewa'}:* *${formatKES(options.changeAmount ?? (Number(options.cashTendered) - Number(total)))}*`);
  }

  lines.push('─────────────────────────');

  // Custom Footer or Default Thank you note
  if (receiptFooter && receiptFooter.trim()) {
    lines.push(receiptFooter.trim());
  }

  lines.push(
    isEn
      ? '🙏 *Thank you for shopping with us! Welcome back.*'
      : '🙏 *Asante sana kwa kununua nasi! Karibu tena.*'
  );
  lines.push(`_Powered by SmartSort Duka POS_`);

  return lines.join('\n');
}

/**
 * Generate a direct WhatsApp click-to-chat URL with the receipt summary prefilled.
 * If customerPhone is provided, it targets their chat directly. Otherwise, it opens WhatsApp's contact picker.
 */
export function generateWhatsAppUrl(options: ReceiptSummaryOptions): string {
  const text = generateReceiptSummaryText(options);
  const encodedText = encodeURIComponent(text);
  const formattedPhone = formatKenyanPhoneForWhatsApp(options.customerPhone);

  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Share the receipt summary directly via WhatsApp or other messaging apps
 */
export async function shareReceipt(
  options: ReceiptSummaryOptions,
  channel: 'whatsapp' | 'system' | 'copy' = 'whatsapp'
): Promise<'whatsapp_opened' | 'shared' | 'copied' | 'failed'> {
  const text = generateReceiptSummaryText(options);

  if (channel === 'whatsapp') {
    const waUrl = generateWhatsAppUrl(options);
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank');
      return 'whatsapp_opened';
    }
  }

  if (channel === 'system') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${options.language === 'sw' ? 'Risiti' : 'Receipt'} #${options.saleNo} - ${options.shopName}`,
          text,
        });
        return 'shared';
      } catch (err: unknown) {
        // Fallback to clipboard if share was cancelled or failed
        if ((err as Error)?.name === 'AbortError') {
          return 'failed';
        }
      }
    }
  }

  // Fallback to clipboard
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
