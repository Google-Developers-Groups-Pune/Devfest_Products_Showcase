import sharp from 'sharp';
import type { FilterAgent, ImageAgent } from '../agents/types.js';
import type { Clock } from '../core/clock.js';
import { paths } from '../data/paths.js';
import type { EventFileStore } from './event-close.js';

/**
 * Treasure images (BE-35): generate, compress, check with the filter, store privately,
 * and hand out short-lived signed URLs. A rejected or unchecked image is never stored as
 * ready, and no URL reaches players or the display before the round starts.
 */

/**
 * Proposed size and shape: 4:3, 1024 by 768. Still to agree with Mrudula and Harsimar,
 * who place it on the phone card (FE-08) and the big screen (FE-21).
 */
export const TREASURE_IMAGE_SIZE = { width: 1024, height: 768 } as const;
export const MAX_IMAGE_BYTES = 400 * 1024;
const QUALITY_STEPS = [82, 72, 62, 52, 42] as const;

/** Signed URL lifetimes: 15 minutes for the Controller's review, 4 hours once published. */
export const SIGNED_URL_TTL_SECONDS = { review: 15 * 60, published: 4 * 60 * 60 } as const;
/** V4 signed URLs last at most 7 days. */
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** `events/{eventId}/treasures/{candidateId}.jpg` in the private bucket. */
export function treasureImagePath(eventId: string, candidateId: string): string {
  return `${paths.event(eventId)}/treasures/${paths.docId('candidate', candidateId)}.jpg`;
}

/**
 * Resizes to the treasure size (cover crop) and writes JPEG, lowering quality until the file
 * is under 400 KB.
 */
export async function compressImage(
  bytes: Uint8Array,
  size: { width: number; height: number } = TREASURE_IMAGE_SIZE,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<Uint8Array> {
  const resized = sharp(bytes).rotate().resize(size.width, size.height, { fit: 'cover' }).flatten({ background: '#ffffff' });
  for (const quality of QUALITY_STEPS) {
    const out = await resized.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) return new Uint8Array(out);
  }
  throw new Error(`Could not compress the image under ${maxBytes} bytes`);
}

/** The private bucket. The real Cloud Storage store waits for BE-38. */
export interface ImageStore {
  save(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A V4 signed URL that expires after `ttlSeconds`. */
  signUrl(path: string, ttlSeconds: number): Promise<string>;
}

/**
 * In-memory store for tests and local development. Also an `EventFileStore`, so closing the
 * event day (BE-29) deletes and counts its files.
 */
export class MemoryImageStore implements ImageStore, EventFileStore {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();

  constructor(private readonly clock: Clock) {}

  save(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.files.set(path, { bytes, contentType });
    return Promise.resolve();
  }

  signUrl(path: string, ttlSeconds: number): Promise<string> {
    if (!this.files.has(path)) return Promise.reject(new Error('No such image'));
    const expires = new Date(this.clock.now().getTime() + ttlSeconds * 1000).toISOString();
    return Promise.resolve(`memory://treasure-images/${path}?expires=${encodeURIComponent(expires)}`);
  }

  deleteAll(eventId: string): Promise<void> {
    for (const path of this.prefixed(eventId)) this.files.delete(path);
    return Promise.resolve();
  }

  countRemaining(eventId: string): Promise<number> {
    return Promise.resolve(this.prefixed(eventId).length);
  }

  private prefixed(eventId: string): string[] {
    const prefix = `${paths.event(eventId)}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix));
  }
}

export type TreasureImageResult =
  | { status: 'READY'; path: string; model: string; sizeBytes: number }
  | { status: 'BLOCKED'; reason: string; failedClosed: boolean };

export interface TreasureImageDeps {
  images: ImageAgent;
  filter: FilterAgent;
  store: ImageStore;
}

export class TreasureImageService {
  constructor(private readonly deps: TreasureImageDeps) {}

  /**
   * Generate, compress, filter, store. A blocked image is not stored, so BE-19 can regenerate.
   * Generation failures throw `AgentError` (stage IMAGE for `treasure:failed`).
   */
  async create(input: { eventId: string; candidateId: string; prompt: string }): Promise<TreasureImageResult> {
    const generated = await this.deps.images.generate(input.prompt);
    const jpeg = await compressImage(generated.bytes);
    // Check exactly what players would see.
    const check = await this.deps.filter.checkImage({ bytes: jpeg, mimeType: 'image/jpeg', model: generated.model });
    if (check.decision === 'BLOCK') {
      return { status: 'BLOCKED', reason: check.reason, failedClosed: check.failedClosed === true };
    }
    const path = treasureImagePath(input.eventId, input.candidateId);
    await this.deps.store.save(path, jpeg, 'image/jpeg');
    return { status: 'READY', path, model: generated.model, sizeBytes: jpeg.length };
  }

  /** `signImageUrl(path, ttl)`: use `SIGNED_URL_TTL_SECONDS.review` or `.published`. */
  signImageUrl(path: string, ttlSeconds: number): Promise<string> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
      return Promise.reject(new Error('Signed URL lifetime must be 1 second to 7 days'));
    }
    return this.deps.store.signUrl(path, ttlSeconds);
  }
}
