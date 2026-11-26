import { loadEnv } from '../src/config/env.js';
import { createFirestore } from '../src/data/firestore.js';
import { paths } from '../src/data/paths.js';
import { resetEventStatus } from '../src/services/event-reset.js';

/**
 * npm run event:reset                              (development and rehearsals)
 * npm run event:reset -- --confirm-production      (production only)
 */
const env = loadEnv();
const db = createFirestore(env);

try {
  const message = await resetEventStatus({
    nodeEnv: env.NODE_ENV,
    argv: process.argv.slice(2),
    deleteStatus: async () => {
      await db.doc(paths.eventStatus()).delete();
    },
  });
  console.log(message);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
