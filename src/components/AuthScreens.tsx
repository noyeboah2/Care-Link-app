import React, { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { LanguageSwitch, useI18n } from '@/lib/i18n';
import { msg } from '@/lib/msg';

const inputCls =
  'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-brand focus:outline-none';
const labelCls = 'text-xs font-bold text-slate-600';

// Wave shape that repeats exactly every `period`, so a sideways slide loops without a jump.
function wavePath(period: number, amplitude: number, baseline: number): string {
  const half = period / 2;
  let d = `M0,${baseline} Q${period / 4},${baseline - 2 * amplitude} ${half},${baseline}`;
  for (let x = period; x <= 2880; x += half) d += ` T${x},${baseline}`;
  return `${d} L2880,320 L0,320 Z`;
}

// Three layers from pale to deep blue (the deepest matches the buttons). Different sizes, speeds and
// directions make the water look alive. Each layer is two screen-widths wide and slides by one width.
const WAVE_LAYERS = [
  { period: 1440, amplitude: 34, baseline: 150, fill: '#5FA8D6', opacity: 0.45, drift: 'wave-drift-left', seconds: 30, swell: 9, delay: 0 },
  { period: 720, amplitude: 26, baseline: 205, fill: '#0075BA', opacity: 0.8, drift: 'wave-drift-right', seconds: 22, swell: 7, delay: -2 },
  { period: 480, amplitude: 18, baseline: 258, fill: '#0051AD', opacity: 1, drift: 'wave-drift-left', seconds: 15, swell: 6, delay: -4 },
].map((l) => ({ ...l, path: wavePath(l.period, l.amplitude, l.baseline) }));

// Sits behind the card along the bottom of the page and never blocks a tap.
function Waves() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-[30vh] min-h-[150px] max-h-[320px] overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {WAVE_LAYERS.map((l, i) => (
        <div key={i} className="wave-swell absolute inset-0" style={{ animationDuration: `${l.swell}s`, animationDelay: `${l.delay}s` }}>
          <svg
            className={`${l.drift} absolute top-0 left-0 h-full max-w-none`}
            style={{ width: '200%', animationDuration: `${l.seconds}s` }}
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
            focusable="false"
          >
            <path d={l.path} fill={l.fill} fillOpacity={l.opacity} />
          </svg>
        </div>
      ))}
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 flex items-center justify-center p-4">
      <Waves />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-5">
        <div className="flex justify-end"><LanguageSwitch /></div>
        <div className="text-center space-y-1">
          <Shield className="w-10 h-10 text-brand mx-auto" />
          <h1 className="text-xl font-black text-brand">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

async function postJson(url: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(msg('No internet connection. Please connect and try again.'));
  }
  const data = (await res.json()) as { success: boolean; error?: string };
  if (!res.ok || !data.success) throw new Error(data.error || msg('Something went wrong'));
  return data;
}

function ErrorBox({ message }: { message: string }) {
  const { t } = useI18n();
  if (!message) return null;
  return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{t(message)}</p>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-bold py-3 rounded-xl transition flex items-center justify-center space-x-2"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      <span>{children}</span>
    </button>
  );
}

export function LoginScreen({ onDone, onForgot, notice }: { onDone: () => void; onForgot?: () => void; notice?: string }) {
  const { t } = useI18n();
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
      setError(err instanceof Error ? err.message : msg('Could not sign in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={t('CareLink SCD Ghana')} subtitle={t('Sign in to continue')}>
      <form onSubmit={submit} className="space-y-4">
        {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{t(notice)}</p>}
        <div>
          <label className={labelCls}>{t('Email')}</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('Password')}</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>{t('Sign in')}</SubmitButton>
        {onForgot && (
          <button type="button" onClick={onForgot} className="w-full text-sm font-semibold text-brand underline">
            {t('Forgot password?')}
          </button>
        )}
        <p className="text-xs text-slate-500 text-center">{t('No account? Ask your administrator to add you.')}</p>
      </form>
    </Shell>
  );
}

export function SetupScreen({ setupEnabled, onDone }: { setupEnabled: boolean; onDone: () => void }) {
  const { t } = useI18n();
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
    <Shell title={t('Set up CareLink')} subtitle={t('Create the first administrator account')}>
      {!setupEnabled && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Setup is locked because no setup code has been configured yet. Open <b>/api/auth/me</b> on this site to see why, or ask the developer.</p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>{t('Your full name')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('Email')}</label>
          <input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('Password (at least 8 characters)')}</label>
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('Setup code')}</label>
          <input type="password" value={form.setupCode} onChange={(e) => setForm({ ...form, setupCode: e.target.value })} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>{t('Create administrator')}</SubmitButton>
      </form>
    </Shell>
  );
}

export function ChangePasswordScreen({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const { t } = useI18n();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(msg('The new passwords do not match'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/password', { currentPassword, newPassword });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Could not change the password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={t('Choose a new password')} subtitle={t('Your administrator gave you a temporary password. Please replace it.')}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>{t('Temporary password')}</label>
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('New password (at least 8 characters)')}</label>
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('Confirm new password')}</label>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>{t('Save new password')}</SubmitButton>
        <button type="button" onClick={onSignOut} className="w-full text-sm text-slate-500 underline">{t('Sign out')}</button>
      </form>
    </Shell>
  );
}

// "Forgot password": a 6-digit code is texted to the phone saved on the account, then a new password is chosen.
export function ForgotPasswordScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/forgot', { email });
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const resetNow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      setError(msg('The new passwords do not match'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/reset', { email, code, newPassword: pw });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={t('Reset your password')}
      subtitle={step === 'email'
        ? t('Enter your email and we will text a 6-digit code to the phone number saved on your account.')
        : t('If this email has a phone number saved, a code is on its way. If nothing arrives in a few minutes, ask your administrator to reset your password.')}
    >
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label className={labelCls}>{t('Email')}</label>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <ErrorBox message={error} />
          <SubmitButton busy={busy}>{t('Send code')}</SubmitButton>
          <button type="button" onClick={() => { setError(''); if (email) setStep('code'); else setError(msg('Enter a valid email address')); }} className="w-full text-sm text-slate-600 underline">
            {t('I already have a code')}
          </button>
          <button type="button" onClick={onBack} className="w-full text-sm text-slate-500 underline">{t('Back to sign in')}</button>
        </form>
      ) : (
        <form onSubmit={resetNow} className="space-y-4">
          <div>
            <label className={labelCls}>{t('6-digit code')}</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={inputCls + ' tracking-widest text-lg'}
            />
          </div>
          <div>
            <label className={labelCls}>{t('New password (at least 8 characters)')}</label>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('Confirm new password')}</label>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
          </div>
          <ErrorBox message={error} />
          <SubmitButton busy={busy}>{t('Reset password')}</SubmitButton>
          <button type="button" onClick={() => { setError(''); setCode(''); setStep('email'); }} className="w-full text-sm text-slate-600 underline">
            {t('Ask for a new code')}
          </button>
          <button type="button" onClick={onBack} className="w-full text-sm text-slate-500 underline">{t('Back to sign in')}</button>
        </form>
      )}
    </Shell>
  );
}
