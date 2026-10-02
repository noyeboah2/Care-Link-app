'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HealthWorkerDashboard } from '@/components/HealthWorkerDashboard';
import { SupervisorDashboard } from '@/components/SupervisorDashboard';
import { ScdScreeningWizard } from '@/components/ScdScreeningWizard';
import { ChangePasswordScreen, LoginScreen, SetupScreen } from '@/components/AuthScreens';
import { UsersPanel } from '@/components/UsersPanel';
import { HospitalsDirectory } from '@/components/HospitalsDirectory';

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

type Tab = 'worker' | 'supervisor' | 'screening' | 'hospitals' | 'users';
const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', SUPERVISOR: 'Supervisor', WORKER: 'Health worker' };

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [activeTab, setActiveTab] = useState<Tab>('worker');
  const [screeningChild, setScreeningChild] = useState<{ id: string | null; name: string; area?: string | null }>({ id: null, name: 'New Child', area: null });

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = (await res.json()) as {
        success: boolean;
        user?: User | null;
        needsSetup?: boolean;
        setupEnabled?: boolean;
      };
      if (!res.ok || !data.success) throw new Error('Could not check sign-in');
      if (data.user) setAuth({ status: 'signedIn', user: data.user });
      else if (data.needsSetup) setAuth({ status: 'setup', setupEnabled: data.setupEnabled === true });
      else setAuth({ status: 'signedOut' });
    } catch {
      setAuth({ status: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setActiveTab('worker');
      setAuth({ status: 'signedOut' });
      void refreshAuth();
    }
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
          <p className="text-sm text-slate-700">{auth.message}</p>
          <button onClick={() => { setAuth({ status: 'loading' }); void refreshAuth(); }} className="bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (auth.status === 'setup') return <SetupScreen setupEnabled={auth.setupEnabled} onDone={refreshAuth} />;
  if (auth.status === 'signedOut') return <LoginScreen onDone={refreshAuth} />;

  const user = auth.user;
  if (user.mustChange) return <ChangePasswordScreen onDone={refreshAuth} onSignOut={signOut} />;

  const canSeeAll = user.role === 'ADMIN' || user.role === 'SUPERVISOR';
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'worker', label: 'Worker Dashboard' },
    { id: 'screening', label: 'Screening Wizard' },
    { id: 'hospitals', label: 'Hospitals' },
    ...(canSeeAll ? [{ id: 'supervisor' as Tab, label: 'Supervisor Portal' }] : []),
    ...(user.role === 'ADMIN' ? [{ id: 'users' as Tab, label: 'Team' }] : []),
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-emerald-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="bg-white text-emerald-700 font-bold text-xl px-2.5 py-1 rounded-md shadow-sm">CareLink</div>
            <span className="text-emerald-100 font-medium text-sm hidden lg:inline">SCD Screening & Management Platform (Ghana)</span>
          </div>

          <nav className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === t.id ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-600 text-emerald-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-3 text-sm">
            <div className="text-right leading-tight">
              <p className="font-semibold">{user.name}</p>
              <p className="text-xs text-emerald-100">{ROLE_LABEL[user.role]}</p>
            </div>
            <button onClick={signOut} className="bg-emerald-900 hover:bg-emerald-950 px-3 py-1.5 rounded-md font-medium">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'worker' && <HealthWorkerDashboard onStartScreening={startScreening} />}
        {activeTab === 'screening' && (
          <div className="bg-white p-6 rounded-xl shadow-md max-w-3xl mx-auto">
            <ScdScreeningWizard
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
        {activeTab === 'users' && user.role === 'ADMIN' && <UsersPanel currentUserId={user.id} />}
      </div>
    </main>
  );
}
