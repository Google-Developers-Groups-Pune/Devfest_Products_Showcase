import { createStateMachine } from './machine.js';

/** Prompt `status` values from the shared contract. */
export const PROMPT_STATUSES = [
  'RECEIVED',
  'FILTERING',
  'BLOCKED',
  'APPROVED',
  'SCORING',
  'SCORED',
  'FAILED',
  'DISPLAYED',
] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];

export const PROMPT_EVENTS = [
  'START_FILTER', // filterAgent starts (BE-22)
  'FILTER_BLOCKED', // filterAgent blocks the prompt
  'FILTER_APPROVED', // filterAgent allows the prompt
  'START_SCORING', // guardAgent starts (BE-22)
  'SCORE_COMMITTED', // the score is saved, once (BE-22)
  'DISPLAYED', // shown on the big screen (BE-22)
  'FAIL', // guard failure after retries (BE-22), or unfinished at round end (BE-24)
] as const;
export type PromptEvent = (typeof PROMPT_EVENTS)[number];

/** Every legal prompt move. BLOCKED, FAILED and DISPLAYED are final. */
export const promptMachine = createStateMachine<PromptStatus, PromptEvent>('prompt', {
  RECEIVED: { START_FILTER: 'FILTERING', FAIL: 'FAILED' },
  FILTERING: { FILTER_BLOCKED: 'BLOCKED', FILTER_APPROVED: 'APPROVED', FAIL: 'FAILED' },
  APPROVED: { START_SCORING: 'SCORING', FAIL: 'FAILED' },
  SCORING: { SCORE_COMMITTED: 'SCORED', FAIL: 'FAILED' },
  SCORED: { DISPLAYED: 'DISPLAYED' },
});
