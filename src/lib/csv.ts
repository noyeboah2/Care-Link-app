// CSV that opens correctly in Excel (UTF-8 with BOM) and cannot run formulas.
const BOM = '\uFEFF';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Cells starting with = + - @ can be run as formulas in Excel. Plain phone numbers (+233...) are fine.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d+$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return BOM + [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

export function downloadResponse(body: string, filename: string, type: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
