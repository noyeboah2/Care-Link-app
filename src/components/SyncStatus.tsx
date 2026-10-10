import React from 'react';
import { Wifi, WifiOff, CloudUpload, Loader2, AlertTriangle } from 'lucide-react';
import { discardQueueItem, retryQueueItem } from '@/lib/offline';
import type { useOfflineStatus } from '@/lib/useOffline';
import { useI18n } from '@/lib/i18n';

type Status = ReturnType<typeof useOfflineStatus>;

// Replaces the old manual Online/Offline button: it follows the real connection.
export const SyncBadge: React.FC<{ status: Status }> = ({ status }) => {
  const { t } = useI18n();
  const n = status.pending.length;
  if (!status.online) {
    return (
      <span className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-amber-400 text-amber-950 border-amber-300">
        <WifiOff className="w-3 h-3" />
        <span>{t('Offline')}{n > 0 ? ` · ${t('{n} waiting', { n })}` : ''}</span>
      </span>
    );
  }
  if (status.syncing || n > 0) {
    return (
      <button
        onClick={() => void status.syncNow()}
        className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white text-brand border-white"
        title={t('Tap to upload now')}
      >
        {status.syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
        <span>{status.syncing ? t('Uploading...') : t('{n} to upload', { n })}</span>
      </button>
    );
  }
  return (
    <span className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white/15 text-white border-white/30">
      <Wifi className="w-3 h-3" />
      <span>{t('Online')}</span>
    </span>
  );
};

const describe = (t: (text: string, vars?: Record<string, string | number>) => string, type: string, payload: Record<string, unknown>) =>
  type === 'createChild' ? t('New case: {name}', { name: String(payload.fullName ?? '') }) : t('A screening result');

// Items the server refused (for example a case that no longer exists). They stay until you decide.
export const SyncIssues: React.FC<{ status: Status; userId: string }> = ({ status, userId }) => {
  const { t } = useI18n();
  if (status.failed.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
      <p className="text-sm font-black text-amber-900 flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4" />
        <span>{status.failed.length === 1 ? t('1 item could not be uploaded') : t('{n} items could not be uploaded', { n: status.failed.length })}</span>
      </p>
      {status.failed.map((item) => (
        <div key={item.seq} className="bg-white border border-amber-200 rounded-lg p-2.5 text-xs space-y-1.5">
          <p className="font-bold text-slate-800">{describe(t, item.type, item.payload)}</p>
          <p className="text-amber-800">{t(item.error ?? "")}</p>
          <div className="flex gap-2">
            <button onClick={() => void retryQueueItem(userId, item.seq as number)} className="font-bold border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50">{t('Try again')}</button>
            <button
              onClick={() => { if (window.confirm(t('Discard this item? It will not be uploaded.'))) void discardQueueItem(item.seq as number); }}
              className="font-bold text-red-700 border border-red-200 rounded px-2.5 py-1 hover:bg-red-50"
            >{t('Discard')}</button>
          </div>
        </div>
      ))}
    </div>
  );
};
