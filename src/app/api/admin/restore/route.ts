import { NextResponse } from 'next/server';
import { actorOf, logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { AREA_IDS } from '@/lib/hospitals';
import { getSetting, setSetting } from '@/lib/settings';
import { isUuid, normalizePhone, validDate } from '@/lib/validation';
import type { Db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Restoring a downloaded backup into an EMPTY database, in small steps so each request stays
// inside Cloudflare's per-request limits (the browser sends the file in chunks).
// Only cases and screenings are restored. User accounts must already exist; a case whose
// registering worker no longer exists is kept but loses that link (supervisors and admins still see it).
const SQL_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const LOCK_MINUTES = 30;
const MAX_ROWS = { children: 100, screenings: 160 };

interface ChildIn {
  id: string; fullName: string; age: number; gender: string; caregiverPhone: string; area: string | null;
  followUpDate: string | null; smsConsent: boolean; smsConsentAt: string | null; smsConsentBy: string | null;
  createdBy: string | null; createdAt: string;
}
interface ScreeningIn {
  id: string; childId: string; answers: Record<string, boolean>; score: number; riskLevel: string; recordedBy: string | null; createdAt: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkChild(r: unknown, i: number): { ok: true; v: ChildIn } | { ok: false; error: string } {
  const bad = (m: string) => ({ ok: false as const, error: `Case ${i + 1}: ${m}` });
  if (!isObj(r)) return bad('not a valid record');
  if (!isUuid(r.id)) return bad('invalid id');
  if (typeof r.fullName !== 'string' || r.fullName.trim().length < 2 || r.fullName.length > 100) return bad('invalid name');
  if (!Number.isInteger(r.age) || (r.age as number) < 0 || (r.age as number) > 18) return bad('invalid age');
  if (r.gender !== 'Male' && r.gender !== 'Female') return bad('invalid gender');
  const phone = normalizePhone(r.caregiverPhone);
  if (!phone) return bad('invalid phone number');
  if (r.area !== null && (typeof r.area !== 'string' || !AREA_IDS.includes(r.area))) return bad('invalid location');
  if (r.followUpDate !== null && !validDate(r.followUpDate)) return bad('invalid follow-up date');
  if (typeof r.smsConsent !== 'boolean') return bad('invalid SMS consent');
  if (typeof r.createdAt !== 'string' || !SQL_TIME.test(r.createdAt)) return bad('invalid created time');
  const optStr = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.length <= 64);
  if (!optStr(r.createdBy) || !optStr(r.smsConsentBy)) return bad('invalid owner');
  if (r.smsConsentAt !== null && r.smsConsentAt !== undefined && (typeof r.smsConsentAt !== 'string' || !SQL_TIME.test(r.smsConsentAt))) return bad('invalid consent time');
  return {
    ok: true,
    v: {
      id: r.id, fullName: r.fullName.trim(), age: r.age as number, gender: r.gender, caregiverPhone: phone,
      area: (r.area as string | null) ?? null, followUpDate: (r.followUpDate as string | null) ?? null,
      smsConsent: r.smsConsent, smsConsentAt: (r.smsConsentAt as string | null) ?? null, smsConsentBy: (r.smsConsentBy as string | null) ?? null,
      createdBy: (r.createdBy as string | null) ?? null, createdAt: r.createdAt,
    },
  };
}

function checkScreening(r: unknown, i: number): { ok: true; v: ScreeningIn } | { ok: false; error: string } {
  const bad = (m: string) => ({ ok: false as const, error: `Screening ${i + 1}: ${m}` });
  if (!isObj(r)) return bad('not a valid record');
  if (!isUuid(r.id) || !isUuid(r.childId)) return bad('invalid id');
  if (!isObj(r.answers)) return bad('invalid answers');
  const answers: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(r.answers)) {
    if (typeof v !== 'boolean' || k.length > 40) return bad('invalid answers');
    answers[k] = v;
  }
  if (!Number.isInteger(r.score) || (r.score as number) < 0 || (r.score as number) > 100) return bad('invalid score');
  if (r.riskLevel !== 'HIGH_RISK' && r.riskLevel !== 'LOW_RISK') return bad('invalid risk level');
  if (typeof r.createdAt !== 'string' || !SQL_TIME.test(r.createdAt)) return bad('invalid time');
  if (r.recordedBy !== null && r.recordedBy !== undefined && (typeof r.recordedBy !== 'string' || r.recordedBy.length > 64)) return bad('invalid owner');
  return { ok: true, v: { id: r.id, childId: r.childId, answers, score: r.score as number, riskLevel: r.riskLevel, recordedBy: (r.recordedBy as string | null) ?? null, createdAt: r.createdAt } };
}

async function counts(db: Db) {
  const c = await db.prepare('SELECT COUNT(*) AS n FROM children').first<{ n: number }>();
  const s = await db.prepare('SELECT COUNT(*) AS n FROM screenings').first<{ n: number }>();
  return { children: c?.n ?? 0, screenings: s?.n ?? 0 };
}

async function hasLock(db: Db, userId: string) {
  const v = await getSetting(db, 'restore_lock');
  if (!v) return false;
  const [uid, at] = v.split('|');
  return uid === userId && Date.now() - Number(at) < LOCK_MINUTES * 60 * 1000;
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const body = (await request.json()) as Record<string, unknown>;
    const phase = body.phase;

    // 1. Check the whole file before anything is written (no database changes).
    if (phase === 'validate') {
      const b = body.backup;
      if (!isObj(b) || !isObj(b.meta) || b.meta.app !== 'carelink' || b.meta.format !== 1) return fail('This is not a CareLink backup file', 400);
      if (!Array.isArray(b.children) || !Array.isArray(b.screenings)) return fail('The backup has no cases or screenings section', 400);
      const errors: string[] = [];
      const ids = new Set<string>();
      b.children.forEach((r, i) => {
        const c = checkChild(r, i);
        if (!c.ok) errors.push(c.error); else if (ids.has(c.v.id)) errors.push(`Case ${i + 1}: duplicate id`); else ids.add(c.v.id);
      });
      b.screenings.forEach((r, i) => {
        const s = checkScreening(r, i);
        if (!s.ok) errors.push(s.error); else if (!ids.has(s.v.childId)) errors.push(`Screening ${i + 1}: refers to a case that is not in the backup`);
      });
      if (errors.length) return NextResponse.json({ success: false, error: `The backup file has problems. ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (and ${errors.length - 5} more)` : ''}` }, { status: 400 });
      const now = await counts(db);
      return NextResponse.json({ success: true, counts: { children: b.children.length, screenings: b.screenings.length }, empty: now.children === 0 && now.screenings === 0 });
    }

    // 2. Take the lock; refuse unless the database holds no cases.
    if (phase === 'begin') {
      if (body.confirm !== 'RESTORE') return fail('Type RESTORE to confirm', 400);
      const now = await counts(db);
      if (now.children > 0 || now.screenings > 0) {
        return fail('A restore only works on an empty database. Use Clear test data first, or use Time Travel to rewind to an earlier time.', 409);
      }
      await setSetting(db, 'restore_lock', `${user.id}|${Date.now()}`);
      return NextResponse.json({ success: true });
    }

    if (!(await hasLock(db, user.id))) return fail('No restore is in progress. Start again.', 409);

    // 3. Cases, in chunks.
    if (phase === 'children') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS.children) return fail('Invalid chunk', 400);
      const parsed: ChildIn[] = [];
      for (let i = 0; i < rows.length; i++) {
        const c = checkChild(rows[i], i);
        if (!c.ok) return fail(c.error, 400);
        parsed.push(c.v);
      }
      const { results: urows } = await db.prepare('SELECT id FROM users').all<{ id: string }>();
      const known = new Set(urows.map((u) => u.id));
      const keep = (id: string | null) => (id && known.has(id) ? id : null);
      // 8 rows per statement stays under D1's 100-parameter limit (12 columns each).
      const stmts = [];
      for (let i = 0; i < parsed.length; i += 8) {
        const group = parsed.slice(i, i + 8);
        stmts.push(
          db
            .prepare(
              `INSERT INTO children (id, full_name, age, gender, caregiver_phone, area, follow_up_date, sms_consent, sms_consent_at, sms_consent_by, created_by, created_at) VALUES ${group.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}`,
            )
            .bind(...group.flatMap((c) => [c.id, c.fullName, c.age, c.gender, c.caregiverPhone, c.area, c.followUpDate, c.smsConsent ? 1 : 0, c.smsConsentAt, keep(c.smsConsentBy), keep(c.createdBy), c.createdAt])),
        );
      }
      await db.batch(stmts);
      return NextResponse.json({ success: true, inserted: parsed.length });
    }

    // 4. Screenings, in chunks (the database itself refuses any that point at a missing case).
    if (phase === 'screenings') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS.screenings) return fail('Invalid chunk', 400);
      const parsed: ScreeningIn[] = [];
      for (let i = 0; i < rows.length; i++) {
        const s = checkScreening(rows[i], i);
        if (!s.ok) return fail(s.error, 400);
        parsed.push(s.v);
      }
      // Every screening must belong to a case that has already been restored.
      const wanted = Array.from(new Set(parsed.map((p) => p.childId)));
      const present = new Set<string>();
      for (let i = 0; i < wanted.length; i += 90) {
        const group = wanted.slice(i, i + 90);
        const { results: found } = await db.prepare(`SELECT id FROM children WHERE id IN (${group.map(() => '?').join(',')})`).bind(...group).all<{ id: string }>();
        found.forEach((f) => present.add(f.id));
      }
      if (wanted.some((id) => !present.has(id))) return fail('A screening refers to a case that was not restored', 400);

      const { results: urows } = await db.prepare('SELECT id FROM users').all<{ id: string }>();
      const known = new Set(urows.map((u) => u.id));
      const stmts = [];
      for (let i = 0; i < parsed.length; i += 14) {
        const group = parsed.slice(i, i + 14); // 7 columns each
        stmts.push(
          db
            .prepare(`INSERT INTO screenings (id, child_id, answers, score, risk_level, recorded_by, created_at) VALUES ${group.map(() => '(?,?,?,?,?,?,?)').join(',')}`)
            .bind(...group.flatMap((s) => [s.id, s.childId, JSON.stringify(s.answers), s.score, s.riskLevel, s.recordedBy && known.has(s.recordedBy) ? s.recordedBy : null, s.createdAt])),
        );
      }
      await db.batch(stmts);
      return NextResponse.json({ success: true, inserted: parsed.length });
    }

    if (phase === 'finish') {
      const now = await counts(db);
      await db.prepare("DELETE FROM settings WHERE key = 'restore_lock'").run();
      await logAudit(db, request, actorOf(user), 'BACKUP_RESTORED', { entityType: 'system', details: now });
      return NextResponse.json({ success: true, counts: now });
    }

    // Something went wrong part-way: the database was empty before, so remove everything restored so far.
    if (phase === 'abort') {
      await db.batch([db.prepare('DELETE FROM screenings'), db.prepare('DELETE FROM children'), db.prepare("DELETE FROM settings WHERE key = 'restore_lock'")]);
      await logAudit(db, request, actorOf(user), 'BACKUP_RESTORED', { entityType: 'system', details: { result: 'cancelled and rolled back' } });
      return NextResponse.json({ success: true });
    }

    return fail('Unknown step', 400);
  } catch (err) {
    console.error('POST /api/admin/restore failed', err);
    return fail('The restore step failed', 500);
  }
}
