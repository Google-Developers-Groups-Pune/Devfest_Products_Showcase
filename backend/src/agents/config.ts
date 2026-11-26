import type { Env } from '../config/env.js';
import type { AgentName } from './types.js';

/** Per-agent call settings used by the AI gateway. */
export interface AgentCallConfig {
  model: string;
  temperature: number;
  /** Per try, in milliseconds. */
  timeoutMs: number;
  /** Extra tries after the first one. */
  maxRetries: number;
}

export type AgentsConfig = Record<AgentName, AgentCallConfig>;

/** Shown as the model when no model ID is configured, for example in local development. */
export const UNCONFIGURED_MODEL = 'unconfigured';

/**
 * Model IDs come only from env config (BE-38): a fast Flash-class model (`MODEL_GUARD`)
 * for filter, guard and emoji, which run in sequence for every prompt, and a stronger one
 * (`MODEL_TEXT`) for treasure text. Timeouts and retries are the engineering defaults
 * from STORIES.md section 3: image 45 seconds with 2 retries, emoji 2 seconds.
 */
export function agentsConfig(env: Env): AgentsConfig {
  const fast = env.MODEL_GUARD ?? UNCONFIGURED_MODEL;
  return {
    treasure: { model: env.MODEL_TEXT ?? UNCONFIGURED_MODEL, temperature: 0.9, timeoutMs: 30_000, maxRetries: 2 },
    image: { model: env.IMAGE_MODEL ?? UNCONFIGURED_MODEL, temperature: 0.8, timeoutMs: 45_000, maxRetries: 2 },
    filter: { model: fast, temperature: 0, timeoutMs: 10_000, maxRetries: 2 },
    guard: { model: fast, temperature: 0.2, timeoutMs: 15_000, maxRetries: 2 },
    emoji: { model: fast, temperature: 0.8, timeoutMs: 2_000, maxRetries: 0 },
  };
}
