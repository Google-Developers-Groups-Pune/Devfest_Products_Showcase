import { Router } from 'express';

/**
 * /api/controller — Controller dashboard APIs 1–19 and 28–30.
 * Every route except POST /auth/login requires a Controller token (BE-05).
 */
export function controllerRouter(): Router {
  return Router();
}
