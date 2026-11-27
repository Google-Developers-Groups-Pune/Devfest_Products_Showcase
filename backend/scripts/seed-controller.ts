/**
 * Creates or updates the one Controller account (BE-05).
 *
 *   npm run seed:controller
 *
 * Asks for the username and password in the terminal. The password is hidden, never
 * printed or logged, and only its argon2 hash is stored. Re-running changes the
 * password and signs out any open Controller session.
 *
 * Uses GCP_PROJECT_ID from .env, or the emulator if FIRESTORE_EMULATOR_HOST is set.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/auth/passwords.js';
import { loadEnv } from '../src/config/env.js';
import { systemClock } from '../src/core/clock.js';
import { createFirestore } from '../src/data/firestore.js';
import { createRepositories } from '../src/data/repositories/index.js';
import { firestoreControllerAuthStore } from '../src/services/auth-stores.js';

const MIN_PASSWORD_LENGTH = 12;

let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
const lines = rl[Symbol.asyncIterator]();
const nextLine = async (): Promise<string> => {
  const line = await lines.next();
  return line.done === true ? '' : line.value;
};

try {
  process.stdout.write('Controller username: ');
  const username = (await nextLine()).trim();
  process.stdout.write('Controller password (hidden): ');
  muted = true;
  const password = await nextLine();
  muted = false;
  process.stdout.write('\n');

  if (username === '') throw new Error('Username is required.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const repos = createRepositories(createFirestore(loadEnv()), systemClock);
  const existing = await firestoreControllerAuthStore(repos).findByUsername(username);
  const id = existing?.id ?? `ctl_${randomUUID().slice(0, 8)}`;
  await repos.controllers.set(id, { username, passwordHash: await hashPassword(password), activeTokenId: null });

  console.log(existing ? `Updated Controller ${id}.` : `Created Controller ${id}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seeding failed.');
  process.exitCode = 1;
} finally {
  rl.close();
}
