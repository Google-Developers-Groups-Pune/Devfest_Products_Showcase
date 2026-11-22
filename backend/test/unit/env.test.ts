import { describe, expect, it } from 'vitest';
import { corsOrigins, loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('treats empty values (as in .env.example) as unset', () => {
    const env = loadEnv({ PORT: '', GCP_PROJECT_ID: '', JWT_SECRET: '   ', MODEL_GUARD: '' });
    expect(env.PORT).toBe(8080);
    expect(env.GCP_PROJECT_ID).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.MODEL_GUARD).toBeUndefined();
  });

  it('rejects invalid values', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ JWT_SECRET: 'too-short' })).toThrow(/Invalid environment configuration/);
  });
});

describe('corsOrigins', () => {
  it('splits and trims a comma-separated list', () => {
    const env = loadEnv({ CORS_ORIGINS: ' http://localhost:5000, https://heist.example ,' });
    expect(corsOrigins(env)).toEqual(['http://localhost:5000', 'https://heist.example']);
  });
});
