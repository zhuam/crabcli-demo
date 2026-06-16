// Extracted game logic from src/server/index.ts — reusable by both old server and gateway
import { WebSocket } from 'ws';
import {
  ClientMessage, ServerMessage, GameState, Player, Question,
  RoomState, GAME_CONFIG
} from '../shared/types.js';
import { selectQuestions } from '../../questions/bank.js';

export interface Room {
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
  questionEndTime: number;
  countdownTick: ReturnType<typeof setInterval> | null;
  countdownEndTime: number;
}

export const rooms = new Map<string, Room>();
export let waitingRoom: Room | null = null;

export function createRoom(): Room {
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
    questionEndTime: 0,
    countdownTick: null,
    countdownEndTime: 0,
  };
  rooms.set(id, room);
  return room;
}

export function getOrCreateWaitingRoom(): Room {
  if (waitingRoom && waitingRoom.state === 'waiting' && waitingRoom.players.size < GAME_CONFIG.MAX_PLAYERS) {
    return waitingRoom;
  }
  waitingRoom = createRoom();
  return waitingRoom;
}

export function broadcast(room: Room, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

export function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
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

export function endGame(room: Room) {
  // Prevent double-end (e.g. all-questions-done + disconnect both trigger endGame)
  if (room.state === 'results') return;
  // Clean up any pending question/reveal timers — game is over
  if (room.timer) { clearInterval(room.timer as any); clearTimeout(room.timer as any); room.timer = null; }
  if (room.countdownTick) { clearInterval(room.countdownTick); room.countdownTick = null; }
  room.state = 'results';
  const ranked = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score || a.lastAnswerTime - b.lastAnswerTime);
  ranked.forEach((p, i) => { p.rank = i + 1; });
  const winnerId = ranked[0]?.id || '';
  for (const [pid, player] of room.players) {
    const ws = room.sockets.get(pid);
    if (!ws) continue;
    send(ws, {
      type: 'game_over',
      rankings: ranked,
      winnerId,
      yourRank: player.rank,
      yourScore: player.score,
    });
  }
  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });
  setTimeout(() => {
    rooms.delete(room.id);
    if (waitingRoom === room) waitingRoom = null;
  }, 30000);
}

function revealAnswer(room: Room) {
  room.state = 'reveal';
  if (room.timer) { clearInterval(room.timer as any); room.timer = null; }
  const q = room.questionSet[room.currentQuestionIndex];
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
  const ranked = Array.from(room.players.values())
    .filter(p => p.alive)
    .sort((a, b) => b.score - a.score || a.lastAnswerTime - b.lastAnswerTime);
  ranked.forEach((p, i) => { p.rank = i + 1; });
  for (const [pid, player] of room.players) {
    if (!player.alive) continue;
    const ws = room.sockets.get(pid);
    if (!ws) continue;
    const answer = room.answers.get(pid);
    const elapsedMs = answer ? answer.timestamp - room.questionStartTime : GAME_CONFIG.SECONDS_PER_QUESTION * 1000;
    const isCorrect = answer && answer.optionIndex === q.correctIndex;
    const secondsRemaining = Math.max(0, GAME_CONFIG.SECONDS_PER_QUESTION - elapsedMs / 1000);
    const pointsEarned = isCorrect ? GAME_CONFIG.POINTS_CORRECT + Math.round(secondsRemaining * GAME_CONFIG.POINTS_SPEED_BONUS) : 0;
    send(ws, {
      type: 'answer_result',
      correctIndex: q.correctIndex,
      players: ranked,
      yourScore: player.score,
      yourRank: player.rank,
      isEliminated: false,
      elapsedMs,
      pointsEarned,
    });
  }
  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });
  room.timer = setTimeout(() => {
    room.currentQuestionIndex++;
    startQuestion(room);
  }, GAME_CONFIG.REVEAL_DURATION * 1000) as any;
}

function startQuestion(room: Room) {
  if (room.currentQuestionIndex >= GAME_CONFIG.QUESTIONS_PER_ROUND) { endGame(room); return; }
  room.state = 'question';
  room.answers.clear();
  room.timeLeft = GAME_CONFIG.SECONDS_PER_QUESTION;
  room.questionStartTime = Date.now();
  for (const p of room.players.values()) { p.lastAnswerIndex = -1; p.lastAnswerTime = 0; }
  const q = room.questionSet[room.currentQuestionIndex];
  broadcast(room, {
    type: 'question',
    question: q,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: GAME_CONFIG.QUESTIONS_PER_ROUND,
    timeLeft: room.timeLeft,
  });
  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });
  room.questionEndTime = Date.now() + GAME_CONFIG.SECONDS_PER_QUESTION * 1000;
  const tickInterval = setInterval(() => {
    room.timeLeft = Math.ceil((room.questionEndTime - Date.now()) / 1000);
    if (room.timeLeft <= 0) { clearInterval(tickInterval); room.timeLeft = 0; revealAnswer(room); }
    else { broadcast(room, { type: 'time_sync', serverTime: Date.now(), timeLeft: room.timeLeft }); }
  }, 250);
  room.timer = tickInterval as any;
}

export function startCountdown(room: Room) {
  room.state = 'countdown';
  room.timeLeft = GAME_CONFIG.COUNTDOWN_DURATION;
  room.countdownEndTime = Date.now() + GAME_CONFIG.COUNTDOWN_DURATION * 1000;
  broadcast(room, { type: 'room_update', roomState: getRoomState(room) });
  let count = GAME_CONFIG.COUNTDOWN_DURATION;
  broadcast(room, { type: 'countdown', value: count });
  room.countdownTick = setInterval(() => {
    count--;
    if (count <= 0) {
      if (room.countdownTick) clearInterval(room.countdownTick);
      room.countdownTick = null;
      // Guard: if not enough alive players, end game instead of starting question
      const alivePlayers = Array.from(room.players.values()).filter(p => p.alive);
      if (alivePlayers.length < GAME_CONFIG.MIN_PLAYERS) {
        endGame(room);
      } else {
        startQuestion(room);
      }
    } else { broadcast(room, { type: 'countdown', value: count }); }
  }, 1000);
}

export function handleConnection(ws: WebSocket) {
  let playerId = '';
  let currentRoom: Room | null = null;

  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()); }
    catch { send(ws, { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' }); return; }

    switch (msg.type) {
      case 'join': {
        if (currentRoom) { send(ws, { type: 'error', code: 'ALREADY_JOINED', message: 'Already in a room' }); return; }
        playerId = 'p-' + Math.random().toString(36).substring(2, 8);
        const room = getOrCreateWaitingRoom();
        currentRoom = room;
        const player: Player = {
          id: playerId,
          name: msg.name || `Player-${playerId.slice(-4)}`,
          score: 0, alive: true, lastAnswerTime: 0, lastAnswerIndex: -1, streak: 0, rank: 0,
        };
        room.players.set(playerId, player);
        room.sockets.set(playerId, ws);
        send(ws, { type: 'joined', playerId, roomId: room.id, name: player.name });
        broadcast(room, { type: 'room_update', roomState: getRoomState(room) });
        if (room.players.size >= GAME_CONFIG.MIN_PLAYERS && room.state === 'waiting') {
          room.questionSet = selectQuestions(GAME_CONFIG.QUESTIONS_PER_ROUND);
          room.timer = setTimeout(() => { if (room.state === 'waiting') startCountdown(room); }, 3000) as any;
        }
        break;
      }
      case 'answer': {
        if (!currentRoom || currentRoom.state !== 'question') return;
        if (currentRoom.answers.has(playerId)) return;
        if (typeof msg.optionIndex !== 'number' || msg.optionIndex < 0 || msg.optionIndex > 3) return;
        const q = currentRoom.questionSet[currentRoom.currentQuestionIndex];
        if (msg.questionId !== q.id) return;
        const serverTimestamp = Date.now();
        currentRoom.answers.set(playerId, { optionIndex: msg.optionIndex, timestamp: serverTimestamp });
        const player = currentRoom.players.get(playerId);
        if (player) { player.lastAnswerIndex = msg.optionIndex; player.lastAnswerTime = serverTimestamp; }
        const aliveCount = Array.from(currentRoom.players.values()).filter(p => p.alive).length;
        if (currentRoom.answers.size >= aliveCount) {
          if (currentRoom.timer) { clearInterval(currentRoom.timer as any); currentRoom.timer = null; }
          revealAnswer(currentRoom);
        }
        break;
      }
      case 'ready': break;
      case 'play_again': {
        if (currentRoom) {
          currentRoom.players.delete(playerId);
          currentRoom.sockets.delete(playerId);
          currentRoom.answers.delete(playerId);
          broadcast(currentRoom, { type: 'room_update', roomState: getRoomState(currentRoom) });
          if (currentRoom.players.size === 0) { rooms.delete(currentRoom.id); if (waitingRoom === currentRoom) waitingRoom = null; }
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
      if (currentRoom.state === 'question') {
        const alivePlayers = Array.from(currentRoom.players.values()).filter(p => p.alive);
        if (alivePlayers.length <= 1) endGame(currentRoom);
      }
      if (currentRoom.state === 'countdown') {
        const alivePlayers = Array.from(currentRoom.players.values()).filter(p => p.alive);
        if (alivePlayers.length < GAME_CONFIG.MIN_PLAYERS) {
          if (currentRoom.countdownTick) { clearInterval(currentRoom.countdownTick); currentRoom.countdownTick = null; }
          endGame(currentRoom);
        }
      }
      const anyAlive = Array.from(currentRoom.players.values()).some(p => p.alive);
      if (!anyAlive) {
        if (currentRoom.timer) clearTimeout(currentRoom.timer as any);
        if (currentRoom.countdownTick) clearInterval(currentRoom.countdownTick);
        rooms.delete(currentRoom.id);
        if (waitingRoom === currentRoom) waitingRoom = null;
      }
    }
  });

  ws.on('ping', () => ws.pong());
}
