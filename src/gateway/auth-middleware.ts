// Gateway Auth Middleware — JWT verification from cookie
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'crabcli-arcade-secret';

export interface DecodedToken {
  userId: string;
  name: string;
  createdAt: number;
  iat: number;
  exp: number;
}

/**
 * Parse the Cookie header into a key-value map.
 */
export function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookieHeader = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const eqIdx = cookie.indexOf('=');
    if (eqIdx === -1) return;
    const name = cookie.slice(0, eqIdx).trim();
    const value = cookie.slice(eqIdx + 1).trim();
    if (name) {
      cookies[name] = value;
    }
  });
  return cookies;
}

/**
 * Extract and verify the JWT from the `token` cookie.
 * Returns the decoded payload or null if missing/invalid.
 */
export function verifyToken(req: IncomingMessage): DecodedToken | null {
  const cookies = parseCookies(req);
  const token = cookies['token'];
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch {
    return null;
  }
}
