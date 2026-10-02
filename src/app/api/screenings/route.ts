import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { SCREENING_QUESTIONS, scoreAnswers } from '@/lib/risk';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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

    const db = await getDb();
    const child = await db.prepare('SELECT id FROM children WHERE id = ?').bind(body.childId).first();
    if (!child) {
      return NextResponse.json({ success: false, error: 'Child not found' }, { status: 404 });
    }

    const id = crypto.randomUUID();
    await db
      .prepare('INSERT INTO screenings (id, child_id, answers, score, risk_level) VALUES (?, ?, ?, ?, ?)')
      .bind(id, body.childId, JSON.stringify(answers), score, riskLevel)
      .run();

    return NextResponse.json({ success: true, data: { id, score, riskLevel } });
  } catch (err) {
    console.error('POST /api/screenings failed', err);
    return NextResponse.json({ success: false, error: 'Could not save the screening' }, { status: 500 });
  }
}
