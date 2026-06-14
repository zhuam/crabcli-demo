// Gateway Score Routes — submit, query, leaderboard
import { IncomingMessage, ServerResponse } from 'http';
import { db } from './db.js';
import { verifyToken } from './auth-middleware.js';
import crypto from 'crypto';

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleScores(req: IncomingMessage, res: ServerResponse, body?: Record<string, any>) {
  const url = new URL(req.url!, 'http://localhost');

  // POST /api/scores — submit score (requires auth)
  if (req.method === 'POST' && url.pathname === '/api/scores') {
    const decoded = verifyToken(req);
    if (!decoded) {
      return json(res, 401, { error: 'Not authenticated' });
    }

    const gameId = body?.gameId;
    const score = body?.score;
    if (!gameId || score === undefined || score === null) {
      return json(res, 400, { error: 'gameId and score are required' });
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const metadataStr = body?.metadata ? JSON.stringify(body.metadata) : null;

    db.prepare(
      'INSERT INTO scores (id, userId, gameId, score, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, decoded.userId, gameId, Number(score), metadataStr, createdAt);

    return json(res, 201, { id, gameId, score: Number(score), createdAt });
  }

  // GET /api/scores/leaderboard — public leaderboard
  if (req.method === 'GET' && url.pathname === '/api/scores/leaderboard') {
    const gameId = url.searchParams.get('gameId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100);

    if (!gameId) {
      return json(res, 400, { error: 'gameId query parameter is required' });
    }

    const rows = db.prepare(
      `SELECT s.id, s.score, s.metadata, s.createdAt, u.name as userName, u.id as userId
       FROM scores s
       JOIN users u ON s.userId = u.id
       WHERE s.gameId = ?
       ORDER BY s.score DESC
       LIMIT ?`
    ).all(gameId, limit) as Array<{
      id: string; score: number; metadata: string | null; createdAt: number;
      userName: string; userId: string;
    }>;

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      userName: r.userName,
      score: r.score,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      createdAt: r.createdAt,
    }));

    return json(res, 200, { leaderboard, gameId });
  }

  // GET /api/scores — user's own scores (requires auth)
  if (req.method === 'GET' && url.pathname === '/api/scores') {
    const decoded = verifyToken(req);
    if (!decoded) {
      return json(res, 401, { error: 'Not authenticated' });
    }

    const gameId = url.searchParams.get('gameId');

    let query = 'SELECT id, gameId, score, metadata, createdAt FROM scores WHERE userId = ?';
    const params: unknown[] = [decoded.userId];

    if (gameId) {
      query += ' AND gameId = ?';
      params.push(gameId);
    }

    query += ' ORDER BY createdAt DESC LIMIT 100';

    const rows = db.prepare(query).all(...params) as Array<{
      id: string; gameId: string; score: number; metadata: string | null; createdAt: number;
    }>;

    const scores = rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
    return json(res, 200, { scores, userId: decoded.userId });
  }

  return json(res, 404, { error: 'Not found' });
}
