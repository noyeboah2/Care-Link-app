import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  full_name: string;
  age: number;
  gender: string;
  caregiver_phone: string;
  follow_up_date: string | null;
  last_risk: 'HIGH_RISK' | 'LOW_RISK' | null;
};

export async function GET() {
  try {
    const db = await getDb();
    const { results } = await db
      .prepare(
        `SELECT c.id, c.full_name, c.age, c.gender, c.caregiver_phone, c.follow_up_date,
           (SELECT s.risk_level FROM screenings s WHERE s.child_id = c.id
            ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1) AS last_risk
         FROM children c
         ORDER BY c.created_at DESC, c.rowid DESC`,
      )
      .all<Row>();

    const today = new Date().toISOString().slice(0, 10);
    const children = results.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      age: r.age,
      gender: r.gender,
      caregiverPhone: r.caregiver_phone,
      followUpDate: r.follow_up_date,
      lastRisk: r.last_risk ?? 'PENDING',
      followUpStatus:
        r.follow_up_date && r.follow_up_date < today ? 'OVERDUE' : 'PENDING',
    }));

    const stats = {
      totalActive: children.length,
      followUpsToday: children.filter((c) => c.followUpDate === today).length,
      pendingScreenings: children.filter((c) => c.lastRisk === 'PENDING').length,
      crisisAlerts: children.filter((c) => c.lastRisk === 'HIGH_RISK').length,
    };

    return NextResponse.json({ success: true, children, stats });
  } catch (err) {
    console.error('GET /api/children failed', err);
    return NextResponse.json({ success: false, error: 'Could not load cases' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const age = typeof body.age === 'number' ? body.age : Number(body.age);
    const gender = body.gender;
    const rawPhone = typeof body.caregiverPhone === 'string' ? body.caregiverPhone.replace(/[\s-]/g, '') : '';

    if (fullName.length < 2 || fullName.length > 100) {
      return NextResponse.json({ success: false, error: "Enter the child's full name" }, { status: 400 });
    }
    if (!Number.isInteger(age) || age < 0 || age > 18) {
      return NextResponse.json({ success: false, error: 'Age must be a whole number from 0 to 18' }, { status: 400 });
    }
    if (gender !== 'Male' && gender !== 'Female') {
      return NextResponse.json({ success: false, error: 'Choose a gender' }, { status: 400 });
    }
    if (!/^(\+233|0)\d{9}$/.test(rawPhone)) {
      return NextResponse.json({ success: false, error: 'Use a Ghana phone number, e.g. 0244123456' }, { status: 400 });
    }
    const phone = rawPhone.startsWith('0') ? '+233' + rawPhone.slice(1) : rawPhone;

    const db = await getDb();
    const id = crypto.randomUUID();
    await db
      .prepare('INSERT INTO children (id, full_name, age, gender, caregiver_phone) VALUES (?, ?, ?, ?, ?)')
      .bind(id, fullName, age, gender, phone)
      .run();

    return NextResponse.json({
      success: true,
      child: { id, fullName, age, gender, caregiverPhone: phone, followUpDate: null, lastRisk: 'PENDING', followUpStatus: 'PENDING' },
    });
  } catch (err) {
    console.error('POST /api/children failed', err);
    return NextResponse.json({ success: false, error: 'Could not save the case' }, { status: 500 });
  }
}
