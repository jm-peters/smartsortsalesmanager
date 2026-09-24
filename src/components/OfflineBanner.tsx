import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { syncEngine, type SyncStatus } from '../lib/sync/engine';
import type { Language } from '../lib/i18n';

interface OfflineBannerProps {
  language?: Language;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ language = 'en' }) => {
  const isEn = language === 'en';
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());

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
      {status.deadLetterCount > 0 ? (
        <button
          type="button"
          onClick={handleSyncClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow-xs active:bg-amber-600 transition"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{status.deadLetterCount} {isEn ? 'failed' : 'hazijatumwa'}</span>
        </button>
      ) : status.unpushedCount > 0 ? (
        <button
          type="button"
          onClick={handleSyncClick}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-200 transition"
          title={isEn ? 'Tap to sync records to cloud' : 'Bofya ili kurusha data mtandaoni'}
        >
          {status.isSyncing ? (
            <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span>{status.unpushedCount} {isEn ? 'pending' : 'hazijarushwa'}</span>
        </button>
      ) : (
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold"
          title={isEn ? 'All data saved securely' : 'Data zote zimerushwa salama'}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{isEn ? 'Saved' : 'Imehifadhiwa'}</span>
        </div>
      )}

      {!status.isOnline && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold">
          <CloudOff className="w-3 h-3 text-amber-700" />
          <span>{isEn ? 'Offline' : 'Bila Mtandao'}</span>
        </div>
      )}
    </div>
  );
};
