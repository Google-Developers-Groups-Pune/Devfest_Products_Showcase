import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError, type ErrorEnvelope } from '../../core/errors.js';
import { currentContext } from '../../core/request-context.js';

function envelope(code: string, message: string): ErrorEnvelope {
  return {
    error: { code, message, correlationId: currentContext()?.correlationId ?? 'unknown' },
  };
}

export function notFound(): RequestHandler {
  return (_req, res) => {
    res.status(404).json(envelope('NOT_FOUND', 'Not found.'));
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json(envelope(err.code, err.message));
      return;
    }
    // Body-parser errors carry a 4xx status.
    const status = (err as { status?: unknown }).status;
    if (status === 413) {
      res.status(413).json(envelope('PAYLOAD_TOO_LARGE', 'The request is too large.'));
      return;
    }
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(400).json(envelope('BAD_REQUEST', 'The request could not be read.'));
      return;
    }
    logger.error({ err }, 'Unhandled error');
    res.status(500).json(envelope('INTERNAL', 'Something went wrong. Please try again.'));
  };
}
