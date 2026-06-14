// Trivia Royale standalone server — imports game logic from game-logic.ts
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { handleConnection, rooms } from './game-logic.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(__dirname, '../../dist/client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req: any, res: any) {
  const urlPath = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  let filePath = resolve(CLIENT_DIR, urlPath);
  if (!filePath.startsWith(resolve(CLIENT_DIR))) return false;
  const ext = extname(filePath);
  if (!ext || !MIME_TYPES[ext]) return false;
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
    return true;
  }
  return false;
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  if (process.env.NODE_ENV === 'production') { if (serveStatic(req, res)) return; }
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', handleConnection);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Trivia Royale server on port ${PORT}`);
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}/ws`);
  console.log(`  Health:    http://0.0.0.0:${PORT}/health`);
});
