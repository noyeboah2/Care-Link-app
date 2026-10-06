import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { AREAS } from '@/lib/hospitals';
import { daysBetween, loadCases, todayStr, type CaseRow } from '@/lib/cases';
import { matches, parseFilters } from '@/lib/filters';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN', 'SUPERVISOR'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;

    const filters = parseFilters(new URL(request.url).searchParams);
    const everything = await loadCases(db, user);
    const cases = everything.filter((c) => matches(c, filters));
    const today = todayStr();
    const overdueOf = (c: CaseRow) => !!c.followUpDate && c.followUpDate < today;
    const stats = (list: CaseRow[]) => ({
      cases: list.length,
      screened: list.filter((c) => c.lastRisk !== null).length,
      highRisk: list.filter((c) => c.lastRisk === 'HIGH_RISK').length,
      overdue: list.filter(overdueOf).length,
    });

    const screened = cases.filter((c) => c.lastRisk !== null);
    const highRisk = cases.filter((c) => c.lastRisk === 'HIGH_RISK');
    const overdue = cases.filter(overdueOf);
    const dueToday = cases.filter((c) => c.followUpDate === today);

    // People you can filter by: every active worker, plus anyone who has registered a case.
    const people = await db
      .prepare("SELECT id, name, active FROM users WHERE role = 'WORKER' OR id IN (SELECT DISTINCT created_by FROM children WHERE created_by IS NOT NULL) ORDER BY name")
      .all<{ id: string; name: string; active: number }>();

    // Breakdowns ignore their own filter, so choosing one worker still lets you compare with the others.
    const forWorkers = everything.filter((c) => matches(c, filters, 'worker'));
    const workers = people.results
      .map((p) => ({ id: p.id, name: p.active === 1 ? p.name : `${p.name} (inactive)`, ...stats(forWorkers.filter((c) => c.createdBy === p.id)) }))
      .filter((w) => w.cases > 0 || people.results.find((p) => p.id === w.id)?.active === 1);
    const noOwner = forWorkers.filter((c) => c.createdBy === null);
    if (noOwner.length) workers.push({ id: 'none', name: 'No registered worker (older records)', ...stats(noOwner) });

    const forAreas = everything.filter((c) => matches(c, filters, 'area'));
    const areas = [...AREAS.map((a) => ({ id: a.id, label: a.label })), { id: 'unset', label: 'Location not set' }]
      .map((a) => ({ ...a, ...stats(forAreas.filter((c) => (a.id === 'unset' ? c.area === null : c.area === a.id))) }))
      .filter((a) => a.cases > 0);

    const inSet = new Set(cases.map((c) => c.id));
    const counts = await db.prepare('SELECT child_id, COUNT(*) AS n FROM screenings GROUP BY child_id').all<{ child_id: string; n: number }>();
    const totalScreenings = counts.results.reduce((sum, r) => sum + (inSet.has(r.child_id) ? r.n : 0), 0);

    const recent = await db
      .prepare(
        `SELECT s.child_id, c.full_name, s.risk_level, s.score, s.created_at, u.name AS by_name
         FROM screenings s JOIN children c ON c.id = s.child_id LEFT JOIN users u ON u.id = s.recorded_by
         ORDER BY s.created_at DESC, s.rowid DESC LIMIT 400`,
      )
      .all<{ child_id: string; full_name: string; risk_level: string; score: number; created_at: string; by_name: string | null }>();

    const caseRef = (c: CaseRow) => ({ id: c.id, name: c.fullName, phone: c.phone, workerName: c.ownerName ?? 'Unassigned', followUpDate: c.followUpDate });

    return NextResponse.json({
      success: true,
      filters,
      totals: {
        cases: cases.length,
        overallCases: everything.length,
        screened: screened.length,
        notScreened: cases.length - screened.length,
        screenings: totalScreenings,
        highRisk: highRisk.length,
        highRiskRate: screened.length ? Math.round((highRisk.length / screened.length) * 1000) / 10 : 0,
        overdue: overdue.length,
        dueToday: dueToday.length,
        activeWorkers: people.results.filter((p) => p.active === 1).length,
        unassigned: cases.filter((c) => !c.createdBy).length,
      },
      workers,
      areas,
      options: { workers: people.results.map((p) => ({ id: p.id, name: p.active === 1 ? p.name : `${p.name} (inactive)` })) },
      overdueList: overdue
        .map((c) => ({ ...caseRef(c), daysOverdue: daysBetween(c.followUpDate as string, today) }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .slice(0, 25),
      highRiskList: highRisk.map(caseRef).slice(0, 25),
      recentScreenings: recent.results
        .filter((r) => inSet.has(r.child_id))
        .slice(0, 10)
        .map((r) => ({ childId: r.child_id, childName: r.full_name, riskLevel: r.risk_level, score: r.score, createdAt: r.created_at, workerName: r.by_name })),
    });
  } catch (err) {
    console.error('GET /api/summary failed', err);
    return NextResponse.json({ success: false, error: 'Could not load the summary' }, { status: 500 });
  }
}
