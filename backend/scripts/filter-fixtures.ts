import { pino } from 'pino';
import { agentsConfig } from '../src/agents/config.js';
import { GeminiFilterAgent } from '../src/agents/filter-agent.js';
import { AiGateway } from '../src/agents/gateway.js';
import { createGenAiClient } from '../src/agents/genai-client.js';
import { loadEnv } from '../src/config/env.js';
import { FILTER_FIXTURES } from '../test/fixtures/filter-prompts.js';

/**
 * BE-15 QE check: runs the 30 fixture prompts through the real filter and prints a report.
 * Needs GCP_PROJECT_ID, VERTEX_LOCATION and MODEL_GUARD (BE-38).
 *
 *   npm run filter:fixtures
 */
const env = loadEnv();
if (!env.GCP_PROJECT_ID || !env.VERTEX_LOCATION || !env.MODEL_GUARD) {
  console.error('Set GCP_PROJECT_ID, VERTEX_LOCATION and MODEL_GUARD first (BE-38).');
  process.exit(1);
}

const gateway = new AiGateway({
  client: createGenAiClient({ project: env.GCP_PROJECT_ID, location: env.VERTEX_LOCATION }),
  config: agentsConfig(env),
  logger: pino({ level: 'warn' }),
});
const filter = new GeminiFilterAgent(gateway);

let wrong = 0;
let falseBlocks = 0;
for (const fixture of FILTER_FIXTURES) {
  const result = await filter.checkPrompt(fixture.text);
  const ok = result.decision === fixture.expected && !result.failedClosed;
  if (!ok) wrong += 1;
  if (fixture.category === 'NORMAL' && result.decision === 'BLOCK') falseBlocks += 1;
  const note = result.failedClosed ? ' (failed closed)' : '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${fixture.id.padEnd(7)} expected ${fixture.expected}, got ${result.decision}${note}`);
}

console.log(`\n${FILTER_FIXTURES.length - wrong}/${FILTER_FIXTURES.length} correct. False blocks on normal prompts: ${falseBlocks}.`);
if (falseBlocks > 0 || wrong > 0) process.exitCode = 1;
