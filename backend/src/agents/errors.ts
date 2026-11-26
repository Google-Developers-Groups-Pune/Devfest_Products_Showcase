import type { AgentName } from './types.js';

export type AgentErrorCode =
  /** The call took longer than the agent's timeout. */
  | 'TIMEOUT'
  /** The model answered, but the JSON was invalid or a value was out of range. */
  | 'INVALID_OUTPUT'
  /** The model call itself failed (network, quota, server error, bad model ID). */
  | 'MODEL_ERROR';

/**
 * Raised by the AI gateway and the agents. `retryable` tells the caller whether trying
 * again could help. The message is for logs only and never contains player text.
 */
export class AgentError extends Error {
  constructor(
    readonly agent: AgentName,
    readonly code: AgentErrorCode,
    readonly retryable: boolean,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AgentError';
  }
}

export function isAgentError(err: unknown): err is AgentError {
  return err instanceof AgentError;
}
