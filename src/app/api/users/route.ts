import { NextResponse } from 'next/server';
import { actorOf, logAudit } from '@/lib/audit';
import { hashPassword, normalizeEmail, requireUser, validPassword, ROLES, MIN_PASSWORD, type Role } from '@/lib/auth';
import { normalizePhone } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { results } = await auth.db
      .prepare("SELECT id, email, name, role, phone, active, must_change, is_demo, created_at FROM users WHERE NOT (is_demo = 1 AND role = 'WORKER') ORDER BY created_at, rowid")
      .all<{ id: string; email: string; name: string; role: Role; phone: string | null; active: number; must_change: number; is_demo: number; created_at: string }>();
    return NextResponse.json({
      success: true,
      users: results.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        phone: u.phone,
        active: u.active === 1,
        mustChange: u.must_change === 1,
        isDemo: u.is_demo === 1,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/users failed', err);
    return fail('Could not load users', 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = body.role as Role;
    if (!email) return fail('Enter a valid email address', 400);
    if (name.length < 2 || name.length > 100) return fail('Enter the full name', 400);
    if (!ROLES.includes(role)) return fail('Choose a role', 400);
    if (!validPassword(body.password)) return fail(`Temporary password must be at least ${MIN_PASSWORD} characters`, 400);
    // A phone number is optional, but without one the person cannot use "forgot password" by text.
    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) return fail('Use a Ghana phone number, e.g. 0244123456', 400);

    const id = crypto.randomUUID();
    try {
      await auth.db
        .prepare('INSERT INTO users (id, email, name, role, password_hash, must_change, phone) VALUES (?, ?, ?, ?, ?, 1, ?)')
        .bind(id, email, name, role, await hashPassword(body.password), phone)
        .run();
    } catch (err) {
      if (String(err).includes('UNIQUE')) return fail('A user with that email already exists', 409);
      throw err;
    }
    await logAudit(auth.db, request, actorOf(auth.user), 'USER_CREATED', { entityType: 'user', entityId: id, entityLabel: name, details: { email, role, phone: phone ? 'saved' : 'none' } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('POST /api/users failed', err);
    return fail('Could not create the user', 500);
  }
}
