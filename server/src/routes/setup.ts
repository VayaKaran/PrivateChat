import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb, logAuditEvent } from '../db/database.js';
import {
  hashPassword,
  generateSessionToken,
  generateCsrfToken,
  sha256,
  verifyDeviceKeySignature,
} from '../utils/crypto.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const setupRouter = Router();

const setupRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 10,
  message: 'Too many setup attempts.',
});

const SetupSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Username must be alphanumeric, underscores or hyphens'),
  displayName: z.string().trim().min(1).max(64),
  password: z.string().min(10, 'Password must be at least 10 characters long'),
  deviceName: z.string().trim().min(1).max(64),
  identityPublicKey: z.string().min(32),
  exchangePublicKey: z.string().min(32),
  keySignature: z.string().min(32),
});

/**
 * GET /api/setup/status
 * Check if the server has been initialized
 */
setupRouter.get('/status', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;
  const isInitialized = row?.value === 'true';

  res.json({
    isInitialized,
    allowSetup: !isInitialized,
  });
});

/**
 * POST /api/setup
 * Initialize application owner
 */
setupRouter.post('/', setupRateLimiter, async (req: Request, res: Response) => {
  const db = getDb();

  // 1. Verify not already initialized
  const row = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;
  if (row?.value === 'true') {
    return res.status(403).json({ error: 'Server is already initialized. Owner already exists.' });
  }

  // 2. Validate input schema
  const parsed = SetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
  }

  const {
    username,
    displayName,
    password,
    deviceName,
    identityPublicKey,
    exchangePublicKey,
    keySignature,
  } = parsed.data;

  // 3. Cryptographically verify that identity key signed exchange key
  const validSignature = await verifyDeviceKeySignature(
    identityPublicKey,
    exchangePublicKey,
    keySignature
  );
  if (!validSignature) {
    return res.status(400).json({
      error: 'Cryptographic verification failed: device exchange key signature is invalid.',
    });
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const roomId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = sha256(sessionToken);
  const csrfToken = generateCsrfToken();
  const expiresAt = now + config.SESSION_TTL_HOURS * 3600 * 1000;

  try {
    // 4. Hash password with Argon2id
    const passwordHash = await hashPassword(password);

    // 5. Transactional insert of Owner, Device, Default Room, Session and System Config
    db.exec('BEGIN IMMEDIATE;');

    // Double check initialization inside write transaction
    const checkInit = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;
    if (checkInit?.value === 'true') {
      db.exec('ROLLBACK;');
      return res.status(403).json({ error: 'Server was just initialized by another request.' });
    }

    // Insert user
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)
    `).run(userId, username.toLowerCase(), displayName, passwordHash, now, now);

    // Insert device
    db.prepare(`
      INSERT INTO devices (id, user_id, device_name, identity_public_key, exchange_public_key, key_signature, status, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(deviceId, userId, deviceName, identityPublicKey, exchangePublicKey, keySignature, now, now);

    // Create default General group room
    db.prepare(`
      INSERT INTO rooms (id, name, type, created_by, created_at)
      VALUES (?, 'General', 'group', ?, ?)
    `).run(roomId, userId, now);

    // Add owner as admin member of General room
    db.prepare(`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (?, ?, 'admin', ?)
    `).run(roomId, userId, now);

    // Create session
    db.prepare(`
      INSERT INTO sessions (id, user_id, device_id, session_token_hash, csrf_token, user_agent, ip_address, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userId,
      deviceId,
      sessionTokenHash,
      csrfToken,
      req.headers['user-agent'] || 'unknown',
      req.ip || 'unknown',
      expiresAt,
      now
    );

    // Mark system initialized
    db.prepare(`
      INSERT INTO system_config (key, value, created_at)
      VALUES ('initialized', 'true', ?)
    `).run(now);

    db.exec('COMMIT;');

    logAuditEvent('SYSTEM_INITIALIZED', userId, deviceId, req.ip, { username });
    logger.info('PrivateChat successfully initialized with initial owner account.', { userId, username });

    // Set HttpOnly, SameSite=Lax/Strict session cookie
    res.cookie('pvt_session', sessionToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: config.SESSION_TTL_HOURS * 3600 * 1000,
    });

    return res.status(201).json({
      message: 'Owner initialized successfully.',
      user: {
        id: userId,
        username: username.toLowerCase(),
        displayName,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      device: {
        id: deviceId,
        userId,
        deviceName,
        identityPublicKey,
        exchangePublicKey,
        keySignature,
        status: 'active',
        lastSeenAt: now,
        createdAt: now,
      },
      csrfToken,
      sessionToken, // Also returned for programmatic or non-browser clients
    });
  } catch (err: any) {
    db.exec('ROLLBACK;');
    logger.error('Failed to initialize server owner', { error: err.message });
    return res.status(500).json({ error: 'Server initialization failed.' });
  }
});
