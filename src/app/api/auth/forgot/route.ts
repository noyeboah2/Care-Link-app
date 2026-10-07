import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb, type Db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { normalizeEmail, sameOrigin } from '@/lib/auth';
import { getSmsConfig, sendSms } from '@/lib/sms';
import {
  CODE_MINUTES, MAX_REQUESTS_PER_EMAIL_PER_HOUR, MAX_REQUESTS_PER_IP_PER_HOUR, MAX_SMS_PER_DAY, MIN_SECONDS_BETWEEN_REQUESTS,
  hashCode, randomCode, randomHex,
} from '@/lib/recovery';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Step 1 of "forgot password": text a 6-digit code to the phone saved on the account.
// Every valid request gets the same answer, so nobody can use this to find out which emails have accounts.
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return fail('Request blocked', 403);
    const body = (await request.json()) as { email?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return fail('Enter a valid email address', 400);

    const db = await getDb();
    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip');
    const hourAgo = now - 3600000;

    // ---- limits ----
    await db.prepare('DELETE FROM recovery_throttle WHERE at < ?').bind(now - 2 * 86400000).run();
    const perEmail = await db.prepare('SELECT COUNT(*) AS n, MAX(at) AS last FROM recovery_throttle WHERE email = ? AND at > ?').bind(email, hourAgo).first<{ n: number; last: number | null }>();
    if (perEmail?.last && now - perEmail.last < MIN_SECONDS_BETWEEN_REQUESTS * 1000) return fail('Please wait a minute before asking again.', 429);
    const tooMany = 'Too many requests. Please wait an hour or ask your administrator to reset your password.';
    if ((perEmail?.n ?? 0) >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) return fail(tooMany, 429);
    if (ip) {
      const perIp = await db.prepare('SELECT COUNT(*) AS n FROM recovery_throttle WHERE ip = ? AND at > ?').bind(ip, hourAgo).first<{ n: number }>();
      if ((perIp?.n ?? 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) return fail(tooMany, 429);
    }
    await db.prepare('INSERT INTO recovery_throttle (email, ip, at) VALUES (?, ?, ?)').bind(email, ip, now).run();

    const generic = NextResponse.json({ success: true });
    const user = await db.prepare('SELECT id, name, phone, active FROM users WHERE email = ?').bind(email).first<{ id: string; name: string; phone: string | null; active: number }>();

    if (!user || user.active !== 1) {
      await hashCode('000000', randomHex(8)); // similar work whether or not the account exists
      await logAudit(db, request, null, 'PASSWORD_RESET_REQUESTED', { entityType: 'user', details: { email, result: 'no active account' }, withIp: true });
      return generic;
    }

    // Always leave a note for the administrator (the backup route if no text arrives).
    const open = await db.prepare("SELECT id FROM recovery_requests WHERE user_id = ? AND status = 'OPEN'").bind(user.id).first<{ id: string }>();
    const requestId = open?.id ?? crypto.randomUUID();
    if (!open) await db.prepare('INSERT INTO recovery_requests (id, user_id) VALUES (?, ?)').bind(requestId, user.id).run();

    const cfg = await getSmsConfig(db);
    const sentToday = await db.prepare('SELECT COUNT(*) AS n FROM recovery_throttle WHERE sent = 1 AND at > ?').bind(now - 86400000).first<{ n: number }>();
    const reason = !user.phone ? 'no phone number saved' : !cfg.configured ? 'SMS is not set up' : (sentToday?.n ?? 0) >= MAX_SMS_PER_DAY ? 'daily SMS limit reached' : null;
    const entity = { entityType: 'user' as const, entityId: user.id, entityLabel: user.name, withIp: true };

    if (reason || !user.phone) {
      await logAudit(db, request, null, 'PASSWORD_RESET_REQUESTED', { ...entity, details: { sent: false, reason } });
      return generic;
    }

    const code = randomCode();
    const salt = randomHex(16);
    await db.batch([
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id), // a new code replaces any earlier one
      db.prepare('INSERT INTO password_resets (id, user_id, code_hash, salt, expires_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, await hashCode(code, salt), salt, now + CODE_MINUTES * 60000),
    ]);

    // Send the text after answering, so the reply takes the same time for every email.
    const phone = user.phone;
    const work = (async () => {
      const r = await sendSms(cfg, phone, `CareLink: your password reset code is ${code}. It expires in ${CODE_MINUTES} minutes. If you did not ask for it, ignore this message.`);
      if (r.ok) {
        await markSent(db, email, now, requestId);
        await logAudit(db, request, null, 'PASSWORD_RESET_REQUESTED', { ...entity, details: { sent: true } });
      } else {
        await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run();
        await logAudit(db, request, null, 'PASSWORD_RESET_REQUESTED', { ...entity, details: { sent: false, reason: r.error ?? 'could not send' } });
      }
    })().catch((err) => console.error('Password reset text failed', err));
    try {
      const { ctx } = await getCloudflareContext({ async: true });
      ctx.waitUntil(work);
    } catch {
      await work;
    }
    return generic;
  } catch (err) {
    console.error('POST /api/auth/forgot failed', err);
    return fail('Could not start the password reset', 500);
  }
}

async function markSent(db: Db, email: string, at: number, requestId: string) {
  await db.batch([
    db.prepare('UPDATE recovery_throttle SET sent = 1 WHERE email = ? AND at = ?').bind(email, at),
    db.prepare("UPDATE recovery_requests SET sms_sent = 1, updated_at = datetime('now') WHERE id = ?").bind(requestId),
  ]);
}
