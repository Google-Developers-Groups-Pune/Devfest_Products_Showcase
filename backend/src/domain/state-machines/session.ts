import { createStateMachine } from './machine.js';

/** Session `phase` values from the shared contract. SETUP means no session is open. */
export const SESSION_PHASES = [
  'SETUP',
  'JOINING',
  'TREASURE_REVIEW',
  'READY',
  'PLAYING',
  'RESULT_PENDING',
  'RESULTS',
  'DISCARDED',
  'CLOSED',
] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

/** Things that can happen to a session. Each one maps to a story's action. */
export const SESSION_EVENTS = [
  'OPEN_SESSION', // Controller opens a session (BE-08, BE-36 next-group)
  'REQUEST_TREASURE', // first treasure request (BE-19)
  'APPROVE_TREASURE', // Controller approves the treasure (BE-19)
  'START_ROUND', // Controller starts the round (BE-20)
  'ROUND_TIMER_ENDED', // the round timer reaches roundEndAt (BE-20, BE-24)
  'CONFIRM_RESULT', // Controller confirms the winner (BE-25)
  'DISCARD_RESULT', // Controller discards the result (BE-25, decision D34)
  'ABANDON_SESSION', // Controller abandons before play (BE-36, decision D31)
  'CLOSE_SESSION', // Controller ends the session after results (BE-36, decision D2)
  'CLOSE_EVENT', // Controller closes the event day; any unconfirmed result is lost (BE-29, decision D44)
] as const;
export type SessionEvent = (typeof SESSION_EVENTS)[number];

/**
 * Every legal session move. DISCARDED and CLOSED are final.
 * RESULTS only leaves by a Controller action (CLOSE_SESSION or CLOSE_EVENT), never a timer.
 * CLOSE_EVENT ends the session as CLOSED from every phase that is not already final.
 */
export const sessionMachine = createStateMachine<SessionPhase, SessionEvent>('session', {
  SETUP: { OPEN_SESSION: 'JOINING' },
  JOINING: { REQUEST_TREASURE: 'TREASURE_REVIEW', ABANDON_SESSION: 'CLOSED', CLOSE_EVENT: 'CLOSED' },
  TREASURE_REVIEW: { APPROVE_TREASURE: 'READY', ABANDON_SESSION: 'CLOSED', CLOSE_EVENT: 'CLOSED' },
  READY: { START_ROUND: 'PLAYING', ABANDON_SESSION: 'CLOSED', CLOSE_EVENT: 'CLOSED' },
  PLAYING: { ROUND_TIMER_ENDED: 'RESULT_PENDING', CLOSE_EVENT: 'CLOSED' },
  RESULT_PENDING: { CONFIRM_RESULT: 'RESULTS', DISCARD_RESULT: 'DISCARDED', CLOSE_EVENT: 'CLOSED' },
  RESULTS: { CLOSE_SESSION: 'CLOSED', CLOSE_EVENT: 'CLOSED' },
});
