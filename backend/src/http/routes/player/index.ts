import { Router } from 'express';

/**
 * /api/player — player phone APIs 20–26.
 * The player is always identified from the token, never from the request body.
 */
export function playerRouter(): Router {
  return Router();
}
