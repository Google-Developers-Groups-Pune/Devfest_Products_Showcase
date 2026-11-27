import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFakeAgents } from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { firestoreWinnersStore, type WinnersRepos } from '../../src/data/winners-store.js';
import type {
  CandidateDoc,
  EventDoc,
  EventStatus,
  PlayerDoc,
  ResultDoc,
  RoundDoc,
  SessionDoc,
} from '../../src/data/types.js';
import {
  buildWinnersCsv,
  escapeCell,
  WINNERS_CSV_COLUMNS,
  WinnersExportService,
  type WinnerRow,
  type WinnersExportStore,
} from '../../src/services/winners-export.js';

const BOM = '\uFEFF';
const HEADER = WINNERS_CSV_COLUMNS.join(',');

function row(overrides: Partial<WinnerRow> = {}): WinnerRow {
  return {
    fullName: 'Neha Kulkarni',
    entranceId: 'DF-2026-0007',
    roundNumber: 1,
    confirmedAt: new Date('2026-12-05T10:15:00.000Z'),
    winningScore: 92,
    treasureTitle: 'The Golden Mango',
    treasureId: 'cnd_1',
    ...overrides,
  };
}

/** Parses the CSV (RFC 4180, after the BOM) into rows of cells. */
function cells(csv: string): string[][] {
  expect(csv.startsWith(BOM)).toBe(true);
  const rows: string[][] = [];
  let rowCells: string[] = [];
  let cell = '';
  let quoted = false;
  const text = csv.slice(1);
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      rowCells.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      rowCells.push(cell);
      rows.push(rowCells);
      rowCells = [];
      cell = '';
      i += 1;
    } else cell += ch;
  }
  return rows;
}

describe('escapeCell', () => {
  it.each(['=1+1', '+91 98765', '-5', '@SUM(A1)', '\tx', '\rx'])('escapes %j', (value) => {
    expect(escapeCell(value)).toBe(`'${value}`);
  });

  it.each(['Neha', 'DF-2026-0007', '', 'a=b', "O'Brien"])('leaves %j alone', (value) => {
    expect(escapeCell(value)).toBe(value);
  });
});

describe('buildWinnersCsv', () => {
  it('is header-only with no winners', () => {
    expect(buildWinnersCsv([])).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('writes one row per round, ordered by round number', () => {
    const csv = buildWinnersCsv([row({ roundNumber: 2, fullName: 'Aman Sharma' }), row()]);
    expect(cells(csv)).toEqual([
      [...WINNERS_CSV_COLUMNS],
      ['Neha Kulkarni', 'DF-2026-0007', '1', '2026-12-05T10:15:00.000Z', '92', 'The Golden Mango', 'cnd_1'],
      ['Aman Sharma', 'DF-2026-0007', '2', '2026-12-05T10:15:00.000Z', '92', 'The Golden Mango', 'cnd_1'],
    ]);
  });

  it('escapes formula injection in every text column', () => {
    const csv = buildWinnersCsv([
      row({ fullName: '=1+1', entranceId: '@cmd', treasureTitle: '+HYPERLINK("x")', treasureId: '-1' }),
    ]);
    expect(cells(csv)[1]).toEqual([
      "'=1+1",
      "'@cmd",
      '1',
      '2026-12-05T10:15:00.000Z',
      '92',
      '\'+HYPERLINK("x")',
      "'-1",
    ]);
  });

  it('quotes commas, quotes and new lines, and keeps non-English names', () => {
    const name = 'शर्मा, "Aman"\nJi';
    expect(cells(buildWinnersCsv([row({ fullName: name })]))[1]?.[0]).toBe(name);
  });
});

/** In-memory store that records exports. */
function memoryStore(status: EventStatus, rows: WinnerRow[]) {
  const exports: Date[] = [];
  const store: WinnersExportStore = {
    eventStatus: () => Promise.resolve(status),
    listConfirmedWinners: () => Promise.resolve(rows),
    markExported: (at) => {
      exports.push(at);
      return Promise.resolve();
    },
  };
  return { store, exports };
}

describe('WinnersExportService', () => {
  it('builds the CSV and marks it exported at server time', async () => {
    const clock = new FakeClock();
    const { store, exports } = memoryStore('OPEN', [row(), row({ roundNumber: 2 })]);
    const file = await new WinnersExportService(store, clock).export();
    expect(file.filename).toBe('prompt-heist-winners.csv');
    expect(file.rowCount).toBe(2);
    expect(cells(file.csv)).toHaveLength(3);
    expect(exports).toEqual([clock.now()]);
  });

  it('marks a header-only export as exported too', async () => {
    const { store, exports } = memoryStore('OPEN', []);
    const file = await new WinnersExportService(store, new FakeClock()).export();
    expect(file.csv).toBe(`${BOM}${HEADER}\r\n`);
    expect(exports).toHaveLength(1);
  });

  it('still exports while closing has failed (D44 does not block API 15)', async () => {
    const { store } = memoryStore('CLOSING_FAILED', [row()]);
    await expect(new WinnersExportService(store, new FakeClock()).export()).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each(['CLOSING', 'CLOSED'] as const)('refuses with 409 EVENT_CLOSED when %s, and marks nothing', async (status) => {
    const { store, exports } = memoryStore(status, [row()]);
    await expect(new WinnersExportService(store, new FakeClock()).export()).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_CLOSED',
    });
    expect(exports).toHaveLength(0);
  });
});

// ------------------------------------------------------------ Firestore store, on in-memory repositories

const ts = (iso: string) => ({ toDate: () => new Date(iso) }) as unknown as NonNullable<ResultDoc['confirmedAt']>;

interface SessionFixture {
  rounds: Record<string, { round: Partial<RoundDoc>; result?: Partial<ResultDoc> }>;
  players: Record<string, Partial<PlayerDoc>>;
  candidates: Record<string, Partial<CandidateDoc>>;
}

function memoryRepos(event: Partial<EventDoc> | undefined, sessions: Record<string, SessionFixture>) {
  const updates: Array<{ id: string; data: unknown }> = [];
  const repo = <T>(docs: Record<string, T>) => ({
    get: (id: string | number) => Promise.resolve(docs[String(id)]),
    list: () => Promise.resolve(Object.entries(docs).map(([id, data]) => ({ id, data }))),
  });
  const session = (ref: { sessionId: string }) => {
    const found = sessions[ref.sessionId];
    if (!found) throw new Error(`unknown session ${ref.sessionId}`);
    return found;
  };
  const repos = {
    events: {
      ...repo(event ? { evt_1: event as EventDoc } : {}),
      update: (id: string, data: unknown) => {
        updates.push({ id, data });
        return Promise.resolve();
      },
    },
    sessions: () => repo(Object.fromEntries(Object.keys(sessions).map((id) => [id, {} as SessionDoc]))),
    rounds: (ref: { sessionId: string }) =>
      repo(Object.fromEntries(Object.entries(session(ref).rounds).map(([id, r]) => [id, r.round as RoundDoc]))),
    result: (ref: { sessionId: string; roundId: string }) => ({
      get: () => Promise.resolve(session(ref).rounds[ref.roundId]?.result as ResultDoc | undefined),
    }),
    players: (ref: { sessionId: string }) => repo(session(ref).players as Record<string, PlayerDoc>),
    candidates: (ref: { sessionId: string }) => repo(session(ref).candidates as Record<string, CandidateDoc>),
  } as unknown as WinnersRepos;
  return { repos, updates };
}

const confirmed = (over: Partial<ResultDoc>): Partial<ResultDoc> => ({
  confirmation: 'CONFIRMED',
  winnerPlayerId: 'ply_1',
  bestScore: 92,
  roundNumber: 1,
  confirmedAt: ts('2026-12-05T10:15:00.000Z'),
  ...over,
});

describe('firestoreWinnersStore', () => {
  it('lists confirmed rounds only, with player and treasure details', async () => {
    const { repos } = memoryRepos({ status: 'OPEN' }, {
      ses_1: {
        rounds: {
          rnd_1: { round: { candidateId: 'cnd_1' }, result: confirmed({}) },
          rnd_2: { round: { candidateId: 'cnd_2' }, result: confirmed({ confirmation: 'DISCARDED' }) },
          rnd_3: { round: { candidateId: 'cnd_3' }, result: confirmed({ confirmation: 'PROVISIONAL' }) },
          rnd_4: { round: { candidateId: 'cnd_4' } },
        },
        players: { ply_1: { fullName: 'Neha Kulkarni', entranceId: 'DF-1' } },
        candidates: { cnd_1: { visible: { title: 'The Golden Mango' } } },
      },
      ses_2: {
        rounds: {
          rnd_9: {
            round: { candidateId: 'cnd_9' },
            result: confirmed({ winnerPlayerId: 'ply_7', roundNumber: 2, bestScore: 100 }),
          },
        },
        players: { ply_7: { fullName: 'Aman Sharma', entranceId: 'DF-7' } },
        candidates: { cnd_9: { visible: {} } },
      },
    });

    const rows = await firestoreWinnersStore(repos, 'evt_1').listConfirmedWinners();
    expect(rows.sort((a, b) => a.roundNumber - b.roundNumber)).toEqual([
      {
        fullName: 'Neha Kulkarni',
        entranceId: 'DF-1',
        roundNumber: 1,
        confirmedAt: new Date('2026-12-05T10:15:00.000Z'),
        winningScore: 92,
        treasureTitle: 'The Golden Mango',
        treasureId: 'cnd_1',
      },
      expect.objectContaining({ fullName: 'Aman Sharma', roundNumber: 2, winningScore: 100, treasureTitle: '' }),
    ]);
  });

  it('fails loudly if a confirmed result has no round number', async () => {
    const { repos } = memoryRepos({ status: 'OPEN' }, {
      ses_1: {
        rounds: { rnd_1: { round: { candidateId: 'cnd_1' }, result: confirmed({ roundNumber: null }) } },
        players: { ply_1: { fullName: 'N', entranceId: 'E' } },
        candidates: {},
      },
    });
    await expect(firestoreWinnersStore(repos, 'evt_1').listConfirmedWinners()).rejects.toThrow('round number');
  });

  it('reads the event status and records the export on the event', async () => {
    const { repos, updates } = memoryRepos({ status: 'CLOSING_FAILED' }, {});
    const store = firestoreWinnersStore(repos, 'evt_1');
    await expect(store.eventStatus()).resolves.toBe('CLOSING_FAILED');
    const at = new Date('2026-12-05T18:00:00.000Z');
    await store.markExported(at);
    expect(updates).toEqual([{ id: 'evt_1', data: { csvExportedAt: at, csvUpToDate: true } }]);
  });
});

describe('GET /api/controller/winners/export (API 15)', () => {
  function appWith(status: EventStatus, rows: WinnerRow[]) {
    const clock = new FakeClock();
    return createApp({
      clock,
      logger: pino({ level: 'silent' }),
      corsOrigins: [],
      agentHealth: new AgentHealthService(createFakeAgents(), clock),
      winners: new WinnersExportService(memoryStore(status, rows).store, clock),
    });
  }

  it('downloads the CSV as an attachment', async () => {
    const res = await request(appWith('OPEN', [row({ fullName: '=1+1' })])).get('/api/controller/winners/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="prompt-heist-winners.csv"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(cells(res.text)[1]?.[0]).toBe("'=1+1");
  });

  it('returns 409 EVENT_CLOSED in the error envelope', async () => {
    const res = await request(appWith('CLOSED', [])).get('/api/controller/winners/export');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'EVENT_CLOSED' });
  });
});
