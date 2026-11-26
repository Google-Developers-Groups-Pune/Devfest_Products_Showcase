/**
 * Agent interfaces (BE-14). Services depend on these, never on Gemini directly, so every
 * story can build and test against the deterministic `Fake*` agents in `./fakes/`.
 *
 * Player text is always passed to the model as a separate data part, never joined into
 * the system instruction.
 */

export const AGENT_NAMES = ['treasure', 'image', 'filter', 'guard', 'emoji'] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** What every agent shares: its name, the model it calls, and a cheap health probe. */
export interface Agent {
  readonly name: AgentName;
  /** Model ID from config (never hard-coded). */
  readonly model: string;
  /** Resolves if the agent can serve calls, rejects otherwise. Used by API 18. */
  ping(): Promise<void>;
}

// ---------------------------------------------------------------- filterAgent (BE-15)

export type FilterDecision = 'ALLOW' | 'BLOCK';

export interface FilterResult {
  decision: FilterDecision;
  /** Short reason for the server only. Never sent to a player (decision D50). */
  reason: string;
}

/** The player-visible part of a treasure, checked before the Controller sees it. */
export interface TreasureCard {
  title: string;
  visibleBackstory: string;
  visibleLockObjective: string;
}

export interface FilterAgent extends Agent {
  readonly name: 'filter';
  checkPrompt(text: string): Promise<FilterResult>;
  checkTreasure(card: TreasureCard): Promise<FilterResult>;
  checkImage(image: GeneratedImage): Promise<FilterResult>;
  checkReaction(text: string): Promise<FilterResult>;
}

// ---------------------------------------------------------------- guardAgent (BE-17)

export interface HiddenRubric {
  version: string;
  /** Exactly 3 criteria (BE-16, decision D23). */
  scoringCriteria: string[];
}

export interface GuardInput {
  /** The player's trimmed prompt. Untrusted. */
  promptText: string;
  /** The pinned treasure. The backstory lets the Guard reward plans built on the guard's weakness (D19). */
  treasure: { treasureId: string; title: string; visibleBackstory: string; visibleLockObjective: string };
  rubric: HiddenRubric;
}

export interface GuardResult {
  /** Integer 0 to 100, added up in code from the model's marks. */
  score: number;
  /** One short sentence. Never quotes the rubric. */
  playerFeedback: string;
  /** From the pinned rubric, never from the model. */
  rubricVersion: string;
  /** System instruction version, for example `guard-v1`. Recorded with every score (BE-17). */
  promptVersion: string;
  /** Model ID and the version the model reported, recorded with every score (BE-17). */
  model: string;
  modelVersion: string | null;
}

export interface GuardAgent extends Agent {
  readonly name: 'guard';
  score(input: GuardInput): Promise<GuardResult>;
}

// ---------------------------------------------------------------- treasureAgent (BE-16)

export interface TreasureInput {
  /** Treasures already used today, so they are not repeated. */
  usedTitles: string[];
  roundDurationSeconds: number;
}

/** One generated treasure. The server assigns the candidate ID. */
export interface TreasureDraft extends TreasureCard {
  /** Always an image prompt, consumed by the image agent (BE-35). */
  visualAssetPrompt: string;
  hiddenRubric: HiddenRubric;
}

export interface TreasureAgent extends Agent {
  readonly name: 'treasure';
  generate(input: TreasureInput): Promise<TreasureDraft>;
}

// ---------------------------------------------------------------- imageAgent (BE-35)

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  /** The model that produced it: `IMAGE_MODEL` or `IMAGE_MODEL_FALLBACK`. */
  model: string;
}

export interface ImageAgent extends Agent {
  readonly name: 'image';
  generate(prompt: string): Promise<GeneratedImage>;
}

// ---------------------------------------------------------------- emojiAgent (BE-18)

/** Starting list. The final list comes from FE-31. */
export const EXPRESSIONS = ['NEUTRAL', 'BORED', 'UNIMPRESSED', 'CURIOUS', 'IMPRESSED', 'SHOCKED', 'SALUTE'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface EmojiInput {
  /** The player's public label only. */
  label: string;
  promptText: string;
  score: number;
}

export interface EmojiReaction {
  /** At most 100 characters. Null on timeout or failure (decisions D42, D49). */
  reaction: string | null;
  expression: Expression;
}

export interface EmojiAgent extends Agent {
  readonly name: 'emoji';
  react(input: EmojiInput): Promise<EmojiReaction>;
}

// ----------------------------------------------------------------

export interface Agents {
  treasure: TreasureAgent;
  image: ImageAgent;
  filter: FilterAgent;
  guard: GuardAgent;
  emoji: EmojiAgent;
}
