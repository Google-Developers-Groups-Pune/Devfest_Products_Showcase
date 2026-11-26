import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CHANNEL_EVENTS } from '../../src/realtime/events.js';
import { CONNECT_ERROR_CODES } from '../../src/realtime/gateway.js';

/** Checks the typed event maps against the shared contract, so the two cannot drift apart. */

interface AsyncApi {
  channels: Record<string, { address: string; messages: Record<string, { $ref: string }>; 'x-connect-error-codes'?: string[] }>;
  components: { messages: Record<string, { name: string }> };
}

const file = fileURLToPath(new URL('../../../contract/openapi/asyncapi.yaml', import.meta.url));
const spec = parse(readFileSync(file, 'utf8')) as AsyncApi;

function eventNames(channel: string): string[] {
  const messages = spec.channels[channel]?.messages ?? {};
  return Object.values(messages)
    .map(({ $ref }) => spec.components.messages[$ref.split('/').pop() ?? '']?.name ?? `unresolved ${$ref}`)
    .sort();
}

describe('socket events match asyncapi.yaml', () => {
  it('has the same channels', () => {
    expect(Object.keys(CHANNEL_EVENTS).sort()).toEqual(Object.keys(spec.channels).sort());
  });

  it.each(Object.keys(CHANNEL_EVENTS))('sends the same events on %s', (channel) => {
    expect([...CHANNEL_EVENTS[channel as keyof typeof CHANNEL_EVENTS]].sort()).toEqual(eventNames(channel));
  });

  it.each(['controller', 'player'] as const)('refuses the %s handshake with the documented codes', (channel) => {
    const namespace = spec.channels[channel]?.address as keyof typeof CONNECT_ERROR_CODES;
    expect([...CONNECT_ERROR_CODES[namespace]].sort()).toEqual([...(spec.channels[channel]?.['x-connect-error-codes'] ?? [])].sort());
  });
});
