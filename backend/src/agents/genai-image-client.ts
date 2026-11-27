import { GoogleGenAI } from '@google/genai';
import type { ImageModelClient } from './image-agent.js';
import type { GenAiClientOptions } from './genai-client.js';

/**
 * The real `ImageModelClient` on Vertex AI (BE-35). Imagen models use `generateImages`;
 * Gemini image models use `generateContent` with an image response. Which one we use is
 * pinned in `IMAGE_MODEL` and `IMAGE_MODEL_FALLBACK` (BE-38).
 *
 * Not used yet: the server runs on the fake image agent until the GCP environment exists.
 */
export function createGenAiImageClient(options: GenAiClientOptions): ImageModelClient {
  const ai = new GoogleGenAI({ vertexai: true, project: options.project, location: options.location });
  return {
    async generateImage({ model, prompt, signal }) {
      if (/imagen/i.test(model)) {
        const response = await ai.models.generateImages({
          model,
          prompt,
          config: { numberOfImages: 1, aspectRatio: '4:3', outputMimeType: 'image/jpeg', abortSignal: signal },
        });
        const image = response.generatedImages?.[0]?.image;
        return {
          bytes: image?.imageBytes ? Uint8Array.from(Buffer.from(image.imageBytes, 'base64')) : new Uint8Array(),
          mimeType: image?.mimeType ?? 'image/jpeg',
        };
      }
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: ['IMAGE'], abortSignal: signal },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      return {
        bytes: part?.inlineData?.data ? Uint8Array.from(Buffer.from(part.inlineData.data, 'base64')) : new Uint8Array(),
        mimeType: part?.inlineData?.mimeType ?? 'image/png',
      };
    },
  };
}
