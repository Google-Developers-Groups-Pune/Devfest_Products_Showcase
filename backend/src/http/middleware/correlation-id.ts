import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithContext } from '../../core/request-context.js';

export const CORRELATION_HEADER = 'X-Correlation-Id';

// Accept a caller-supplied ID only if it is short and plain, so it is safe to log.
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Gives every request a correlation ID and returns it in X-Correlation-Id. */
export function correlationId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(CORRELATION_HEADER);
    const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(CORRELATION_HEADER, id);
    runWithContext({ correlationId: id }, () => next());
  };
}
