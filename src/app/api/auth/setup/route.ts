import { NextResponse } from 'next/server';
import { getDb, getSetupInfo } from '@/lib/db';
import { createSession, hashPassword, normalizeEmail, sameOrigin, setSessionCookie, validPassword, MIN_PASSWORD } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Creates the very first admin account. Only works while there are no users,
// and only with the secret SETUP_CODE configured in Cloudflare.
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return fail('Request blocked', 403);
    const body = (await request.json()) as Record<string, unknown>;
    const db = await getDb();
    const { code } = await getSetupInfo(db);
    if (!code) return fail('Setup is not enabled yet. A setup code has not been configured.', 503);

    const existing = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    if ((existing?.n ?? 0) > 0) return fail('Setup is already finished', 409);

    if (typeof body.setupCode !== 'string' || body.setupCode !== code) return fail('Wrong setup code', 403);
    const email = normalizeEmail(body.email);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!email) return fail('Enter a valid email address', 400);
    if (name.length < 2 || name.length > 100) return fail('Enter your full name', 400);
    if (!validPassword(body.password)) return fail(`Password must be at least ${MIN_PASSWORD} characters`, 400);

    const id = crypto.randomUUID();
    const hash = await hashPassword(body.password);
    // Insert only if the table is still empty (guards against two people racing).
    const result = await db
      .prepare(
        `INSERT INTO users (id, email, name, role, password_hash, must_change)
         SELECT ?, ?, ?, 'ADMIN', ?, 0 WHERE NOT EXISTS (SELECT 1 FROM users)`,
      )
      .bind(id, email, name, hash)
      .run();
    if (!result.meta?.changes) return fail('Setup is already finished', 409);

    await db.prepare("DELETE FROM settings WHERE key = 'setup_code'").run();
    const token = await createSession(db, id);
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, request, token);
    return response;
  } catch (err) {
    console.error('POST /api/auth/setup failed', err);
    return fail('Could not complete setup', 500);
  }
}
