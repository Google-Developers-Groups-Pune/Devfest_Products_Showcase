import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';
import { AppError } from '../core/errors.js';
import type { EventStatus } from '../data/types.js';
import type { RealtimeEmitter } from '../realtime/emitter.js';

/**
 * Close the event day, with deletion that proves it worked (BE-29, APIs 16 and 17, D4, D44).
 *
 *   OPEN ── close ──► CLOSING ──► CLOSED
 *                        └──────► CLOSING_FAILED ── close again ──► CLOSING ...
 *
 * Only `system/eventStatus` and `controllers` survive. Everything under `events/{eventId}`
 * and the event's Storage prefix is deleted, then re-read to confirm nothing is left.
 */

export const CLOSE_CONFIRMATION = 'CLOSE EVENT';

export type CloseStage = 'ROUND' | 'DISCONNECT' | 'FIRESTORE' | 'STORAGE' | 'VERIFY';

export interface CloseFailure {
  stage: CloseStage;
  code: string;
  remaining: number;
}

export interface EventStatusRecord {
  status: EventStatus;
  closedAt: Date | null;
  failure: CloseFailure | null;
}

/** API 17 body. */
export interface EventStatusView {
  status: EventStatus;
  closedAt: string | null;
  failure: CloseFailure | null;
}

/** `system/eventStatus`: the one record kept after deletion. Never holds personal data. */
export interface EventStatusStore {
  /** Undefined before the first close: the day is OPEN. */
  get(): Promise<EventStatusRecord | undefined>;
  set(record: EventStatusRecord): Promise<void>;
}

/** Everything under `events/{eventId}` in Firestore. */
export interface EventDataStore {
  /** Undefined if no event day exists yet. */
  currentEventId(): Promise<string | undefined>;
  /** True once a CSV covering every confirmed winner has been exported (BE-28). */
  csvUpToDate(eventId: string): Promise<boolean>;
  deleteAll(eventId: string): Promise<void>;
  /** Documents still under `events/{eventId}`, counted by re-reading. */
  countRemaining(eventId: string): Promise<number>;
}

/** The event's files in Cloud Storage: `events/{eventId}/...` (BE-35). */
export interface EventFileStore {
  deleteAll(eventId: string): Promise<void>;
  countRemaining(eventId: string): Promise<number>;
}

/** No bucket configured: there are no files to delete. Used until BE-35 and BE-38 land. */
export const noEventFiles: EventFileStore = {
  deleteAll: () => Promise.resolve(),
  countRemaining: () => Promise.resolve(0),
};

/** Stops a live round: cancels the timer and drops the scoring queue (BE-20, BE-22). */
export interface LiveRoundStopper {
  stopLiveRound(): Promise<void>;
}

export const noLiveRound: LiveRoundStopper = { stopLiveRound: () => Promise.resolve() };

export interface EventCloseDeps {
  statusStore: EventStatusStore;
  data: EventDataStore;
  files: EventFileStore;
  rounds: LiveRoundStopper;
  realtime: Pick<RealtimeEmitter, 'toController' | 'disconnectPlayersAndDisplay'>;
  clock: Clock;
  logger: Logger;
}

class StageError extends Error {
  constructor(
    readonly stage: CloseStage,
    readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(`Closing failed at ${stage}: ${code}`, options);
  }
}

export class EventCloseService {
  private running: Promise<void> | undefined;

  constructor(private readonly deps: EventCloseDeps) {}

  /** API 17. */
  async status(): Promise<EventStatusView> {
    const record = await this.currentStatus();
    return {
      status: record.status,
      closedAt: record.closedAt?.toISOString() ?? null,
      failure: record.failure,
    };
  }

  /**
   * API 16. Validates, sets CLOSING, and starts deletion in the background. The outcome
   * arrives on `event:status` and API 17. Returns a promise for the background run, for tests.
   */
  async close(confirmation: unknown): Promise<{ status: 'CLOSING'; done: Promise<void> }> {
    if (confirmation !== CLOSE_CONFIRMATION) {
      throw new AppError(422, 'CONFIRMATION_REQUIRED', `Type ${CLOSE_CONFIRMATION} to confirm.`);
    }
    const current = await this.currentStatus();
    if (current.status === 'CLOSED') throw new AppError(409, 'EVENT_CLOSED', 'The event day is already closed.');
    if (this.running) return { status: 'CLOSING', done: this.running };

    // A retry skips the CSV check: deletion has already started, so the flag may be gone.
    // CLOSING with nothing running means the server restarted mid-close: that is a retry too.
    const retry = current.status === 'CLOSING_FAILED' || current.status === 'CLOSING';
    const eventId = await this.deps.data.currentEventId();
    if (!retry && eventId !== undefined && !(await this.deps.data.csvUpToDate(eventId))) {
      throw new AppError(409, 'CSV_NOT_EXPORTED', 'Export the winners CSV before closing the event day.');
    }

    await this.setStatus({ status: 'CLOSING', closedAt: null, failure: null });
    this.running = this.run(eventId).finally(() => {
      this.running = undefined;
    });
    return { status: 'CLOSING', done: this.running };
  }

  /**
   * Refuses Controller game actions while closing has failed or after it (D44). Mount it on
   * APIs 4, 6–10, 13, 14 and 28–30.
   */
  async assertWritable(): Promise<void> {
    const { status } = await this.currentStatus();
    if (status === 'CLOSING_FAILED') {
      throw new AppError(409, 'EVENT_CLOSING_FAILED', 'Closing the event day failed. Retry closing first.');
    }
    if (status === 'CLOSING' || status === 'CLOSED') {
      throw new AppError(409, 'EVENT_CLOSED', 'The event day has been closed.');
    }
  }

  private async run(eventId: string | undefined): Promise<void> {
    const { data, files, rounds, realtime, logger } = this.deps;
    try {
      await stage('ROUND', 'STOP_FAILED', () => rounds.stopLiveRound());
      await stage('DISCONNECT', 'DISCONNECT_FAILED', () => {
        realtime.disconnectPlayersAndDisplay();
        return Promise.resolve();
      });
      if (eventId !== undefined) {
        await stage('FIRESTORE', 'DELETE_FAILED', () => data.deleteAll(eventId));
        await stage('STORAGE', 'DELETE_FAILED', () => files.deleteAll(eventId));
        const [docs, objects] = await stage('VERIFY', 'VERIFY_FAILED', () =>
          Promise.all([data.countRemaining(eventId), files.countRemaining(eventId)]),
        );
        if (docs > 0) throw new StageError('FIRESTORE', 'NOT_EMPTY');
        if (objects > 0) throw new StageError('STORAGE', 'NOT_EMPTY');
      }
      const closedAt = this.deps.clock.now();
      // Counts and stages only: no names, IDs of people, or prompt text.
      logger.info({ outcome: 'CLOSED', documentsRemaining: 0, objectsRemaining: 0 }, 'Event day closed');
      await this.setStatus({ status: 'CLOSED', closedAt, failure: null });
    } catch (err) {
      const failed = err instanceof StageError ? err : new StageError('VERIFY', 'UNKNOWN', { cause: err });
      const remaining = eventId === undefined ? 0 : await this.remaining(eventId, failed.stage);
      logger.error({ outcome: 'CLOSING_FAILED', stage: failed.stage, code: failed.code, remaining, err }, 'Event day close failed');
      await this.setStatus({
        status: 'CLOSING_FAILED',
        closedAt: null,
        failure: { stage: failed.stage, code: failed.code, remaining },
      });
    }
  }

  /** Best effort: how much is left where the failure happened. -1 if it cannot be counted. */
  private async remaining(eventId: string, at: CloseStage): Promise<number> {
    try {
      if (at === 'STORAGE') return await this.deps.files.countRemaining(eventId);
      const [docs, objects] = await Promise.all([
        this.deps.data.countRemaining(eventId),
        this.deps.files.countRemaining(eventId),
      ]);
      return docs + objects;
    } catch {
      return -1;
    }
  }

  private async currentStatus(): Promise<EventStatusRecord> {
    return (await this.deps.statusStore.get()) ?? { status: 'OPEN', closedAt: null, failure: null };
  }

  private async setStatus(record: EventStatusRecord): Promise<void> {
    await this.deps.statusStore.set(record);
    this.deps.realtime.toController('event:status', { status: record.status, failure: record.failure });
  }
}

async function stage<T>(name: CloseStage, code: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof StageError) throw err;
    throw new StageError(name, code, { cause: err });
  }
}
