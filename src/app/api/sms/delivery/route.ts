import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Africa's Talking posts delivery reports here. Set this address in their dashboard under
// SMS > Callback URLs > Delivery Reports (the SMS tab shows the full address with its secret token).
const DELIVERED = ['Success'];
const FAILED = ['Failed', 'Rejected', 'AbsentSubscriber', 'Expired'];

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const expected = (await getSetting(db, 'sms_callback_token')) ?? '';
    if (!expected || token.length !== expected.length || token !== expected) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let id = '', status = '', reason = '';
    const type = request.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      const j = (await request.json()) as Record<string, unknown>;
      id = String(j.id ?? ''); status = String(j.status ?? ''); reason = String(j.failureReason ?? '');
    } else {
      const f = await request.formData();
      id = String(f.get('id') ?? ''); status = String(f.get('status') ?? ''); reason = String(f.get('failureReason') ?? '');
    }
    if (!id || !status) return NextResponse.json({ success: true }); // nothing useful; don't make them retry

    if (DELIVERED.includes(status)) {
      await db.prepare("UPDATE sms_log SET status = 'DELIVERED', provider_status = ?, error = NULL, updated_at = datetime('now') WHERE provider_id = ?").bind(status, id).run();
    } else if (FAILED.includes(status)) {
      await db.prepare("UPDATE sms_log SET status = 'FAILED', provider_status = ?, error = ?, updated_at = datetime('now') WHERE provider_id = ? AND status <> 'DELIVERED'").bind(status, reason || status, id).run();
    } else {
      // Sent / Submitted / Buffered: still on the way. Never move a delivered message backwards.
      await db.prepare("UPDATE sms_log SET provider_status = ?, updated_at = datetime('now') WHERE provider_id = ? AND status NOT IN ('DELIVERED','FAILED')").bind(status, id).run();
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/sms/delivery failed', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
