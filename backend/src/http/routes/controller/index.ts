import { Router } from 'express';
import type { ControllerAuthService } from '../../../services/controller-auth.js';
import { requireController } from '../../middleware/auth.js';
import { controllerAuthRouter } from './auth.js';

/**
 * /api/controller — Controller dashboard APIs 1–19 and 28–30.
 * Every route except POST /auth/login requires a Controller token (BE-05).
 */
export function controllerRouter(auth: ControllerAuthService): Router {
  const router = Router();
  router.use(controllerAuthRouter(auth));
  // Everything below needs a Controller token, including unknown paths, so a caller
  // without one learns nothing about which routes exist.
  router.use(requireController(auth));
  return router;
}
