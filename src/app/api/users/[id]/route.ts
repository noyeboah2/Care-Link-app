import { NextResponse } from 'next/server';
import { actorOf, logAudit } from '@/lib/audit';
import { hashPassword, requireUser, validPassword, ROLES, MIN_PASSWORD, type Role } from '@/lib/auth';
import { randomTempPassword } from '@/lib/recovery';
import { normalizePhone } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { user: admin, db } = auth;
    const { id } = await params;

    const target = await db.prepare('SELECT id, email, name, role, is_demo FROM users WHERE id = ?').bind(id).first<{ id: string; email: string; name: string; role: string; is_demo: number }>();
    if (!target) return fail('User not found', 404);

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    if (target.is_demo === 1 && ['resetPassword', 'setRole', 'setPhone'].includes(String(action))) {
      return fail('This is a demo login. Change it from the Demo section instead.', 400);
    }
    let audited: Parameters<typeof logAudit>[3] | null = null;
    let extra: Record<string, unknown> = { email: target.email };
    let tempPassword: string | null = null;

    if (action === 'deactivate' || action === 'activate') {
      if (id === admin.id) return fail('You cannot deactivate your own account', 400);
      await db.prepare('UPDATE users SET active = ? WHERE id = ?').bind(action === 'activate' ? 1 : 0, id).run();
      if (action === 'deactivate') await db.batch([db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id), db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(id)]);
      audited = action === 'activate' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
    } else if (action === 'resetPassword') {
      // The app can make the temporary password itself (easier to read aloud and never a weak one).
      const generate = body.generate === true;
      const password = generate ? randomTempPassword() : body.password;
      if (!validPassword(password)) return fail(`Temporary password must be at least ${MIN_PASSWORD} characters`, 400);
      await db.batch([
        db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').bind(await hashPassword(password), id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
        db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(id),
        db.prepare("UPDATE recovery_requests SET status = 'DONE', updated_at = datetime('now') WHERE user_id = ? AND status = 'OPEN'").bind(id),
      ]);
      if (generate) tempPassword = password;
      extra = { email: target.email, generated: generate };
      audited = 'USER_PASSWORD_RESET';
    } else if (action === 'setPhone') {
      const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
      const phone = raw ? normalizePhone(raw) : null;
      if (raw && !phone) return fail('Use a Ghana phone number, e.g. 0244123456', 400);
      await db.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(phone, id).run();
      await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(id).run(); // a code sent to the old number must not work
      audited = 'USER_PHONE_CHANGED';
      extra = { email: target.email, now: phone ? 'saved' : 'removed' }; // the number itself is never written to the log
    } else if (action === 'setRole') {
      if (id === admin.id) return fail('You cannot change your own role', 400);
      if (!ROLES.includes(body.role as Role)) return fail('Choose a role', 400);
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
      audited = 'USER_ROLE_CHANGED';
      extra = { email: target.email, from: target.role, to: body.role };
    } else {
      return fail('Unknown action', 400);
    }
    if (audited) await logAudit(db, request, actorOf(admin), audited, { entityType: 'user', entityId: id, entityLabel: target.name, details: extra });
    return NextResponse.json({ success: true, ...(tempPassword ? { tempPassword } : {}) });
  } catch (err) {
    console.error('PATCH /api/users/[id] failed', err);
    return fail('Could not update the user', 500);
  }
}
