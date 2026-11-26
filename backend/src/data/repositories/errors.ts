/**
 * Data-layer errors. Services map them to API errors
 * (for example a duplicate entrance ID becomes a 409).
 */

/** A create found the document already there. */
export class DuplicateDocumentError extends Error {
  constructor(
    readonly kind: string,
    readonly id: string,
  ) {
    super(`${kind} already exists`);
    this.name = 'DuplicateDocumentError';
  }
}

/** A document the operation needs is missing. */
export class DocumentNotFoundError extends Error {
  constructor(readonly kind: string) {
    super(`${kind} not found`);
    this.name = 'DocumentNotFoundError';
  }
}

/** gRPC status ALREADY_EXISTS, as thrown by Firestore create(). */
export function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 6;
}
