import type { Logger } from 'pino';
import { z } from 'zod';
import type { AgentsConfig } from './config.js';
import { AgentError } from './errors.js';
import type { AgentName } from './types.js';

/**
 * The one place that talks to the model (BE-14). Agents describe what they want, the gateway
 * handles timeout, retry with backoff, structured output, Zod validation and call records.
 *
 * The model is reached through `ModelClient`, so tests use a fake client and the real
 * `@google/genai` client stays a thin adapter (`genai-client.ts`).
 */

export interface ModelRequest {
  model: string;
  /** Trusted text only: server instructions and pinned game data. */
  systemInstruction: string;
  /** Untrusted data, such as player text. Each entry is its own part, never joined into the instruction. */
  userParts: string[];
  /** JSON Schema for structured output. */
  responseJsonSchema: unknown;
  temperature: number;
  signal: AbortSignal;
}

export interface ModelResponse {
  /** The raw JSON text the model returned. */
  text: string;
  modelVersion?: string;
}

export interface ModelClient {
  generateJson(request: ModelRequest): Promise<ModelResponse>;
}

export interface StructuredCall<T> {
  agent: AgentName;
  systemInstruction: string;
  userParts: string[];
  /** Validates the model's answer. Put ranges here (`.min()`, `.max()`), so out-of-range values are rejected. */
  schema: z.ZodType<T>;
  /** Overrides the agent's configured retries for this call. */
  maxRetries?: number;
}

export interface CallResult<T> {
  data: T;
  model: string;
  modelVersion: string | undefined;
  latencyMs: number;
  attempts: number;
}

export interface AiGatewayDeps {
  client: ModelClient;
  config: AgentsConfig;
  logger: Logger;
  /** Milliseconds for latency. Defaults to `performance.now`. */
  now?: () => number;
  /** Waits between retries. Tests pass one that resolves at once. */
  sleep?: (ms: number) => Promise<void>;
  /** First backoff delay. Doubles on each retry. */
  backoffMs?: number;
}

const PING_SCHEMA = z.object({ ok: z.literal(true) });

export class AiGateway {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly backoffMs: number;

  constructor(private readonly deps: AiGatewayDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.backoffMs = deps.backoffMs ?? 500;
  }

  /** The model ID configured for an agent. */
  modelFor(agent: AgentName): string {
    return this.deps.config[agent].model;
  }

  async generateStructured<T>(call: StructuredCall<T>): Promise<CallResult<T>> {
    const config = this.deps.config[call.agent];
    const maxRetries = call.maxRetries ?? config.maxRetries;
    const responseJsonSchema = z.toJSONSchema(call.schema);

    for (let attempt = 1; ; attempt += 1) {
      const started = this.now();
      try {
        const response = await this.withTimeout(call.agent, config.timeoutMs, (signal) =>
          this.deps.client.generateJson({
            model: config.model,
            systemInstruction: call.systemInstruction,
            userParts: call.userParts,
            responseJsonSchema,
            temperature: config.temperature,
            signal,
          }),
        );
        const data = parse(call.agent, call.schema, response.text);
        const latencyMs = Math.round(this.now() - started);
        this.record(call.agent, config.model, response.modelVersion, latencyMs, attempt, 'OK');
        return { data, model: config.model, modelVersion: response.modelVersion, latencyMs, attempts: attempt };
      } catch (err) {
        const error = toAgentError(call.agent, err);
        const latencyMs = Math.round(this.now() - started);
        this.record(call.agent, config.model, undefined, latencyMs, attempt, error.code);
        if (!error.retryable || attempt > maxRetries) throw error;
        await this.sleep(this.backoffMs * 2 ** (attempt - 1));
      }
    }
  }

  /** A minimal real call, used by the agents' `ping()` for API 18. No retries. */
  async ping(agent: AgentName): Promise<void> {
    await this.generateStructured({
      agent,
      systemInstruction: 'Health check. Reply with the JSON object {"ok": true} and nothing else.',
      userParts: ['ping'],
      schema: PING_SCHEMA,
      maxRetries: 0,
    });
  }

  private async withTimeout<R>(agent: AgentName, timeoutMs: number, run: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AgentError(agent, 'TIMEOUT', true, `No answer within ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      // Race as well as abort, in case a client ignores the signal.
      return await Promise.race([run(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One structured line per try: model, version, latency and outcome. Never the prompt or answer. */
  private record(
    agent: AgentName,
    model: string,
    modelVersion: string | undefined,
    latencyMs: number,
    attempt: number,
    outcome: string,
  ): void {
    const fields = { agent, model, modelVersion, latencyMs, attempt, outcome };
    if (outcome === 'OK') this.deps.logger.info(fields, 'Agent call');
    else this.deps.logger.warn(fields, 'Agent call failed');
  }
}

function parse<T>(agent: AgentName, schema: z.ZodType<T>, text: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AgentError(agent, 'INVALID_OUTPUT', true, 'Model returned invalid JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    // Only the paths, never the values: the answer could echo player text.
    const paths = result.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
    throw new AgentError(agent, 'INVALID_OUTPUT', true, `Model output failed validation at: ${paths}`);
  }
  return result.data;
}

/**
 * Client errors (4xx other than 408 and 429), such as a bad model ID or request, will fail
 * the same way again, so they are not retried. Everything else is.
 */
function toAgentError(agent: AgentName, err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  const status = (err as { status?: unknown } | null)?.status;
  const permanent = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
  const detail = typeof status === 'number' ? `status ${status}` : 'no status';
  return new AgentError(agent, 'MODEL_ERROR', !permanent, `Model call failed (${detail})`, { cause: err });
}
