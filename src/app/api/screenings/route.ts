import { NextResponse } from 'next/server';
import { canSeeAll, requireUser } from '@/lib/auth';
import { SCREENING_QUESTIONS, scoreAnswers } from '@/lib/risk';
import { isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const body = (await request.json()) as { childId?: unknown; answers?: unknown };

    if (typeof body.childId !== 'string' || !body.childId) {
      return NextResponse.json({ success: false, error: 'childId is required' }, { status: 400 });
    }
    if (typeof body.answers !== 'object' || body.answers === null) {
      return NextResponse.json({ success: false, error: 'answers are required' }, { status: 400 });
    }

    // Keep only known questions with boolean answers; score on the server.
    const raw = body.answers as Record<string, unknown>;
    const answers: Record<string, boolean> = {};
    for (const q of SCREENING_QUESTIONS) answers[q.id] = raw[q.id] === true;
    const { score, riskLevel } = scoreAnswers(answers);

    const child = await db
      .prepare('SELECT id, created_by FROM children WHERE id = ?')
      .bind(body.childId)
      .first<{ id: string; created_by: string | null }>();
    if (!child || (!canSeeAll(user.role) && child.created_by !== user.id)) {
      return NextResponse.json({ success: false, error: 'Child not found' }, { status: 404 });
    }

    // Offline phones send their own id (so retries are safe) and the time the screening was done.
    const id = isUuid((body as { id?: unknown }).id) ? ((body as { id: string }).id) : crypto.randomUUID();
    const existing = await db.prepare('SELECT recorded_by FROM screenings WHERE id = ?').bind(id).first<{ recorded_by: string | null }>();
    if (existing) {
      if (existing.recorded_by !== user.id) {
        return NextResponse.json({ success: false, error: 'That screening id is already in use' }, { status: 409 });
      }
      return NextResponse.json({ success: true, data: { id, score, riskLevel } });
    }

    let createdAt: string | null = null;
    const recordedAt = (body as { recordedAt?: unknown }).recordedAt;
    if (typeof recordedAt === 'string') {
      const t = Date.parse(recordedAt);
      const now = Date.now();
      if (!Number.isNaN(t) && t <= now + 5 * 60 * 1000 && t >= now - 60 * 24 * 60 * 60 * 1000) {
        createdAt = new Date(t).toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    await db
      .prepare('INSERT INTO screenings (id, child_id, answers, score, risk_level, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime(\'now\')))')
      .bind(id, body.childId, JSON.stringify(answers), score, riskLevel, user.id, createdAt)
      .run();

    return NextResponse.json({ success: true, data: { id, score, riskLevel } });
  } catch (err) {
    console.error('POST /api/screenings failed', err);
    return NextResponse.json({ success: false, error: 'Could not save the screening' }, { status: 500 });
  }
}
