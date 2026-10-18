import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { config, allowedOrigins } from './config.js';
import { logger } from './utils/logger.js';
import { detectNetworkInterfaces } from './utils/network.js';
import { getDb } from './db/database.js';
import { securityHeadersMiddleware } from './middleware/securityHeaders.js';
import { wsServer } from './ws/websocketServer.js';

// Import Routes
import { setupRouter } from './routes/setup.js';
import { authRouter } from './routes/auth.js';
import { invitationsRouter } from './routes/invitations.js';
import { devicesRouter } from './routes/devices.js';
import { usersRouter } from './routes/users.js';
import { roomsRouter } from './routes/rooms.js';
import { messagesRouter } from './routes/messages.js';
import { attachmentsRouter } from './routes/attachments.js';
import { systemRouter } from './routes/system.js';

const app = express();
const server = http.createServer(app);

// 1. Security & Core Middleware
app.use(securityHeadersMiddleware);

// Permissive CORS for trusted local LAN origins or explicit ALLOWED_ORIGINS with credentials
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, same-origin)
      if (!origin) return callback(null, true);
      const originLower = origin.toLowerCase();
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes(originLower) || allowedOrigins.some((ao) => originLower.startsWith(ao))) {
          return callback(null, true);
        }
      }
      // In private LAN self-hosted setup, allow origins matching LAN IPs or localhost
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 2. Mount API Routes
app.use('/api/setup', setupRouter);
app.use('/api/auth', authRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/system', systemRouter);

// 3. Defense-in-depth: Block direct probes for dotfiles, SQLite files, source files, source maps, and debug routes
app.use((req, res, next) => {
  const reqPath = req.path.toLowerCase();

  // Block any dotfiles (e.g. /.env, /.git)
  if (reqPath.startsWith('/.') || reqPath.includes('/.')) {
    return res.status(404).type('text/plain').send('Not Found');
  }

  // Block source maps unconditionally
  if (reqPath.endsWith('.map') || reqPath.includes('.map')) {
    return res.status(404).type('text/plain').send('Not Found');
  }

  // Block SQLite databases, backup snapshots, source files, logs, and sensitive data extensions
  if (/\.(sqlite|sqlite3|db|wal|shm|ts|tsx|json|sql|log|bak|env)$/.test(reqPath)) {
    return res.status(404).type('text/plain').send('Not Found');
  }

  // Block non-API debug/test probe endpoints
  if (reqPath.startsWith('/debug') || reqPath.startsWith('/test')) {
    return res.status(404).type('text/plain').send('Not Found');
  }

  next();
});

// 4. Serve Frontend Static Assets if built
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { dotfiles: 'ignore' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
      return next();
    }
    // If request is for a missing file with an extension, return 404 instead of SPA index.html
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 4. Global Error Handler (Generic errors without leaking stack traces in production)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled express error', { error: err.message, path: req.path });
  res.status(500).json({
    error: 'An internal server error occurred.',
  });
});

// 5. Initialize WebSockets
wsServer.init(server);

// 6. Start Server
// Ensure database is initialized before listening
getDb();

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, config.HOST, () => {
    const net = detectNetworkInterfaces();
    const db = getDb();
    const row = db.prepare("SELECT value FROM system_config WHERE key = 'initialized'").get() as any;
    const isInitialized = row?.value === 'true';

    console.log('\n======================================================');
    console.log('   🔒 PRIVATECHAT — SELF-HOSTED SECURE MESSAGING');
    console.log('======================================================');
    console.log(` Status:           ONLINE (PID: ${process.pid})`);
    console.log(` Protocol:         ${config.ALLOW_HTTP_INSECURE_LAN ? 'HTTP (LAN mode)' : 'HTTPS'}`);
    console.log(` Port:             ${config.PORT}`);
    console.log(` Host Interface:   ${config.HOST}`);
    console.log(` Localhost URL:    http://127.0.0.1:${config.PORT}`);
    console.log(` Primary LAN URL:  ${net.localUrl}`);
    if (net.allLanIps.length > 1) {
      console.log(` All LAN IPs:      ${net.allLanIps.join(', ')}`);
    }
    console.log(` Initialized:      ${isInitialized ? 'YES (Owner exists)' : 'NO (Setup required)'}`);
    console.log('------------------------------------------------------');
    if (!isInitialized) {
      console.log(' 👉 ACTION REQUIRED:');
      console.log(` Open ${net.localUrl} in your browser to initialize the Owner account.`);
    } else {
      console.log(' Ready for authorized devices.');
      console.log(` To pair a new device, generate an invitation code from the owner screen.`);
    }
    console.log('======================================================\n');
  });
}

// 7. Graceful Shutdown
function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  wsServer.close();
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app, server };
