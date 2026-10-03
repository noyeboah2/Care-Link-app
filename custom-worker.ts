// Wraps the generated app so Cloudflare can also run it on a schedule.
// Every day at 09:00 (Ghana time = UTC) it asks the app to send the due SMS reminders.
// @ts-ignore - generated at build time by `npm run cf:build`
import handler from './.open-next/worker.js';

// @ts-ignore - generated at build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

type Handler = { fetch: (...args: unknown[]) => Promise<Response> };
type Stmt = { bind(...v: unknown[]): Stmt; run(): Promise<unknown>; first<T>(): Promise<T | null> };
type Db = { prepare(q: string): Stmt };

// A private key that lives only in the database. The scheduled job reads it and presents it to
// /api/cron/reminders, so nobody on the internet can start a reminder run by calling that address.
async function getCronKey(db: Db): Promise<string> {
  await db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  const read = () => db.prepare("SELECT value FROM settings WHERE key = 'cron_key'").first<{ value: string }>();
  let row = await read();
  if (!row) {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cron_key', ?)").bind(key).run();
    row = await read();
  }
  return (row as { value: string }).value;
}

export default {
  fetch: (handler as Handler).fetch,

  async scheduled(_event: unknown, env: { DB: Db }, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      (async () => {
        try {
          const request = new Request('https://carelink.internal/api/cron/reminders', {
            method: 'POST',
            headers: { 'x-cron-key': await getCronKey(env.DB) },
          });
          const res = await (handler as Handler).fetch(request, env, ctx);
          console.log('Scheduled reminders finished with status', res.status);
        } catch (err) {
          console.error('Scheduled reminders crashed', err);
        }
      })(),
    );
  },
};
