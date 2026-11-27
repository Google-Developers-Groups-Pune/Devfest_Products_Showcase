import { AppError } from '../core/errors.js';
import type { PlayerState, PromptStatus, SessionPhase } from '../domain/state-machines/index.js';

/** 200 characters after trimming (D6), counted like the app counts them (UTF-16 units). */
export const MAX_PROMPT_CHARS = 200;

/** A key the client made up; the contract asks for a UUID. Anything else is refused. */
const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/;

/** Who sent it: from the player token only, never from the request (BE-05). */
export interface PlayerRef {
  eventId: string;
  sessionId: string;
  playerId: string;
}

/** API 24 response. */
export interface PromptReceipt {
  promptId: string;
  status: PromptStatus;
  sequence: number;
  receivedAt: string;
}

export interface IntakeResult {
  /** False for a repeated key: the stored prompt is returned and nothing is queued again. */
  created: boolean;
  roundId: string;
  receipt: PromptReceipt;
}

export interface PromptIntakeStore {
  /**
   * In one transaction: checks the phase, the player's state and `roundEndAt` with
   * `assertCanSubmit`, allocates the sequence number and creates the prompt. A repeated key
   * returns the stored prompt (`created: false`) without checking again.
   */
  create(player: PlayerRef, prompt: { idempotencyKey: string; text: string; receivedAt: Date }): Promise<IntakeResult>;
}

export interface QueuedPrompt extends PlayerRef {
  roundId: string;
  promptId: string;
}

/** The scoring pipeline (BE-22). Takes a stored prompt; never blocks the request. */
export interface PromptQueue {
  enqueue(prompt: QueuedPrompt): void;
}

const notPlaying = () => new AppError(409, 'ROUND_NOT_PLAYING', 'The round is not running.');

/**
 * Whether a prompt received at `receivedAt` can be accepted (BE-21). Runs inside the create
 * transaction. Only the times decide: a prompt received strictly before `roundEndAt` is
 * accepted even if the round-end transaction has already moved the session to
 * RESULT_PENDING, because the round end waits for accepted prompts (BE-24). Exactly at
 * `roundEndAt` is too late.
 */
export function assertCanSubmit(
  phase: SessionPhase | undefined,
  playerState: PlayerState | undefined,
  round: { roundStartedAt: Date | null; roundEndAt: Date | null },
  receivedAt: Date,
): void {
  const { roundStartedAt, roundEndAt } = round;
  if (!roundStartedAt || !roundEndAt || (phase !== 'PLAYING' && phase !== 'RESULT_PENDING')) throw notPlaying();
  if (receivedAt.getTime() < roundStartedAt.getTime()) throw notPlaying();
  if (receivedAt.getTime() >= roundEndAt.getTime()) {
    throw new AppError(409, 'ROUND_EXPIRED', 'Time is up. That prompt arrived after the round ended.');
  }
  if (playerState === 'LOCKED_100') throw new AppError(409, 'PLAYER_LOCKED', 'You already unlocked the treasure.');
  if (playerState !== 'PLAYING' && playerState !== 'RESULT_PENDING') throw notPlaying();
}

/**
 * Prompt intake, API 24 (BE-21). Accepts fairly and fast: the prompt is stored, then handed
 * to the scoring queue, and the reply goes out before any AI runs. A player may have several
 * prompts in flight.
 */
export class PromptIntakeService {
  constructor(
    private readonly store: PromptIntakeStore,
    private readonly queue: PromptQueue,
  ) {}

  async submit(
    player: PlayerRef,
    input: { idempotencyKey: string | undefined; text: unknown; receivedAt: Date },
  ): Promise<IntakeResult> {
    const key = input.idempotencyKey?.trim() ?? '';
    if (key === '') throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Something went wrong. Please try again.');
    if (!SAFE_KEY.test(key)) throw new AppError(400, 'BAD_REQUEST', 'The request could not be read.');
    if (input.text !== undefined && typeof input.text !== 'string') {
      throw new AppError(400, 'BAD_REQUEST', 'The request could not be read.');
    }
    const text = (input.text ?? '').trim();
    if (text === '') throw new AppError(422, 'PROMPT_EMPTY', 'Write a prompt first.');
    if (text.length > MAX_PROMPT_CHARS) {
      throw new AppError(422, 'PROMPT_TOO_LONG', `That prompt is too long (${MAX_PROMPT_CHARS} characters max).`);
    }

    const result = await this.store.create(player, { idempotencyKey: key, text, receivedAt: input.receivedAt });
    // Stored first, then queued. A repeated key is never scored or displayed again.
    if (result.created) this.queue.enqueue({ ...player, roundId: result.roundId, promptId: result.receipt.promptId });
    return result;
  }
}
