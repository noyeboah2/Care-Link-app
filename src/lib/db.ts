import { getCloudflareContext } from '@opennextjs/cloudflare';

interface Stmt {
  bind(...values: unknown[]): Stmt;
  run(): Promise<{ meta?: { changes?: number } }>;
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
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    must_change INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_email ON login_attempts(email, at)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

// Columns added after the first release. Added only if missing.
const ADDED_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ['children', 'created_by', 'created_by TEXT'],
  ['screenings', 'recorded_by', 'recorded_by TEXT'],
];

let ready: Promise<void> | null = null;

async function setup(db: Db) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if (!results.some((r) => r.name === column)) {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
    }
  }
}

// Returns the D1 database and makes sure the tables exist (safe to run repeatedly).
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: Db }).DB;
  if (!db) throw new Error('D1 binding "DB" is missing. Check wrangler.jsonc.');
  if (!ready) {
    ready = setup(db).catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
  return db;
}

export type SetupInfo = {
  code: string | null;
  source: 'secret' | 'database' | null;
  secretStatus: 'missing' | 'too_short' | 'ok';
};

// The setup code can come from the SETUP_CODE secret (preferred) or, as a backup,
// from a row in the settings table: key = 'setup_code'. Both need 8+ characters.
export async function getSetupInfo(db: Db): Promise<SetupInfo> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as { SETUP_CODE?: unknown }).SETUP_CODE;
  const secretStatus: SetupInfo['secretStatus'] =
    typeof secret !== 'string' || secret.length === 0 ? 'missing' : secret.length < 8 ? 'too_short' : 'ok';
  if (secretStatus === 'ok') return { code: secret as string, source: 'secret', secretStatus };

  const row = await db.prepare("SELECT value FROM settings WHERE key = 'setup_code'").first<{ value: string }>();
  if (row && typeof row.value === 'string' && row.value.trim().length >= 8) {
    return { code: row.value.trim(), source: 'database', secretStatus };
  }
  return { code: null, source: null, secretStatus };
}
