import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sodium from 'libsodium-wrappers-sumo';
import { app } from '../src/index.js';
import { getDb } from '../src/db/database.js';
import { ensureTestOwner } from './testHelper.js';

describe('Invitation Management and Atomic Redemption', () => {
  let sessionCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    await sodium.ready;
    const ownerSession = await ensureTestOwner();
    sessionCookie = ownerSession.cookie;
    csrfToken = ownerSession.csrfToken;
  });

  it('allows owner to generate a single-use invitation', async () => {
    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        recipientLabel: 'Alice',
        ttlHours: 24,
        maxUses: 1,
        requiresApproval: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.invitation.code).toMatch(/^PVT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.secret).toBeDefined();

    // Verify secret is NOT stored plaintext in the database
    const db = getDb();
    const row = db.prepare('SELECT secret_hash FROM invitations WHERE id = ?').get(res.body.invitation.id) as any;
    expect(row.secret_hash).not.toBe(res.body.secret);
  });

  it('rejects invitation creation without valid CSRF token', async () => {
    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', 'invalid-csrf-token')
      .send({
        recipientLabel: 'Unauthorized Attempt',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CSRF');
  });

  it('validates an active invitation code via /api/invitations/validate', async () => {
    // Create invitation
    const createRes = await request(app)
      .post('/api/invitations')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ recipientLabel: 'Bob', maxUses: 1 });

    const code = createRes.body.invitation.code;
    const res = await request(app)
      .post('/api/invitations/validate')
      .send({ secretOrCode: code });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.recipientLabel).toBe('Bob');
  });

  it('successfully redeems single-use invitation and registers new member device', async () => {
    // 1. Create invitation
    const createRes = await request(app)
      .post('/api/invitations')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ recipientLabel: 'Charlie', maxUses: 1 });

    const secret = createRes.body.secret;

    // 2. Charlie generates keys
    const charlieSign = sodium.crypto_sign_keypair();
    const charlieBox = sodium.crypto_box_keypair();
    const sig = sodium.crypto_sign_detached(charlieBox.publicKey, charlieSign.privateKey);

    const charlieUsername = `charlie_${Date.now()}`;
    // 3. Charlie redeems invitation
    const redeemRes = await request(app)
      .post('/api/invitations/redeem')
      .send({
        secretOrCode: secret,
        username: charlieUsername,
        displayName: 'Charlie Brown',
        password: 'CharlieSecurePassword123!',
        deviceName: 'Charlie Phone',
        identityPublicKey: sodium.to_base64(charlieSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(charlieBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(sig, sodium.base64_variants.ORIGINAL),
      });

    expect(redeemRes.status).toBe(201);
    expect(redeemRes.body.user.username).toBe(charlieUsername);
    expect(redeemRes.body.device.status).toBe('active');
    expect(redeemRes.headers['set-cookie']).toBeDefined();

    // 4. Second redemption of same single-use invitation MUST fail
    const replayRes = await request(app)
      .post('/api/invitations/redeem')
      .send({
        secretOrCode: secret,
        username: 'attacker',
        displayName: 'Attacker',
        password: 'Password123456789!',
        deviceName: 'Attacker Device',
        identityPublicKey: sodium.to_base64(charlieSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(charlieBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(sig, sodium.base64_variants.ORIGINAL),
      });

    expect(replayRes.status).toBe(400);
    expect(replayRes.body.error).toContain('consumed');
  });

  it('rejects redemption of a revoked invitation', async () => {
    const createRes = await request(app)
      .post('/api/invitations')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ recipientLabel: 'ToRevoke', maxUses: 1 });

    const invId = createRes.body.invitation.id;
    const secret = createRes.body.secret;

    // Revoke
    const revokeRes = await request(app)
      .delete(`/api/invitations/${invId}`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(revokeRes.status).toBe(200);

    // Attempt redemption
    const kSign = sodium.crypto_sign_keypair();
    const kBox = sodium.crypto_box_keypair();
    const sig = sodium.crypto_sign_detached(kBox.publicKey, kSign.privateKey);

    const redeemRes = await request(app)
      .post('/api/invitations/redeem')
      .send({
        secretOrCode: secret,
        username: 'denied_user',
        displayName: 'Denied',
        password: 'Password123456789!',
        deviceName: 'Denied Device',
        identityPublicKey: sodium.to_base64(kSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(kBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(sig, sodium.base64_variants.ORIGINAL),
      });

    expect(redeemRes.status).toBe(400);
  });
});
