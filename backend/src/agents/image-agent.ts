import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import { AgentError, isAgentError } from './errors.js';
import { UNCONFIGURED_MODEL } from './config.js';
import type { GeneratedImage, ImageAgent } from './types.js';

/**
 * Treasure image generation (BE-35). Every treasure has an image (D7): try `IMAGE_MODEL`
 * up to 3 times (2 retries), then `IMAGE_MODEL_FALLBACK` once. 45 seconds per try.
 *
 * Image models are not JSON models, so this agent does its own retries instead of the
 * gateway. It logs model, latency and outcome per try, never the prompt.
 */

export interface ImageRequest {
  model: string;
  /** Style prefix plus the treasure's image prompt. */
  prompt: string;
  signal: AbortSignal;
}

export interface RawImage {
  bytes: Uint8Array;
  mimeType: string;
}

/** The model call. `genai-image-client.ts` is the real one. */
export interface ImageModelClient {
  generateImage(request: ImageRequest): Promise<RawImage>;
}

/**
 * The art style, prepended to every image prompt. Proposed for review (BE-35): a flat, friendly
 * cartoon in the Google palette, with no text, real people or brands (PRD 5.2).
 */
export const DEFAULT_IMAGE_STYLE =
  'Bright, friendly flat cartoon illustration with bold outlines and soft shading, ' +
  'in the Google colours blue #4285F4, red #EA4335, yellow #FBBC05 and green #34A853, ' +
  'on a plain light background. No text, letters or numbers. No logos or real brands. ' +
  'No real people or celebrities. Subject:';

/** Model IDs and style from env config (BE-38): never hard-coded. */
export function imageAgentSettings(env: Env): Pick<GeminiImageAgentOptions, 'model' | 'fallbackModel' | 'stylePrefix'> {
  return {
    model: env.IMAGE_MODEL ?? UNCONFIGURED_MODEL,
    fallbackModel: env.IMAGE_MODEL_FALLBACK,
    stylePrefix: env.IMAGE_STYLE_PREFIX ?? DEFAULT_IMAGE_STYLE,
  };
}

export interface GeminiImageAgentOptions {
  client: ImageModelClient;
  model: string;
  fallbackModel?: string | undefined;
  stylePrefix?: string;
  timeoutMs?: number;
  /** Extra tries on the main model before the fallback. */
  retries?: number;
  logger: Logger;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: number;
}

export class GeminiImageAgent implements ImageAgent {
  readonly name = 'image';
  readonly model: string;
  private readonly fallbackModel: string | undefined;
  private readonly stylePrefix: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly backoffMs: number;

  constructor(private readonly options: GeminiImageAgentOptions) {
    this.model = options.model;
    this.fallbackModel = options.fallbackModel;
    this.stylePrefix = options.stylePrefix ?? DEFAULT_IMAGE_STYLE;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.retries = options.retries ?? 2;
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.backoffMs = options.backoffMs ?? 1_000;
  }

  /**
   * A real image call is slow and costly, so the health probe (API 18) only checks that a
   * model is configured. A failing model shows up as `treasure:failed` instead.
   */
  ping(): Promise<void> {
    if (this.model === UNCONFIGURED_MODEL || this.model.trim() === '') {
      return Promise.reject(new AgentError('image', 'MODEL_ERROR', false, 'No image model configured'));
    }
    return Promise.resolve();
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const fullPrompt = `${this.stylePrefix} ${prompt.trim()}`;
    let last: AgentError | undefined;

    for (let attempt = 1; attempt <= 1 + this.retries; attempt += 1) {
      try {
        return await this.tryModel(this.model, fullPrompt, attempt);
      } catch (err) {
        last = err as AgentError;
        if (!last.retryable) break;
        if (attempt <= this.retries) await this.sleep(this.backoffMs * 2 ** (attempt - 1));
      }
    }
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      try {
        return await this.tryModel(this.fallbackModel, fullPrompt, 1);
      } catch (err) {
        last = err as AgentError;
      }
    }
    throw new AgentError('image', last?.code ?? 'MODEL_ERROR', true, 'No image after all tries', { cause: last });
  }

  private async tryModel(model: string, prompt: string, attempt: number): Promise<GeneratedImage> {
    const started = this.now();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AgentError('image', 'TIMEOUT', true, `No image within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
    });
    try {
      const image = await Promise.race([
        this.options.client.generateImage({ model, prompt, signal: controller.signal }),
        timeout,
      ]);
      if (image.bytes.length === 0) {
        // Usually the model's own safety filter. Another try may produce an image.
        throw new AgentError('image', 'INVALID_OUTPUT', true, 'Model returned no image');
      }
      this.record(model, attempt, started, 'OK');
      return { bytes: image.bytes, mimeType: image.mimeType, model };
    } catch (err) {
      const error = toImageError(err);
      this.record(model, attempt, started, error.code);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private record(model: string, attempt: number, started: number, outcome: string): void {
    const fields = { agent: 'image', model, attempt, latencyMs: Math.round(this.now() - started), outcome };
    if (outcome === 'OK') this.options.logger.info(fields, 'Agent call');
    else this.options.logger.warn(fields, 'Agent call failed');
  }
}

/** Client errors (4xx other than 408 and 429), such as a bad model ID, are not retried. */
function toImageError(err: unknown): AgentError {
  if (isAgentError(err)) return err;
  const status = (err as { status?: unknown } | null)?.status;
  const permanent = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
  const detail = typeof status === 'number' ? `status ${status}` : 'no status';
  return new AgentError('image', 'MODEL_ERROR', !permanent, `Image call failed (${detail})`, { cause: err });
}
