import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  Search,
  AlertTriangle,
  ShoppingBag,
  ClipboardList,
  Edit2,
  Trash2,
  Check,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react';
import {
  db,
  serverNow,
  generateSearchKey,
  seedKenyanCatalog,
  type Product,
  type StockMovement,
  type UserRole,
} from '../lib/db/local';
import {
  toKES,
  formatKES,
  calculateMarginPercent,
  type KES,
} from '../lib/money';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { RestockListModal } from '../components/RestockListModal';
import { FirstProductGuide, type ProductStarterTemplate } from '../components/FirstProductGuide';
import { translations, type Language } from '../lib/i18n';

interface StockScreenProps {
  userRole: UserRole;
  shopName: string;
  language?: Language;
}

export const StockScreen: React.FC<StockScreenProps> = ({
  userRole,
  shopName,
  language = 'en',
}) => {
  const isOwner = userRole === 'owner';
  const isEn = language === 'en';
  const t = translations[language];

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value'>('name');

  // Add/Edit Product Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [buyingPriceStr, setBuyingPriceStr] = useState('');
  const [sellingPriceStr, setSellingPriceStr] = useState('');
  const [initialQtyStr, setInitialQtyStr] = useState('10');
  const [unit, setUnit] = useState('pcs');
  const [lowLimitStr, setLowLimitStr] = useState('5');
  const [packSizeStr, setPackSizeStr] = useState('');
  const [emoji, setEmoji] = useState('📦');

  // Modals
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isStockTakeModalOpen, setIsStockTakeModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Live query from Dexie
  const products = useLiveQuery(
    () => db.products.filter((p) => p.deleted_at === null).toArray(),
    []
  ) || [];

  const stocks = useLiveQuery(() => db.product_stock.toArray(), []) || [];
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stocks.forEach((s) => map.set(s.product_id, s.qty));
    return map;
  }, [stocks]);

  // Derived margin calculations for form
  const sellingNum = Number(sellingPriceStr) || 0;
  const buyingNum = Number(buyingPriceStr) || 0;
  const marginPerUnit = sellingNum - buyingNum;
  const marginPercent = calculateMarginPercent(toKES(sellingNum), toKES(buyingNum));
  const isLoss = sellingNum > 0 && buyingNum > 0 && sellingNum <= buyingNum;

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    const q = generateSearchKey(searchQuery);
    let list = products.filter((p) => (q ? p.search_key.includes(q) : true));

    list.sort((a, b) => {
      const stockA = stockMap.get(a.id) ?? 0;
      const stockB = stockMap.get(b.id) ?? 0;

      if (sortBy === 'stock') return stockA - stockB;
      if (sortBy === 'value') return stockB * b.selling_price - stockA * a.selling_price;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [products, searchQuery, sortBy, stockMap]);

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => {
      const s = stockMap.get(p.id) ?? 0;
      return s <= p.low_limit;
    });
  }, [products, stockMap]);

  const openAddModal = (template?: ProductStarterTemplate) => {
    setEditingProduct(null);
    setName(template?.name || '');
    setBuyingPriceStr(template?.buyingPrice ? String(template.buyingPrice) : '');
    setSellingPriceStr(template?.sellingPrice ? String(template.sellingPrice) : '');
    setInitialQtyStr(template?.initialQty ? String(template.initialQty) : '10');
    setUnit(template?.unit || 'pcs');
    setLowLimitStr('5');
    setPackSizeStr('');
    setEmoji(template?.emoji || '📦');
    setIsProductModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setBuyingPriceStr(p.buying_price && p.buying_price > 0 ? String(p.buying_price) : '');
    setSellingPriceStr(String(p.selling_price));
    setInitialQtyStr(String(stockMap.get(p.id) ?? 0));
    setUnit(p.unit);
    setLowLimitStr(String(p.low_limit));
    setPackSizeStr(p.pack_size ? String(p.pack_size) : '');
    setEmoji(p.image_emoji || '📦');
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!name.trim()) {
      alert('Tafadhali weka jina la bidhaa.');
      return;
    }
    if (sellingNum <= 0) {
      alert('Tafadhali weka bei sahihi ya kuuza.');
      return;
    }

    const now = serverNow();
    const productId = editingProduct ? editingProduct.id : crypto.randomUUID();
    const buyingPrice = buyingPriceStr.trim() !== '' && !isNaN(Number(buyingPriceStr)) && Number(buyingPriceStr) > 0 ? toKES(Number(buyingPriceStr)) : null;
    const sellingPrice = toKES(sellingNum);
    const lowLimit = Number(lowLimitStr) || 5;
    const packSize = packSizeStr ? Number(packSizeStr) : null;

    if (editingProduct) {
      // Update existing
      await db.transaction('rw', [db.products, db.outbox], async () => {
        const updateData: Partial<Product> = {
          name: name.trim(),
          search_key: generateSearchKey(name),
          buying_price: buyingPrice,
          selling_price: sellingPrice,
          low_limit: lowLimit,
          unit,
          pack_size: packSize,
          image_emoji: emoji,
          updated_at: now,
        };

        await db.products.update(productId, updateData);
        await db.outbox.add({
          id: productId,
          table: 'products',
          op: 'update',
          payload: { id: productId, ...updateData },
          attempts: 0,
          next_attempt_at: now,
        });
      });
    } else {
      // Create new product
      const newProduct: Product = {
        id: productId,
        shop_id: 'shop-active',
        name: name.trim(),
        search_key: generateSearchKey(name),
        buying_price: buyingPrice,
        selling_price: sellingPrice,
        low_limit: lowLimit,
        unit,
        barcode: null,
        image_emoji: emoji,
        is_active: true,
        pack_size: packSize,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: 'device-active',
      };

      const initialQty = Number(initialQtyStr) || 0;
      const movementId = crypto.randomUUID();
      const movement: StockMovement = {
        id: movementId,
        shop_id: 'shop-active',
        product_id: productId,
        delta: initialQty,
        reason: 'opening',
        ref_type: 'opening',
        ref_id: null,
        unit_cost: buyingPrice ?? toKES(0),
        note: 'Mwanzo wa bidhaa',
        created_at: now,
        device_id: 'device-active',
        created_by: 'user-active',
      };

      await db.transaction(
        'rw',
        [db.products, db.stock_movements, db.product_stock, db.outbox],
        async () => {
          await db.products.put(newProduct);
          await db.stock_movements.put(movement);
          await db.product_stock.put({
            product_id: productId,
            shop_id: 'shop-active',
            qty: initialQty,
            updated_at: now,
          });

          await db.outbox.add({
            id: productId,
            table: 'products',
            op: 'insert',
            payload: newProduct as unknown as Record<string, unknown>,
            attempts: 0,
            next_attempt_at: now,
          });
          await db.outbox.add({
            id: movementId,
            table: 'stock_movements',
            op: 'insert',
            payload: movement as unknown as Record<string, unknown>,
            attempts: 0,
            next_attempt_at: now,
          });
        }
      );
    }

    setIsProductModalOpen(false);
  };

  // Bulk Add Process
  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const now = serverNow();

    await db.transaction('rw', [db.products, db.stock_movements, db.product_stock, db.outbox], async () => {
      for (const line of lines) {
        // format: Name, buying (optional), selling, qty OR Name, selling, qty
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 2) continue;

        const prodName = parts[0];
        let buyPrice: KES | null = null;
        let sellPrice: KES;
        let qty = 10;

        if (parts.length === 2) {
          // Name, SellingPrice
          sellPrice = toKES(Number(parts[1]) || 0);
        } else if (parts.length === 3) {
          // Name, SellingPrice, Qty
          sellPrice = toKES(Number(parts[1]) || 0);
          qty = Number(parts[2]) || 10;
        } else {
          // Name, BuyingPrice, SellingPrice, Qty
          const bNum = Number(parts[1]);
          if (!isNaN(bNum) && bNum > 0) {
            buyPrice = toKES(bNum);
          }
          sellPrice = toKES(Number(parts[2]) || (buyPrice ? buyPrice * 1.2 : 0));
          qty = Number(parts[3]) || 10;
        }

        if (sellPrice <= 0) continue;

        const id = crypto.randomUUID();
        const p: Product = {
          id,
          shop_id: 'shop-active',
          name: prodName,
          search_key: generateSearchKey(prodName),
          buying_price: buyPrice,
          selling_price: sellPrice,
          low_limit: 5,
          unit: 'pcs',
          barcode: null,
          image_emoji: '📦',
          is_active: true,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: 'device-active',
        };

        const mId = crypto.randomUUID();
        const m: StockMovement = {
          id: mId,
          shop_id: 'shop-active',
          product_id: id,
          delta: qty,
          reason: 'opening',
          ref_type: 'bulk_import',
          ref_id: null,
          unit_cost: buyPrice ?? toKES(0),
          note: 'Bulk paste import',
          created_at: now,
          device_id: 'device-active',
          created_by: 'user-active',
        };

        await db.products.put(p);
        await db.stock_movements.put(m);
        await db.product_stock.put({
          product_id: id,
          shop_id: 'shop-active',
          qty,
          updated_at: now,
        });

        await db.outbox.add({
          id,
          table: 'products',
          op: 'insert',
          payload: p as unknown as Record<string, unknown>,
          attempts: 0,
          next_attempt_at: now,
        });
      }
    });

    setIsBulkAddModalOpen(false);
    setBulkText('');
    alert(`Bidhaa ${lines.length} zimeongezwa kwenye duka!`);
  };

  return (
    <div className="flex flex-col min-h-full pb-28 select-none">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 leading-tight">
            {t.stockTitle}
          </h1>
          <p className="text-xs text-slate-500">
            {isEn ? `Total products: ${products.length}` : `Jumla ya bidhaa: ${products.length}`}
          </p>
        </div>

        <Button
          variant="gradient"
          size="sm"
          onClick={() => openAddModal()}
          className="flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {isEn ? 'Add Product' : 'Ongeza'}
        </Button>
      </div>

      {/* Feature Navigation Action Strip */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setIsRestockModalOpen(true)}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-center active:bg-slate-100 transition shadow-xs flex flex-col items-center gap-1"
        >
          <ShoppingBag className="w-5 h-5 text-emerald-600" />
          <span className="text-[11px] font-bold text-slate-800">
            {isEn ? 'Restock List' : 'Orodha ya Manunuzi'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsStockTakeModalOpen(true)}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-center active:bg-slate-100 transition shadow-xs flex flex-col items-center gap-1"
        >
          <ClipboardList className="w-5 h-5 text-blue-600" />
          <span className="text-[11px] font-bold text-slate-800">
            {isEn ? 'Stock Count' : 'Hesabu ya Stock'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsBulkAddModalOpen(true)}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-center active:bg-slate-100 transition shadow-xs flex flex-col items-center gap-1"
        >
          <FileSpreadsheet className="w-5 h-5 text-purple-600" />
          <span className="text-[11px] font-bold text-slate-800">
            {isEn ? 'Bulk Import' : 'Weka Nyingi (Bulk)'}
          </span>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Low Stock Banner */}
        {lowStockProducts.length > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-xs text-amber-900 uppercase tracking-wider">
                  {isEn
                    ? `Low Stock Running Out (${lowStockProducts.length})`
                    : `Zinazoisha Dukani (${lowStockProducts.length})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRestockModalOpen(true)}
                className="text-[11px] font-bold text-emerald-700 underline"
              >
                {isEn ? 'Open Restock List' : 'Fungua Orodha'}
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {lowStockProducts.slice(0, 6).map((p) => {
                const s = stockMap.get(p.id) ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex-shrink-0 px-2.5 py-1.5 bg-white rounded-lg border border-amber-200 text-xs shadow-2xs"
                  >
                    <span className="font-semibold text-slate-800 mr-1.5">
                      {p.name}
                    </span>
                    <span
                      className={`font-black tabular-nums ${
                        s <= 0 ? 'text-rose-600' : 'text-amber-700'
                      }`}
                    >
                      {s} {p.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.stockSearchPlaceholder}
              className="w-full h-10 pl-9 pr-3 text-xs bg-slate-100 rounded-xl border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setSortBy((prev) =>
                prev === 'name' ? 'stock' : prev === 'stock' ? 'value' : 'name'
              )
            }
            className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 active:bg-slate-100"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            {sortBy === 'name'
              ? (isEn ? 'Name' : 'Jina')
              : sortBy === 'stock'
              ? (isEn ? 'Qty' : 'Idadi')
              : (isEn ? 'Value' : 'Thamani')}
          </button>
        </div>

        {/* Product List or First Product Onboarding Guide */}
        {products.length === 0 ? (
          <FirstProductGuide
            onOpenAddProduct={openAddModal}
            onSeedSampleCatalog={async () => {
              await seedKenyanCatalog(true);
            }}
            language={language}
          />
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <span className="text-3xl block mb-2">🔍</span>
            <div className="font-bold text-sm text-slate-800">
              {isEn ? 'No products match your search' : 'Hakuna bidhaa inayolingana na utafutaji'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {isEn ? 'Try another keyword or tap + to add.' : 'Jaribu neno jingine au bofya + kuongeza.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredProducts.map((p) => {
              const currentStock = stockMap.get(p.id) ?? 0;
              const isOut = currentStock <= 0;
              const isLow = currentStock <= p.low_limit && !isOut;

              return (
                <div
                  key={p.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-2xl flex-shrink-0">{p.image_emoji || '📦'}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        <span className="font-black text-emerald-700 tabular-nums">
                          {formatKES(p.selling_price)}
                        </span>
                        {isOwner && (
                          p.buying_price && p.buying_price > 0 ? (
                            <span className="text-[11px] text-slate-500">
                              ({isEn ? 'Cost:' : 'Kununua:'} {formatKES(p.buying_price)})
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              ({isEn ? 'Cost: not set' : 'Kununua: haijawekwa'})
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span
                        className={`inline-block text-xs font-black px-2 py-0.5 rounded-full tabular-nums ${
                          isOut
                            ? 'bg-rose-100 text-rose-800'
                            : isLow
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {currentStock} {p.unit}
                      </span>
                      {isOwner && (
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                          = {formatKES(p.selling_price * currentStock)}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditModal(p)}
                      className="p-2 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-lg transition"
                      aria-label={`Hariri ${p.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      <Sheet
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? (isEn ? 'Edit Product' : 'Hariri Bidhaa') : (isEn ? 'Add New Product' : 'Ongeza Bidhaa Mpya')}
        subtitle={isEn ? 'Set cost, selling price and initial stock quantity' : 'Weka bei na idadi ya stock iliyopo'}
      >
        <div className="space-y-4 select-none">
          {/* Name & Emoji */}
          <div className="flex gap-2">
            <div className="w-16">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Emoji' : 'Picha'}
              </label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full h-11 text-center text-xl bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Product Name:' : 'Jina la Bidhaa:'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEn ? 'e.g. Sugar 1kg...' : 'Mfano: Sukari 1kg...'}
                className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-600">
                  {isEn ? 'Buying Price (Cost):' : 'Bei ya Kununua (Cost):'}
                </label>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-md">
                  {isEn ? 'Optional' : 'Si lazima'}
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={buyingPriceStr}
                onChange={(e) => setBuyingPriceStr(e.target.value)}
                placeholder={isEn ? 'Optional (leave blank)' : 'Si lazima (acha wazi)'}
                className="w-full h-11 px-3 text-sm font-bold bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                {isEn
                  ? 'If left blank, profit calculation will be optional/skipped.'
                  : 'Ukiacha wazi, hesabu ya faida haitahesabiwa.'}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Selling Price:' : 'Bei ya Kuuza:'} <span className="text-emerald-600 font-bold">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={sellingPriceStr}
                onChange={(e) => setSellingPriceStr(e.target.value)}
                placeholder="0"
                className="w-full h-11 px-3 text-sm font-bold bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Live Margin Hint (§8.C) */}
          {sellingNum > 0 && (
            buyingNum > 0 ? (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  isLoss
                    ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                }`}
              >
                <span>
                  {isLoss
                    ? (isEn
                        ? 'Warning: Selling price is less than or equal to cost!'
                        : 'Tahadhari: Bei ya kuuza ni ndogo au sawa na ya kununua!')
                    : (isEn
                        ? `Profit: KES ${marginPerUnit} per unit (${marginPercent}%)`
                        : `Faida: KES ${marginPerUnit} kwa kila moja (${marginPercent}%)`)}
                </span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center gap-1.5">
                <span className="text-slate-400">ℹ️</span>
                <span>
                  {isEn
                    ? 'Buying price not entered — profit calculation is optional / skipped.'
                    : 'Bei ya kununua haijawekwa — hesabu ya faida imeachwa.'}
                </span>
              </div>
            )
          )}

          {/* Stock Qty & Low Limit */}
          <div className="grid grid-cols-2 gap-3">
            {!editingProduct && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isEn ? 'Opening Stock:' : 'Idadi Iliyopo (Opening Stock):'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialQtyStr}
                  onChange={(e) => setInitialQtyStr(e.target.value)}
                  className="w-full h-11 px-3 text-sm font-bold bg-white border border-slate-300 rounded-xl tabular-nums"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Low Stock Alert Limit:' : 'Kiwango cha kuonya (Low Limit):'}
              </label>
              <input
                type="number"
                min="1"
                value={lowLimitStr}
                onChange={(e) => setLowLimitStr(e.target.value)}
                className="w-full h-11 px-3 text-sm font-bold bg-white border border-slate-300 rounded-xl tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Unit of Measure:' : 'Kipimo (Unit):'}
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-11 px-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
              >
                <option value="pcs">{isEn ? 'Pieces (pcs)' : 'Vipande (pcs)'}</option>
                <option value="kg">{isEn ? 'Kilogram (kg)' : 'Kilo (kg)'}</option>
                <option value="ltr">{isEn ? 'Litre (ltr)' : 'Lita (ltr)'}</option>
                <option value="crate">{isEn ? 'Crate' : 'Katri / Crate'}</option>
                <option value="bale">{isEn ? 'Bale' : 'Bale'}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isEn ? 'Pack Size (Optional):' : 'Pakiti ya jumla (Pack Size):'}
              </label>
              <input
                type="number"
                min="1"
                value={packSizeStr}
                onChange={(e) => setPackSizeStr(e.target.value)}
                placeholder={isEn ? 'Optional (e.g. 12 or 24)' : 'Hiari (mf. 12 au 24)'}
                className="w-full h-11 px-3 text-xs bg-white border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <Button
            variant="gradient"
            size="hero"
            fullWidth
            onClick={handleSaveProduct}
            className="mt-4"
          >
            <Check className="w-5 h-5 mr-1" />
            {editingProduct
              ? (isEn ? 'Save Changes' : 'Hifadhi Mabadiliko')
              : (isEn ? 'Add to Inventory' : 'Ongeza kwa Stock')}
          </Button>
        </div>
      </Sheet>

      {/* Restock List Modal (Feature 6) */}
      <RestockListModal
        isOpen={isRestockModalOpen}
        onClose={() => setIsRestockModalOpen(false)}
        products={products}
        stocks={stocks}
        language={language}
        onRestockCompleted={() => {
          if (typeof window !== 'undefined') {
            window.alert(
              isEn
                ? 'Stock updated successfully from restock list!'
                : 'Stock imesasishwa kikamilifu kutoka kwenye orodha!'
            );
          }
        }}
      />

      {/* Stock Take (Audit) Modal */}
      <Sheet
        isOpen={isStockTakeModalOpen}
        onClose={() => setIsStockTakeModalOpen(false)}
        title={isEn ? 'Stock Count (Audit)' : 'Hesabu ya Stock (Stock-Take)'}
        subtitle={isEn ? 'Audit physical stock on shop shelves' : 'Tembea dukani, hesabu na weka idadi halisi iliyopo'}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {isEn
              ? 'Discrepancies will be recorded as inventory adjustments in shop reports.'
              : 'Tofauti itarekodiwa kama marekebisho (adjustment) kwenye kumbukumbu za duka.'}
          </p>
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto no-scrollbar">
            {products.slice(0, 30).map((p) => {
              const current = stockMap.get(p.id) ?? 0;
              return (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 truncate">
                    <span className="font-bold text-xs text-slate-800 truncate block">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {isEn ? `App count: ${current}` : `Iliyopo kwenye simu: ${current}`}
                    </span>
                  </div>
                  <input
                    type="number"
                    defaultValue={current}
                    onBlur={async (e) => {
                      const counted = Number(e.target.value);
                      if (isNaN(counted) || counted === current) return;
                      const delta = counted - current;
                      const now = serverNow();
                      const mId = crypto.randomUUID();

                      await db.stock_movements.put({
                        id: mId,
                        shop_id: 'shop-active',
                        product_id: p.id,
                        delta,
                        reason: 'adjustment',
                        ref_type: 'stock_take',
                        ref_id: null,
                        unit_cost: p.buying_price,
                        note: 'Stock-take count',
                        created_at: now,
                        device_id: 'device-active',
                        created_by: 'user-active',
                      });
                      await db.product_stock.put({
                        product_id: p.id,
                        shop_id: 'shop-active',
                        qty: counted,
                        updated_at: now,
                      });
                    }}
                    className="w-16 h-9 px-2 text-center font-bold text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              );
            })}
          </div>

          <Button
            variant="gradient"
            size="hero"
            fullWidth
            onClick={() => setIsStockTakeModalOpen(false)}
          >
            {isEn ? 'Finished Stock Count' : 'Nimemaliza Hesabu'}
          </Button>
        </div>
      </Sheet>

      {/* Bulk Add Modal (§8.C) */}
      <Sheet
        isOpen={isBulkAddModalOpen}
        onClose={() => setIsBulkAddModalOpen(false)}
        title={isEn ? 'Bulk Import Products' : 'Weka Bidhaa Nyingi Mara Moja'}
        subtitle={isEn ? 'Paste CSV: Name, Cost, Selling Price, Quantity' : 'Bandika orodha: Jina, Bei ya kununua, Bei ya kuuza, Idadi'}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {isEn ? (
              <>
                Paste one product per line, separated by commas:
                <br />
                <code className="text-emerald-700 bg-slate-100 px-1 py-0.5 rounded font-mono">
                  Sugar 1kg, 150, 175, 20
                </code>
              </>
            ) : (
              <>
                Weka kila bidhaa kwenye mstari wake, zikiwa zimetenganishwa na koma:
                <br />
                <code className="text-emerald-700 bg-slate-100 px-1 py-0.5 rounded font-mono">
                  Sukari 1kg, 150, 175, 20
                </code>
              </>
            )}
          </p>

          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={
              isEn
                ? 'Sugar 1kg, 150, 175, 20\nBread 400g, 55, 65, 15\nMilk 500ml, 55, 65, 10'
                : 'Sukari 1kg, 150, 175, 20\nMkate Festo, 55, 65, 15\nMaziwa KCC, 55, 65, 10'
            }
            className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500"
          />

          <Button
            variant="gradient"
            size="hero"
            fullWidth
            disabled={bulkText.trim().length === 0}
            onClick={handleBulkAdd}
          >
            {isEn ? 'Save All Imported Products' : 'Hifadhi Bidhaa Hizi Zote'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
};
