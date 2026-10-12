import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cloud, CloudOff, CheckCircle2, RefreshCw } from 'lucide-react';
import { syncEngine, type SyncStatus } from '../lib/sync/engine';
import { db } from '../lib/db/local';
import type { Language } from '../lib/i18n';

interface OfflineBannerProps {
  language?: Language;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ language = 'en' }) => {
  const isEn = language === 'en';
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());

  const totalSales = useLiveQuery(() => db.sales.count(), []) || 0;
  const pendingSales = useLiveQuery(() => db.outbox.where('table').equals('sales').count(), []) || 0;
  const syncedSales = Math.max(0, totalSales - pendingSales);

  useEffect(() => {
    return syncEngine.subscribe((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  const handleSyncClick = () => {
    syncEngine.triggerSync();
  };

  return (
    <div className="flex items-center gap-1.5 select-none">
      <button
        type="button"
        onClick={handleSyncClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-200 transition cursor-pointer"
        title={isEn ? 'Tap to sync queued offline records to cloud' : 'Bofya ili kurusha data mtandaoni'}
      >
        {status.isSyncing ? (
          <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
        ) : pendingSales > 0 ? (
          <Cloud className="w-3.5 h-3.5 text-amber-600" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        )}
        <span>Synced: {syncedSales}, Pending: {pendingSales}</span>
      </button>

      {!status.isOnline && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold">
          <CloudOff className="w-3 h-3 text-amber-700" />
          <span>{isEn ? 'Offline' : 'Bila Mtandao'}</span>
        </div>
      )}
    </div>
  );
};
