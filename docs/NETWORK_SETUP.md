# PrivateChat Network Configuration & Local Connectivity Guide

PrivateChat is designed to run on a personally owned computer or server and serve clients on a private local network (LAN) without opening ports to the public internet.

---

## 1. Automatic Network Interface Discovery

When PrivateChat starts, it inspects the host's active network interfaces and automatically detects:
- Local loopback interface (`127.0.0.1`)
- Local IPv4 private network addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`)
- Application port (default: `3000`)

### Example Server Startup Banner:
```
======================================================
   🔒 PRIVATECHAT — SELF-HOSTED SECURE MESSAGING
======================================================
 Status:           ONLINE (PID: 12480)
 Protocol:         HTTP (LAN mode)
 Port:             3000
 Host Interface:   0.0.0.0
 Localhost URL:    http://127.0.0.1:3000
 Primary LAN URL:  http://192.168.1.45:3000
 All LAN IPs:      192.168.1.45
 Initialized:      YES (Owner exists)
------------------------------------------------------
 Ready for authorized devices.
 To pair a new device, generate an invitation code from the owner screen.
======================================================
```

---

## 2. Firewall Configuration

If other devices on your Wi-Fi cannot connect to the server's LAN IP address, your host firewall may be blocking incoming connections on port `3000`.

### Windows Firewall Configuration:
Open PowerShell as Administrator and allow inbound TCP traffic on port 3000:
```powershell
New-NetFirewallRule -DisplayName "PrivateChat Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Linux (UFW) Configuration:
```bash
sudo ufw allow in on eth0 to any port 3000 proto tcp
# or restrict strictly to your local subnet:
sudo ufw allow from 192.168.1.0/24 to any port 3000
```

### macOS Firewall:
1. Open **System Settings > Network > Firewall**.
2. Click **Options** and allow incoming connections for `Node.js` or `PrivateChat`.

---

## 3. HTTPS & Reverse Proxy Setup (Optional but Recommended)

For enhanced security on untrusted Wi-Fi or when operating across VLANs, put PrivateChat behind a local reverse proxy with TLS:

### Example Caddy Configuration (`Caddyfile`):
Caddy automatically provisions a local trusted CA certificate:
```caddy
privatechat.local {
    reverse_proxy 127.0.0.1:3000
}
```

### Example Nginx Configuration (`nginx.conf`):
```nginx
server {
    listen 443 ssl http2;
    server_name 192.168.1.45;

    ssl_certificate /etc/ssl/certs/privatechat.crt;
    ssl_certificate_key /etc/ssl/private/privatechat.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

When running behind an HTTPS reverse proxy:
1. Edit `.env` and set `ALLOW_HTTP_INSECURE_LAN=false`.
2. This ensures all session cookies are emitted with the `Secure` flag.
