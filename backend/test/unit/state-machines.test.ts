import { describe, expect, it } from 'vitest';
import {
  IllegalTransitionError,
  PLAYER_EVENTS,
  PLAYER_STATES,
  PROMPT_EVENTS,
  PROMPT_STATUSES,
  SESSION_EVENTS,
  SESSION_PHASES,
  playerMachine,
  promptMachine,
  sessionMachine,
  type StateMachine,
} from '../../src/domain/state-machines/index.js';

type Row<S extends string, E extends string> = readonly [from: S, event: E, to: S];

/**
 * Checks a machine against its full list of legal moves.
 * Every (state, event) pair NOT in `legal` must throw IllegalTransitionError.
 */
function describeMachine<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  states: readonly S[],
  events: readonly E[],
  legal: readonly Row<S, E>[],
) {
  const isLegal = (from: S, event: E) => legal.some(([f, e]) => f === from && e === event);
  const illegal = states.flatMap((from) =>
    events.filter((event) => !isLegal(from, event)).map((event) => [from, event] as const),
  );

  describe(`${machine.name} machine`, () => {
    it.each(legal)('allows %s --%s--> %s', (from, event, to) => {
      expect(machine.transition(from, event)).toBe(to);
      expect(machine.can(from, event)).toBe(true);
    });

    it.each(illegal)('rejects %s --%s-->', (from, event) => {
      expect(machine.can(from, event)).toBe(false);
      expect(() => machine.transition(from, event)).toThrow(IllegalTransitionError);
    });

    it('covers every state and event pair exactly once', () => {
      expect(legal.length + illegal.length).toBe(states.length * events.length);
    });
  });
}

describeMachine(sessionMachine, SESSION_PHASES, SESSION_EVENTS, [
  ['SETUP', 'OPEN_SESSION', 'JOINING'],
  ['JOINING', 'REQUEST_TREASURE', 'TREASURE_REVIEW'],
  ['TREASURE_REVIEW', 'APPROVE_TREASURE', 'READY'],
  ['READY', 'START_ROUND', 'PLAYING'],
  ['PLAYING', 'ROUND_TIMER_ENDED', 'RESULT_PENDING'],
  ['RESULT_PENDING', 'CONFIRM_RESULT', 'RESULTS'],
  ['RESULT_PENDING', 'DISCARD_RESULT', 'DISCARDED'],
  ['RESULTS', 'CLOSE_SESSION', 'CLOSED'],
  ['JOINING', 'ABANDON_SESSION', 'CLOSED'],
  ['TREASURE_REVIEW', 'ABANDON_SESSION', 'CLOSED'],
  ['READY', 'ABANDON_SESSION', 'CLOSED'],
]);

describeMachine(playerMachine, PLAYER_STATES, PLAYER_EVENTS, [
  ['LOBBY', 'ROUND_STARTED', 'PLAYING'],
  ['PLAYING', 'SCORED_100', 'LOCKED_100'],
  ['PLAYING', 'ROUND_ENDED', 'RESULT_PENDING'],
  ['LOCKED_100', 'ROUND_ENDED', 'RESULT_PENDING'],
  ['RESULT_PENDING', 'RESULT_CONFIRMED', 'COMPLETE'],
]);

describeMachine(promptMachine, PROMPT_STATUSES, PROMPT_EVENTS, [
  ['RECEIVED', 'START_FILTER', 'FILTERING'],
  ['FILTERING', 'FILTER_BLOCKED', 'BLOCKED'],
  ['FILTERING', 'FILTER_APPROVED', 'APPROVED'],
  ['APPROVED', 'START_SCORING', 'SCORING'],
  ['SCORING', 'SCORE_COMMITTED', 'SCORED'],
  ['SCORED', 'DISPLAYED', 'DISPLAYED'],
  ['RECEIVED', 'FAIL', 'FAILED'],
  ['FILTERING', 'FAIL', 'FAILED'],
  ['APPROVED', 'FAIL', 'FAILED'],
  ['SCORING', 'FAIL', 'FAILED'],
]);

describe('key rules from the story', () => {
  it('never lets a LOCKED_100 player return to PLAYING', () => {
    for (const event of PLAYER_EVENTS) {
      if (playerMachine.can('LOCKED_100', event)) {
        expect(playerMachine.transition('LOCKED_100', event)).not.toBe('PLAYING');
      }
    }
  });

  it('never moves RESULTS on a timer event', () => {
    expect(sessionMachine.can('RESULTS', 'ROUND_TIMER_ENDED')).toBe(false);
  });

  it('treats DISCARDED and CLOSED as final', () => {
    for (const event of SESSION_EVENTS) {
      expect(sessionMachine.can('DISCARDED', event)).toBe(false);
      expect(sessionMachine.can('CLOSED', event)).toBe(false);
    }
  });

  it('throws a typed error that says what went wrong', () => {
    try {
      playerMachine.transition('LOCKED_100', 'ROUND_STARTED');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      const e = err as IllegalTransitionError;
      expect(e.machine).toBe('player');
      expect(e.from).toBe('LOCKED_100');
      expect(e.event).toBe('ROUND_STARTED');
    }
  });
});