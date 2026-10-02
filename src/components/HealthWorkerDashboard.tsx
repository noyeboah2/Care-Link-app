import React, { useCallback, useEffect, useState } from 'react';
import {
  Wifi, WifiOff, Bell, UserPlus, Search,
  Clock, ChevronRight, Phone, Shield, X, Loader2
} from 'lucide-react';
import { CaseDetails } from '@/components/CaseDetails';
import { AREAS } from '@/lib/hospitals';

interface AlertItem {
  id: string;
  name: string;
  kind: 'HIGH_RISK' | 'OVERDUE' | 'DUE_TODAY';
  detail: string;
}

interface ChildSummary {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  caregiverPhone: string;
  followUpDate: string | null;
  area: string | null;
  lastRisk: 'HIGH_RISK' | 'LOW_RISK' | 'PENDING';
  followUpStatus: 'PENDING' | 'OVERDUE' | 'COMPLETED';
}

interface Stats {
  totalActive: number;
  followUpsToday: number;
  pendingScreenings: number;
  crisisAlerts: number;
}

const EMPTY_STATS: Stats = { totalActive: 0, followUpsToday: 0, pendingScreenings: 0, crisisAlerts: 0 };

export const HealthWorkerDashboard: React.FC<{ onStartScreening: (child: { id: string; name: string; area?: string | null }) => void }> = ({ onStartScreening }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'assigned' | 'upcoming' | 'overdue'>('assigned');
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ fullName: '', age: '', gender: 'Male', caregiverPhone: '', area: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { success: boolean; items?: AlertItem[] };
      if (data.success) setAlerts(data.items ?? []);
    } catch {
      /* alerts are optional; ignore network errors */
    }
  }, []);

  const loadCases = useCallback(async () => {
    setLoadError('');
    void loadAlerts();
    try {
      const res = await fetch('/api/children', { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; children?: ChildSummary[]; stats?: Stats; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load cases');
      setChildren(data.children ?? []);
      setStats(data.stats ?? EMPTY_STATS);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load cases');
    } finally {
      setLoading(false);
    }
  }, [loadAlerts]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const openModal = () => {
    setForm({ fullName: '', age: '', gender: 'Male', caregiverPhone: '', area: '' });
    setErrors({});
    setSaveError('');
    setShowModal(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = "Enter the child's full name";
    const age = Number(form.age);
    if (form.age === '' || !Number.isInteger(age) || age < 0 || age > 18) e.age = 'Enter an age from 0 to 18';
    if (!form.area) e.area = 'Choose where the child lives';
    const phone = form.caregiverPhone.replace(/[\s-]/g, '');
    if (!/^(\+233|0)\d{9}$/.test(phone)) e.caregiverPhone = 'Use a Ghana number, e.g. 0244123456';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveCase = async (startScreeningNow: boolean) => {
    if (!validate()) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          age: Number(form.age),
          gender: form.gender,
          caregiverPhone: form.caregiverPhone,
          area: form.area,
        }),
      });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; child?: ChildSummary; error?: string };
      if (!res.ok || !data.success || !data.child) throw new Error(data.error || 'Could not save the case');
      setShowModal(false);
      if (startScreeningNow) {
        onStartScreening({ id: data.child.id, name: data.child.fullName, area: data.child.area });
      } else {
        await loadCases();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the case');
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const filteredChildren = children.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.caregiverPhone.includes(searchQuery);
    const matchesTab =
      activeTab === 'assigned' ||
      (activeTab === 'overdue' && c.followUpStatus === 'OVERDUE') ||
      (activeTab === 'upcoming' && c.followUpDate !== null && c.followUpDate >= today);
    return matchesSearch && matchesTab;
  });

  return (
    <div className="bg-slate-50 pb-24 max-w-md mx-auto border-x border-slate-200 shadow-2xl flex flex-col min-h-[80vh]">
      <header className="bg-blue-900 text-white p-4 relative z-30 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <h1 className="font-black tracking-tight text-lg">SCD Care Ghana</h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center space-x-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'Online' : 'Offline Cache'}</span>
          </button>

          <button
            onClick={() => setShowAlerts((v) => !v)}
            className="relative p-1 text-slate-300 hover:text-white"
            aria-label={`Notifications (${alerts.length})`}
          >
            <Bell className="w-5 h-5" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </button>
        </div>

        {showAlerts && (
          <div className="absolute right-3 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-40">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <p className="text-sm font-black">Alerts</p>
              <button onClick={() => setShowAlerts(false)} aria-label="Close alerts" className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {alerts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No alerts. Everything is up to date.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {alerts.map((a, i) => (
                  <li key={`${a.id}-${a.kind}-${i}`}>
                    <button
                      onClick={() => { setShowAlerts(false); setOpenCaseId(a.id); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start space-x-3"
                    >
                      <span
                        className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          a.kind === 'HIGH_RISK' ? 'bg-red-500' : a.kind === 'OVERDUE' ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                      />
                      <span>
                        <span className="block text-sm font-bold">{a.name}</span>
                        <span className="block text-xs text-slate-500">{a.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>

      <section className="p-4 grid grid-cols-2 gap-3 bg-blue-950 text-white">
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Active Cases</span>
          <p className="text-2xl font-black text-white mt-1">{stats.totalActive}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Today's Follow-ups</span>
          <p className="text-2xl font-black text-emerald-400 mt-1">{stats.followUpsToday}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Pending Screenings</span>
          <p className="text-2xl font-black text-amber-400 mt-1">{stats.pendingScreenings}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Crisis Alerts</span>
          <p className="text-2xl font-black text-red-500 mt-1">{stats.crisisAlerts}</p>
        </div>
      </section>

      <main className="p-4 space-y-4 flex-grow">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Search child name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 pl-11 pr-4 py-3 rounded-xl text-sm font-medium shadow-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
          />
        </div>

        <div className="flex bg-slate-200 p-1 rounded-xl text-xs font-bold text-slate-600">
          {(['assigned', 'upcoming', 'overdue'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-center rounded-lg capitalize transition ${
                activeTab === tab ? 'bg-white text-blue-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              {tab === 'assigned' ? 'Assigned' : tab === 'upcoming' ? 'Upcoming' : 'Overdue'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500 text-sm font-medium space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading cases...</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm text-center space-y-2">
            <p className="font-semibold">{loadError}</p>
            <button onClick={() => { setLoading(true); void loadCases(); }} className="underline font-bold">
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && filteredChildren.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm space-y-1">
            <p className="font-bold text-slate-700">
              {children.length === 0 ? 'No cases yet' : 'No matching cases'}
            </p>
            <p>
              {children.length === 0
                ? 'Tap “New Case” to add your first child.'
                : 'Try a different search or tab.'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {filteredChildren.map((child) => (
            <div
              key={child.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-slate-300 transition"
            >
              <div
                className="space-y-1 flex-1 cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setOpenCaseId(child.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpenCaseId(child.id); }}
              >
                <div className="flex items-center space-x-2">
                  <h4 className="font-bold text-slate-900">{child.fullName}</h4>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                    {child.gender}, {child.age}y
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{child.caregiverPhone}</span>
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      child.lastRisk === 'HIGH_RISK'
                        ? 'bg-red-100 text-red-700'
                        : child.lastRisk === 'PENDING'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {child.lastRisk === 'PENDING' ? 'NOT SCREENED' : child.lastRisk.replace('_', ' ')}
                  </span>
                  {child.followUpDate && child.followUpStatus !== 'OVERDUE' && (
                    <span className="text-[10px] font-semibold text-slate-500">Follow-up {child.followUpDate}</span>
                  )}
                  {child.followUpStatus === 'OVERDUE' && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Overdue</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => onStartScreening({ id: child.id, name: child.fullName, area: child.area })}
                className="ml-3 bg-blue-900 hover:bg-blue-800 text-white p-3 rounded-xl shadow-md active:scale-95 transition"
                aria-label="Start screening" title="Start screening"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      </main>

      <button
        onClick={openModal}
        className="fixed bottom-6 right-6 bg-blue-900 text-white font-bold p-4 rounded-full shadow-2xl flex items-center space-x-2 hover:bg-blue-800 active:scale-90 transition z-40 border-2 border-white"
      >
        <UserPlus className="w-6 h-6" />
        <span className="text-sm pr-1">New Case</span>
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">New Case</h2>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">Child's full name</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="e.g. Kofi Addo"
              />
              {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Age (years)</label>
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                />
                {errors.age && <p className="text-xs text-red-600 mt-1">{errors.age}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                >
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">Caregiver phone</label>
              <input
                type="tel"
                value={form.caregiverPhone}
                onChange={(e) => setForm({ ...form, caregiverPhone: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="0244123456"
              />
              {errors.caregiverPhone && <p className="text-xs text-red-600 mt-1">{errors.caregiverPhone}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">Where does the child live?</label>
              <select
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
              >
                <option value="">Choose a location...</option>
                {AREAS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Used to recommend the right referral hospital.</p>
              {errors.area && <p className="text-xs text-red-600 mt-1">{errors.area}</p>}
            </div>

            {saveError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveError}</p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => saveCase(true)}
                disabled={saving}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl active:scale-95 transition"
              >
                {saving ? 'Saving...' : 'Save & Start Screening'}
              </button>
              <button
                onClick={() => saveCase(false)}
                disabled={saving}
                className="w-full bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 font-bold py-3 rounded-xl transition"
              >
                Save Only
              </button>
            </div>
          </div>
        </div>
      )}
      {openCaseId && (
        <CaseDetails
          caseId={openCaseId}
          onClose={() => setOpenCaseId(null)}
          onChanged={() => void loadCases()}
          onStartScreening={(c) => { setOpenCaseId(null); onStartScreening(c); }}
        />
      )}
    </div>
  );
};
