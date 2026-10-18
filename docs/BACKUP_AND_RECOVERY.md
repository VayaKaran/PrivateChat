# PrivateChat Backup, Disaster Recovery & Operational Runbook

## 1. Database Architecture & File Locations

PrivateChat stores all application state, authorization records, invitations, and encrypted ciphertext in a single, robust SQLite database file.

Default path:
`./data/privatechat.sqlite` (with write-ahead log `./data/privatechat.sqlite-wal` and shared memory `./data/privatechat.sqlite-shm`)

Encrypted attachments are stored in:
`./data/attachments/`

---

## 2. Creating an Atomic Backup

Because PrivateChat runs SQLite in Write-Ahead Logging (`WAL`) mode, copying `privatechat.sqlite` while the server is running without an atomic snapshot can result in an incomplete or corrupted backup.

### Method A: In-App Snapshot (Recommended)
1. Log in to the application as the **Owner** or **Admin**.
2. Click the **Settings** icon (top navigation bar).
3. Under **Database Snapshot & Backup**, click **Create SQLite Backup**.
4. The server executes an atomic `VACUUM INTO 'backup-<timestamp>.sqlite'`, creating a fully consolidated, consistent snapshot in the `./data` directory without interrupting active chat sessions.

### Method B: Native SQLite CLI
Run the standard SQLite online backup command on the host:
```bash
sqlite3 data/privatechat.sqlite ".backup 'backup-manual-$(date +%s).sqlite'"
```

### Method C: Cold Backup (When Server is Stopped)
1. Stop the application server (`SIGTERM` or `Ctrl+C`).
2. Copy the entire `./data` folder to your backup destination:
```bash
cp -r ./data /path/to/backup/
```

---

## 3. Disaster Recovery & Restoration

To restore PrivateChat from a backup snapshot:

1. **Stop the server**:
   Ensure the Node.js process or Docker container is halted.
2. **Archive the existing data directory**:
   ```bash
   mv data data.broken.bak
   mkdir -p data
   ```
3. **Restore database file**:
   ```bash
   cp /path/to/backup/backup-timestamp.sqlite data/privatechat.sqlite
   ```
4. **Restore attachments (if applicable)**:
   ```bash
   cp -r /path/to/backup/attachments data/attachments
   ```
5. **Start PrivateChat**:
   ```bash
   npm start
   # or: docker compose up -d
   ```
6. **Verify Database Integrity**:
   Check health via:
   ```bash
   curl http://localhost:3000/api/system/health
   ```

---

## 4. Key Recovery & Device Re-enrollment

- Because private encryption keys are stored on individual user devices (IndexedDB) and **never** stored on the server, restoring a server backup does not affect user device keys.
- If a user loses their device or clears their browser storage:
  1. The Owner revokes the old device from the **Administration > Devices** tab.
  2. The Owner issues a new single-use pairing code for the user.
  3. The user opens the pairing URL, enters their username and existing password, which generates a fresh device identity and registers the new device.
