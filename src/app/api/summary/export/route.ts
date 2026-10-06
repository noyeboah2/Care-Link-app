import { NextResponse } from 'next/server';
import { actorOf, logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { AREAS, areaLabel } from '@/lib/hospitals';
import { loadCases, todayStr } from '@/lib/cases';
import { downloadResponse, toCsv } from '@/lib/csv';
import { followUpStatus, matches, parseFilters } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const HIDDEN = 'Hidden';

// Exports for supervisors and admins. They follow the same filters as the portal.
// Phone numbers are left out unless asked for, and names can be hidden for reports shared outside the team.
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN', 'SUPERVISOR'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;
    const params = new URL(request.url).searchParams;
    const type = params.get('type');
    const filters = parseFilters(params);
    const includePhone = params.get('includePhone') === '1';
    const hideNames = params.get('hideNames') === '1';
    const date = todayStr();

    const cases = (await loadCases(db, user)).filter((c) => matches(c, filters));
    const label = (id: string | null) => areaLabel(id) ?? 'Not set';
    const name = (n: string) => (hideNames ? HIDDEN : n);
    const audit = (rows: number) =>
      logAudit(db, request, actorOf(user), 'DATA_EXPORTED', {
        entityType: 'system',
        details: { type, rows, includePhone, hideNames, filters: Object.entries(filters).filter(([, v]) => v).map(([k]) => k) },
      });

    if (type === 'cases') {
      await audit(cases.length);
      const last = await db.prepare('SELECT child_id, MAX(created_at) AS at FROM screenings GROUP BY child_id').all<{ child_id: string; at: string }>();
      const lastAt = new Map(last.results.map((r) => [r.child_id, r.at]));
      const headers = ['Case ID', 'Name', 'Age', 'Gender', ...(includePhone ? ['Caregiver phone'] : []), 'Location', 'Registered by', 'Registered', 'Latest risk', 'Last screened', 'Follow-up date', 'Follow-up status', 'SMS consent'];
      return downloadResponse(
        toCsv(
          headers,
          cases.map((c) => [
            c.id, name(c.fullName), c.age, c.gender, ...(includePhone ? [c.phone] : []), label(c.area), c.ownerName ?? 'Unassigned',
            c.createdAt, c.lastRisk ?? 'Not screened', lastAt.get(c.id) ?? '', c.followUpDate ?? '', followUpStatus(c, date), c.smsConsent ? 'Yes' : 'No',
          ]),
        ),
        `carelink-cases-report-${date}.csv`, 'text/csv',
      );
    }

    if (type === 'screenings') {
      const ids = new Map(cases.map((c) => [c.id, c]));
      const { results } = await db
        .prepare(
          `SELECT s.id, s.child_id, s.risk_level, s.score, s.created_at, u.name AS by_name
           FROM screenings s LEFT JOIN users u ON u.id = s.recorded_by ORDER BY s.created_at, s.rowid`,
        )
        .all<{ id: string; child_id: string; risk_level: string; score: number; created_at: string; by_name: string | null }>();
      const rows = results.filter((r) => ids.has(r.child_id));
      await audit(rows.length);
      return downloadResponse(
        toCsv(
          ['Screening ID', 'Case ID', 'Child', 'Location', 'Child registered by', 'Risk', 'Score', 'Screened at (UTC)', 'Recorded by'],
          rows.map((r) => {
            const c = ids.get(r.child_id)!;
            return [r.id, r.child_id, name(c.fullName), label(c.area), c.ownerName ?? 'Unassigned', r.risk_level, r.score, r.created_at, r.by_name ?? ''];
          }),
        ),
        `carelink-screenings-report-${date}.csv`, 'text/csv',
      );
    }

    // Counts only, with no names or phone numbers, so it is safe to share.
    if (type === 'report') {
      const row = (group: string, who: string, list: typeof cases) => {
        const screened = list.filter((c) => c.lastRisk !== null).length;
        const high = list.filter((c) => c.lastRisk === 'HIGH_RISK').length;
        return [group, who, list.length, screened, list.length - screened, high, screened ? `${Math.round((high / screened) * 1000) / 10}%` : '', list.filter((c) => c.followUpDate && c.followUpDate < date).length];
      };
      const people = new Map<string, string>();
      cases.forEach((c) => people.set(c.createdBy ?? 'none', c.ownerName ?? 'No registered worker'));
      const out: unknown[][] = [row('All', 'All matching cases', cases)];
      people.forEach((nm, id) => out.push(row('Health worker', nm, cases.filter((c) => (c.createdBy ?? 'none') === id))));
      [...AREAS.map((a) => ({ id: a.id, label: a.label })), { id: 'unset', label: 'Not set' }].forEach((a) => {
        const list = cases.filter((c) => (a.id === 'unset' ? c.area === null : c.area === a.id));
        if (list.length) out.push(row('Location', a.label, list));
      });
      await audit(out.length);
      return downloadResponse(
        toCsv(['Group', 'Name', 'Cases', 'Screened', 'Not screened', 'High risk', 'High-risk share of screened', 'Overdue follow-ups'], out),
        `carelink-summary-report-${date}.csv`, 'text/csv',
      );
    }

    return NextResponse.json({ success: false, error: 'Unknown export type' }, { status: 400 });
  } catch (err) {
    console.error('GET /api/summary/export failed', err);
    return NextResponse.json({ success: false, error: 'Could not create the export' }, { status: 500 });
  }
}
