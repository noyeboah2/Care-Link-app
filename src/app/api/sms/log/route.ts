import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { maskPhone } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN', 'SUPERVISOR'] });
    if ('error' in auth) return auth.error;
    const { results } = await auth.db
      .prepare(
        `SELECT l.id, l.kind, l.for_date, l.status, l.error, l.to_phone, l.created_at, l.updated_at, l.cost,
           c.full_name, u.name AS worker
         FROM sms_log l
         LEFT JOIN children c ON c.id = l.child_id
         LEFT JOIN users u ON u.id = c.created_by
         ORDER BY l.created_at DESC, l.rowid DESC LIMIT 100`,
      )
      .all<{
        id: string; kind: string; for_date: string; status: string; error: string | null; to_phone: string;
        created_at: string; updated_at: string; cost: string | null; full_name: string | null; worker: string | null;
      }>();
    const counts = await auth.db
      .prepare("SELECT status, COUNT(*) AS n FROM sms_log WHERE created_at >= datetime('now','-30 days') GROUP BY status")
      .all<{ status: string; n: number }>();
    return NextResponse.json({
      success: true,
      counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])),
      items: results.map((r) => ({
        id: r.id, kind: r.kind, forDate: r.for_date, status: r.status, error: r.error, cost: r.cost,
        phone: maskPhone(r.to_phone), createdAt: r.created_at, updatedAt: r.updated_at,
        child: r.full_name ? r.full_name.trim().split(/\s+/)[0] : '(deleted case)', worker: r.worker,
      })),
    });
  } catch (err) {
    console.error('GET /api/sms/log failed', err);
    return NextResponse.json({ success: false, error: 'Could not load the SMS log' }, { status: 500 });
  }
}
