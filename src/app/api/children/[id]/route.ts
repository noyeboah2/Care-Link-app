import { NextResponse } from 'next/server';
import { canSeeAll, requireUser, type SessionUser } from '@/lib/auth';
import { actorOf, logAudit } from '@/lib/audit';
import { normalizePhone, validDate } from '@/lib/validation';
import { AREA_IDS } from '@/lib/hospitals';
import type { Db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

type ChildRow = {
  id: string; full_name: string; age: number; gender: string; caregiver_phone: string;
  follow_up_date: string | null; area: string | null; sms_consent: number; sms_consent_at: string | null; created_at: string; created_by: string | null; owner_name: string | null;
};

async function findChild(db: Db, user: SessionUser, id: string) {
  const child = await db
    .prepare(
      `SELECT c.id, c.full_name, c.age, c.gender, c.caregiver_phone, c.follow_up_date, c.area, c.sms_consent, c.sms_consent_at, c.created_at, c.created_by,
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

    const seenRecently = await db
      .prepare("SELECT 1 AS x FROM audit_log WHERE user_id = ? AND action = 'CASE_VIEWED' AND entity_id = ? AND at > datetime('now','-10 minutes') LIMIT 1")
      .bind(user.id, id)
      .first();
    if (!seenRecently) await logAudit(db, request, actorOf(user), 'CASE_VIEWED', { entityType: 'case', entityId: id, entityLabel: child.full_name });

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
        smsConsent: child.sms_consent === 1,
        smsConsentAt: child.sms_consent_at,
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
    const existing = await findChild(db, user, id);
    if (!existing) return fail('Case not found', 404);

    const body = (await request.json()) as Record<string, unknown>;
    const sets: string[] = [];
    const values: unknown[] = [];
    const changed: string[] = [];

    if ('fullName' in body) {
      const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (name.length < 2 || name.length > 100) return fail("Enter the child's full name", 400);
      sets.push('full_name = ?'); values.push(name); changed.push('name');
    }
    if ('age' in body) {
      const age = typeof body.age === 'number' ? body.age : Number(body.age);
      if (!Number.isInteger(age) || age < 0 || age > 18) return fail('Age must be a whole number from 0 to 18', 400);
      sets.push('age = ?'); values.push(age); changed.push('age');
    }
    if ('gender' in body) {
      if (body.gender !== 'Male' && body.gender !== 'Female') return fail('Choose a gender', 400);
      sets.push('gender = ?'); values.push(body.gender); changed.push('gender');
    }
    if ('caregiverPhone' in body) {
      const phone = normalizePhone(body.caregiverPhone);
      if (!phone) return fail('Use a Ghana phone number, e.g. 0244123456', 400);
      sets.push('caregiver_phone = ?'); values.push(phone); changed.push('caregiver phone');
    }
    if ('area' in body) {
      if (typeof body.area !== 'string' || !AREA_IDS.includes(body.area)) return fail('Choose where the child lives', 400);
      sets.push('area = ?'); values.push(body.area); changed.push('location');
    }
    if ('smsConsent' in body) {
      if (typeof body.smsConsent !== 'boolean') return fail('Invalid consent value', 400);
      if (body.smsConsent) {
        changed.push('SMS consent: given');
        sets.push("sms_consent = 1", "sms_consent_at = datetime('now')", 'sms_consent_by = ?');
        values.push(user.id);
      } else {
        changed.push('SMS consent: withdrawn');
        sets.push('sms_consent = 0'); // withdrawn: reminders stop; the earlier consent record is kept
      }
    }
    if ('followUpDate' in body) {
      if (body.followUpDate === null || body.followUpDate === '') {
        sets.push('follow_up_date = NULL'); changed.push('follow-up date');
      } else if (validDate(body.followUpDate)) {
        sets.push('follow_up_date = ?'); values.push(body.followUpDate); changed.push('follow-up date');
      } else {
        return fail('Enter a valid follow-up date', 400);
      }
    }
    if (sets.length === 0) return fail('Nothing to update', 400);

    await db.prepare(`UPDATE children SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run();
    await logAudit(db, request, actorOf(user), 'CASE_UPDATED', { entityType: 'case', entityId: id, entityLabel: existing.full_name, details: { changed } });
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
      db.prepare('DELETE FROM sms_log WHERE child_id = ?').bind(id),
      db.prepare('DELETE FROM children WHERE id = ?').bind(id),
    ]);
    await logAudit(db, request, actorOf(user), 'CASE_DELETED', { entityType: 'case', entityId: id, entityLabel: child.full_name });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/children/[id] failed', err);
    return fail('Could not delete the case', 500);
  }
}
