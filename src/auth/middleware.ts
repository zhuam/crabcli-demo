// JWT Authentication Middleware for CrabCLI Arcade
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../shared/hub-types.js';

// In production, use an env variable
const JWT_SECRET = process.env.JWT_SECRET || 'crabcli-arcade-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '7d';

export interface AuthRequest extends Request {
  user?: User;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : cookieToken;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as User;
      req.user = decoded;
    } catch {
      // Invalid token, continue as anonymous
    }
  }
  next();
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isGuest: user.isGuest,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export { JWT_SECRET };
