import { NextResponse } from 'next/server';
import { actorOf, auditFilter, logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { downloadResponse, toCsv } from '@/lib/csv';
import { todayStr } from '@/lib/cases';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Admin-only downloads. Password hashes, session data and SMS/API secrets are never included.
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const params = new URL(request.url).searchParams;
    const type = params.get('type') ?? 'info';
    const date = todayStr();

    const count = async (table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;

    if (type === 'info') {
      const last = await db
        .prepare("SELECT at, user_name, details FROM audit_log WHERE action = 'BACKUP_EXPORTED' ORDER BY rowid DESC LIMIT 1")
        .first<{ at: string; user_name: string | null; details: string | null }>();
      const [children, screenings, users, smsLog, audit] = await Promise.all([
        count('children'), count('screenings'), count('users'), count('sms_log'), count('audit_log'),
      ]);
      return NextResponse.json({
        success: true,
        counts: { children, screenings, users, smsLog, audit },
        empty: children === 0 && screenings === 0,
        lastExport: last ? { at: last.at, by: last.user_name } : null,
      });
    }

    if (type === 'cases') {
      const { results } = await db
        .prepare(
          `SELECT c.id, c.full_name, c.age, c.gender, c.caregiver_phone, c.area, c.follow_up_date, c.sms_consent, c.created_at,
             u.name AS registered_by,
             (SELECT s.risk_level FROM screenings s WHERE s.child_id = c.id ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1) AS latest_risk,
             (SELECT MAX(s.created_at) FROM screenings s WHERE s.child_id = c.id) AS last_screened
           FROM children c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.created_at, c.rowid`,
        )
        .all<Record<string, unknown>>();
      await logAudit(db, request, actorOf(user), 'BACKUP_EXPORTED', { entityType: 'system', details: { type, rows: results.length } });
      return downloadResponse(
        toCsv(
          ['Case ID', 'Name', 'Age', 'Gender', 'Caregiver phone', 'Location', 'Follow-up date', 'SMS consent', 'Registered', 'Registered by', 'Latest risk', 'Last screened'],
          results.map((r) => [r.id, r.full_name, r.age, r.gender, r.caregiver_phone, r.area, r.follow_up_date, r.sms_consent === 1 ? 'Yes' : 'No', r.created_at, r.registered_by, r.latest_risk, r.last_screened]),
        ),
        `carelink-cases-${date}.csv`, 'text/csv',
      );
    }

    if (type === 'screenings') {
      const { results } = await db
        .prepare(
          `SELECT s.id, s.child_id, c.full_name, s.risk_level, s.score, s.created_at, u.name AS by_name
           FROM screenings s LEFT JOIN children c ON c.id = s.child_id LEFT JOIN users u ON u.id = s.recorded_by
           ORDER BY s.created_at, s.rowid`,
        )
        .all<Record<string, unknown>>();
      await logAudit(db, request, actorOf(user), 'BACKUP_EXPORTED', { entityType: 'system', details: { type, rows: results.length } });
      return downloadResponse(
        toCsv(
          ['Screening ID', 'Case ID', 'Child', 'Risk', 'Score', 'Screened at (UTC)', 'Recorded by'],
          results.map((r) => [r.id, r.child_id, r.full_name, r.risk_level, r.score, r.created_at, r.by_name]),
        ),
        `carelink-screenings-${date}.csv`, 'text/csv',
      );
    }

    if (type === 'audit') {
      const { clause, values } = auditFilter(params);
      const { results } = await db
        .prepare(`SELECT at, user_name, user_role, action, entity_type, entity_label, entity_id, details, ip FROM audit_log ${clause} ORDER BY rowid`)
        .bind(...values)
        .all<Record<string, unknown>>();
      await logAudit(db, request, actorOf(user), 'BACKUP_EXPORTED', { entityType: 'system', details: { type, rows: results.length } });
      return downloadResponse(
        toCsv(
          ['When (UTC)', 'User', 'Role', 'Action', 'Type', 'Subject', 'Subject ID', 'Details', 'IP address'],
          results.map((r) => [r.at, r.user_name, r.user_role, r.action, r.entity_type, r.entity_label, r.entity_id, r.details, r.ip]),
        ),
        `carelink-audit-${date}.csv`, 'text/csv',
      );
    }

    if (type === 'full') {
      const all = async (sql: string) => (await db.prepare(sql).all<Record<string, unknown>>()).results;
      const [users, children, screenings, smsLog, auditLog] = await Promise.all([
        all('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at, rowid'),
        all('SELECT id, full_name, age, gender, caregiver_phone, area, follow_up_date, sms_consent, sms_consent_at, sms_consent_by, created_by, created_at FROM children ORDER BY created_at, rowid'),
        all('SELECT id, child_id, answers, score, risk_level, recorded_by, created_at FROM screenings ORDER BY created_at, rowid'),
        all('SELECT id, child_id, to_phone, kind, for_date, message, status, provider_status, cost, error, created_at FROM sms_log ORDER BY created_at, rowid'),
        all('SELECT at, user_name, user_role, action, entity_type, entity_id, entity_label, details, ip FROM audit_log ORDER BY rowid'),
      ]);
      const backup = {
        meta: {
          app: 'carelink', format: 1, exportedAt: new Date().toISOString(), exportedBy: user.name,
          counts: { users: users.length, children: children.length, screenings: screenings.length, smsLog: smsLog.length, auditLog: auditLog.length },
          note: 'Contains patient data. Keep it on an encrypted device or drive, never in email or chat. Password hashes and API keys are not included.',
        },
        users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active === 1, createdAt: u.created_at })),
        children: children.map((c) => ({
          id: c.id, fullName: c.full_name, age: c.age, gender: c.gender, caregiverPhone: c.caregiver_phone, area: c.area,
          followUpDate: c.follow_up_date, smsConsent: c.sms_consent === 1, smsConsentAt: c.sms_consent_at, smsConsentBy: c.sms_consent_by,
          createdBy: c.created_by, createdAt: c.created_at,
        })),
        screenings: screenings.map((s) => ({
          id: s.id, childId: s.child_id, answers: (() => { try { return JSON.parse(String(s.answers)); } catch { return {}; } })(),
          score: s.score, riskLevel: s.risk_level, recordedBy: s.recorded_by, createdAt: s.created_at,
        })),
        smsLog, auditLog,
      };
      await logAudit(db, request, actorOf(user), 'BACKUP_EXPORTED', { entityType: 'system', details: { type, children: children.length, screenings: screenings.length } });
      return downloadResponse(JSON.stringify(backup, null, 2), `carelink-backup-${date}.json`, 'application/json');
    }

    return fail('Unknown download type', 400);
  } catch (err) {
    console.error('GET /api/admin/backup failed', err);
    return fail('Could not create the download', 500);
  }
}
