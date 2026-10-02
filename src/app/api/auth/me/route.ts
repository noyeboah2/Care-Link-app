import { NextResponse } from 'next/server';
import { getDb, getSetupInfo } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getSessionUser(request, db);
    if (user) {
      return NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChange: user.mustChange },
      });
    }
    const count = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    const needsSetup = (count?.n ?? 0) === 0;
    if (!needsSetup) return NextResponse.json({ success: true, user: null, needsSetup: false });
    const info = await getSetupInfo(db);
    return NextResponse.json({
      success: true,
      user: null,
      needsSetup: true,
      setupEnabled: info.code !== null,
      setupSource: info.source,
      secretStatus: info.secretStatus,
    });
  } catch (err) {
    console.error('GET /api/auth/me failed', err);
    return NextResponse.json({ success: false, error: 'Could not check sign-in' }, { status: 500 });
  }
}
