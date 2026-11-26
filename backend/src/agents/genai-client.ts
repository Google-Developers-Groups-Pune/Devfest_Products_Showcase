import { GoogleGenAI } from '@google/genai';
import type { ModelClient } from './gateway.js';

export interface GenAiClientOptions {
  project: string;
  /** Vertex AI location of the models, for example `asia-south1` or `global` (BE-38). */
  location: string;
}

/**
 * The real `ModelClient`: Gemini on Vertex AI through `@google/genai` (not the removed
 * `@google-cloud/vertexai`). Credentials come from the Cloud Run service account, so there
 * are no key files.
 *
 * Not used yet: the server runs on the fake agents until the GCP environment (BE-38) exists.
 */
export function createGenAiClient(options: GenAiClientOptions): ModelClient {
  const ai = new GoogleGenAI({ vertexai: true, project: options.project, location: options.location });
  return {
    async generateJson(request) {
      const response = await ai.models.generateContent({
        model: request.model,
        // Player text goes in its own user parts, never into the system instruction.
        contents: [{ role: 'user', parts: request.userParts.map((text) => ({ text })) }],
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: request.responseJsonSchema,
          temperature: request.temperature,
          abortSignal: request.signal,
        },
      });
      const text = response.text ?? '';
      return response.modelVersion === undefined ? { text } : { text, modelVersion: response.modelVersion };
    },
  };
}
