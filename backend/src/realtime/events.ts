import type { PlayerState, SessionPhase } from '../domain/state-machines/index.js';

/**
 * Socket events, typed from contract/openapi/asyncapi.yaml (BE-02).
 *
 * Each audience (asyncapi channel) has its own event map, so the compiler stops an event
 * going to an audience that must not get it: `prompt:scored` can only go to one player's
 * private room, `treasure:ready` only to the Controller. test/contract/socket-events.test.ts
 * checks these maps against asyncapi.yaml.
 */

/** ISO 8601 UTC with milliseconds. */
export type Timestamp = string;
export type SlotNumber = 1 | 2 | 3 | 4 | 5;
export type Shape = 'BLUE_CIRCLE' | 'RED_SQUARE' | 'YELLOW_DIAMOND' | 'GREEN_PILL' | 'GREEN_CIRCLE';
export type Connection = 'CONNECTED' | 'DISCONNECTED';
export type Expression = 'NEUTRAL' | 'BORED' | 'UNIMPRESSED' | 'CURIOUS' | 'IMPRESSED' | 'SHOCKED' | 'SALUTE';
export type EventStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'CLOSING_FAILED';

export interface PublicPlayer {
  slotNumber: SlotNumber;
  label: string;
  shape: Shape;
  connection: Connection;
  state: PlayerState;
}

export interface ControllerPlayerListItem extends PublicPlayer {
  fullName: string;
  entranceId: string;
}

export interface Winner {
  slotNumber: SlotNumber;
  label: string;
  shape: Shape;
  bestScore: number;
}

export interface PublicRankingEntry {
  rank: number;
  slotNumber: SlotNumber;
  label: string;
  shape: Shape;
  bestScore: number | null;
}

// ------------------------------------------------------------------ payloads

export interface PhaseChanged {
  sessionId: string;
  phase: SessionPhase;
  previousPhase: SessionPhase;
  at: Timestamp;
}

export interface SessionOpened {
  sessionId: string;
  capacity: number;
  roundDurationSeconds: number;
}

export interface SessionClosed {
  sessionId: string;
  nextSessionOpened: boolean;
}

export interface PlayerJoinedController {
  joinedCount: number;
  capacity: number;
  players: ControllerPlayerListItem[];
}

/** Count only: no names before `players:revealed` (D16). */
export interface PlayerJoinedPublic {
  joinedCount: number;
  capacity: number;
}

export interface PlayersRevealed {
  players: PublicPlayer[];
}

export interface ControllerKicked {
  reason: 'SIGNED_IN_ELSEWHERE';
}

export interface PlayerKicked {
  reason: 'REJOINED_ON_ANOTHER_DEVICE';
}

export interface PlayerConnection {
  slotNumber: SlotNumber;
  /** null until `players:revealed`, for every audience (D16). */
  label: string | null;
  connection: Connection;
}

export interface TreasureReady {
  candidateId: string;
  title: string;
  backstory: string;
  lockObjective: string;
  /** 15-minute signed URL. */
  imageUrl: string;
  filterPassed: boolean;
  rubric: { version: string; scoringCriteria: string[] };
}

export interface TreasureFailed {
  candidateId: string;
  stage: 'TEXT' | 'FILTER' | 'IMAGE';
  retryable: boolean;
}

export interface RoundStarted {
  roundId: string;
  roundNumber: number;
  durationSeconds: number;
  startedAt: Timestamp;
  roundEndAt: Timestamp;
  serverNow: Timestamp;
  /** Never the rubric. `imageUrl` is a 4-hour signed URL. */
  treasure: {
    treasureId: string;
    title: string;
    backstory: string;
    lockObjective: string;
    imageUrl: string;
  };
}

export interface TimerSync {
  roundId: string;
  roundEndAt: Timestamp;
  serverNow: Timestamp;
}

export interface PromptScored {
  promptId: string;
  score: number;
  feedback: string;
  bestScore: number;
}

export interface PromptBlocked {
  promptId: string;
  message: string;
}

export interface PromptFailed {
  promptId: string;
  message: string;
  canRetry: boolean;
}

export interface FeedUpdate {
  roundId: string;
  sequence: number;
  slotNumber: SlotNumber;
  label: string;
  shape: Shape;
  text: string;
  score: number;
  bestScore: number;
  /** At most 100 characters (D39). null if the reaction failed (D49). */
  reaction: string | null;
  expression: Expression;
}

export interface PlayerUnlocked {
  slotNumber: SlotNumber;
  label: string;
  unlocked: string[];
}

export interface MonitorStats {
  promptsScored: number;
  unlockedCount: number;
  blockedCount: number;
  agentErrors: number;
}

export interface RoundEnded {
  roundId: string;
  endedAt: Timestamp;
}

export interface ResultProvisional {
  roundId: string;
  winner: Winner | null;
}

export interface ResultConfirmed {
  roundId: string;
  roundNumber: number;
  winner: Winner;
  ranking: PublicRankingEntry[];
  tieBreakExplanation: string | null;
}

/** The discard reason is never sent to players or the display. */
export interface RoundDiscarded {
  sessionId: string;
  roundId: string;
}

export interface EventStatusChanged {
  status: EventStatus;
  failure: { stage: string; code: string; remaining: number } | null;
}

// ------------------------------------------------------------------ audiences

/** Events every audience gets, with the same payload. Sent with `emit.toAll`. */
export interface AllAudienceEvents {
  'phase:changed': PhaseChanged;
  'session:closed': SessionClosed;
  'player:connection': PlayerConnection;
  'round:started': RoundStarted;
  'timer:sync': TimerSync;
  'player:unlocked': PlayerUnlocked;
  'round:ended': RoundEnded;
  'result:confirmed': ResultConfirmed;
  'round:discarded': RoundDiscarded;
}

/** asyncapi channel `controller`. */
export interface ControllerEvents extends AllAudienceEvents {
  'session:opened': SessionOpened;
  'player:joined': PlayerJoinedController;
  'treasure:ready': TreasureReady;
  'treasure:failed': TreasureFailed;
  'feed:update': FeedUpdate;
  'monitor:stats': MonitorStats;
  'result:provisional': ResultProvisional;
  'event:status': EventStatusChanged;
}

/** asyncapi channel `player`: every player in the session. */
export interface PlayerEvents extends AllAudienceEvents {
  'player:joined': PlayerJoinedPublic;
  'players:revealed': PlayersRevealed;
}

/** asyncapi channel `playerPrivate`: one player's private room only. */
export interface PlayerPrivateEvents {
  'prompt:scored': PromptScored;
  'prompt:blocked': PromptBlocked;
  'prompt:failed': PromptFailed;
}

/** asyncapi channel `display`: the audience big screen. */
export interface DisplayEvents extends AllAudienceEvents {
  'session:opened': SessionOpened;
  'player:joined': PlayerJoinedPublic;
  'players:revealed': PlayersRevealed;
  'feed:update': FeedUpdate;
  'result:provisional': ResultProvisional;
}

/** asyncapi channel `controllerOldSocket`: the Controller socket a new login replaced (D29). */
export interface ControllerOldSocketEvents {
  'controller:kicked': ControllerKicked;
}

/** asyncapi channel `playerOldSocket`: a player's socket replaced by a rejoin. */
export interface PlayerOldSocketEvents {
  'player:kicked': PlayerKicked;
}

type ExactKeys<M> = readonly (keyof M)[];

/** Runtime copy of the maps above, checked against asyncapi.yaml by the contract test. */
export const CHANNEL_EVENTS = {
  controller: [
    'phase:changed', 'session:opened', 'session:closed', 'player:joined', 'player:connection',
    'treasure:ready', 'treasure:failed', 'round:started', 'timer:sync', 'feed:update',
    'player:unlocked', 'monitor:stats', 'round:ended', 'result:provisional', 'result:confirmed',
    'round:discarded', 'event:status',
  ],
  controllerOldSocket: ['controller:kicked'],
  player: [
    'phase:changed', 'session:closed', 'player:joined', 'players:revealed', 'player:connection',
    'round:started', 'timer:sync', 'player:unlocked', 'round:ended', 'result:confirmed', 'round:discarded',
  ],
  playerPrivate: ['prompt:scored', 'prompt:blocked', 'prompt:failed'],
  playerOldSocket: ['player:kicked'],
  display: [
    'phase:changed', 'session:opened', 'session:closed', 'player:joined', 'players:revealed',
    'player:connection', 'round:started', 'timer:sync', 'feed:update', 'player:unlocked',
    'round:ended', 'result:provisional', 'result:confirmed', 'round:discarded',
  ],
} as const satisfies {
  controller: ExactKeys<ControllerEvents>;
  controllerOldSocket: ExactKeys<ControllerOldSocketEvents>;
  player: ExactKeys<PlayerEvents>;
  playerPrivate: ExactKeys<PlayerPrivateEvents>;
  playerOldSocket: ExactKeys<PlayerOldSocketEvents>;
  display: ExactKeys<DisplayEvents>;
};

// Compile-time check that each runtime list names every key of its map, not just some of them.
type Missing<M, L extends readonly unknown[]> = Exclude<keyof M, L[number]>;
type AssertNever<T extends never> = T;
export type ChannelListsComplete = [
  AssertNever<Missing<ControllerEvents, typeof CHANNEL_EVENTS.controller>>,
  AssertNever<Missing<ControllerOldSocketEvents, typeof CHANNEL_EVENTS.controllerOldSocket>>,
  AssertNever<Missing<PlayerEvents, typeof CHANNEL_EVENTS.player>>,
  AssertNever<Missing<PlayerPrivateEvents, typeof CHANNEL_EVENTS.playerPrivate>>,
  AssertNever<Missing<PlayerOldSocketEvents, typeof CHANNEL_EVENTS.playerOldSocket>>,
  AssertNever<Missing<DisplayEvents, typeof CHANNEL_EVENTS.display>>,
];
