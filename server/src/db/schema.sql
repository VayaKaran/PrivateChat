-- ==============================================================================
-- PrivateChat — Relational Database Schema (SQLite 3)
-- Authoritative schema definitions with foreign keys and WAL performance mode
-- ==============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

-- ------------------------------------------------------------------------------
-- System Configuration & Initial Setup State
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- Users & Roles (Owner, Admin, Member)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- Devices & Public Cryptographic Keybundles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  identity_public_key TEXT NOT NULL,
  exchange_public_key TEXT NOT NULL,
  key_signature TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'revoked')),
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- ------------------------------------------------------------------------------
-- Cryptographic Invitations & Pairing Codes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  secret_hash TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  recipient_label TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'consumed', 'revoked')),
  created_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- Active Sessions (Bearer Tokens and HTTP-only Cookie Hashes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  session_token_hash TEXT UNIQUE NOT NULL,
  csrf_token TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- ------------------------------------------------------------------------------
-- Conversation Rooms (Direct and Group)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

-- ------------------------------------------------------------------------------
-- End-to-End Encrypted Message Envelopes
-- Server never stores plaintext; ciphertext, nonce, keyEnvelopes, and signature only.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  sender_device_id TEXT NOT NULL REFERENCES devices(id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_envelopes TEXT NOT NULL,
  signature TEXT NOT NULL,
  reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  is_edited INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);

-- ------------------------------------------------------------------------------
-- Encrypted Attachments Metadata
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  file_name_encrypted TEXT NOT NULL,
  mime_type_encrypted TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- Audit Logging (Admin actions, device revocations, security events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_status ON devices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_hash ON invitations(secret_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
