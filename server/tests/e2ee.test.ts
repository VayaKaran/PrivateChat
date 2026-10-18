import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';

describe('End-to-End Encryption Primitives (libsodium)', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  it('generates valid Ed25519 identity keypair and X25519 exchange keypair', () => {
    const identityKeypair = sodium.crypto_sign_keypair();
    const exchangeKeypair = sodium.crypto_box_keypair();

    expect(identityKeypair.publicKey.length).toBe(32);
    expect(identityKeypair.privateKey.length).toBe(64);
    expect(exchangeKeypair.publicKey.length).toBe(32);
    expect(exchangeKeypair.privateKey.length).toBe(32);
  });

  it('signs and verifies exchange public key with identity private key', () => {
    const identityKeypair = sodium.crypto_sign_keypair();
    const exchangeKeypair = sodium.crypto_box_keypair();

    const signature = sodium.crypto_sign_detached(
      exchangeKeypair.publicKey,
      identityKeypair.privateKey
    );

    const isValid = sodium.crypto_sign_verify_detached(
      signature,
      exchangeKeypair.publicKey,
      identityKeypair.publicKey
    );

    expect(isValid).toBe(true);

    // Tampered exchange key should fail
    const tamperedKey = new Uint8Array(exchangeKeypair.publicKey);
    tamperedKey[0] ^= 0xff;
    const isTamperedValid = sodium.crypto_sign_verify_detached(
      signature,
      tamperedKey,
      identityKeypair.publicKey
    );
    expect(isTamperedValid).toBe(false);
  });

  it('performs pairwise message envelope encryption and decryption', () => {
    // Alice and Bob
    const aliceSign = sodium.crypto_sign_keypair();
    const aliceBox = sodium.crypto_box_keypair();

    const bobSign = sodium.crypto_sign_keypair();
    const bobBox = sodium.crypto_box_keypair();

    const plaintext = JSON.stringify({
      text: 'Confidential message: meet at 21:00 UTC.',
      timestamp: Date.now(),
    });

    // 1. Sender (Alice) generates random symmetric key Km (32 bytes) and nonce (24 bytes)
    const Km = sodium.randombytes_buf(32);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

    // 2. Encrypt plaintext payload with Km
    const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, Km);

    // 3. Encrypt Km for Bob using Bob's exchange public key and Alice's exchange private key
    const encryptedKeyForBob = sodium.crypto_box_easy(
      Km,
      nonce,
      bobBox.publicKey,
      aliceBox.privateKey
    );

    // 4. Bob receives envelope and decrypts Km
    const decryptedKm = sodium.crypto_box_open_easy(
      encryptedKeyForBob,
      nonce,
      aliceBox.publicKey,
      bobBox.privateKey
    );

    expect(decryptedKm).toEqual(Km);

    // 5. Bob decrypts message ciphertext with decrypted Km
    const decryptedPlaintextBytes = sodium.crypto_secretbox_open_easy(
      ciphertext,
      nonce,
      decryptedKm
    );
    const decryptedText = sodium.to_string(decryptedPlaintextBytes);

    expect(decryptedText).toBe(plaintext);
  });

  it('fails decryption if ciphertext or key envelope is tampered with', () => {
    const aliceBox = sodium.crypto_box_keypair();
    const bobBox = sodium.crypto_box_keypair();

    const Km = sodium.randombytes_buf(32);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

    const ciphertext = sodium.crypto_secretbox_easy('Hello world', nonce, Km);
    const encryptedKeyForBob = sodium.crypto_box_easy(
      Km,
      nonce,
      bobBox.publicKey,
      aliceBox.privateKey
    );

    // Tamper with key envelope
    const tamperedKey = new Uint8Array(encryptedKeyForBob);
    tamperedKey[5] ^= 0x55;

    expect(() => {
      sodium.crypto_box_open_easy(tamperedKey, nonce, aliceBox.publicKey, bobBox.privateKey);
    }).toThrow();

    // Tamper with ciphertext
    const tamperedCiphertext = new Uint8Array(ciphertext);
    tamperedCiphertext[2] ^= 0xaa;

    expect(() => {
      sodium.crypto_secretbox_open_easy(tamperedCiphertext, nonce, Km);
    }).toThrow();
  });

  it('computes 60-digit deterministic safety numbers between two contacts', () => {
    const aliceSign = sodium.crypto_sign_keypair();
    const bobSign = sodium.crypto_sign_keypair();

    // Deterministic ordering of public keys
    const pubA = sodium.to_hex(aliceSign.publicKey);
    const pubB = sodium.to_hex(bobSign.publicKey);

    const sorted = [pubA, pubB].sort();
    const hash = sodium.crypto_generichash(64, sodium.from_string(sorted.join('')));

    // Format into 12 chunks of 5 digits
    let digits = '';
    for (let i = 0; i < hash.length && digits.length < 60; i += 2) {
      const num = ((hash[i] << 8) | hash[i + 1]) % 100000;
      digits += num.toString().padStart(5, '0');
    }
    const safetyNumber = digits.slice(0, 60);

    expect(safetyNumber.length).toBe(60);
    expect(/^\d+$/.test(safetyNumber)).toBe(true);

    // Bob calculating safety number with Alice must yield the EXACT same string
    const bobSorted = [pubB, pubA].sort();
    const bobHash = sodium.crypto_generichash(64, sodium.from_string(bobSorted.join('')));
    let bobDigits = '';
    for (let i = 0; i < bobHash.length && bobDigits.length < 60; i += 2) {
      const num = ((bobHash[i] << 8) | bobHash[i + 1]) % 100000;
      bobDigits += num.toString().padStart(5, '0');
    }
    expect(bobDigits.slice(0, 60)).toBe(safetyNumber);
  });
});
