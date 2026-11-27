import { z } from 'zod';
import type { AiGateway } from './gateway.js';
import {
  RUBRIC_VERSION,
  SIMULATED_SUFFIX,
  TREASURE_LIMITS,
  treasureInstruction,
} from './prompts/treasure-v1.js';
import type { TreasureAgent, TreasureDraft, TreasureInput } from './types.js';

const text = (max: number) => z.string().trim().min(1).max(max);

/** What the model must return. Lengths keep the card on one phone screen. */
export const TreasureOutputSchema = z.object({
  title: text(TREASURE_LIMITS.title),
  visibleBackstory: text(TREASURE_LIMITS.backstory + SIMULATED_SUFFIX.length + 1),
  visibleLockObjective: text(TREASURE_LIMITS.objective),
  visualAssetPrompt: text(TREASURE_LIMITS.imagePrompt),
  hiddenCriteria: z
    .array(z.object({ criterion: text(TREASURE_LIMITS.criterion), mentionedInObjective: z.boolean() }))
    .length(3),
});

export type TreasureOutput = z.infer<typeof TreasureOutputSchema>;

/**
 * The schema for one call. Adds two rules the model must meet, or the gateway retries:
 * at least one criterion goes beyond the visible objective (D23), and the title is not one
 * already used today.
 */
export function treasureSchemaFor(usedTitles: string[]) {
  const used = new Set(usedTitles.map(normaliseTitle));
  return TreasureOutputSchema.refine(
    (output) => output.hiddenCriteria.some((criterion) => !criterion.mentionedInObjective),
    { message: 'At least one criterion must go beyond the objective', path: ['hiddenCriteria'] },
  ).refine((output) => !used.has(normaliseTitle(output.title)), {
    message: 'Title already used today',
    path: ['title'],
  });
}

function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Every backstory ends with "(A simulated treasure.)", as in the design. */
export function withSimulatedSuffix(backstory: string): string {
  const trimmed = backstory.trim();
  return trimmed.endsWith(SIMULATED_SUFFIX) ? trimmed : `${trimmed} ${SIMULATED_SUFFIX}`;
}

/**
 * The real treasureAgent (BE-16). Generates the visible card, the image prompt for BE-35 and
 * the hidden rubric that BE-17 scores against. The server assigns the candidate ID (BE-19),
 * and the filter checks the card and image before the Controller sees them.
 */
export class GeminiTreasureAgent implements TreasureAgent {
  readonly name = 'treasure';

  constructor(private readonly gateway: AiGateway) {}

  get model(): string {
    return this.gateway.modelFor('treasure');
  }

  ping(): Promise<void> {
    return this.gateway.ping('treasure');
  }

  async generate(input: TreasureInput): Promise<TreasureDraft> {
    const { data } = await this.gateway.generateStructured({
      agent: 'treasure',
      systemInstruction: treasureInstruction(input),
      userParts: ['Create one new treasure.'],
      schema: treasureSchemaFor(input.usedTitles),
    });
    return toDraft(data);
  }
}

export function toDraft(output: TreasureOutput): TreasureDraft {
  return {
    title: output.title,
    visibleBackstory: withSimulatedSuffix(output.visibleBackstory),
    visibleLockObjective: output.visibleLockObjective,
    visualAssetPrompt: output.visualAssetPrompt,
    hiddenRubric: {
      version: RUBRIC_VERSION,
      scoringCriteria: output.hiddenCriteria.map((criterion) => criterion.criterion),
    },
  };
}
