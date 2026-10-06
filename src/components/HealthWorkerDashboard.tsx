import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell, UserPlus, Search,
  Clock, ChevronRight, Phone, Shield, X, Loader2, CloudOff
} from 'lucide-react';
import { CaseDetails } from '@/components/CaseDetails';
import { SyncBadge, SyncIssues } from '@/components/SyncStatus';
import { AREAS } from '@/lib/hospitals';
import { loadCases as loadCachedCases, saveCases, submitNewChild, SessionExpiredError, type CaseSummary } from '@/lib/offline';
import { applyQueue, useOfflineStatus } from '@/lib/useOffline';
import { useI18n } from '@/lib/i18n';
import { msg, RISK_LABEL } from '@/lib/msg';

type ChildSummary = CaseSummary;

interface AlertItem {
  id: string;
  name: string;
  kind: 'HIGH_RISK' | 'OVERDUE' | 'DUE_TODAY';
  detail: string;
  vars?: Record<string, number>;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

// Worked out on the phone from the case list, so alerts also work offline.
function buildAlerts(children: ChildSummary[], today: string): AlertItem[] {
  const items: AlertItem[] = [];
  for (const c of children) {
    if (c.lastRisk === 'HIGH_RISK') items.push({ id: c.id, name: c.fullName, kind: 'HIGH_RISK', detail: msg('High risk. Needs referral follow-up') });
  }
  for (const c of children) {
    if (c.followUpDate && c.followUpDate < today) {
      const d = daysBetween(c.followUpDate, today);
      items.push({ id: c.id, name: c.fullName, kind: 'OVERDUE', detail: d === 1 ? msg('Follow-up overdue by 1 day') : msg('Follow-up overdue by {d} days'), vars: { d } });
    }
  }
  for (const c of children) {
    if (c.followUpDate === today) items.push({ id: c.id, name: c.fullName, kind: 'DUE_TODAY', detail: msg('Follow-up due today') });
  }
  return items.slice(0, 30);
}

const fmtSaved = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'earlier' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const HealthWorkerDashboard: React.FC<{ userId: string; onStartScreening: (child: { id: string; name: string; area?: string | null }) => void }> = ({ userId, onStartScreening }) => {
  const { t } = useI18n();
  const status = useOfflineStatus(userId);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'assigned' | 'upcoming' | 'overdue'>('assigned');
  const [serverChildren, setServerChildren] = useState<ChildSummary[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ fullName: '', age: '', gender: 'Male', caregiverPhone: '', area: '', smsConsent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAlerts, setShowAlerts] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  // Saved list + anything still waiting to upload.
  const children = useMemo(() => applyQueue(serverChildren, status.pending), [serverChildren, status.pending]);
  const stats = useMemo(
    () => ({
      totalActive: children.length,
      followUpsToday: children.filter((c) => c.followUpDate === today).length,
      pendingScreenings: children.filter((c) => c.lastRisk === 'PENDING').length,
      crisisAlerts: children.filter((c) => c.lastRisk === 'HIGH_RISK').length,
    }),
    [children, today],
  );
  const alerts = useMemo(() => buildAlerts(children, today), [children, today]);
  const pendingCreateIds = useMemo(
    () => new Set(status.pending.filter((q) => q.type === 'createChild').map((q) => String(q.payload.id))),
    [status.pending],
  );

  const loadCases = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/children', { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; children?: ChildSummary[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || msg('Could not load cases'));
      setServerChildren(data.children ?? []);
      setCachedAt(null);
      void saveCases(userId, data.children ?? []).catch(() => undefined);
    } catch (err) {
      // No signal or the server is unreachable: use the list saved on this phone.
      const cached = await loadCachedCases(userId).catch(() => null);
      if (cached) {
        setServerChildren(cached.cases);
        setCachedAt(cached.savedAt ?? 'earlier');
      } else {
        setLoadError(
          err instanceof TypeError
            ? msg('You are offline and no saved list is on this phone yet. Connect to the internet once to download your cases.')
            : err instanceof Error ? err.message : msg('Could not load cases'),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadCases();
  }, [loadCases, status.syncedTick, status.online]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const openModal = () => {
    setForm({ fullName: '', age: '', gender: 'Male', caregiverPhone: '', area: '', smsConsent: false });
    setErrors({});
    setSaveError('');
    setShowModal(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = msg("Enter the child's full name");
    const age = Number(form.age);
    if (form.age === '' || !Number.isInteger(age) || age < 0 || age > 18) e.age = msg('Enter an age from 0 to 18');
    if (!form.area) e.area = msg('Choose where the child lives');
    const phone = form.caregiverPhone.replace(/[\s-]/g, '');
    if (!/^(\+233|0)\d{9}$/.test(phone)) e.caregiverPhone = msg('Use a Ghana number, e.g. 0244123456');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveCase = async (startScreeningNow: boolean) => {
    if (!validate()) return;
    setSaving(true);
    setSaveError('');
    try {
      const { outcome, id } = await submitNewChild(userId, {
        fullName: form.fullName,
        age: Number(form.age),
        gender: form.gender,
        caregiverPhone: form.caregiverPhone,
        area: form.area,
        smsConsent: form.smsConsent,
      });
      setShowModal(false);
      if (outcome.status === 'queued') setNotice(msg('Saved on this phone. It will upload automatically when you are back online.'));
      if (startScreeningNow) {
        onStartScreening({ id, name: form.fullName.trim(), area: form.area });
      } else {
        await loadCases();
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) { window.location.reload(); return; }
      setSaveError(err instanceof Error ? err.message : msg('Could not save the case'));
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="font-black tracking-tight text-lg">{t('SCD Care Ghana')}</h1>
        </div>

        <div className="flex items-center space-x-3">
          <SyncBadge status={status} />

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
              <p className="text-sm font-black">{t('Alerts')}</p>
              <button onClick={() => setShowAlerts(false)} aria-label={t('Close alerts')} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {alerts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('No alerts. Everything is up to date.')}</p>
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
                        <span className="block text-xs text-slate-500">{t(a.detail, a.vars)}</span>
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
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t('Total Active Cases')}</span>
          <p className="text-2xl font-black text-white mt-1">{stats.totalActive}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t('Today\'s Follow-ups')}</span>
          <p className="text-2xl font-black text-emerald-400 mt-1">{stats.followUpsToday}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t('Pending Screenings')}</span>
          <p className="text-2xl font-black text-amber-400 mt-1">{stats.pendingScreenings}</p>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t('Crisis Alerts')}</span>
          <p className="text-2xl font-black text-red-500 mt-1">{stats.crisisAlerts}</p>
        </div>
      </section>

      <main className="p-4 space-y-4 flex-grow">
        {cachedAt && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2 text-xs flex items-start space-x-2">
            <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {cachedAt !== 'earlier'
                ? t('Showing the list saved on this phone ({when}). New cases and screenings are kept here and upload automatically.', { when: fmtSaved(cachedAt) })
                : t('Showing the list saved on this phone. New cases and screenings are kept here and upload automatically.')}
            </span>
          </div>
        )}
        {notice && (
          <div className="bg-sky-50 border border-sky-200 text-sky-900 rounded-xl px-3 py-2 text-xs font-semibold">{t(notice)}</div>
        )}
        <SyncIssues status={status} userId={userId} />

        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder={t('Search child name or phone...')}
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
              {t(tab === 'assigned' ? msg('Assigned') : tab === 'upcoming' ? msg('Upcoming') : msg('Overdue'))}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500 text-sm font-medium space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('Loading cases...')}</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm text-center space-y-2">
            <p className="font-semibold">{t(loadError)}</p>
            <button onClick={() => { setLoading(true); void loadCases(); }} className="underline font-bold">{t('Try again')}</button>
          </div>
        )}

        {!loading && !loadError && filteredChildren.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm space-y-1">
            <p className="font-bold text-slate-700">
              {t(children.length === 0 ? msg('No cases yet') : msg('No matching cases'))}
            </p>
            <p>
              {children.length === 0
                ? t('Tap “New Case” to add your first child.')
                : t('Try a different search or tab.')}
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
                    {t(child.gender)}, {t('{n}y', { n: child.age })}
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
                    {t(RISK_LABEL[child.lastRisk])}
                  </span>
                  {child.unsynced && (
                    <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <CloudOff className="w-3 h-3" />
                      <span>{t('Not uploaded yet')}</span>
                    </span>
                  )}
                  {child.followUpDate && child.followUpStatus !== 'OVERDUE' && (
                    <span className="text-[10px] font-semibold text-slate-500">{t('Follow-up {date}', { date: child.followUpDate })}</span>
                  )}
                  {child.followUpStatus === 'OVERDUE' && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{t('Overdue')}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => onStartScreening({ id: child.id, name: child.fullName, area: child.area })}
                className="ml-3 bg-blue-900 hover:bg-blue-800 text-white p-3 rounded-xl shadow-md active:scale-95 transition"
                aria-label={t('Start screening')} title={t('Start screening')}
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
        <span className="text-sm pr-1">{t('New Case')}</span>
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">{t('New Case')}</h2>
              <button onClick={() => setShowModal(false)} aria-label={t('Close')} className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">{t('Child\'s full name')}</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder={t('e.g. Kofi Addo')}
              />
              {errors.fullName && <p className="text-xs text-red-600 mt-1">{t(errors.fullName)}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">{t('Age (years)')}</label>
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                />
                {errors.age && <p className="text-xs text-red-600 mt-1">{t(errors.age)}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">{t('Gender')}</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                >
                  <option value="Male">{t('Male')}</option>
                  <option value="Female">{t('Female')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">{t('Caregiver phone')}</label>
              <input
                type="tel"
                value={form.caregiverPhone}
                onChange={(e) => setForm({ ...form, caregiverPhone: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="0244123456"
              />
              {errors.caregiverPhone && <p className="text-xs text-red-600 mt-1">{t(errors.caregiverPhone)}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">{t('Where does the child live?')}</label>
              <select
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
              >
                <option value="">{t('Choose a location...')}</option>
                {AREAS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">{t('Used to recommend the right referral hospital.')}</p>
              {errors.area && <p className="text-xs text-red-600 mt-1">{t(errors.area)}</p>}
            </div>

            <label className="flex items-start space-x-3 bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.smsConsent}
                onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })}
                className="mt-1 w-4 h-4 accent-blue-900"
              />
              <span className="text-xs text-slate-700">
                <span className="font-bold block">{t('The caregiver agrees to receive SMS reminders')}</span>{t('Tick only after asking the caregiver. Messages only mention the child’s first name and the visit date. They can stop any time by telling you.')}</span>
            </label>

            {saveError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{t(saveError)}</p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => saveCase(true)}
                disabled={saving}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl active:scale-95 transition"
              >
                {saving ? t('Saving...') : t('Save & Start Screening')}
              </button>
              <button
                onClick={() => saveCase(false)}
                disabled={saving}
                className="w-full bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 font-bold py-3 rounded-xl transition"
              >{t('Save Only')}</button>
            </div>
          </div>
        </div>
      )}
      {openCaseId && (
        <CaseDetails
          caseId={openCaseId}
          summary={children.find((c) => c.id === openCaseId)}
          localOnly={pendingCreateIds.has(openCaseId)}
          onClose={() => setOpenCaseId(null)}
          onChanged={() => void loadCases()}
          onStartScreening={(c) => { setOpenCaseId(null); onStartScreening(c); }}
        />
      )}
    </div>
  );
};
