import { Router } from 'express';
import { promptsRouter, type PromptsRouterDeps } from './prompts.js';

export interface PlayerRouterDeps {
  /** API 24 (BE-21). Mounted only when given: it needs Firestore and the BE-05 token check. */
  prompts?: PromptsRouterDeps | undefined;
}

/**
 * /api/player — player phone APIs 20–26.
 * The player is always identified from the token, never from the request body.
 */
export function playerRouter(deps: PlayerRouterDeps = {}): Router {
  const router = Router();
  if (deps.prompts) router.use(promptsRouter(deps.prompts));
  return router;
}
