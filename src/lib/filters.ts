import { AREA_IDS } from '@/lib/hospitals';
import { isUuid, validDate } from '@/lib/validation';
import type { CaseRow } from '@/lib/cases';

// Filters used by the Supervisor Portal and its exports. They describe a set of cases.
export interface Filters {
  workerId: string; // '' = everyone, 'none' = cases with no registered worker, otherwise a user id
  area: string; // '' = everywhere, 'unset' = no location recorded, otherwise an area id
  risk: '' | 'HIGH_RISK' | 'LOW_RISK' | 'NOT_SCREENED';
  from: string; // registered on or after (YYYY-MM-DD)
  to: string; // registered on or before
}

export function parseFilters(params: URLSearchParams): Filters {
  const w = params.get('workerId') ?? '';
  const a = params.get('area') ?? '';
  const r = params.get('risk') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    workerId: w === 'none' || isUuid(w) ? w : '',
    area: a === 'unset' || AREA_IDS.includes(a) ? a : '',
    risk: r === 'HIGH_RISK' || r === 'LOW_RISK' || r === 'NOT_SCREENED' ? r : '',
    from: validDate(from) ? from : '',
    to: validDate(to) ? to : '',
  };
}

// `skip` lets a breakdown ignore its own filter so you can compare all workers or all locations.
export function matches(c: CaseRow, f: Filters, skip?: 'worker' | 'area'): boolean {
  if (skip !== 'worker' && f.workerId) {
    if (f.workerId === 'none' ? c.createdBy !== null : c.createdBy !== f.workerId) return false;
  }
  if (skip !== 'area' && f.area) {
    if (f.area === 'unset' ? c.area !== null : c.area !== f.area) return false;
  }
  if (f.risk) {
    const status = c.lastRisk ?? 'NOT_SCREENED';
    if (status !== f.risk) return false;
  }
  const registered = c.createdAt.slice(0, 10);
  if (f.from && registered < f.from) return false;
  if (f.to && registered > f.to) return false;
  return true;
}

export const followUpStatus = (c: CaseRow, today: string) =>
  !c.followUpDate ? 'None' : c.followUpDate < today ? 'Overdue' : c.followUpDate === today ? 'Due today' : 'Upcoming';
