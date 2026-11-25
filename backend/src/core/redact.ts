/**
 * Log redaction (BE-04).
 *
 * Masks sensitive values before a log line is written. Keys are matched at any depth and
 * ignoring case, so `fullName`, `player.entranceId` and `Authorization` are all caught.
 * Entrance IDs matter most: an entrance ID alone is enough to rejoin as that player.
 */

export const REDACTED = '[REDACTED]';

/** Keys whose values never reach a log line. Compared in lower case. */
const SENSITIVE_KEYS = new Set([
  // Player identity
  'fullname',
  'entranceid',
  // Controller credentials
  'password',
  'passwordhash',
  // Hidden scoring
  'rubric',
  'hiddenrubric',
  'scoringcriteria',
  // Prompt text
  'text',
  'prompt',
  'prompttext',
  // Tokens and secrets
  'authorization',
  'cookie',
  'secret',
  'jwt',
]);

/** Any key ending in "token": `token`, `controllerToken`, `joinToken`, `playerToken`, ... */
const TOKEN_KEY = /token$/i;

/** Deeper than this is replaced, so a huge or odd object cannot stall logging. */
const MAX_DEPTH = 10;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase()) || TOKEN_KEY.test(key);
}

/**
 * Returns a copy of `value` with every sensitive key masked. The input is never changed.
 * Errors are copied to plain objects so their own fields are checked too.
 */
export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet());
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1, seen));
    }
    if (value instanceof Date) return value;

    const out: Record<string, unknown> = {};
    if (value instanceof Error) {
      out.type = value.name;
      out.message = value.message;
      if (value.stack) out.stack = value.stack;
      if (value.cause !== undefined) out.cause = walk(value.cause, depth + 1, seen);
    }
    for (const [key, child] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(child, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}
