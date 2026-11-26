import type { Clock } from '../core/clock.js';
import { AppError } from '../core/errors.js';
import { SHAPES, type Shape } from '../data/types.js';
import type { MonitorStats } from '../realtime/events.js';
import type { RealtimeEmitter } from '../realtime/emitter.js';

/**
 * Live monitor for the Controller (BE-26, API 11, `monitor:stats`).
 *
 * The four stat tiles: prompts scored, players unlocked, one blocked total with no categories
 * (D50), and agent errors. Blocked prompt text is never read into the view.
 */

/** Everything the monitor needs about one round, already filtered of blocked text. */
export interface MonitorSnapshot {
  round: {
    roundId: string;
    /** This round's number: its confirmed number, or the next one while it is still live (D35). */
    roundNumber: number;
    roundEndAt: Date | null;
  };
  prompts: Array<{
    promptId: string;
    sequence: number;
    playerId: string;
    filterDecision: 'ALLOWED' | 'BLOCKED' | null;
    /** Display text of an allowed prompt. Always null for a blocked or unchecked one. */
    text: string | null;
  }>;
  scores: Array<{ promptId: string; score: number }>;
  /** Display-safe reactions only. */
  reactions: Array<{ promptId: string; reaction: string }>;
  players: Array<{ playerId: string; slotNumber: number; label: string }>;
  errors: Array<{ at: Date; agent: string; code: string }>;
}

export interface MonitorStore {
  /** Undefined if no round has this ID. */
  load(roundId: string): Promise<MonitorSnapshot | undefined>;
}

export interface MonitorPrompt {
  sequence: number;
  slotNumber: number;
  label: string;
  shape: Shape;
  text: string;
  score: number;
  reaction: string | null;
}

export interface MonitorView {
  round: { roundId: string; roundNumber: number; roundEndAt: string; serverNow: string };
  stats: MonitorStats;
  approvedPrompts: MonitorPrompt[];
  errors: Array<{ at: string; agent: string; code: string }>;
}

/** The four tiles. */
export function monitorStats(snapshot: MonitorSnapshot): MonitorStats {
  const roundPrompts = new Map(snapshot.prompts.map((prompt) => [prompt.promptId, prompt]));
  const scored = snapshot.scores.filter((score) => roundPrompts.has(score.promptId));
  const unlocked = new Set(
    scored.filter((score) => score.score === 100).map((score) => roundPrompts.get(score.promptId)?.playerId),
  );
  return {
    promptsScored: scored.length,
    unlockedCount: unlocked.size,
    blockedCount: snapshot.prompts.filter((prompt) => prompt.filterDecision === 'BLOCKED').length,
    agentErrors: snapshot.errors.length,
  };
}

/** Allowed, scored prompts, newest first. */
export function approvedPrompts(snapshot: MonitorSnapshot): MonitorPrompt[] {
  const scores = new Map(snapshot.scores.map((score) => [score.promptId, score.score]));
  const reactions = new Map(snapshot.reactions.map((reaction) => [reaction.promptId, reaction.reaction]));
  const players = new Map(snapshot.players.map((player) => [player.playerId, player]));

  const prompts: MonitorPrompt[] = [];
  for (const prompt of snapshot.prompts) {
    const score = scores.get(prompt.promptId);
    const player = players.get(prompt.playerId);
    if (prompt.filterDecision !== 'ALLOWED' || prompt.text === null || score === undefined || !player) continue;
    prompts.push({
      sequence: prompt.sequence,
      slotNumber: player.slotNumber,
      label: player.label,
      shape: shapeFor(player.slotNumber),
      text: prompt.text,
      score,
      reaction: reactions.get(prompt.promptId) ?? null,
    });
  }
  return prompts.sort((a, b) => b.sequence - a.sequence);
}

/** Colour markers are fixed by slot (docs/STORIES.md). */
export function shapeFor(slotNumber: number): Shape {
  const shape = SHAPES[slotNumber - 1];
  if (!shape) throw new Error(`No shape for slot ${slotNumber}`);
  return shape;
}

export class RoundMonitorService {
  constructor(
    private readonly store: MonitorStore,
    private readonly clock: Clock,
    private readonly emitter: Pick<RealtimeEmitter, 'toController'>,
  ) {}

  /** API 11. 404 for an unknown round, 409 before the round has started. */
  async view(roundId: string): Promise<MonitorView> {
    const snapshot = await this.load(roundId);
    const { roundEndAt } = snapshot.round;
    if (roundEndAt === null) throw new AppError(409, 'INVALID_PHASE', 'This round has not started yet.');
    return {
      round: {
        roundId: snapshot.round.roundId,
        roundNumber: snapshot.round.roundNumber,
        roundEndAt: roundEndAt.toISOString(),
        serverNow: this.clock.now().toISOString(),
      },
      stats: monitorStats(snapshot),
      approvedPrompts: approvedPrompts(snapshot),
      errors: [...snapshot.errors]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((error) => ({ at: error.at.toISOString(), agent: error.agent, code: error.code })),
    };
  }

  /**
   * Sends the current tiles to the Controller as `monitor:stats`. Call it after every change
   * that moves a tile: a prompt blocked or scored, a player unlocked, an agent error.
   */
  async publishStats(roundId: string): Promise<MonitorStats> {
    const stats = monitorStats(await this.load(roundId));
    this.emitter.toController('monitor:stats', stats);
    return stats;
  }

  private async load(roundId: string): Promise<MonitorSnapshot> {
    const snapshot = await this.store.load(roundId);
    if (!snapshot) throw new AppError(404, 'NOT_FOUND', 'That round was not found.');
    return snapshot;
  }
}
