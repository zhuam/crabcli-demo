// CrabCLI Arcade Gateway — unified entry point on PORT 3000
// Serves hub, games, API routes, and WebSocket game routing
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { handleAuth, setAuthCookie, json as authJson } from './auth.js';
import { handleScores } from './scores.js';
import { handleFavorites } from './favorites.js';
import { handleConnection } from '../server/game-logic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Load game registry ───
const REGISTRY = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'games/registry.json'), 'utf-8'));

// ─── Game directory resolver ───
const GAMES_DIR = resolve(PROJECT_ROOT, 'games');

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function findGameDir(gameId: string): string | null {
  // Scan games/ for a directory containing the game ID
  if (existsSync(GAMES_DIR)) {
    for (const entry of readdirSync(GAMES_DIR)) {
      const fullPath = join(GAMES_DIR, entry);
      if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) continue;
      // Direct match or contains the id (handles "099-idle-lemonade-stand" → "idle-lemonade")
      if (entry === gameId || entry.includes(gameId)) return fullPath;
      // Strip numeric prefix: "099-idle-lemonade-stand" → "idle-lemonade-stand"
      const stripped = entry.replace(/^\d+-/, '');
      if (stripped.includes(gameId) || gameId.includes(stripped)) return fullPath;
    }
  }
  return null;
}

function isGamePlayable(game: any): boolean {
  const configuredPath = typeof game.path === 'string' ? game.path : '';
  const gameDir = findGameDir(game.id);
  if (!gameDir) return false;

  if (configuredPath.startsWith('/games/')) {
    const configuredDir = resolve(PROJECT_ROOT, configuredPath.slice(1));
    const configuredIndex = resolve(configuredDir, 'index.html');
    if (existsSync(configuredIndex)) return true;
  }

  return existsSync(resolve(gameDir, 'index.html'));
}

function gameWithAvailability(game: any) {
  const playable = game.status ? game.status === 'playable' : isGamePlayable(game);
  const icon = REGISTRY.categories.find((cat: any) => cat.id === game.category)?.icon || '🎮';
  return {
    ...game,
    icon: game.icon || icon,
    status: playable ? 'playable' : 'coming-soon',
    playable,
    availabilityLabel: playable ? 'Playable' : 'Coming Soon',
  };
}

function registryWithAvailability() {
  return {
    ...REGISTRY,
    games: REGISTRY.games.map(gameWithAvailability),
  };
}

function renderComingSoon(game: any): string {
  const htmlPath = resolve(PROJECT_ROOT, 'hub/coming-soon.html');
  const template = existsSync(htmlPath)
    ? readFileSync(htmlPath, 'utf-8')
    : '<!doctype html><title>Coming Soon</title><h1>__GAME_NAME__</h1><p>__GAME_DESC__</p><a href="/">Back to Arcade</a>';
  const icon = REGISTRY.categories.find((cat: any) => cat.id === game.category)?.icon || '🎮';
  return template
    .replace(/__GAME_ICON__/g, escapeHtml(icon))
    .replace(/__GAME_NAME__/g, escapeHtml(game.name || game.id))
    .replace(/__GAME_DESC__/g, escapeHtml(game.description || 'This game is planned and will be available soon.'));
}

// ─── MIME types ───
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

// ─── Body parser ───
function parseBody(req: IncomingMessage): Promise<Record<string, any> | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : null); }
      catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

// ─── JSON response helper ───
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Static file server ───
function serveFile(res: ServerResponse, filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (!stat.isFile()) return false;
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-cache',
  });
  res.end(readFileSync(filePath));
  return true;
}

// ─── Create HTTP server ───
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  try {
    // Health check
    if (pathname === '/health') {
      return json(res, 200, { status: 'ok', uptime: process.uptime(), games: REGISTRY.games.length });
    }

    // API: Game list
    if (pathname === '/api/games') {
      return json(res, 200, registryWithAvailability());
    }

    // API: Categories
    if (pathname === '/api/games/categories') {
      return json(res, 200, { categories: REGISTRY.categories });
    }

    // API: Auth routes
    if (pathname.startsWith('/api/auth/')) {
      const body = await parseBody(req);
      return handleAuth(req, res, body);
    }

    // API: Score routes
    if (pathname.startsWith('/api/scores')) {
      const body = req.method === 'POST' ? await parseBody(req) : undefined;
      return handleScores(req, res, body);
    }

    // API: Favorites routes
    if (pathname.startsWith('/api/favorites')) {
      return handleFavorites(req, res);
    }

    // Hub root — serve hub/index.html
    if (pathname === '/') {
      return serveFile(res, resolve(PROJECT_ROOT, 'hub/index.html'))
        || (json(res, 500, { error: 'Hub page not found' }));
    }

    // Hub static files (/hub/*)
    if (pathname.startsWith('/hub/')) {
      const filePath = resolve(PROJECT_ROOT, 'hub', pathname.slice(5));
      if (!filePath.startsWith(resolve(PROJECT_ROOT, 'hub'))) {
        return json(res, 403, { error: 'Forbidden' });
      }
      return serveFile(res, filePath) || json(res, 404, { error: 'Not found' });
    }

    // Game static files (/games/:id/*)
    if (pathname.startsWith('/games/')) {
      const parts = pathname.split('/').filter(Boolean); // ['games', 'gameId', ...rest]
      if (parts.length >= 2) {
        const gameId = parts[1];
        const subPath = parts.slice(2).join('/') || 'index.html';

        const game = REGISTRY.games.find((g: any) => g.id === gameId);
        const gameDir = findGameDir(gameId);
        if (gameDir) {
          const filePath = resolve(gameDir, subPath);
          if (!filePath.startsWith(gameDir)) {
            return json(res, 403, { error: 'Forbidden' });
          }
          if (serveFile(res, filePath)) return;
        }

        if (game && subPath === 'index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          return res.end(renderComingSoon(game));
        }

        // If game dir not found, return 404 with game ID
        return json(res, 404, { error: `Game "${gameId}" not found or not built yet`, hint: gameId === 'trivia-royale' ? 'Run `npm run build` to compile trivia-royale into games/trivia-royale/' : undefined });
      }
      return json(res, 400, { error: 'Invalid game path' });
    }

    // Catch-all 404
    json(res, 404, { error: 'Not found' });
  } catch (err: any) {
    console.error('[gateway] error:', err.message);
    if (!res.headersSent) {
      json(res, 500, { error: 'Internal server error' });
    }
  }
});

// ─── WebSocket server (noServer mode — we handle upgrade manually) ───
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  // Route: /ws/game/:id
  const wsMatch = pathname.match(/^\/ws\/game\/(.+)$/);
  if (wsMatch) {
    const gameId = wsMatch[1];

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);

      if (gameId === 'trivia-royale') {
        // Route to Trivia Royale game logic
        handleConnection(ws as WebSocket);
      } else {
        // Placeholder for other games
        ws.send(JSON.stringify({
          type: 'info',
          message: `Connected to "${gameId}" (game server placeholder)`,
          gameId,
        }));
      }
    });
  } else {
    // Reject non-matching WS upgrade
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

// ─── Start server ───
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🦀 CrabCLI Arcade Gateway`);
  console.log(`   Listening on http://0.0.0.0:${PORT}`);
  console.log(`   Hub:       http://localhost:${PORT}/`);
  console.log(`   API:       http://localhost:${PORT}/api/games`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Games:     ${REGISTRY.games.length} registered`);
  console.log(`   WS:        ws://localhost:${PORT}/ws/game/:id\n`);
});
