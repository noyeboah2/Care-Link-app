import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { daysBetween, loadCases, todayStr } from '@/lib/cases';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN', 'SUPERVISOR'] });
    if ('error' in auth) return auth.error;
    const { user, db } = auth;

    const cases = await loadCases(db, user);
    const today = todayStr();
    const screened = cases.filter((c) => c.lastRisk !== null);
    const highRisk = cases.filter((c) => c.lastRisk === 'HIGH_RISK');
    const overdue = cases.filter((c) => c.followUpDate && c.followUpDate < today);
    const dueToday = cases.filter((c) => c.followUpDate === today);

    const workerRows = await db
      .prepare("SELECT id, name FROM users WHERE active = 1 AND role = 'WORKER' ORDER BY name")
      .all<{ id: string; name: string }>();
    const workers = workerRows.results.map((w) => {
      const mine = cases.filter((c) => c.createdBy === w.id);
      return {
        id: w.id,
        name: w.name,
        cases: mine.length,
        screened: mine.filter((c) => c.lastRisk !== null).length,
        highRisk: mine.filter((c) => c.lastRisk === 'HIGH_RISK').length,
        overdue: mine.filter((c) => c.followUpDate && c.followUpDate < today).length,
      };
    });
    const unassigned = cases.filter((c) => !c.createdBy).length;

    const totalScreenings = await db.prepare('SELECT COUNT(*) AS n FROM screenings').first<{ n: number }>();
    const recent = await db
      .prepare(
        `SELECT s.child_id, c.full_name, s.risk_level, s.score, s.created_at, u.name AS by_name
         FROM screenings s JOIN children c ON c.id = s.child_id LEFT JOIN users u ON u.id = s.recorded_by
         ORDER BY s.created_at DESC, s.rowid DESC LIMIT 10`,
      )
      .all<{ child_id: string; full_name: string; risk_level: string; score: number; created_at: string; by_name: string | null }>();

    const caseRef = (c: (typeof cases)[number]) => ({
      id: c.id, name: c.fullName, phone: c.phone, workerName: c.ownerName ?? 'Unassigned', followUpDate: c.followUpDate,
    });

    return NextResponse.json({
      success: true,
      totals: {
        cases: cases.length,
        screened: screened.length,
        notScreened: cases.length - screened.length,
        screenings: totalScreenings?.n ?? 0,
        highRisk: highRisk.length,
        highRiskRate: screened.length ? Math.round((highRisk.length / screened.length) * 1000) / 10 : 0,
        overdue: overdue.length,
        dueToday: dueToday.length,
        activeWorkers: workers.length,
        unassigned,
      },
      workers,
      overdueList: overdue
        .map((c) => ({ ...caseRef(c), daysOverdue: daysBetween(c.followUpDate as string, today) }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .slice(0, 25),
      highRiskList: highRisk.map(caseRef).slice(0, 25),
      recentScreenings: recent.results.map((r) => ({
        childId: r.child_id, childName: r.full_name, riskLevel: r.risk_level, score: r.score, createdAt: r.created_at, workerName: r.by_name,
      })),
    });
  } catch (err) {
    console.error('GET /api/summary failed', err);
    return NextResponse.json({ success: false, error: 'Could not load the summary' }, { status: 500 });
  }
}
