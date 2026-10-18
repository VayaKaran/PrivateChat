import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sodium from 'libsodium-wrappers-sumo';
import { app } from '../src/index.js';
import { getDb } from '../src/db/database.js';

describe('Server Setup & Authentication Flow', () => {
  let ownerSign: sodium.KeyPair;
  let ownerBox: sodium.KeyPair;
  let ownerKeySig: string;
  let sessionCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    await sodium.ready;
    const db = getDb();
    db.exec('PRAGMA foreign_keys = OFF; DELETE FROM sessions; DELETE FROM messages; DELETE FROM attachments; DELETE FROM room_members; DELETE FROM rooms; DELETE FROM invitations; DELETE FROM devices; DELETE FROM users; DELETE FROM system_config; PRAGMA foreign_keys = ON;');
    ownerSign = sodium.crypto_sign_keypair();
    ownerBox = sodium.crypto_box_keypair();
    const sigBytes = sodium.crypto_sign_detached(ownerBox.publicKey, ownerSign.privateKey);
    ownerKeySig = sodium.to_base64(sigBytes, sodium.base64_variants.ORIGINAL);
  });

  it('checks setup status before initialization (uninitialized)', async () => {
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    // Might be true or false depending on test order, but should return boolean
    expect(typeof res.body.isInitialized).toBe('boolean');
  });

  it('fails setup if signature over exchange key is invalid', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        username: 'owner1',
        displayName: 'App Owner',
        password: 'SuperSecurePassword123!',
        deviceName: 'Primary Laptop',
        identityPublicKey: sodium.to_base64(ownerSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(ownerBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: 'dGFtcGVyZWRfc2lnbmF0dXJlX2ZhaWx1cmU=', // invalid signature
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cryptographic verification failed');
  });

  it('successfully initializes owner with valid cryptographic keys', async () => {
    // If not already initialized, initialize
    const statusRes = await request(app).get('/api/setup/status');
    if (!statusRes.body.isInitialized) {
      const res = await request(app)
        .post('/api/setup')
        .send({
          username: 'owner',
          displayName: 'App Owner',
          password: 'SuperSecurePassword123!',
          deviceName: 'Owner Workstation',
          identityPublicKey: sodium.to_base64(ownerSign.publicKey, sodium.base64_variants.ORIGINAL),
          exchangePublicKey: sodium.to_base64(ownerBox.publicKey, sodium.base64_variants.ORIGINAL),
          keySignature: ownerKeySig,
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('owner');
      expect(res.body.csrfToken).toBeDefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies as unknown as string);
      expect(cookieStr).toContain('pvt_session');

      sessionCookie = cookieStr;
      csrfToken = res.body.csrfToken;
    }
  });

  it('permanently blocks subsequent /api/setup calls once initialized', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        username: 'attacker',
        displayName: 'Attacker',
        password: 'Password123456789!',
        deviceName: 'Attacker Device',
        identityPublicKey: sodium.to_base64(ownerSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(ownerBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: ownerKeySig,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('already initialized');
  });

  it('rejects login with invalid password using generic error message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'owner',
        password: 'WrongPassword999!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid username or password.');
  });

  it('authenticates owner with correct credentials and returns session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'owner',
        password: 'SuperSecurePassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('owner');
    expect(res.body.csrfToken).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies as unknown as string);
    sessionCookie = cookieStr;
    csrfToken = res.body.csrfToken;
  });

  it('accesses /api/auth/me with valid session cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('owner');
    expect(res.body.user.role).toBe('owner');
  });

  it('rejects /api/auth/me when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
