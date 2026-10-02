import { NextResponse } from 'next/server';
import { hashPassword, requireUser, validPassword, verifyPassword, MIN_PASSWORD } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { allowMustChange: true });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;

    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.currentPassword !== 'string') return fail('Enter your current password', 400);
    if (!validPassword(body.newPassword)) return fail(`New password must be at least ${MIN_PASSWORD} characters`, 400);
    if (body.newPassword === body.currentPassword) return fail('Choose a different password from the current one', 400);

    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!(await verifyPassword(body.currentPassword, row?.password_hash ?? null))) {
      return fail('Current password is incorrect', 403);
    }

    const hash = await hashPassword(body.newPassword);
    await db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').bind(hash, user.id).run();
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(user.id, user.sessionId).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/password failed', err);
    return fail('Could not change the password', 500);
  }
}
