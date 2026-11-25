import { pino, type DestinationStream, type Logger } from 'pino';
import { redact } from './redact.js';
import { currentContext } from './request-context.js';

/**
 * JSON logger. Every line carries the current correlationId (BE-01).
 * Uses Cloud Logging field names (`severity`, `message`).
 * Sensitive fields are masked at any depth before the line is written (BE-04).
 *
 * `destination` is for tests. Production writes to stdout.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const logger = pino(
    {
      level,
      messageKey: 'message',
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ severity: label.toUpperCase() }),
        log: (object) => redact(object) as Record<string, unknown>,
      },
      // `redact` already turns errors into plain objects. pino's own `err` serializer would
      // then label them "Object", so it is replaced with a pass-through.
      serializers: { err: (err: unknown) => err },
      mixin: () => {
        const context = currentContext();
        return context ? { correlationId: context.correlationId } : {};
      },
    },
    destination,
  );

  // pino skips the bindings formatter for child loggers, so mask a child's bindings here.
  // Children inherit from this logger, so grandchildren go through the same path.
  type ChildFn = (this: unknown, bindings: pino.Bindings, options?: pino.ChildLoggerOptions) => Logger;
  const child = logger.child as unknown as ChildFn;
  const redactingChild: ChildFn = function (bindings, options) {
    return child.call(this, redact(bindings) as pino.Bindings, options);
  };
  logger.child = redactingChild as unknown as typeof logger.child;
  return logger;
}
