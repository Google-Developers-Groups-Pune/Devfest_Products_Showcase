import { createHash } from 'node:crypto';

/** Lower-case hex SHA-256 of a UTF-8 string. */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Entrance IDs match ignoring case and outer spaces (BE-03). */
export function normaliseEntranceId(entranceId: string): string {
  return entranceId.trim().toLowerCase();
}

/**
 * Document ID for `events/{eventId}/entranceIds/{id}`.
 * A hash, because a typed entrance ID may hold characters such as `/`
 * that Firestore forbids in document IDs.
 */
export function entranceIdDocId(entranceId: string): string {
  const normalised = normaliseEntranceId(entranceId);
  if (normalised === '') {
    throw new Error('entranceId must not be empty');
  }
  return sha256Hex(normalised);
}

/**
 * Prompt ID: sha256(playerId + ":" + idempotencyKey). The same player
 * retrying with the same key always gets the same ID, so a duplicate
 * create fails atomically instead of making a second prompt.
 */
export function promptIdFor(playerId: string, idempotencyKey: string): string {
  if (playerId === '' || idempotencyKey === '') {
    throw new Error('playerId and idempotencyKey must not be empty');
  }
  return sha256Hex(`${playerId}:${idempotencyKey}`);
}
