import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type Role = 'ADMIN' | 'SUPERVISOR' | 'WORKER';
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChange: boolean;
}

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', SUPERVISOR: 'Supervisor', WORKER: 'Health worker' };
const inputCls =
  'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none';

export const UsersPanel: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'WORKER' as Role, password: '' });
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      if (res.status === 401) { window.location.reload(); return; }
      const data = (await res.json()) as { success: boolean; users?: UserRow[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load users');
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (url: string, method: string, body: unknown, okMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong');
      setNotice(okMessage);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await call('/api/users', 'POST', form, `Added ${form.name}. Give them the temporary password; they will choose their own at first sign-in.`);
    if (ok) setForm({ name: '', email: '', role: 'WORKER', password: '' });
  };

  const resetPassword = async (u: UserRow) => {
    const password = window.prompt(`Enter a temporary password for ${u.name} (at least 8 characters):`);
    if (!password) return;
    await call(`/api/users/${u.id}`, 'PATCH', { action: 'resetPassword', password }, `Password reset for ${u.name}. They must choose a new one at next sign-in.`);
  };

  const toggleActive = async (u: UserRow) => {
    const verb = u.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${u.active ? 'Deactivate' : 'Reactivate'} ${u.name}?`)) return;
    await call(`/api/users/${u.id}`, 'PATCH', { action: verb }, `${u.name} ${u.active ? 'deactivated' : 'reactivated'}.`);
  };

  const clearCases = async () => {
    if (!window.confirm('This permanently deletes ALL children and screenings. Users are kept. Continue?')) return;
    const ok = await call('/api/admin/clear-cases', 'POST', { confirm: confirmText }, 'All cases and screenings were deleted.');
    if (ok) setConfirmText('');
  };

  const changeRole = async (u: UserRow, role: Role) => {
    await call(`/api/users/${u.id}`, 'PATCH', { action: 'setRole', role }, `${u.name} is now ${ROLE_LABEL[role]}.`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-md p-5 space-y-4">
        <h2 className="text-lg font-black text-slate-900">Add a team member</h2>
        <form onSubmit={addUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600">Full name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
              <option value="WORKER">Health worker (sees own cases)</option>
              <option value="SUPERVISOR">Supervisor (sees all cases)</option>
              <option value="ADMIN">Admin (manages users)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Temporary password (8+ characters)</label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl transition">
              Add user
            </button>
          </div>
        </form>
      </div>

      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
        <h2 className="text-lg font-black text-slate-900">Team</h2>
        {loading ? (
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">
                    {u.name} {u.id === currentUserId && <span className="text-xs font-semibold text-slate-400">(you)</span>}
                    {!u.active && <span className="ml-2 text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">DEACTIVATED</span>}
                    {u.mustChange && <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">TEMP PASSWORD</span>}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={u.role}
                    disabled={busy || u.id === currentUserId}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-60"
                  >
                    <option value="WORKER">Health worker</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button onClick={() => resetPassword(u)} disabled={busy} className="border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 font-semibold">
                    Reset password
                  </button>
                  {u.id !== currentUserId && (
                    <button onClick={() => toggleActive(u)} disabled={busy} className="border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 font-semibold">
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 space-y-3 border border-red-200">
        <h2 className="text-lg font-black text-red-700">Clear test data</h2>
        <p className="text-sm text-slate-600">
          Deletes every child and screening so you can start fresh before real use. Team accounts are not affected. This cannot be undone.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE ALL CASES"
            className={inputCls + ' sm:flex-1'}
          />
          <button
            onClick={clearCases}
            disabled={busy || confirmText !== 'DELETE ALL CASES'}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            Delete all cases
          </button>
        </div>
      </div>
    </div>
  );
};
