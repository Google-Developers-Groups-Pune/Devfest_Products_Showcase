import type { Logger } from 'pino';
import type { AgentHealthService } from '../agents/health.js';
import type { Clock } from '../core/clock.js';
import { AppError } from '../core/errors.js';
import type { SessionPhase } from '../domain/state-machines/index.js';
import { RoundTimer, type TimedRound } from '../jobs/round-timer.js';
import type { RealtimeEmitter } from '../realtime/emitter.js';
import type { TimerSyncService } from '../realtime/timer-sync.js';

/** The `round:started` image URL is valid for 4 hours (BE-20). */
export const ROUND_IMAGE_URL_TTL_SECONDS = 4 * 60 * 60;

/** Everything API 10 checks, read from storage. */
export interface StartRoundContext {
  phase: SessionPhase;
  capacity: number;
  playerIds: string[];
  /** The session's one round (D5), or null if none was created. */
  round: { roundId: string; durationSeconds: number; candidateId: string } | null;
  /** The round's treasure, or null if it is missing. Only the player-visible part, never the rubric. */
  treasure: {
    approved: boolean;
    title: string;
    visibleBackstory: string;
    visibleLockObjective: string;
  } | null;
  /** Confirmed rounds of the day so far. The next round number is this plus one (D35). */
  confirmedCount: number;
}

export interface RoundStore {
  /** Undefined if no session has this ID. */
  loadStart(sessionId: string): Promise<StartRoundContext | undefined>;
  /**
   * One transaction: session READY to PLAYING, players LOBBY to PLAYING, and the round's
   * `roundStartedAt` and `roundEndAt = startedAt + duration`. The duration is read inside the
   * transaction, so a change made just before (API 6) is used and none can follow: it is
   * locked at start (PRD 5.1.1). Throws `AppError(409, 'INVALID_PHASE')` if the session is
   * no longer READY or the round has started, so two starts at once cannot both succeed.
   */
  commitStart(sessionId: string, roundId: string, startedAt: Date): Promise<{ roundEndAt: Date; durationSeconds: number }>;
  /** Sessions still PLAYING, with their round's `roundEndAt`, to re-arm timers on process start. */
  listRunning(): Promise<TimedRound[]>;
  /**
   * One transaction: session PLAYING to RESULT_PENDING, players PLAYING or LOCKED_100 to
   * RESULT_PENDING. Returns false, changing nothing, if the session is no longer PLAYING.
   */
  commitEnd(sessionId: string, roundId: string): Promise<boolean>;
}

/** Signed URL of the approved treasure's image (BE-35). */
export interface TreasureImageUrls {
  signedUrl(sessionId: string, candidateId: string, ttlSeconds: number): Promise<string>;
}

export interface StartRoundDeps {
  store: RoundStore;
  images: TreasureImageUrls;
  agentHealth: Pick<AgentHealthService, 'check'>;
  /** From the realtime gateway: true while the player has an open socket. */
  isPlayerConnected: (playerId: string) => boolean;
  emit: RealtimeEmitter;
  timerSync: Pick<TimerSyncService, 'start' | 'stop'>;
  clock: Clock;
  logger: Logger;
}

/** API 10 response. */
export interface StartedRound {
  round: {
    roundId: string;
    roundNumber: number;
    durationSeconds: number;
    startedAt: string;
    roundEndAt: string;
    serverNow: string;
  };
}

/**
 * Start round and the round timer (BE-20). One authoritative clock: the server sets
 * `roundEndAt`, stores it before telling anyone, and ends the round when its timer fires.
 */
export class StartRoundService {
  readonly timer: RoundTimer;

  constructor(private readonly deps: StartRoundDeps) {
    this.timer = new RoundTimer(deps.clock, (round) => this.endRound(round), deps.logger);
  }

  /** API 10 · `POST /api/controller/sessions/:id/start`. */
  async start(sessionId: string): Promise<StartedRound> {
    const { store, clock, emit } = this.deps;
    const ctx = await store.loadStart(sessionId);
    if (!ctx) throw new AppError(404, 'NOT_FOUND', 'Session not found.');

    if (ctx.phase !== 'READY') {
      throw new AppError(409, 'INVALID_PHASE', 'The round can only start when the session is ready.');
    }
    const { round, treasure } = ctx;
    // A card with no title or objective would show blank on every screen: refuse instead.
    if (!round || !treasure?.approved || !treasure.title || !treasure.visibleLockObjective) {
      throw new AppError(409, 'TREASURE_NOT_APPROVED', 'Approve a treasure before starting the round.');
    }
    const allReady =
      ctx.playerIds.length >= ctx.capacity && ctx.playerIds.every((id) => this.deps.isPlayerConnected(id));
    if (!allReady) {
      throw new AppError(409, 'PLAYERS_NOT_READY', 'Every player must be joined and connected before the round starts.');
    }
    // TODO(BE-39): 409 NAMES_NOT_REVIEWED until every name is approved.
    const health = await this.deps.agentHealth.check();
    if (!health.allHealthy) {
      throw new AppError(503, 'AGENTS_UNAVAILABLE', 'An AI agent is down. Try again in a minute.');
    }

    // Signed before anything changes, so a signing failure leaves the session READY.
    const imageUrl = await this.deps.images.signedUrl(sessionId, round.candidateId, ROUND_IMAGE_URL_TTL_SECONDS);

    const startedAt = clock.now();
    const { roundEndAt, durationSeconds } = await store.commitStart(sessionId, round.roundId, startedAt);

    // Persisted: arm the clock first, so the round ends on time whatever happens next.
    const timed = { sessionId, roundId: round.roundId, roundEndAt };
    this.timer.arm(timed);
    this.deps.timerSync.start(timed);

    const roundNumber = ctx.confirmedCount + 1;
    const serverNow = clock.now().toISOString();
    const started = {
      roundId: round.roundId,
      roundNumber,
      durationSeconds,
      startedAt: startedAt.toISOString(),
      roundEndAt: roundEndAt.toISOString(),
      serverNow,
    };
    emit.toAll(sessionId, 'phase:changed', {
      sessionId,
      phase: 'PLAYING',
      previousPhase: 'READY',
      at: started.startedAt,
    });
    emit.toAll(sessionId, 'round:started', {
      ...started,
      treasure: {
        treasureId: round.candidateId,
        title: treasure.title,
        backstory: treasure.visibleBackstory,
        lockObjective: treasure.visibleLockObjective,
        imageUrl,
      },
    });
    this.deps.logger.info({ sessionId, roundId: round.roundId, roundEndAt: started.roundEndAt }, 'Round started');
    return { round: started };
  }

  /** On process start: re-arm every running round, or end it at once if its time has passed. */
  async recoverTimers(): Promise<number> {
    const running = await this.deps.store.listRunning();
    for (const round of running) {
      this.timer.arm(round);
      this.deps.timerSync.start(round);
    }
    return running.length;
  }

  stop(): void {
    this.timer.cancelAll();
  }

  /**
   * Called by the timer at `roundEndAt`. Moves the session to RESULT_PENDING and tells
   * everyone. Safe to call twice. BE-24 adds the result calculation after this.
   */
  private async endRound(round: TimedRound): Promise<void> {
    this.deps.timerSync.stop(round.roundId);
    const ended = await this.deps.store.commitEnd(round.sessionId, round.roundId);
    if (!ended) return;
    const { emit, clock } = this.deps;
    emit.toAll(round.sessionId, 'round:ended', { roundId: round.roundId, endedAt: round.roundEndAt.toISOString() });
    emit.toAll(round.sessionId, 'phase:changed', {
      sessionId: round.sessionId,
      phase: 'RESULT_PENDING',
      previousPhase: 'PLAYING',
      at: clock.now().toISOString(),
    });
    this.deps.logger.info({ sessionId: round.sessionId, roundId: round.roundId }, 'Round ended');
  }
}
