import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../../../core/errors.js';
import type { ControllerAuthService } from '../../../services/controller-auth.js';
import { requireController, type AuthLocals } from '../../middleware/auth.js';

const LoginBody = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

/** 5 login tries per minute per IP address, never a long lockout. */
export const LOGIN_ATTEMPTS_PER_MINUTE = 5;

/** APIs 1–3: POST /auth/login, POST /auth/logout, GET /auth/me. */
export function controllerAuthRouter(auth: ControllerAuthService): Router {
  const router = Router();

  const loginLimit = rateLimit({
    windowMs: 60_000,
    limit: LOGIN_ATTEMPTS_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many tries. Please wait a minute and try again.'));
    },
  });

  router.post('/auth/login', loginLimit, async (req, res) => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'BAD_REQUEST', 'Please enter a username and password.');
    const result = await auth.login(body.data.username, body.data.password);
    res.status(200).json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      controller: result.controller,
    });
  });

  router.post('/auth/logout', requireController(auth), async (_req, res) => {
    const { controller } = res.locals as AuthLocals;
    if (controller) await auth.logout(controller);
    res.status(204).end();
  });

  router.get('/auth/me', requireController(auth), (_req, res) => {
    const { controller } = res.locals as AuthLocals;
    res.status(200).json({ controller: { id: controller?.controllerId, username: controller?.username } });
  });

  return router;
}
