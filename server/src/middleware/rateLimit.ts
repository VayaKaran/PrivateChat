import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
  delayMs?: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxAttempts: number;
  message?: string;
  enableProgressiveDelay?: boolean;
}) {
  const store = new Map<string, RateLimitRecord>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store.entries()) {
      if (now > val.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    let record = store.get(key);
    if (!record || now > record.resetAt) {
      record = {
        count: 1,
        resetAt: now + options.windowMs,
        delayMs: 0,
      };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    if (record.count > options.maxAttempts) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec.toString());
      return res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.',
        retryAfter: retryAfterSec,
      });
    }

    if (options.enableProgressiveDelay && record.count > 2) {
      // Progressive delay: 200ms per extra attempt
      const delay = (record.count - 2) * 200;
      setTimeout(() => next(), delay);
      return;
    }

    next();
  };
}
