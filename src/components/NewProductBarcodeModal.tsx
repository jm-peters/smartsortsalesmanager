/**
 * New Product Barcode Registration Modal ("New product, what's this?")
 * Appears instantly when an unrecognized barcode is scanned.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Barcode, Check, X, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import {
  db,
  getShopMeta,
  getShopUser,
  getOrCreateDeviceId,
  serverNow,
  syncWriteThrough,
  type Product,
  type StockMovement,
  type OutboxEntry,
} from '../lib/db/local';
import { getRelevantEmoji, POPULAR_RETAIL_EMOJIS } from '../lib/emojiHelper';
import { toKES, formatKES } from '../lib/money';
import type { Language } from '../lib/i18n';

interface NewProductBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  onProductLearnedAndAdded: (product: Product) => void;
  language?: Language;
}

export const NewProductBarcodeModal: React.FC<NewProductBarcodeModalProps> = ({
  isOpen,
  onClose,
  barcode,
  onProductLearnedAndAdded,
  language = 'en',
}) => {
  const isEn = language === 'en';
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🍞');
  const [buyingPriceStr, setBuyingPriceStr] = useState('');
  const [sellingPriceStr, setSellingPriceStr] = useState('');
  const [openingStockStr, setOpeningStockStr] = useState('10');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmoji('📦');
      setBuyingPriceStr('');
      setSellingPriceStr('');
      setOpeningStockStr('10');
      setErrorMsg('');
      setIsSaving(false);
    }
  }, [isOpen, barcode]);

  // Auto-suggest emoji & defaults when name changes
  const handleNameChange = (val: string) => {
    setName(val);
    const suggested = getRelevantEmoji(val);
    if (suggested) {
      setEmoji(suggested);
    }
  };

  const handleSaveAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg(isEn ? 'Please enter product name' : 'Weka jina la bidhaa');
      return;
    }
    const buyPrice = parseFloat(buyingPriceStr) || 0;
    const sellPrice = parseFloat(sellingPriceStr) || 0;
    const openingStock = parseInt(openingStockStr, 10) || 10;

    if (sellPrice <= 0) {
      setErrorMsg(isEn ? 'Please enter a valid selling price' : 'Weka bei halali ya kuuzia');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const shop = await getShopMeta();
      const user = await getShopUser();
      const now = serverNow();
      const productId = `prod-${crypto.randomUUID()}`;
      const searchKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const deviceId = await getOrCreateDeviceId();

      const newProduct: Product = {
        id: productId,
        shop_id: shop.shop_id,
        name: name.trim(),
        search_key: searchKey,
        buying_price: toKES(buyPrice),
        selling_price: toKES(sellPrice),
        low_limit: 5,
        unit: 'pcs',
        barcode: barcode.trim(),
        image_emoji: emoji || '📦',
        is_active: true,
        is_pinned: true,
        pin_order: 1,
        pack_size: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
      };

      const syncEntries: OutboxEntry[] = [
        {
          id: productId,
          table: 'products',
          op: 'insert',
          payload: newProduct as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        },
      ];

      await db.products.put(newProduct);

      // Record opening stock movement & cache
      const movementId = crypto.randomUUID();
      const movement: StockMovement = {
        id: movementId,
        shop_id: shop.shop_id,
        product_id: productId,
        delta: openingStock,
        reason: 'opening',
        ref_type: 'opening',
        ref_id: null,
        unit_cost: toKES(buyPrice),
        note: 'Scanned new product barcode registration',
        created_at: now,
        device_id: deviceId,
        created_by: user?.id || shop.user_id || 'user-admin',
      };
      await db.stock_movements.put(movement);
      await db.product_stock.put({
        product_id: productId,
        shop_id: shop.shop_id,
        qty: openingStock,
        updated_at: now,
      });

      syncEntries.push({
        id: movementId,
        table: 'stock_movements',
        op: 'insert',
        payload: movement as unknown as Record<string, unknown>,
        attempts: 0,
        next_attempt_at: now,
      });
      syncEntries.push({
        id: productId,
        table: 'product_stock',
        op: 'insert',
        payload: {
          product_id: productId,
          shop_id: shop.shop_id,
          qty: openingStock,
          updated_at: now,
        },
        attempts: 0,
        next_attempt_at: now,
      });

      void syncWriteThrough(syncEntries);

      onProductLearnedAndAdded(newProduct);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Error saving new product' : 'Hitilafu katika kuhifadhi bidhaa'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-55 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-black">
                {isEn ? "New Product — What's This?" : 'Bidhaa Mpya — Ni Nini Hii?'}
              </h3>
              <p className="text-[10px] text-emerald-300 font-mono">
                Barcode: {barcode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveAndAdd} className="p-4 space-y-3.5">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* Name & Emoji */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              {isEn ? 'Product Name *' : 'Jina la Bidhaa *'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-12 h-11 text-center text-xl bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                maxLength={4}
                title="Emoji Icon"
              />
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={isEn ? 'e.g. Supa Loaf White 400g' : 'fano: Supa Loaf White 400g'}
                className="flex-1 h-11 px-3 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>
          </div>

          {/* Popular Emoji Quick Picker */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {POPULAR_RETAIL_EMOJIS.slice(0, 12).map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition border cursor-pointer shrink-0 ${
                  emoji === em ? 'bg-emerald-100 border-emerald-500 scale-105' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {em}
              </button>
            ))}
          </div>

          {/* Prices Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                {isEn ? 'Buying Price (KES)' : 'Bei ya Kununua'}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={buyingPriceStr}
                onChange={(e) => setBuyingPriceStr(e.target.value.replace(/\D/g, ''))}
                placeholder="55"
                className="w-full h-11 px-3 text-sm font-black bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                {isEn ? 'Selling Price (KES) *' : 'Bei ya Kuuza *'}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={sellingPriceStr}
                onChange={(e) => setSellingPriceStr(e.target.value.replace(/\D/g, ''))}
                placeholder="65"
                className="w-full h-11 px-3 text-sm font-black bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 tabular-nums text-emerald-700"
              />
            </div>
          </div>

          {/* Opening Stock */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              {isEn ? 'Initial Stock Qty' : 'Idadi ya Kwanza Stoku'}
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={openingStockStr}
              onChange={(e) => setOpeningStockStr(e.target.value.replace(/\D/g, ''))}
              placeholder="10"
              className="w-full h-10 px-3 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="gradient"
              size="hero"
              fullWidth
              disabled={isSaving || !name.trim() || !sellingPriceStr}
              className="font-black shadow-md"
            >
              <Check className="w-5 h-5 mr-1 stroke-[3]" />
              {isSaving
                ? (isEn ? 'Learning & Adding...' : 'Inajifunza...')
                : (isEn ? 'Save & Add to Cart' : 'Hifadhi na Ongeza kwa Kikapu')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
