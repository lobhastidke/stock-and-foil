import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for HMAC-SHA256 security'),
  DOC_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'DOC_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters for secure webhook authentication'),
  CHAIN_MODE: z.enum(['MOCK', 'HARDHAT', 'MST_TESTNET']).default('MOCK'),
  CHAIN_RPC_URL: z.string().optional().default(''),
  CHAIN_ID: z.coerce.number().optional(),
  CONTRACT_ADDRESS: z.string().optional().default(''),
  OPERATOR_PRIVATE_KEY: z.string().optional().default(''),
  VITE_API_BASE: z.string().default('/api/v1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ FATAL: Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed.');
}

export const config = parsed.data;
export type Config = typeof config;
