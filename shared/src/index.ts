// Shared Type Definitions for PrivateChat

export type UserRole = 'owner' | 'admin' | 'member';
export type UserStatus = 'active' | 'suspended' | 'revoked';
export type DeviceStatus = 'pending' | 'active' | 'revoked';
export type InvitationStatus = 'active' | 'consumed' | 'revoked';
export type RoomType = 'direct' | 'group';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DevicePublicKeys {
  id: string;
  userId: string;
  deviceName: string;
  identityPublicKey: string; // Ed25519 public key base64
  exchangePublicKey: string; // X25519 public key base64
  keySignature: string;      // Ed25519 signature over exchangePublicKey (base64)
  status: DeviceStatus;
  lastSeenAt: number;
  createdAt: number;
  revokedAt?: number | null;
}

export interface Invitation {
  id: string;
  code: string;
  recipientLabel?: string | null;
  maxUses: number;
  usedCount: number;
  requiresApproval: boolean;
  expiresAt: number;
  status: InvitationStatus;
  createdAt: number;
  createdBy: string;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  createdBy: string;
  createdAt: number;
  members: RoomMember[];
  lastMessage?: EncryptedMessageEnvelope | null;
  unreadCount?: number;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: number;
}

export interface EncryptedMessageEnvelope {
  id: string;
  roomId: string;
  senderUserId: string;
  senderDeviceId: string;
  ciphertext: string;              // XSalsa20-Poly1305 encrypted JSON payload (base64)
  nonce: string;                   // 24-byte random nonce (base64)
  keyEnvelopes: Record<string, string>; // map of deviceId -> base64 encrypted per-message key Km
  signature: string;               // Ed25519 signature over SHA256(ciphertext + JSON(keyEnvelopes))
  replyToMessageId?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: number;
  editedAt?: number | null;
}

export interface DecryptedMessagePayload {
  text: string;
  timestamp: number;
  attachments?: EncryptedAttachmentMetadata[];
}

export interface EncryptedAttachmentMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath?: string;
  fileKey?: string; // encrypted for recipient devices
}

export interface SessionInfo {
  user: User;
  device: DevicePublicKeys;
  csrfToken: string;
  serverTime: number;
}

export interface ServerNetworkInfo {
  isInitialized: boolean;
  port: number;
  lanIp: string;
  localUrl: string;
  hostname: string;
  protocol: 'http' | 'https';
}

// WebSocket Event Protocols
export type ClientWsMessage =
  | { type: 'auth'; sessionToken?: string; csrfToken: string }
  | { type: 'subscribe'; roomId: string }
  | { type: 'unsubscribe'; roomId: string }
  | { type: 'typing'; roomId: string; isTyping: boolean }
  | { type: 'message:send'; envelope: Omit<EncryptedMessageEnvelope, 'id' | 'createdAt' | 'isEdited' | 'isDeleted'> }
  | { type: 'message:edit'; messageId: string; roomId: string; ciphertext: string; nonce: string; keyEnvelopes: Record<string, string>; signature: string }
  | { type: 'message:delete'; messageId: string; roomId: string }
  | { type: 'read_receipt'; messageId: string; roomId: string }
  | { type: 'ping' };

export type ServerWsMessage =
  | { type: 'authenticated'; userId: string; deviceId: string }
  | { type: 'message:new'; message: EncryptedMessageEnvelope }
  | { type: 'message:updated'; message: EncryptedMessageEnvelope }
  | { type: 'message:deleted'; messageId: string; roomId: string }
  | { type: 'typing:status'; roomId: string; userId: string; displayName: string; isTyping: boolean }
  | { type: 'presence:update'; userId: string; status: 'online' | 'offline'; lastSeenAt: number }
  | { type: 'receipt:update'; messageId: string; roomId: string; userId: string; readAt: number }
  | { type: 'device:revoked'; deviceId: string; reason: string }
  | { type: 'pairing:requested'; invitationId: string; deviceId: string; username: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' };
