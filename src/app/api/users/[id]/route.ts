import { NextResponse } from 'next/server';
import { hashPassword, requireUser, validPassword, ROLES, MIN_PASSWORD, type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { user: admin, db } = auth;
    const { id } = await params;

    const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!target) return fail('User not found', 404);

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === 'deactivate' || action === 'activate') {
      if (id === admin.id) return fail('You cannot deactivate your own account', 400);
      await db.prepare('UPDATE users SET active = ? WHERE id = ?').bind(action === 'activate' ? 1 : 0, id).run();
      if (action === 'deactivate') await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    } else if (action === 'resetPassword') {
      if (!validPassword(body.password)) return fail(`Temporary password must be at least ${MIN_PASSWORD} characters`, 400);
      await db
        .prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?')
        .bind(await hashPassword(body.password), id)
        .run();
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    } else if (action === 'setRole') {
      if (id === admin.id) return fail('You cannot change your own role', 400);
      if (!ROLES.includes(body.role as Role)) return fail('Choose a role', 400);
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
    } else {
      return fail('Unknown action', 400);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/users/[id] failed', err);
    return fail('Could not update the user', 500);
  }
}
