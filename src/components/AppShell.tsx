'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Building2, ClipboardCheck, LayoutDashboard, LogOut, Menu, MessageSquare, ShieldCheck, Shield, Users, X } from 'lucide-react';
import { LanguageSwitch, useI18n } from '@/lib/i18n';
import { SyncBadge } from '@/components/SyncStatus';
import type { useOfflineStatus } from '@/lib/useOffline';

export interface NavTab {
  id: string;
  label: string; // English text; translated when shown
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  worker: LayoutDashboard,
  screening: ClipboardCheck,
  hospitals: Building2,
  guide: BookOpen,
  supervisor: BarChart3,
  sms: MessageSquare,
  security: ShieldCheck,
  users: Users,
};

// The signed-in frame: a blue bar across the top and a narrow menu down the left.
// On a phone the menu slides in over the page when the menu button is tapped.
export function AppShell({
  user,
  roleLabel,
  tabs,
  activeTab,
  onSelect,
  status,
  onSignOut,
  footerNote,
  children,
}: {
  user: { name: string };
  roleLabel: string;
  tabs: NavTab[];
  activeTab: string;
  onSelect: (id: string) => void;
  status: ReturnType<typeof useOfflineStatus>;
  onSignOut: () => void;
  footerNote?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Escape closes the phone menu, and the page behind it stops scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const current = tabs.find((x) => x.id === activeTab);
  const workTabs = tabs.filter((x) => ['worker', 'screening', 'hospitals', 'guide'].includes(x.id));
  const adminTabs = tabs.filter((x) => !['worker', 'screening', 'hospitals', 'guide'].includes(x.id));

  const item = (tab: NavTab) => {
    const Icon = ICONS[tab.id] ?? LayoutDashboard;
    const active = tab.id === activeTab;
    return (
      <li key={tab.id}>
        <button
          onClick={() => { onSelect(tab.id); setOpen(false); }}
          aria-current={active ? 'page' : undefined}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
            active ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          <span className="truncate">{t(tab.label)}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex">
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden print:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:z-20 print:hidden`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Shield className="w-7 h-7 text-brand" />
            <span className="text-lg font-black text-brand tracking-tight">{t('CareLink')}</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label={t('Close menu')} className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label={t('Main menu')} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          <ul className="space-y-1">{workTabs.map(item)}</ul>
          {adminTabs.length > 0 && (
            <ul className="space-y-1 pt-4 border-t border-slate-100">{adminTabs.map(item)}</ul>
          )}
        </nav>

        {/* On a phone the language, name and sign-out live here; on a computer they are in the blue bar. */}
        <div className="lg:hidden border-t border-slate-100 p-4 space-y-3 flex-shrink-0">
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500">{t(roleLabel)}</p>
          </div>
          <LanguageSwitch />
          <button onClick={onSignOut} className="w-full flex items-center justify-center space-x-2 border border-slate-300 rounded-lg py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <LogOut className="w-4 h-4" />
            <span>{t('Sign out')}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-brand text-white shadow-md print:hidden">
          <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <button
                onClick={() => setOpen(true)}
                aria-label={t('Open menu')}
                aria-expanded={open}
                aria-controls="app-sidebar"
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/15"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-base sm:text-lg font-bold truncate">{current ? t(current.label) : t('CareLink')}</h1>
            </div>

            <div className="flex items-center space-x-3 flex-shrink-0">
              <SyncBadge status={status} />
              <div className="hidden lg:flex items-center space-x-3">
                <LanguageSwitch dark />
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-white/80">{t(roleLabel)}</p>
                </div>
                <button onClick={onSignOut} className="flex items-center space-x-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg text-sm font-semibold">
                  <LogOut className="w-4 h-4" />
                  <span>{t('Sign out')}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-white">{children}</main>
        {footerNote}
      </div>
    </div>
  );
}
