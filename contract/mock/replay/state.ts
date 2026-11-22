/**
 * Game state for the replay server (BE-02).
 *
 * Built from the socket steps sent so far, so the hydrate calls (API 5, 23, 27) always agree with
 * the socket events: opening the app or reconnecting lands in the state the sockets describe.
 * `npm run replay:validate` checks every view against openapi.yaml after every step.
 */

type Phase = 'SETUP' | 'JOINING' | 'TREASURE_REVIEW' | 'READY' | 'PLAYING' | 'RESULT_PENDING' | 'RESULTS' | 'DISCARDED' | 'CLOSED';
type PlayerState = 'LOBBY' | 'PLAYING' | 'LOCKED_100' | 'RESULT_PENDING' | 'COMPLETE';
type Connection = 'CONNECTED' | 'DISCONNECTED';

interface Slot {
  slotNumber: number;
  label: string;
  shape: string;
  fullName: string;
  entranceId: string;
  connection: Connection;
  state: PlayerState;
  bestScore: number | null;
  nameReview: 'PENDING' | 'APPROVED';
  latest: { text: string; reaction: string | null; expression: string } | null;
}

interface PublicTreasure {
  treasureId: string;
  title: string;
  backstory: string;
  lockObjective: string;
  imageUrl: string;
}

interface ControllerTreasure {
  candidateId: string;
  status: 'READY' | 'APPROVED';
  title: string;
  backstory: string;
  lockObjective: string;
  imageUrl: string;
  filterPassed: boolean;
  rubric: unknown;
}

interface Round {
  roundId: string;
  roundNumber: number;
  durationSeconds: number;
  startedAt: string;
  roundEndAt: string;
}

interface PhonePrompt {
  promptId: string;
  text: string;
  status: 'SCORED' | 'BLOCKED' | 'FAILED';
  score: number | null;
  feedback: string | null;
  receivedAt: string;
}

/** The fields of a game.yaml step that the state needs. */
export interface StateStep {
  event: string;
  slot?: number;
  promptText?: string;
  payload: unknown;
}

export type HydrateResult = { status: 200; body: unknown } | { status: 401; code: 'SESSION_CLOSED' };

/** Fixed by slot (shared contract). */
const SHAPES = ['BLUE_CIRCLE', 'RED_SQUARE', 'YELLOW_DIAMOND', 'GREEN_PILL', 'GREEN_CIRCLE'] as const;
const JOIN_URL = 'heist.devfestpune.dev';
const AUDIT_LIMIT = 50;

// Payload shapes, as in asyncapi.yaml. game.yaml is validated against it before any step is applied.
type ListedPlayer = Pick<Slot, 'slotNumber' | 'label' | 'shape' | 'connection' | 'state'> & { fullName: string; entranceId: string };
type Any = Record<string, unknown>;

export class GameState {
  private sessionId: string | null = null;
  private sessionCount = 0;
  private phase: Phase = 'SETUP';
  private capacity = 0;
  private roundDurationSeconds = 0;
  private joinedCount = 0;
  private slots = new Map<number, Slot>();
  private revealed = false;
  private controllerTreasure: ControllerTreasure | null = null;
  private treasure: PublicTreasure | null = null;
  private round: Round | null = null;
  private unlocked: string[] = [];
  private result: unknown = null;
  private confirmedCount = 0;
  private winners: { roundNumber: number; fullName: string; score: number }[] = [];
  private lastSettings: { capacity: number; roundDurationSeconds: number } | null = null;
  private audit: { at: string; summary: string }[] = [];
  private phonePrompts: PhonePrompt[] = [];
  private phoneSessionClosed = false;

  /** The mock phone's session and identity, looked up from the script before it plays. */
  private readonly phone: { slot: number; sessionId: string; player: ListedPlayer };

  constructor(steps: StateStep[], phoneSlot: number) {
    let session: string | null = null;
    for (const step of steps) {
      const p = step.payload as Any;
      if (step.event === 'session:opened') session = p.sessionId as string;
      const listed = (p.players as ListedPlayer[] | undefined)?.find((x) => x.slotNumber === phoneSlot);
      if (step.event === 'player:joined' && listed && session) {
        this.phone = { slot: phoneSlot, sessionId: session, player: listed };
        return;
      }
    }
    throw new Error(`game.yaml never joins slot ${phoneSlot}, the slot every mock phone plays`);
  }

  /** Applies one step, with its time placeholders already resolved. */
  apply(step: StateStep, now: string): void {
    const p = step.payload as Any;
    const slot = (n: unknown) => this.slots.get(n as number);
    switch (step.event) {
      case 'session:opened':
        this.sessionId = p.sessionId as string;
        this.sessionCount += 1;
        this.capacity = p.capacity as number;
        this.roundDurationSeconds = p.roundDurationSeconds as number;
        this.lastSettings = { capacity: this.capacity, roundDurationSeconds: this.roundDurationSeconds };
        this.joinedCount = 0;
        this.slots.clear();
        this.revealed = false;
        this.controllerTreasure = null;
        this.treasure = null;
        this.round = null;
        this.unlocked = [];
        this.result = null;
        this.log(now, `Session opened - ${this.capacity} players - ${this.roundDurationSeconds}s round`);
        break;
      case 'phase:changed':
        this.phase = p.phase as Phase;
        for (const s of this.slots.values()) {
          if (this.phase === 'PLAYING' && s.state === 'LOBBY') s.state = 'PLAYING';
          if (this.phase === 'RESULT_PENDING' && s.state === 'PLAYING') s.state = 'RESULT_PENDING';
          if (this.phase === 'RESULTS') s.state = 'COMPLETE';
        }
        if (this.phase === 'READY' && this.controllerTreasure) this.controllerTreasure.status = 'APPROVED';
        break;
      case 'player:joined': {
        this.joinedCount = p.joinedCount as number;
        // Only the Controller version lists players. A collision can relabel an earlier player.
        for (const listed of (p.players as ListedPlayer[] | undefined) ?? []) {
          const known = slot(listed.slotNumber);
          if (!known) this.log(now, `${listed.label} joined slot ${listed.slotNumber}`);
          this.slots.set(listed.slotNumber, {
            ...listed,
            bestScore: known?.bestScore ?? null,
            nameReview: known?.nameReview ?? 'PENDING',
            latest: known?.latest ?? null,
          });
        }
        break;
      }
      case 'players:revealed':
        this.revealed = true;
        for (const s of this.slots.values()) s.nameReview = 'APPROVED';
        this.log(now, 'All names approved and revealed');
        break;
      case 'player:connection': {
        const s = slot(p.slotNumber);
        if (s) s.connection = p.connection as Connection;
        break;
      }
      case 'treasure:failed':
        this.log(now, `Treasure ${p.candidateId as string} failed at ${p.stage as string}`);
        break;
      case 'treasure:ready':
        this.controllerTreasure = { ...(p as unknown as Omit<ControllerTreasure, 'status'>), status: 'READY' };
        this.log(now, `Treasure ready: ${p.title as string}`);
        break;
      case 'round:started': {
        const { treasure, roundId, roundNumber, durationSeconds, startedAt, roundEndAt } = p as unknown as Round & {
          treasure: PublicTreasure;
        };
        this.treasure = treasure;
        this.round = { roundId, roundNumber, durationSeconds, startedAt, roundEndAt };
        this.log(now, `Round ${roundNumber} started`);
        break;
      }
      case 'prompt:scored':
      case 'prompt:blocked':
      case 'prompt:failed': {
        const scored = step.event === 'prompt:scored';
        const s = slot(step.slot);
        if (s && scored) s.bestScore = p.bestScore as number;
        if (step.slot === this.phone.slot) {
          this.phonePrompts.push({
            promptId: p.promptId as string,
            text: step.promptText ?? '',
            status: scored ? 'SCORED' : step.event === 'prompt:blocked' ? 'BLOCKED' : 'FAILED',
            score: scored ? (p.score as number) : null,
            feedback: scored ? (p.feedback as string) : null,
            receivedAt: now,
          });
        }
        break;
      }
      case 'feed:update': {
        const s = slot(p.slotNumber);
        if (s) {
          s.bestScore = p.bestScore as number;
          s.latest = { text: p.text as string, reaction: p.reaction as string | null, expression: p.expression as string };
        }
        break;
      }
      case 'player:unlocked': {
        this.unlocked = p.unlocked as string[];
        const s = slot(p.slotNumber);
        if (s) s.state = 'LOCKED_100';
        this.log(now, `${p.label as string} unlocked the treasure`);
        break;
      }
      case 'round:ended':
        this.log(now, `Round ${this.round?.roundNumber ?? ''} ended`.trim());
        break;
      case 'result:provisional':
        this.result = p;
        break;
      case 'result:confirmed': {
        this.result = p;
        this.confirmedCount = p.roundNumber as number;
        const winner = p.winner as { slotNumber: number; label: string; bestScore: number };
        this.winners.push({
          roundNumber: this.confirmedCount,
          fullName: slot(winner.slotNumber)?.fullName ?? winner.label,
          score: winner.bestScore,
        });
        this.log(now, `Result confirmed: ${winner.label} wins round ${this.confirmedCount}`);
        break;
      }
      case 'round:discarded':
        this.result = null;
        this.log(now, 'Round discarded');
        break;
      case 'session:closed':
        if (p.sessionId === this.phone.sessionId) this.phoneSessionClosed = true;
        this.log(now, `Session ${p.sessionId as string} closed`);
        this.sessionId = null;
        this.phase = 'SETUP';
        this.slots.clear();
        this.revealed = false;
        this.controllerTreasure = null;
        this.treasure = null;
        this.round = null;
        this.unlocked = [];
        this.result = null;
        break;
      default:
        // timer:sync, monitor:stats and the kick events do not change what hydrate returns.
        break;
    }
  }

  /** True while the mock phone's session is open: its token is valid. */
  phoneInSession(): boolean {
    return !this.phoneSessionClosed && this.sessionId === this.phone.sessionId;
  }

  /** API 27 · GET /api/display/state */
  display(now: string): unknown {
    return {
      serverNow: now,
      phase: this.phase,
      joinUrl: JOIN_URL,
      session: this.sessionId ? { capacity: this.capacity, joinedCount: this.joinedCount } : null,
      // D16: no names on the big screen until every name is approved.
      players: this.revealed
        ? this.sortedSlots().map(({ slotNumber, label, shape, connection, state, bestScore, latest }) => ({
            slotNumber, label, shape, connection, state, bestScore, latest,
          }))
        : [],
      treasure: this.treasure,
      round: this.round && {
        roundId: this.round.roundId,
        roundNumber: this.round.roundNumber,
        durationSeconds: this.round.durationSeconds,
        roundEndAt: this.round.roundEndAt,
      },
      unlocked: this.unlocked,
      result: this.result,
    };
  }

  /** API 23 · GET /api/player/me, for the mock phone. */
  player(now: string): HydrateResult {
    if (!this.phoneInSession()) return { status: 401, code: 'SESSION_CLOSED' };
    // Before the script reaches the phone's own join, the phone is already in the lobby.
    const me = this.slots.get(this.phone.slot) ?? { ...this.phone.player, bestScore: null };
    const canSubmit =
      this.phase === 'PLAYING' && me.state === 'PLAYING' && !!this.round && Date.parse(now) < Date.parse(this.round.roundEndAt);
    return {
      status: 200,
      body: {
        serverNow: now,
        player: { id: `ply_${me.slotNumber}`, slotNumber: me.slotNumber, label: me.label, shape: me.shape, state: me.state, bestScore: me.bestScore },
        session: { id: this.sessionId, phase: this.phase, capacity: this.capacity, joinedCount: this.joinedCount },
        // D16: no names on phones until every name is approved.
        players: this.revealed
          ? this.sortedSlots().map(({ slotNumber, label, shape, connection, state }) => ({ slotNumber, label, shape, connection, state }))
          : [],
        treasure: this.treasure,
        round: this.round,
        prompts: this.phonePrompts,
        canSubmit,
      },
    };
  }

  /** API 5 · GET /api/controller/sessions/active */
  controller(now: string): unknown {
    const slots = this.sessionId
      ? Array.from({ length: this.capacity }, (_, i) => {
          const slotNumber = i + 1;
          const s = this.slots.get(slotNumber);
          return {
            slotNumber,
            code: this.boothCode(slotNumber),
            shape: SHAPES[i] ?? SHAPES[0],
            slotState: !s ? 'UNJOINED' : s.connection === 'DISCONNECTED' ? 'DISCONNECTED' : s.state,
            player: s
              ? {
                  id: `ply_${slotNumber}`,
                  label: s.label,
                  fullName: s.fullName,
                  entranceId: s.entranceId,
                  connection: s.connection,
                  bestScore: s.bestScore,
                  nameReview: s.nameReview,
                }
              : null,
          };
        })
      : [];
    return {
      serverNow: now,
      eventDay: {
        id: 'evt_01',
        status: 'OPEN',
        confirmedCount: this.confirmedCount,
        csvExportedAt: null,
        csvUpToDate: false,
        lastSettings: this.lastSettings,
        winners: this.winners,
      },
      session: this.sessionId && {
        id: this.sessionId,
        phase: this.phase,
        capacity: this.capacity,
        roundDurationSeconds: this.roundDurationSeconds,
        joinedCount: this.joinedCount,
      },
      slots,
      treasure: this.controllerTreasure,
      round: this.round,
      audit: this.audit,
    };
  }

  private sortedSlots(): Slot[] {
    return [...this.slots.values()].sort((a, b) => a.slotNumber - b.slotNumber);
  }

  /** A 2-digit booth code, unique within the session and different for each session. */
  private boothCode(slotNumber: number): string {
    return String(10 + ((slotNumber * 17 + this.sessionCount * 29) % 90));
  }

  private log(at: string, summary: string): void {
    this.audit.unshift({ at, summary });
    this.audit.length = Math.min(this.audit.length, AUDIT_LIMIT);
  }
}
