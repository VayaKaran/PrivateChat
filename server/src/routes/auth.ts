import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb, logAuditEvent } from '../db/database.js';
import {
  verifyPassword,
  generateSessionToken,
  generateCsrfToken,
  sha256,
} from '../utils/crypto.js';
import { config } from '../config.js';
import { authenticateSession } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: config.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many login attempts. Please wait a minute before trying again.',
  enableProgressiveDelay: true,
});

const LoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  deviceId: z.string().uuid().optional(),
});

/**
 * POST /api/auth/login
 * Authenticate existing member on an authorized device
 */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const { username, password, deviceId } = parsed.data;
  const db = getDb();
  const now = Date.now();

  // Query user
  const userRow = db
    .prepare('SELECT id, username, display_name, password_hash, role, status, created_at, updated_at FROM users WHERE username = ?')
    .get(username.toLowerCase()) as any;

  // Protect against timing side channels by running verification even if user not found
  const dummyHash = '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQAAAAAAAAAAA$e0aVw/8F1sQ3v5i9f0nK2L5a';
  const hashToTest = userRow ? userRow.password_hash : dummyHash;
  const isMatch = await verifyPassword(password, hashToTest);

  if (!userRow || !isMatch) {
    logAuditEvent('LOGIN_FAILED', null, null, req.ip, { username });
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (userRow.status !== 'active') {
    return res.status(403).json({ error: 'This account has been suspended or revoked.' });
  }

  // Find active device for this user
  let deviceRow: any;
  if (deviceId) {
    deviceRow = db
      .prepare("SELECT * FROM devices WHERE id = ? AND user_id = ? AND status = 'active'")
      .get(deviceId, userRow.id);
  } else {
    // If no deviceId specified, find the most recently seen active device
    deviceRow = db
      .prepare("SELECT * FROM devices WHERE user_id = ? AND status = 'active' ORDER BY last_seen_at DESC LIMIT 1")
      .get(userRow.id);
  }

  if (!deviceRow) {
    return res.status(403).json({
      error: 'No authorized device registered for this account on this client. Please use an invitation pairing code to register this device.',
    });
  }

  // Generate session
  const sessionId = crypto.randomUUID();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = sha256(sessionToken);
  const csrfToken = generateCsrfToken();
  const expiresAt = now + config.SESSION_TTL_HOURS * 3600 * 1000;

  db.prepare(`
    INSERT INTO sessions (id, user_id, device_id, session_token_hash, csrf_token, user_agent, ip_address, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userRow.id,
    deviceRow.id,
    sessionTokenHash,
    csrfToken,
    req.headers['user-agent'] || 'unknown',
    req.ip || 'unknown',
    expiresAt,
    now
  );

  // Update device last seen
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, deviceRow.id);

  logAuditEvent('LOGIN_SUCCESS', userRow.id, deviceRow.id, req.ip);

  res.cookie('pvt_session', sessionToken, {
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600 * 1000,
  });

  return res.json({
    user: {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.display_name,
      role: userRow.role,
      status: userRow.status,
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
    },
    device: {
      id: deviceRow.id,
      userId: deviceRow.user_id,
      deviceName: deviceRow.device_name,
      identityPublicKey: deviceRow.identity_public_key,
      exchangePublicKey: deviceRow.exchange_public_key,
      keySignature: deviceRow.key_signature,
      status: deviceRow.status,
      lastSeenAt: now,
      createdAt: deviceRow.created_at,
    },
    csrfToken,
    sessionToken,
  });
});

/**
 * GET /api/auth/me
 * Retrieve authenticated user & device profile
 */
authRouter.get('/me', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  res.json({
    user: req.user,
    device: req.device,
    csrfToken: req.session!.csrfToken,
    serverTime: Date.now(),
  });
});

/**
 * POST /api/auth/logout
 * Terminate current session
 */
authRouter.post('/logout', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const db = getDb();
  const now = Date.now();

  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now, req.session!.id);
  logAuditEvent('LOGOUT', req.user!.id, req.device!.id, req.ip);

  res.clearCookie('pvt_session', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
});
