import { z } from 'zod';
import { isAgentError } from './errors.js';
import type { AiGateway, UserPart } from './gateway.js';
import { filterInstruction, type FilterSubject } from './prompts/filter-v1.js';
import type { FilterAgent, FilterResult, GeneratedImage, TreasureCard } from './types.js';

/** What the model must return. */
export const FilterOutputSchema = z.object({
  decision: z.enum(['ALLOW', 'BLOCK']),
  reason: z.string().min(1).max(200),
});

/**
 * The real filterAgent (BE-15): the safety gate for prompts, treasure text, treasure images
 * and emoji reactions. Calls the model through the AI gateway.
 *
 * - The checked content is always its own user part, never part of the instruction.
 * - Fails closed: if the model cannot decide, the result is BLOCK with `failedClosed: true`.
 * - Never logs or returns the checked content. The reason is a short server-only note.
 */
export class GeminiFilterAgent implements FilterAgent {
  readonly name = 'filter';

  constructor(private readonly gateway: AiGateway) {}

  get model(): string {
    return this.gateway.modelFor('filter');
  }

  ping(): Promise<void> {
    return this.gateway.ping('filter');
  }

  checkPrompt(text: string): Promise<FilterResult> {
    return this.check('PROMPT', [text]);
  }

  checkTreasure(card: TreasureCard): Promise<FilterResult> {
    return this.check('TREASURE', [
      `Title: ${card.title}`,
      `Backstory: ${card.visibleBackstory}`,
      `Objective: ${card.visibleLockObjective}`,
    ]);
  }

  checkImage(image: GeneratedImage): Promise<FilterResult> {
    if (image.bytes.length === 0) return Promise.resolve({ decision: 'BLOCK', reason: 'Empty image' });
    return this.check('IMAGE', [{ mimeType: image.mimeType, data: Buffer.from(image.bytes).toString('base64') }]);
  }

  checkReaction(text: string): Promise<FilterResult> {
    return this.check('REACTION', [text]);
  }

  private async check(subject: FilterSubject, userParts: UserPart[]): Promise<FilterResult> {
    try {
      const { data } = await this.gateway.generateStructured({
        agent: 'filter',
        systemInstruction: filterInstruction(subject),
        userParts,
        schema: FilterOutputSchema,
      });
      return { decision: data.decision, reason: data.reason };
    } catch (err) {
      // The gateway has already retried and logged the failure. Never show undecided content.
      const code = isAgentError(err) ? err.code : 'UNKNOWN';
      return { decision: 'BLOCK', reason: `Filter could not decide: ${code}`, failedClosed: true };
    }
  }
}
