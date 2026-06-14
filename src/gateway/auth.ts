// Gateway Auth Routes — register, login, me
import { IncomingMessage, ServerResponse } from 'http';
import { db } from './db.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'crabcli-arcade-secret';

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
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return json(res, 400, { error: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    try {
      db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, name.trim(), createdAt);
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
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return json(res, 400, { error: 'Name is required' });
    }

    const user = db.prepare('SELECT id, name, createdAt FROM users WHERE name = ?').get(name.trim()) as { id: string; name: string; createdAt: number } | undefined;
    if (!user) {
      return json(res, 404, { error: 'User not found' });
    }

    const token = jwt.sign({ userId: user.id, name: user.name, createdAt: user.createdAt }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    return json(res, 200, { user });
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
