import React, { useCallback, useEffect, useState } from 'react';
import { Users, AlertOctagon, ClipboardList, UserCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { CaseDetails } from '@/components/CaseDetails';

interface Summary {
  totals: {
    cases: number; screened: number; notScreened: number; screenings: number; highRisk: number;
    highRiskRate: number; overdue: number; dueToday: number; activeWorkers: number; unassigned: number;
  };
  workers: Array<{ id: string; name: string; cases: number; screened: number; highRisk: number; overdue: number }>;
  overdueList: Array<{ id: string; name: string; phone: string; workerName: string; followUpDate: string | null; daysOverdue: number }>;
  highRiskList: Array<{ id: string; name: string; phone: string; workerName: string; followUpDate: string | null }>;
  recentScreenings: Array<{ childId: string; childName: string; riskLevel: string; score: number; createdAt: string; workerName: string | null }>;
}

const fmtDateTime = (sqlUtc: string) => {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? sqlUtc
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

export const SupervisorDashboard: React.FC = () => {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openCase, setOpenCase] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/summary', { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const json = (await res.json()) as { success: boolean; error?: string } & Partial<Summary>;
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the summary');
      setData(json as Summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm space-x-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading summary...</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm text-center space-y-2">
        <p className="font-semibold">{error || 'Could not load the summary'}</p>
        <button onClick={() => { setLoading(true); void load(); }} className="underline font-bold">Try again</button>
      </div>
    );
  }

  const t = data.totals;
  const cards = [
    { label: 'Children registered', value: t.cases, sub: `${t.screenings} screening${t.screenings === 1 ? '' : 's'} recorded`, icon: <Users className="w-7 h-7" />, tone: 'bg-blue-100 text-blue-900', valueCls: 'text-slate-900' },
    { label: 'Screened', value: t.screened, sub: `${t.notScreened} not screened yet`, icon: <ClipboardList className="w-7 h-7" />, tone: 'bg-emerald-100 text-emerald-700', valueCls: 'text-emerald-700' },
    { label: 'High risk', value: t.highRisk, sub: t.screened ? `${t.highRiskRate}% of screened children` : 'No screenings yet', icon: <AlertOctagon className="w-7 h-7" />, tone: 'bg-red-100 text-red-600', valueCls: 'text-red-600' },
    { label: 'Overdue follow-ups', value: t.overdue, sub: `${t.dueToday} due today`, icon: <ShieldAlert className="w-7 h-7" />, tone: 'bg-amber-100 text-amber-700', valueCls: 'text-amber-700' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-300 pb-4 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Supervisor Portal</h1>
          <p className="text-sm text-slate-600 font-medium">
            Live figures from your team’s records · {t.activeWorkers} active health worker{t.activeWorkers === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={() => { setLoading(true); void load(); }} className="flex items-center space-x-1.5 text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-white">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-900">Overdue follow-ups</h3>
          </div>
          <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded">{t.overdue}</span>
        </div>
        {data.overdueList.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">Nothing overdue. Follow-up dates are set on each child’s case.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b">
                <tr>
                  <th className="p-3">Child</th><th className="p-3">Caregiver</th><th className="p-3">Health worker</th><th className="p-3">Overdue</th><th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.overdueList.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-bold text-slate-900">{r.name}</td>
                    <td className="p-3"><a href={`tel:${r.phone}`} className="text-blue-900 hover:underline">{r.phone}</a></td>
                    <td className="p-3 text-slate-600">{r.workerName}</td>
                    <td className="p-3 font-bold text-red-600">{r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'}</td>
                    <td className="p-3 text-right">
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
            <p className="text-sm text-slate-500">No high-risk children right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.highRiskList.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-bold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.workerName} · <a href={`tel:${r.phone}`} className="text-blue-900">{r.phone}</a></p>
                  </div>
                  <button onClick={() => setOpenCase(r.id)} className="text-xs font-bold border border-slate-300 rounded px-2.5 py-1 hover:bg-slate-50">Open</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 border-b pb-3">Cases per health worker</h3>
          {data.workers.length === 0 ? (
            <p className="text-sm text-slate-500">No health workers yet. Add them in the Team tab.</p>
          ) : (
            <div className="space-y-3">
              {data.workers.map((w) => {
                const max = Math.max(1, ...data.workers.map((x) => x.cases));
                return (
                  <div key={w.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>{w.name}</span>
                      <span>{w.cases} case{w.cases === 1 ? '' : 's'} · {w.screened} screened · {w.highRisk} high risk · {w.overdue} overdue</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-blue-900 h-full rounded-full" style={{ width: `${(w.cases / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {t.unassigned > 0 && <p className="text-xs text-slate-500">{t.unassigned} case{t.unassigned === 1 ? '' : 's'} with no registered worker (older records).</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div className="flex items-center space-x-2 border-b pb-3">
          <UserCheck className="w-5 h-5 text-slate-700" />
          <h3 className="font-bold text-slate-900">Recent screenings</h3>
        </div>
        {data.recentScreenings.length === 0 ? (
          <p className="text-sm text-slate-500">No screenings recorded yet.</p>
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

      {openCase && <CaseDetails caseId={openCase} onClose={() => setOpenCase(null)} onChanged={() => void load()} />}
    </div>
  );
};
