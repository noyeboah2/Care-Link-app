import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { clearSessionCookie, getSessionUser, sameOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: 'Request blocked' }, { status: 403 });
    const db = await getDb();
    const user = await getSessionUser(request, db);
    if (user) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(user.sessionId).run();
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response, request);
    return response;
  } catch (err) {
    console.error('POST /api/auth/logout failed', err);
    return NextResponse.json({ success: false, error: 'Could not sign out' }, { status: 500 });
  }
}
