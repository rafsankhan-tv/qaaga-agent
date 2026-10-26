import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifyLocalJwt } from '../lib/cryptoAuth.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import {
  ensureSeeded,
  getOrCreateGoogleUser,
  mapUserRowToDTO,
} from '../db/repository.ts';
import type { AuthUser } from '../types/qaaga.ts';

export interface AuthRequest extends Request {
  authUser?: AuthUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    await ensureSeeded();

    // 1. Check Email/Password signed HMAC token
    const localPayload = verifyLocalJwt(token);
    if (localPayload) {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.uid, localPayload.sub));
      if (!row) {
        res.status(401).json({ error: 'Session expired or user removed.' });
        return;
      }
      req.authUser = mapUserRowToDTO(row);
      next();
      return;
    }

    // 2. Otherwise verify Firebase Auth ID Token (Google Sign-In)
    const decoded = await adminAuth.verifyIdToken(token);
    const syncedRow = await getOrCreateGoogleUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@google.user`,
      decoded.name
    );
    req.authUser = mapUserRowToDTO(syncedRow);
    next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session.' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden: Administrator privileges required.',
    });
    return;
  }
  if (req.authUser.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Administrator account is not active.' });
    return;
  }
  next();
};
