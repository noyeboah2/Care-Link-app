import type { Db } from '@/lib/db';

export type AuditAction =
  | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_CHANGED' | 'SETUP_COMPLETED'
  | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED' | 'PASSWORD_RESET_FAILED' | 'USER_PHONE_CHANGED'
  | 'USER_CREATED' | 'USER_DEACTIVATED' | 'USER_ACTIVATED' | 'USER_ROLE_CHANGED' | 'USER_PASSWORD_RESET'
  | 'CASE_CREATED' | 'CASE_VIEWED' | 'CASE_UPDATED' | 'CASE_DELETED' | 'SCREENING_RECORDED'
  | 'SMS_SETTINGS_CHANGED' | 'SMS_TEST_SENT' | 'SMS_RUN_MANUAL'
  | 'BACKUP_EXPORTED' | 'DATA_EXPORTED' | 'BACKUP_RESTORED' | 'CASES_CLEARED' | 'AUDIT_RESET';

export const AUDIT_ACTIONS: AuditAction[] = [
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'SETUP_COMPLETED',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_FAILED', 'USER_PHONE_CHANGED',
  'USER_CREATED', 'USER_DEACTIVATED', 'USER_ACTIVATED', 'USER_ROLE_CHANGED', 'USER_PASSWORD_RESET',
  'CASE_CREATED', 'CASE_VIEWED', 'CASE_UPDATED', 'CASE_DELETED', 'SCREENING_RECORDED',
  'SMS_SETTINGS_CHANGED', 'SMS_TEST_SENT', 'SMS_RUN_MANUAL',
  'BACKUP_EXPORTED', 'DATA_EXPORTED', 'BACKUP_RESTORED', 'CASES_CLEARED', 'AUDIT_RESET',
];

export interface Actor {
  id: string | null;
  name: string | null;
  role: string | null;
}

interface Options {
  entityType?: 'case' | 'user' | 'system';
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown>;
  withIp?: boolean; // only for sign-in events
}

// Records who did what and when. It never throws: a logging problem must not stop a health worker
// from saving a screening (the problem is written to the Worker log instead).
// Details hold field names and results, never phone numbers, passwords or answers.
export async function logAudit(db: Db, request: Request | null, actor: Actor | null, action: AuditAction, opts: Options = {}): Promise<void> {
  try {
    const details = opts.details ? JSON.stringify(opts.details).slice(0, 600) : null;
    const ip = opts.withIp && request ? request.headers.get('cf-connecting-ip') : null;
    await db
      .prepare(
        `INSERT INTO audit_log (id, user_id, user_name, user_role, action, entity_type, entity_id, entity_label, details, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(), actor?.id ?? null, actor?.name ?? null, actor?.role ?? null, action,
        opts.entityType ?? null, opts.entityId ?? null, opts.entityLabel ?? null, details, ip,
      )
      .run();
  } catch (err) {
    console.error('Audit log write failed', action, err);
  }
}

export const actorOf = (u: { id: string; name: string; role: string }): Actor => ({ id: u.id, name: u.name, role: u.role });

// Builds the WHERE part shared by the viewer and the CSV export.
export function auditFilter(params: URLSearchParams) {
  const where: string[] = [];
  const values: unknown[] = [];
  const action = params.get('action');
  if (action && (AUDIT_ACTIONS as string[]).includes(action)) { where.push('action = ?'); values.push(action); }
  const userId = params.get('userId');
  if (userId) { where.push('user_id = ?'); values.push(userId); }
  const entityId = params.get('entityId');
  if (entityId) { where.push('entity_id = ?'); values.push(entityId); }
  const from = params.get('from');
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('at >= ?'); values.push(from + ' 00:00:00'); }
  const to = params.get('to');
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('at <= ?'); values.push(to + ' 23:59:59'); }
  const q = (params.get('q') ?? '').trim().slice(0, 40);
  if (q) {
    where.push("(user_name LIKE ? OR entity_label LIKE ? OR details LIKE ? OR action LIKE ?)");
    const like = `%${q.replace(/[%_]/g, '')}%`;
    values.push(like, like, like, like);
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', values };
}

