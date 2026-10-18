import sodium from 'libsodium-wrappers-sumo';
import { DevicePublicKeys, EncryptedMessageEnvelope, DecryptedMessagePayload } from '@privatechat/shared';
import { StoredDeviceKeys } from './keyStore.js';

let sodiumReady = false;

export async function ensureSodium(): Promise<typeof sodium> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
  return sodium;
}

export interface GeneratedKeyBundle {
  identityPublicKey: string;
  identityPrivateKey: string;
  exchangePublicKey: string;
  exchangePrivateKey: string;
  keySignature: string;
}

/**
 * Generate brand-new cryptographically verified long-term device keys
 */
export async function generateDeviceKeys(): Promise<GeneratedKeyBundle> {
  const s = await ensureSodium();

  // 1. Identity Keypair (Ed25519 for signing and safety number verification)
  const idKp = s.crypto_sign_keypair();

  // 2. Exchange Keypair (X25519 for Diffie-Hellman authenticated box)
  const exKp = s.crypto_box_keypair();

  // 3. Cross-signature: identity private key signs exchange public key
  const sig = s.crypto_sign_detached(exKp.publicKey, idKp.privateKey);

  return {
    identityPublicKey: s.to_base64(idKp.publicKey, s.base64_variants.ORIGINAL),
    identityPrivateKey: s.to_base64(idKp.privateKey, s.base64_variants.ORIGINAL),
    exchangePublicKey: s.to_base64(exKp.publicKey, s.base64_variants.ORIGINAL),
    exchangePrivateKey: s.to_base64(exKp.privateKey, s.base64_variants.ORIGINAL),
    keySignature: s.to_base64(sig, s.base64_variants.ORIGINAL),
  };
}

/**
 * Encrypt a message payload for a set of recipient devices (Pairwise Fan-out Envelope)
 */
export async function encryptMessagePayload(
  payload: DecryptedMessagePayload,
  recipientDevices: DevicePublicKeys[],
  myKeys: StoredDeviceKeys
): Promise<{
  ciphertext: string;
  nonce: string;
  keyEnvelopes: Record<string, string>;
  signature: string;
}> {
  const s = await ensureSodium();

  // 1. Generate 32-byte ephemeral message key Km and 24-byte random nonce
  const Km = s.randombytes_buf(32);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);

  // 2. Encrypt plaintext payload with Km
  const plaintextStr = JSON.stringify(payload);
  const ciphertextBytes = s.crypto_secretbox_easy(plaintextStr, nonce, Km);
  const ciphertextBase64 = s.to_base64(ciphertextBytes, s.base64_variants.ORIGINAL);
  const nonceBase64 = s.to_base64(nonce, s.base64_variants.ORIGINAL);

  // 3. Encrypt Km individually for each recipient device's exchange public key
  const myExchangePriv = s.from_base64(myKeys.exchangePrivateKey, s.base64_variants.ORIGINAL);
  const keyEnvelopes: Record<string, string> = {};

  for (const device of recipientDevices) {
    if (device.status !== 'active') continue;
    try {
      const recipientExchangePub = s.from_base64(device.exchangePublicKey, s.base64_variants.ORIGINAL);
      const encryptedKey = s.crypto_box_easy(Km, nonce, recipientExchangePub, myExchangePriv);
      keyEnvelopes[device.id] = s.to_base64(encryptedKey, s.base64_variants.ORIGINAL);
    } catch (err) {
      console.error(`Failed to encrypt envelope for device ${device.id}`, err);
    }
  }

  // Also encrypt for sender's own device so sender can decrypt their message history on their device
  const myExchangePub = s.from_base64(myKeys.exchangePublicKey, s.base64_variants.ORIGINAL);
  const myOwnEncryptedKey = s.crypto_box_easy(Km, nonce, myExchangePub, myExchangePriv);
  keyEnvelopes[myKeys.deviceId] = s.to_base64(myOwnEncryptedKey, s.base64_variants.ORIGINAL);

  // 4. Sign SHA256(ciphertext + JSON(keyEnvelopes)) with identity private key
  const digestPayload = `${ciphertextBase64}:${JSON.stringify(keyEnvelopes)}`;
  const hash = s.crypto_hash_sha256(s.from_string(digestPayload));
  const myIdentityPriv = s.from_base64(myKeys.identityPrivateKey, s.base64_variants.ORIGINAL);
  const signatureBytes = s.crypto_sign_detached(hash, myIdentityPriv);
  const signatureBase64 = s.to_base64(signatureBytes, s.base64_variants.ORIGINAL);

  return {
    ciphertext: ciphertextBase64,
    nonce: nonceBase64,
    keyEnvelopes,
    signature: signatureBase64,
  };
}

/**
 * Decrypt an incoming message envelope
 */
export async function decryptMessageEnvelope(
  envelope: EncryptedMessageEnvelope,
  senderDevice: DevicePublicKeys,
  myKeys: StoredDeviceKeys
): Promise<DecryptedMessagePayload> {
  const s = await ensureSodium();

  // 1. Verify sender's signature over the envelope
  const digestPayload = `${envelope.ciphertext}:${JSON.stringify(envelope.keyEnvelopes)}`;
  const hash = s.crypto_hash_sha256(s.from_string(digestPayload));
  const senderIdentityPub = s.from_base64(senderDevice.identityPublicKey, s.base64_variants.ORIGINAL);
  const signatureBytes = s.from_base64(envelope.signature, s.base64_variants.ORIGINAL);

  const isValidSignature = s.crypto_sign_verify_detached(signatureBytes, hash, senderIdentityPub);
  if (!isValidSignature) {
    throw new Error('Integrity verification failed: Message signature is invalid or sender public key does not match.');
  }

  // 2. Find key envelope for my device
  const encryptedKeyBase64 = envelope.keyEnvelopes[myKeys.deviceId];
  if (!encryptedKeyBase64) {
    throw new Error('This device was not an authorized recipient of this message when it was sent.');
  }

  // 3. Decrypt Km using my device's exchange private key and sender's exchange public key
  const encryptedKey = s.from_base64(encryptedKeyBase64, s.base64_variants.ORIGINAL);
  const nonce = s.from_base64(envelope.nonce, s.base64_variants.ORIGINAL);
  const senderExchangePub = s.from_base64(senderDevice.exchangePublicKey, s.base64_variants.ORIGINAL);
  const myExchangePriv = s.from_base64(myKeys.exchangePrivateKey, s.base64_variants.ORIGINAL);

  let Km: Uint8Array;
  try {
    Km = s.crypto_box_open_easy(encryptedKey, nonce, senderExchangePub, myExchangePriv);
  } catch {
    throw new Error('Failed to decrypt message key: unauthorized or invalid exchange keys.');
  }

  // 4. Decrypt message ciphertext using decrypted Km
  const ciphertext = s.from_base64(envelope.ciphertext, s.base64_variants.ORIGINAL);
  let decryptedBytes: Uint8Array;
  try {
    decryptedBytes = s.crypto_secretbox_open_easy(ciphertext, nonce, Km);
  } catch {
    throw new Error('Failed to decrypt ciphertext: ciphertext corrupted or tampered with.');
  }

  const jsonStr = s.to_string(decryptedBytes);
  return JSON.parse(jsonStr) as DecryptedMessagePayload;
}
