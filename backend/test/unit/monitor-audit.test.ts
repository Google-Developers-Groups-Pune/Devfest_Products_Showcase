import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFakeAgents } from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { firestoreAuditStore } from '../../src/data/audit-store.js';
import { firestoreMonitorStore, type MonitorRepos } from '../../src/data/monitor-store.js';
import type { Repositories } from '../../src/data/repositories/index.js';
import { AuditLogService, parseLimit, type AuditRecord } from '../../src/services/audit-log.js';
import {
  approvedPrompts,
  monitorStats,
  RoundMonitorService,
  shapeFor,
  type MonitorSnapshot,
} from '../../src/services/round-monitor.js';
import type { MonitorStats } from '../../src/realtime/events.js';

const END = new Date('2026-12-05T10:01:30.000Z');

function snapshot(over: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    round: { roundId: 'rnd_1', roundNumber: 1, roundEndAt: END },
    prompts: [
      { promptId: 'p1', sequence: 1, playerId: 'ply_1', filterDecision: 'ALLOWED', text: 'Give me a rhyme' },
      { promptId: 'p2', sequence: 2, playerId: 'ply_2', filterDecision: 'BLOCKED', text: null },
      { promptId: 'p3', sequence: 3, playerId: 'ply_2', filterDecision: 'ALLOWED', text: 'Barnaby, vacation!' },
      { promptId: 'p4', sequence: 4, playerId: 'ply_1', filterDecision: 'ALLOWED', text: 'Still scoring' },
      { promptId: 'p5', sequence: 5, playerId: 'ply_2', filterDecision: 'ALLOWED', text: 'Again' },
    ],
    scores: [
      { promptId: 'p1', score: 34 },
      { promptId: 'p3', score: 100 },
      { promptId: 'p5', score: 100 },
    ],
    reactions: [{ promptId: 'p1', reaction: 'Vault ne smile bhi nahi kiya' }],
    players: [
      { playerId: 'ply_1', slotNumber: 1, label: 'Neha' },
      { playerId: 'ply_2', slotNumber: 3, label: 'Aman' },
    ],
    errors: [
      { at: new Date('2026-12-05T10:00:30.000Z'), agent: 'guard', code: 'TIMEOUT' },
      { at: new Date('2026-12-05T10:00:40.000Z'), agent: 'emoji', code: 'TIMEOUT' },
    ],
    ...over,
  };
}

describe('monitorStats', () => {
  it('counts the four tiles; a player unlocking twice counts once', () => {
    expect(monitorStats(snapshot())).toEqual({ promptsScored: 3, unlockedCount: 1, blockedCount: 1, agentErrors: 2 });
  });

  it('ignores scores for prompts outside the round', () => {
    const stats = monitorStats(snapshot({ scores: [{ promptId: 'other', score: 100 }] }));
    expect(stats).toMatchObject({ promptsScored: 0, unlockedCount: 0 });
  });
});

describe('approvedPrompts', () => {
  it('lists allowed, scored prompts newest first, with slot shape and reaction', () => {
    expect(approvedPrompts(snapshot())).toEqual([
      { sequence: 5, slotNumber: 3, label: 'Aman', shape: 'YELLOW_DIAMOND', text: 'Again', score: 100, reaction: null },
      {
        sequence: 3,
        slotNumber: 3,
        label: 'Aman',
        shape: 'YELLOW_DIAMOND',
        text: 'Barnaby, vacation!',
        score: 100,
        reaction: null,
      },
      {
        sequence: 1,
        slotNumber: 1,
        label: 'Neha',
        shape: 'BLUE_CIRCLE',
        text: 'Give me a rhyme',
        score: 34,
        reaction: 'Vault ne smile bhi nahi kiya',
      },
    ]);
  });

  it('never includes a blocked prompt, even if it has text and a score', () => {
    const leaky = snapshot({
      prompts: [{ promptId: 'p2', sequence: 2, playerId: 'ply_2', filterDecision: 'BLOCKED', text: 'secret' }],
      scores: [{ promptId: 'p2', score: 50 }],
    });
    expect(approvedPrompts(leaky)).toEqual([]);
  });

  it('maps every slot to its fixed shape', () => {
    expect([1, 2, 3, 4, 5].map(shapeFor)).toEqual([
      'BLUE_CIRCLE',
      'RED_SQUARE',
      'YELLOW_DIAMOND',
      'GREEN_PILL',
      'GREEN_CIRCLE',
    ]);
    expect(() => shapeFor(6)).toThrow();
  });
});

function monitorService(snap: MonitorSnapshot | undefined) {
  const emitted: Array<{ event: string; payload: MonitorStats }> = [];
  const clock = new FakeClock('2026-12-05T10:00:41.000Z');
  const service = new RoundMonitorService({ load: () => Promise.resolve(snap) }, clock, {
    toController: (event, payload) => {
      emitted.push({ event, payload: payload as MonitorStats });
    },
  });
  return { service, emitted, clock };
}

describe('RoundMonitorService', () => {
  it('builds the API 11 view with server time and newest errors first', async () => {
    const view = await monitorService(snapshot()).service.view('rnd_1');
    expect(view.round).toEqual({
      roundId: 'rnd_1',
      roundNumber: 1,
      roundEndAt: END.toISOString(),
      serverNow: '2026-12-05T10:00:41.000Z',
    });
    expect(view.errors.map((error) => error.agent)).toEqual(['emoji', 'guard']);
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('is 404 for an unknown round and 409 before the round starts', async () => {
    await expect(monitorService(undefined).service.view('nope')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    const notStarted = snapshot({ round: { roundId: 'rnd_1', roundNumber: 1, roundEndAt: null } });
    await expect(monitorService(notStarted).service.view('rnd_1')).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_PHASE',
    });
  });

  it('publishes monitor:stats to the Controller', async () => {
    const { service, emitted } = monitorService(snapshot());
    await service.publishStats('rnd_1');
    expect(emitted).toEqual([
      { event: 'monitor:stats', payload: { promptsScored: 3, unlockedCount: 1, blockedCount: 1, agentErrors: 2 } },
    ]);
  });
});

// ------------------------------------------------------------ Firestore stores, on in-memory repositories

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

function memoryRepo<T>(docs: Record<string, T>) {
  return {
    get: (id: string | number) => Promise.resolve(docs[String(id)]),
    list: () => Promise.resolve(Object.entries(docs).map(([id, data]) => ({ id, data }))),
  };
}

function monitorRepos(confirmedElsewhere: boolean, thisResult?: object) {
  const rounds: Record<string, Record<string, object>> = {
    ses_1: { rnd_0: { roundEndAt: ts('2026-12-05T09:00:00.000Z') } },
    ses_2: { rnd_1: { roundEndAt: ts(END.toISOString()) } },
  };
  const results: Record<string, object | undefined> = {
    rnd_0: confirmedElsewhere ? { confirmation: 'CONFIRMED', roundNumber: 1 } : { confirmation: 'DISCARDED' },
    rnd_1: thisResult,
  };
  const byRound = <T>(data: Record<string, Record<string, T>>) => (ref: { roundId: string }) =>
    memoryRepo(data[ref.roundId] ?? {});
  return {
    sessions: () => memoryRepo({ ses_1: {}, ses_2: {} }),
    rounds: (ref: { sessionId: string }) => memoryRepo(rounds[ref.sessionId] ?? {}),
    result: (ref: { roundId: string }) => ({ get: () => Promise.resolve(results[ref.roundId]) }),
    prompts: byRound({
      rnd_1: {
        p1: { sequence: 1, playerId: 'ply_1', filterDecision: 'ALLOWED', displayText: null, rawText: 'Give me a rhyme' },
        p2: { sequence: 2, playerId: 'ply_1', filterDecision: 'BLOCKED', displayText: null, rawText: 'BLOCKED TEXT' },
        p3: { sequence: 3, playerId: 'ply_1', filterDecision: null, displayText: null, rawText: 'PENDING TEXT' },
      },
    }),
    scores: byRound({ rnd_1: { p1: { promptId: 'p1', score: 34 } } }),
    reactions: byRound({
      rnd_1: {
        p1: { promptId: 'p1', reaction: 'Arre wah', displaySafe: true },
        p3: { promptId: 'p3', reaction: 'UNSAFE', displaySafe: false },
      },
    }),
    players: () => memoryRepo({ ply_1: { slotNumber: 2, firstName: 'Neha', fullName: 'Neha Kulkarni' } }),
    agentErrors: byRound({ rnd_1: { e1: { at: ts('2026-12-05T10:00:30.000Z'), agent: 'guard', code: 'TIMEOUT' } } }),
  } as unknown as MonitorRepos;
}

describe('firestoreMonitorStore', () => {
  it('finds the round in any session and never reads blocked or pending text', async () => {
    const snap = await firestoreMonitorStore(monitorRepos(false), 'evt_1').load('rnd_1');
    expect(snap?.round).toEqual({ roundId: 'rnd_1', roundNumber: 1, roundEndAt: END });
    expect(snap?.prompts.map((prompt) => prompt.text)).toEqual(['Give me a rhyme', null, null]);
    expect(snap?.reactions).toEqual([{ promptId: 'p1', reaction: 'Arre wah' }]);
    expect(snap?.players).toEqual([{ playerId: 'ply_1', slotNumber: 2, label: 'Neha' }]);
    expect(snap?.errors).toEqual([{ at: new Date('2026-12-05T10:00:30.000Z'), agent: 'guard', code: 'TIMEOUT' }]);
    const raw = JSON.stringify(snap);
    for (const hidden of ['BLOCKED TEXT', 'PENDING TEXT', 'UNSAFE', 'Kulkarni']) expect(raw).not.toContain(hidden);
  });

  it('numbers a live round after the confirmed ones (D35)', async () => {
    const snap = await firestoreMonitorStore(monitorRepos(true), 'evt_1').load('rnd_1');
    expect(snap?.round.roundNumber).toBe(2);
  });

  it('uses the stored number once the round is confirmed', async () => {
    const repos = monitorRepos(true, { confirmation: 'CONFIRMED', roundNumber: 7 });
    const snap = await firestoreMonitorStore(repos, 'evt_1').load('rnd_1');
    expect(snap?.round.roundNumber).toBe(7);
  });

  it('returns undefined for an unknown round', async () => {
    await expect(firestoreMonitorStore(monitorRepos(false), 'evt_1').load('rnd_x')).resolves.toBeUndefined();
  });
});

// ------------------------------------------------------------ audit log

function audit(id: string, iso: string, over: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id,
    at: new Date(iso),
    actor: 'CONTROLLER',
    action: 'TREASURE_APPROVED',
    summary: `Summary ${id}`,
    reason: null,
    correlationId: `corr_${id}`,
    ...over,
  };
}

const RECORDS = [
  audit('aud_1', '2026-12-05T10:00:00.000Z'),
  audit('aud_2', '2026-12-05T10:05:00.000Z'),
  audit('aud_3', '2026-12-05T10:05:00.000Z', { actor: 'SYSTEM', summary: undefined, action: 'EVENT_CLOSED' }),
  audit('aud_4', '2026-12-05T10:10:00.000Z', { reason: 'Player left' }),
];

const auditService = (records = RECORDS) => new AuditLogService({ list: () => Promise.resolve([...records]) });

describe('AuditLogService', () => {
  it('returns newest first in the API 19 shape', async () => {
    const page = await auditService().page();
    expect(page.items.map((item) => item.id)).toEqual(['aud_4', 'aud_3', 'aud_2', 'aud_1']);
    expect(page.items[0]).toEqual({
      id: 'aud_4',
      at: '2026-12-05T10:10:00.000Z',
      actor: 'controller',
      action: 'TREASURE_APPROVED',
      summary: 'Summary aud_4',
      reason: 'Player left',
      correlationId: 'corr_aud_4',
    });
    expect(page.items[1]).toMatchObject({ actor: 'system', summary: 'EVENT_CLOSED' });
    expect(page.nextCursor).toBeNull();
  });

  it('pages with a cursor, without gaps or repeats when times are equal', async () => {
    const service = auditService();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await service.page({ limit: 1, cursor });
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(['aud_4', 'aud_3', 'aud_2', 'aud_1']);
  });

  it('has no next page when the last page is exactly full', async () => {
    const first = await auditService().page({ limit: 2 });
    const second = await auditService().page({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((item) => item.id)).toEqual(['aud_2', 'aud_1']);
    expect(second.nextCursor).toBeNull();
  });

  it('refuses a cursor that is not valid', async () => {
    await expect(auditService().page({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });
});

describe('parseLimit', () => {
  it('defaults to 50 and accepts 1 to 100', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('100')).toBe(100);
  });

  it.each(['0', '101', '-1', '2.5', 'ten', ['1', '2']])('refuses %j with 422', (raw) => {
    expect(() => parseLimit(raw)).toThrow(expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }));
  });
});

describe('firestoreAuditStore', () => {
  it('maps stored entries', async () => {
    const repos = {
      auditEvents: () =>
        memoryRepo({
          aud_1: {
            at: ts('2026-12-05T10:00:00.000Z'),
            actor: 'CONTROLLER',
            controllerId: 'ctl_1',
            action: 'TREASURE_APPROVED',
            summary: 'Treasure approved - The Saffron Vault',
            reason: null,
            correlationId: 'corr_1',
          },
        }),
    } as unknown as Pick<Repositories, 'auditEvents'>;
    await expect(firestoreAuditStore(repos, 'evt_1').list()).resolves.toEqual([
      {
        id: 'aud_1',
        at: new Date('2026-12-05T10:00:00.000Z'),
        actor: 'CONTROLLER',
        action: 'TREASURE_APPROVED',
        summary: 'Treasure approved - The Saffron Vault',
        reason: null,
        correlationId: 'corr_1',
      },
    ]);
  });
});

// ------------------------------------------------------------ routes

describe('APIs 11 and 19', () => {
  const clock = new FakeClock('2026-12-05T10:00:41.000Z');
  const app = createApp({
    clock,
    logger: pino({ level: 'silent' }),
    corsOrigins: [],
    agentHealth: new AgentHealthService(createFakeAgents(), clock),
    monitor: new RoundMonitorService(
      { load: (id) => Promise.resolve(id === 'rnd_1' ? snapshot() : undefined) },
      clock,
      { toController: () => undefined },
    ),
    audit: auditService(),
  });

  it('GET /rounds/:id/monitor returns the view', async () => {
    const res = await request(app).get('/api/controller/rounds/rnd_1/monitor');
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({ promptsScored: 3, unlockedCount: 1, blockedCount: 1, agentErrors: 2 });
    expect(res.body.approvedPrompts).toHaveLength(3);
  });

  it('GET /rounds/:id/monitor is 404 for an unknown round', async () => {
    const res = await request(app).get('/api/controller/rounds/rnd_x/monitor');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /audit-logs pages through the log', async () => {
    const first = await request(app).get('/api/controller/audit-logs?limit=3');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(3);
    const next = await request(app).get(`/api/controller/audit-logs?limit=3&cursor=${first.body.nextCursor}`);
    expect(next.body).toMatchObject({ items: [{ id: 'aud_1' }], nextCursor: null });
  });

  it('GET /audit-logs refuses a bad limit with 422', async () => {
    const res = await request(app).get('/api/controller/audit-logs?limit=500');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
