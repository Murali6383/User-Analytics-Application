import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().trim().min(1).default('mongodb://127.0.0.1:27017/insighttrack')
    .refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), 'MONGODB_URI must use mongodb:// or mongodb+srv://'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173')
    .refine((value) => {
      const parsed = new URL(value);
      return parsed.origin === value && ['http:', 'https:'].includes(parsed.protocol);
    }, 'FRONTEND_ORIGIN must be an HTTP(S) origin without a path'),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const fields = parsedEnv.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid backend environment configuration: ${fields.join('; ')}`);
}

export const env = {
  port: parsedEnv.data.PORT,
  mongoUri: parsedEnv.data.MONGODB_URI,
  nodeEnv: parsedEnv.data.NODE_ENV,
  frontendOrigin: parsedEnv.data.FRONTEND_ORIGIN,
};
