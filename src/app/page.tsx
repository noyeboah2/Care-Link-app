'use client';

import React, { useState } from 'react';
import { HealthWorkerDashboard } from '@/components/HealthWorkerDashboard';
import { SupervisorDashboard } from '@/components/SupervisorDashboard';
import { ScdScreeningWizard } from '@/components/ScdScreeningWizard';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'worker' | 'supervisor' | 'screening'>('worker');
  const [screeningChild, setScreeningChild] = useState<{ id: string | null; name: string }>({ id: null, name: 'New Child' });

  const startScreening = (child: { id: string; name: string }) => {
    setScreeningChild(child);
    setActiveTab('screening');
  };

  const completeScreening = () => {
    setActiveTab('worker');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header Navigation Bar */}
      <header className="bg-emerald-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white text-emerald-700 font-bold text-xl px-2.5 py-1 rounded-md shadow-sm">
              CareLink
            </div>
            <span className="text-emerald-100 font-medium text-sm hidden sm:inline">
              SCD Screening & Management Platform (Ghana)
            </span>
          </div>

          <nav className="flex space-x-2">
            <button
              onClick={() => setActiveTab('worker')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'worker' ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-600 text-emerald-100'
              }`}
            >
              Worker Dashboard
            </button>
            <button
              onClick={() => setActiveTab('screening')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'screening' ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-600 text-emerald-100'
              }`}
            >
              Screening Wizard
            </button>
            <button
              onClick={() => setActiveTab('supervisor')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'supervisor' ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-600 text-emerald-100'
              }`}
            >
              Supervisor Portal
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'worker' && <HealthWorkerDashboard onStartScreening={startScreening} />}
        {activeTab === 'screening' && (
          <div className="bg-white p-6 rounded-xl shadow-md max-w-3xl mx-auto">
            <ScdScreeningWizard key={screeningChild.id ?? 'none'} childName={screeningChild.name} childId={screeningChild.id} onComplete={completeScreening} />
          </div>
        )}
        {activeTab === 'supervisor' && <SupervisorDashboard />}
      </div>
    </main>
  );
}
