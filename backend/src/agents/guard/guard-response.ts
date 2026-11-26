import { z } from 'zod';
import { MARK_LIMITS } from '../../domain/scoring/guard-score.js';

/** Feedback is "one short sentence". Anything longer is treated as invalid output. */
export const MAX_FEEDBACK_CHARS = 200;

/** Shape the Guard model must return (BE-17 response schema). */
const GuardResponseShape = z.object({
  relevance: z.int().min(0).max(MARK_LIMITS.relevance),
  ideaQuality: z.int().min(0).max(MARK_LIMITS.ideaQuality),
  creativityClarity: z.int().min(0).max(MARK_LIMITS.creativityClarity),
  criteria: z.array(z.object({ index: z.int().min(1), met: z.boolean() })),
  manipulationAttempt: z.boolean(),
  playerFeedback: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS),
});

/**
 * The response schema for one call, checked against the pinned rubric. The AI gateway (BE-14)
 * validates the model's answer with it, and any failure is a retryable INVALID_OUTPUT:
 * a mark out of range, criteria that do not match the rubric one for one, or feedback that
 * quotes a hidden criterion. Issue messages never contain the answer or the rubric.
 */
export function guardResponseSchema(scoringCriteria: readonly string[]) {
  return GuardResponseShape.superRefine((r, ctx) => {
    const n = scoringCriteria.length;
    const indexes = new Set(r.criteria.map((c) => c.index));
    const matchesRubric = n > 0 && r.criteria.length === n && indexes.size === n && [...indexes].every((i) => i <= n);
    if (!matchesRubric) {
      ctx.addIssue({ code: 'custom', path: ['criteria'], message: `Expected criteria 1 to ${n}, once each` });
    }
    if (quotesCriterion(r.playerFeedback, scoringCriteria)) {
      ctx.addIssue({ code: 'custom', path: ['playerFeedback'], message: 'Feedback quotes a hidden criterion' });
    }
  });
}

/** Words of a phrase, lower case, letters and digits only (any script). Marks keep Hindi vowel signs in the word. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** Consecutive words that count as quoting a criterion. */
const QUOTE_WORDS = 4;

/**
 * True if the feedback repeats any run of 4 consecutive words from a criterion, or a whole
 * criterion shorter than that. Single shared words ("vacation", "shrimp") are fine: the
 * feedback is meant to point towards what would improve the message.
 */
export function quotesCriterion(feedback: string, scoringCriteria: readonly string[]): boolean {
  const haystack = ` ${words(feedback).join(' ')} `;
  return scoringCriteria.some((criterion) => {
    const w = words(criterion);
    const size = Math.min(QUOTE_WORDS, w.length);
    if (size < 2) return false;
    for (let i = 0; i + size <= w.length; i++) {
      if (haystack.includes(` ${w.slice(i, i + size).join(' ')} `)) return true;
    }
    return false;
  });
}
