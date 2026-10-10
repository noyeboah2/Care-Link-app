import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, AlertOctagon, ClipboardList, UserCheck, ShieldAlert, Loader2, RefreshCw, Download, Printer, X } from 'lucide-react';
import { CaseDetails } from '@/components/CaseDetails';
import { AREAS } from '@/lib/hospitals';

interface Filters { workerId: string; area: string; risk: string; from: string; to: string }
interface Stat { cases: number; screened: number; highRisk: number; overdue: number }
interface Summary {
  totals: {
    cases: number; overallCases: number; screened: number; notScreened: number; screenings: number; highRisk: number;
    highRiskRate: number; overdue: number; dueToday: number; activeWorkers: number; unassigned: number;
  };
  workers: Array<{ id: string; name: string } & Stat>;
  areas: Array<{ id: string; label: string } & Stat>;
  options: { workers: Array<{ id: string; name: string }> };
  overdueList: Array<{ id: string; name: string; phone: string; workerName: string; followUpDate: string | null; daysOverdue: number }>;
  highRiskList: Array<{ id: string; name: string; phone: string; workerName: string; followUpDate: string | null }>;
  recentScreenings: Array<{ childId: string; childName: string; riskLevel: string; score: number; createdAt: string; workerName: string | null }>;
}

const EMPTY: Filters = { workerId: '', area: '', risk: '', from: '', to: '' };
const selectCls = 'mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:ring-2 focus:ring-brand focus:outline-none';

const fmtDateTime = (sqlUtc: string) => {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? sqlUtc
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};
const dayStr = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export const SupervisorDashboard: React.FC = () => {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [includePhone, setIncludePhone] = useState(false);
  const [hideNames, setHideNames] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    (Object.keys(filters) as Array<keyof Filters>).forEach((k) => { if (filters[k]) p.set(k, filters[k]); });
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setError('');
    setUpdating(true);
    try {
      const res = await fetch(`/api/summary?${qs}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const json = (await res.json()) as { success: boolean; error?: string } & Partial<Summary>;
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the summary');
      setData(json as Summary);
    } catch (err) {
      setError(err instanceof TypeError ? 'You are offline. The Supervisor Portal needs internet.' : err instanceof Error ? err.message : 'Could not load the summary');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [qs]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key: 'workerId' | 'area', value: string) => set({ [key]: filters[key] === value ? '' : value } as Partial<Filters>);
  const active = (Object.keys(filters) as Array<keyof Filters>).filter((k) => filters[k]).length;

  const exportUrl = (type: string) =>
    `/api/summary/export?type=${type}${qs ? '&' + qs : ''}${includePhone ? '&includePhone=1' : ''}${hideNames ? '&hideNames=1' : ''}`;

  const filterSummary = useMemo(() => {
    if (!data) return '';
    const parts: string[] = [];
    if (filters.workerId) parts.push(`Worker: ${filters.workerId === 'none' ? 'no registered worker' : data.options.workers.find((w) => w.id === filters.workerId)?.name ?? 'selected'}`);
    if (filters.area) parts.push(`Location: ${filters.area === 'unset' ? 'not set' : AREAS.find((a) => a.id === filters.area)?.label ?? filters.area}`);
    if (filters.risk) parts.push(`Risk: ${filters.risk.replace('_', ' ').toLowerCase()}`);
    if (filters.from || filters.to) parts.push(`Registered: ${filters.from || 'any time'} to ${filters.to || 'today'}`);
    return parts.length ? parts.join(' · ') : 'All children';
  }, [filters, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm space-x-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading summary...</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm text-center space-y-2">
        <p className="font-semibold">{error || 'Could not load the summary'}</p>
        <button onClick={() => { setLoading(true); void load(); }} className="underline font-bold">Try again</button>
      </div>
    );
  }

  const t = data.totals;
  const cards = [
    { label: 'Children', value: t.cases, sub: `${t.screenings} screening${t.screenings === 1 ? '' : 's'} recorded`, icon: <Users className="w-7 h-7" />, tone: 'bg-blue-100 text-brand', valueCls: 'text-slate-900' },
    { label: 'Screened', value: t.screened, sub: `${t.notScreened} not screened yet`, icon: <ClipboardList className="w-7 h-7" />, tone: 'bg-emerald-100 text-emerald-700', valueCls: 'text-emerald-700' },
    { label: 'High risk', value: t.highRisk, sub: t.screened ? `${t.highRiskRate}% of screened children` : 'No screenings yet', icon: <AlertOctagon className="w-7 h-7" />, tone: 'bg-red-100 text-red-600', valueCls: 'text-red-600' },
    { label: 'Overdue follow-ups', value: t.overdue, sub: `${t.dueToday} due today`, icon: <ShieldAlert className="w-7 h-7" />, tone: 'bg-amber-100 text-amber-700', valueCls: 'text-amber-700' },
  ];

  const bar = (label: string, s: Stat, max: number, selected: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className={`w-full text-left space-y-1 rounded-lg p-1.5 -m-1.5 print:p-0 ${selected ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'}`} title="Click to filter">
      <div className="flex justify-between gap-2 text-xs font-bold text-slate-700">
        <span>{label}</span>
        <span className="text-right">{s.cases} case{s.cases === 1 ? '' : 's'} · {s.screened} screened · {s.highRisk} high risk · {s.overdue} overdue</span>
      </div>
      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
        <div className="bg-brand h-full rounded-full" style={{ width: `${(s.cases / max) * 100}%` }} />
      </div>
    </button>
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between border-b border-slate-300 pb-4 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Supervisor Portal</h1>
          <p className="text-sm text-slate-600 font-medium">
            Live figures from your team’s records · {t.activeWorkers} active health worker{t.activeWorkers === 1 ? '' : 's'}
          </p>
          <p className="hidden print:block text-xs text-slate-500 mt-1">Report created {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {filterSummary}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex items-center space-x-1.5 text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-white">
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button onClick={() => void load()} className="flex items-center space-x-1.5 text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-white">
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3 print:hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600">Health worker</label>
            <select value={filters.workerId} onChange={(e) => set({ workerId: e.target.value })} className={selectCls}>
              <option value="">Everyone</option>
              {data.options.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value="none">No registered worker</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Location</label>
            <select value={filters.area} onChange={(e) => set({ area: e.target.value })} className={selectCls}>
              <option value="">Everywhere</option>
              {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              <option value="unset">Location not set</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Risk</label>
            <select value={filters.risk} onChange={(e) => set({ risk: e.target.value })} className={selectCls}>
              <option value="">All</option>
              <option value="HIGH_RISK">High risk</option>
              <option value="LOW_RISK">Low risk</option>
              <option value="NOT_SCREENED">Not screened</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Registered from</label>
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={selectCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Registered to</label>
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={selectCls} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-500">Quick dates:</span>
          {[
            ['Last 7 days', () => set({ from: dayStr(-6), to: '' })],
            ['Last 30 days', () => set({ from: dayStr(-29), to: '' })],
            ['This month', () => set({ from: dayStr(0).slice(0, 8) + '01', to: '' })],
          ].map(([label, fn]) => (
            <button key={label as string} onClick={fn as () => void} className="border border-slate-300 rounded-full px-3 py-1 font-semibold hover:bg-slate-50">{label as string}</button>
          ))}
          {active > 0 && (
            <button onClick={() => setFilters(EMPTY)} className="flex items-center space-x-1 text-red-700 font-bold px-2 py-1 hover:underline">
              <X className="w-3 h-3" />
              <span>Clear filters</span>
            </button>
          )}
          <span className="ml-auto text-slate-500 font-semibold">
            Showing {t.cases} of {t.overallCases} children (dates filter by when the child was registered)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
            <div className={`p-3 rounded-xl ${c.tone}`}>{c.icon}</div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">{c.label}</p>
              <h3 className={`text-2xl font-black ${c.valueCls}`}>{c.value}</h3>
              <span className="text-[11px] text-slate-400 font-bold">{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Exports */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3 print:hidden">
        <h3 className="font-bold text-slate-900">Export what you see</h3>
        <p className="text-xs text-slate-500">Spreadsheets (CSV) follow the filters above. Each export is recorded in the audit log.</p>
        <div className="flex flex-wrap gap-2">
          {[['report', 'Summary report', 'Counts only, no names'], ['cases', 'Case list', 'One row per child'], ['screenings', 'Screenings', 'One row per screening']].map(([type, label, hint]) => (
            <a key={type} href={exportUrl(type)} className="flex items-center space-x-2 border border-slate-300 rounded-xl px-4 py-2 hover:bg-slate-50">
              <Download className="w-4 h-4 text-slate-600" />
              <span>
                <span className="block text-sm font-bold text-slate-900">{label}</span>
                <span className="block text-[11px] text-slate-500">{hint}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
          <label className="flex items-center space-x-2"><input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)} className="accent-brand" /><span>Hide children’s names (for reports shared outside the team)</span></label>
          <label className="flex items-center space-x-2"><input type="checkbox" checked={includePhone} onChange={(e) => setIncludePhone(e.target.checked)} className="accent-brand" /><span>Include caregiver phone numbers</span></label>
        </div>
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Case lists and screenings can contain children’s names. Keep downloaded files on a locked device and don’t send them by email or chat.
        </p>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 border-b pb-3">By health worker</h3>
          {data.workers.length === 0 ? (
            <p className="text-sm text-slate-500">No health workers yet. Add them in the Team tab.</p>
          ) : (
            <div className="space-y-3">
              {data.workers.map((w) => bar(w.name, w, Math.max(1, ...data.workers.map((x) => x.cases)), filters.workerId === w.id, () => toggle('workerId', w.id)))}
            </div>
          )}
          {t.unassigned > 0 && <p className="text-xs text-slate-500">{t.unassigned} case{t.unassigned === 1 ? '' : 's'} here have no registered worker (older records).</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 border-b pb-3">By location</h3>
          {data.areas.length === 0 ? (
            <p className="text-sm text-slate-500">No cases match these filters.</p>
          ) : (
            <div className="space-y-3">
              {data.areas.map((a) => bar(a.label, a, Math.max(1, ...data.areas.map((x) => x.cases)), filters.area === a.id, () => toggle('area', a.id)))}
            </div>
          )}
        </div>
      </div>

      {/* Lists */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-900">Overdue follow-ups</h3>
          </div>
          <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded">{t.overdue}</span>
        </div>
        {data.overdueList.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">Nothing overdue{active ? ' for these filters' : ''}. Follow-up dates are set on each child’s case.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b">
                <tr>
                  <th className="p-3">Child</th><th className="p-3">Caregiver</th><th className="p-3">Health worker</th><th className="p-3">Overdue</th><th className="p-3 text-right print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.overdueList.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-bold text-slate-900">{r.name}</td>
                    <td className="p-3"><a href={`tel:${r.phone}`} className="text-brand hover:underline">{r.phone}</a></td>
                    <td className="p-3 text-slate-600">{r.workerName}</td>
                    <td className="p-3 font-bold text-red-600">{r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'}</td>
                    <td className="p-3 text-right print:hidden">
                      <button onClick={() => setOpenCase(r.id)} className="bg-slate-900 text-white px-2.5 py-1 rounded font-bold hover:bg-slate-800">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 border-b pb-3">High-risk children</h3>
          {data.highRiskList.length === 0 ? (
            <p className="text-sm text-slate-500">No high-risk children{active ? ' for these filters' : ' right now'}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.highRiskList.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-bold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.workerName} · <a href={`tel:${r.phone}`} className="text-brand">{r.phone}</a></p>
                  </div>
                  <button onClick={() => setOpenCase(r.id)} className="text-xs font-bold border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50 print:hidden">Open</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex items-center space-x-2 border-b pb-3">
            <UserCheck className="w-5 h-5 text-slate-700" />
            <h3 className="font-bold text-slate-900">Recent screenings</h3>
          </div>
          {data.recentScreenings.length === 0 ? (
            <p className="text-sm text-slate-500">No screenings recorded{active ? ' for these filters' : ' yet'}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentScreenings.map((s, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between text-sm gap-2">
                  <div>
                    <button onClick={() => setOpenCase(s.childId)} className="font-bold text-slate-900 hover:underline text-left">{s.childName}</button>
                    <p className="text-xs text-slate-500">{fmtDateTime(s.createdAt)}{s.workerName ? ` · ${s.workerName}` : ''} · score {s.score}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.riskLevel === 'HIGH_RISK' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {s.riskLevel.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {openCase && <CaseDetails caseId={openCase} onClose={() => setOpenCase(null)} onChanged={() => void load()} />}
    </div>
  );
};
