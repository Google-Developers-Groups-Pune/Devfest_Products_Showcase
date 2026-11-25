import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/core/logger.js';
import { REDACTED, isSensitiveKey, redact } from '../../src/core/redact.js';
import { runWithContext } from '../../src/core/request-context.js';

/** Captures each JSON line the logger writes. */
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { logger: createLogger('debug', stream), lines };
}

const SECRETS = {
  fullName: 'Neha Kulkarni',
  entranceId: 'DF-2026-0007',
  password: 'hunter2',
  rubric: { version: 'v1', scoringCriteria: ['Says the magic word Flamingo'] },
  text: 'Barnaby, open the vault or the shrimp gets it',
  token: 'tok_plain',
  controllerToken: 'tok_controller',
  joinToken: 'tok_join',
  playerToken: 'tok_player',
  authorization: 'Bearer tok_header',
};

describe('isSensitiveKey', () => {
  it.each(Object.keys(SECRETS))('flags %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it('ignores case', () => {
    expect(isSensitiveKey('FullName')).toBe(true);
    expect(isSensitiveKey('ENTRANCEID')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
  });

  it.each(['label', 'playerId', 'sessionId', 'score', 'slotNumber', 'correlationId', 'tokenType'])(
    'leaves %s alone',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe('redact', () => {
  it('masks every listed field', () => {
    const out = redact(SECRETS) as Record<string, unknown>;
    for (const key of Object.keys(SECRETS)) expect(out[key]).toBe(REDACTED);
  });

  it('masks nested objects and arrays', () => {
    const out = redact({
      player: { playerId: 'ply_1', label: 'Neha', entranceId: 'DF-1' },
      players: [{ fullName: 'A' }, { fullName: 'B' }],
    });
    expect(out).toEqual({
      player: { playerId: 'ply_1', label: 'Neha', entranceId: REDACTED },
      players: [{ fullName: REDACTED }, { fullName: REDACTED }],
    });
  });

  it('does not change the input', () => {
    const input = { fullName: 'Neha' };
    redact(input);
    expect(input.fullName).toBe('Neha');
  });

  it('keeps an error readable and masks its own fields', () => {
    const err = Object.assign(new Error('Join failed'), { entranceId: 'DF-1' });
    const out = redact({ err }) as { err: Record<string, unknown> };
    expect(out.err.type).toBe('Error');
    expect(out.err.message).toBe('Join failed');
    expect(out.err.stack).toContain('Join failed');
    expect(out.err.entranceId).toBe(REDACTED);
  });

  it('masks fields on an error cause', () => {
    const cause = Object.assign(new Error('Inner'), { fullName: 'Neha' });
    const out = redact(new Error('Outer', { cause })) as { cause: Record<string, unknown> };
    expect(out.cause.message).toBe('Inner');
    expect(out.cause.fullName).toBe(REDACTED);
  });

  it('survives circular references', () => {
    const a: Record<string, unknown> = { fullName: 'Neha' };
    a.self = a;
    expect(redact(a)).toEqual({ fullName: REDACTED, self: '[Circular]' });
  });

  it('keeps repeated (non-circular) references', () => {
    const shared = { label: 'Neha' };
    expect(redact({ a: shared, b: shared })).toEqual({ a: shared, b: shared });
  });

  it('passes primitives and dates through', () => {
    const date = new Date('2026-11-26T00:00:00.000Z');
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact({ at: date })).toEqual({ at: date });
  });
});

describe('createLogger', () => {
  it('writes no listed value to the log line', () => {
    const { logger, lines } = captureLogger();
    logger.info({ ...SECRETS, playerId: 'ply_1' }, 'Player joined');

    const raw = JSON.stringify(lines[0]);
    for (const value of ['Neha Kulkarni', 'DF-2026-0007', 'hunter2', 'Flamingo', 'shrimp', 'tok_']) {
      expect(raw).not.toContain(value);
    }
    expect(lines[0]).toMatchObject({ playerId: 'ply_1', message: 'Player joined', severity: 'INFO' });
  });

  it('masks fields on an error passed as err', () => {
    const { logger, lines } = captureLogger();
    const err = Object.assign(new Error('Rejoin refused'), { entranceId: 'DF-2026-0007' });
    logger.error({ err }, 'Rejoin failed');

    expect(JSON.stringify(lines[0])).not.toContain('DF-2026-0007');
    expect(lines[0]?.err).toMatchObject({ type: 'Error', message: 'Rejoin refused' });
  });

  it('masks fields on a child logger', () => {
    const { logger, lines } = captureLogger();
    logger.child({ joinToken: 'tok_join' }).info('child line');
    expect(JSON.stringify(lines[0])).not.toContain('tok_join');
  });

  it('masks fields on a grandchild and keeps the parent bindings', () => {
    const { logger, lines } = captureLogger();
    logger
      .child({ sessionId: 'ses_01' })
      .child({ player: { playerId: 'ply_1', entranceId: 'DF-2026-0007' } })
      .info('grandchild line');
    expect(JSON.stringify(lines[0])).not.toContain('DF-2026-0007');
    expect(lines[0]).toMatchObject({ sessionId: 'ses_01', player: { playerId: 'ply_1' } });
  });

  it('still adds the correlationId', () => {
    const { logger, lines } = captureLogger();
    runWithContext({ correlationId: 'corr-12345' }, () => logger.info('with context'));
    expect(lines[0]?.correlationId).toBe('corr-12345');
  });
});
