// Gateway Auth Routes — register, login, me
import { IncomingMessage, ServerResponse } from 'http';
import { db } from './db.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'crabcli-arcade-secret';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function setAuthCookie(res: ServerResponse, token: string) {
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleAuth(req: IncomingMessage, res: ServerResponse, body?: Record<string, any>) {
  const url = new URL(req.url!, 'http://localhost');

  // POST /api/auth/register
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const name = body?.name;
    const password = body?.password;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return json(res, 400, { error: 'Name is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return json(res, 400, { error: 'Password must be at least 4 characters' });
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const passwordHash = hashPassword(password);

    try {
      db.prepare('INSERT INTO users (id, name, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(id, name.trim(), passwordHash, createdAt);
    } catch (e: any) {
      if (e.message && (e.message.includes('UNIQUE') || e.message.includes('unique'))) {
        return json(res, 409, { error: 'Username already taken' });
      }
      throw e;
    }

    const token = jwt.sign({ userId: id, name: name.trim(), createdAt }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    return json(res, 201, { user: { id, name: name.trim(), createdAt } });
  }

  // POST /api/auth/login
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const name = body?.name;
    const password = body?.password;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return json(res, 400, { error: 'Name is required' });
    }
    if (!password || typeof password !== 'string') {
      return json(res, 400, { error: 'Password is required' });
    }

    const username = name.trim();

    // Check if user exists first (do NOT count attempts for non-existent users)
    const user = db.prepare('SELECT id, name, passwordHash, createdAt FROM users WHERE name = ?').get(username) as { id: string; name: string; passwordHash: string | null; createdAt: number } | undefined;
    if (!user) {
      return json(res, 404, { error: 'User not found' });
    }

    // Check lock status before authentication
    const attempt = db.prepare('SELECT failCount, lockedUntil FROM login_attempts WHERE username = ?').get(username) as { failCount: number; lockedUntil: number } | undefined;
    if (attempt && attempt.lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      return json(res, 423, {
        error: 'Account is temporarily locked',
        lockedUntil: attempt.lockedUntil,
        retryAfterSeconds
      });
    }

    // If lock has expired, clean up the record
    if (attempt && attempt.lockedUntil > 0 && attempt.lockedUntil <= Date.now()) {
      db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
    }

    // Verify password
    const passwordCorrect = user.passwordHash
      ? hashPassword(password) === user.passwordHash
      : true; // legacy passwordless accounts

    if (!passwordCorrect) {
      // Increment fail count
      const currentFailCount = (attempt && attempt.lockedUntil <= Date.now()) ? attempt.failCount : (attempt?.failCount || 0);
      const newFailCount = currentFailCount + 1;

      if (newFailCount >= 5) {
        // Lock the account for 10 minutes
        const lockedUntil = Date.now() + 10 * 60 * 1000;
        db.prepare(
          'INSERT INTO login_attempts (username, failCount, lockedUntil) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET failCount = ?, lockedUntil = ?'
        ).run(username, newFailCount, lockedUntil, newFailCount, lockedUntil);

        return json(res, 423, {
          error: 'Account is temporarily locked',
          lockedUntil,
          retryAfterSeconds: 10 * 60
        });
      }

      // Update fail count
      db.prepare(
        'INSERT INTO login_attempts (username, failCount, lockedUntil) VALUES (?, ?, 0) ON CONFLICT(username) DO UPDATE SET failCount = ?, lockedUntil = 0'
      ).run(username, newFailCount, newFailCount);

      // Progressive warning at 3-4 failures
      if (newFailCount >= 3) {
        return json(res, 401, {
          error: 'Incorrect password',
          warning: true,
          message: 'Multiple failed attempts will lock your account.'
        });
      }

      // Standard failure for 1-2 attempts
      return json(res, 401, { error: 'Incorrect password' });
    }

    // Successful login — clear any attempt records
    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);

    const token = jwt.sign({ userId: user.id, name: user.name, createdAt: user.createdAt }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    return json(res, 200, { user: { id: user.id, name: user.name, createdAt: user.createdAt } });
  }

  // GET /api/auth/me
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const { verifyToken } = await import('./auth-middleware.js');
    const decoded = verifyToken(req);
    if (!decoded) {
      return json(res, 401, { error: 'Not authenticated' });
    }

    const user = db.prepare('SELECT id, name, createdAt FROM users WHERE id = ?').get(decoded.userId) as { id: string; name: string; createdAt: number } | undefined;
    if (!user) {
      return json(res, 404, { error: 'User not found' });
    }

    return json(res, 200, { user });
  }

  return json(res, 404, { error: 'Not found' });
}
