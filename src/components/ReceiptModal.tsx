import React, { useState } from 'react';
import { Share2, Copy, Check, MessageSquare } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import {
  generateReceiptSummaryText,
  generateWhatsAppUrl,
  shareReceipt,
  type ReceiptSummaryOptions,
} from '../lib/receipt';
import type { SaleHeader, SaleItem } from '../lib/db/local';
import type { KES } from '../lib/money';
import { translations, type Language } from '../lib/i18n';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleHeader | null;
  items: SaleItem[];
  shopName: string;
  tillNumber?: string;
  customerName?: string;
  customerPhone?: string;
  receiptFooter?: string;
  language?: Language;
  cashTendered?: number | KES;
  changeAmount?: number | KES;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  items,
  shopName,
  tillNumber,
  customerName,
  customerPhone,
  receiptFooter,
  language = 'en',
  cashTendered,
  changeAmount,
}) => {
  const [copied, setCopied] = useState(false);
  const t = translations[language];

  if (!sale) return null;

  const summaryOptions: ReceiptSummaryOptions = {
    shopName,
    saleNo: sale.sale_no,
    date: sale.created_at,
    items: items.map((i) => ({
      name: i.product_name,
      qty: i.qty,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
    })),
    total: sale.total,
    paymentMethod: sale.payment_method,
    customerName,
    customerPhone,
    tillNumber,
    receiptFooter,
    language,
    cashTendered,
    changeAmount,
  };

  const receiptContent = generateReceiptSummaryText(summaryOptions);

  const handleWhatsApp = async () => {
    await shareReceipt(summaryOptions, 'whatsapp');
  };

  const handleShare = async () => {
    const res = await shareReceipt(summaryOptions, 'system');
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopy = async () => {
    const res = await shareReceipt(summaryOptions, 'copy');
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t.receiptTitle}
      subtitle={t.receiptSubtitle(String(sale.sale_no))}
    >
      <div className="space-y-4">
        {/* Paper Receipt Visual */}
        <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner select-text">
          {receiptContent}
        </div>

        {/* Action Buttons: WhatsApp Primary, Share Native, Copy */}
        <div className="space-y-2 pt-1">
          {/* Primary WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleWhatsApp}
            className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition cursor-pointer"
          >
            <span className="text-lg">💬</span>
            <span>{language === 'en' ? 'Share via WhatsApp' : 'Tuma kupitia WhatsApp'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 border-slate-300"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? t.copiedBtn : t.copyReceiptBtn}
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={handleShare}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800"
            >
              <Share2 className="w-4 h-4" />
              {t.shareReceiptBtn}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
};

