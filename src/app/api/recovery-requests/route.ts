import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Admin only: people who tapped "Forgot password". This is the backup route when no text could be sent.
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { results } = await auth.db
      .prepare(
        `SELECT r.id, r.sms_sent, r.requested_at, u.id AS user_id, u.name, u.email, u.phone
         FROM recovery_requests r JOIN users u ON u.id = r.user_id
         WHERE r.status = 'OPEN' AND u.active = 1 ORDER BY r.requested_at DESC`,
      )
      .all<{ id: string; sms_sent: number; requested_at: string; user_id: string; name: string; email: string; phone: string | null }>();
    return NextResponse.json({
      success: true,
      requests: results.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, email: r.email, hasPhone: !!r.phone, smsSent: r.sms_sent === 1, requestedAt: r.requested_at })),
    });
  } catch (err) {
    console.error('GET /api/recovery-requests failed', err);
    return NextResponse.json({ success: false, error: 'Could not load the requests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const body = (await request.json()) as { id?: unknown; action?: unknown };
    if (typeof body.id !== 'string' || body.action !== 'dismiss') return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    await auth.db.prepare("UPDATE recovery_requests SET status = 'DISMISSED', updated_at = datetime('now') WHERE id = ? AND status = 'OPEN'").bind(body.id).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/recovery-requests failed', err);
    return NextResponse.json({ success: false, error: 'Could not update the request' }, { status: 500 });
  }
}
