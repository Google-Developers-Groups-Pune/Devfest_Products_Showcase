import { Writable } from 'node:stream';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFakeAgents } from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import {
  EventCloseService,
  noEventFiles,
  type EventDataStore,
  type EventFileStore,
  type EventStatusRecord,
} from '../../src/services/event-close.js';
import { PROD_RESET_FLAG, resetEventStatus } from '../../src/services/event-reset.js';

/** In-memory event day: documents and files that deletion removes. */
function world(options: { csvUpToDate?: boolean; eventId?: string | undefined; docs?: number; files?: number } = {}) {
  const state = {
    status: undefined as EventStatusRecord | undefined,
    docs: options.docs ?? 12,
    files: options.files ?? 3,
    failDataDelete: false,
    failFileDelete: false,
    leaveDocs: 0,
    roundsStopped: 0,
    disconnects: 0,
    emitted: [] as Array<{ event: string; payload: unknown }>,
    logs: [] as Array<Record<string, unknown>>,
  };
  const eventId = 'eventId' in options ? options.eventId : 'evt_1';
  const data: EventDataStore = {
    currentEventId: () => Promise.resolve(eventId),
    csvUpToDate: () => Promise.resolve(options.csvUpToDate ?? true),
    deleteAll: () => {
      if (state.failDataDelete) return Promise.reject(new Error('permission denied'));
      state.docs = state.leaveDocs;
      return Promise.resolve();
    },
    countRemaining: () => Promise.resolve(state.docs),
  };
  const files: EventFileStore = {
    deleteAll: () => {
      if (state.failFileDelete) return Promise.reject(new Error('storage permission denied'));
      state.files = 0;
      return Promise.resolve();
    },
    countRemaining: () => Promise.resolve(state.files),
  };
  const logStream = new Writable({
    write(chunk, _enc, done) {
      state.logs.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  const clock = new FakeClock('2026-12-05T18:00:00.000Z');
  const service = new EventCloseService({
    statusStore: {
      get: () => Promise.resolve(state.status),
      set: (record) => {
        state.status = record;
        return Promise.resolve();
      },
    },
    data,
    files,
    rounds: {
      stopLiveRound: () => {
        state.roundsStopped += 1;
        return Promise.resolve();
      },
    },
    realtime: {
      toController: (event, payload) => {
        state.emitted.push({ event, payload });
      },
      disconnectPlayersAndDisplay: () => {
        state.disconnects += 1;
      },
    },
    clock,
    logger: pino({ level: 'info' }, logStream),
  });
  return { service, state, clock };
}

describe('EventCloseService.close', () => {
  it('needs the exact confirmation phrase', async () => {
    const { service, state } = world();
    for (const wrong of [undefined, '', 'close event', 'CLOSE EVENT ', 42]) {
      await expect(service.close(wrong)).rejects.toMatchObject({ status: 422, code: 'CONFIRMATION_REQUIRED' });
    }
    expect(state.status).toBeUndefined();
  });

  it('is refused until the winners CSV is up to date, and changes nothing', async () => {
    const { service, state } = world({ csvUpToDate: false });
    await expect(service.close('CLOSE EVENT')).rejects.toMatchObject({ status: 409, code: 'CSV_NOT_EXPORTED' });
    expect(state.status).toBeUndefined();
    expect(state.roundsStopped).toBe(0);
  });

  it('stops the round, disconnects clients, deletes, verifies, then sets CLOSED', async () => {
    const { service, state, clock } = world();
    const started = await service.close('CLOSE EVENT');
    expect(started.status).toBe('CLOSING');
    await started.done;

    expect(state.roundsStopped).toBe(1);
    expect(state.disconnects).toBe(1);
    expect(state.docs).toBe(0);
    expect(state.files).toBe(0);
    expect(state.status).toEqual({ status: 'CLOSED', closedAt: clock.now(), failure: null });
    expect(state.emitted).toEqual([
      { event: 'event:status', payload: { status: 'CLOSING', failure: null } },
      { event: 'event:status', payload: { status: 'CLOSED', failure: null } },
    ]);
    expect(state.logs.at(-1)).toMatchObject({ outcome: 'CLOSED', documentsRemaining: 0, objectsRemaining: 0 });
  });

  it('sets CLOSING_FAILED with the stage when Storage deletion fails, then retries', async () => {
    const { service, state } = world();
    state.failFileDelete = true;
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status).toEqual({
      status: 'CLOSING_FAILED',
      closedAt: null,
      failure: { stage: 'STORAGE', code: 'DELETE_FAILED', remaining: 3 },
    });
    expect(state.emitted.at(-1)).toEqual({
      event: 'event:status',
      payload: { status: 'CLOSING_FAILED', failure: { stage: 'STORAGE', code: 'DELETE_FAILED', remaining: 3 } },
    });

    state.failFileDelete = false;
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status?.status).toBe('CLOSED');
  });

  it('fails verification if documents are left after deletion', async () => {
    const { service, state } = world();
    state.leaveDocs = 2;
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status?.failure).toEqual({ stage: 'FIRESTORE', code: 'NOT_EMPTY', remaining: 2 });
  });

  it('reports a Firestore failure, and retries even though the CSV flag is gone', async () => {
    const { service, state } = world();
    state.failDataDelete = true;
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status?.failure).toMatchObject({ stage: 'FIRESTORE', code: 'DELETE_FAILED', remaining: 15 });

    // Partial deletion can remove the event document with its csvUpToDate flag.
    const retry = world({ csvUpToDate: false });
    retry.state.status = state.status;
    await (await retry.service.close('CLOSE EVENT')).done;
    expect(retry.state.status?.status).toBe('CLOSED');
  });

  it('retries a close that was cut off by a restart (CLOSING with nothing running)', async () => {
    const { service, state } = world({ csvUpToDate: false });
    state.status = { status: 'CLOSING', closedAt: null, failure: null };
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status.status).toBe('CLOSED');
  });

  it('refuses once CLOSED', async () => {
    const { service } = world();
    await (await service.close('CLOSE EVENT')).done;
    await expect(service.close('CLOSE EVENT')).rejects.toMatchObject({ status: 409, code: 'EVENT_CLOSED' });
  });

  it('shares one run when called twice while closing', async () => {
    const { service, state } = world();
    const first = await service.close('CLOSE EVENT');
    const second = await service.close('CLOSE EVENT');
    expect(second.done).toBe(first.done);
    await first.done;
    expect(state.roundsStopped).toBe(1);
  });

  it('closes with no event day: nothing to delete', async () => {
    const { service, state } = world({ eventId: undefined });
    await (await service.close('CLOSE EVENT')).done;
    expect(state.status?.status).toBe('CLOSED');
    expect(state.docs).toBe(12);
  });

  it('writes no personal data to the close logs', async () => {
    const { service, state } = world();
    state.failFileDelete = true;
    await (await service.close('CLOSE EVENT')).done;
    const raw = JSON.stringify(state.logs);
    expect(raw).toContain('CLOSING_FAILED');
    expect(raw).not.toMatch(/fullName|entranceId/);
  });
});

describe('EventCloseService.status and assertWritable', () => {
  it('is OPEN before any close', async () => {
    const { service } = world();
    await expect(service.status()).resolves.toEqual({ status: 'OPEN', closedAt: null, failure: null });
    await expect(service.assertWritable()).resolves.toBeUndefined();
  });

  it('blocks game actions with EVENT_CLOSING_FAILED while closing has failed (D44)', async () => {
    const { service, state } = world();
    state.failFileDelete = true;
    await (await service.close('CLOSE EVENT')).done;
    await expect(service.assertWritable()).rejects.toMatchObject({ status: 409, code: 'EVENT_CLOSING_FAILED' });
  });

  it('blocks game actions with EVENT_CLOSED after closing', async () => {
    const { service } = world();
    await (await service.close('CLOSE EVENT')).done;
    await expect(service.assertWritable()).rejects.toMatchObject({ status: 409, code: 'EVENT_CLOSED' });
    await expect(service.status()).resolves.toEqual({
      status: 'CLOSED',
      closedAt: '2026-12-05T18:00:00.000Z',
      failure: null,
    });
  });
});

describe('noEventFiles', () => {
  it('has nothing to delete or count', async () => {
    await expect(noEventFiles.deleteAll('evt_1')).resolves.toBeUndefined();
    await expect(noEventFiles.countRemaining('evt_1')).resolves.toBe(0);
  });
});

describe('resetEventStatus', () => {
  it('clears the status outside production', async () => {
    let cleared = 0;
    const deleteStatus = () => {
      cleared += 1;
      return Promise.resolve();
    };
    await resetEventStatus({ nodeEnv: 'development', argv: [], deleteStatus });
    expect(cleared).toBe(1);
  });

  it('needs the flag in production', async () => {
    let cleared = 0;
    const deleteStatus = () => {
      cleared += 1;
      return Promise.resolve();
    };
    await expect(resetEventStatus({ nodeEnv: 'production', argv: [], deleteStatus })).rejects.toThrow(PROD_RESET_FLAG);
    expect(cleared).toBe(0);
    await resetEventStatus({ nodeEnv: 'production', argv: [PROD_RESET_FLAG], deleteStatus });
    expect(cleared).toBe(1);
  });
});

describe('APIs 16 and 17', () => {
  function appFor(w: ReturnType<typeof world>) {
    return createApp({
      clock: w.clock,
      logger: pino({ level: 'silent' }),
      corsOrigins: [],
      agentHealth: new AgentHealthService(createFakeAgents(), w.clock),
      events: w.service,
    });
  }

  it('POST /event/close returns 202 CLOSING, then GET /event/status shows CLOSED', async () => {
    const w = world();
    const app = appFor(w);
    const res = await request(app).post('/api/controller/event/close').send({ confirmation: 'CLOSE EVENT' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'CLOSING' });

    await expect.poll(() => w.state.status?.status).toBe('CLOSED');
    const status = await request(app).get('/api/controller/event/status');
    expect(status.body).toEqual({ status: 'CLOSED', closedAt: '2026-12-05T18:00:00.000Z', failure: null });
  });

  it('POST /event/close without the phrase is 422', async () => {
    const res = await request(appFor(world())).post('/api/controller/event/close').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('POST /event/close before the CSV export is 409', async () => {
    const res = await request(appFor(world({ csvUpToDate: false })))
      .post('/api/controller/event/close')
      .send({ confirmation: 'CLOSE EVENT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CSV_NOT_EXPORTED');
  });
});
