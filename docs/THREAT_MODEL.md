# PrivateChat Threat Model & Security Specification

## 1. System Overview & Trust Assumptions

**PrivateChat** is a self-hosted, invitation-only, end-to-end encrypted messaging web application designed for a small group of trusted individuals communicating over a private local network (LAN) or behind an authenticated private perimeter.

### Trust Model Boundaries:
1. **The Server is Untrusted with Plaintext Message Content**:
   - The server acts strictly as an authenticated mailbox, pub/sub relay, and cryptographic public key directory.
   - Message payloads and attached files are encrypted on the sending device before transmission.
   - The server only ever stores or forwards ciphertext and pairwise key envelopes.
   - Even if the server machine is compromised or its SQLite database is seized, plaintext message content remains confidential.

2. **The Server is Authoritative for Group Membership & Invitations**:
   - The server enforces admission control, invitation redemption validity, device revocation, and active room subscriptions.
   - The server cannot forge messages on behalf of users because every message envelope must bear a valid Ed25519 digital signature from the sender's device identity key.

3. **Client Devices are Trusted by Their Respective Owners**:
   - Each user's device is responsible for generating and safeguarding its own private keys.
   - Private keys are stored encrypted in the browser's IndexedDB vault using an AES-GCM key derived from the user's passphrase via PBKDF2 (100,000 iterations).
   - If an endpoint device is compromised by malware, physical theft, or a screen recorder, plaintext displayed on that specific device can be captured.

---

## 2. Threat Vector Analysis & Mitigations

| Threat Vector | Potential Impact | PrivateChat Mitigation Strategy |
| :--- | :--- | :--- |
| **Server Compromise / Database Seizure** | Attacker gains root access to server or copies `privatechat.sqlite`. | **Full E2EE**: Database contains only AES/ChaCha ciphertext and encrypted pairwise envelopes. Passwords are hash-protected with Argon2id ($m=65536, t=3, p=4$). Zero plaintext private keys are ever stored on or transmitted to the server. |
| **Passive LAN Eavesdropping** | Attacker on the same Wi-Fi captures packets. | **E2EE Payloads**: Message contents and attachments are end-to-end encrypted. In HTTPS mode, transport-layer TLS prevents cookie sniffing. In HTTP mode, payload confidentiality is still maintained cryptographically. |
| **Man-in-the-Middle (MITM) / Key Substitution** | Server or attacker swaps recipient public keys. | **Cryptographic Device Signatures & 60-Digit Safety Numbers**: Exchange public keys are self-signed by the device identity key. Users can verify out-of-band safety numbers (numeric and QR code) to guarantee key authenticity. |
| **Replay & Modification Attacks** | Attacker intercepts and replays or mutates ciphertext packets. | **Unique 24-byte Nonces & AEAD Poly1305 Authentication Tags**: Any altered byte in ciphertext or envelopes causes immediate cryptographic rejection (`crypto_box_open_easy` failure). Timestamps and message IDs prevent duplicate processing. |
| **Unauthorized Registration / Guessing Pairing Codes** | Outsider attempts to join chat room. | **High-Entropy Secrets & Atomic Redemption**: Invitations contain 256-bit cryptographically random secrets stored only as SHA-256 hashes. Redemption executes atomically inside SQLite `BEGIN IMMEDIATE` transactions with rate limiting. |
| **Stolen Session Tokens / Device Hijacking** | Attacker gains access to a user session. | **Instant Device Revocation & Key Isolation**: Owners can immediately revoke any device. The server forcibly disconnects its WebSocket and drops future deliveries. Because messages use pairwise envelopes, revoked devices are excluded from all future key distributions. |
| **Cross-Site Scripting (XSS) & Clickjacking** | Malicious script execution in browser. | **Strict CSP & Secure Headers**: Strict Content Security Policy (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and zero runtime external script injection. |

---

## 3. Cryptographic Bounds & Non-Goals

1. **Traffic Analysis & Metadata Protection**:
   - The application does not attempt to disguise communication traffic via onion routing (Tor) or artificial dummy traffic injection.
   - The server observes message transmission timestamps, ciphertext payload sizes, and connected device IP addresses.

2. **Compromised Endpoints**:
   - PrivateChat does not claim to defend against malware, keyloggers, or memory scraping on the client device itself.

3. **Remote Erasure of Decrypted Content**:
   - Deleting a message instructs authorized clients to erase the local message from display. It cannot cryptographically guarantee that a previously authorized, compromised, or modified client has not already copied the decrypted plaintext.
