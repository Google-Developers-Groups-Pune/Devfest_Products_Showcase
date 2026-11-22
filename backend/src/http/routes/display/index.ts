import { Router } from 'express';

/**
 * /api/display — public big-screen API 27. No login.
 * Responses are allow-listed projections only (BE-13).
 */
export function displayRouter(): Router {
  return Router();
}
