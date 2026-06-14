// Gateway Favorites Routes — list and toggle
import { IncomingMessage, ServerResponse } from 'http';
import { db } from './db.js';
import { verifyToken } from './auth-middleware.js';

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleFavorites(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://localhost');

  // GET /api/favorites — user's favorite game IDs
  if (req.method === 'GET' && url.pathname === '/api/favorites') {
    const decoded = verifyToken(req);
    if (!decoded) {
      return json(res, 401, { error: 'Not authenticated' });
    }

    const rows = db.prepare('SELECT gameId FROM favorites WHERE userId = ?').all(decoded.userId) as Array<{ gameId: string }>;
    return json(res, 200, { favorites: rows.map(r => r.gameId) });
  }

  // POST /api/favorites/:gameId — toggle favorite
  if (req.method === 'POST' && url.pathname.startsWith('/api/favorites/')) {
    const decoded = verifyToken(req);
    if (!decoded) {
      return json(res, 401, { error: 'Not authenticated' });
    }

    const parts = url.pathname.split('/');
    const gameId = parts[parts.length - 1];
    if (!gameId) {
      return json(res, 400, { error: 'gameId is required' });
    }

    const exists = db.prepare('SELECT 1 FROM favorites WHERE userId = ? AND gameId = ?').get(decoded.userId, gameId);

    if (exists) {
      db.prepare('DELETE FROM favorites WHERE userId = ? AND gameId = ?').run(decoded.userId, gameId);
      return json(res, 200, { favorite: false, gameId });
    } else {
      db.prepare('INSERT OR IGNORE INTO favorites (userId, gameId) VALUES (?, ?)').run(decoded.userId, gameId);
      return json(res, 200, { favorite: true, gameId });
    }
  }

  return json(res, 404, { error: 'Not found' });
}
