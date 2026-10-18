import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { authenticateSession } from '../middleware/auth.js';
import { config } from '../config.js';
import { wsServer } from '../ws/websocketServer.js';
import { EncryptedMessageEnvelope } from '@privatechat/shared';

export const messagesRouter = Router();

const PostMessageSchema = z.object({
  roomId: z.string().uuid(),
  ciphertext: z.string().min(1).max(config.MAX_MESSAGE_BYTES * 2), // base64 overhead
  nonce: z.string().min(16).max(64),
  keyEnvelopes: z.record(z.string(), z.string()),
  signature: z.string().min(32),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

const EditMessageSchema = z.object({
  ciphertext: z.string().min(1).max(config.MAX_MESSAGE_BYTES * 2),
  nonce: z.string().min(16).max(64),
  keyEnvelopes: z.record(z.string(), z.string()),
  signature: z.string().min(32),
});

/**
 * GET /api/messages/:roomId
 * Retrieve paginated encrypted message envelopes
 */
messagesRouter.get('/:roomId', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const db = getDb();
  const userId = req.user!.id;

  // Authorization check: must be a current member of the room
  const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  if (!isMember) {
    return res.status(403).json({ error: 'You are not authorized to view messages in this room.' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = Number(req.query.before) || Date.now() + 10000;

  const rows = db
    .prepare(`
      SELECT id, room_id, sender_user_id, sender_device_id, ciphertext, nonce, key_envelopes, signature,
             reply_to_message_id, is_edited, is_deleted, created_at, edited_at
      FROM messages
      WHERE room_id = ? AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(roomId, before, limit) as any[];

  const messages: EncryptedMessageEnvelope[] = rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    senderUserId: r.sender_user_id,
    senderDeviceId: r.sender_device_id,
    ciphertext: r.ciphertext,
    nonce: r.nonce,
    keyEnvelopes: JSON.parse(r.key_envelopes || '{}'),
    signature: r.signature,
    replyToMessageId: r.reply_to_message_id,
    isEdited: r.is_edited === 1,
    isDeleted: r.is_deleted === 1,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  }));

  // Return in chronological order
  res.json({ messages: messages.reverse() });
});

/**
 * POST /api/messages
 * Store encrypted message envelope and broadcast in real-time
 */
messagesRouter.post('/', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const parsed = PostMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid message envelope format', details: parsed.error.format() });
  }

  const { roomId, ciphertext, nonce, keyEnvelopes, signature, replyToMessageId } = parsed.data;
  const db = getDb();
  const userId = req.user!.id;
  const deviceId = req.device!.id;

  // 1. Authorization check: must be an active room member
  const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  if (!isMember) {
    return res.status(403).json({ error: 'You are not authorized to post in this room.' });
  }

  const now = Date.now();
  const messageId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO messages (
      id, room_id, sender_user_id, sender_device_id, ciphertext, nonce, key_envelopes, signature,
      reply_to_message_id, is_edited, is_deleted, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(
    messageId,
    roomId,
    userId,
    deviceId,
    ciphertext,
    nonce,
    JSON.stringify(keyEnvelopes),
    signature,
    replyToMessageId || null,
    now
  );

  const envelope: EncryptedMessageEnvelope = {
    id: messageId,
    roomId,
    senderUserId: userId,
    senderDeviceId: deviceId,
    ciphertext,
    nonce,
    keyEnvelopes,
    signature,
    replyToMessageId: replyToMessageId || null,
    isEdited: false,
    isDeleted: false,
    createdAt: now,
  };

  // Broadcast to room members via WebSocket
  wsServer?.broadcastToRoom(roomId, {
    type: 'message:new',
    message: envelope,
  });

  res.status(201).json({ message: envelope });
});

/**
 * PUT /api/messages/:id
 * Edit an encrypted message envelope
 */
messagesRouter.put('/:id', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = EditMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid edit envelope', details: parsed.error.format() });
  }

  const { ciphertext, nonce, keyEnvelopes, signature } = parsed.data;
  const db = getDb();
  const userId = req.user!.id;

  const msg = db
    .prepare('SELECT id, room_id, sender_user_id, sender_device_id, created_at, is_deleted FROM messages WHERE id = ?')
    .get(id) as any;

  if (!msg) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  if (msg.sender_user_id !== userId) {
    return res.status(403).json({ error: 'You can only edit your own messages.' });
  }

  if (msg.is_deleted === 1) {
    return res.status(400).json({ error: 'Cannot edit a deleted message.' });
  }

  const now = Date.now();
  db.prepare(`
    UPDATE messages 
    SET ciphertext = ?, nonce = ?, key_envelopes = ?, signature = ?, is_edited = 1, edited_at = ?
    WHERE id = ?
  `).run(ciphertext, nonce, JSON.stringify(keyEnvelopes), signature, now, id);

  const updatedEnvelope: EncryptedMessageEnvelope = {
    id: msg.id,
    roomId: msg.room_id,
    senderUserId: msg.sender_user_id,
    senderDeviceId: msg.sender_device_id,
    ciphertext,
    nonce,
    keyEnvelopes,
    signature,
    isEdited: true,
    isDeleted: false,
    createdAt: msg.created_at,
    editedAt: now,
  };

  wsServer?.broadcastToRoom(msg.room_id, {
    type: 'message:updated',
    message: updatedEnvelope,
  });

  res.json({ message: updatedEnvelope });
});

/**
 * DELETE /api/messages/:id
 * Delete a message (tombstone)
 */
messagesRouter.delete('/:id', authenticateSession({ requireCsrf: true }), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const userId = req.user!.id;
  const isOwnerOrAdmin = ['owner', 'admin'].includes(req.user!.role);

  const msg = db
    .prepare('SELECT id, room_id, sender_user_id FROM messages WHERE id = ?')
    .get(id) as any;

  if (!msg) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  if (msg.sender_user_id !== userId && !isOwnerOrAdmin) {
    return res.status(403).json({ error: 'You are not authorized to delete this message.' });
  }

  const now = Date.now();
  // Clear ciphertext and key envelopes upon deletion for privacy
  db.prepare(`
    UPDATE messages
    SET ciphertext = '', nonce = '', key_envelopes = '{}', is_deleted = 1, edited_at = ?
    WHERE id = ?
  `).run(now, id);

  wsServer?.broadcastToRoom(msg.room_id, {
    type: 'message:deleted',
    messageId: id,
    roomId: msg.room_id,
  });

  res.json({ message: 'Message successfully deleted.' });
});
