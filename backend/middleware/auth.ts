import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { secret } from '../utils/secrets';

export interface AuthUser {
  user_id: number;
  full_name: string;
  role: 'citizen' | 'land_officer' | 'administrator';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function loadUser(token: string): Promise<AuthUser | null> {
  const decoded = jwt.verify(token, secret('JWT_SECRET')) as { user_id: number };
  const result = await pool.query(
    'SELECT user_id, full_name, role, is_active FROM "user" WHERE user_id = $1',
    [decoded.user_id]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) return null;
  return { user_id: user.user_id, full_name: user.full_name, role: user.role };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) { res.status(401).json({ error: 'Missing or invalid Authorization header' }); return; }
  try {
    const user = await loadUser(token);
    if (!user) { res.status(401).json({ error: 'Account is deactivated or no longer exists' }); return; }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (token) {
    try { req.user = (await loadUser(token)) ?? undefined; } catch { req.user = undefined; }
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }
    next();
  };
}
