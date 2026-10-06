import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { AUDIT_ACTIONS, auditFilter } from '@/lib/audit';

export const dynamic = 'force-dynamic';

interface Row {
  seq: number; id: string; at: string; user_id: string | null; user_name: string | null; user_role: string | null;
  action: string; entity_type: string | null; entity_id: string | null; entity_label: string | null; details: string | null; ip: string | null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request, { roles: ['ADMIN'] });
    if ('error' in auth) return auth.error;
    const params = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200);
    const cursor = Number(params.get('cursor'));
    const { clause, values } = auditFilter(params);

    const sql = `SELECT rowid AS seq, id, at, user_id, user_name, user_role, action, entity_type, entity_id, entity_label, details, ip
                 FROM audit_log ${clause}${cursor > 0 ? (clause ? ' AND' : ' WHERE') + ' rowid < ?' : ''}
                 ORDER BY rowid DESC LIMIT ?`;
    const bind = [...values, ...(cursor > 0 ? [cursor] : []), limit + 1];
    const { results } = await auth.db.prepare(sql).bind(...bind).all<Row>();
    const page = results.slice(0, limit);

    return NextResponse.json({
      success: true,
      items: page.map((r) => ({
        id: r.id, at: r.at, user: r.user_name, role: r.user_role, action: r.action,
        entityType: r.entity_type, entityId: r.entity_id, label: r.entity_label, ip: r.ip,
        details: (() => { try { return r.details ? JSON.parse(r.details) : null; } catch { return null; } })(),
      })),
      nextCursor: results.length > limit ? page[page.length - 1].seq : null,
      actions: AUDIT_ACTIONS,
    });
  } catch (err) {
    console.error('GET /api/audit failed', err);
    return NextResponse.json({ success: false, error: 'Could not load the audit log' }, { status: 500 });
  }
}
