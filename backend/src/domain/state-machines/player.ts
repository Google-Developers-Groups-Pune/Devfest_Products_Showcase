import { createStateMachine } from './machine.js';

/**
 * Player `state` values from the shared contract. Connection
 * (CONNECTED / DISCONNECTED) is a separate field, not a state here.
 */
export const PLAYER_STATES = ['LOBBY', 'PLAYING', 'LOCKED_100', 'RESULT_PENDING', 'COMPLETE'] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];

export const PLAYER_EVENTS = [
  'ROUND_STARTED', // the session's round starts (BE-20)
  'SCORED_100', // a prompt scores 100 (BE-22)
  'ROUND_ENDED', // the round timer ends (BE-20, BE-24)
  'RESULT_CONFIRMED', // Controller confirms the result (BE-25)
] as const;
export type PlayerEvent = (typeof PLAYER_EVENTS)[number];

/**
 * Every legal player move. LOCKED_100 can never go back to PLAYING.
 *
 * Discard, abandon and event close do not move players: they end the session,
 * so a player can stay in PLAYING or RESULT_PENDING after their session has
 * ended. Rejoin (BE-12) and the display (BE-13) must check the session phase
 * before the player state.
 */
export const playerMachine = createStateMachine<PlayerState, PlayerEvent>('player', {
  LOBBY: { ROUND_STARTED: 'PLAYING' },
  PLAYING: { SCORED_100: 'LOCKED_100', ROUND_ENDED: 'RESULT_PENDING' },
  LOCKED_100: { ROUND_ENDED: 'RESULT_PENDING' },
  RESULT_PENDING: { RESULT_CONFIRMED: 'COMPLETE' },
});
