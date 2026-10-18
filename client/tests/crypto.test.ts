// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateDeviceKeys, encryptMessagePayload, decryptMessageEnvelope, ensureSodium } from '../src/crypto/e2ee.js';
import { computeSafetyNumber } from '../src/crypto/safetyNumbers.js';
import { DevicePublicKeys, EncryptedMessageEnvelope } from '@privatechat/shared';

describe('Client E2EE Cryptographic Operations', () => {
  it('generates valid client-side keypairs and authenticates exchange key with self-signature', async () => {
    const s = await ensureSodium();
    const bundle = await generateDeviceKeys();

    expect(bundle.identityPublicKey).toBeTruthy();
    expect(bundle.identityPrivateKey).toBeTruthy();
    expect(bundle.exchangePublicKey).toBeTruthy();
    expect(bundle.exchangePrivateKey).toBeTruthy();
    expect(bundle.keySignature).toBeTruthy();

    // Verify signature with sodium
    const isValid = s.crypto_sign_verify_detached(
      s.from_base64(bundle.keySignature, s.base64_variants.ORIGINAL),
      s.from_base64(bundle.exchangePublicKey, s.base64_variants.ORIGINAL),
      s.from_base64(bundle.identityPublicKey, s.base64_variants.ORIGINAL)
    );
    expect(isValid).toBe(true);
  });

  it('performs pairwise message encryption and decryption between two distinct devices', async () => {
    // Device A (Alice)
    const aliceKeys = await generateDeviceKeys();
    const aliceStored = {
      ...aliceKeys,
      deviceId: 'dev_alice_1',
      userId: 'user_alice',
      createdAt: Date.now(),
    };
    const alicePublic: DevicePublicKeys = {
      id: 'dev_alice_1',
      userId: 'user_alice',
      deviceName: "Alice's Laptop",
      identityPublicKey: aliceKeys.identityPublicKey,
      exchangePublicKey: aliceKeys.exchangePublicKey,
      keySignature: aliceKeys.keySignature,
      status: 'active',
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    };

    // Device B (Bob)
    const bobKeys = await generateDeviceKeys();
    const bobStored = {
      ...bobKeys,
      deviceId: 'dev_bob_1',
      userId: 'user_bob',
      createdAt: Date.now(),
    };
    const bobPublic: DevicePublicKeys = {
      id: 'dev_bob_1',
      userId: 'user_bob',
      deviceName: "Bob's Phone",
      identityPublicKey: bobKeys.identityPublicKey,
      exchangePublicKey: bobKeys.exchangePublicKey,
      keySignature: bobKeys.keySignature,
      status: 'active',
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    };

    // Alice encrypts for [Alice, Bob]
    const secretText = 'Hello Bob, this message is genuine E2EE!';
    const encrypted = await encryptMessagePayload(
      { text: secretText, timestamp: Date.now() },
      [alicePublic, bobPublic],
      aliceStored
    );

    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.keyEnvelopes['dev_alice_1']).toBeTruthy();
    expect(encrypted.keyEnvelopes['dev_bob_1']).toBeTruthy();

    const envelope: EncryptedMessageEnvelope = {
      id: 'msg_test_1',
      roomId: 'room_1',
      senderUserId: 'user_alice',
      senderDeviceId: 'dev_alice_1',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyEnvelopes: encrypted.keyEnvelopes,
      signature: encrypted.signature,
      isEdited: false,
      isDeleted: false,
      createdAt: Date.now(),
    };

    // Bob decrypts
    const bobDecrypted = await decryptMessageEnvelope(envelope, alicePublic, bobStored);
    expect(bobDecrypted.text).toBe(secretText);

    // Alice also can decrypt from her own device
    const aliceDecrypted = await decryptMessageEnvelope(envelope, alicePublic, aliceStored);
    expect(aliceDecrypted.text).toBe(secretText);
  });

  it('rejects tampered message ciphertext with cryptographic integrity failure', async () => {
    const aliceKeys = await generateDeviceKeys();
    const aliceStored = {
      ...aliceKeys,
      deviceId: 'dev_alice_1',
      userId: 'user_alice',
      createdAt: Date.now(),
    };
    const alicePublic: DevicePublicKeys = {
      id: 'dev_alice_1',
      userId: 'user_alice',
      deviceName: "Alice's Laptop",
      identityPublicKey: aliceKeys.identityPublicKey,
      exchangePublicKey: aliceKeys.exchangePublicKey,
      keySignature: aliceKeys.keySignature,
      status: 'active',
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    };

    const bobKeys = await generateDeviceKeys();
    const bobStored = {
      ...bobKeys,
      deviceId: 'dev_bob_1',
      userId: 'user_bob',
      createdAt: Date.now(),
    };
    const bobPublic: DevicePublicKeys = {
      id: 'dev_bob_1',
      userId: 'user_bob',
      deviceName: "Bob's Phone",
      identityPublicKey: bobKeys.identityPublicKey,
      exchangePublicKey: bobKeys.exchangePublicKey,
      keySignature: bobKeys.keySignature,
      status: 'active',
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    };

    const encrypted = await encryptMessagePayload(
      { text: 'Top secret data', timestamp: Date.now() },
      [alicePublic, bobPublic],
      aliceStored
    );

    // Tamper with ciphertext
    const tamperedCiphertext = Buffer.from('TAMPERED_CIPHERTEXT').toString('base64');
    const envelope: EncryptedMessageEnvelope = {
      id: 'msg_tampered',
      roomId: 'room_1',
      senderUserId: 'user_alice',
      senderDeviceId: 'dev_alice_1',
      ciphertext: tamperedCiphertext,
      nonce: encrypted.nonce,
      keyEnvelopes: encrypted.keyEnvelopes,
      signature: encrypted.signature,
      isEdited: false,
      isDeleted: false,
      createdAt: Date.now(),
    };

    // Bob attempts to decrypt tampered envelope -> signature or decryption should fail
    await expect(decryptMessageEnvelope(envelope, alicePublic, bobStored)).rejects.toThrow();
  });

  it('computes deterministic 60-digit safety numbers regardless of calculation order', async () => {
    const aliceKeys = await generateDeviceKeys();
    const bobKeys = await generateDeviceKeys();

    const aliceCalc = await computeSafetyNumber(aliceKeys.identityPublicKey, bobKeys.identityPublicKey);
    const bobCalc = await computeSafetyNumber(bobKeys.identityPublicKey, aliceKeys.identityPublicKey);

    expect(aliceCalc.numericFormat).toBe(bobCalc.numericFormat);
    expect(aliceCalc.fingerprintHex).toBe(bobCalc.fingerprintHex);
    expect(aliceCalc.numericFormat.replace(/\s+/g, '').length).toBe(60);
    expect(aliceCalc.fingerprintHex.replace(/\s+/g, '').length).toBe(32);
  });
});
