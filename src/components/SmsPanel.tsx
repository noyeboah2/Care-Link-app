import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Copy } from 'lucide-react';

interface Settings {
  configured: boolean; enabled: boolean; username: string; senderId: string; hasApiKey: boolean;
  credentialsFrom: 'env' | 'database' | 'none'; sandbox: boolean; callbackToken: string;
}
interface LogItem {
  id: string; kind: string; forDate: string; status: string; error: string | null; cost: string | null;
  phone: string; createdAt: string; child: string; worker: string | null;
}
interface RunSummary {
  dryRun: boolean; skipped?: string; today: string; queued: number; sent: number; failed: number; remaining: number;
  due: Array<{ firstName: string; kind: string; forDate: string; state: string }>;
}

const inputCls = 'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none';
const KIND: Record<string, string> = { DAY_BEFORE: 'Day before', DUE_TODAY: 'On the day', OVERDUE: 'Overdue' };
const STATUS_CLS: Record<string, string> = {
  DELIVERED: 'bg-emerald-100 text-emerald-700', SENT: 'bg-sky-100 text-sky-800', QUEUED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-red-100 text-red-700', CANCELLED: 'bg-slate-100 text-slate-500', EXPIRED: 'bg-slate-100 text-slate-500',
};

const fmt = (sql: string) => {
  const d = new Date(sql.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? sql : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

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

export const SmsPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', apiKey: '', senderId: '' });
  const [testTo, setTestTo] = useState('');
  const [run, setRun] = useState<RunSummary | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const l = await api<{ items: LogItem[]; counts: Record<string, number> }>('/api/sms/log');
      setLog(l.items);
      setCounts(l.counts);
      if (isAdmin) {
        const s = await api<Settings>('/api/sms/settings');
        setSettings(s);
        setForm((f) => ({ ...f, username: s.username, senderId: s.senderId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm space-x-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  const callbackUrl = settings ? `${window.location.origin}/api/sms/delivery?token=${settings.callbackToken}` : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">SMS reminders</h1>
        <p className="text-sm text-slate-500">
          Every morning the app texts caregivers who agreed to reminders: the day before a follow-up, on the day, and once more if the visit is missed.
          Messages never mention the condition.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          The same account also texts password reset codes (“Forgot password”). Those work even while reminders are switched off, cost the same as a reminder, and are limited to 200 a day.
        </p>
      </div>

      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {isAdmin && settings && (
        <>
          <div className="bg-white rounded-xl shadow-md p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">Africa’s Talking account</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                {settings.enabled ? 'REMINDERS ON' : settings.configured ? 'REMINDERS OFF' : 'NOT SET UP'}
              </span>
              {settings.sandbox && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">SANDBOX (test mode)</span>}
            </div>
            {settings.credentialsFrom === 'env' ? (
              <p className="text-sm text-slate-600">Username and API key come from your Cloudflare secrets.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Username</label>
                  <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} placeholder="your Africa's Talking username" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">API key</label>
                  <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className={inputCls} placeholder={settings.hasApiKey ? 'Saved. Leave blank to keep it' : 'paste your API key'} autoComplete="off" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-600">Sender ID (optional)</label>
              <input value={form.senderId} onChange={(e) => setForm({ ...form, senderId: e.target.value })} className={inputCls} placeholder="e.g. CareLink (must be approved by Africa's Talking)" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => act(async () => {
                  await api('/api/sms/settings', 'POST', { ...(settings.credentialsFrom === 'env' ? {} : { username: form.username, apiKey: form.apiKey }), senderId: form.senderId });
                  setForm((f) => ({ ...f, apiKey: '' }));
                  await load();
                  return 'Saved.';
                })}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
              >
                Save
              </button>
              <button
                disabled={busy || !settings.configured}
                onClick={() => act(async () => {
                  await api('/api/sms/settings', 'POST', { enabled: !settings.enabled });
                  await load();
                  return settings.enabled ? 'Reminders turned off.' : 'Reminders turned on. They will be sent each morning.';
                })}
                className="border border-slate-300 hover:bg-slate-50 disabled:opacity-50 font-bold px-5 py-2.5 rounded-xl"
              >
                {settings.enabled ? 'Turn reminders off' : 'Turn reminders on'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
            <h2 className="text-lg font-black text-slate-900">Delivery reports</h2>
            <p className="text-sm text-slate-600">
              To see whether messages arrived, paste this address in the Africa’s Talking dashboard under <b>SMS, then Callback URLs, then Delivery Reports</b>. Keep it private.
            </p>
            <div className="flex gap-2">
              <input readOnly value={callbackUrl} className={inputCls + ' font-mono text-xs'} onFocus={(e) => e.currentTarget.select()} />
              <button
                onClick={() => { void navigator.clipboard?.writeText(callbackUrl); setNotice('Address copied.'); }}
                className="mt-1 border border-slate-300 rounded-xl px-3 hover:bg-slate-50"
                aria-label="Copy address"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
            <h2 className="text-lg font-black text-slate-900">Send a test message</h2>
            <div className="flex gap-2">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className={inputCls} placeholder="Your own number, e.g. 0244123456" type="tel" />
              <button
                disabled={busy || !settings.configured}
                onClick={() => act(async () => {
                  const r = await api<{ status?: string; cost?: string }>('/api/sms/test', 'POST', { to: testTo });
                  return `Accepted by Africa’s Talking${r.status ? ` (${r.status})` : ''}${r.cost ? `, cost ${r.cost}` : ''}. Check the phone.`;
                })}
                className="mt-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-5 rounded-xl whitespace-nowrap"
              >
                Send test
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
            <h2 className="text-lg font-black text-slate-900">Today’s reminders</h2>
            <p className="text-sm text-slate-600">Preview who is due without sending anything, or send them now instead of waiting for the morning run.</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => act(async () => { setRun((await api<{ summary: RunSummary }>('/api/sms/run', 'POST', { dryRun: true })).summary); })} className="border border-slate-300 hover:bg-slate-50 font-bold px-5 py-2.5 rounded-xl">
                Preview
              </button>
              <button
                disabled={busy || !settings.enabled}
                onClick={() => {
                  if (!window.confirm('Send all due reminders now? Real messages will be sent and charged to your Africa’s Talking account.')) return;
                  void act(async () => {
                    const s = (await api<{ summary: RunSummary }>('/api/sms/run', 'POST', { dryRun: false })).summary;
                    setRun(s);
                    await load();
                    return s.skipped ?? `Sent ${s.sent}, failed ${s.failed}${s.remaining ? `, ${s.remaining} still waiting (they go out in the next run)` : ''}.`;
                  });
                }}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl"
              >
                Send now
              </button>
            </div>
            {run && (
              <div className="text-sm border border-slate-200 rounded-xl p-3 space-y-1">
                <p className="font-bold text-slate-800">{run.dryRun ? 'Preview' : 'Result'} for {run.today}: {run.due.length} reminder{run.due.length === 1 ? '' : 's'} due</p>
                {run.due.length === 0 && <p className="text-slate-500 text-xs">Nobody is due. A child needs consent ticked and a follow-up date set.</p>}
                {run.due.map((d, i) => (
                  <p key={i} className="text-xs text-slate-600">{d.firstName}: {KIND[d.kind] ?? d.kind} for {d.forDate} <span className="text-slate-400">({d.state})</span></p>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">Message log</h2>
          <p className="text-xs text-slate-500">
            Last 30 days: {Object.keys(counts).length === 0 ? 'nothing yet' : Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}
          </p>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b">
                <tr><th className="p-2">When</th><th className="p-2">Child</th><th className="p-2">Type</th><th className="p-2">Phone</th><th className="p-2">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {log.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2 text-slate-600 whitespace-nowrap">{fmt(m.createdAt)}</td>
                    <td className="p-2 font-bold text-slate-900">{m.child}{m.worker ? <span className="block font-normal text-slate-400">{m.worker}</span> : null}</td>
                    <td className="p-2 text-slate-600">{KIND[m.kind] ?? m.kind}<span className="block text-slate-400">for {m.forDate}</span></td>
                    <td className="p-2 text-slate-600 whitespace-nowrap">{m.phone}</td>
                    <td className="p-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[m.status] ?? 'bg-slate-100 text-slate-600'}`}>{m.status}</span>
                      {m.error && <span className="block text-red-600 mt-0.5">{m.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
