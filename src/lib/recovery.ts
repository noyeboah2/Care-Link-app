import { sha256Hex } from '@/lib/auth';

// Limits that keep the "forgot password" feature from being used to harass people or run up SMS costs.
export const CODE_MINUTES = 10; // how long a code works
export const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed per code
export const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
export const MAX_REQUESTS_PER_IP_PER_HOUR = 20;
export const MIN_SECONDS_BETWEEN_REQUESTS = 60;
export const MAX_SMS_PER_DAY = 200; // all recovery texts together

// Unbiased random number below `max` (rejection sampling), using the platform's secure generator.
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export const randomCode = () => String(randomBelow(1000000)).padStart(6, '0');

export const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

// The code itself is never stored, only a scrambled version of it.
export const hashCode = (code: string, salt: string) => sha256Hex(`${salt}:${code}`);

export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Easy to read aloud: no 0/O, 1/l/I.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const randomTempPassword = (length = 10) => Array.from({ length }, () => TEMP_ALPHABET[randomBelow(TEMP_ALPHABET.length)]).join('');
