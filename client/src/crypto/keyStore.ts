// Secure IndexedDB-backed Client Key Store with AES-GCM encryption

const DB_NAME = 'PrivateChatKeyVault';
const STORE_NAME = 'device_keys';
const DB_VERSION = 1;

export interface StoredDeviceKeys {
  deviceId: string;
  userId: string;
  identityPublicKey: string; // base64
  identityPrivateKey: string; // base64
  exchangePublicKey: string; // base64
  exchangePrivateKey: string; // base64
  keySignature: string; // base64
  createdAt: number;
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Derive AES-GCM key from user password using PBKDF2 (100,000 iterations)
async function deriveStorageKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function saveDeviceKeys(keys: StoredDeviceKeys, passphrase: string): Promise<void> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await deriveStorageKey(passphrase, salt);

  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(keys));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext
  );

  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      id: 'current_device',
      salt: Array.from(salt),
      iv: Array.from(iv),
      encryptedData: Array.from(new Uint8Array(ciphertext)),
      updatedAt: Date.now(),
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadDeviceKeys(passphrase: string): Promise<StoredDeviceKeys | null> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get('current_device');

    req.onsuccess = async () => {
      const record = req.result;
      if (!record) return resolve(null);

      try {
        const salt = new Uint8Array(record.salt);
        const iv = new Uint8Array(record.iv);
        const ciphertext = new Uint8Array(record.encryptedData);

        const cryptoKey = await deriveStorageKey(passphrase, salt);
        const decrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          ciphertext
        );

        const dec = new TextDecoder();
        const keys: StoredDeviceKeys = JSON.parse(dec.decode(decrypted));
        resolve(keys);
      } catch (err) {
        // Decryption failed (e.g. incorrect passphrase)
        reject(new Error('Invalid key passphrase or corrupted key vault.'));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function hasStoredKeys(): Promise<boolean> {
  try {
    const db = await openVault();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function clearStoredKeys(): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
