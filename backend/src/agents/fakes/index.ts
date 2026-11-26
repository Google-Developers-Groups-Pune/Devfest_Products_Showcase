import { AgentError } from '../errors.js';
import type {
  AgentName,
  Agents,
  EmojiAgent,
  EmojiInput,
  EmojiReaction,
  FilterAgent,
  FilterResult,
  GeneratedImage,
  GuardAgent,
  GuardInput,
  GuardResult,
  ImageAgent,
  TreasureAgent,
  TreasureCard,
  TreasureDraft,
  TreasureInput,
} from '../types.js';

/**
 * Deterministic agents for tests and local development (BE-14). Same input, same output,
 * no network. Use them until the real agents land, and in every unit test.
 *
 * Each fake can be switched off (`down = true`, so API 18 reports it DOWN) or told to
 * throw on its next calls (`failNextWith(error)`), so failure paths can be tested.
 */
abstract class FakeAgent<N extends AgentName> {
  abstract readonly name: N;
  readonly model: string;
  /** While true, `ping()` and every call reject. */
  down = false;
  /** Number of calls made, not counting `ping()`. */
  calls = 0;
  private readonly queuedFailures: Error[] = [];

  constructor(model?: string) {
    this.model = model ?? 'fake';
  }

  /** The next call throws `error`. Call it several times to queue several failures. */
  failNextWith(error: Error): this {
    this.queuedFailures.push(error);
    return this;
  }

  ping(): Promise<void> {
    if (this.down) return Promise.reject(this.downError());
    return Promise.resolve();
  }

  /**
   * Counts the call, then rejects with a queued failure (or because the agent is down),
   * or resolves with `result()`. Every agent method goes through it.
   */
  protected run<T>(result: () => T): Promise<T> {
    this.calls += 1;
    if (this.down) return Promise.reject(this.downError());
    const failure = this.queuedFailures.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(result());
  }

  private downError(): AgentError {
    return new AgentError(this.name, 'MODEL_ERROR', true, `Fake ${this.name} agent is down`);
  }
}

// ---------------------------------------------------------------- filter

/** Text containing this marker (any case) is blocked by `FakeFilterAgent`. */
export const FAKE_BLOCK_MARKER = '[block]';

export class FakeFilterAgent extends FakeAgent<'filter'> implements FilterAgent {
  readonly name = 'filter';

  checkPrompt(text: string): Promise<FilterResult> {
    return this.run(() => decide(text));
  }

  checkTreasure(card: TreasureCard): Promise<FilterResult> {
    return this.run(() => decide(`${card.title}\n${card.visibleBackstory}\n${card.visibleLockObjective}`));
  }

  checkImage(image: GeneratedImage): Promise<FilterResult> {
    return this.run((): FilterResult =>
      image.bytes.length === 0 ? { decision: 'BLOCK', reason: 'Fake filter: empty image' } : allow(),
    );
  }

  checkReaction(text: string): Promise<FilterResult> {
    return this.run(() => decide(text));
  }
}

function decide(text: string): FilterResult {
  return text.toLowerCase().includes(FAKE_BLOCK_MARKER)
    ? { decision: 'BLOCK', reason: 'Fake filter: block marker' }
    : allow();
}

function allow(): FilterResult {
  return { decision: 'ALLOW', reason: 'Fake filter: allowed' };
}

// ---------------------------------------------------------------- guard

/** A prompt containing this marker (any case) scores 100 with `FakeGuardAgent`. */
export const FAKE_UNLOCK_MARKER = '[unlock]';

export class FakeGuardAgent extends FakeAgent<'guard'> implements GuardAgent {
  readonly name = 'guard';

  /**
   * Default score: 100 with the unlock marker, otherwise a stable 0 to 99 worked out from
   * the text. Pass `scoreFor` to choose scores in a test.
   */
  constructor(
    private readonly scoreFor: (input: GuardInput) => number = defaultScore,
    model?: string,
  ) {
    super(model);
  }

  score(input: GuardInput): Promise<GuardResult> {
    return this.run(() => {
      const score = Math.max(0, Math.min(100, Math.round(this.scoreFor(input))));
      return { score, playerFeedback: feedbackFor(score), rubricVersion: input.rubric.version };
    });
  }
}

function defaultScore(input: GuardInput): number {
  const text = input.promptText.trim();
  if (text.toLowerCase().includes(FAKE_UNLOCK_MARKER)) return 100;
  return stableHash(text) % 100;
}

function feedbackFor(score: number): string {
  if (score === 100) return 'The guard has met their match!';
  if (score >= 80) return 'So close. One more clever touch could do it.';
  if (score >= 40) return 'A decent start. What does this guard really want?';
  return 'Too plain. Try a plan that fits this treasure.';
}

/** FNV-1a. Stable across runs and platforms. */
function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------- treasure

export const FAKE_TREASURES: readonly TreasureDraft[] = [
  {
    title: 'The Golden Mango of Eternal Juiciness',
    visibleBackstory:
      'Barnaby the flamingo guard hates his job and is severely underpaid in shrimp. (A simulated treasure.)',
    visibleLockObjective: 'Convince Barnaby the Flamingo Guard to unlock the Golden Mango.',
    visualAssetPrompt: 'A glowing golden mango in a bird cage, guarded by a grumpy pink flamingo, cartoon style',
    hiddenRubric: {
      version: 'v1',
      scoringCriteria: [
        'Uses emotional manipulation or bribery',
        'Has a playful, comic tone',
        'Mentions the word "Flamingo" or "Vacation"',
      ],
    },
  },
  {
    title: 'The Saffron Vault',
    visibleBackstory:
      'A sleepy robot chef guards the last jar of saffron and only wakes up for good food. (A simulated treasure.)',
    visibleLockObjective: 'Persuade the robot chef to open the Saffron Vault.',
    visualAssetPrompt: 'A small brass vault full of saffron, a sleepy cartoon robot chef beside it',
    hiddenRubric: {
      version: 'v1',
      scoringCriteria: ['Appeals to the chef with food', 'Wakes the robot up in a creative way', 'Mentions "biryani"'],
    },
  },
  {
    title: 'The Midnight Chai Recipe',
    visibleBackstory:
      'An old owl keeps the perfect chai recipe and trades it only for a good story. (A simulated treasure.)',
    visibleLockObjective: 'Tell the owl a story good enough to earn the chai recipe.',
    visualAssetPrompt: 'A wise cartoon owl on a branch holding a steaming cup of chai under the moon',
    hiddenRubric: {
      version: 'v1',
      scoringCriteria: ['Tells a short story', 'Has a twist at the end', 'Mentions "moonlight"'],
    },
  },
];

export class FakeTreasureAgent extends FakeAgent<'treasure'> implements TreasureAgent {
  readonly name = 'treasure';

  /** Returns the first fixture not used today, or cycles through them when all are used. */
  generate(input: TreasureInput): Promise<TreasureDraft> {
    return this.run(() => {
      const used = new Set(input.usedTitles);
      const fresh = FAKE_TREASURES.find((treasure) => !used.has(treasure.title));
      const pick = fresh ?? FAKE_TREASURES[(this.calls - 1) % FAKE_TREASURES.length];
      return structuredClone(pick as TreasureDraft);
    });
  }
}

// ---------------------------------------------------------------- image

/** An 8 by 8 yellow JPEG (269 bytes). */
const FAKE_JPEG_BASE64 =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwC6Ajyz/9k=';

export class FakeImageAgent extends FakeAgent<'image'> implements ImageAgent {
  readonly name = 'image';

  /** The last prompt received, so tests can check what was asked for. */
  lastPrompt: string | undefined;

  /** Always returns the same small JPEG. */
  generate(prompt: string): Promise<GeneratedImage> {
    this.lastPrompt = prompt;
    return this.run(() => ({
      bytes: Uint8Array.from(Buffer.from(FAKE_JPEG_BASE64, 'base64')),
      mimeType: 'image/jpeg',
      model: this.model,
    }));
  }
}

// ---------------------------------------------------------------- emoji

export class FakeEmojiAgent extends FakeAgent<'emoji'> implements EmojiAgent {
  readonly name = 'emoji';

  react(input: EmojiInput): Promise<EmojiReaction> {
    return this.run((): EmojiReaction => {
      const { label, score } = input;
      if (score >= 80) return { reaction: limit(`Arey wah ${label} ji! Guard toh fan ho gaya! 🎉`), expression: 'IMPRESSED' };
      if (score >= 40) return { reaction: limit(`Theek hai ${label}, thoda aur masala daalo! 😄`), expression: 'CURIOUS' };
      return { reaction: limit(`Arre ${label} bhai, itna seedha prompt? 😂`), expression: 'UNIMPRESSED' };
    });
  }
}

/** Reactions are at most 100 characters (decision D39). */
function limit(text: string): string {
  return [...text].slice(0, 100).join('');
}

// ----------------------------------------------------------------

export interface FakeAgents extends Agents {
  treasure: FakeTreasureAgent;
  image: FakeImageAgent;
  filter: FakeFilterAgent;
  guard: FakeGuardAgent;
  emoji: FakeEmojiAgent;
}

/** One fresh set of all five fake agents. */
export function createFakeAgents(): FakeAgents {
  return {
    treasure: new FakeTreasureAgent(),
    image: new FakeImageAgent(),
    filter: new FakeFilterAgent(),
    guard: new FakeGuardAgent(),
    emoji: new FakeEmojiAgent(),
  };
}
