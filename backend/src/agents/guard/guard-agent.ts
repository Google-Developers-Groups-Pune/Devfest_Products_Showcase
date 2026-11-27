import { calculateScore } from '../../domain/scoring/guard-score.js';
import type { AiGateway } from '../gateway.js';
import { buildGuardSystemInstruction, GUARD_PROMPT_VERSION } from '../prompts/guard-v1.js';
import type { GuardAgent, GuardInput, GuardResult } from '../types.js';
import { guardResponseSchema } from './guard-response.js';

/**
 * The real guardAgent (BE-17): the model gives marks, `calculateScore` adds them up.
 *
 * - The fixed `guard-v1` instruction plus the pinned treasure and hidden criteria go in the
 *   system instruction. The player's trimmed text is the only user part, with nothing added.
 * - The AI gateway applies the guard settings (temperature 0, seed, 400 tokens), the timeout,
 *   and retries on invalid output. After the last retry it throws a retryable AgentError.
 * - No caching: two identical prompts may score differently (D18).
 */
export class ModelGuardAgent implements GuardAgent {
  readonly name = 'guard';

  constructor(private readonly gateway: AiGateway) {}

  get model(): string {
    return this.gateway.modelFor('guard');
  }

  ping(): Promise<void> {
    return this.gateway.ping('guard');
  }

  async score(input: GuardInput): Promise<GuardResult> {
    const promptText = input.promptText.trim();
    if (promptText.length === 0) throw new Error('Guard called with an empty prompt');
    // 100 needs every hidden criterion met (D19), so a rubric without criteria is never scored.
    if (input.rubric.scoringCriteria.length === 0) throw new Error('Guard called with a rubric that has no criteria');

    const result = await this.gateway.generateStructured({
      agent: 'guard',
      systemInstruction: buildGuardSystemInstruction(input.treasure, input.rubric.scoringCriteria),
      userParts: [promptText],
      schema: guardResponseSchema(input.rubric.scoringCriteria),
    });
    const r = result.data;

    return {
      score: calculateScore({
        relevance: r.relevance,
        ideaQuality: r.ideaQuality,
        creativityClarity: r.creativityClarity,
        criteria: r.criteria,
        manipulationAttempt: r.manipulationAttempt,
      }),
      playerFeedback: r.playerFeedback,
      rubricVersion: input.rubric.version,
      promptVersion: GUARD_PROMPT_VERSION,
      model: result.model,
      modelVersion: result.modelVersion ?? null,
    };
  }
}
