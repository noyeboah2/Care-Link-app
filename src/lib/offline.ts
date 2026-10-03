// Offline support: remembers the case list on the phone and keeps new cases and
// screenings in an upload queue (IndexedDB) until the phone is back online.
// Browser-only. Every record is tied to the signed-in user's id.

export interface CaseSummary {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  caregiverPhone: string;
  followUpDate: string | null;
  area: string | null;
  lastRisk: 'HIGH_RISK' | 'LOW_RISK' | 'PENDING';
  followUpStatus: 'PENDING' | 'OVERDUE' | 'COMPLETED';
  unsynced?: boolean;
}

export type QueueType = 'createChild' | 'screening';

export interface QueueItem {
  seq?: number;
  userId: string;
  type: QueueType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  failed?: boolean;
  error?: string;
}

export const net = {
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
};

const DB_NAME = 'carelink-offline';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('cases', { keyPath: 'key' });
        db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

// ---------- change notifications (so screens refresh) ----------
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

// ---------- cached case list ----------
export async function saveCases(userId: string, cases: CaseSummary[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['cases', 'meta'], 'readwrite');
    const store = tx.objectStore('cases');
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        if ((cursor.value as { userId: string }).userId === userId) cursor.delete();
        cursor.continue();
      } else {
        for (const c of cases) store.put({ key: `${userId}:${c.id}`, userId, data: c });
        tx.objectStore('meta').put({ key: `casesSavedAt:${userId}`, value: new Date().toISOString() });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCases(userId: string): Promise<{ cases: CaseSummary[]; savedAt: string | null } | null> {
  const all = await run<Array<{ userId: string; data: CaseSummary }>>('cases', 'readonly', (s) => s.getAll());
  const mine = all.filter((r) => r.userId === userId).map((r) => r.data);
  const meta = await run<{ value: string } | undefined>('meta', 'readonly', (s) => s.get(`casesSavedAt:${userId}`));
  if (mine.length === 0 && !meta) return null;
  return { cases: mine, savedAt: meta?.value ?? null };
}

// Removes the saved case list for this user (the upload queue is kept so nothing is lost).
export async function clearCachedCases(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['cases', 'meta'], 'readwrite');
    const cursorReq = tx.objectStore('cases').openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        if ((cursor.value as { userId: string }).userId === userId) cursor.delete();
        cursor.continue();
      }
    };
    tx.objectStore('meta').delete(`casesSavedAt:${userId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- upload queue ----------
export async function getQueue(userId: string): Promise<QueueItem[]> {
  const all = await run<QueueItem[]>('queue', 'readonly', (s) => s.getAll());
  return all.filter((q) => q.userId === userId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

export async function enqueue(userId: string, type: QueueType, payload: Record<string, unknown>): Promise<void> {
  await run('queue', 'readwrite', (s) => s.add({ userId, type, payload, createdAt: new Date().toISOString(), attempts: 0 }));
  notify();
  void syncQueue(userId);
}

async function putQueueItem(item: QueueItem) {
  await run('queue', 'readwrite', (s) => s.put(item));
}

export async function discardQueueItem(seq: number): Promise<void> {
  await run('queue', 'readwrite', (s) => s.delete(seq));
  notify();
}

export async function retryQueueItem(userId: string, seq: number): Promise<void> {
  const item = (await getQueue(userId)).find((q) => q.seq === seq);
  if (item) {
    await putQueueItem({ ...item, failed: false, error: undefined });
    notify();
    void syncQueue(userId);
  }
}

// ---------- uploading ----------
export interface SyncResult {
  synced: number;
  failed: number;
  offline: boolean;
  unauthorized: boolean;
}

let syncing = false;
export const isSyncing = () => syncing;

const endpointFor = (type: QueueType) => (type === 'createChild' ? '/api/children' : '/api/screenings');

export async function syncQueue(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, offline: false, unauthorized: false };
  if (syncing) return result;
  if (!net.online()) {
    result.offline = true;
    return result;
  }
  syncing = true;
  notify();
  try {
    for (const item of await getQueue(userId)) {
      if (item.failed) continue;
      let res: Response;
      try {
        res = await fetch(endpointFor(item.type), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
      } catch {
        result.offline = true;
        break;
      }
      if (res.status === 401) {
        result.unauthorized = true;
        break;
      }
      if (res.ok) {
        await run('queue', 'readwrite', (s) => s.delete(item.seq as number));
        result.synced++;
        notify();
        continue;
      }
      let message = `Upload failed (${res.status})`;
      try {
        message = ((await res.json()) as { error?: string }).error || message;
      } catch {
        /* keep default message */
      }
      if (res.status >= 500) {
        await putQueueItem({ ...item, attempts: item.attempts + 1 });
        break; // server trouble: try again later
      }
      await putQueueItem({ ...item, attempts: item.attempts + 1, failed: true, error: message });
      result.failed++;
      notify();
    }
  } finally {
    syncing = false;
    notify();
  }
  return result;
}

// ---------- saving from the screens ----------
export type SubmitOutcome<T> = { status: 'saved'; data: T } | { status: 'queued' };

async function postOrQueue<T>(userId: string, type: QueueType, payload: Record<string, unknown>, forceQueue = false): Promise<SubmitOutcome<T>> {
  if (forceQueue || !net.online()) {
    await enqueue(userId, type, payload);
    return { status: 'queued' };
  }
  let res: Response;
  try {
    res = await fetch(endpointFor(type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    await enqueue(userId, type, payload);
    return { status: 'queued' };
  }
  if (res.status === 401) throw new SessionExpiredError();
  if (res.status >= 500) {
    await enqueue(userId, type, payload);
    return { status: 'queued' };
  }
  const json = (await res.json()) as { success: boolean; error?: string } & T;
  if (!res.ok || !json.success) throw new Error(json.error || 'Could not save');
  return { status: 'saved', data: json as T };
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Please sign in again.');
  }
}

export function submitNewChild(userId: string, payload: { fullName: string; age: number; gender: string; caregiverPhone: string; area: string; smsConsent?: boolean }) {
  const id = crypto.randomUUID();
  return postOrQueue<{ child: CaseSummary }>(userId, 'createChild', { id, ...payload }).then((outcome) => ({ outcome, id }));
}

export async function submitScreening(userId: string, payload: { childId: string; answers: Record<string, boolean> }) {
  const body = { id: crypto.randomUUID(), recordedAt: new Date().toISOString(), ...payload };
  // A child that has not reached the server yet can't be screened on the server yet either.
  const queue = await getQueue(userId);
  const childStillQueued = queue.some((q) => q.type === 'createChild' && q.payload.id === payload.childId && !q.failed);
  return postOrQueue<{ data: { riskLevel: string } }>(userId, 'screening', body, childStillQueued);
}
