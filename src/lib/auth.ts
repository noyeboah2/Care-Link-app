import { NextResponse } from 'next/server';
import { getDb, type Db } from '@/lib/db';

export type Role = 'ADMIN' | 'SUPERVISOR' | 'WORKER';
export const ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'WORKER'];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChange: boolean;
  sessionId: string;
  isDemo: boolean;
}

export const SESSION_COOKIE = 'cl_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ITERATIONS = 100000; // Workers' maximum for PBKDF2
export const MIN_PASSWORD = 8;

const enc = new TextEncoder();

const toB64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend the same time as a real check so timing doesn't reveal unknown emails.
    await pbkdf2(password, new Uint8Array(16), ITERATIONS);
    return false;
  }
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = await pbkdf2(password, fromB64(salt) as Uint8Array<ArrayBuffer>, Number(iter));
  return safeEqual(actual, fromB64(hash));
}

export function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 200;
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

export async function sha256Hex(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

export async function createSession(db: Db, userId: string) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_MS;
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), userId, expires)
    .run();
  return token;
}

export function setSessionCookie(response: NextResponse, request: Request, token: string) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`,
  );
}

export function clearSessionCookie(response: NextResponse, request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// True when any real (non-demo) child record exists. Demo logins are switched off in that case.
export async function realDataExists(db: Db): Promise<boolean> {
  const r = await db.prepare('SELECT EXISTS(SELECT 1 FROM children WHERE is_demo = 0) AS x').first<{ x: number }>();
  return !!r && r.x === 1;
}

export async function getSessionUser(request: Request, db?: Db): Promise<SessionUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const database = db ?? (await getDb());
  const sessionId = await sha256Hex(token);
  const row = await database
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.must_change, u.is_demo
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(sessionId, Date.now())
    .first<{ id: string; email: string; name: string; role: Role; must_change: number; is_demo: number }>();
  if (!row) return null;
  if (row.is_demo === 1 && (await realDataExists(database))) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, mustChange: row.must_change === 1, sessionId, isDemo: row.is_demo === 1 };
}

export function sameOrigin(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Use at the top of protected routes.
export async function requireUser(
  request: Request,
  opts: { roles?: Role[]; allowMustChange?: boolean } = {},
): Promise<{ user: SessionUser; db: Db } | { error: NextResponse }> {
  if (!sameOrigin(request)) return { error: fail('Request blocked', 403) };
  const db = await getDb();
  const user = await getSessionUser(request, db);
  if (!user) return { error: fail('Please sign in', 401) };
  if (user.mustChange && !opts.allowMustChange) return { error: fail('You must change your password first', 403) };
  if (opts.roles && !opts.roles.includes(user.role)) return { error: fail('You do not have permission to do that', 403) };
  return { user, db };
}

export const canSeeAll = (role: Role) => role === 'ADMIN' || role === 'SUPERVISOR';
