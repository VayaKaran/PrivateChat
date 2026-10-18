import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb, logAuditEvent } from '../db/database.js';
import { authenticateSession } from '../middleware/auth.js';
import { Room, RoomMember } from '@privatechat/shared';

export const roomsRouter = Router();

const CreateRoomSchema = z.object({
  name: z.string().trim().min(1).max(64),
  type: z.enum(['direct', 'group']),
  memberUserIds: z.array(z.string().uuid()).min(1),
});

/**
 * GET /api/rooms
 * List all conversations current user is a member of
 */
roomsRouter.get('/', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;

  const roomRows = db
    .prepare(`
      SELECT r.id, r.name, r.type, r.created_by, r.created_at
      FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = ?
      ORDER BY r.created_at DESC
    `)
    .all(userId) as any[];

  const rooms: Room[] = [];

  for (const r of roomRows) {
    const memberRows = db
      .prepare(`
        SELECT rm.room_id, rm.user_id, rm.role, rm.joined_at, u.username, u.display_name
        FROM room_members rm
        JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = ?
      `)
      .all(r.id) as any[];

    const members: RoomMember[] = memberRows.map((m) => ({
      roomId: m.room_id,
      userId: m.user_id,
      username: m.username,
      displayName: m.display_name,
      role: m.role,
      joinedAt: m.joined_at,
    }));

    // For direct chats, customize name to other person's display name if not custom
    let roomName = r.name;
    if (r.type === 'direct') {
      const other = members.find((m) => m.userId !== userId);
      if (other) {
        roomName = other.displayName || other.username;
      }
    }

    // Get last message metadata
    const lastMsg = db
      .prepare(`
        SELECT id, room_id, sender_user_id, sender_device_id, ciphertext, nonce, key_envelopes, signature,
               reply_to_message_id, is_edited, is_deleted, created_at, edited_at
        FROM messages
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(r.id) as any;

    let lastEnvelope = null;
    if (lastMsg) {
      lastEnvelope = {
        id: lastMsg.id,
        roomId: lastMsg.room_id,
        senderUserId: lastMsg.sender_user_id,
        senderDeviceId: lastMsg.sender_device_id,
        ciphertext: lastMsg.ciphertext,
        nonce: lastMsg.nonce,
        keyEnvelopes: JSON.parse(lastMsg.key_envelopes || '{}'),
        signature: lastMsg.signature,
        replyToMessageId: lastMsg.reply_to_message_id,
        isEdited: lastMsg.is_edited === 1,
        isDeleted: lastMsg.is_deleted === 1,
        createdAt: lastMsg.created_at,
        editedAt: lastMsg.edited_at,
      };
    }

    rooms.push({
      id: r.id,
      name: roomName,
      type: r.type,
      createdBy: r.created_by,
      createdAt: r.created_at,
      members,
      lastMessage: lastEnvelope,
    });
  }

  res.json({ rooms });
});

/**
 * POST /api/rooms
 * Create direct or group conversation
 */
roomsRouter.post('/', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid room parameters', details: parsed.error.format() });
  }

  const { name, type, memberUserIds } = parsed.data;
  const currentUserId = req.user!.id;
  const db = getDb();
  const now = Date.now();

  // If direct conversation with single recipient, check if direct room already exists
  if (type === 'direct' && memberUserIds.length === 1) {
    const targetUserId = memberUserIds[0];
    const existing = db
      .prepare(`
        SELECT r.id, r.name, r.type, r.created_by, r.created_at
        FROM rooms r
        JOIN room_members rm1 ON rm1.room_id = r.id AND rm1.user_id = ?
        JOIN room_members rm2 ON rm2.room_id = r.id AND rm2.user_id = ?
        WHERE r.type = 'direct'
        LIMIT 1
      `)
      .get(currentUserId, targetUserId) as any;

    if (existing) {
      return res.json({ room: existing, alreadyExisted: true });
    }
  }

  const roomId = crypto.randomUUID();
  const allUserIds = Array.from(new Set([currentUserId, ...memberUserIds]));

  db.exec('BEGIN IMMEDIATE;');

  db.prepare(`
    INSERT INTO rooms (id, name, type, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(roomId, name, type, currentUserId, now);

  const memberInsert = db.prepare(`
    INSERT INTO room_members (room_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const uid of allUserIds) {
    const role = uid === currentUserId ? 'admin' : 'member';
    memberInsert.run(roomId, uid, role, now);
  }

  db.exec('COMMIT;');

  logAuditEvent('ROOM_CREATED', currentUserId, req.device!.id, req.ip, { roomId, type, memberCount: allUserIds.length });

  res.status(201).json({
    room: {
      id: roomId,
      name,
      type,
      createdBy: currentUserId,
      createdAt: now,
      members: allUserIds,
    },
  });
});

/**
 * GET /api/rooms/:id
 * Retrieve room details, members, and all active recipient device public keys for E2EE
 */
roomsRouter.get('/:id', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();

  // 1. Authorization check: must be a current member
  const membership = db
    .prepare('SELECT role FROM room_members WHERE room_id = ? AND user_id = ?')
    .get(id, req.user!.id) as any;

  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this conversation.' });
  }

  const room = db.prepare('SELECT id, name, type, created_by, created_at FROM rooms WHERE id = ?').get(id) as any;
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const memberRows = db
    .prepare(`
      SELECT rm.user_id, rm.role, rm.joined_at, u.username, u.display_name
      FROM room_members rm
      JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = ?
    `)
    .all(id) as any[];

  // Get active device public keys for all members in this room (needed to construct E2EE fan-out envelopes)
  const deviceRows = db
    .prepare(`
      SELECT d.id, d.user_id, d.device_name, d.identity_public_key, d.exchange_public_key, d.key_signature, d.status
      FROM devices d
      JOIN room_members rm ON rm.user_id = d.user_id
      WHERE rm.room_id = ? AND d.status = 'active'
    `)
    .all(id) as any[];

  res.json({
    room: {
      ...room,
      members: memberRows,
    },
    recipientDevices: deviceRows,
  });
});
