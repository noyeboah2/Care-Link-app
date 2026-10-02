import { getCloudflareContext } from '@opennextjs/cloudflare';

interface Stmt {
  bind(...values: unknown[]): Stmt;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface Db {
  prepare(query: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    caregiver_phone TEXT NOT NULL,
    follow_up_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS screenings (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    answers TEXT NOT NULL,
    score INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_screenings_child ON screenings(child_id, created_at)`,
];

let ready: Promise<void> | null = null;

// Returns the D1 database and makes sure the tables exist (safe to run repeatedly).
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: Db }).DB;
  if (!db) throw new Error('D1 binding "DB" is missing. Check wrangler.jsonc.');
  if (!ready) {
    ready = db
      .batch(SCHEMA.map((s) => db.prepare(s)))
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  await ready;
  return db;
}
