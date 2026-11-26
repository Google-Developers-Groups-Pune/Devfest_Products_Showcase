import type { Timestamp } from 'firebase-admin/firestore';
import type { PlayerState, PromptStatus, SessionPhase } from '../domain/state-machines/index.js';

/*
 * Stored document shapes, from PRD section 11 and the shared enums in
 * docs/STORIES.md. Owning stories may add fields when they need them.
 * Timestamps always come from the injected Clock, never from a client.
 */

export const EVENT_STATUSES = ['OPEN', 'CLOSING', 'CLOSED', 'CLOSING_FAILED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const CONNECTIONS = ['CONNECTED', 'DISCONNECTED'] as const;
export type Connection = (typeof CONNECTIONS)[number];

/** Colour marker, fixed by slot number (docs/STORIES.md). */
export const SHAPES = ['BLUE_CIRCLE', 'RED_SQUARE', 'YELLOW_DIAMOND', 'GREEN_PILL', 'GREEN_CIRCLE'] as const;
export type Shape = (typeof SHAPES)[number];

/** controllers/{controllerId}. Not event data, survives closure (BE-05, D4). */
export interface ControllerDoc {
  username: string;
  /** argon2 hash, written by the seed script. Never the plain password. */
  passwordHash: string;
}

/** system/eventStatus. The one record kept after deletion. No personal data (D4, BE-29). */
export interface EventStatusDoc {
  status: EventStatus;
  closedAt: Timestamp | null;
  failure: { stage: string; code: string; remaining: number } | null;
}

/** events/{eventId}. PRD: EventDay. */
export interface EventDoc {
  status: EventStatus;
  createdAt: Timestamp;
  closedAt: Timestamp | null;
  controllerId: string;
}

/** events/{eventId}/entranceIds/{sha256}. Personal data: deleted at closure. */
export interface EntranceIdDoc {
  /** As the player typed it. */
  entranceId: string;
  sessionId: string;
  playerId: string;
  status: 'RESERVED' | 'USED';
}

/** events/{eventId}/auditEvents/{id}. PRD: AuditEvent. */
export interface AuditEventDoc {
  at: Timestamp;
  actor: 'CONTROLLER' | 'SYSTEM';
  controllerId: string | null;
  action: string;
  reason: string | null;
  correlationId: string;
}

/** .../sessions/{sessionId}. PRD: Session. */
export interface SessionDoc {
  capacity: number;
  phase: SessionPhase;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  controllerId: string;
}

/** .../slots/{slotNumber}. PRD: JoinCode. */
export interface SlotDoc {
  slotNumber: number;
  /** Two-digit join code. */
  code: string;
  shape: Shape;
  claimed: boolean;
  playerId: string | null;
}

/** .../players/{playerId}. PRD: Player. fullName and entranceId are personal data. */
export interface PlayerDoc {
  sessionId: string;
  fullName: string;
  /** Public first-name label shown to others. */
  firstName: string;
  entranceId: string;
  slotNumber: number;
  state: PlayerState;
  connection: Connection;
  /** Player tokens are checked against this (BE-05). */
  activeTokenId: string | null;
}

/** .../candidates/{candidateId}. PRD: TreasureCandidate. Exact content shape is owned by BE-16/BE-19. */
export interface CandidateDoc {
  /** What players may see once the round starts. */
  visible: Record<string, unknown>;
  /** Hidden rubric. Never sent to players or the display. */
  rubric: Record<string, unknown>;
  contentCheck: 'ALLOWED' | 'BLOCKED';
  approval: 'PENDING' | 'APPROVED' | 'REJECTED';
  model: string;
  createdAt: Timestamp;
}

/** .../rounds/{roundId}. PRD: Round. */
export interface RoundDoc {
  sessionId: string;
  candidateId: string;
  roundDurationSeconds: number;
  roundStartedAt: Timestamp | null;
  roundEndAt: Timestamp | null;
  /** Round this one replaces, if any (lineage). */
  replacesRoundId: string | null;
  /** Last prompt sequence handed out. Only createPrompt changes it. */
  promptCounter: number;
}

/** .../prompts/{promptId}. PRD: PromptSubmission. rawText is deleted at closure. */
export interface PromptDoc {
  roundId: string;
  playerId: string;
  idempotencyKey: string;
  /** Server receipt time. */
  receivedAt: Timestamp;
  /** 1, 2, 3... per round, from the round counter. */
  sequence: number;
  rawText: string;
  status: PromptStatus;
  filterDecision: 'ALLOWED' | 'BLOCKED' | null;
  displayText: string | null;
}

/** .../scores/{promptId}. PRD: Score. Never edited after commit. */
export interface ScoreDoc {
  promptId: string;
  score: number;
  feedback: string;
  rubricVersion: string;
  model: string;
  committedAt: Timestamp;
}

/** .../reactions/{promptId}. PRD: Reaction. */
export interface ReactionDoc {
  playerId: string;
  promptId: string;
  expression: string;
  /** Hindi-English reaction text. */
  reaction: string;
  displaySafe: boolean;
}

/** .../result/current. PRD: Result. */
export interface ResultDoc {
  roundId: string;
  ranking: Array<{ playerId: string; bestScore: number; promptId: string }>;
  winnerPlayerId: string | null;
  bestScore: number | null;
  decidingPromptId: string | null;
  tieBreak: string | null;
  confirmation: 'PROVISIONAL' | 'CONFIRMED' | 'DISCARDED';
}
