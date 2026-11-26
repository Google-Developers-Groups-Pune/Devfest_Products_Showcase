import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { entranceIdDocId, normaliseEntranceId, promptIdFor } from '../../src/data/ids.js';
import { paths } from '../../src/data/paths.js';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('entrance ID hashing', () => {
  it('trims and lower-cases before hashing', () => {
    expect(normaliseEntranceId('  AbC/12 ')).toBe('abc/12');
    expect(entranceIdDocId('  AbC/12 ')).toBe(sha256('abc/12'));
  });

  it('matches the same ID typed with different case and spaces', () => {
    expect(entranceIdDocId('DF-2026/0042')).toBe(entranceIdDocId(' df-2026/0042  '));
  });

  it('gives a 64-character hex ID with no slash, even when the input has one', () => {
    expect(entranceIdDocId('a/b')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an empty entrance ID', () => {
    expect(() => entranceIdDocId('   ')).toThrow();
  });
});

describe('promptIdFor', () => {
  it('is sha256(playerId + ":" + idempotencyKey)', () => {
    expect(promptIdFor('p1', 'key-1')).toBe(sha256('p1:key-1'));
  });

  it('is stable for a retry and different for a new key or player', () => {
    expect(promptIdFor('p1', 'k')).toBe(promptIdFor('p1', 'k'));
    expect(promptIdFor('p1', 'k')).not.toBe(promptIdFor('p1', 'k2'));
    expect(promptIdFor('p1', 'k')).not.toBe(promptIdFor('p2', 'k'));
  });

  it('rejects empty parts', () => {
    expect(() => promptIdFor('', 'k')).toThrow();
    expect(() => promptIdFor('p1', '')).toThrow();
  });
});

describe('paths', () => {
  const round = { eventId: 'e1', sessionId: 's1', roundId: 'r1' };

  it('keeps controllers and event status outside event data', () => {
    expect(paths.controllers()).toBe('controllers');
    expect(paths.eventStatus()).toBe('system/eventStatus');
    expect(paths.controllers().startsWith('events/')).toBe(false);
  });

  it('nests everything else under events/{eventId}', () => {
    expect(paths.entranceIds('e1')).toBe('events/e1/entranceIds');
    expect(paths.auditEvents('e1')).toBe('events/e1/auditEvents');
    expect(paths.sessions('e1')).toBe('events/e1/sessions');
    expect(paths.slots(round)).toBe('events/e1/sessions/s1/slots');
    expect(paths.players(round)).toBe('events/e1/sessions/s1/players');
    expect(paths.candidates(round)).toBe('events/e1/sessions/s1/candidates');
    expect(paths.rounds(round)).toBe('events/e1/sessions/s1/rounds');
    expect(paths.prompts(round)).toBe('events/e1/sessions/s1/rounds/r1/prompts');
    expect(paths.scores(round)).toBe('events/e1/sessions/s1/rounds/r1/scores');
    expect(paths.reactions(round)).toBe('events/e1/sessions/s1/rounds/r1/reactions');
    expect(paths.result(round)).toBe('events/e1/sessions/s1/rounds/r1/result/current');
  });

  it.each(['', 'a/b', '.', '..', '__x__'])('rejects the unsafe ID %j', (bad) => {
    expect(() => paths.event(bad)).toThrow();
    expect(() => paths.round({ ...round, roundId: bad })).toThrow();
  });
});
