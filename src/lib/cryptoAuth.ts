import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET =
  process.env.AUTH_JWT_SECRET ||
  crypto
    .createHash('sha256')
    .update(`qaaga-agent-secret-${process.env.SQL_DB_NAME || 'local'}`)
    .digest('hex');

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, keyHex] = parts;
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (storedBuf.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(storedBuf, derivedKey);
}

export interface LocalTokenPayload {
  sub: string; // uid
  email: string;
  iat: number;
  exp: number;
}

export function signLocalJwt(uid: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');
  const payload: LocalTokenPayload = {
    sub: uid,
    email,
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7 days
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `qaaga.${header}.${body}.${sig}`;
}

export function verifyLocalJwt(token: string): LocalTokenPayload | null {
  if (!token.startsWith('qaaga.')) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [, header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf-8')
    ) as LocalTokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Sliding-window rate limiter per IP + route bucket
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();
    const timestamps = (rateBuckets.get(key) || []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }

    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

// Per-authenticated-user sliding-window rate limiter for protected AI endpoints
const userRateBuckets = new Map<string, number[]>();

export function createUserRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUser = (
      req as Request & { authUser?: { id?: number; uid?: string } }
    ).authUser;
    const identity = authUser?.id
      ? `uid:${authUser.id}`
      : authUser?.uid
      ? `uid:${authUser.uid}`
      : `ip:${
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket.remoteAddress ||
          'unknown'
        }`;

    const key = `${req.baseUrl}${req.path}:${identity}`;
    const now = Date.now();
    const timestamps = (userRateBuckets.get(key) || []).filter(
      (t) => now - t < windowMs
    );

    res.setHeader('X-RateLimit-Limit', String(maxRequests));

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0] || now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((windowMs - (now - oldestInWindow)) / 1000)
      );
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        code: 'RATE_LIMITED',
        error: `Per-user rate limit reached (${maxRequests} requests per ${Math.round(
          windowMs / 1000
        )}s). Please wait ${retryAfterSec}s before sending another message.`,
      });
      return;
    }

    timestamps.push(now);
    userRateBuckets.set(key, timestamps);
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, maxRequests - timestamps.length))
    );
    next();
  };
}
