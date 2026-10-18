# PrivateChat Known Limitations & Risk Disclosure

In accordance with responsible engineering principles and transparent security communication, PrivateChat makes no claim of absolute invulnerability. Below is an honest disclosure of our cryptographic boundaries, technical constraints, and operational limitations.

---

## 1. Compromised Client Endpoints

**Limitation**: End-to-end encryption guarantees data confidentiality only while transit or in storage on untrusted servers. It cannot protect plaintext once rendered on a compromised client device.

**Real-world Risks**:
- Keyloggers or malicious browser extensions on the client device.
- Screen recording tools or malware with administrative privileges.
- Physical access to an unlocked device while the key vault is open.

**Mitigation & Recommendations**:
- Keep client operating systems and browsers updated.
- Use strong account passwords that protect the local IndexedDB key vault.
- Click "Lock Key Vault" when stepping away from the device.

---

## 2. Forward Secrecy Bounds

**Limitation**: PrivateChat employs a pairwise static-ephemeral key encapsulation architecture based on libsodium `crypto_box`. While each individual message utilizes a fresh random 256-bit symmetric key ($K_m$) and random 24-byte nonce, the per-message key is sealed using the recipient device's static X25519 public exchange key.

**Real-world Risks**:
- If an attacker intercepts and archives all encrypted database backups or network ciphertext, and *subsequently* seizes a device's long-term private exchange key, the attacker can decrypt historical messages sent to that specific device.
- Full Double Ratchet (as seen in Signal) requires complex asynchronous prekey bundles and rolling ephemeral state machines that can easily corrupt in multi-tab web browser contexts.

**Mitigation & Recommendations**:
- The owner can revoke compromised or retired devices immediately.
- Periodically regenerate invitations and rotate authorized devices for sensitive groups.

---

## 3. Metadata Observability & Traffic Analysis

**Limitation**: The server acts as the authoritative message router. While message content and attachments are strictly ciphertext, communication metadata is visible to the server host.

**Visible Metadata**:
- Timestamps of message transmission.
- Approximate length of encrypted ciphertext (though padded, general size class is observable).
- Sender user ID and recipient room ID.
- IP addresses and network socket connection times of connected devices.
- Number and membership lists of rooms.

**Non-Goals**:
- PrivateChat does not implement mix-networks, onion routing, or artificial dummy packet generation to resist nation-state traffic correlation attacks.

---

## 4. HTTP vs. HTTPS on Local Networks

**Limitation**: When deployed on home or office LANs without a custom TLS certificate (using `ALLOW_HTTP_INSECURE_LAN=true`), transport-level encryption (TLS) is absent.

**Real-world Risks**:
- While message payloads remain end-to-end encrypted (the server and wire see only ciphertext), HTTP cookies and authentication requests sent in cleartext over an untrusted Wi-Fi network could be subject to session hijacking.

**Mitigation & Recommendations**:
- Only use HTTP mode on a trusted, private, WPA3-secured home or office Wi-Fi network.
- For production or untrusted networks, configure a reverse proxy (e.g., Caddy, Nginx, or Traefik) with a local or self-signed TLS certificate and set `ALLOW_HTTP_INSECURE_LAN=false`.

---

## 5. Remote Deletion Is Not Remote Eradication

**Limitation**: When a user edits or deletes a message, PrivateChat marks the message as deleted in SQLite and broadcasts a `message:deleted` event to active clients.

**Real-world Risks**:
- An authorized recipient who previously received and decrypted the message could have taken a screenshot, copied the text, or modified their client software to ignore deletion events.
- End-to-end encryption cannot retroactively remove information from the physical memory or mind of an authorized recipient.
