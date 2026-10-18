import { Router, Request, Response } from 'express';
import { getDb, logAuditEvent } from '../db/database.js';
import { authenticateSession } from '../middleware/auth.js';
import { wsServer } from '../ws/websocketServer.js';

export const devicesRouter = Router();

/**
 * GET /api/devices
 * List registered devices
 */
devicesRouter.get('/', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const db = getDb();
  const isAdmin = ['owner', 'admin'].includes(req.user!.role);
  const showAll = req.query.all === 'true' && isAdmin;

  let query = `
    SELECT d.id, d.user_id, d.device_name, d.identity_public_key, d.exchange_public_key, d.key_signature,
           d.status, d.last_seen_at, d.created_at, d.revoked_at, u.username, u.display_name
    FROM devices d
    JOIN users u ON u.id = d.user_id
  `;

  let rows: any[];
  if (showAll) {
    query += ' ORDER BY d.created_at DESC';
    rows = db.prepare(query).all();
  } else {
    query += ' WHERE d.user_id = ? ORDER BY d.created_at DESC';
    rows = db.prepare(query).all(req.user!.id);
  }

  const devices = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    deviceName: r.device_name,
    identityPublicKey: r.identity_public_key,
    exchangePublicKey: r.exchange_public_key,
    keySignature: r.key_signature,
    status: r.status,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
  }));

  res.json({ devices });
});

/**
 * DELETE /api/devices/:id
 * Revoke a device
 */
devicesRouter.delete('/:id', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const now = Date.now();

  const device = db.prepare('SELECT user_id, status FROM devices WHERE id = ?').get(id) as any;
  if (!device) {
    return res.status(404).json({ error: 'Device not found.' });
  }

  const isOwnerOrAdmin = ['owner', 'admin'].includes(req.user!.role);
  const isOwnDevice = device.user_id === req.user!.id;

  if (!isOwnerOrAdmin && !isOwnDevice) {
    return res.status(403).json({ error: 'You are not authorized to revoke this device.' });
  }

  db.exec('BEGIN IMMEDIATE;');
  db.prepare("UPDATE devices SET status = 'revoked', revoked_at = ? WHERE id = ?").run(now, id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE device_id = ?').run(now, id);
  db.exec('COMMIT;');

  logAuditEvent('DEVICE_REVOKED', req.user!.id, id, req.ip, { targetDeviceId: id });

  // Terminate any active WebSocket connections for this revoked device
  wsServer?.disconnectDevice(id, 'Device has been revoked.');

  res.json({ message: 'Device successfully revoked.' });
});
