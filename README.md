# 🔒 PrivateChat
### Self-Hosted, Invitation-Only, End-to-End Encrypted Messaging Web Application

PrivateChat is a private, self-hosted messaging web application engineered for small, trusted groups who demand verifiable cryptographic privacy, zero cloud dependencies, and complete data ownership.

---

## 🌟 Key Highlights

- **Genuine End-to-End Encryption (E2EE)**: Messages and files are encrypted and signed directly on the sender's device using **`libsodium`** (XChaCha20-Poly1305 AEAD + X25519 pairwise envelopes + Ed25519 signatures). The server and database only ever store and relay ciphertext.
- **Strict Invitation-Only Admission**: Zero public registration. Only individuals explicitly invited by the application owner with a cryptographically random, single-use pairing code can connect. Optional manual owner approval workflow included.
- **Zero Paid Services or External APIs**: No paid messaging platforms, third-party authentication services, external fonts, cloud telemetry, or third-party CDNs. 100% self-hosted and offline-capable on a local private network.
- **Pairwise Multi-Device Architecture**: Each device maintains its own cryptographic identity keypairs stored in a local, password-protected IndexedDB key vault. Device revocation immediately excludes devices from future message key distributions.
- **Contact Identity Verification**: Deterministic 60-digit safety numbers and visual QR code comparisons allow users to verify out-of-band that no key substitution or man-in-the-middle attack has occurred.
- **Single-Server Simplicity**: Powered by Node.js, Express, WebSockets, and SQLite in Write-Ahead Logging (`WAL`) mode with atomic database snapshot capabilities.
- **Modern Responsive UI**: Crafted with React 18, TypeScript, Tailwind CSS, Lucide icons, and fluid Framer Motion animations. Fully responsive across phones, tablets, and desktop workstations. Includes independent password visibility toggles on setup.
- **Deployment Flexibility**: Run as a self-contained local monolith (`http://127.0.0.1:3000`), in Docker, behind an HTTPS reverse proxy (Caddy/Nginx), or host the static frontend on **GitHub Pages** while self-hosting the backend.
- **40 Automated Tests**: Complete suite of security, negative, cryptographic, offline isolation, and component tests passing 100%.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide React (local SVGs), QRCode generator |
| **Cryptography** | `libsodium-wrappers-sumo` (WASM/ASM), Web Crypto API (AES-GCM-256 via PBKDF2), `hash-wasm` (Argon2id) |
| **Backend** | Node.js (v20+ / v24+), TypeScript, Express, `ws` (WebSockets), Zod validation, CORS with origin whitelisting |
| **Database** | SQLite via Node v24 `DatabaseSync` (`node:sqlite`) with `WAL` mode and foreign keys enabled |
| **Testing** | Vitest, Supertest, JSDOM, `@testing-library/react` |
| **Deployment** | Native Node.js, Docker Compose (multi-stage Alpine image), or GitHub Pages (static client) |

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js v20+ or v24+ (tested on Node v24.18.0)
- npm v10+

### 1. Installation & Build

```bash
# Clone the repository
git clone https://github.com/your-username/privatechat.git
cd privatechat

# Install dependencies for all workspaces
npm install

# Build shared types, server, and client bundles
npm run build
```

### 2. Run the Application Server (Local / LAN Monolith)

```bash
# Start the production server
npm start
```

Upon launch, PrivateChat automatically detects your local network configuration and displays the connection URL:

```text
======================================================
   🔒 PRIVATECHAT — SELF-HOSTED SECURE MESSAGING
======================================================
 Status:           ONLINE (PID: 12480)
 Protocol:         HTTP (LAN mode)
 Port:             3000
 Host Interface:   0.0.0.0
 Localhost URL:    http://127.0.0.1:3000
 Primary LAN URL:  http://192.168.1.45:3000
 Initialized:      NO (Setup required)
------------------------------------------------------
 👉 ACTION REQUIRED:
 Open http://192.168.1.45:3000 in your browser to initialize the Owner account.
======================================================
```

---

## 🌐 Deployment Options

### Option A: Native Node.js (Linux / Windows)

#### Linux (systemd Service)
Create `/etc/systemd/system/privatechat.service`:
```ini
[Unit]
Description=PrivateChat E2EE Messaging Service
After=network.target

[Service]
Type=simple
User=privatechat
WorkingDirectory=/opt/privatechat
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=DATA_DIR=/var/lib/privatechat/data

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now privatechat
```

#### Windows (PM2 or Task Scheduler)
```powershell
npm install -g pm2
pm2 start dist/server/src/index.js --name "privatechat"
pm2 save
pm2 startup
```

---

### Option B: Docker Compose

```bash
# Build and launch with persistent SQLite volume
docker compose up -d

# View live server logs
docker compose logs -f

# Graceful shutdown
docker compose down
```

---

### Option C: Production Reverse Proxy with HTTPS (Recommended)

When exposing PrivateChat beyond your local network, run the backend behind a reverse proxy that terminates TLS with Let's Encrypt certificates.

#### Caddy Example (`Caddyfile`)
```caddy
chat.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

#### Nginx Example (`/etc/nginx/sites-available/privatechat`)
```nginx
server {
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/chat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.yourdomain.com/privkey.pem;
}
```

In your backend `.env` file, set:
```bash
ALLOW_HTTP_INSECURE_LAN=false
```
This instructs the server to strictly enforce the `Secure` flag on session cookies and block plain HTTP authentication.

---

### Option D: Static Frontend on GitHub Pages + Self-Hosted Backend

> [!IMPORTANT]
> **Static Hosting Reality:** GitHub Pages is a static file host. It **cannot** run Node.js, execute WebSockets, or persist the SQLite database.
> When using GitHub Pages, only the frontend (HTML, CSS, JS) is hosted by GitHub. You **must** still run the PrivateChat Node.js backend on your own server, VPS, or home connection.

1. **Deploy Frontend to GitHub Pages:**
   - Enable GitHub Pages in your repository settings (**Settings > Pages > Build and deployment > GitHub Actions**).
   - Trigger the `.github/workflows/deploy-pages.yml` workflow or push changes to `main`.
   - The workflow builds the static client using relative asset resolution (`./`) and publishes it to `https://<your-username>.github.io/<repo-name>/`.

2. **Configure Backend CORS for GitHub Pages:**
   - On your backend server, add your GitHub Pages URL to `.env`:
     ```bash
     ALLOWED_ORIGINS=https://<your-username>.github.io
     ```
   - Restart your backend server.

3. **Connect Frontend to Backend:**
   - Open your GitHub Pages URL in your browser.
   - If the backend is not pre-configured via build variables, PrivateChat presents an intuitive connection screen where you can specify your self-hosted backend address (e.g. `https://chat.yourdomain.com`).
   - PrivateChat automatically routes API requests and WebSockets securely using cross-origin bearer tokens.

---

## 📱 User & Device Pairing Walkthrough

### Step 1: Initial Owner Setup
1. Open the application URL in a web browser.
2. The initialization screen detects that the application is uninitialized.
3. Enter your desired **Owner Username**, **Display Name**, **Device Name**, and master **Password** (min. 10 characters). You can toggle visibility for both the master and confirm password fields.
4. The browser generates client-side cryptographic keypairs (Ed25519 identity + X25519 exchange), encrypts the private keys into your browser's IndexedDB vault, and establishes the initial authorized owner.

### Step 2: Generating an Invitation
1. In the chat interface, click the **Administration** icon in the top header.
2. Under **Generate Secure Invitation**, specify:
   - Recipient label (e.g. `Bob`)
   - Expiration time (e.g. 24 hours)
   - Maximum permitted uses (defaults to 1)
   - Optional: Check *Require manual administrator approval*
3. Click **Create Invitation**.
4. A pairing QR code, pairing URL, and short alphanumeric pairing code (e.g. `PVT-7A9B-2C4D`) will be displayed. Share this securely with the invitee.

### Step 3: Pairing a New Device
1. The invited user opens the pairing link on their phone, tablet, or laptop.
2. They enter or scan the invitation code.
3. They choose a username and password, which derives their local device keys.
4. Once paired (and approved by the owner if manual approval was required), they are admitted to the chat.

### Step 4: Contact Identity Verification (Safety Numbers)
1. In any direct conversation, click **Verify Safety Number** in the conversation header.
2. Compare the displayed **60-digit safety number** or scan the safety QR code with the contact in person or over an out-of-band channel.
3. Matching numbers cryptographically verify that messages are encrypted directly for their authentic device and that no public key substitution has taken place.

---

## 🧪 Automated Security & Test Suite

Run all automated tests across workspaces with a single command:

```bash
npm test
```

### Test Coverage Highlights:
- **`tests/e2ee.test.ts` & `client/tests/crypto.test.ts`**: Verifies cryptographic key generation, pairwise fanout encryption, tamper rejection, and deterministic 60-digit safety numbers.
- **`tests/setup-and-auth.test.ts` & `client/tests/setup-view.test.tsx`**: Verifies one-time owner setup gating, Argon2id password hashing, generic error disclosure, session tokens, and password visibility toggle behavior.
- **`tests/invitations.test.ts`**: Verifies 256-bit entropy secrets, Argon2id/SHA-256 hashed storage, atomic redemption under race conditions, and automatic revocation.
- **`tests/security.test.ts`**: Negative testing against SQL injection, XSS payloads, session fixation, and verifies strict Content Security Policy headers.
- **`tests/offline-isolation.test.ts`**: Verifies zero outbound external network requests and guarantees built frontend bundles contain zero external CDN domains, fonts, or tracking scripts.

---

## 💾 Database Backup & Disaster Recovery

PrivateChat uses SQLite in Write-Ahead Logging (`WAL`) mode, allowing live online snapshots without server downtime.

### Atomic Backup Command
```bash
# Authenticated Owner/Admin API endpoint creates an immediate snapshot
curl -X POST http://127.0.0.1:3000/api/system/backup \
  -H "Cookie: privatechat_session=<TOKEN>" \
  -H "X-CSRF-Token: <CSRF_TOKEN>"
```

### Manual Backup
To create a safe backup while the server is running:
```bash
# SQLite VACUUM INTO produces an atomic, consistent database snapshot
sqlite3 data/privatechat.sqlite "VACUUM INTO 'data/backup-$(date +%Y%m%d%H%M%S).sqlite';"
```

### Restoration
1. Stop the PrivateChat server: `npm stop` or `systemctl stop privatechat`.
2. Replace `data/privatechat.sqlite` with your backup copy.
3. Remove lingering temporary WAL files: `rm -f data/privatechat.sqlite-wal data/privatechat.sqlite-shm`.
4. Start the server: `npm start` or `systemctl start privatechat`.

---

## 📖 Documentation Directory

- [Public Internet Deployment & Tunnel Guide](./docs/PUBLIC_DEPLOYMENT_GUIDE.md)
- [Security Policy & Responsible Disclosure](./SECURITY.md)
- [Threat Model & Security Specification](./docs/THREAT_MODEL.md)
- [Security & Cryptographic Architecture](./docs/SECURITY_ARCHITECTURE.md)
- [Known Limitations & Risk Disclosure](./docs/KNOWN_LIMITATIONS.md)
- [Backup, Disaster Recovery & Operational Runbook](./docs/BACKUP_AND_RECOVERY.md)
- [Network Setup & Local Connectivity Guide](./docs/NETWORK_SETUP.md)
- [Security Testing Report](./docs/SECURITY_TESTING_REPORT.md)

---

## ⚖️ Honest Limitations & Boundaries

PrivateChat guarantees payload confidentiality against network eavesdroppers and untrusted servers. However, in accordance with responsible security disclosure:
- It **cannot** protect plaintext if a client device is physically compromised, infected with malware, or running a screen recorder.
- Metadata (timestamps, approximate ciphertext sizes, sender/recipient device IDs) is observable by the server operator.
- Browser IndexedDB vaults are sandboxed per origin (`scheme://host:port`). Accessing PrivateChat via a different domain or port requires pairing that device origin anew.
- Always use strong master passwords to protect local browser encryption key vaults.

---

## 📄 License
MIT License. Free and open source for private, personal, and self-hosted use.
