// import dotenv from 'dotenv';
// import dotenvExpand from 'dotenv-expand';
import { z } from 'zod';

// const myEnv = dotenv.config();
// dotenvExpand.expand(myEnv);

/**
 * Global configuration of Zod
 */
z.config(z.locales.pt());

export const envSchema = z.object({
  NODE_ENV: z.enum(['dev', 'prod', 'test']).default('dev'),
  APP_PORT: z.coerce.number().default(3333),
  BASE_URL: z.url(),
  WORKER_COUNT: z.coerce.number().default(4),
  DATABASE_URL: z.url().startsWith('postgres://'),
});

const envRegistry = z.registry<{
  title: string;
  description: string;
}>();

envSchema.register(envRegistry, {
  title: 'Env Schema',
  description: 'The environment variables schema definition',
});

export type Env = z.infer<typeof envSchema>;
