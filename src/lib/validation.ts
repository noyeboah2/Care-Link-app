// Pure helpers shared by the browser and the server (no server-only imports).

export function normalizePhone(input: unknown): string | null {
  const raw = typeof input === 'string' ? input.replace(/[\s-]/g, '') : '';
  if (!/^(\+233|0)\d{9}$/.test(raw)) return null;
  return raw.startsWith('0') ? '+233' + raw.slice(1) : raw;
}

export function validDate(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(input) &&
    !Number.isNaN(Date.parse(input)) &&
    new Date(input).toISOString().slice(0, 10) === input
  );
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
