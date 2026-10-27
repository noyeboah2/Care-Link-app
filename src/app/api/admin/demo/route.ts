import { NextResponse } from 'next/server';
import { actorOf, logAudit } from '@/lib/audit';
import { hashPassword, normalizeEmail, requireUser } from '@/lib/auth';
import { DemoBlockedError, loadDemoData, removeDemoData } from '@/lib/demo';
import type { Db } from '@/lib/db';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

async function status(db: Db) {
  const { results } = await db
    .prepare("SELECT id, email, name, active FROM users WHERE is_demo = 1 AND role = 'SUPERVISOR' ORDER BY created_at")
    .all<{ id: string; email: string; name: string; active: number }>();
  const demo = await db.prepare('SELECT COUNT(*) AS n FROM children WHERE is_demo = 1').first<{ n: number }>();
  const real = await db.prepare('SELECT COUNT(*) AS n FROM children WHERE is_demo = 0').first<{ n: number }>();
  return {
    accounts: results.map((r) => ({ id: r.id, email: r.email, name: r.name, active: r.active === 1 })),
    demoCases: demo?.n ?? 0,
    realCases: real?.n ?? 0,
    blocked: (real?.n ?? 0) > 0,
    lastLoaded: await getSetting(db, 'demo_loaded_on'),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    return NextResponse.json({ success: true, ...(await status(auth.db)) });
  } catch (err) {
    console.error('GET /api/admin/demo failed', err);
    return fail('Could not load demo status', 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const body = (await request.json()) as Record<string, unknown>;
    const actor = actorOf(user);

    if (body.action === 'setAccount') {
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      const name = typeof body.name === 'string' && body.name.trim().length >= 2 ? body.name.trim().slice(0, 100) : 'Demo Reviewer';
      if (!email) return fail('Enter a valid email address', 400);
      if (password.length < 4 || password.length > 200) return fail('The demo password must be at least 4 characters', 400);
      const hash = await hashPassword(password);
      const existing = await db.prepare('SELECT id, is_demo FROM users WHERE email = ?').bind(email).first<{ id: string; is_demo: number }>();
      if (existing && existing.is_demo !== 1) return fail('That email belongs to a real account. Use a different email for the demo.', 400);
      if (existing) {
        await db.batch([
          db.prepare("UPDATE users SET password_hash = ?, name = ?, active = 1, must_change = 0, role = 'SUPERVISOR' WHERE id = ?").bind(hash, name, existing.id),
          db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(existing.id),
        ]);
      } else {
        await db
          .prepare("INSERT INTO users (id, email, name, role, password_hash, must_change, active, is_demo) VALUES (?, ?, ?, 'SUPERVISOR', ?, 0, 1, 1)")
          .bind(crypto.randomUUID(), email, name, hash)
          .run();
      }
      await logAudit(db, request, actor, 'DEMO_ACCOUNT_SET', { entityType: 'user', entityLabel: name, details: { email } });
    } else if (body.action === 'load') {
      try {
        const n = await loadDemoData(db);
        await logAudit(db, request, actor, 'DEMO_DATA_LOADED', { entityType: 'system', details: { cases: n } });
      } catch (err) {
        if (err instanceof DemoBlockedError) return fail(err.message, 409);
        throw err;
      }
    } else if (body.action === 'remove') {
      const n = await removeDemoData(db);
      await logAudit(db, request, actor, 'DEMO_DATA_REMOVED', { entityType: 'system', details: { cases: n } });
    } else if (body.action === 'removeAccount') {
      const id = typeof body.id === 'string' ? body.id : '';
      const target = await db.prepare("SELECT id, email, name FROM users WHERE id = ? AND is_demo = 1 AND role = 'SUPERVISOR'").bind(id).first<{ id: string; email: string; name: string }>();
      if (!target) return fail('Demo login not found', 404);
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
        db.prepare('DELETE FROM users WHERE id = ?').bind(id),
      ]);
      await logAudit(db, request, actor, 'DEMO_ACCOUNT_REMOVED', { entityType: 'user', entityLabel: target.name, details: { email: target.email } });
    } else {
      return fail('Unknown action', 400);
    }
    return NextResponse.json({ success: true, ...(await status(db)) });
  } catch (err) {
    console.error('POST /api/admin/demo failed', err);
    return fail('Could not update the demo', 500);
  }
}
