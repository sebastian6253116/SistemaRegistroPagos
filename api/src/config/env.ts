import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized, validated environment configuration.
 * Fails fast at boot if a required variable is missing or malformed.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  BUSINESS_TIMEZONE: z.string().default('America/Caracas'),
  MATCH_AMOUNT_TOLERANCE_BS: z.coerce.number().nonnegative().default(0.01),
  MATCH_DATE_WINDOW_DAYS: z.coerce.number().int().nonnegative().default(3),
  MATCH_REFERENCE_SUFFIX: z.coerce.number().int().positive().default(8),
  UMBRAL_ANTIGUEDAD_DIAS: z.coerce.number().int().nonnegative().default(30),

  UPLOAD_DIR: z.string().default('uploads'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
