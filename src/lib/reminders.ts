import type { Db } from '@/lib/db';
import { daysBetween, todayStr } from '@/lib/cases';
import { getSmsConfig, sendSms } from '@/lib/sms';
import { normalizePhone } from '@/lib/validation';

export type Kind = 'DAY_BEFORE' | 'DUE_TODAY' | 'OVERDUE';

const OVERDUE_WINDOW_DAYS = 14; // stop texting about follow-ups older than this
const MAX_SENDS_PER_RUN = 35; // keeps one run within Cloudflare's limits on the free plan
const MAX_ATTEMPTS = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const firstName = (full: string) => full.trim().split(/\s+/)[0].slice(0, 20);

// Messages never name the condition: a phone may be read by other people.
export function buildMessage(kind: Kind, fullName: string, date: string): string {
  const n = firstName(fullName);
  if (kind === 'DAY_BEFORE') return `CareLink: ${n}'s clinic follow-up is tomorrow (${fmt(date)}). Can't attend? Tell your health worker. To stop these reminders, tell them too.`;
  if (kind === 'DUE_TODAY') return `CareLink: ${n}'s clinic follow-up is today (${fmt(date)}). Please attend. Can't come? Tell your health worker.`;
  return `CareLink: ${n} missed the clinic follow-up on ${fmt(date)}. Please visit the clinic soon or contact your health worker.`;
}

export interface Planned {
  childId: string;
  firstName: string;
  phone: string;
  kind: Kind;
  forDate: string;
  message: string;
}

// Which reminders are due today, for children whose caregiver agreed to SMS.
export async function planReminders(db: Db, today: string): Promise<Planned[]> {
  const from = new Date(Date.parse(today) - OVERDUE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.full_name, c.caregiver_phone, c.follow_up_date,
         (SELECT MAX(date(s.created_at)) FROM screenings s WHERE s.child_id = c.id) AS last_screened
       FROM children c
       WHERE c.is_demo = 0 AND c.sms_consent = 1 AND c.follow_up_date IS NOT NULL AND c.follow_up_date BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .all<{ id: string; full_name: string; caregiver_phone: string; follow_up_date: string; last_screened: string | null }>();

  const out: Planned[] = [];
  for (const r of results) {
    const phone = normalizePhone(r.caregiver_phone);
    if (!phone) continue;
    const diff = daysBetween(today, r.follow_up_date); // +1 tomorrow, 0 today, negative = overdue
    const done = r.last_screened !== null && r.last_screened >= r.follow_up_date; // seen on or after the date
    let kind: Kind | null = null;
    if (diff === 1) kind = 'DAY_BEFORE';
    else if (diff === 0 && !done) kind = 'DUE_TODAY';
    else if (diff < 0 && !done) kind = 'OVERDUE';
    if (!kind) continue;
    out.push({
      childId: r.id, firstName: firstName(r.full_name), phone, kind, forDate: r.follow_up_date,
      message: buildMessage(kind, r.full_name, r.follow_up_date),
    });
  }
  return out;
}

export interface RunSummary {
  dryRun: boolean;
  skipped?: string;
  today: string;
  due: Array<{ firstName: string; kind: Kind; forDate: string; state: 'new' | 'already planned' | 'already sent' }>;
  queued: number;
  sent: number;
  failed: number;
  remaining: number;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function runReminders(db: Db, opts: { dryRun: boolean }): Promise<RunSummary> {
  const today = todayStr();
  const summary: RunSummary = { dryRun: opts.dryRun, today, due: [], queued: 0, sent: 0, failed: 0, remaining: 0 };
  const cfg = await getSmsConfig(db);
  if (!opts.dryRun && (!cfg.configured || !cfg.enabled)) {
    summary.skipped = !cfg.configured ? 'SMS credentials are not set up yet' : 'SMS reminders are switched off';
    return summary;
  }

  const planned = await planReminders(db, today);
  const { results: existing } = await db
    .prepare('SELECT child_id, kind, for_date, status FROM sms_log WHERE for_date >= ?')
    .bind(new Date(Date.parse(today) - 20 * 86400000).toISOString().slice(0, 10))
    .all<{ child_id: string; kind: string; for_date: string; status: string }>();
  const have = new Map(existing.map((e) => [`${e.child_id}|${e.kind}|${e.for_date}`, e.status]));

  for (const p of planned) {
    const st = have.get(`${p.childId}|${p.kind}|${p.forDate}`);
    summary.due.push({
      firstName: p.firstName, kind: p.kind, forDate: p.forDate,
      state: !st ? 'new' : st === 'QUEUED' || st === 'FAILED' ? 'already planned' : 'already sent',
    });
  }
  if (opts.dryRun) return summary;

  // 1. Record new reminders (the unique index stops duplicates).
  const fresh = planned.filter((p) => !have.has(`${p.childId}|${p.kind}|${p.forDate}`));
  for (const group of chunk(fresh, 40)) {
    await db.batch(
      group.map((p) =>
        db
          .prepare("INSERT OR IGNORE INTO sms_log (id, child_id, to_phone, kind, for_date, message, status) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED')")
          .bind(crypto.randomUUID(), p.childId, p.phone, p.kind, p.forDate, p.message),
      ),
    );
  }
  summary.queued = fresh.length;

  // 2. Cancel anything whose caregiver withdrew consent or whose case was deleted; expire stale ones.
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const stale = new Date(Date.parse(today) - OVERDUE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  await db.batch([
    db.prepare(
      `UPDATE sms_log SET status = 'CANCELLED', updated_at = datetime('now')
       WHERE status IN ('QUEUED','FAILED') AND provider_id IS NULL
         AND (child_id NOT IN (SELECT id FROM children) OR child_id IN (SELECT id FROM children WHERE sms_consent = 0))`,
    ),
    db
      .prepare(
        `UPDATE sms_log SET status = 'EXPIRED', updated_at = datetime('now')
         WHERE status IN ('QUEUED','FAILED') AND provider_id IS NULL
           AND ((kind = 'DAY_BEFORE' AND for_date <= ?) OR (kind = 'DUE_TODAY' AND for_date < ?) OR (kind = 'OVERDUE' AND for_date < ?))`,
      )
      .bind(today, today, stale),
  ]);

  // 3. Send what is waiting (limited per run).
  const { results: pending } = await db
    .prepare(
      `SELECT id, to_phone, message, attempts FROM sms_log
       WHERE (status = 'QUEUED' OR (status = 'FAILED' AND provider_id IS NULL AND attempts < ?))
       ORDER BY created_at, rowid LIMIT ?`,
    )
    .bind(MAX_ATTEMPTS, MAX_SENDS_PER_RUN + 1)
    .all<{ id: string; to_phone: string; message: string; attempts: number }>();
  const batchToSend = pending.slice(0, MAX_SENDS_PER_RUN);
  summary.remaining = pending.length - batchToSend.length;

  const updates = [];
  for (const row of batchToSend) {
    const r = await sendSms(cfg, row.to_phone, row.message);
    if (r.ok) {
      summary.sent++;
      updates.push(
        db
          .prepare("UPDATE sms_log SET status = 'SENT', provider_id = ?, provider_status = ?, cost = ?, error = NULL, attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?")
          .bind(r.providerId ?? null, r.providerStatus ?? null, r.cost ?? null, row.id),
      );
    } else {
      summary.failed++;
      // Non-retryable problems (bad number, blocked) stop here; temporary ones are tried again later.
      const attempts = r.retryable ? row.attempts + 1 : MAX_ATTEMPTS;
      updates.push(
        db
          .prepare("UPDATE sms_log SET status = 'FAILED', error = ?, attempts = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(r.error ?? 'Unknown error', attempts, row.id),
      );
    }
  }
  for (const group of chunk(updates, 40)) await db.batch(group);
  return summary;
}
