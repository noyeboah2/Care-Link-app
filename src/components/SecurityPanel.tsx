import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, ShieldCheck, History } from 'lucide-react';

interface AuditItem {
  id: string; at: string; user: string | null; role: string | null; action: string;
  entityType: string | null; entityId: string | null; label: string | null; ip: string | null;
  details: Record<string, unknown> | null;
}
interface Info {
  counts: { children: number; screenings: number; users: number; smsLog: number; audit: number };
  empty: boolean;
  lastExport: { at: string; by: string | null } | null;
}

const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Signed in', LOGIN_FAILED: 'Failed sign-in', LOGOUT: 'Signed out', PASSWORD_CHANGED: 'Changed password', SETUP_COMPLETED: 'Created the first admin',
  USER_CREATED: 'Added a user', USER_DEACTIVATED: 'Deactivated a user', USER_ACTIVATED: 'Reactivated a user', USER_ROLE_CHANGED: 'Changed a role', USER_PASSWORD_RESET: 'Reset a password',
  CASE_CREATED: 'Added a case', CASE_VIEWED: 'Viewed a case', CASE_UPDATED: 'Edited a case', CASE_DELETED: 'Deleted a case', SCREENING_RECORDED: 'Recorded a screening',
  SMS_SETTINGS_CHANGED: 'Changed SMS settings', SMS_TEST_SENT: 'Sent a test SMS', SMS_RUN_MANUAL: 'Sent reminders manually',
  BACKUP_EXPORTED: 'Downloaded data', DATA_EXPORTED: 'Exported a report', BACKUP_RESTORED: 'Restored a backup', CASES_CLEARED: 'Cleared all cases', AUDIT_RESET: 'Reset the audit log',
};
const DANGER = ['LOGIN_FAILED', 'CASE_DELETED', 'CASES_CLEARED', 'AUDIT_RESET', 'BACKUP_RESTORED', 'USER_DEACTIVATED', 'USER_ROLE_CHANGED', 'USER_PASSWORD_RESET'];

const inputCls = 'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none';

const fmt = (sql: string) => {
  const d = new Date(sql.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? sql : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

function detailText(d: Record<string, unknown> | null): string {
  if (!d) return '';
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}

async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new Error('No internet connection');
  }
  if (res.status === 401) { window.location.reload(); throw new Error('Signed out'); }
  const data = (await res.json()) as T & { success: boolean; error?: string };
  if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong');
  return data;
}

const chunks = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/* ---------------- Audit log ---------------- */
const AuditLog: React.FC = () => {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', action: '', from: '', to: '' });

  const query = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...extra });
    if (f.q) p.set('q', f.q);
    if (f.action) p.set('action', f.action);
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    return p.toString();
  };

  const load = useCallback(async (more = false, from: number | null = null) => {
    setLoading(true);
    setError('');
    try {
      const d = await api<{ items: AuditItem[]; nextCursor: number | null; actions: string[] }>(`/api/audit?${query(more && from ? { cursor: String(from) } : {})}`);
      setItems((prev) => (more ? [...prev, ...d.items] : d.items));
      setCursor(d.nextCursor);
      setActions(d.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.q, f.action, f.from, f.to]);

  useEffect(() => {
    const t = setTimeout(() => void load(false), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Every sign-in, case view, edit, screening, deletion and admin action is recorded here with who did it and when (times are UTC, which is Ghana time). Entries cannot be edited.
        Opening the same case again within 10 minutes is recorded once.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white rounded-xl shadow-md p-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-bold text-slate-600">Search (person, child, details)</label>
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className={inputCls} placeholder="e.g. Kofi" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600">Action</label>
          <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} className={inputCls}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-600">From</label>
            <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">To</label>
            <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="sm:col-span-4 flex justify-end">
          <a href={`/api/admin/backup?type=audit&${query()}`} className="inline-flex items-center space-x-1.5 text-sm font-bold border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
            <Download className="w-4 h-4" />
            <span>Download this view (CSV)</span>
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white rounded-xl shadow-md divide-y divide-slate-100">
        {items.length === 0 && !loading && <p className="p-5 text-sm text-slate-500">No entries match.</p>}
        {items.map((i) => (
          <div key={i.id} className="p-3 sm:px-5 text-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
            <div>
              <p className="font-bold text-slate-900">
                <span className={`mr-2 text-[10px] font-bold px-2 py-0.5 rounded-full align-middle ${DANGER.includes(i.action) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                  {ACTION_LABEL[i.action] ?? i.action}
                </span>
                {i.label ?? ''}
              </p>
              <p className="text-xs text-slate-500">
                {i.user ? `${i.user}${i.role ? ` (${i.role.toLowerCase()})` : ''}` : 'Not signed in'}
                {detailText(i.details) ? ` · ${detailText(i.details)}` : ''}
                {i.ip ? ` · ${i.ip}` : ''}
              </p>
            </div>
            <p className="text-xs text-slate-400 whitespace-nowrap">{fmt(i.at)}</p>
          </div>
        ))}
        {loading && (
          <div className="p-4 flex items-center justify-center text-slate-500 text-sm space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </div>
        )}
      </div>
      {cursor && !loading && (
        <button onClick={() => void load(true, cursor)} className="w-full border border-slate-300 rounded-xl py-2.5 text-sm font-bold hover:bg-white">Load older entries</button>
      )}
    </div>
  );
};

/* ---------------- Backups ---------------- */
const Backups: React.FC = () => {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [file, setFile] = useState<{ name: string; backup: { children: unknown[]; screenings: unknown[] }; counts: { children: number; screenings: number } } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const load = useCallback(async () => {
    try {
      setInfo(await api<Info>('/api/admin/backup?type=info'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pickFile = async (f: File | undefined) => {
    setFile(null); setError(''); setNotice('');
    if (!f) return;
    setBusy(true);
    try {
      const backup = JSON.parse(await f.text());
      const r = await api<{ counts: { children: number; screenings: number } }>('/api/admin/restore', 'POST', { phase: 'validate', backup });
      setFile({ name: f.name, backup, counts: r.counts });
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file is not a readable backup.' : err instanceof Error ? err.message : 'Could not read the file');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    let began = false;
    const total = file.counts.children + file.counts.screenings;
    let done = 0;
    setProgress({ done, total });
    try {
      await api('/api/admin/restore', 'POST', { phase: 'begin', confirm: confirmText });
      began = true;
      for (const rows of chunks(file.backup.children, 100)) {
        await api('/api/admin/restore', 'POST', { phase: 'children', rows });
        done += rows.length; setProgress({ done, total });
      }
      for (const rows of chunks(file.backup.screenings, 160)) {
        await api('/api/admin/restore', 'POST', { phase: 'screenings', rows });
        done += rows.length; setProgress({ done, total });
      }
      const r = await api<{ counts: { children: number; screenings: number } }>('/api/admin/restore', 'POST', { phase: 'finish' });
      setNotice(`Restored ${r.counts.children} cases and ${r.counts.screenings} screenings.`);
      setFile(null); setConfirmText('');
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'The restore failed';
      if (began) {
        try { await api('/api/admin/restore', 'POST', { phase: 'abort' }); msg += ' Nothing was kept: the partial restore was rolled back.'; } catch { msg += ' Warning: the rollback also failed. Use Time Travel to return to an earlier time.'; }
      }
      setError(msg);
    } finally {
      setBusy(false); setProgress(null); void load();
    }
  };

  const dl = (type: string, label: string, hint: string) => (
    <a
      href={`/api/admin/backup?type=${type}`}
      onClick={() => setTimeout(() => void load(), 2000)}
      className="flex items-center justify-between border border-slate-200 rounded-xl p-3 hover:bg-slate-50"
    >
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <Download className="w-5 h-5 text-slate-600" />
    </a>
  );

  return (
    <div className="space-y-6">
      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
        <h2 className="text-lg font-black text-slate-900">Download your data</h2>
        <p className="text-sm text-slate-600">
          {info
            ? `Right now: ${info.counts.children} cases, ${info.counts.screenings} screenings, ${info.counts.users} users. ${info.lastExport ? `Last download: ${fmt(info.lastExport.at)}${info.lastExport.by ? ` by ${info.lastExport.by}` : ''}.` : 'Nothing has been downloaded yet.'}`
            : 'Loading...'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dl('full', 'Full backup (JSON)', 'Everything needed to restore cases and screenings')}
          {dl('cases', 'Cases (spreadsheet)', 'Opens in Excel or Google Sheets')}
          {dl('screenings', 'Screenings (spreadsheet)', 'Every screening with its result and date')}
          {dl('audit', 'Audit log (spreadsheet)', 'Who did what and when')}
        </div>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          These files contain children’s names and phone numbers. Keep them on an encrypted or locked device, never send them by email or chat, and delete old copies you no longer need.
          Passwords and SMS keys are never included.
        </p>
        <p className="text-xs text-slate-500">Suggested routine: download a Full backup once a week and after any large data entry, and store it somewhere other than this phone or computer.</p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
        <h2 className="text-lg font-black text-slate-900">Restore from a backup file</h2>
        <p className="text-sm text-slate-600">
          Works only when the database has <b>no cases</b> (for example after “Clear test data”, or on a fresh setup). It restores cases and screenings. Users are not restored:
          accounts must already exist, and a case whose original worker is gone is kept but no longer linked to them (supervisors and admins still see it).
        </p>
        {info && !info.empty && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            The database currently holds cases, so a restore is blocked. To go back to an earlier time instead, use Time Travel (below).
          </p>
        )}
        <input type="file" accept=".json,application/json" disabled={busy || (info ? !info.empty : true)} onChange={(e) => void pickFile(e.target.files?.[0])} className="text-sm" />
        {file && (
          <div className="space-y-2 border border-slate-200 rounded-xl p-3">
            <p className="text-sm font-bold text-slate-800">{file.name}: {file.counts.children} cases and {file.counts.screenings} screenings, checked and ready.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type RESTORE" className={inputCls + ' sm:flex-1'} />
              <button onClick={() => void restore()} disabled={busy || confirmText !== 'RESTORE'} className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold px-5 py-2 rounded-xl">
                Restore now
              </button>
            </div>
          </div>
        )}
        {progress && (
          <div className="space-y-1">
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-slate-500">Restoring {progress.done} of {progress.total}. Keep this page open.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
        <h2 className="text-lg font-black text-slate-900">Undo a mistake with Time Travel</h2>
        <p className="text-sm text-slate-600">
          Cloudflare keeps an automatic history of your database, so you can rewind it to any minute in the last <b>7 days on the free plan (30 days on the paid plan)</b>. Use this if
          cases were deleted or changed by mistake. It rewinds <b>everything</b>, including anything added after that time.
        </p>
        <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-1">
          <li>In Cloudflare, open <b>Storage &amp; Databases, D1, carelink-db</b>, then the <b>Console</b> tab.</li>
          <li>Type <code className="bg-slate-100 px-1 rounded">/bookmark 2026-10-03T08:00:00.000Z</code> with the time you want to go back to (UTC) and press Execute. It prints a bookmark id.</li>
          <li>Type <code className="bg-slate-100 px-1 rounded">/restore</code> followed by that bookmark id, and Execute. It also prints a bookmark to undo the restore.</li>
        </ol>
        <p className="text-xs text-slate-500">At most 10 restores are allowed per 10 minutes. Time Travel cannot be downloaded as a file, which is why the downloads above matter.</p>
      </div>
    </div>
  );
};

export const SecurityPanel: React.FC = () => {
  const [tab, setTab] = useState<'audit' | 'backups'>('audit');
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900">Security and backups</h1>
        <p className="text-sm text-slate-500">Who accessed children’s records, and how to keep and recover your data.</p>
      </div>
      <div className="flex gap-2">
        {([['audit', 'Audit log', History], ['backups', 'Backups', ShieldCheck]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-sm font-bold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {tab === 'audit' ? <AuditLog /> : <Backups />}
    </div>
  );
};
