# PrivateChat Security & Cryptographic Architecture

## 1. Cryptographic Primitive Selection

PrivateChat exclusively employs audited, established cryptographic primitives via **`libsodium`** (and `libsodium-wrappers-sumo` for pure WASM/ASM browser compatibility):

| Function | Algorithm / Primitive | Library Implementation | Notes |
| :--- | :--- | :--- | :--- |
| **Long-Term Device Identity** | Ed25519 (256-bit Edwards-curve DSA) | `crypto_sign_keypair` / `crypto_sign_detached` | Signs messages, authenticates device exchange keys. |
| **Pairwise Key Encapsulation** | X25519 (Montgomery curve Curve25519) | `crypto_box_keypair` / `crypto_box_easy` | Authenticated Diffie-Hellman key exchange per recipient. |
| **Message Payload Encryption** | XChaCha20-Poly1305 / XSalsa20-Poly1305 AEAD | `crypto_secretbox_easy` | 24-byte random nonce, 256-bit symmetric per-message key $K_m$. |
| **Password Hashing** | Argon2id ($m=65536, t=3, p=4$) | `hash-wasm` (pure WebAssembly) | OWASP-compliant, memory-hard resistance to GPU/ASIC cracking. |
| **Client Key Vault Protection** | AES-GCM (256-bit) via PBKDF2-SHA256 | Web Cryptography API (`window.crypto.subtle`) | Encrypts private keys in IndexedDB with 100,000 PBKDF2 rounds. |
| **Safety Number Generation** | SHA-512 Generic Hash (64 bytes) | `crypto_generichash` | Formatted as 60 decimal digits (12 groups of 5) and 32 hex chars. |
| **Token Hashing** | SHA-256 | Node.js `node:crypto` | High-entropy session tokens and invitation secrets stored only as hashes. |

---

## 2. End-to-End Encryption (E2EE) Message Lifecycle

```
[ Sender Device ]                                      [ Server Relay ]                       [ Recipient Device ]
       │                                                      │                                        │
 1. Generate random 256-bit Km                                │                                        │
 2. Generate random 24-byte nonce                             │                                        │
 3. Encrypt payload:                                          │                                        │
    C = SecretBox(Payload, nonce, Km)                         │                                        │
 4. For each active recipient device i:                       │                                        │
    Env_i = Box(Km, nonce, RecipientPubKey_i, MyPrivKey)      │                                        │
 5. Sign envelope:                                            │                                        │
    Sig = Sign(SHA256(C + JSON(Envelopes)), MySignPrivKey)    │                                        │
 6. POST /api/messages { C, nonce, Envelopes, Sig }           │                                        │
       ──────────────────────────────────────────────────────>│                                        │
                                                              │ 7. Verify session, room membership,    │
                                                              │    device authorization, and quota.    │
                                                              │ 8. Store ciphertext envelope in SQLite.│
                                                              │ 9. Real-time WebSocket fanout:         │
                                                              │    message:new { envelope }            │
                                                              │───────────────────────────────────────>│
                                                                                                       │ 10. Verify Ed25519 signature
                                                                                                       │ 11. Extract Env_recipient
                                                                                                       │ 12. Decrypt Km = BoxOpen(Env,
                                                                                                       │     nonce, SenderPub, MyPriv)
                                                                                                       │ 13. Decrypt Payload =
                                                                                                       │     SecretBoxOpen(C, nonce, Km)
                                                                                                       │ 14. Render plaintext in UI
```

---

## 3. Database Schema & Integrity Guarantees

The SQLite schema is enforced with:
- `PRAGMA foreign_keys = ON;`
- `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for high concurrency and crash durability)
- `PRAGMA busy_timeout = 5000;`

### Core Tables:
1. `users`: Stores user identity, role (`owner` | `admin` | `member`), and Argon2id password hash.
2. `devices`: Stores device name, Ed25519 identity public key, X25519 exchange public key, self-signature, and revocation timestamp.
3. `sessions`: Stores session token hash, associated device ID, CSRF token, and expiration timestamp.
4. `invitations`: Stores invitation code, SHA-256 secret hash, expiration, usage counter, and approval flags.
5. `rooms` & `room_members`: Stores conversation channel metadata and membership permissions.
6. `messages`: Stores encrypted ciphertext, nonce, pairwise key envelope JSON, Ed25519 signature, and deletion flags. **No plaintext message column exists in the database.**
7. `audit_logs`: Records security events (logins, revoking devices, invitation creation) with IP address and timestamps.

---

## 4. Key Management & Vault Storage

Private keys never leave the client device in plaintext.
1. When a user creates an account or redeems an invitation, `generateDeviceKeys()` creates:
   - Identity Keypair (Ed25519)
   - Pre-key Exchange Keypair (X25519)
   - Self-signature: `crypto_sign_detached(exchangePublicKey, identityPrivateKey)`
2. The private keys are serialized and encrypted using AES-GCM-256 with an encryption key derived from the user's password via PBKDF2 (100,000 iterations, 16-byte random salt).
3. The encrypted blob is saved into the browser's persistent `IndexedDB` (`PrivateChatKeyVault`).
4. When logging in, the user provides their password to decrypt the keys into active browser memory.
5. Closing or locking the vault scrubs all active private keys and plaintext message decryption caches from memory.
