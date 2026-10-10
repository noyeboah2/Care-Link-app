import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Phone, Loader2, CalendarClock, Trash2, Pencil, ClipboardCheck, MapPin, CloudOff, MessageSquare } from 'lucide-react';
import type { CaseSummary } from '@/lib/offline';
import { AREAS, areaLabel } from '@/lib/hospitals';
import { ReferralCard } from '@/components/ReferralCard';
import { useI18n } from '@/lib/i18n';
import { msg, RISK_LABEL } from '@/lib/msg';

interface Detail {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  caregiverPhone: string;
  followUpDate: string | null;
  area: string | null;
  smsConsent?: boolean;
  smsConsentAt?: string | null;
  createdAt: string;
  ownerName: string | null;
}
interface ScreeningRow {
  id: string;
  riskLevel: 'HIGH_RISK' | 'LOW_RISK';
  score: number;
  createdAt: string;
  recordedBy: string | null;
}

const inputCls =
  'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-brand focus:outline-none';

const fmtDateTime = (sqlUtc: string) => {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? sqlUtc
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const CaseDetails: React.FC<{
  caseId: string;
  onClose: () => void;
  onChanged: () => void;
  onStartScreening?: (child: { id: string; name: string; area?: string | null }) => void;
  summary?: CaseSummary; // what the phone already knows, used when offline
  localOnly?: boolean; // case exists only on this phone so far
}> = ({ caseId, onClose, onChanged, onStartScreening, summary, localOnly }) => {
  const { t } = useI18n();
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const localOnlyRef = useRef(localOnly);
  localOnlyRef.current = localOnly;
  const [offlineMode, setOfflineMode] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<ScreeningRow[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', age: '', gender: 'Male', caregiverPhone: '', area: '' });
  const [followUp, setFollowUp] = useState('');

  const load = useCallback(async () => {
    setError('');
    const useSummary = () => {
      const sm = summaryRef.current;
      if (!sm) return false;
      setDetail({
        id: sm.id, fullName: sm.fullName, age: sm.age, gender: sm.gender, caregiverPhone: sm.caregiverPhone,
        followUpDate: sm.followUpDate, area: sm.area, createdAt: '', ownerName: null,
      });
      setHistory([]);
      setCanDelete(false);
      setOfflineMode(true);
      setLoading(false);
      return true;
    };
    if (localOnlyRef.current && useSummary()) return;
    try {
      const res = await fetch(`/api/children/${caseId}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; child?: Detail; screenings?: ScreeningRow[]; canDelete?: boolean; error?: string };
      if (!res.ok || !data.success || !data.child) throw new Error(data.error || msg('Could not load the case'));
      setOfflineMode(false);
      setDetail(data.child);
      setHistory(data.screenings ?? []);
      setCanDelete(data.canDelete === true);
      setFollowUp(data.child.followUpDate ?? '');
      setForm({ fullName: data.child.fullName, age: String(data.child.age), gender: data.child.gender, caregiverPhone: data.child.caregiverPhone, area: data.child.area ?? '' });
    } catch (err) {
      // No signal: show what this phone already knows about the child.
      if (err instanceof TypeError && useSummary()) return;
      setError(err instanceof Error ? err.message : msg('Could not load the case'));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/children/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { window.location.reload(); return false; }
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || msg('Could not save'));
      setNotice(okMessage);
      await load();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Could not save'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    const ok = await patch({ fullName: form.fullName, age: Number(form.age), gender: form.gender, caregiverPhone: form.caregiverPhone, ...(form.area ? { area: form.area } : {}) }, msg('Details updated.'));
    if (ok) setEditing(false);
  };

  const remove = async () => {
    if (!detail) return;
    if (!window.confirm(t('Delete {name} and all their screening history? This cannot be undone.', { name: detail.fullName }))) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/children/${caseId}`, { method: 'DELETE' });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || msg('Could not delete'));
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Could not delete'));
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const latest = history[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-black text-slate-900">{t('Case details')}</h2>
          <button onClick={onClose} aria-label={t('Close')} className="p-1 text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-500 text-sm space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('Loading...')}</span>
          </div>
        )}

        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{t(error)}</p>}
        {offlineMode && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2 flex items-start space-x-2">
            <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {localOnlyRef.current
                ? t('This case is saved on your phone and has not uploaded yet. You can still screen the child. Editing opens once it uploads.')
                : t('You are offline. Showing saved information. History, editing and deleting need internet.')}
            </span>
          </div>
        )}
        {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{t(notice)}</p>}

        {detail && (
          <>
            {!editing ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xl font-black text-slate-900">{detail.fullName}</p>
                    <p className="text-sm text-slate-500">{t(detail.gender)}, {t('{n} years old', { n: detail.age })}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      !latest ? 'bg-slate-100 text-slate-600' : latest.riskLevel === 'HIGH_RISK' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {t(!latest ? RISK_LABEL.PENDING : RISK_LABEL[latest.riskLevel])}
                  </span>
                </div>
                <a href={`tel:${detail.caregiverPhone}`} className="inline-flex items-center space-x-2 text-sm font-semibold text-brand hover:underline">
                  <Phone className="w-4 h-4" />
                  <span>{t('Call caregiver: {phone}', { phone: detail.caregiverPhone })}</span>
                </a>
                <p className="flex items-center space-x-1.5 text-sm text-slate-600">
                  <MapPin className="w-4 h-4" />
                  <span>{areaLabel(detail.area) ?? t('Location not set (tap Edit details to add it)')}</span>
                </p>
                {detail.ownerName && <p className="text-xs text-slate-500">{t('Registered by {name}', { name: detail.ownerName })}</p>}
                {!offlineMode && <button onClick={() => { setEditing(true); setNotice(''); }} className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{t('Edit details')}</span>
                </button>}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">{t('Full name')}</label>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">{t('Age')}</label>
                    <input type="number" min={0} max={18} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">{t('Gender')}</label>
                    <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={inputCls}>
                      <option value="Male">{t('Male')}</option>
                      <option value="Female">{t('Female')}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">{t('Caregiver phone')}</label>
                  <input type="tel" value={form.caregiverPhone} onChange={(e) => setForm({ ...form, caregiverPhone: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">{t('Where does the child live?')}</label>
                  <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={inputCls}>
                    <option value="">{detail.area ? t('Keep current location') : t('Choose a location...')}</option>
                    {AREAS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveDetails} disabled={busy} className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-bold py-2.5 rounded-xl">
                    {busy ? t('Saving...') : t('Save')}
                  </button>
                  <button onClick={() => { setEditing(false); void load(); }} disabled={busy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl">{t('Cancel')}</button>
                </div>
              </div>
            )}

            {!offlineMode && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center space-x-2 text-sm font-bold text-slate-800">
                <CalendarClock className="w-4 h-4" />
                <span>{t('Next follow-up')}</span>
                {detail.followUpDate && detail.followUpDate < today && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{t('OVERDUE')}</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {detail.followUpDate ? t('Set for {date}', { date: fmtDate(detail.followUpDate) }) : t('No follow-up date set')}
              </p>
              <div className="flex gap-2">
                <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                <button
                  onClick={() => patch({ followUpDate: followUp || null }, followUp ? msg('Follow-up date saved.') : msg('Follow-up date cleared.'))}
                  disabled={busy}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-bold px-4 rounded-xl"
                >{t('Save')}</button>
              </div>
            </div>
            )}

            {!offlineMode && (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center space-x-2 text-sm font-bold text-slate-800">
                  <MessageSquare className="w-4 h-4" />
                  <span>{t('SMS reminders')}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${detail.smsConsent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {detail.smsConsent ? t('ON') : t('OFF')}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {detail.smsConsent
                    ? detail.smsConsentAt
                      ? t('Caregiver agreed on {date}. Reminders are sent the day before, on the day, and if the visit is missed. They need a follow-up date.', { date: fmtDate(detail.smsConsentAt.slice(0, 10)) })
                      : t('Caregiver agreed. Reminders are sent the day before, on the day, and if the visit is missed. They need a follow-up date.')
                    : t('Off. The caregiver has not agreed to SMS reminders.')}
                </p>
                <button
                  onClick={() => {
                    const turnOn = !detail.smsConsent;
                    const ok = window.confirm(turnOn
                      ? t('Confirm that the caregiver has agreed to receive SMS reminders about this child’s visits.')
                      : t('Stop SMS reminders for this child?'));
                    if (ok) void patch({ smsConsent: turnOn }, turnOn ? msg('SMS reminders turned on.') : msg('SMS reminders turned off.'));
                  }}
                  disabled={busy}
                  className="text-xs font-bold border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-60"
                >
                  {detail.smsConsent ? t('Turn off reminders') : t('Caregiver agrees: turn on')}
                </button>
              </div>
            )}

            {onStartScreening && (
              <button
                onClick={() => onStartScreening({ id: detail.id, name: detail.fullName, area: detail.area })}
                className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl flex items-center justify-center space-x-2"
              >
                <ClipboardCheck className="w-5 h-5" />
                <span>{(offlineMode ? summaryRef.current?.lastRisk !== 'PENDING' : history.length > 0) ? t('Screen again') : t('Start screening')}</span>
              </button>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-900">{t('Screening history')}</h3>
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">{t('No screenings yet.')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {history.map((s) => (
                    <li key={s.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{fmtDateTime(s.createdAt)}</p>
                        <p className="text-xs text-slate-500">{t('Score {n}', { n: s.score })}{s.recordedBy ? ` · ${t('by {name}', { name: s.recordedBy })}` : ''}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.riskLevel === 'HIGH_RISK' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {t(RISK_LABEL[s.riskLevel])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(offlineMode ? summaryRef.current?.lastRisk === 'HIGH_RISK' : latest?.riskLevel === 'HIGH_RISK') && (
              <div className="space-y-2">
                <h3 className="text-sm font-black text-slate-900">{t('Referral hospital')}</h3>
                <ReferralCard areaId={detail.area} />
              </div>
            )}

            {canDelete && (
              <button onClick={remove} disabled={busy} className="w-full text-red-700 hover:bg-red-50 border border-red-200 font-bold py-2.5 rounded-xl flex items-center justify-center space-x-2 text-sm">
                <Trash2 className="w-4 h-4" />
                <span>{t('Delete this case')}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
