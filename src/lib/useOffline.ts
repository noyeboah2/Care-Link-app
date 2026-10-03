import { useCallback, useEffect, useMemo, useState } from 'react';
import { scoreAnswers } from '@/lib/risk';
import { normalizePhone } from '@/lib/validation';
import {
  getQueue, isSyncing, net, subscribe, syncQueue,
  type CaseSummary, type QueueItem,
} from '@/lib/offline';

// True/false that follows the phone's connection.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(net.online());
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

// Upload queue status + automatic syncing for the signed-in user.
export function useOfflineStatus(userId: string) {
  const online = useOnline();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncedTick, setSyncedTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setQueue(await getQueue(userId));
    } catch {
      /* IndexedDB unavailable (private mode); behave as online-only */
    }
    setSyncing(isSyncing());
  }, [userId]);

  const syncNow = useCallback(async () => {
    const r = await syncQueue(userId);
    if (r.synced > 0) setSyncedTick((n) => n + 1);
    await refresh();
    return r;
  }, [userId, refresh]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribe(() => void refresh());
    return () => {
      unsubscribe();
    };
  }, [refresh]);

  // Try to upload when we come online, and every 30 seconds while items are waiting.
  useEffect(() => {
    if (online) void syncNow();
  }, [online, syncNow]);
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => {
      void getQueue(userId).then((q) => {
        if (q.some((i) => !i.failed)) void syncNow();
      });
    }, 30000);
    return () => clearInterval(t);
  }, [online, userId, syncNow]);

  const pending = useMemo(() => queue.filter((q) => !q.failed), [queue]);
  const failed = useMemo(() => queue.filter((q) => q.failed), [queue]);
  return { online, queue, pending, failed, syncing, syncNow, syncedTick };
}

// Shows what is waiting to upload on top of the saved list.
export function applyQueue(cases: CaseSummary[], queue: QueueItem[]): CaseSummary[] {
  const list = cases.map((c) => ({ ...c }));
  for (const item of queue) {
    if (item.failed) continue;
    if (item.type === 'createChild') {
      const p = item.payload as { id: string; fullName: string; age: number; gender: string; caregiverPhone: string; area: string };
      if (!list.some((c) => c.id === p.id)) {
        list.unshift({
          id: p.id, fullName: p.fullName, age: p.age, gender: p.gender,
          caregiverPhone: normalizePhone(p.caregiverPhone) ?? p.caregiverPhone,
          followUpDate: null, area: p.area, lastRisk: 'PENDING', followUpStatus: 'PENDING', unsynced: true,
        });
      }
    } else if (item.type === 'screening') {
      const p = item.payload as { childId: string; answers: Record<string, boolean> };
      const target = list.find((c) => c.id === p.childId);
      if (target) {
        target.lastRisk = scoreAnswers(p.answers).riskLevel;
        target.unsynced = true;
      }
    }
  }
  return list;
}
