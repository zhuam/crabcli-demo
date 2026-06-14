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
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Load game registry ───
const REGISTRY = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'games/registry.json'), 'utf-8'));

function getCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    puzzle: '🧩', idle: '🏪', action: '⚡',
    strategy: '♟️', casual: '🎯'
  };
  return icons[cat] || '🎮';
}

// ─── Build trivia-royale if not yet built (dev mode) ───
if (process.env.NODE_ENV !== 'production') {
  const triviaBuilt = existsSync(resolve(PROJECT_ROOT, 'games/trivia-royale/index.html'));
  if (!triviaBuilt) {
    console.log('[gateway] Building Trivia Royale for dev...');
    try {
      execSync('npm run build:trivia', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      console.log('[gateway] Trivia Royale build complete.');
    } catch (e) {
      console.warn('[gateway] Warning: Failed to build Trivia Royale. Game may not load.');
    }
  }
}

// ─── Game directory resolver ───
const GAMES_DIR = resolve(PROJECT_ROOT, 'games');

function findGameDir(gameId: string): string | null {
  // Scan games/ for a directory matching the game ID
  if (existsSync(GAMES_DIR)) {
    for (const entry of readdirSync(GAMES_DIR)) {
      const fullPath = join(GAMES_DIR, entry);
      if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) continue;
      // Direct match
      if (entry === gameId) return fullPath;
      // Contains the id (handles "099-idle-lemonade-stand" → "idle-lemonade")
      if (entry.includes(gameId)) return fullPath;
      // Strip numeric prefix: "099-idle-lemonade-stand" → "idle-lemonade-stand"
      const stripped = entry.replace(/^\d+-/, '');
      if (stripped === gameId || stripped.includes(gameId) || gameId.includes(stripped)) return fullPath;
    }
  }
  return null;
}

function isGameImplemented(gameId: string): boolean {
  return findGameDir(gameId) !== null;
}

function isGameRegistered(gameId: string): boolean {
  return REGISTRY.games.some(g => g.id === gameId);
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
      return json(res, 200, REGISTRY);
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

    // Trivia Royale Vite build assets (/assets/*)
    if (pathname.startsWith('/assets/')) {
      const TRIVIA_ASSETS = resolve(PROJECT_ROOT, 'games/trivia-royale/assets');
      const subPath = pathname.slice(1); // 'assets/index-xxx.js'
      const filePath = resolve(PROJECT_ROOT, 'games/trivia-royale', subPath);
      if (!filePath.startsWith(TRIVIA_ASSETS)) {
        return json(res, 403, { error: 'Forbidden' });
      }
      return serveFile(res, filePath) || json(res, 404, { error: 'Asset not found' });
    }

    // Game static files (/games/:id/*)
    if (pathname.startsWith('/games/')) {
      const parts = pathname.split('/').filter(Boolean); // ['games', 'gameId', ...rest]
      if (parts.length >= 2) {
        const gameId = parts[1];
        const subPath = parts.slice(2).join('/') || 'index.html';

        const gameDir = findGameDir(gameId);
        if (gameDir) {
          const filePath = resolve(gameDir, subPath);
          if (!filePath.startsWith(gameDir)) {
            return json(res, 403, { error: 'Forbidden' });
          }
          if (serveFile(res, filePath)) return;
        }

        // Game registered but not built — serve Coming Soon page
        if (isGameRegistered(gameId)) {
          const comingSoonPath = resolve(PROJECT_ROOT, 'hub/coming-soon.html');
          if (existsSync(comingSoonPath)) {
            // Inject game info into coming-soon page
            const game = REGISTRY.games.find(g => g.id === gameId);
            if (game) {
              let html = readFileSync(comingSoonPath, 'utf-8');
              html = html.replace(/__GAME_NAME__/g, game.name)
                         .replace(/__GAME_DESC__/g, game.description)
                         .replace(/__GAME_ICON__/g, game.icon || getCategoryIcon(game.category))
                         .replace(/__GAME_ID__/g, game.id);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              return res.end(html);
            }
          }
        }

        // Unknown game
        return json(res, 404, { error: `Game "${gameId}" not found or not built yet` });
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
