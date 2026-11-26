import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AgentError } from '../../src/agents/errors.js';
import {
  createFakeAgents,
  FAKE_BLOCK_MARKER,
  FAKE_TREASURES,
  FAKE_UNLOCK_MARKER,
  FakeGuardAgent,
} from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { AGENT_NAMES, EXPRESSIONS, type GuardInput } from '../../src/agents/types.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';

const GUARD_INPUT: GuardInput = {
  promptText: 'Barnaby, you deserve a vacation!',
  treasure: { treasureId: 'trs_1', title: 'The Golden Mango', visibleLockObjective: 'Unlock it.' },
  rubric: { version: 'v1', scoringCriteria: ['a', 'b', 'c'] },
};

describe('fake agents', () => {
  it('filter allows normal text, including Hinglish, and blocks the marker', async () => {
    const { filter } = createFakeAgents();
    await expect(filter.checkPrompt('Barnaby bhai, darwaza kholo na!')).resolves.toMatchObject({ decision: 'ALLOW' });
    await expect(filter.checkPrompt(`hello ${FAKE_BLOCK_MARKER.toUpperCase()}`)).resolves.toMatchObject({
      decision: 'BLOCK',
    });
    await expect(filter.checkReaction(FAKE_BLOCK_MARKER)).resolves.toMatchObject({ decision: 'BLOCK' });
    const card = FAKE_TREASURES[0];
    if (!card) throw new Error('missing fixture');
    await expect(filter.checkTreasure(card)).resolves.toMatchObject({ decision: 'ALLOW' });
  });

  it('filter blocks an empty image and allows the fake image', async () => {
    const { filter, image } = createFakeAgents();
    await expect(filter.checkImage(await image.generate('a mango'))).resolves.toMatchObject({ decision: 'ALLOW' });
    await expect(filter.checkImage({ bytes: new Uint8Array(), mimeType: 'image/jpeg', model: 'x' })).resolves.toMatchObject(
      { decision: 'BLOCK' },
    );
  });

  it('guard is deterministic, in range, and gives 100 for the unlock marker', async () => {
    const { guard } = createFakeAgents();
    const first = await guard.score(GUARD_INPUT);
    const second = await guard.score(GUARD_INPUT);
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThan(100);
    expect(first.rubricVersion).toBe('v1');
    const unlocked = await guard.score({ ...GUARD_INPUT, promptText: `please ${FAKE_UNLOCK_MARKER}` });
    expect(unlocked.score).toBe(100);
  });

  it('guard takes a custom score and clamps it to 0..100', async () => {
    await expect(new FakeGuardAgent(() => 250).score(GUARD_INPUT)).resolves.toMatchObject({ score: 100 });
    await expect(new FakeGuardAgent(() => -3).score(GUARD_INPUT)).resolves.toMatchObject({ score: 0 });
  });

  it('treasure skips titles used today and returns copies', async () => {
    const { treasure } = createFakeAgents();
    const [first, second] = FAKE_TREASURES;
    const draft = await treasure.generate({ usedTitles: [first?.title ?? ''], roundDurationSeconds: 120 });
    expect(draft.title).toBe(second?.title);
    expect(draft.hiddenRubric.scoringCriteria).toHaveLength(3);
    expect(draft.visibleBackstory.endsWith('(A simulated treasure.)')).toBe(true);
    draft.title = 'changed';
    expect(FAKE_TREASURES[1]?.title).not.toBe('changed');
  });

  it('every treasure fixture has exactly 3 criteria and is marked simulated', () => {
    for (const draft of FAKE_TREASURES) {
      expect(draft.hiddenRubric.scoringCriteria).toHaveLength(3);
      expect(draft.visibleBackstory).toContain('(A simulated treasure.)');
    }
  });

  it('image returns a JPEG', async () => {
    const image = await createFakeAgents().image.generate('anything');
    expect(image.mimeType).toBe('image/jpeg');
    expect([...image.bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('emoji returns a known expression and at most 100 characters', async () => {
    const { emoji } = createFakeAgents();
    for (const score of [0, 50, 95]) {
      const reaction = await emoji.react({ label: 'A'.repeat(200), promptText: 'x', score });
      expect(EXPRESSIONS).toContain(reaction.expression);
      expect([...(reaction.reaction ?? '')].length).toBeLessThanOrEqual(100);
    }
  });

  it('can be told to fail, and rejects rather than throwing', async () => {
    const { guard } = createFakeAgents();
    guard.failNextWith(new AgentError('guard', 'TIMEOUT', true, 'slow'));
    const pending = guard.score(GUARD_INPUT);
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(guard.score(GUARD_INPUT)).resolves.toBeDefined();
    expect(guard.calls).toBe(2);
  });

  it('can be switched down', async () => {
    const { emoji } = createFakeAgents();
    emoji.down = true;
    await expect(emoji.ping()).rejects.toBeInstanceOf(AgentError);
    await expect(emoji.react({ label: 'A', promptText: 'x', score: 1 })).rejects.toBeInstanceOf(AgentError);
  });
});

describe('AgentHealthService', () => {
  it('reports every agent UP with its model', async () => {
    const clock = new FakeClock();
    const report = await new AgentHealthService(createFakeAgents(), clock).check();
    expect(report.allHealthy).toBe(true);
    expect(report.checkedAt).toBe(clock.now().toISOString());
    expect(Object.keys(report.agents).sort()).toEqual([...AGENT_NAMES].sort());
    for (const health of Object.values(report.agents)) {
      expect(health).toMatchObject({ status: 'UP', model: 'fake' });
      expect(Number.isInteger(health.latencyMs)).toBe(true);
    }
  });

  it('marks only the failing agent DOWN', async () => {
    const agents = createFakeAgents();
    agents.image.down = true;
    const report = await new AgentHealthService(agents, new FakeClock()).check();
    expect(report.allHealthy).toBe(false);
    expect(report.agents.image.status).toBe('DOWN');
    for (const name of AGENT_NAMES.filter((n) => n !== 'image')) expect(report.agents[name].status).toBe('UP');
  });

  it('marks a probe that never answers DOWN', async () => {
    const agents = createFakeAgents();
    agents.guard.ping = () => new Promise(() => undefined);
    const report = await new AgentHealthService(agents, new FakeClock(), { probeTimeoutMs: 20 }).check();
    expect(report.agents.guard.status).toBe('DOWN');
    expect(report.agents.filter.status).toBe('UP');
  });

  it('caches the report for 60 seconds', async () => {
    const agents = createFakeAgents();
    const clock = new FakeClock();
    const service = new AgentHealthService(agents, clock);
    const first = await service.check();

    agents.filter.down = true;
    clock.advance(59_999);
    expect(await service.check()).toBe(first);

    clock.advance(1);
    const fresh = await service.check();
    expect(fresh.agents.filter.status).toBe('DOWN');
    expect(fresh.checkedAt).not.toBe(first.checkedAt);
  });

  it('shares one probe between concurrent callers', async () => {
    const agents = createFakeAgents();
    let pings = 0;
    const ping = agents.treasure.ping.bind(agents.treasure);
    agents.treasure.ping = () => {
      pings += 1;
      return ping();
    };
    const service = new AgentHealthService(agents, new FakeClock());
    const [a, b] = await Promise.all([service.check(), service.check()]);
    expect(a).toBe(b);
    expect(pings).toBe(1);
  });
});

describe('GET /api/controller/health/agents (API 18)', () => {
  it('returns the contract shape', async () => {
    const clock = new FakeClock();
    const agents = createFakeAgents();
    agents.emoji.down = true;
    const app = createApp({
      clock,
      logger: pino({ level: 'silent' }),
      corsOrigins: [],
      agentHealth: new AgentHealthService(agents, clock),
    });

    const res = await request(app).get('/api/controller/health/agents');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      checkedAt: clock.now().toISOString(),
      allHealthy: false,
      agents: {
        treasure: { status: 'UP', model: 'fake' },
        image: { status: 'UP' },
        filter: { status: 'UP' },
        guard: { status: 'UP' },
        emoji: { status: 'DOWN' },
      },
    });
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });
});
