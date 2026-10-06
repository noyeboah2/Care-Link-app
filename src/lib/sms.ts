import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Db } from '@/lib/db';
import { getSettings } from '@/lib/settings';

const LIVE_URL = 'https://api.africastalking.com';
const SANDBOX_URL = 'https://api.sandbox.africastalking.com';

export interface SmsConfig {
  configured: boolean; // username + API key are present
  enabled: boolean; // admin switched reminders on
  username: string;
  apiKey: string;
  senderId: string;
  baseUrl: string;
  credentialsFrom: 'env' | 'database' | 'none';
}

// Credentials can come from Cloudflare secrets (AT_USERNAME, AT_API_KEY, AT_SENDER_ID)
// or from the SMS tab (saved in the database). Secrets win if both exist.
export async function getSmsConfig(db: Db): Promise<SmsConfig> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const s = await getSettings(db, ['sms_at_username', 'sms_at_api_key', 'sms_sender_id', 'sms_enabled', 'sms_base_url']);

  const envUser = str(e.AT_USERNAME);
  const envKey = str(e.AT_API_KEY);
  const fromEnv = envUser !== '' && envKey !== '';
  const rawUser = fromEnv ? envUser : str(s.sms_at_username);
  const username = rawUser.toLowerCase() === 'sandbox' ? 'sandbox' : rawUser; // "Sandbox" works too
  const apiKey = fromEnv ? envKey : str(s.sms_at_api_key);
  const senderId = str(e.AT_SENDER_ID) || str(s.sms_sender_id);
  const override = str(e.AT_BASE_URL) || str(s.sms_base_url); // used for testing only
  const configured = username !== '' && apiKey !== '';
  return {
    configured,
    enabled: configured && s.sms_enabled === '1',
    username,
    apiKey,
    senderId,
    baseUrl: override || (username === 'sandbox' ? SANDBOX_URL : LIVE_URL),
    credentialsFrom: !configured ? 'none' : fromEnv ? 'env' : 'database',
  };
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  providerStatus?: string;
  cost?: string;
  error?: string;
  retryable?: boolean; // worth trying again later (network trouble, low balance)
}

// Africa's Talking: 100 Processed, 101 Sent, 102 Queued are accepted.
const ACCEPTED = [100, 101, 102];
const RETRY_CODES = [405]; // insufficient balance: may work after top-up

export async function sendSms(cfg: SmsConfig, to: string, message: string): Promise<SendResult> {
  const body = new URLSearchParams({ username: cfg.username, to, message });
  if (cfg.senderId) body.set('from', cfg.senderId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${cfg.baseUrl}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: cfg.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: { SMSMessageData?: { Message?: string; Recipients?: Array<{ statusCode?: number; status?: string; messageId?: string; cost?: string }> } } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!json) {
      const server = cfg.baseUrl.includes('sandbox') ? 'SANDBOX' : 'LIVE';
      return {
        ok: false,
        retryable: res.status >= 500,
        error: res.status === 401
          ? `Africa's Talking rejected the login (HTTP 401). Tried the ${server} server with username "${cfg.username}". The API key must come from the same app as the username (sandbox key with username "sandbox", live key with your live app name).`
          : `Provider replied HTTP ${res.status}`,
      };
    }
    const rec = json.SMSMessageData?.Recipients?.[0];
    if (rec && ACCEPTED.includes(Number(rec.statusCode))) {
      return { ok: true, providerId: rec.messageId, providerStatus: rec.status, cost: rec.cost };
    }
    const reason = rec ? `${rec.status ?? 'Rejected'} (code ${rec.statusCode})` : json.SMSMessageData?.Message || `HTTP ${res.status}`;
    return { ok: false, error: reason, retryable: rec ? RETRY_CODES.includes(Number(rec.statusCode)) : res.status >= 500 };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, retryable: true, error: aborted ? 'The SMS provider did not answer in time' : 'Could not reach the SMS provider' };
  } finally {
    clearTimeout(timer);
  }
}

export const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}••••${p.slice(-3)}` : p);
