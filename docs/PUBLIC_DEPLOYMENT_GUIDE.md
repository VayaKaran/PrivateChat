# PrivateChat — Public Internet Deployment & Self-Hosting Guide

This guide provides tested, step-by-step instructions for deploying PrivateChat for remote access over the public internet while preserving the zero-cloud, no-paid-API, and no-mandatory-subscription architecture.

---

## Architecture: Unified Single-Origin Production Serving

In production, the Node.js backend serves both the compiled React frontend (`client/dist`) and the JSON API / WebSockets from the exact same HTTPS origin:

```
[Remote Browser (Phone/Laptop)]
             │
             │ HTTPS (TLS 1.3) + WSS
             ▼
[Public Reverse Proxy or Cloudflare Tunnel]
             │
             │ HTTP (localhost only: 127.0.0.1:3000)
             ▼
[PrivateChat Node.js Server]
  ├── GET /                --> Serves client/dist/index.html
  ├── GET /assets/*        --> Serves minified JS/CSS (no source maps)
  ├── /api/*               --> JSON REST API (Rate limited, CSRF protected)
  ├── /ws                  --> Encrypted WebSockets (E2EE ciphertext envelopes)
  └── [SQLite WAL Database] (Local persistent storage: data/privatechat.sqlite)
```

### Why Single-Origin is Required for This Sensitive Application:
1. **IndexedDB Key Vault Isolation:** Browsers partition Web Cryptography and IndexedDB vaults strictly by origin (`https://chat.yourdomain.com`). Serving the frontend and API from the same origin prevents origin mismatch issues.
2. **First-Party Cookie Isolation:** Modern mobile browsers (iOS Safari, Android Chrome) block cross-site third-party cookies by default. Serving frontend and API together ensures session cookies are first-party (`SameSite=Lax`, `Secure`, `HttpOnly`).
3. **No Third-Party Static CDN/Host Exposure:** Serving the client directly from your self-hosted server ensures zero third-party tracking, eliminates GitHub Pages dependency, and ensures you control the exact client code served.

---

## Deployment Option 1: Cloudflare Tunnel (Recommended — No Router Port Forwarding)

Cloudflare Tunnel (`cloudflared`) creates a secure, outbound-only encrypted tunnel from your home machine to Cloudflare's edge. Your home router does **not** need any inbound open ports.

### Domain & Cost Reality
> [!IMPORTANT]
> - **A permanent custom hostname requires a domain name** (e.g. `yourname-chat.com` or `chat.yourdomain.org`) and a free Cloudflare account.
> - **Domain names are NOT free**: Domains must be purchased/registered through a domain registrar (typically $8–$15/year).
> - **The Cloudflare Tunnel software and Zero Trust free tier are free**: Cloudflare does not charge for `cloudflared` or tunneling up to 50 users on their free plan.
> - **Ephemeral Quick Tunnels (`trycloudflare.com`)**: Cloudflare offers a zero-configuration, free ephemeral testing tunnel (`cloudflared tunnel --url http://localhost:3000`) without an account or domain. However, the assigned URL is temporary, changes every time the tunnel restarts, and is intended for testing only.

### Step-by-Step Windows Setup for Cloudflare Tunnel

#### Step 1: Install `cloudflared` on Windows
Open an Administrator PowerShell prompt:
```powershell
winget install --id Cloudflare.cloudflared
```
*(Alternative: Download `cloudflared-windows-amd64.msi` directly from Cloudflare's official GitHub releases).*

Verify installation:
```powershell
cloudflared --version
```

#### Step 2: Configure PrivateChat for Tunnel Mode
In your PrivateChat directory, create or edit `.env`:
```ini
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TUNNEL_MODE=true
ALLOW_HTTP_INSECURE_LAN=false
DATA_DIR=./data
```
> [!NOTE]
> Setting `TUNNEL_MODE=true` or `HOST=127.0.0.1` ensures PrivateChat listens **strictly on localhost**, so unencrypted HTTP is never accessible over your physical Wi-Fi or local network adapter.
> Setting `ALLOW_HTTP_INSECURE_LAN=false` enforces the `Secure` flag on all session cookies, requiring HTTPS from connecting devices.

#### Step 3: Authenticate & Create Named Tunnel (Permanent Domain)
```powershell
# Login to Cloudflare account (opens browser to select your domain)
cloudflared tunnel login

# Create a permanent tunnel named "privatechat"
cloudflared tunnel create privatechat
```
Note the Tunnel UUID output by the command (e.g. `a1b2c3d4-e5f6-7890-...`).

#### Step 4: Configure Tunnel Routing
Create `C:\Users\<YourUsername>\.cloudflared\config.yml`:
```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: C:\Users\<YourUsername>\.cloudflared\<YOUR-TUNNEL-UUID>.json

ingress:
  - hostname: chat.yourdomain.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Route DNS through your tunnel:
```powershell
cloudflared tunnel route dns privatechat chat.yourdomain.com
```

#### Step 5: Test and Run Tunnel
```powershell
# Test tunnel manually in foreground:
cloudflared tunnel run privatechat

# Install and run as a persistent Windows Service:
cloudflared service install
Start-Service Cloudflare
```

---

## Deployment Option 2: Direct Self-Hosting (Router Port Forwarding + Dynamic DNS + Caddy)

If you prefer zero intermediary networks between you and your users, you can host directly from your home network using router port forwarding and a reverse proxy with automated Let's Encrypt TLS.

### Additional Exposure & Security Risks
> [!WARNING]
> Direct port forwarding introduces significant security responsibilities:
> 1. **Public IP Exposure:** Your home internet IP address is publicly visible in DNS records. Anyone looking up your hostname sees your home ISP IP.
> 2. **Port Scanner Exposure:** Attackers and automated internet bots constantly scan ports 80 and 443. The reverse proxy is directly exposed to public scanning.
> 3. **ISP Limitations (CGNAT):** Many cellular and modern residential ISPs use Carrier-Grade NAT (CGNAT), which prevents direct incoming connections. If your WAN IP on your router does not match what `curl ifconfig.me` reports, port forwarding will not work without a VPS relay.
> 4. **Host Vulnerability:** If the host machine running the server is compromised, attackers have a foothold on your internal home network. Use a dedicated firewall and VLAN if possible.

### Step-by-Step Direct Self-Hosting on Windows

#### Step 1: Configure Dynamic DNS (DDNS)
If your home ISP assigns a dynamic IP address:
1. Register a free hostname with a dynamic DNS provider (e.g. [DuckDNS](https://www.duckdns.org), [No-IP](https://www.noip.com), or Cloudflare DNS with DDNS).
2. Configure the DDNS client or script on your machine to keep your public IP synchronized (e.g. `mychat.duckdns.org`).

#### Step 2: Configure Router Port Forwarding
1. Log in to your home router gateway (typically `http://192.168.1.1` or `http://192.168.0.1`).
2. Locate the **Port Forwarding / Virtual Server** settings.
3. Add forwarding rules:
   - **HTTP (Port 80):** External Port `80` $\to$ Internal IP `192.168.1.X` (your host machine), Internal Port `80`.
   - **HTTPS (Port 443):** External Port `443` $\to$ Internal IP `192.168.1.X`, Internal Port `443`.
   - **DO NOT** forward port 3000 to the public internet! All traffic must pass through the TLS reverse proxy.

#### Step 3: Configure Windows Defender Firewall
Allow ports 80 and 443 for Caddy/reverse proxy:
```powershell
New-NetFirewallRule -DisplayName "PrivateChat Web (HTTP 80)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PrivateChat Web (HTTPS 443)" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

#### Step 4: Install and Configure Caddy on Windows
Caddy automatically obtains and renews free Let's Encrypt TLS certificates.
```powershell
winget install --id Cloudflare.Caddy
# or scoop install caddy / choco install caddy
```

Create a `Caddyfile` in your PrivateChat directory:
```caddy
mychat.duckdns.org {
    reverse_proxy 127.0.0.1:3000
}
```

Run Caddy:
```powershell
caddy run
```

---

## Remote Device Testing Protocol

Before inviting members, test the deployment using a separate device and internet connection:

1. **Disconnect from Local Wi-Fi:** Take your smartphone off your home Wi-Fi and switch entirely to Cellular Data (5G/LTE).
2. **Open HTTPS Origin:** Open `https://chat.yourdomain.com` (or your tunnel URL) in Mobile Safari or Chrome.
3. **Verify Padlock & Security Headers:**
   - Confirm the padlock icon shows a valid TLS certificate.
   - Confirm no mixed-content warnings appear.
4. **Test One-Time Initialization or Login:**
   - Verify the login screen renders with fluid animations.
   - Verify the independent master/confirm password visibility toggles work.
5. **Test WebSockets & E2EE Message Delivery:**
   - Log in or pair the mobile device using an invitation code generated from your desktop.
   - Send an encrypted message from the mobile phone over cellular data.
   - Verify that the message envelope is received instantly on your desktop workstation and decrypts cleanly.
6. **Verify Contact Safety Numbers:**
   - In direct chat, tap **Verify Safety Number** on both devices and verify that the 60-digit numbers match identically.

---

## Windows Operational Runbook (Start, Stop, Backup, Recovery)

### Production Start
```powershell
# 1. Navigate to directory
cd C:\Users\Universal\Desktop\karan\chat

# 2. Build production assets
npm run build

# 3. Start production server (runs in background with Node)
npm start
```

### Server Shutdown
```powershell
# Find process using port 3000 and stop it
$proc = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess
if ($proc) { Stop-Process -Id $proc -Force; Write-Host "Server stopped." }
```

### Hot Database Backup (Zero Downtime)
SQLite Write-Ahead Logging (`WAL`) allows live online snapshot backups:
```powershell
# Run authenticated backup via curl or powershell:
$backupName = "backup-" + (Get-Date -Format "yyyyMMddHHmmss") + ".sqlite"
sqlite3 data/privatechat.sqlite "VACUUM INTO 'data/$backupName';"
Write-Host "Snapshot saved: data/$backupName"
```

### Disaster Recovery
```powershell
# 1. Stop server
$proc = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess
if ($proc) { Stop-Process -Id $proc -Force }

# 2. Restore backup file
Copy-Item data/backup-20261017xxxxxx.sqlite data/privatechat.sqlite -Force

# 3. Remove lingering temporary WAL files
Remove-Item data/privatechat.sqlite-wal, data/privatechat.sqlite-shm -ErrorAction SilentlyContinue

# 4. Restart server
npm start
```
