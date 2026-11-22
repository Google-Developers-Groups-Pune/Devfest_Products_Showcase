/**
 * Application error rendered as the shared error envelope:
 * { "error": { "code", "message", "correlationId" } }
 *
 * `message` must always be safe to show to the user.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}
