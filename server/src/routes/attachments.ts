import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { authenticateSession } from '../middleware/auth.js';
import { ATTACHMENTS_DIR, config } from '../config.js';

export const attachmentsRouter = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const fileId = crypto.randomUUID();
    cb(null, `${fileId}.enc`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_ATTACHMENT_BYTES,
  },
});

/**
 * POST /api/attachments
 * Upload client-side encrypted attachment blob
 */
attachmentsRouter.post(
  '/',
  authenticateSession({ requireCsrf: true }),
  upload.single('encryptedFile'),
  (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No encrypted file uploaded.' });
    }

    const { messageId, roomId, fileNameEncrypted, mimeTypeEncrypted, fileSizeBytes } = req.body;
    if (!messageId || !roomId || !fileNameEncrypted || !mimeTypeEncrypted) {
      // Clean up uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing attachment envelope metadata.' });
    }

    const db = getDb();
    const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, req.user!.id);
    if (!isMember) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'You are not authorized to upload attachments to this room.' });
    }

    const attachmentId = crypto.randomUUID();
    const relativePath = path.basename(req.file.path);
    const now = Date.now();

    db.prepare(`
      INSERT INTO attachments (
        id, message_id, room_id, uploader_user_id, file_name_encrypted, mime_type_encrypted, file_size_bytes, storage_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attachmentId,
      messageId,
      roomId,
      req.user!.id,
      fileNameEncrypted,
      mimeTypeEncrypted,
      Number(fileSizeBytes) || req.file.size,
      relativePath,
      now
    );

    res.status(201).json({
      attachment: {
        id: attachmentId,
        messageId,
        roomId,
        fileSizeBytes: Number(fileSizeBytes) || req.file.size,
        createdAt: now,
      },
    });
  }
);

/**
 * GET /api/attachments/:id
 * Download encrypted attachment blob
 */
attachmentsRouter.get('/:id', authenticateSession({ requireCsrf: false }), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();

  const attachment = db
    .prepare('SELECT id, room_id, storage_path FROM attachments WHERE id = ?')
    .get(id) as any;

  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }

  // Check authorization
  const isMember = db
    .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?')
    .get(attachment.room_id, req.user!.id);

  if (!isMember) {
    return res.status(403).json({ error: 'You are not authorized to access this attachment.' });
  }

  const filePath = path.join(ATTACHMENTS_DIR, attachment.storage_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Attachment file not found on disk.' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(filePath);
});
