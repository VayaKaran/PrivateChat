import request from 'supertest';
import sodium from 'libsodium-wrappers-sumo';
import { app } from '../src/index.js';
import { getDb } from '../src/db/database.js';

export interface TestOwnerSession {
  cookie: string;
  csrfToken: string;
  userId: string;
  deviceId: string;
}

export async function ensureTestOwner(): Promise<TestOwnerSession> {
  await sodium.ready;
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;

  if (row?.value !== 'true') {
    const ownerSign = sodium.crypto_sign_keypair();
    const ownerBox = sodium.crypto_box_keypair();
    const sig = sodium.crypto_sign_detached(ownerBox.publicKey, ownerSign.privateKey);

    const res = await request(app)
      .post('/api/setup')
      .send({
        username: 'owner',
        displayName: 'App Owner',
        password: 'SuperSecurePassword123!',
        deviceName: 'Owner Workstation',
        identityPublicKey: sodium.to_base64(ownerSign.publicKey, sodium.base64_variants.ORIGINAL),
        exchangePublicKey: sodium.to_base64(ownerBox.publicKey, sodium.base64_variants.ORIGINAL),
        keySignature: sodium.to_base64(sig, sodium.base64_variants.ORIGINAL),
      });

    const cookies = res.headers['set-cookie'];
    const cookie = Array.isArray(cookies) ? cookies.join(';') : (cookies as unknown as string);

    return {
      cookie,
      csrfToken: res.body.csrfToken,
      userId: res.body.user.id,
      deviceId: res.body.device.id,
    };
  }

  // Already initialized, log in
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'owner',
      password: 'SuperSecurePassword123!',
    });

  const cookies = loginRes.headers['set-cookie'];
  const cookie = Array.isArray(cookies) ? cookies.join(';') : (cookies as unknown as string);

  return {
    cookie,
    csrfToken: loginRes.body.csrfToken,
    userId: loginRes.body.user.id,
    deviceId: loginRes.body.device.id,
  };
}
