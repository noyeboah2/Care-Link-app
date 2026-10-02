import { NextResponse } from 'next/server';
import { canSeeAll, requireUser, type SessionUser } from '@/lib/auth';
import { normalizePhone, validDate } from '@/lib/cases';
import { AREA_IDS } from '@/lib/hospitals';
import type { Db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

type ChildRow = {
  id: string; full_name: string; age: number; gender: string; caregiver_phone: string;
  follow_up_date: string | null; area: string | null; created_at: string; created_by: string | null; owner_name: string | null;
};

async function findChild(db: Db, user: SessionUser, id: string) {
  const child = await db
    .prepare(
      `SELECT c.id, c.full_name, c.age, c.gender, c.caregiver_phone, c.follow_up_date, c.area, c.created_at, c.created_by,
         u.name AS owner_name
       FROM children c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?`,
    )
    .bind(id)
    .first<ChildRow>();
  if (!child) return null;
  if (!canSeeAll(user.role) && child.created_by !== user.id) return null; // hide other workers' cases
  return child;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const { id } = await params;

    const child = await findChild(db, user, id);
    if (!child) return fail('Case not found', 404);

    const { results } = await db
      .prepare(
        `SELECT s.id, s.risk_level, s.score, s.created_at, u.name AS by_name
         FROM screenings s LEFT JOIN users u ON u.id = s.recorded_by
         WHERE s.child_id = ? ORDER BY s.created_at DESC, s.rowid DESC`,
      )
      .bind(id)
      .all<{ id: string; risk_level: string; score: number; created_at: string; by_name: string | null }>();

    return NextResponse.json({
      success: true,
      child: {
        id: child.id,
        fullName: child.full_name,
        age: child.age,
        gender: child.gender,
        caregiverPhone: child.caregiver_phone,
        followUpDate: child.follow_up_date,
        area: child.area,
        createdAt: child.created_at,
        ownerName: child.owner_name,
      },
      screenings: results.map((s) => ({
        id: s.id, riskLevel: s.risk_level, score: s.score, createdAt: s.created_at, recordedBy: s.by_name,
      })),
      canDelete: user.role === 'ADMIN' || child.created_by === user.id,
    });
  } catch (err) {
    console.error('GET /api/children/[id] failed', err);
    return fail('Could not load the case', 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const { id } = await params;
    if (!(await findChild(db, user, id))) return fail('Case not found', 404);

    const body = (await request.json()) as Record<string, unknown>;
    const sets: string[] = [];
    const values: unknown[] = [];

    if ('fullName' in body) {
      const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (name.length < 2 || name.length > 100) return fail("Enter the child's full name", 400);
      sets.push('full_name = ?'); values.push(name);
    }
    if ('age' in body) {
      const age = typeof body.age === 'number' ? body.age : Number(body.age);
      if (!Number.isInteger(age) || age < 0 || age > 18) return fail('Age must be a whole number from 0 to 18', 400);
      sets.push('age = ?'); values.push(age);
    }
    if ('gender' in body) {
      if (body.gender !== 'Male' && body.gender !== 'Female') return fail('Choose a gender', 400);
      sets.push('gender = ?'); values.push(body.gender);
    }
    if ('caregiverPhone' in body) {
      const phone = normalizePhone(body.caregiverPhone);
      if (!phone) return fail('Use a Ghana phone number, e.g. 0244123456', 400);
      sets.push('caregiver_phone = ?'); values.push(phone);
    }
    if ('area' in body) {
      if (typeof body.area !== 'string' || !AREA_IDS.includes(body.area)) return fail('Choose where the child lives', 400);
      sets.push('area = ?'); values.push(body.area);
    }
    if ('followUpDate' in body) {
      if (body.followUpDate === null || body.followUpDate === '') {
        sets.push('follow_up_date = NULL');
      } else if (validDate(body.followUpDate)) {
        sets.push('follow_up_date = ?'); values.push(body.followUpDate);
      } else {
        return fail('Enter a valid follow-up date', 400);
      }
    }
    if (sets.length === 0) return fail('Nothing to update', 400);

    await db.prepare(`UPDATE children SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/children/[id] failed', err);
    return fail('Could not update the case', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const { id } = await params;

    const child = await findChild(db, user, id);
    if (!child) return fail('Case not found', 404);
    if (user.role !== 'ADMIN' && child.created_by !== user.id) return fail('You cannot delete this case', 403);

    await db.batch([
      db.prepare('DELETE FROM screenings WHERE child_id = ?').bind(id),
      db.prepare('DELETE FROM children WHERE id = ?').bind(id),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/children/[id] failed', err);
    return fail('Could not delete the case', 500);
  }
}
