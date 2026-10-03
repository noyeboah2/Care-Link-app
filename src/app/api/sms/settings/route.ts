import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getSmsConfig } from '@/lib/sms';
import { getSetting, setSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

async function callbackToken(db: Parameters<typeof getSetting>[0]) {
  let token = await getSetting(db, 'sms_callback_token');
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    await setSetting(db, 'sms_callback_token', token);
  }
  return token;
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const cfg = await getSmsConfig(auth.db);
    return NextResponse.json({
      success: true,
      configured: cfg.configured,
      enabled: cfg.enabled,
      username: cfg.username,
      senderId: cfg.senderId,
      hasApiKey: cfg.apiKey !== '',
      credentialsFrom: cfg.credentialsFrom,
      sandbox: cfg.username === 'sandbox',
      callbackToken: await callbackToken(auth.db),
    });
  } catch (err) {
    console.error('GET /api/sms/settings failed', err);
    return fail('Could not load SMS settings', 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const body = (await request.json()) as Record<string, unknown>;
    const { db } = auth;

    if ('username' in body) {
      const v = typeof body.username === 'string' ? body.username.trim() : '';
      if (v.length > 64) return fail('Username is too long', 400);
      await setSetting(db, 'sms_at_username', v);
    }
    if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') {
      if (body.apiKey.trim().length > 200) return fail('API key is too long', 400);
      await setSetting(db, 'sms_at_api_key', body.apiKey.trim());
    }
    if ('senderId' in body) {
      const v = typeof body.senderId === 'string' ? body.senderId.trim() : '';
      if (v && !/^[A-Za-z0-9 ]{1,11}$/.test(v)) return fail('Sender ID can have up to 11 letters or numbers', 400);
      await setSetting(db, 'sms_sender_id', v);
    }
    if ('enabled' in body) {
      if (body.enabled === true) {
        const cfg = await getSmsConfig(db);
        if (!cfg.configured) return fail('Enter the Africa’s Talking username and API key first', 400);
      }
      await setSetting(db, 'sms_enabled', body.enabled === true ? '1' : '0');
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/sms/settings failed', err);
    return fail('Could not save SMS settings', 500);
  }
}
