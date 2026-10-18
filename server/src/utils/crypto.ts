import crypto from 'crypto';
import * as hashWasm from 'hash-wasm';
import sodium from 'libsodium-wrappers-sumo';

let sodiumInitialized = false;

export async function ensureSodium(): Promise<typeof sodium> {
  if (!sodiumInitialized) {
    await sodium.ready;
    sodiumInitialized = true;
  }
  return sodium;
}

/**
 * Hash password with Argon2id using OWASP parameters:
 * memory: 64 MiB (65536 KiB), iterations: 3, parallelism: 1
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return await hashWasm.argon2id({
    password,
    salt,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    parallelism: 1,
    outputType: 'encoded',
  });
}

/**
 * Verify password against an Argon2id encoded string
 */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    return await hashWasm.argon2Verify({
      password,
      hash: encodedHash,
    });
  } catch {
    return false;
  }
}

/**
 * Hash arbitrary token or invitation secret using SHA-256
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Constant-time comparison between two hex or base64 strings to prevent timing attacks
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate a high-entropy 256-bit cryptographically secure invitation secret
 */
export function generateInvitationSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a human-readable pairing code: PVT-XXXX-XXXX
 */
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 excluding easily confused characters (0, O, 1, I)
  const bytes = crypto.randomBytes(8);
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars[bytes[i] % chars.length];
    p2 += chars[(i + 4)] ? chars[bytes[i + 4] % chars.length] : 'X';
  }
  return `PVT-${p1}-${p2}`;
}

/**
 * Generate a random session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Verify that a device's identity public key actually signed its exchange public key
 */
export async function verifyDeviceKeySignature(
  identityPublicKeyBase64: string,
  exchangePublicKeyBase64: string,
  keySignatureBase64: string
): Promise<boolean> {
  const s = await ensureSodium();
  try {
    const identityPub = s.from_base64(identityPublicKeyBase64, s.base64_variants.ORIGINAL);
    const exchangePub = s.from_base64(exchangePublicKeyBase64, s.base64_variants.ORIGINAL);
    const sig = s.from_base64(keySignatureBase64, s.base64_variants.ORIGINAL);

    return s.crypto_sign_verify_detached(sig, exchangePub, identityPub);
  } catch {
    return false;
  }
}
