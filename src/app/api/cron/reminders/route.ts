import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { runReminders } from '@/lib/reminders';
import { refreshDemoIfActive } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// Called once a day by the Worker's scheduled trigger (custom-worker.ts). It must present the
// private key stored in the database; anyone else gets "not found".
async function handle(request: Request) {
  const notFound = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  try {
    const db = await getDb();
    const given = request.headers.get('x-cron-key') ?? '';
    const expected = (await getSetting(db, 'cron_key')) ?? '';
    if (!expected || given.length !== expected.length || given !== expected) return notFound();

    const summary = await runReminders(db, { dryRun: false });
    console.log('Daily reminders', JSON.stringify({ ...summary, due: summary.due.length }));
    const demo = await refreshDemoIfActive(db).catch((e) => { console.error('Demo refresh failed', e); return 'failed'; });
    console.log('Demo refresh', demo);
    return NextResponse.json({ success: true, summary, demo });
  } catch (err) {
    console.error('Daily reminders failed', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
