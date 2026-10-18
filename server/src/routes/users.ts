import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb, logAuditEvent } from '../db/database.js';
import { authenticateSession, requireRole } from '../middleware/auth.js';
import { wsServer } from '../ws/websocketServer.js';

export const usersRouter = Router();

/**
 * GET /api/users
 * List all users and their active device public keys
 */
usersRouter.get('/', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const db = getDb();

  const userRows = db
    .prepare('SELECT id, username, display_name, role, status, created_at, updated_at FROM users ORDER BY username ASC')
    .all() as any[];

  const deviceRows = db
    .prepare(`
      SELECT id, user_id, device_name, identity_public_key, exchange_public_key, key_signature, status, last_seen_at, created_at
      FROM devices
      WHERE status = 'active'
    `)
    .all() as any[];

  const devicesByUser: Record<string, any[]> = {};
  for (const d of deviceRows) {
    if (!devicesByUser[d.user_id]) {
      devicesByUser[d.user_id] = [];
    }
    devicesByUser[d.user_id].push({
      id: d.id,
      userId: d.user_id,
      deviceName: d.device_name,
      identityPublicKey: d.identity_public_key,
      exchangePublicKey: d.exchange_public_key,
      keySignature: d.key_signature,
      status: d.status,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
    });
  }

  const users = userRows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    devices: devicesByUser[u.id] || [],
  }));

  res.json({ users });
});

/**
 * PATCH /api/users/:id/status
 * Update member status (Owner/Admin only)
 */
usersRouter.patch(
  '/:id/status',
  authenticateSession({ requireCsrf: true }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!['active', 'suspended', 'revoked'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or revoked.' });
    }

    const db = getDb();
    const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.role === 'owner') {
      return res.status(403).json({ error: 'Cannot modify status of application owner.' });
    }

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE;');
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

    if (status === 'revoked' || status === 'suspended') {
      // Invalidate all sessions and revoke devices
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(now, id);
      if (status === 'revoked') {
        db.prepare("UPDATE devices SET status = 'revoked', revoked_at = ? WHERE user_id = ?").run(now, id);
      }
    }
    db.exec('COMMIT;');

    logAuditEvent('USER_STATUS_UPDATED', req.user!.id, req.device!.id, req.ip, { targetUserId: id, status });

    if (status === 'revoked' || status === 'suspended') {
      wsServer?.disconnectUser(id, `Account has been ${status}.`);
    }

    res.json({ message: `User status updated to ${status}.` });
  }
);
