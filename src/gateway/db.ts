// Gateway Database Setup — SQLite with better-sqlite3
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const DB_PATH = resolve(DATA_DIR, 'crabcli.db');

// Create data directory if it doesn't exist
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    passwordHash TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    gameId TEXT NOT NULL,
    score INTEGER NOT NULL,
    metadata TEXT,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    userId TEXT NOT NULL,
    gameId TEXT NOT NULL,
    PRIMARY KEY(userId, gameId),
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS scores_game_score ON scores(gameId, score DESC);
  CREATE INDEX IF NOT EXISTS users_name ON users(name);
`);

// Migration: add passwordHash column if missing
try {
  db.exec(`ALTER TABLE users ADD COLUMN passwordHash TEXT`);
} catch {
  // Column already exists, ignore
}

export { db };
