import { pino, type Logger } from 'pino';
import { currentContext } from './request-context.js';

/**
 * JSON logger. Every line carries the current correlationId (BE-01).
 * Uses Cloud Logging field names (`severity`, `message`).
 * Field redaction is added by BE-04.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    messageKey: 'message',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ severity: label.toUpperCase() }),
    },
    mixin: () => {
      const context = currentContext();
      return context ? { correlationId: context.correlationId } : {};
    },
  });
}
