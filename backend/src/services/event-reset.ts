/**
 * `npm run event:reset` (BE-29): clears `system/eventStatus` so rehearsals can run again.
 * In production it needs the explicit flag, so a closed event day is never reopened by accident.
 */

export const PROD_RESET_FLAG = '--confirm-production';

export interface ResetInput {
  nodeEnv: string;
  argv: string[];
  deleteStatus: () => Promise<void>;
}

export async function resetEventStatus(input: ResetInput): Promise<string> {
  if (input.nodeEnv === 'production' && !input.argv.includes(PROD_RESET_FLAG)) {
    throw new Error(`Refusing to reset the event status in production without ${PROD_RESET_FLAG}.`);
  }
  await input.deleteStatus();
  return 'Event status cleared. The next event day can start.';
}
