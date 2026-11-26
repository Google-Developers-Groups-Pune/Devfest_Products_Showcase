import { AppError } from '../core/errors.js';

/**
 * Audit log for the Controller (BE-26, API 19). Newest first, paginated with an opaque cursor.
 */

export interface AuditRecord {
  id: string;
  at: Date;
  actor: 'CONTROLLER' | 'SYSTEM';
  action: string;
  summary?: string | undefined;
  reason: string | null;
  correlationId: string;
}

export interface AuditStore {
  /** Every audit entry of the event day, in any order. */
  list(): Promise<AuditRecord[]>;
}

/** API 19 item. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  summary: string;
  reason: string | null;
  correlationId: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 100;

interface Cursor {
  at: number;
  id: string;
}

/** Newest first. Entries with the same time are ordered by ID, so pages never overlap. */
function newestFirst(a: AuditRecord, b: AuditRecord): number {
  return b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

function isAfter(record: AuditRecord, cursor: Cursor): boolean {
  const at = record.at.getTime();
  return at < cursor.at || (at === cursor.at && record.id < cursor.id);
}

function encodeCursor(record: AuditRecord): string {
  return Buffer.from(JSON.stringify({ at: record.at.getTime(), id: record.id })).toString('base64url');
}

function decodeCursor(cursor: string): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const { at, id } = value as Partial<Cursor>;
    if (typeof at === 'number' && Number.isFinite(at) && typeof id === 'string') return { at, id };
  } catch {
    // Falls through to the error below.
  }
  throw new AppError(400, 'BAD_REQUEST', 'The page cursor is not valid.');
}

/** Reads `limit` from the query string: 1 to 100, default 50. */
export function parseLimit(raw: unknown): number {
  if (raw === undefined) return AUDIT_DEFAULT_LIMIT;
  const limit = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_MAX_LIMIT) {
    throw new AppError(422, 'VALIDATION_FAILED', `The limit must be a whole number from 1 to ${AUDIT_MAX_LIMIT}.`);
  }
  return limit;
}

export class AuditLogService {
  constructor(private readonly store: AuditStore) {}

  async page(options: { limit?: number; cursor?: string | undefined } = {}): Promise<AuditPage> {
    const limit = options.limit ?? AUDIT_DEFAULT_LIMIT;
    const after = options.cursor ? decodeCursor(options.cursor) : undefined;

    const records = (await this.store.list()).sort(newestFirst);
    const remaining = after ? records.filter((record) => isAfter(record, after)) : records;
    const page = remaining.slice(0, limit);
    const last = page.at(-1);

    return {
      items: page.map(toEntry),
      nextCursor: remaining.length > limit && last ? encodeCursor(last) : null,
    };
  }
}

function toEntry(record: AuditRecord): AuditEntry {
  return {
    id: record.id,
    at: record.at.toISOString(),
    actor: record.actor.toLowerCase(),
    action: record.action,
    summary: record.summary ?? record.action,
    reason: record.reason,
    correlationId: record.correlationId,
  };
}
