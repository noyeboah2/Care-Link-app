import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { actorOf, logAudit } from '@/lib/audit';
import { hashPassword, normalizeEmail, sameOrigin, validPassword, MIN_PASSWORD } from '@/lib/auth';
import { MAX_CODE_ATTEMPTS, hashCode, randomHex, sameHash } from '@/lib/recovery';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });
const INVALID = 'That code is not valid or has expired. Ask for a new one.';

// Step 2 of "forgot password": the code from the text message plus a new password.
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return fail('Request blocked', 403);
    const body = (await request.json()) as { email?: unknown; code?: unknown; newPassword?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return fail('Enter a valid email address', 400);
    if (!validPassword(body.newPassword)) return fail(`New password must be at least ${MIN_PASSWORD} characters`, 400);
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    const db = await getDb();
    const user = await db.prepare('SELECT id, name, role, active FROM users WHERE email = ?').bind(email).first<{ id: string; name: string; role: string; active: number }>();
    const row = user
      ? await db.prepare('SELECT id, code_hash, salt, expires_at, attempts FROM password_resets WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').bind(user.id).first<{ id: string; code_hash: string; salt: string; expires_at: number; attempts: number }>()
      : null;

    const refuse = async (reason: string) => {
      if (user) await logAudit(db, request, null, 'PASSWORD_RESET_FAILED', { entityType: 'user', entityId: user.id, entityLabel: user.name, details: { reason }, withIp: true });
      return fail(INVALID, 400);
    };

    if (!user || user.active !== 1 || !row) {
      await hashCode('000000', randomHex(8)); // same work either way
      return refuse('no code requested');
    }
    if (row.expires_at < Date.now()) return refuse('code expired');
    if (row.attempts >= MAX_CODE_ATTEMPTS) return refuse('too many wrong codes');

    // Count the attempt first, so parallel guesses cannot get extra tries.
    await db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    if (!/^\d{6}$/.test(code) || !sameHash(await hashCode(code, row.salt), row.code_hash)) return refuse('wrong code');

    await db.batch([
      db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPassword(body.newPassword as string), user.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id), // sign out everywhere
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id), // the code works once
      db.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email), // lift any sign-in lockout
      db.prepare("UPDATE recovery_requests SET status = 'DONE', updated_at = datetime('now') WHERE user_id = ? AND status = 'OPEN'").bind(user.id),
    ]);
    await logAudit(db, request, actorOf({ id: user.id, name: user.name, role: user.role }), 'PASSWORD_RESET_COMPLETED', { entityType: 'user', entityId: user.id, entityLabel: user.name, details: { method: 'text message code' }, withIp: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/reset failed', err);
    return fail('Could not reset the password', 500);
  }
}
