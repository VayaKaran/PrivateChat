import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb, logAuditEvent } from '../db/database.js';
import {
  generateInvitationSecret,
  generatePairingCode,
  sha256,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  generateCsrfToken,
  verifyDeviceKeySignature,
} from '../utils/crypto.js';
import { config } from '../config.js';
import { authenticateSession, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';
import { detectNetworkInterfaces } from '../utils/network.js';

export const invitationsRouter = Router();

const redeemRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 10,
  message: 'Too many invitation redemption attempts. Please wait a minute.',
  enableProgressiveDelay: true,
});

const CreateInvitationSchema = z.object({
  recipientLabel: z.string().trim().max(64).optional(),
  ttlHours: z.coerce.number().min(1).max(720).default(config.INVITATION_DEFAULT_TTL_HOURS),
  maxUses: z.coerce.number().min(1).max(50).default(1),
  requiresApproval: z.boolean().default(false),
});

const RedeemSchema = z.object({
  secretOrCode: z.string().trim().min(4),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(64).optional(),
  password: z.string().min(10, 'Password must be at least 10 characters long'),
  isNewAccount: z.boolean().default(true),
  deviceName: z.string().trim().min(1).max(64),
  identityPublicKey: z.string().min(32),
  exchangePublicKey: z.string().min(32),
  keySignature: z.string().min(32),
});

/**
 * POST /api/invitations
 * Generate a new cryptographically secure invitation (Owner/Admin only)
 */
invitationsRouter.post(
  '/',
  authenticateSession({ requireCsrf: true }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const parsed = CreateInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid invitation options', details: parsed.error.format() });
    }

    const { recipientLabel, ttlHours, maxUses, requiresApproval } = parsed.data;
    const now = Date.now();
    const expiresAt = now + ttlHours * 3600 * 1000;
    const id = crypto.randomUUID();
    const secret = generateInvitationSecret();
    const secretHash = sha256(secret);
    const code = generatePairingCode();

    const db = getDb();
    db.prepare(`
      INSERT INTO invitations (
        id, secret_hash, code, created_by, recipient_label, max_uses, used_count, requires_approval, expires_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?)
    `).run(
      id,
      secretHash,
      code,
      req.user!.id,
      recipientLabel || null,
      maxUses,
      requiresApproval ? 1 : 0,
      expiresAt,
      now
    );

    logAuditEvent('INVITATION_CREATED', req.user!.id, req.device!.id, req.ip, {
      invitationId: id,
      recipientLabel,
      maxUses,
      requiresApproval,
    });

    const net = detectNetworkInterfaces();
    const pairingPayload = {
      serverUrl: net.localUrl,
      invitationId: id,
      secret,
      code,
      expiresAt,
    };

    // Note: 'secret' is sent ONLY ONCE in this response and is NEVER stored or logged!
    return res.status(201).json({
      invitation: {
        id,
        code,
        recipientLabel,
        maxUses,
        usedCount: 0,
        requiresApproval,
        expiresAt,
        status: 'active',
        createdAt: now,
        createdBy: req.user!.id,
      },
      secret,
      pairingPayloadString: JSON.stringify(pairingPayload),
      pairingUrl: `${net.localUrl}/pair?secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`,
    });
  }
);

/**
 * GET /api/invitations
 * List all invitations (Owner/Admin only)
 */
invitationsRouter.get(
  '/',
  authenticateSession({ requireCsrf: false }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(`
        SELECT id, code, recipient_label, max_uses, used_count, requires_approval, expires_at, status, created_at, created_by
        FROM invitations
        ORDER BY created_at DESC
      `)
      .all() as any[];

    // Mark expired if past expires_at
    const now = Date.now();
    const invitations = rows.map((r) => {
      let status = r.status;
      if (status === 'active' && now > r.expires_at) {
        status = 'expired';
      }
      return {
        id: r.id,
        code: r.code,
        recipientLabel: r.recipient_label,
        maxUses: r.max_uses,
        usedCount: r.used_count,
        requiresApproval: r.requires_approval === 1,
        expiresAt: r.expires_at,
        status,
        createdAt: r.created_at,
        createdBy: r.created_by,
      };
    });

    res.json({ invitations });
  }
);

/**
 * DELETE /api/invitations/:id
 * Revoke an invitation (Owner/Admin only)
 */
invitationsRouter.delete(
  '/:id',
  authenticateSession({ requireCsrf: true }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const db = getDb();

    const result = db.prepare("UPDATE invitations SET status = 'revoked' WHERE id = ? AND status = 'active'").run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Invitation not found or already inactive.' });
    }

    logAuditEvent('INVITATION_REVOKED', req.user!.id, req.device!.id, req.ip, { invitationId: id });
    res.json({ message: 'Invitation successfully revoked.' });
  }
);

/**
 * POST /api/invitations/validate
 * Check invitation validity before showing registration form
 */
invitationsRouter.post('/validate', redeemRateLimiter, (req: Request, res: Response) => {
  const secretOrCode = req.body?.secretOrCode?.trim();
  if (!secretOrCode) {
    return res.status(400).json({ error: 'Invitation code or secret is required.' });
  }

  const db = getDb();
  const now = Date.now();
  const secretHash = sha256(secretOrCode);

  const row = db
    .prepare(`
      SELECT id, code, recipient_label, max_uses, used_count, requires_approval, expires_at, status
      FROM invitations
      WHERE (secret_hash = ? OR code = ?)
    `)
    .get(secretHash, secretOrCode) as any;

  if (!row) {
    return res.status(404).json({ error: 'Invalid invitation code or secret.' });
  }

  if (row.status !== 'active') {
    return res.status(400).json({ error: `Invitation is no longer active (${row.status}).` });
  }

  if (now > row.expires_at) {
    return res.status(400).json({ error: 'Invitation has expired.' });
  }

  if (row.used_count >= row.max_uses) {
    return res.status(400).json({ error: 'Invitation has reached maximum permitted uses.' });
  }

  res.json({
    valid: true,
    recipientLabel: row.recipient_label,
    requiresApproval: row.requires_approval === 1,
  });
});

/**
 * POST /api/invitations/redeem
 * Atomically redeem invitation, register device, and authenticate
 */
invitationsRouter.post('/redeem', redeemRateLimiter, async (req: Request, res: Response) => {
  const parsed = RedeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid registration parameters', details: parsed.error.format() });
  }

  const {
    secretOrCode,
    username,
    displayName,
    password,
    isNewAccount,
    deviceName,
    identityPublicKey,
    exchangePublicKey,
    keySignature,
  } = parsed.data;

  // 1. Verify key signature
  const validSignature = await verifyDeviceKeySignature(
    identityPublicKey,
    exchangePublicKey,
    keySignature
  );
  if (!validSignature) {
    return res.status(400).json({ error: 'Cryptographic signature verification failed.' });
  }

  const db = getDb();
  const now = Date.now();
  const secretHash = sha256(secretOrCode);

  try {
    db.exec('BEGIN IMMEDIATE;');

    // 2. Fetch and atomically validate invitation inside write transaction
    const inv = db
      .prepare(`
        SELECT id, code, max_uses, used_count, requires_approval, expires_at, status
        FROM invitations
        WHERE (secret_hash = ? OR code = ?)
      `)
      .get(secretHash, secretOrCode) as any;

    if (!inv || inv.status !== 'active') {
      db.exec('ROLLBACK;');
      return res.status(400).json({ error: 'Invalid or consumed invitation code.' });
    }

    if (now > inv.expires_at) {
      db.exec('ROLLBACK;');
      return res.status(400).json({ error: 'Invitation has expired.' });
    }

    if (inv.used_count >= inv.max_uses) {
      db.exec('ROLLBACK;');
      return res.status(400).json({ error: 'Invitation single-use limit has already been reached.' });
    }

    // 3. Increment usage count and mark consumed if needed
    const nextUsedCount = inv.used_count + 1;
    const nextStatus = nextUsedCount >= inv.max_uses ? 'consumed' : 'active';

    db.prepare('UPDATE invitations SET used_count = ?, status = ? WHERE id = ?').run(
      nextUsedCount,
      nextStatus,
      inv.id
    );

    let targetUserId: string;
    let userRole = 'member';
    let userDisplayName = displayName || username;

    if (isNewAccount) {
      // Check if username taken
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
      if (existing) {
        db.exec('ROLLBACK;');
        return res.status(400).json({ error: 'Username is already registered.' });
      }

      targetUserId = crypto.randomUUID();
      const passwordHash = await hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'member', 'active', ?, ?)
      `).run(targetUserId, username.toLowerCase(), userDisplayName, passwordHash, now, now);
    } else {
      // Existing user pairing additional device
      const existing = db
        .prepare('SELECT id, password_hash, display_name, role, status FROM users WHERE username = ?')
        .get(username.toLowerCase()) as any;

      if (!existing || existing.status !== 'active') {
        db.exec('ROLLBACK;');
        return res.status(400).json({ error: 'Existing account not found or suspended.' });
      }

      const match = await verifyPassword(password, existing.password_hash);
      if (!match) {
        db.exec('ROLLBACK;');
        return res.status(401).json({ error: 'Invalid password for existing account.' });
      }

      targetUserId = existing.id;
      userRole = existing.role;
      userDisplayName = existing.display_name;
    }

    // 4. Register Device
    const deviceId = crypto.randomUUID();
    const deviceStatus = inv.requires_approval === 1 ? 'pending' : 'active';

    db.prepare(`
      INSERT INTO devices (
        id, user_id, device_name, identity_public_key, exchange_public_key, key_signature, status, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deviceId,
      targetUserId,
      deviceName,
      identityPublicKey,
      exchangePublicKey,
      keySignature,
      deviceStatus,
      now,
      now
    );

    // 5. Add user to default General room if not already a member
    const generalRoom = db.prepare("SELECT id FROM rooms WHERE name = 'General' LIMIT 1").get() as any;
    if (generalRoom) {
      const isMember = db
        .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?')
        .get(generalRoom.id, targetUserId);
      if (!isMember) {
        db.prepare("INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(
          generalRoom.id,
          targetUserId,
          now
        );
      }
    }

    // If manual approval is required, commit and return pending status
    if (deviceStatus === 'pending') {
      db.exec('COMMIT;');
      logAuditEvent('PAIRING_REQUESTED', targetUserId, deviceId, req.ip, { invitationId: inv.id });
      return res.status(202).json({
        message: 'Pairing request submitted and waiting for administrator approval.',
        pendingApproval: true,
        deviceId,
        invitationId: inv.id,
      });
    }

    // 6. Create authenticated session
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
      targetUserId,
      deviceId,
      sessionTokenHash,
      csrfToken,
      req.headers['user-agent'] || 'unknown',
      req.ip || 'unknown',
      expiresAt,
      now
    );

    db.exec('COMMIT;');

    logAuditEvent('INVITATION_REDEEMED', targetUserId, deviceId, req.ip, { invitationId: inv.id });

    res.cookie('pvt_session', sessionToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: config.SESSION_TTL_HOURS * 3600 * 1000,
    });

    return res.status(201).json({
      message: 'Invitation redeemed successfully. Device paired.',
      user: {
        id: targetUserId,
        username: username.toLowerCase(),
        displayName: userDisplayName,
        role: userRole,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      device: {
        id: deviceId,
        userId: targetUserId,
        deviceName,
        identityPublicKey,
        exchangePublicKey,
        keySignature,
        status: 'active',
        lastSeenAt: now,
        createdAt: now,
      },
      csrfToken,
      sessionToken,
    });
  } catch (err: any) {
    db.exec('ROLLBACK;');
    logger.error('Invitation redemption error', { error: err.message });
    return res.status(500).json({ error: 'Failed to process invitation redemption.' });
  }
});

/**
 * POST /api/invitations/:id/approve
 * Owner/Admin approves a pending paired device
 */
invitationsRouter.post(
  '/:id/approve',
  authenticateSession({ requireCsrf: true }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required for approval.' });
    }

    const db = getDb();
    const result = db
      .prepare("UPDATE devices SET status = 'active' WHERE id = ? AND status = 'pending'")
      .run(deviceId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pending device not found or already active.' });
    }

    logAuditEvent('PAIRING_APPROVED', req.user!.id, deviceId, req.ip);
    res.json({ message: 'Device pairing successfully approved.' });
  }
);
