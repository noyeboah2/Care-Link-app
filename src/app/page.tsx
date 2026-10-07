'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HealthWorkerDashboard } from '@/components/HealthWorkerDashboard';
import { SupervisorDashboard } from '@/components/SupervisorDashboard';
import { ScdScreeningWizard } from '@/components/ScdScreeningWizard';
import { ChangePasswordScreen, ForgotPasswordScreen, LoginScreen, SetupScreen } from '@/components/AuthScreens';
import { UsersPanel } from '@/components/UsersPanel';
import { HospitalsDirectory } from '@/components/HospitalsDirectory';
import { SmsPanel } from '@/components/SmsPanel';
import { SecurityPanel } from '@/components/SecurityPanel';
import { clearCachedCases, getQueue } from '@/lib/offline';
import { useOnline } from '@/lib/useOffline';
import { LanguageSwitch, useI18n } from '@/lib/i18n';
import { msg } from '@/lib/msg';

type Role = 'ADMIN' | 'SUPERVISOR' | 'WORKER';
interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChange: boolean;
}
type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'setup'; setupEnabled: boolean }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

type Tab = 'worker' | 'supervisor' | 'screening' | 'hospitals' | 'sms' | 'security' | 'users';
const ROLE_LABEL: Record<Role, string> = { ADMIN: msg('Admin'), SUPERVISOR: msg('Supervisor'), WORKER: msg('Health worker') };

// Remembered on the phone so a signed-in worker can still open the app with no signal.
const CACHED_USER = 'cl_user';
const PENDING_LOGOUT = 'cl_pending_logout';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as User;
    return u && typeof u.id === 'string' && !u.mustChange ? u : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const { t, draft } = useI18n();
  const online = useOnline();
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [recovering, setRecovering] = useState(false);
  const [signInNotice, setSignInNotice] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('worker');
  const [screeningChild, setScreeningChild] = useState<{ id: string | null; name: string; area?: string | null }>({ id: null, name: 'New Child', area: null });

  const refreshAuth = useCallback(async () => {
    try {
      // If a sign-out could not reach the server (offline), finish it first.
      if (localStorage.getItem(PENDING_LOGOUT)) {
        try {
          const r = await fetch('/api/auth/logout', { method: 'POST' });
          if (r.ok) localStorage.removeItem(PENDING_LOGOUT);
        } catch {
          /* still offline */
        }
        if (localStorage.getItem(PENDING_LOGOUT)) {
          setAuth({ status: 'signedOut' });
          return;
        }
      }
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = (await res.json()) as {
        success: boolean;
        user?: User | null;
        needsSetup?: boolean;
        setupEnabled?: boolean;
      };
      if (!res.ok || !data.success) throw new Error(msg('Could not check sign-in'));
      if (data.user) {
        localStorage.setItem(CACHED_USER, JSON.stringify(data.user));
        setAuth({ status: 'signedIn', user: data.user });
      } else {
        localStorage.removeItem(CACHED_USER);
        if (data.needsSetup) setAuth({ status: 'setup', setupEnabled: data.setupEnabled === true });
        else setAuth({ status: 'signedOut' });
      }
    } catch {
      // No signal: let a worker who was already signed in keep working.
      const cached = readCachedUser();
      if (cached) setAuth({ status: 'signedIn', user: cached });
      else setAuth({ status: 'error', message: msg('No internet connection. You need to be online to sign in.') });
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // When the connection returns, confirm the session is still valid.
  useEffect(() => {
    const onBack = () => void refreshAuth();
    window.addEventListener('online', onBack);
    return () => window.removeEventListener('online', onBack);
  }, [refreshAuth]);

  const signOut = async () => {
    const uid = auth.status === 'signedIn' ? auth.user.id : null;
    if (uid) {
      const waiting = (await getQueue(uid).catch(() => [])).length;
      if (waiting > 0 && !window.confirm(
        waiting === 1
          ? t('You have 1 item not uploaded yet. It stays safely on this phone until you sign in again. Sign out anyway?')
          : t('You have {n} items not uploaded yet. They stay safely on this phone until you sign in again. Sign out anyway?', { n: waiting }),
      )) return;
    }
    let ok = false;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) localStorage.setItem(PENDING_LOGOUT, '1');
    localStorage.removeItem(CACHED_USER);
    if (uid) await clearCachedCases(uid).catch(() => undefined);
    setActiveTab('worker');
    setAuth({ status: 'signedOut' });
    if (ok) void refreshAuth();
  };

  const startScreening = (child: { id: string; name: string; area?: string | null }) => {
    setScreeningChild(child);
    setActiveTab('screening');
  };

  if (auth.status === 'loading') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </main>
    );
  }
  if (auth.status === 'error') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 text-center space-y-3 max-w-sm">
          <p className="text-sm text-slate-700">{t(auth.message)}</p>
          <button onClick={() => { setAuth({ status: 'loading' }); void refreshAuth(); }} className="bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl">{t('Try again')}</button>
        </div>
      </main>
    );
  }
  if (auth.status === 'setup') return <SetupScreen setupEnabled={auth.setupEnabled} onDone={refreshAuth} />;
  if (auth.status === 'signedOut') {
    return recovering ? (
      <ForgotPasswordScreen
        onBack={() => setRecovering(false)}
        onDone={() => { setRecovering(false); setSignInNotice(msg('Your password was changed. Sign in with your new password.')); }}
      />
    ) : (
      <LoginScreen onDone={refreshAuth} onForgot={() => { setSignInNotice(''); setRecovering(true); }} notice={signInNotice} />
    );
  }

  const user = auth.user;
  if (user.mustChange) return <ChangePasswordScreen onDone={refreshAuth} onSignOut={signOut} />;

  const canSeeAll = user.role === 'ADMIN' || user.role === 'SUPERVISOR';
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'worker', label: msg('Worker Dashboard') },
    { id: 'screening', label: msg('Screening Wizard') },
    { id: 'hospitals', label: msg('Hospitals') },
    ...(canSeeAll ? [{ id: 'supervisor' as Tab, label: 'Supervisor Portal' }] : []),
    ...(canSeeAll ? [{ id: 'sms' as Tab, label: 'SMS' }] : []),
    ...(user.role === 'ADMIN' ? [{ id: 'security' as Tab, label: 'Security' }, { id: 'users' as Tab, label: 'Team' }] : []),
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-emerald-700 text-white shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="bg-white text-emerald-700 font-bold text-xl px-2.5 py-1 rounded-md shadow-sm">{t('CareLink')}</div>
            <span className="text-emerald-100 font-medium text-sm hidden lg:inline">{t('SCD Screening & Management Platform (Ghana)')}</span>
          </div>

          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === tab.id ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-600 text-emerald-100'
                }`}
              >
                {t(tab.label)}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-3 text-sm">
            <LanguageSwitch dark />
            {!online && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-400 text-amber-950">{t('Offline')}</span>
            )}
            <div className="text-right leading-tight">
              <p className="font-semibold">{user.name}</p>
              <p className="text-xs text-emerald-100">{t(ROLE_LABEL[user.role])}</p>
            </div>
            <button onClick={signOut} className="bg-emerald-900 hover:bg-emerald-950 px-3 py-1.5 rounded-md font-medium">{t('Sign out')}</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'worker' && <HealthWorkerDashboard userId={user.id} onStartScreening={startScreening} />}
        {activeTab === 'screening' && (
          <div className="bg-white p-6 rounded-xl shadow-md max-w-3xl mx-auto">
            <ScdScreeningWizard
              userId={user.id}
              key={screeningChild.id ?? 'none'}
              childName={screeningChild.name}
              childId={screeningChild.id}
              childArea={screeningChild.area ?? null}
              onComplete={() => setActiveTab('worker')}
            />
          </div>
        )}
        {activeTab === 'hospitals' && <HospitalsDirectory />}
        {activeTab === 'supervisor' && canSeeAll && <SupervisorDashboard />}
        {activeTab === 'sms' && canSeeAll && <SmsPanel isAdmin={user.role === 'ADMIN'} />}
        {activeTab === 'security' && user.role === 'ADMIN' && <SecurityPanel />}
        {activeTab === 'users' && user.role === 'ADMIN' && <UsersPanel currentUserId={user.id} />}
      </div>
      {draft && (
        <p className="print:hidden text-center text-[11px] text-slate-500 px-4 pb-4">
          {t('Twi translation is a draft and may contain mistakes. Please tell your supervisor about any wording that is wrong.')}
        </p>
      )}
    </main>
  );
}
