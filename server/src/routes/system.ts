import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDb, logAuditEvent } from '../db/database.js';
import { detectNetworkInterfaces } from '../utils/network.js';
import { config, DB_PATH } from '../config.js';
import { authenticateSession, requireRole } from '../middleware/auth.js';

export const systemRouter = Router();

/**
 * GET /api/system/network
 * Information about local network and server connection
 */
systemRouter.get('/network', (req: Request, res: Response) => {
  const net = detectNetworkInterfaces();
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;
  const isInitialized = row?.value === 'true';

  res.json({
    ...net,
    isInitialized,
    protocol: config.ALLOW_HTTP_INSECURE_LAN ? 'http' : 'https',
  });
});

/**
 * GET /api/system/health
 * Server health and uptime
 */
systemRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    memory: process.memoryUsage(),
  });
});

/**
 * POST /api/system/backup
 * Trigger database backup to local data directory (Owner/Admin only)
 */
systemRouter.post(
  '/backup',
  authenticateSession({ requireCsrf: true }),
  requireRole('owner', 'admin'),
  (req: Request, res: Response) => {
    const db = getDb();
    const backupFileName = `backup-${Date.now()}.sqlite`;
    const backupPath = path.resolve(config.DATA_DIR, backupFileName);

    try {
      db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);
      logAuditEvent('DATABASE_BACKUP_CREATED', req.user!.id, req.device!.id, req.ip, { backupFileName });
      res.json({ message: 'Backup created successfully', backupFileName, backupPath });
    } catch (err: any) {
      res.status(500).json({ error: 'Backup failed', details: err.message });
    }
  }
);
