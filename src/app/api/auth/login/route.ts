import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createSession, normalizeEmail, sameOrigin, setSessionCookie, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return fail('Request blocked', 403);
    const body = (await request.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return fail('Enter your email and password', 400);

    const db = await getDb();
    const since = Date.now() - WINDOW_MS;
    const fails = await db
      .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at > ?')
      .bind(email, since)
      .first<{ n: number }>();
    if ((fails?.n ?? 0) >= MAX_FAILS) {
      return fail('Too many failed attempts. Please wait 15 minutes and try again.', 429);
    }

    const user = await db
      .prepare('SELECT id, password_hash FROM users WHERE email = ? AND active = 1')
      .bind(email)
      .first<{ id: string; password_hash: string }>();
    const ok = await verifyPassword(password, user?.password_hash ?? null);

    if (!user || !ok) {
      await db.prepare('INSERT INTO login_attempts (email, at) VALUES (?, ?)').bind(email, Date.now()).run();
      return fail('Incorrect email or password', 401);
    }

    await db.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email).run();
    const token = await createSession(db, user.id);
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, request, token);
    return response;
  } catch (err) {
    console.error('POST /api/auth/login failed', err);
    return fail('Could not sign in', 500);
  }
}
