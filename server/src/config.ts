import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const isTunnel = process.env.TUNNEL_MODE === 'true';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default(process.env.HOST || (isTunnel ? '127.0.0.1' : '0.0.0.0')),
  TUNNEL_MODE: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATA_DIR: z.string().default('./data'),
  SESSION_SECRET: z.string().default('privatechat-local-secret-change-in-production-random-bytes'),
  MAX_MESSAGE_BYTES: z.coerce.number().default(64 * 1024), // 64 KB per text envelope
  MAX_ATTACHMENT_BYTES: z.coerce.number().default(20 * 1024 * 1024), // 20 MB encrypted attachment
  SESSION_TTL_HOURS: z.coerce.number().default(168), // 7 days
  INVITATION_DEFAULT_TTL_HOURS: z.coerce.number().default(24),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60 * 1000), // 1 minute
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(30),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5),
  ALLOW_HTTP_INSECURE_LAN: z.coerce.boolean().default(true),
  ALLOWED_ORIGINS: z.string().default(''),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);

// Ensure data directory exists
const absoluteDataDir = path.resolve(config.DATA_DIR);
if (!fs.existsSync(absoluteDataDir)) {
  fs.mkdirSync(absoluteDataDir, { recursive: true });
}

export const DB_PATH = path.join(absoluteDataDir, 'privatechat.sqlite');
export const ATTACHMENTS_DIR = path.join(absoluteDataDir, 'attachments');

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}
