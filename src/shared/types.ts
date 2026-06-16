// Shared types for Astrocade Trivia Royale
// Used by both server and client

// ─── Game State ───
export type GameState =
  | 'waiting'
  | 'countdown'
  | 'question'
  | 'reveal'
  | 'results';

// ─── Question ───
export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;       // 0-3
  category: string;
  difficulty: number;         // 1-3
}

// ─── Player ───
export interface Player {
  id: string;
  name: string;
  score: number;
  alive: boolean;
  lastAnswerTime: number;     // ms timestamp when answer was submitted
  lastAnswerIndex: number;    // -1 if not answered
  streak: number;             // consecutive correct answers
  rank: number;               // current rank in room
}

// ─── Room ───
export interface RoomState {
  roomId: string;
  players: Player[];
  state: GameState;
  currentQuestionIndex: number;
  totalQuestions: number;
  timeLeft: number;           // seconds remaining for current phase
}

// ─── Client → Server Messages ───
export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'answer'; questionId: string; optionIndex: number; timestamp: number }
  | { type: 'ready' }
  | { type: 'play_again' };

// ─── Server → Client Messages ───
export type ServerMessage =
  | { type: 'joined'; playerId: string; roomId: string; name: string }
  | { type: 'room_update'; roomState: RoomState }
  | { type: 'question'; question: Question; questionIndex: number; totalQuestions: number; timeLeft: number }
  | { type: 'answer_result'; correctIndex: number; players: Player[]; yourScore: number; yourRank: number; isEliminated: boolean; elapsedMs: number; pointsEarned: number }
  | { type: 'game_over'; rankings: Player[]; winnerId: string; yourRank: number; yourScore: number }
  | { type: 'countdown'; value: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'time_sync'; serverTime: number; timeLeft: number };

// ─── Config ───
export const GAME_CONFIG = {
  QUESTIONS_PER_ROUND: 10,
  SECONDS_PER_QUESTION: 10,
  REVEAL_DURATION: 3,         // seconds to show answer
  COUNTDOWN_DURATION: 3,      // 3-2-1 countdown
  MIN_PLAYERS: 2,             // minimum to start (for testing; production: 4+)
  MAX_PLAYERS: 8,             // max per room
  ELIMINATE_COUNT: 0,         // 0 = no mid-game elimination; top 3 win
  TOP_N_WIN: 3,               // top 3 advance / win
  POINTS_CORRECT: 100,        // base points for correct answer
  POINTS_SPEED_BONUS: 10,     // bonus per second remaining
  HEARTBEAT_INTERVAL: 15000,  // ms
  ANSWER_TIMEOUT_BUFFER: 500, // ms grace period after question ends
} as const;

// ─── High Score (localStorage) ───
export interface HighScoreEntry {
  score: number;
  date: string;
  rank: number;
  playerCount: number;
}
