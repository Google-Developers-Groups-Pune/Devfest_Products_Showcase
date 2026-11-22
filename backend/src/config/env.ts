import { z } from 'zod';

/**
 * Runtime configuration, read once from environment variables.
 *
 * Model IDs and the domain are config only, never hard-coded (BE-38).
 * Values other than PORT/LOG_LEVEL/NODE_ENV are optional at skeleton stage;
 * the owning stories make them required when they start using them.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // GCP (BE-38)
  GCP_PROJECT_ID: z.string().min(1).optional(),
  GCP_REGION: z.string().min(1).optional(),
  VERTEX_LOCATION: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(1).optional(),

  // Gemini model IDs (BE-38, BE-14)
  MODEL_TEXT: z.string().min(1).optional(),
  MODEL_GUARD: z.string().min(1).optional(),
  IMAGE_MODEL: z.string().min(1).optional(),
  IMAGE_MODEL_FALLBACK: z.string().min(1).optional(),

  // Domain (BE-38, D24)
  APP_DOMAIN: z.string().min(1).optional(),
  JOIN_URL: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().optional(),

  // Auth (BE-05). Injected from Secret Manager on Cloud Run.
  JWT_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` in a .env file (as in .env.example) means "not set", not "empty string".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function corsOrigins(env: Env): string[] {
  return (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
