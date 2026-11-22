/**
 * A tiny, pure state machine helper shared by the session, player and
 * prompt machines (BE-06). No database, no I/O, no clock.
 *
 * Each machine is a table: for a current state, which events are allowed
 * and which state each one leads to. Anything not in the table is illegal.
 */

/** Thrown when an event is not allowed from the current state. */
export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly event: string,
  ) {
    super(`${machine}: event ${event} is not allowed from ${from}`);
    this.name = 'IllegalTransitionError';
  }
}

export type TransitionTable<S extends string, E extends string> = Readonly<
  Partial<Record<S, Readonly<Partial<Record<E, S>>>>>
>;

export interface StateMachine<S extends string, E extends string> {
  readonly name: string;
  /** Returns the next state, or throws IllegalTransitionError. */
  transition(from: S, event: E): S;
  /** True when the event is allowed from this state. Never throws. */
  can(from: S, event: E): boolean;
}

export function createStateMachine<S extends string, E extends string>(
  name: string,
  table: TransitionTable<S, E>,
): StateMachine<S, E> {
  // Object.hasOwn, not a plain property read: states read back from Firestore
  // are just strings, and inputs like 'constructor' or '__proto__' must not
  // match properties inherited from Object.prototype.
  const lookup = (from: S, event: E): S | undefined => {
    if (!Object.hasOwn(table, from)) return undefined;
    const row = table[from];
    if (row === undefined || !Object.hasOwn(row, event)) return undefined;
    return row[event];
  };

  return {
    name,
    transition(from, event) {
      const next = lookup(from, event);
      if (next === undefined) {
        throw new IllegalTransitionError(name, from, event);
      }
      return next;
    },
    can(from, event) {
      return lookup(from, event) !== undefined;
    },
  };
}
