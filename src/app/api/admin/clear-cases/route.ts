import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Deletes ALL children and screenings (not users). Used to clear test data before real use.
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const body = (await request.json()) as { confirm?: unknown };
    if (body.confirm !== 'DELETE ALL CASES') {
      return NextResponse.json({ success: false, error: 'Type DELETE ALL CASES to confirm' }, { status: 400 });
    }
    const { db } = auth;
    const before = await db.prepare('SELECT COUNT(*) AS n FROM children').first<{ n: number }>();
    await db.batch([db.prepare('DELETE FROM screenings'), db.prepare('DELETE FROM sms_log'), db.prepare('DELETE FROM children')]);
    return NextResponse.json({ success: true, deleted: before?.n ?? 0 });
  } catch (err) {
    console.error('POST /api/admin/clear-cases failed', err);
    return NextResponse.json({ success: false, error: 'Could not clear the cases' }, { status: 500 });
  }
}
