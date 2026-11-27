/**
 * Guard scoring (BE-17, decision D19): the model gives marks, this code adds them up.
 * Plain code, so the same marks always give the same score.
 */

export const MARK_LIMITS = {
  relevance: 40,
  ideaQuality: 30,
  creativityClarity: 30,
} as const;

export interface CriterionMark {
  /** 1-based, in the order of the pinned rubric's `scoringCriteria`. */
  index: number;
  met: boolean;
}

/** The Guard model's marks, already checked by `guardResponseSchema`. */
export interface GuardMarks {
  relevance: number;
  ideaQuality: number;
  creativityClarity: number;
  criteria: CriterionMark[];
  manipulationAttempt: boolean;
}

/**
 * 0 for a manipulation attempt. Otherwise the sum of the three marks, capped at 99 unless
 * every hidden criterion is met, so 100 (unlock) needs full marks and all criteria.
 */
export function calculateScore(r: GuardMarks): number {
  if (r.manipulationAttempt) return 0;
  const score = r.relevance + r.ideaQuality + r.creativityClarity;
  const allMet = r.criteria.every((c) => c.met);
  return allMet ? score : Math.min(score, 99);
}
