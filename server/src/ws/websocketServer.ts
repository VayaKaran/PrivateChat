import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { getDb } from '../db/database.js';
import { sha256, safeEqual } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { allowedOrigins } from '../config.js';
import { ClientWsMessage, ServerWsMessage } from '@privatechat/shared';

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.split('=');
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    const value = rest.join('=').trim();
    try {
      list[trimmedName] = decodeURIComponent(value);
    } catch {
      list[trimmedName] = value;
    }
  });
  return list;
}

interface AuthenticatedSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  deviceId?: string;
  subscribedRooms: Set<string>;
}

export class ChatWebSocketServer {
  private wss: WebSocketServer | null = null;
  // Map of deviceId -> Set of sockets
  private deviceSockets = new Map<string, Set<AuthenticatedSocket>>();
  // Map of userId -> Set of sockets
  private userSockets = new Map<string, Set<AuthenticatedSocket>>();
  // Map of roomId -> Set of sockets
  private roomSubscriptions = new Map<string, Set<AuthenticatedSocket>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  init(server: HttpServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));

    // Heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        const authSocket = client as AuthenticatedSocket;
        if (!authSocket.isAlive) {
          authSocket.terminate();
          continue;
        }
        authSocket.isAlive = false;
        authSocket.ping();
      }
    }, 30000);
  }

  /**
   * Verify Origin and initial handshake
   */
  private verifyClient(
    info: { origin: string; secure: boolean; req: IncomingMessage },
    callback: (res: boolean, code?: number, message?: string) => void
  ) {
    // 1. Origin verification
    const origin = info.origin;
    const host = info.req.headers.host;

    // In local development/LAN, origin matches host; in remote/GitHub Pages setups, check allowedOrigins
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.host;
        const originLower = origin.toLowerCase();
        const isExplicitlyAllowed =
          allowedOrigins.includes(originLower) ||
          allowedOrigins.some((ao) => originLower.startsWith(ao));

        if (
          originHost !== host &&
          !originHost.includes('localhost') &&
          !originHost.includes('127.0.0.1') &&
          !isExplicitlyAllowed
        ) {
          logger.warn('WebSocket connection rejected: invalid origin', { origin, host });
          return callback(false, 403, 'Forbidden origin');
        }
      } catch {
        return callback(false, 400, 'Invalid origin header');
      }
    }

    callback(true);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    const socket = ws as AuthenticatedSocket;
    socket.isAlive = true;
    socket.subscribedRooms = new Set();

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // Check cookie authentication on connect
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies.pvt_session;

    if (sessionToken) {
      this.authenticateSocket(socket, sessionToken);
    }

    socket.on('message', (data: Buffer | string) => {
      try {
        const msg: ClientWsMessage = JSON.parse(data.toString());
        this.handleClientMessage(socket, msg);
      } catch (err: any) {
        this.send(socket, { type: 'error', message: 'Malformed JSON WebSocket message' });
      }
    });

    socket.on('close', () => {
      this.handleSocketClose(socket);
    });

    socket.on('error', (err) => {
      logger.error('WebSocket client error', { error: err.message });
      this.handleSocketClose(socket);
    });
  }

  private authenticateSocket(socket: AuthenticatedSocket, sessionToken: string, csrfToken?: string) {
    const tokenHash = sha256(sessionToken);
    const db = getDb();
    const now = Date.now();

    const row = db
      .prepare(`
        SELECT s.id as session_id, s.user_id, s.device_id, s.csrf_token, s.expires_at, s.revoked_at,
               u.status as user_status, d.status as device_status
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN devices d ON d.id = s.device_id
        WHERE s.session_token_hash = ?
      `)
      .get(tokenHash) as any;

    if (!row || row.revoked_at || now > row.expires_at || row.user_status !== 'active' || row.device_status !== 'active') {
      this.send(socket, { type: 'error', message: 'Authentication failed: session invalid or revoked.' });
      socket.close(4001, 'Unauthorized');
      return false;
    }

    if (csrfToken && !safeEqual(csrfToken, row.csrf_token)) {
      this.send(socket, { type: 'error', message: 'Authentication failed: CSRF mismatch.' });
      socket.close(4003, 'CSRF verification failed');
      return false;
    }

    socket.userId = row.user_id;
    socket.deviceId = row.device_id;

    // Track in userSockets
    if (!this.userSockets.has(row.user_id)) {
      this.userSockets.set(row.user_id, new Set());
    }
    this.userSockets.get(row.user_id)!.add(socket);

    // Track in deviceSockets
    if (!this.deviceSockets.has(row.device_id)) {
      this.deviceSockets.set(row.device_id, new Set());
    }
    this.deviceSockets.get(row.device_id)!.add(socket);

    this.send(socket, {
      type: 'authenticated',
      userId: row.user_id,
      deviceId: row.device_id,
    });

    // Broadcast online presence
    this.broadcastPresence(row.user_id, 'online');
    return true;
  }

  private handleClientMessage(socket: AuthenticatedSocket, msg: ClientWsMessage) {
    if (msg.type === 'ping') {
      return this.send(socket, { type: 'pong' });
    }

    if (msg.type === 'auth') {
      if (msg.sessionToken) {
        this.authenticateSocket(socket, msg.sessionToken, msg.csrfToken);
      }
      return;
    }

    // All subsequent actions require authenticated socket
    if (!socket.userId || !socket.deviceId) {
      return this.send(socket, { type: 'error', message: 'Unauthenticated socket' });
    }

    const db = getDb();

    switch (msg.type) {
      case 'subscribe': {
        const { roomId } = msg;
        // Verify room membership
        const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, socket.userId);
        if (!isMember) {
          return this.send(socket, { type: 'error', message: 'Cannot subscribe: you are not a member of this room' });
        }

        socket.subscribedRooms.add(roomId);
        if (!this.roomSubscriptions.has(roomId)) {
          this.roomSubscriptions.set(roomId, new Set());
        }
        this.roomSubscriptions.get(roomId)!.add(socket);
        break;
      }

      case 'unsubscribe': {
        const { roomId } = msg;
        socket.subscribedRooms.delete(roomId);
        this.roomSubscriptions.get(roomId)?.delete(socket);
        break;
      }

      case 'typing': {
        const { roomId, isTyping } = msg;
        if (!socket.subscribedRooms.has(roomId)) return;

        const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(socket.userId) as any;
        this.broadcastToRoom(
          roomId,
          {
            type: 'typing:status',
            roomId,
            userId: socket.userId,
            displayName: user?.display_name || 'Someone',
            isTyping,
          },
          socket // exclude sender
        );
        break;
      }

      case 'read_receipt': {
        const { messageId, roomId } = msg;
        if (!socket.subscribedRooms.has(roomId)) return;

        this.broadcastToRoom(roomId, {
          type: 'receipt:update',
          messageId,
          roomId,
          userId: socket.userId,
          readAt: Date.now(),
        });
        break;
      }
    }
  }

  private handleSocketClose(socket: AuthenticatedSocket) {
    if (socket.userId) {
      const userSet = this.userSockets.get(socket.userId);
      if (userSet) {
        userSet.delete(socket);
        if (userSet.size === 0) {
          this.userSockets.delete(socket.userId);
          // Broadcast offline presence
          this.broadcastPresence(socket.userId, 'offline');
        }
      }
    }

    if (socket.deviceId) {
      const devSet = this.deviceSockets.get(socket.deviceId);
      if (devSet) {
        devSet.delete(socket);
        if (devSet.size === 0) {
          this.deviceSockets.delete(socket.deviceId);
        }
      }
    }

    for (const roomId of socket.subscribedRooms) {
      this.roomSubscriptions.get(roomId)?.delete(socket);
    }
  }

  /**
   * Broadcast message to all active authorized member sockets subscribed to a room
   */
  broadcastToRoom(roomId: string, message: ServerWsMessage, excludeSocket?: AuthenticatedSocket) {
    const sockets = this.roomSubscriptions.get(roomId);
    if (!sockets) return;

    for (const s of sockets) {
      if (s === excludeSocket) continue;
      if (s.readyState === WebSocket.OPEN) {
        this.send(s, message);
      }
    }
  }

  /**
   * Disconnect all active sockets for a revoked device
   */
  disconnectDevice(deviceId: string, reason: string) {
    const sockets = this.deviceSockets.get(deviceId);
    if (!sockets) return;

    for (const s of sockets) {
      this.send(s, { type: 'device:revoked', deviceId, reason });
      s.close(4002, reason);
    }
    this.deviceSockets.delete(deviceId);
  }

  /**
   * Disconnect all active sockets for a suspended or revoked user
   */
  disconnectUser(userId: string, reason: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    for (const s of sockets) {
      this.send(s, { type: 'error', message: reason });
      s.close(4003, reason);
    }
    this.userSockets.delete(userId);
  }

  private broadcastPresence(userId: string, status: 'online' | 'offline') {
    const payload: ServerWsMessage = {
      type: 'presence:update',
      userId,
      status,
      lastSeenAt: Date.now(),
    };

    // Broadcast to all authenticated connected clients
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      const auth = client as AuthenticatedSocket;
      if (auth.userId && auth.readyState === WebSocket.OPEN) {
        this.send(auth, payload);
      }
    }
  }

  private send(socket: WebSocket, message: ServerWsMessage) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  close() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss?.close();
  }
}

export const wsServer = new ChatWebSocketServer();
