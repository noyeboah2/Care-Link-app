// Demo mode: made-up children so a reviewer can look around the app without any real patient data.
// Demo rows are flagged is_demo = 1. They are never texted, and every demo login is switched off
// the moment a real (non-demo) child record exists.
import type { Db } from '@/lib/db';
import { realDataExists } from '@/lib/auth';
import { setSetting } from '@/lib/settings';
import { SCREENING_QUESTIONS, scoreAnswers } from '@/lib/risk';

export class DemoBlockedError extends Error {
  constructor() {
    super('Real records exist, so demo data cannot be loaded. Clear the test data first.');
  }
}

const WORKERS = [
  { id: 'demo-worker-0001', email: 'demo.worker1@carelink.invalid', name: 'Demo Health Worker A' },
  { id: 'demo-worker-0002', email: 'demo.worker2@carelink.invalid', name: 'Demo Health Worker B' },
  { id: 'demo-worker-0003', email: 'demo.worker3@carelink.invalid', name: 'Demo Health Worker C' },
];

// [name, age, gender, area, symptoms that were present, days since screening, follow-up offset in days (null = none)]
type Case = [string, number, 'Male' | 'Female', string, string[], number, number | null];
const DEMO_CASES: Case[] = [
  ['Ama Demo Mensah', 4, 'Female', 'bantama', ['severePain', 'dactylitis'], 3, 2],
  ['Kofi Demo Boateng', 7, 'Male', 'knust', [], 10, 20],
  ['Akosua Demo Owusu', 2, 'Female', 'asokwa', ['jaundice', 'fatigue', 'fever'], 1, 1],
  ['Yaw Demo Asante', 9, 'Male', 'atonsu', ['fatigue'], 25, 5],
  ['Abena Demo Kyei', 5, 'Female', 'suntreso', ['dactylitis', 'jaundice'], 6, -3],
  ['Kwame Demo Appiah', 11, 'Male', 'agogo', [], 40, null],
  ['Efua Demo Sarpong', 3, 'Female', 'ankaase', ['severePain', 'fever'], 2, 0],
  ['Kwesi Demo Adjei', 8, 'Male', 'offinso', ['jaundice'], 14, 14],
  ['Adwoa Demo Darko', 6, 'Female', 'obuasi', ['severePain', 'fatigue', 'jaundice'], 4, 3],
  ['Nana Demo Frimpong', 13, 'Male', 'other-kumasi', [], 30, null],
  ['Afia Demo Gyamfi', 1, 'Female', 'bantama', ['dactylitis', 'fever'], 0, 1],
  ['Kojo Demo Agyei', 10, 'Male', 'knust', ['fatigue', 'jaundice'], 18, 9],
  ['Esi Demo Ofori', 12, 'Female', 'asokwa', [], 50, null],
  ['Kwabena Demo Tetteh', 6, 'Male', 'atonsu', ['severePain', 'dactylitis', 'fever'], 5, -1],
  ['Maame Demo Nkrumah', 15, 'Female', 'suntreso', [], 22, 30],
  ['Fiifi Demo Quaye', 4, 'Male', 'agogo', ['jaundice', 'fatigue'], 8, 6],
  ['Araba Demo Sackey', 9, 'Female', 'ankaase', ['fatigue'], 33, null],
  ['Yaa Demo Badu', 3, 'Female', 'offinso', ['severePain', 'jaundice'], 2, 4],
  ['Kwaku Demo Ntim', 14, 'Male', 'obuasi', [], 45, null],
  ['Akua Demo Bonsu', 7, 'Female', 'other', ['dactylitis', 'fatigue'], 12, 7],
  ['Kofi Demo Amoah', 5, 'Male', 'bantama', ['fever'], 7, 10],
  ['Ama Demo Antwi', 8, 'Female', 'knust', ['severePain', 'dactylitis', 'jaundice'], 1, 2],
  ['Yaw Demo Larbi', 16, 'Male', 'asokwa', [], 60, null],
  ['Abenaa Demo Yeboah', 2, 'Female', 'suntreso', ['jaundice', 'fatigue', 'fever'], 0, 0],
];

const DAY = 86400000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const isoTime = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 19).replace('T', ' ');
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function removeDemoData(db: Db): Promise<number> {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM children WHERE is_demo = 1').first<{ n: number }>();
  await db.batch([
    db.prepare('DELETE FROM screenings WHERE child_id IN (SELECT id FROM children WHERE is_demo = 1)'),
    db.prepare('DELETE FROM sms_log WHERE child_id IN (SELECT id FROM children WHERE is_demo = 1)'),
    db.prepare('DELETE FROM children WHERE is_demo = 1'),
  ]);
  return n?.n ?? 0;
}

export async function loadDemoData(db: Db): Promise<number> {
  if (await realDataExists(db)) throw new DemoBlockedError();
  await removeDemoData(db);

  // Fixed-id demo workers that nobody can sign in as (the stored hash never matches any password).
  await db.batch(
    WORKERS.map((w) =>
      db
        .prepare("INSERT OR IGNORE INTO users (id, email, name, role, password_hash, must_change, active, is_demo) VALUES (?, ?, ?, 'WORKER', 'x$disabled', 0, 0, 1)")
        .bind(w.id, w.email, w.name),
    ),
  );

  const children: Array<{ id: string; c: Case; worker: string }> = DEMO_CASES.map((c, i) => ({
    id: `demo-child-${String(i + 1).padStart(4, '0')}`,
    c,
    worker: WORKERS[i % WORKERS.length].id,
  }));

  for (const part of chunk(children, 8)) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO children (id, full_name, age, gender, caregiver_phone, area, created_by, sms_consent, follow_up_date, created_at, is_demo) VALUES ${part
            .map(() => '(?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)')
            .join(',')}`,
        )
        .bind(
          ...part.flatMap(({ id, c, worker }, i) => [
            id, c[0], c[1], c[2], `020000${String(i).padStart(4, '0')}`, c[3], worker,
            c[6] === null ? null : isoDate(c[6]), isoTime(-c[5] - 1),
          ]),
        ),
    ]);
  }

  const screenings = children.map(({ id, c, worker }, i) => {
    const answers: Record<string, boolean> = {};
    for (const q of SCREENING_QUESTIONS) answers[q.id] = c[4].includes(q.id);
    const { score, riskLevel } = scoreAnswers(answers);
    return [`demo-screening-${String(i + 1).padStart(4, '0')}`, id, JSON.stringify(answers), score, riskLevel, worker, isoTime(-c[5])];
  });
  for (const part of chunk(screenings, 14)) {
    await db.batch([
      db
        .prepare(`INSERT INTO screenings (id, child_id, answers, score, risk_level, recorded_by, created_at) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',')}`)
        .bind(...part.flat()),
    ]);
  }

  await setSetting(db, 'demo_loaded_on', isoDate(0));
  return children.length;
}

// Called by the daily job: keeps follow-up dates and screening times fresh so the demo never looks stale.
export async function refreshDemoIfActive(db: Db): Promise<'no demo login' | 'real records present' | 'refreshed'> {
  const has = await db.prepare("SELECT EXISTS(SELECT 1 FROM users WHERE is_demo = 1 AND active = 1 AND role = 'SUPERVISOR') AS x").first<{ x: number }>();
  if (!has || has.x !== 1) return 'no demo login';
  if (await realDataExists(db)) return 'real records present';
  await loadDemoData(db);
  return 'refreshed';
}
