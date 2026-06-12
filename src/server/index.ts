import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ClientMessage, ServerMessage, GameState, Player, Question,
  RoomState, GAME_CONFIG
} from '../shared/types.js';
import { selectQuestions } from '../../questions/bank.js';

// ─── Room ───
interface Room {
  id: string;
  players: Map<string, Player>;
  sockets: Map<string, WebSocket>;
  state: GameState;
  currentQuestionIndex: number;
  questionSet: Question[];
  answers: Map<string, { optionIndex: number; timestamp: number }>;
  timer: ReturnType<typeof setTimeout> | null;
  timeLeft: number;
  questionStartTime: number;
  countdownTick: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, Room>();
let waitingRoom: Room | null = null;

function createRoom(): Room {
  const id = 'room-' + Math.random().toString(36).substring(2, 8);
  const room: Room = {
    id,
    players: new Map(),
    sockets: new Map(),
    state: 'waiting',
    currentQuestionIndex: 0,
    questionSet: [],
    answers: new Map(),
    timer: null,
    timeLeft: 0,
    questionStartTime: 0,
    countdownTick: null,
  };
  rooms.set(id, room);
  return room;
}

function getOrCreateWaitingRoom(): Room {
  if (waitingRoom && waitingRoom.state === 'waiting' && waitingRoom.players.size < GAME_CONFIG.MAX_PLAYERS) {
    return waitingRoom;
  }
  waitingRoom = createRoom();
  return waitingRoom;
}

function broadcast(room: Room, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function getRoomState(room: Room): RoomState {
  return {
    roomId: room.id,
    players: Array.from(room.players.values()),
    state: room.state,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: GAME_CONFIG.QUESTIONS_PER_ROUND,
    timeLeft: room.timeLeft,
  };
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Game Flow ───

function startCountdown(room: Room) {
  room.state = 'countdown';
  room.timeLeft = GAME_CONFIG.COUNTDOWN_DURATION;
  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });

  let count = GAME_CONFIG.COUNTDOWN_DURATION;
  broadcast(room, { type: 'countdown', value: count });

  room.countdownTick = setInterval(() => {
    count--;
    if (count <= 0) {
      if (room.countdownTick) clearInterval(room.countdownTick);
      room.countdownTick = null;
      startQuestion(room);
    } else {
      broadcast(room, { type: 'countdown', value: count });
    }
  }, 1000);
}

function startQuestion(room: Room) {
  if (room.currentQuestionIndex >= GAME_CONFIG.QUESTIONS_PER_ROUND) {
    endGame(room);
    return;
  }

  room.state = 'question';
  room.answers.clear();
  room.timeLeft = GAME_CONFIG.SECONDS_PER_QUESTION;
  room.questionStartTime = Date.now();

  // Reset player answer state
  for (const p of room.players.values()) {
    p.lastAnswerIndex = -1;
    p.lastAnswerTime = 0;
  }

  const q = room.questionSet[room.currentQuestionIndex];

  broadcast(room, {
    type: 'question',
    question: q,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: GAME_CONFIG.QUESTIONS_PER_ROUND,
    timeLeft: room.timeLeft,
  });

  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });

  // Tick timer
  const tickInterval = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      clearInterval(tickInterval);
      revealAnswer(room);
    } else {
      // Sync time to clients
      broadcast(room, { type: 'time_sync', serverTime: Date.now(), timeLeft: room.timeLeft });
    }
  }, 1000);

  room.timer = tickInterval as any;
}

function revealAnswer(room: Room) {
  room.state = 'reveal';

  if (room.timer) {
    clearInterval(room.timer as any);
    room.timer = null;
  }

  const q = room.questionSet[room.currentQuestionIndex];

  // Score answers
  for (const [pid, answer] of room.answers) {
    const player = room.players.get(pid)!;
    if (answer.optionIndex === q.correctIndex) {
      const elapsed = answer.timestamp - room.questionStartTime;
      const secondsRemaining = Math.max(0, GAME_CONFIG.SECONDS_PER_QUESTION - elapsed / 1000);
      const points = GAME_CONFIG.POINTS_CORRECT + Math.round(secondsRemaining * GAME_CONFIG.POINTS_SPEED_BONUS);
      player.score += points;
      player.streak++;
    } else {
      player.streak = 0;
    }
  }

  // Compute rankings
  const ranked = Array.from(room.players.values())
    .filter(p => p.alive)
    .sort((a, b) => b.score - a.score || a.lastAnswerTime - b.lastAnswerTime);

  ranked.forEach((p, i) => { p.rank = i + 1; });

  // Send answer result to each player
  for (const [pid, player] of room.players) {
    if (!player.alive) continue;
    const isEliminated = false; // No mid-game elimination in V1
    send(room.sockets.get(pid)!, {
      type: 'answer_result',
      correctIndex: q.correctIndex,
      players: ranked,
      yourScore: player.score,
      yourRank: player.rank,
      isEliminated,
    });
  }

  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });

  // Wait then next question
  room.timer = setTimeout(() => {
    room.currentQuestionIndex++;
    startQuestion(room);
  }, GAME_CONFIG.REVEAL_DURATION * 1000) as any;
}

function endGame(room: Room) {
  room.state = 'results';

  const ranked = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score || a.lastAnswerTime - b.lastAnswerTime);

  ranked.forEach((p, i) => { p.rank = i + 1; });

  const winnerId = ranked[0]?.id || '';

  for (const [pid, player] of room.players) {
    send(room.sockets.get(pid)!, {
      type: 'game_over',
      rankings: ranked,
      winnerId,
      yourRank: player.rank,
      yourScore: player.score,
    });
  }

  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });

  // Clean up room after a delay
  setTimeout(() => {
    rooms.delete(room.id);
    if (waitingRoom === room) waitingRoom = null;
  }, 30000);
}

// ─── Connection Handler ───

function handleConnection(ws: WebSocket) {
  let playerId = '';
  let currentRoom: Room | null = null;

  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'join': {
        if (currentRoom) {
          send(ws, { type: 'error', code: 'ALREADY_JOINED', message: 'Already in a room' });
          return;
        }

        playerId = 'p-' + Math.random().toString(36).substring(2, 8);
        const room = getOrCreateWaitingRoom();
        currentRoom = room;

        const player: Player = {
          id: playerId,
          name: msg.name || `Player-${playerId.slice(-4)}`,
          score: 0,
          alive: true,
          lastAnswerTime: 0,
          lastAnswerIndex: -1,
          streak: 0,
          rank: 0,
        };

        room.players.set(playerId, player);
        room.sockets.set(playerId, ws);

        send(ws, {
          type: 'joined',
          playerId,
          roomId: room.id,
          name: player.name,
        });

        broadcast(room, { type: 'room_update', roomState: getRoomState(room) });

        // Auto-start when min players reached
        if (room.players.size >= GAME_CONFIG.MIN_PLAYERS && room.state === 'waiting') {
          room.questionSet = selectQuestions(GAME_CONFIG.QUESTIONS_PER_ROUND);
          // Give a small grace period for more players
          room.timer = setTimeout(() => {
            if (room.state === 'waiting') {
              startCountdown(room);
            }
          }, 3000) as any;
        }
        break;
      }

      case 'answer': {
        if (!currentRoom || currentRoom.state !== 'question') return;
        if (currentRoom.answers.has(playerId)) return; // already answered

        const q = currentRoom.questionSet[currentRoom.currentQuestionIndex];
        if (msg.questionId !== q.id) return;

        currentRoom.answers.set(playerId, {
          optionIndex: msg.optionIndex,
          timestamp: msg.timestamp,
        });

        const player = currentRoom.players.get(playerId);
        if (player) {
          player.lastAnswerIndex = msg.optionIndex;
          player.lastAnswerTime = msg.timestamp;
        }

        // If all alive players answered, reveal immediately
        const aliveCount = Array.from(currentRoom.players.values()).filter(p => p.alive).length;
        if (currentRoom.answers.size >= aliveCount) {
          if (currentRoom.timer) {
            clearInterval(currentRoom.timer as any);
            currentRoom.timer = null;
          }
          revealAnswer(currentRoom);
        }
        break;
      }

      case 'ready': {
        // Acknowledged but not needed in V1
        break;
      }

      case 'play_again': {
        if (currentRoom) {
          // Leave current room
          currentRoom.players.delete(playerId);
          currentRoom.sockets.delete(playerId);
          currentRoom.answers.delete(playerId);
          broadcast(currentRoom, { type: 'room_update', roomState: getRoomState(currentRoom) });
          if (currentRoom.players.size === 0) {
            rooms.delete(currentRoom.id);
            if (waitingRoom === currentRoom) waitingRoom = null;
          }
        }
        currentRoom = null;
        playerId = '';
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && playerId) {
      const player = currentRoom.players.get(playerId);
      if (player) player.alive = false;
      currentRoom.sockets.delete(playerId);
      currentRoom.answers.delete(playerId);
      broadcast(currentRoom, { type: 'room_update', roomState: getRoomState(currentRoom) });

      // Check if only one player left during question
      if (currentRoom.state === 'question') {
        const alivePlayers = Array.from(currentRoom.players.values()).filter(p => p.alive);
        if (alivePlayers.length <= 1) {
          endGame(currentRoom);
        }
      }

      // Clean empty rooms
      const anyAlive = Array.from(currentRoom.players.values()).some(p => p.alive);
      if (!anyAlive) {
        if (currentRoom.timer) clearTimeout(currentRoom.timer as any);
        if (currentRoom.countdownTick) clearInterval(currentRoom.countdownTick);
        rooms.delete(currentRoom.id);
        if (waitingRoom === currentRoom) waitingRoom = null;
      }
    }
  });

  // Heartbeat
  ws.on('ping', () => ws.pong());
}

// ─── HTTP Server + WebSocket ───

const PORT = parseInt(process.env.PORT || '3001', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(__dirname, '../../dist/client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: any) {
  let filePath = join(CLIENT_DIR, req.url === '/' ? 'index.html' : req.url!);
  const ext = extname(filePath);
  if (!ext || !MIME_TYPES[ext]) filePath = join(CLIENT_DIR, 'index.html');

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ct = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
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

  if (process.env.NODE_ENV === 'production') {
    if (serveStatic(req, res)) return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', handleConnection);

server.listen(PORT, () => {
  console.log(`🎮 Astrocade Trivia Royale server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
});
