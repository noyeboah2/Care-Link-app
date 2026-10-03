import type { Db } from '@/lib/db';
import { canSeeAll, type SessionUser } from '@/lib/auth';

export interface CaseRow {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string;
  followUpDate: string | null;
  lastRisk: 'HIGH_RISK' | 'LOW_RISK' | null;
  createdBy: string | null;
  ownerName: string | null;
}

// Ghana is on GMT all year, so the UTC date is the local date.
export const todayStr = () => new Date().toISOString().slice(0, 10);

export const daysBetween = (fromDate: string, toDate: string) =>
  Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000);

// All cases the user is allowed to see (workers: their own; supervisors/admins: everyone).
export async function loadCases(db: Db, user: SessionUser): Promise<CaseRow[]> {
  const onlyMine = !canSeeAll(user.role);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.full_name, c.age, c.gender, c.caregiver_phone, c.follow_up_date, c.created_by,
         u.name AS owner_name,
         (SELECT s.risk_level FROM screenings s WHERE s.child_id = c.id
          ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1) AS last_risk
       FROM children c
       LEFT JOIN users u ON u.id = c.created_by
       ${onlyMine ? 'WHERE c.created_by = ?' : ''}
       ORDER BY c.created_at DESC, c.rowid DESC`,
    )
    .bind(...(onlyMine ? [user.id] : []))
    .all<{
      id: string; full_name: string; age: number; gender: string; caregiver_phone: string;
      follow_up_date: string | null; created_by: string | null; owner_name: string | null;
      last_risk: 'HIGH_RISK' | 'LOW_RISK' | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    age: r.age,
    gender: r.gender,
    phone: r.caregiver_phone,
    followUpDate: r.follow_up_date,
    lastRisk: r.last_risk,
    createdBy: r.created_by,
    ownerName: r.owner_name,
  }));
}

export { normalizePhone, validDate } from '@/lib/validation';
