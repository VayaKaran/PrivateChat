import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database.js';
import { sha256, safeEqual } from '../utils/crypto.js';
import { User, DevicePublicKeys, UserRole } from '@privatechat/shared';

export interface AuthenticatedSession {
  id: string;
  userId: string;
  deviceId: string;
  csrfToken: string;
  expiresAt: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
      device?: DevicePublicKeys;
      session?: AuthenticatedSession;
    }
  }
}

export function authenticateSession(options: { requireCsrf?: boolean } = { requireCsrf: true }) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Extract session token from HttpOnly cookie or Authorization header
    let token = req.cookies?.pvt_session;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. No active session found.' });
    }

    const tokenHash = sha256(token);
    const db = getDb();
    const now = Date.now();

    // 2. Query session, user, and device
    const row = db
      .prepare(`
        SELECT 
          s.id as session_id,
          s.user_id,
          s.device_id,
          s.csrf_token,
          s.expires_at as session_expires_at,
          s.revoked_at as session_revoked_at,
          u.id as u_id,
          u.username,
          u.display_name,
          u.role,
          u.status as user_status,
          u.created_at as user_created_at,
          u.updated_at as user_updated_at,
          d.id as d_id,
          d.device_name,
          d.identity_public_key,
          d.exchange_public_key,
          d.key_signature,
          d.status as device_status,
          d.last_seen_at,
          d.created_at as device_created_at,
          d.revoked_at as device_revoked_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN devices d ON d.id = s.device_id
        WHERE s.session_token_hash = ?
      `)
      .get(tokenHash) as any;

    if (!row) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    // 3. Verify session active and not expired
    if (row.session_revoked_at || now > row.session_expires_at) {
      return res.status(401).json({ error: 'Session has expired or been revoked.' });
    }

    // 4. Verify user and device are active
    if (row.user_status !== 'active') {
      return res.status(403).json({ error: 'User account is suspended or revoked.' });
    }

    if (row.device_status !== 'active' || row.device_revoked_at) {
      return res.status(403).json({ error: 'Device has been revoked.' });
    }

    // 5. CSRF Protection for state-changing HTTP methods
    if (options.requireCsrf && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const headerCsrf = req.headers['x-csrf-token'];
      if (!headerCsrf || typeof headerCsrf !== 'string' || !safeEqual(headerCsrf, row.csrf_token)) {
        return res.status(403).json({ error: 'CSRF verification failed. Request rejected.' });
      }
    }

    // Update last_seen_at for device periodically (throttle updates to once per 5 minutes)
    if (now - row.last_seen_at > 5 * 60 * 1000) {
      try {
        db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, row.d_id);
      } catch {
        // non-fatal
      }
    }

    req.session = {
      id: row.session_id,
      userId: row.user_id,
      deviceId: row.device_id,
      csrfToken: row.csrf_token,
      expiresAt: row.session_expires_at,
    };

    req.user = {
      id: row.u_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role as UserRole,
      status: row.user_status,
      createdAt: row.user_created_at,
      updatedAt: row.user_updated_at,
    };

    req.device = {
      id: row.d_id,
      userId: row.user_id,
      deviceName: row.device_name,
      identityPublicKey: row.identity_public_key,
      exchangePublicKey: row.exchange_public_key,
      keySignature: row.key_signature,
      status: row.device_status,
      lastSeenAt: row.last_seen_at,
      createdAt: row.device_created_at,
      revokedAt: row.device_revoked_at,
    };

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient administrative privileges.' });
    }
    next();
  };
}
