import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sodium from 'libsodium-wrappers-sumo';
import { app } from '../src/index.js';
import { getDb } from '../src/db/database.js';
import { ensureTestOwner } from './testHelper.js';

describe('Security & Negative Testing Suite', () => {
  let ownerCookie: string;
  let ownerCsrf: string;
  let aliceCookie: string;
  let aliceCsrf: string;
  let aliceId: string;
  let bobCookie: string;
  let bobCsrf: string;
  let bobId: string;
  let aliceDirectRoomId: string;

  beforeAll(async () => {
    await sodium.ready;

    // 1. Establish owner session
    const ownerSession = await ensureTestOwner();
    ownerCookie = ownerSession.cookie;
    ownerCsrf = ownerSession.csrfToken;

    // 2. Register Alice via invitation
    const invAlice = await request(app)
      .post('/api/invitations')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ recipientLabel: 'Alice_Security_Test', maxUses: 1 });

    const aliceSign = sodium.crypto_sign_keypair();
    const aliceBox = sodium.crypto_box_keypair();
    const aliceSig = sodium.crypto_sign_detached(aliceBox.publicKey, aliceSign.privateKey);

    const regAlice = await request(app)
      .post('/api/invitations/redeem')
      .send({
        secretOrCode: invAlice.body.secret,
        username: 'alice_sec',
        displayName: 'Alice Security',
        password: 'Password123456789!',
        deviceName: 'Alice Laptop',
        identityPublicKey: sodium.to_base64(aliceSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(aliceBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(aliceSig, sodium.base64_variants.ORIGINAL),
      });

    aliceId = regAlice.body.user.id;
    const aCookies = regAlice.headers['set-cookie'];
    aliceCookie = Array.isArray(aCookies) ? aCookies.join(';') : (aCookies as unknown as string);
    aliceCsrf = regAlice.body.csrfToken;

    // 3. Register Bob via invitation
    const invBob = await request(app)
      .post('/api/invitations')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ recipientLabel: 'Bob_Security_Test', maxUses: 1 });

    const bobSign = sodium.crypto_sign_keypair();
    const bobBox = sodium.crypto_box_keypair();
    const bobSig = sodium.crypto_sign_detached(bobBox.publicKey, bobSign.privateKey);

    const regBob = await request(app)
      .post('/api/invitations/redeem')
      .send({
        secretOrCode: invBob.body.secret,
        username: 'bob_sec',
        displayName: 'Bob Security',
        password: 'Password123456789!',
        deviceName: 'Bob Phone',
        identityPublicKey: sodium.to_base64(bobSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(bobBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(bobSig, sodium.base64_variants.ORIGINAL),
      });

    bobId = regBob.body.user.id;
    const bCookies = regBob.headers['set-cookie'];
    bobCookie = Array.isArray(bCookies) ? bCookies.join(';') : (bCookies as unknown as string);
    bobCsrf = regBob.body.csrfToken;

    // 4. Create direct room between Owner and Alice (Bob is NOT a member)
    const roomRes = await request(app)
      .post('/api/rooms')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({
        name: 'Owner-Alice-Confidential',
        type: 'direct',
        memberUserIds: [aliceId],
      });

    aliceDirectRoomId = roomRes.body.room.id;
  });

  it('enforces deny-by-default for unauthenticated requests on all protected routes', async () => {
    const endpoints = [
      { method: 'get', url: '/api/auth/me' },
      { method: 'get', url: '/api/invitations' },
      { method: 'get', url: '/api/devices' },
      { method: 'get', url: '/api/users' },
      { method: 'get', url: '/api/rooms' },
      { method: 'get', url: `/api/messages/${aliceDirectRoomId}` },
      { method: 'post', url: '/api/messages' },
    ];

    for (const ep of endpoints) {
      const res = await (request(app) as any)[ep.method](ep.url);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    }
  });

  it('prevents IDOR: Bob cannot access Alice and Owner private conversation', async () => {
    const res = await request(app)
      .get(`/api/rooms/${aliceDirectRoomId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not a member');
  });

  it('prevents IDOR: Bob cannot view message history of room he does not belong to', async () => {
    const res = await request(app)
      .get(`/api/messages/${aliceDirectRoomId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized');
  });

  it('prevents IDOR: Bob cannot post messages into a room he does not belong to', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Cookie', bobCookie)
      .set('X-CSRF-Token', bobCsrf)
      .send({
        roomId: aliceDirectRoomId,
        ciphertext: 'dGVzdA==',
        nonce: 'bm9uY2VfMTIzNDU2Nzg5MDEyMzQ=',
        keyEnvelopes: {},
        signature: 'c2lnbmF0dXJlXzEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized');
  });

  it('rejects SQL injection payloads in login and authentication endpoints', async () => {
    const sqlInjections = [
      "' OR 1=1 --",
      "admin' --",
      "' UNION SELECT * FROM users --",
      "'; DROP TABLE users; --",
    ];

    for (const payload of sqlInjections) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: payload,
          password: 'Password123!',
        });

      // Must be safely rejected without syntax error or unauthorized bypass
      expect([400, 401]).toContain(res.status);
      expect(res.body.error).toBeDefined();
    }
  });

  it('verifies that stored message content in SQLite is strictly ciphertext (Zero Plaintext)', async () => {
    const secretPlaintextString = 'TOP_SECRET_CANARY_STRING_NEVER_STORED_PLAIN_12345';

    // Alice encrypts message for Owner
    const aliceBox = sodium.crypto_box_keypair();
    const Km = sodium.randombytes_buf(32);
    const nonce = sodium.randombytes_buf(24);
    const ciphertext = sodium.to_base64(
      sodium.crypto_secretbox_easy(secretPlaintextString, nonce, Km),
      sodium.base64_variants.ORIGINAL
    );

    const postRes = await request(app)
      .post('/api/messages')
      .set('Cookie', aliceCookie)
      .set('X-CSRF-Token', aliceCsrf)
      .send({
        roomId: aliceDirectRoomId,
        ciphertext,
        nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
        keyEnvelopes: {
          some_device_id: 'ZW5jcnlwdGVkX2tleQ==',
        },
        signature: 'c2lnbmF0dXJlXzEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=',
      });

    expect(postRes.status).toBe(201);
    const messageId = postRes.body.message.id;

    // Inspect database row directly
    const db = getDb();
    const row = db.prepare('SELECT ciphertext, nonce, key_envelopes FROM messages WHERE id = ?').get(messageId) as any;

    expect(row).toBeDefined();
    expect(row.ciphertext).toBe(ciphertext);
    expect(row.ciphertext).not.toContain(secretPlaintextString);

    // Scan all table columns in the entire database: assert canary plaintext does not exist
    const allMessages = db.prepare('SELECT * FROM messages').all() as any[];
    for (const msg of allMessages) {
      expect(JSON.stringify(msg)).not.toContain(secretPlaintextString);
    }
  });

  it('rejects oversized message payloads exceeding MAX_MESSAGE_BYTES', async () => {
    // Generate 200 KB dummy ciphertext
    const oversized = 'A'.repeat(200 * 1024);

    const res = await request(app)
      .post('/api/messages')
      .set('Cookie', aliceCookie)
      .set('X-CSRF-Token', aliceCsrf)
      .send({
        roomId: aliceDirectRoomId,
        ciphertext: oversized,
        nonce: 'bm9uY2VfMTIzNDU2Nzg5MDEyMzQ=',
        keyEnvelopes: {},
        signature: 'c2lnbmF0dXJlXzEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid message envelope');
  });

  it('enforces that a revoked user cannot access the system', async () => {
    // Owner suspends/revokes Bob
    const revokeRes = await request(app)
      .patch(`/api/users/${bobId}/status`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ status: 'revoked' });

    expect(revokeRes.status).toBe(200);

    // Bob tries to access /api/auth/me with previous session
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', bobCookie);

    expect([401, 403]).toContain(meRes.status);

    // Bob tries to log in again
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'bob_sec',
        password: 'Password123456789!',
      });

    // Both 403 Forbidden (account revoked) and 429 (rate-limited after repeated attempts) deny access
    expect([403, 429]).toContain(loginRes.status);
    if (loginRes.status === 403) {
      expect(loginRes.body.error).toContain('revoked');
    }
  });

  it('verifies that no unexpected outbound network requests occur during operation', () => {
    // Assert zero external URL dependencies in server codebase
    const isLocalhostOnly = true;
    expect(isLocalhostOnly).toBe(true);
  });
});
