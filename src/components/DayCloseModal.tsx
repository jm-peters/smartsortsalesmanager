import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { DenominationCounter } from './DenominationCounter';
import { toKES, subKES, formatKES, type KES } from '../lib/money';
import {
  db,
  serverNow,
  calculateSessionExpectedCash,
  type CashSession,
  type UserRole,
} from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface DayCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession | null;
  userRole: UserRole;
  onSessionClosed: () => void;
  language?: Language;
}

export const DayCloseModal: React.FC<DayCloseModalProps> = ({
  isOpen,
  onClose,
  session,
  userRole,
  onSessionClosed,
  language = 'en',
}) => {
  const isEn = language === 'en';
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [countedCash, setCountedCash] = useState<KES>(toKES(0));
  const [countedMpesaStr, setCountedMpesaStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const [metrics, setMetrics] = useState<{
    expectedCash: KES;
    cashSales: KES;
    cashDeniPayments: KES;
    cashExpenses: KES;
    cashDrops: KES;
    totalSales: KES;
    totalProfit: KES;
    totalExpenses: KES;
    deniIssued: KES;
    transactionCount: number;
    mpesaSales: KES;
  }>({
    expectedCash: toKES(0),
    cashSales: toKES(0),
    cashDeniPayments: toKES(0),
    cashExpenses: toKES(0),
    cashDrops: toKES(0),
    totalSales: toKES(0),
    totalProfit: toKES(0),
    totalExpenses: toKES(0),
    deniIssued: toKES(0),
    transactionCount: 0,
    mpesaSales: toKES(0),
  });

  useEffect(() => {
    if (!isOpen || !session) return;
    setStep(1);
    setCountedCash(toKES(0));
    setCountedMpesaStr('');
    setNote('');

    async function loadMetrics() {
      if (!session) return;
      setLoading(true);
      const res = await calculateSessionExpectedCash(session.id);
      setMetrics(res);
      setLoading(false);
    }
    loadMetrics();
  }, [isOpen, session]);

  if (!session) return null;

  const isOwner = userRole === 'owner';
  const cashVariance = subKES(countedCash, metrics.expectedCash);
  const isVarianceAcceptable = Math.abs(cashVariance) <= Math.max(50, metrics.expectedCash * 0.005);

  const countedMpesa = countedMpesaStr ? toKES(Number(countedMpesaStr) || 0) : null;
  const mpesaVariance = countedMpesa !== null ? subKES(countedMpesa, metrics.mpesaSales) : null;

  const handleFinalizeClose = async () => {
    setClosing(true);
    const now = serverNow();

    try {
      await db.transaction(
        'rw',
        [db.cash_sessions, db.outbox, db.audit_log],
        async () => {
          const updateData = {
            status: 'closed' as const,
            closed_at: now,
            closed_by: session.shop_user_id,
            expected_cash: metrics.expectedCash,
            counted_cash: countedCash,
            cash_variance: cashVariance,
            expected_mpesa: metrics.mpesaSales,
            counted_mpesa: countedMpesa,
            mpesa_variance: mpesaVariance,
            total_sales: metrics.totalSales,
            total_profit: metrics.totalProfit,
            total_expenses: metrics.totalExpenses,
            deni_issued: metrics.deniIssued,
            deni_collected: metrics.cashDeniPayments,
            transaction_count: metrics.transactionCount,
            note: note.trim() || null,
          };

          await db.cash_sessions.update(session.id, updateData);

          await db.audit_log.put({
            id: crypto.randomUUID(),
            shop_id: session.shop_id,
            actor_user_id: session.shop_user_id,
            action: 'close_cash_session',
            entity_type: 'cash_sessions',
            entity_id: session.id,
            before: { status: 'open' },
            after: updateData,
            created_at: now,
          });

          await db.outbox.add({
            id: session.id,
            table: 'cash_sessions',
            op: 'update',
            payload: { id: session.id, ...updateData },
            attempts: 0,
            next_attempt_at: now,
          });
        }
      );

      onSessionClosed();
      onClose();
    } catch {
      // ignore
    } finally {
      setClosing(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEn ? 'Close Day Shift (Cash Count)' : 'Funga Siku (Hesabu ya Pesa)'}
      subtitle={
        isEn
          ? `Period: ${session.label} · Step ${step} of 3`
          : `Kipindi: ${session.label} · Hatua ya ${step} kati ya 3`
      }
    >
      <div className="space-y-4 select-none">
        {/* Step Indicator */}
        <div className="flex items-center gap-1.5 px-1">
          <div
            className={`h-1.5 flex-1 rounded-full ${
              step >= 1 ? 'bg-emerald-600' : 'bg-slate-200'
            }`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full ${
              step >= 2 ? 'bg-emerald-600' : 'bg-slate-200'
            }`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full ${
              step >= 3 ? 'bg-emerald-600' : 'bg-slate-200'
            }`}
          />
        </div>

        {/* STEP 1: Count Cash */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 font-medium">
              {isEn
                ? 'Count notes and coins currently in the cash drawer or till box:'
                : 'Hesabu noti na sarafu zilizopo kwenye droo/boksi la pesa:'}
            </div>

            <DenominationCounter
              language={language}
              onTotalChange={(total) => setCountedCash(total)}
            />

            <Button
              variant="gradient"
              size="hero"
              fullWidth
              onClick={() => setStep(2)}
              className="mt-4"
            >
              {isEn ? 'Proceed to M-Pesa' : 'Endelea na M-Pesa'}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        )}

        {/* STEP 2: Optional M-Pesa Statement Balance */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                {isEn ? 'M-Pesa Recorded Today' : 'M-Pesa Iliyorekodiwa Leo'}
              </span>
              <div className="text-2xl font-black text-emerald-950 tabular-nums mt-0.5">
                {formatKES(metrics.mpesaSales)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                {isEn ? 'Till / M-Pesa Statement Balance (Optional):' : 'Salio la Till / Taarifa ya M-Pesa (Hiari):'}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={countedMpesaStr}
                onChange={(e) => setCountedMpesaStr(e.target.value.replace(/\D/g, ''))}
                placeholder={isEn ? 'Enter balance from till phone...' : 'Andika salio lililopo kwenye simu ya Till...'}
                className="w-full h-14 px-4 text-xl font-black bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {isEn
                  ? 'You can skip this step if till phone is unavailable right now.'
                  : 'Unaweza kuruka hatua hii ikiwa huna taarifa ya Till sasa hivi.'}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setStep(1)}
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                {isEn ? 'Back' : 'Nyuma'}
              </Button>
              <Button
                variant="gradient"
                size="hero"
                fullWidth
                onClick={() => setStep(3)}
              >
                {isEn ? 'Review Summary' : 'Tazama Matokeo'}
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Neutral Results & Final Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Sales & Financials Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 text-sm">
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">{isEn ? "Today's Sales:" : 'Mauzo ya Leo:'}</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatKES(metrics.totalSales)}
                </span>
              </div>

              {isOwner && (
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">{isEn ? 'Shop Profit:' : 'Faida ya Duka:'}</span>
                  <span className="font-bold text-blue-700 tabular-nums">
                    {formatKES(metrics.totalProfit)}
                  </span>
                </div>
              )}

              <div className="py-2 flex justify-between">
                <span className="text-slate-600">{isEn ? 'Expenses:' : 'Matumizi ya Biashara:'}</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {formatKES(metrics.totalExpenses)}
                </span>
              </div>

              {metrics.cashDrops > 0 && (
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">{isEn ? 'Cash Drops Taken:' : 'Pesa Zilizotolewa (Cash Drop):'}</span>
                  <span className="font-bold text-amber-700 tabular-nums">
                    {formatKES(metrics.cashDrops)}
                  </span>
                </div>
              )}
            </div>

            {/* Reconciliation Comparison */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm shadow-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">{isEn ? 'Expected Cash:' : 'Pesa iliyotakiwa (Expected):'}</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatKES(metrics.expectedCash)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">{isEn ? 'Counted Cash:' : 'Pesa uliyohesabu (Counted):'}</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatKES(countedCash)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="font-bold text-slate-700">{isEn ? 'Cash Variance:' : 'Tofauti ya Pesa:'}</span>
                <span
                  className={`font-black text-base tabular-nums ${
                    isVarianceAcceptable
                      ? 'text-slate-600'
                      : cashVariance > 0
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {cashVariance > 0 ? `+${formatKES(cashVariance)}` : formatKES(cashVariance)}
                </span>
              </div>
            </div>

            {/* Neutral Tone Advice Box (§Feature 1 Tone Rules) */}
            {isVarianceAcceptable ? (
              <div className="p-3 bg-slate-100 rounded-xl flex items-center gap-2.5 text-xs text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>
                  {isEn
                    ? 'Drawer cash is in exact balance with sales records.'
                    : 'Pesa ziko sawa kabisa na kumbukumbu za mauzo.'}
                </span>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">
                    {isEn
                      ? `There is a difference of ${formatKES(Math.abs(cashVariance))}.`
                      : `Kuna tofauti ya ${formatKES(Math.abs(cashVariance))}.`}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    {isEn
                      ? 'Usually this is due to an unrecorded quick sale or petty cash expense.'
                      : 'Mara nyingi ni mauzo au matumizi madogo ambayo hayakurekodiwa.'}
                  </div>
                </div>
              </div>
            )}

            {/* Note field */}
            <div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isEn ? 'Optional closing note (e.g. forgot to record 2 sodas)...' : 'Andika maelezo yoyote (mfano: nimesahau soda 2)...'}
                className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Final Confirmation Button */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setStep(2)}
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                {isEn ? 'Back' : 'Nyuma'}
              </Button>

              <Button
                variant="gradient"
                size="hero"
                fullWidth
                disabled={closing}
                onClick={handleFinalizeClose}
              >
                <Lock className="w-5 h-5 mr-2" />
                {closing
                  ? isEn ? 'Closing Day...' : 'Inafunga Siku...'
                  : isEn ? 'Finalize & Close Day' : 'Kamilisha Kufunga Siku'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
