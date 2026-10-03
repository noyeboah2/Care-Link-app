import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { runReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

// Admin button: preview who would be texted today (dryRun) or send the reminders now.
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };
    const summary = await runReminders(auth.db, { dryRun: body.dryRun !== false });
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error('POST /api/sms/run failed', err);
    return NextResponse.json({ success: false, error: 'Could not run the reminders' }, { status: 500 });
  }
}
