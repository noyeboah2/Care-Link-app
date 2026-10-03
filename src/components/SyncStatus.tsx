import React from 'react';
import { Wifi, WifiOff, CloudUpload, Loader2, AlertTriangle } from 'lucide-react';
import { discardQueueItem, retryQueueItem } from '@/lib/offline';
import type { useOfflineStatus } from '@/lib/useOffline';

type Status = ReturnType<typeof useOfflineStatus>;

// Replaces the old manual Online/Offline button: it follows the real connection.
export const SyncBadge: React.FC<{ status: Status }> = ({ status }) => {
  const n = status.pending.length;
  if (!status.online) {
    return (
      <span className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40">
        <WifiOff className="w-3 h-3" />
        <span>Offline{n > 0 ? ` · ${n} waiting` : ''}</span>
      </span>
    );
  }
  if (status.syncing || n > 0) {
    return (
      <button
        onClick={() => void status.syncNow()}
        className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-sky-500/20 text-sky-200 border-sky-400/40"
        title="Tap to upload now"
      >
        {status.syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
        <span>{status.syncing ? 'Uploading...' : `${n} to upload`}</span>
      </button>
    );
  }
  return (
    <span className="flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
      <Wifi className="w-3 h-3" />
      <span>Online</span>
    </span>
  );
};

const describe = (type: string, payload: Record<string, unknown>) =>
  type === 'createChild' ? `New case: ${String(payload.fullName ?? 'child')}` : 'A screening result';

// Items the server refused (for example a case that no longer exists). They stay until you decide.
export const SyncIssues: React.FC<{ status: Status; userId: string }> = ({ status, userId }) => {
  if (status.failed.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
      <p className="text-sm font-black text-amber-900 flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4" />
        <span>{status.failed.length} item{status.failed.length === 1 ? '' : 's'} could not be uploaded</span>
      </p>
      {status.failed.map((item) => (
        <div key={item.seq} className="bg-white border border-amber-200 rounded-lg p-2.5 text-xs space-y-1.5">
          <p className="font-bold text-slate-800">{describe(item.type, item.payload)}</p>
          <p className="text-amber-800">{item.error}</p>
          <div className="flex gap-2">
            <button onClick={() => void retryQueueItem(userId, item.seq as number)} className="font-bold border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50">
              Try again
            </button>
            <button
              onClick={() => { if (window.confirm('Discard this item? It will not be uploaded.')) void discardQueueItem(item.seq as number); }}
              className="font-bold text-red-700 border border-red-200 rounded px-2.5 py-1 hover:bg-red-50"
            >
              Discard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
