import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Share2, CheckSquare, Square, Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { toKES, formatKES, mulKES, type KES } from '../lib/money';
import { db, recordBatchPurchase, type Product, type ProductStock } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface RestockCandidate {
  product: Product;
  currentStock: number;
  avgDailySales: number;
  daysOfCover: number;
  suggestedQty: number;
  unitCost: KES;
  estimatedCost: KES;
  selected: boolean;
  receivedQty: number;
  newUnitCost: KES;
}

interface RestockListModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  stocks: ProductStock[];
  onRestockCompleted: () => void;
  language?: Language;
}

export const RestockListModal: React.FC<RestockListModalProps> = ({
  isOpen,
  onClose,
  products,
  stocks,
  onRestockCompleted,
  language = 'en',
}) => {
  const isEn = language === 'en';
  const [coverDays, setCoverDays] = useState<number>(7);
  const [candidates, setCandidates] = useState<RestockCandidate[]>([]);
  const [isBuyingMode, setIsBuyingMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Map product stock
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stocks.forEach((s) => map.set(s.product_id, s.qty));
    return map;
  }, [stocks]);

  // Compute restock recommendations based on 21-day sales history
  useEffect(() => {
    if (!isOpen) return;

    async function computeCandidates() {
      try {
        const now = Date.now();
        const twentyOneDaysAgo = new Date(now - 21 * 86400000).toISOString();

        const allSales = await db.sales.toArray();
        const pastSales = allSales.filter(
          (s) => s.status === 'completed' && s.created_at >= twentyOneDaysAgo
        );

        const saleIdsSet = new Set(pastSales.map((s) => s.id));
        const allItems = await db.sale_items.toArray();
        const saleItems = allItems.filter((it) => saleIdsSet.has(it.sale_id));

        const salesVolumeMap = new Map<string, number>();
        saleItems.forEach((it) => {
          salesVolumeMap.set(
            it.product_id,
            (salesVolumeMap.get(it.product_id) || 0) + it.qty
          );
        });

      const list: RestockCandidate[] = [];

      for (const p of products) {
        if (!p.is_active || p.deleted_at !== null) continue;

        const currentStock = stockMap.get(p.id) ?? 0;
        const totalSold21d = salesVolumeMap.get(p.id) || 0;
        const avgDaily = totalSold21d > 0 ? totalSold21d / 21 : 0;

        const daysOfCover = avgDaily > 0 ? currentStock / avgDaily : 999;
        const isLow = currentStock <= p.low_limit;
        const isUrgent = currentStock <= 0;
        const willRunOut = daysOfCover < coverDays;

        if (isUrgent || isLow || willRunOut) {
          // Suggested qty calculation
          let rawSuggested = Math.ceil(avgDaily * coverDays) - currentStock;
          if (rawSuggested <= 0) rawSuggested = Math.max(1, p.low_limit * 2 - currentStock);

          // Round up to pack size if specified
          if (p.pack_size && p.pack_size > 1) {
            rawSuggested = Math.ceil(rawSuggested / p.pack_size) * p.pack_size;
          }

          const suggestedQty = Math.max(1, rawSuggested);
          const unitCost = p.buying_price ?? toKES(0);
          const estimatedCost = mulKES(unitCost, suggestedQty);

          list.push({
            product: p,
            currentStock,
            avgDailySales: Number(avgDaily.toFixed(1)),
            daysOfCover: Math.round(daysOfCover),
            suggestedQty,
            unitCost,
            estimatedCost,
            selected: true,
            receivedQty: suggestedQty,
            newUnitCost: unitCost,
          });
        }
      }

      // Sort: Zero stock first, then low limit, then days of cover
      list.sort((a, b) => {
        if (a.currentStock <= 0 && b.currentStock > 0) return -1;
        if (b.currentStock <= 0 && a.currentStock > 0) return 1;
        return a.daysOfCover - b.daysOfCover;
      });

      setCandidates(list);
    } catch (err) {
      console.error('Error computing restock candidates:', err);
      setCandidates([]);
    }
  }

    computeCandidates();
  }, [isOpen, products, stockMap, coverDays]);

  const toggleSelect = (index: number) => {
    const updated = [...candidates];
    updated[index].selected = !updated[index].selected;
    setCandidates(updated);
  };

  const updateCandidateReceived = (index: number, receivedQty: number, newUnitCost: KES) => {
    const updated = [...candidates];
    updated[index].receivedQty = receivedQty;
    updated[index].newUnitCost = newUnitCost;
    setCandidates(updated);
  };

  const totalEstimated = useMemo(() => {
    return candidates
      .filter((c) => c.selected)
      .reduce((sum, c) => sum + c.estimatedCost, 0);
  }, [candidates]);

  // Share list via WhatsApp or OS sheet
  const handleShareList = async () => {
    const lines = [
      isEn ? '🛒 SHOP RESTOCK LIST' : '🛒 ORODHA YA MANUNUZI (SMARTSORT)',
      isEn ? `Days of cover: ${coverDays} days` : `Siku za akiba: siku ${coverDays}`,
      '──────────────────────────────',
    ];

    candidates
      .filter((c) => c.selected)
      .forEach((c) => {
        lines.push(
          isEn
            ? `• ${c.product.name}: Qty ${c.suggestedQty} (Current: ${c.currentStock}) ~ ${formatKES(c.estimatedCost)}`
            : `• ${c.product.name}: Idadi ${c.suggestedQty} (Zilizopo: ${c.currentStock}) ~ ${formatKES(c.estimatedCost)}`
        );
      });

    lines.push('──────────────────────────────');
    lines.push(`${isEn ? 'Total Cost' : 'Jumla ya Gharama'}: ${formatKES(toKES(totalEstimated))}`);

    const text = lines.join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: isEn ? 'Shop Restock List' : 'Orodha ya Manunuzi ya Duka',
          text,
        });
        return;
      } catch {
        // user cancelled
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (typeof window !== 'undefined') {
        window.alert(isEn ? 'Restock list copied to clipboard!' : 'Orodha imenakiliwa kwenye clipboard!');
      }
    }
  };

  // Complete Batch Purchase (§Feature 6: The Return Trip)
  const handleConfirmPurchase = async () => {
    const selectedPurchases = candidates.filter((c) => c.selected && c.receivedQty > 0);
    if (selectedPurchases.length === 0) return;

    setSaving(true);
    try {
      await recordBatchPurchase(
        selectedPurchases.map((c) => {
          // Check if buying price changed by > 10%
          const prevCost = c.product.buying_price ?? toKES(0);
          const costDiffRatio = prevCost > 0 ? Math.abs(c.newUnitCost - prevCost) / prevCost : 0;
          const shouldUpdatePrice = costDiffRatio > 0.1;

          return {
            productId: c.product.id,
            qty: c.receivedQty,
            unitCost: c.newUnitCost,
            updateBuyingPrice: shouldUpdatePrice,
          };
        })
      );

      onRestockCompleted();
      setIsBuyingMode(false);
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        isBuyingMode
          ? isEn ? 'Received Stock (Update Counts)' : 'Nimenunua (Sasisha Stock)'
          : isEn ? 'Restock List' : 'Orodha ya Manunuzi'
      }
      subtitle={
        isBuyingMode
          ? isEn ? 'Confirm received quantities and purchase cost' : 'Thibitisha idadi uliyoleta na bei ya kununua'
          : isEn ? 'Low and running out items needing restock' : 'Bidhaa zilizopungua au zinazoisha dukani'
      }
    >
      <div className="space-y-4 select-none">
        {/* Cover Days selector */}
        {!isBuyingMode && (
          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-600">
              {isEn ? 'Days of cover:' : 'Siku za akiba:'}
            </span>
            <div className="flex gap-1.5">
              {[3, 7, 14].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCoverDays(days)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    coverDays === days
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isEn ? `${days} days` : `Siku ${days}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List of Candidates */}
        {candidates.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
            <Check className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <div className="font-bold text-base text-slate-800">
              {isEn ? 'All Stock Levels Healthy!' : 'Stock Yote Iko Sawa!'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isEn
                ? 'No items currently need restocking based on recent sales trends.'
                : 'Hakuna bidhaa inayohitaji kununuliwa kwa sasa kulingana na mauzo yako.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto no-scrollbar">
            {candidates.map((item, idx) => {
              const isUrgent = item.currentStock <= 0;
              const isLow = item.currentStock <= item.product.low_limit;

              return (
                <div
                  key={item.product.id}
                  className={`py-3 flex items-start justify-between gap-3 ${
                    !item.selected ? 'opacity-40' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSelect(idx)}
                    className="mt-1 text-slate-500 hover:text-emerald-600 focus:outline-none"
                  >
                    {item.selected ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{item.product.image_emoji || '📦'}</span>
                      <span className="font-bold text-sm text-slate-900">
                        {item.product.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          isUrgent
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : isLow
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                      >
                        {isUrgent
                          ? isEn ? 'Out of stock (0)' : 'Imeisha (0)'
                          : isEn ? `Remaining: ${item.currentStock}` : `Imebaki: ${item.currentStock}`}
                      </span>

                      {item.daysOfCover < 999 && (
                        <span className="text-[10px] text-slate-500">
                          {isEn ? `Runs out in ${item.daysOfCover} days` : `Zitaisha kwa siku ${item.daysOfCover}`}
                        </span>
                      )}
                    </div>

                    {isBuyingMode ? (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            {isEn ? 'Received (Qty):' : 'Umeleta (Qty):'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={item.receivedQty}
                            onChange={(e) =>
                              updateCandidateReceived(
                                idx,
                                Number(e.target.value) || 0,
                                item.newUnitCost
                              )
                            }
                            className="w-full h-9 px-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            {isEn ? 'Unit Cost:' : 'Bei uliyonunua:'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={item.newUnitCost}
                            onChange={(e) =>
                              updateCandidateReceived(
                                idx,
                                item.receivedQty,
                                toKES(Number(e.target.value) || 0)
                              )
                            }
                            className="w-full h-9 px-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1 text-xs text-slate-600">
                        <span>
                          {isEn ? 'Suggested:' : 'Pendekezo:'}{' '}
                          <strong>{item.suggestedQty} {item.product.unit}</strong>
                          {item.product.pack_size ? ` (${isEn ? 'Pack of' : 'Pakiti ya'} ${item.product.pack_size})` : ''}
                        </span>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {formatKES(item.estimatedCost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Total Cost Estimate Footer */}
        {candidates.length > 0 && (
          <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">
                {isEn ? 'Estimated Total' : 'Gharama ya Jumla'}
              </div>
              <div className="text-2xl font-black text-emerald-950 tabular-nums">
                {formatKES(toKES(totalEstimated))}
              </div>
            </div>

            {!isBuyingMode && (
              <button
                type="button"
                onClick={handleShareList}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 active:bg-emerald-100 transition shadow-xs"
              >
                <Share2 className="w-4 h-4" />
                {isEn ? 'Share WhatsApp' : 'Tuma WhatsApp'}
              </button>
            )}
          </div>
        )}

        {/* Flow Buttons */}
        <div className="pt-2 space-y-2">
          {isBuyingMode ? (
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={saving || candidates.filter((c) => c.selected).length === 0}
              onClick={handleConfirmPurchase}
            >
              <Check className="w-5 h-5 mr-1.5" />
              {saving
                ? (isEn ? 'Updating Stock...' : 'Inasasisha Stock...')
                : (isEn ? 'Update Stock Counts Now' : 'Sasisha Stock Sasa')}
            </Button>
          ) : (
            <Button
              variant="gradient"
              size="hero"
              fullWidth
              disabled={candidates.length === 0}
              onClick={() => setIsBuyingMode(true)}
            >
              <ShoppingBag className="w-5 h-5 mr-1.5" />
              {isEn ? 'I Bought Goods (Update Stock)' : 'Nimenunua (Sasisha Stock)'}
            </Button>
          )}

          {isBuyingMode && (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => setIsBuyingMode(false)}
            >
              {isEn ? 'Back to List' : 'Rudi Kwenye Orodha'}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
};
