import argon2 from 'argon2';

/** argon2id hash of a password. Only the hash is ever stored (BE-05, D13). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** True if the password matches the hash. A broken hash counts as no match. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs one hash check against a throwaway hash. Used when the username is unknown,
 * so a wrong username takes as long as a wrong password and reveals nothing.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-the-password-0123456789');
  await verifyPassword(await dummyHash, password);
}
