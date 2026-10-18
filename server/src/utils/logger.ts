// Structured Redacted Logger for PrivateChat

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'secret',
  'secret_hash',
  'session_token',
  'session_token_hash',
  'csrf_token',
  'token',
  'ciphertext',
  'private_key',
  'privatekey',
  'key_envelopes',
  'identity_private_key',
  'exchange_private_key',
  'authorization',
  'cookie',
]);

function redact(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // If it looks like base64 or long hex or bearer token, keep safe or redact if suspicious
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redact);
  }
  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof val === 'object') {
        sanitized[key] = redact(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }
  return obj;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const entry: Record<string, any> = {
    timestamp,
    level,
    message,
  };
  if (meta) {
    entry.meta = redact(meta);
  }
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: Record<string, any>) {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, any>) {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, any>) {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, any>) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatLog('debug', message, meta));
    }
  },
};
