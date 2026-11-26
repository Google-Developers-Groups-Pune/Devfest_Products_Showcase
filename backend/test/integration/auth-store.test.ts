import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FakeClock } from '../../src/core/clock.js';
import { createRepositories } from '../../src/data/repositories/index.js';
import { firestoreControllerAuthStore } from '../../src/services/auth-stores.js';
import { closeEmulatorFirestore, describeWithEmulator, emulatorFirestore } from '../fixtures/firestore.js';

let db: Firestore;

describeWithEmulator('Controller auth store (emulator)', { timeout: 30_000 }, () => {
  beforeAll(() => {
    db = emulatorFirestore();
  });

  afterAll(async () => {
    await closeEmulatorFirestore();
  });

  it('finds by username, replaces the active token and clears it only when it matches', async () => {
    const repos = createRepositories(db, new FakeClock());
    const store = firestoreControllerAuthStore(repos);
    const id = `ctl_${randomUUID()}`;
    const username = `user-${randomUUID()}`;
    await repos.controllers.create(id, { username, passwordHash: 'hash', activeTokenId: null });

    expect((await store.findByUsername(username))?.id).toBe(id);
    expect(await store.findByUsername('nobody-has-this-name')).toBeUndefined();

    expect(await store.replaceActiveToken(id, 't1')).toBeNull();
    expect(await store.replaceActiveToken(id, 't2')).toBe('t1');

    await store.clearActiveToken(id, 't1');
    expect((await store.get(id))?.activeTokenId).toBe('t2');
    await store.clearActiveToken(id, 't2');
    expect((await store.get(id))?.activeTokenId).toBeNull();
  });
});
