import React, { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';

const inputCls =
  'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none';
const labelCls = 'text-xs font-bold text-slate-600';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-5">
        <div className="text-center space-y-1">
          <Shield className="w-10 h-10 text-emerald-700 mx-auto" />
          <h1 className="text-xl font-black text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { success: boolean; error?: string };
  if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong');
  return data;
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{message}</p>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition flex items-center justify-center space-x-2"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      <span>{children}</span>
    </button>
  );
}

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/login', { email, password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="CareLink SCD Ghana" subtitle="Sign in to continue">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
        <p className="text-xs text-slate-500 text-center">No account? Ask your administrator to add you.</p>
      </form>
    </Shell>
  );
}

export function SetupScreen({ setupEnabled, onDone }: { setupEnabled: boolean; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', setupCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/setup', form);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete setup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Set up CareLink" subtitle="Create the first administrator account">
      {!setupEnabled && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Setup is locked. In Cloudflare, add a secret named <b>SETUP_CODE</b> (at least 8 characters) to this Worker, then reload this page.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Your full name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Password (at least 8 characters)</label>
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Setup code</label>
          <input type="password" value={form.setupCode} onChange={(e) => setForm({ ...form, setupCode: e.target.value })} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Create administrator</SubmitButton>
      </form>
    </Shell>
  );
}

export function ChangePasswordScreen({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('The new passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/password', { currentPassword, newPassword });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Choose a new password" subtitle="Your administrator gave you a temporary password. Please replace it.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Temporary password</label>
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>New password (at least 8 characters)</label>
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Confirm new password</label>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Save new password</SubmitButton>
        <button type="button" onClick={onSignOut} className="w-full text-sm text-slate-500 underline">
          Sign out
        </button>
      </form>
    </Shell>
  );
}
