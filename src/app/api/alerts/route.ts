import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { daysBetween, loadCases, todayStr } from '@/lib/cases';

export const dynamic = 'force-dynamic';

export interface AlertItem {
  id: string;
  name: string;
  kind: 'HIGH_RISK' | 'OVERDUE' | 'DUE_TODAY';
  detail: string;
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const cases = await loadCases(auth.db, auth.user);
    const today = todayStr();

    const items: AlertItem[] = [];
    for (const c of cases) {
      if (c.lastRisk === 'HIGH_RISK') items.push({ id: c.id, name: c.fullName, kind: 'HIGH_RISK', detail: 'High risk. Needs referral follow-up' });
    }
    for (const c of cases) {
      if (c.followUpDate && c.followUpDate < today) {
        const d = daysBetween(c.followUpDate, today);
        items.push({ id: c.id, name: c.fullName, kind: 'OVERDUE', detail: `Follow-up overdue by ${d} day${d === 1 ? '' : 's'}` });
      }
    }
    for (const c of cases) {
      if (c.followUpDate === today) items.push({ id: c.id, name: c.fullName, kind: 'DUE_TODAY', detail: 'Follow-up due today' });
    }

    return NextResponse.json({ success: true, total: items.length, items: items.slice(0, 30) });
  } catch (err) {
    console.error('GET /api/alerts failed', err);
    return NextResponse.json({ success: false, error: 'Could not load alerts' }, { status: 500 });
  }
}
