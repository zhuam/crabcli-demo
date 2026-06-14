// Hub shared types for CrabCLI Arcade

// ---- Game Registry ----
export interface GameEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  thumbnail: string;
  path: string;
  hasServer: boolean;
  wsPath?: string;
  players: string;
  version: string;
  featured?: boolean;
  rating?: number;
}

export interface CategoryEntry {
  id: string;
  name: string;
  icon: string;
}

export interface GameRegistry {
  games: GameEntry[];
  categories: CategoryEntry[];
}

// ---- Auth ----
export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: number;
  isGuest: boolean;
}

export interface LoginRequest {
  name: string;
  email?: string;
}

export interface LoginResponse {
  user: User;
  token?: string;
}

// ---- Scores ----
export interface ScoreEntry {
  id: string;
  userId: string;
  userName: string;
  gameId: string;
  score: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SubmitScoreRequest {
  gameId: string;
  score: number;
  metadata?: Record<string, unknown>;
}
