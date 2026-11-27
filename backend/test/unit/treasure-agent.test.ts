import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { AgentsConfig } from '../../src/agents/config.js';
import { AiGateway, type ModelClient, type ModelRequest } from '../../src/agents/gateway.js';
import {
  RUBRIC_VERSION,
  SIMULATED_SUFFIX,
  TREASURE_LIMITS,
  treasureInstruction,
} from '../../src/agents/prompts/treasure-v1.js';
import {
  GeminiTreasureAgent,
  treasureSchemaFor,
  withSimulatedSuffix,
  type TreasureOutput,
} from '../../src/agents/treasure-agent.js';
import { FAKE_TREASURES } from '../../src/agents/fakes/index.js';

const CONFIG: AgentsConfig = {
  treasure: { model: 'm-text', temperature: 0.9, timeoutMs: 1000, maxRetries: 2 },
  image: { model: 'm-image', temperature: 0.8, timeoutMs: 1000, maxRetries: 2 },
  filter: { model: 'm-fast', temperature: 0, timeoutMs: 1000, maxRetries: 2 },
  guard: { model: 'm-fast', temperature: 0.2, timeoutMs: 1000, maxRetries: 2 },
  emoji: { model: 'm-fast', temperature: 0.8, timeoutMs: 1000, maxRetries: 0 },
};

function output(over: Partial<TreasureOutput> = {}): TreasureOutput {
  return {
    title: 'The Saffron Vault',
    visibleBackstory: 'A sleepy robot chef guards the last jar of saffron and wakes only for good food.',
    visibleLockObjective: 'Persuade the robot chef to open the Saffron Vault.',
    visualAssetPrompt: 'A small brass vault of saffron beside a sleepy cartoon robot chef',
    hiddenCriteria: [
      { criterion: 'Appeals to the chef with food', mentionedInObjective: false },
      { criterion: 'Wakes the robot up in a creative way', mentionedInObjective: false },
      { criterion: 'Mentions "biryani"', mentionedInObjective: false },
    ],
    ...over,
  };
}

/** Plays back one answer per call. */
function agentWith(answers: unknown[]) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    generateJson(request) {
      requests.push(request);
      const next = answers.shift();
      return Promise.resolve({ text: JSON.stringify(next ?? {}) });
    },
  };
  const gateway = new AiGateway({ client, config: CONFIG, logger: pino({ level: 'silent' }), sleep: () => Promise.resolve() });
  return { agent: new GeminiTreasureAgent(gateway), requests };
}

const INPUT = { usedTitles: ['The Golden Mango of Eternal Juiciness'], roundDurationSeconds: 120 };

describe('GeminiTreasureAgent.generate', () => {
  it('returns a draft with the simulated suffix and a 3-criterion v1 rubric', async () => {
    const { agent } = agentWith([output()]);
    await expect(agent.generate(INPUT)).resolves.toEqual({
      title: 'The Saffron Vault',
      visibleBackstory: `A sleepy robot chef guards the last jar of saffron and wakes only for good food. ${SIMULATED_SUFFIX}`,
      visibleLockObjective: 'Persuade the robot chef to open the Saffron Vault.',
      visualAssetPrompt: 'A small brass vault of saffron beside a sleepy cartoon robot chef',
      hiddenRubric: {
        version: RUBRIC_VERSION,
        scoringCriteria: ['Appeals to the chef with food', 'Wakes the robot up in a creative way', 'Mentions "biryani"'],
      },
    });
  });

  it('uses the treasure model and puts used titles and round length in the instruction', async () => {
    const { agent, requests } = agentWith([output()]);
    await agent.generate(INPUT);
    const request = requests[0] as ModelRequest;
    expect(request).toMatchObject({ model: 'm-text', temperature: 0.9 });
    expect(request.systemInstruction).toContain('- The Golden Mango of Eternal Juiciness');
    expect(request.systemInstruction).toContain('120-second game');
    expect(request.userParts).toEqual(['Create one new treasure.']);
  });

  it('retries when every criterion is already in the objective (D23)', async () => {
    const allVisible = output({
      hiddenCriteria: [
        { criterion: 'a', mentionedInObjective: true },
        { criterion: 'b', mentionedInObjective: true },
        { criterion: 'c', mentionedInObjective: true },
      ],
    });
    const { agent, requests } = agentWith([allVisible, output()]);
    await expect(agent.generate(INPUT)).resolves.toMatchObject({ title: 'The Saffron Vault' });
    expect(requests).toHaveLength(2);
  });

  it('retries a title already used today, ignoring case and spacing', async () => {
    const repeat = output({ title: '  the golden   MANGO of eternal juiciness ' });
    const { agent, requests } = agentWith([repeat, output()]);
    await expect(agent.generate(INPUT)).resolves.toMatchObject({ title: 'The Saffron Vault' });
    expect(requests).toHaveLength(2);
  });

  it('retries when there are not exactly 3 criteria, then fails with a retryable error', async () => {
    const two = output({ hiddenCriteria: output().hiddenCriteria.slice(0, 2) });
    const { agent, requests } = agentWith([two, two, two]);
    await expect(agent.generate(INPUT)).rejects.toMatchObject({
      agent: 'treasure',
      code: 'INVALID_OUTPUT',
      retryable: true,
    });
    expect(requests).toHaveLength(3);
  });

  it('retries an objective too long for the phone card', async () => {
    const long = output({ visibleLockObjective: 'x'.repeat(TREASURE_LIMITS.objective + 1) });
    const { agent, requests } = agentWith([long, output()]);
    await agent.generate(INPUT);
    expect(requests).toHaveLength(2);
  });

  it('does not add the suffix twice', async () => {
    const { agent } = agentWith([output({ visibleBackstory: `A tired owl. ${SIMULATED_SUFFIX}` })]);
    const draft = await agent.generate(INPUT);
    expect(draft.visibleBackstory).toBe(`A tired owl. ${SIMULATED_SUFFIX}`);
  });
});

describe('treasure schema and helpers', () => {
  it('accepts the fake treasure fixtures in model form', () => {
    for (const fake of FAKE_TREASURES) {
      const asOutput = {
        title: fake.title,
        visibleBackstory: fake.visibleBackstory,
        visibleLockObjective: fake.visibleLockObjective,
        visualAssetPrompt: fake.visualAssetPrompt,
        hiddenCriteria: fake.hiddenRubric.scoringCriteria.map((criterion) => ({
          criterion,
          mentionedInObjective: false,
        })),
      };
      expect(treasureSchemaFor([]).safeParse(asOutput).success).toBe(true);
    }
  });

  it('withSimulatedSuffix trims and appends once', () => {
    expect(withSimulatedSuffix('  A flamingo.  ')).toBe(`A flamingo. ${SIMULATED_SUFFIX}`);
    expect(withSimulatedSuffix(`A flamingo. ${SIMULATED_SUFFIX}`)).toBe(`A flamingo. ${SIMULATED_SUFFIX}`);
  });

  it('the instruction says when no titles are used yet, and carries the safety rules', () => {
    const instruction = treasureInstruction({ usedTitles: [], roundDurationSeconds: 60 });
    expect(instruction).toContain('- (none yet)');
    expect(instruction).toContain('Never create real passwords, credentials');
    expect(instruction).toContain('No text, no real people, no logos');
    expect(instruction).toContain('Write exactly 3 hidden criteria');
  });
});
