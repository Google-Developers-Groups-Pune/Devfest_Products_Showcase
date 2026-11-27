import { pino } from 'pino';
import { agentsConfig } from '../src/agents/config.js';
import { AiGateway } from '../src/agents/gateway.js';
import { createGenAiClient } from '../src/agents/genai-client.js';
import { GeminiTreasureAgent } from '../src/agents/treasure-agent.js';
import { loadEnv } from '../src/config/env.js';

/**
 * BE-16 QE check: generates 10 treasures with the real model, passing earlier titles as
 * "used today", and prints them for review: schema, safety, variety and quality.
 * Needs GCP_PROJECT_ID, VERTEX_LOCATION and MODEL_TEXT (BE-38).
 *
 *   npm run treasure:samples
 */
const env = loadEnv();
if (!env.GCP_PROJECT_ID || !env.VERTEX_LOCATION || !env.MODEL_TEXT) {
  console.error('Set GCP_PROJECT_ID, VERTEX_LOCATION and MODEL_TEXT first (BE-38).');
  process.exit(1);
}

const gateway = new AiGateway({
  client: createGenAiClient({ project: env.GCP_PROJECT_ID, location: env.VERTEX_LOCATION }),
  config: agentsConfig(env),
  logger: pino({ level: 'warn' }),
});
const agent = new GeminiTreasureAgent(gateway);

const usedTitles: string[] = [];
let failures = 0;
for (let i = 1; i <= 10; i += 1) {
  try {
    const draft = await agent.generate({ usedTitles: [...usedTitles], roundDurationSeconds: 120 });
    usedTitles.push(draft.title);
    console.log(`\n#${i} ${draft.title}`);
    console.log(`  Backstory: ${draft.visibleBackstory}`);
    console.log(`  Objective: ${draft.visibleLockObjective}`);
    console.log(`  Image:     ${draft.visualAssetPrompt}`);
    draft.hiddenRubric.scoringCriteria.forEach((criterion, n) => console.log(`  Hidden ${n + 1}:  ${criterion}`));
  } catch (err) {
    failures += 1;
    console.log(`\n#${i} FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\n${10 - failures}/10 generated.`);
if (failures > 0) process.exitCode = 1;
