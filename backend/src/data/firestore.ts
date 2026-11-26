import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Env } from '../config/env.js';

/**
 * The Firestore client. No key files: on Cloud Run it uses the service's
 * own identity. Locally, set FIRESTORE_EMULATOR_HOST (see .env.example)
 * and firebase-admin talks to the emulator instead.
 */
export function createFirestore(env: Pick<Env, 'GCP_PROJECT_ID'>): Firestore {
  const app =
    getApps()[0] ?? initializeApp(env.GCP_PROJECT_ID === undefined ? {} : { projectId: env.GCP_PROJECT_ID });
  return getFirestore(app);
}
