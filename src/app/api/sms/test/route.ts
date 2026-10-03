import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getSmsConfig, sendSms } from '@/lib/sms';
import { normalizePhone } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Sends one test message to a number the admin types in.
export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const body = (await request.json()) as { to?: unknown };
    const to = normalizePhone(body.to);
    if (!to) return fail('Use a Ghana phone number, e.g. 0244123456', 400);
    const cfg = await getSmsConfig(auth.db);
    if (!cfg.configured) return fail('Enter the Africa’s Talking username and API key first', 400);

    const r = await sendSms(cfg, to, 'CareLink test message: SMS reminders are set up correctly.');
    if (!r.ok) return fail(r.error ?? 'The message was not accepted', 502);
    return NextResponse.json({ success: true, status: r.providerStatus, cost: r.cost, messageId: r.providerId });
  } catch (err) {
    console.error('POST /api/sms/test failed', err);
    return fail('Could not send the test message', 500);
  }
}
