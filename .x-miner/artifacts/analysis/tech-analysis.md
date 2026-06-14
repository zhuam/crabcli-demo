# Technical Analysis: Game Hub for CrabCLI Arcade

## Issue #101: 构建一个游戏大厅

**Analyst**: tech-analyst (Technical Perspective)
**Date**: 2026-06-14
**Repo**: https://github.com/zhuam/crabcli-demo

---

## 1. Current State Assessment

### 1.1 Architecture Overview

The project **already has a Game Hub implemented** with a well-structured architecture:

| Component | File | Purpose |
|-----------|------|---------|
| **Gateway Server** | `src/gateway/server.ts` | Unified HTTP gateway on PORT 3000, path-based routing for all games |
| **Hub UI** | `hub/index.html` + `hub/hub.js` + `hub/hub.css` | Game discovery page with search, categories, favorites |
| **Game Registry** | `games/registry.json` | JSON manifest of 26 games with metadata (id, name, category, tags, rating, etc.) |
| **Auth System** | `src/gateway/auth.ts` | JWT-based register/login/me with cookie-based session |
| **Database** | `src/gateway/db.ts` | SQLite (better-sqlite3) with users, scores, favorites tables |
| **Scores API** | `src/gateway/scores.ts` | Submit/query scores, per-game leaderboards |
| **Favorites API** | `src/gateway/favorites.ts` | Per-user favorite game management |
| **Shared Styles** | `games/shared/game-frame.css` | Consistent back-to-hub button + game frame wrapper |
| **Type Definitions** | `src/shared/hub-types.ts` | TypeScript interfaces for GameEntry, User, Score, etc. |

### 1.2 Implemented Games (on disk)

| Game ID | Directory | Type | Notes |
|---------|-----------|------|-------|
| `idle-lemonade` | `games/099-idle-lemonade-stand/` | Single-player idle | Static HTML/JS/CSS, includes `game-frame.css`, `recordPlayed()` integration |
| `trivia-royale` | `games/trivia-royale/` | Multiplayer WebSocket | Vite-built SPA, WebSocket game logic in `src/server/game-logic.ts` |

### 1.3 Registered but Not Implemented (registry.json only)

24 additional games are registered in the manifest but have no directories yet: `cosmic-shooter`, `word-wizard`, `tower-defense`, `pixel-racer`, `match-three`, `chess-club`, `snake-reborn`, `sudoku-master`, `farm-tycoon`, `space-invaders`, `card-battle`, `bubble-pop`, `minesweeper`, `cookie-clicker`, `platformer`, `go-master`, `2048`, `nonogram`, `idle-miner`, `dungeon-crawl`, `checkers`, `solitaire`.

The hub correctly shows these as "Coming Soon" via HEAD request detection (`hub/hub.js:145-152`).

---

## 2. Issue Requirements Analysis

### 2.1 Requirement: 支持几百款游戏的导航、查找

**Status: PARTIALLY MET — needs scalability improvements**

Current implementation:
- Client-side rendering of all games from `/api/games` JSON response
- Category chip filtering (6 categories: all, puzzle, idle, action, strategy, casual)
- Debounced text search (300ms) across name, description, category, tags
- Pagination with PAGE_SIZE=24
- Sort options: Popular, Newest, Rating, A-Z
- Multiplayer-only toggle filter

**Scaling concerns at 100-500 games:**
1. **Initial load**: `hub/hub.js` fires one HEAD request per registered game on boot (`/games/${game.id}/`) to detect implemented games. At 200 games, this is 200 sequential HTTP requests — will cause noticeable loading delay.
2. **Memory**: The full registry JSON is loaded and held in browser memory. At 500 games with current schema (~200 bytes per game), this is ~100KB — acceptable but growing.
3. **DOM rendering**: All visible games rendered into the grid at once. At 500 games with pagination (24 per page), virtual scrolling is not implemented.

**Recommended solutions:**
- **Short-term (100 games)**: Batch the implemented-game detection into a single server endpoint (e.g., `GET /api/games/implemented` returns `{implemented: Set<string>}`) instead of individual HEAD requests.
- **Medium-term (200 games)**: Server-side search index instead of client-side filtering. Add `GET /api/games/search?q=&category=&page=&limit=` endpoint.
- **Long-term (500+ games)**: Virtual scrolling in the grid, lazy-loading game cards, and consider a lightweight search index (e.g., MiniSearch on the client with pre-indexed JSON).

### 2.2 Requirement: 游戏的HTTP端口需要统一

**Status: FULLY MET — already implemented**

The gateway architecture at `src/gateway/server.ts:16-17` already provides complete port unification:

```typescript
const PORT = parseInt(process.env.PORT || '3000', 10);
```

All games are served through a single port via path-based routing:
- **Static games**: `/games/:id/*` → file server reads from `games/:id/` directory
- **WebSocket games**: `/ws/game/:id` → multiplexed to game-specific handlers in `game-logic.ts`
- **Hub page**: `/` → serves `hub/index.html`
- **API routes**: `/api/*` → auth, scores, favorites endpoints

The `findGameDir()` function (`server.ts:46-62`) handles numeric prefixes in directory names (e.g., `099-idle-lemonade-stand` maps to game ID `idle-lemonade`).

**No changes needed.** New games should follow the convention:
1. Create directory under `games/<id>/` with `index.html`
2. Include `game-frame.css` for consistent styling: `<link rel="stylesheet" href="/games/shared/game-frame.css" />`
3. Register in `games/registry.json` with proper metadata
4. For multiplayer games: add WebSocket handler in `src/server/game-logic.ts` under the game ID case

### 2.3 Requirement: 如果有注册账户，需要统一账户

**Status: FULLY MET — already implemented**

The account system provides:
- **Registration**: `POST /api/auth/register` with name + password → JWT token in HttpOnly cookie
- **Login**: `POST /api/auth/login` with name + password → JWT token
- **Session check**: `GET /api/auth/me` → returns current user or 401
- **Database schema** (`db.ts:23-49`):
  - `users` table: id (UUID), name (unique), passwordHash (SHA-256), createdAt
  - `scores` table: id, userId, gameId, score, metadata, createdAt — supports cross-game score history
  - `favorites` table: userId + gameId composite key — per-user game favorites

The Hub UI (`hub/hub.js`) already implements:
- Guest-first onboarding (no forced auth to browse)
- Sign-in modal with login/register tabs
- User badge with avatar initial in header
- Profile panel with stats (games played, scores, favorites)
- Favorites toggle on each game card
- Guest banner with dismiss option

**Security concern**: Password hashing uses SHA-256 (`auth.ts:10`), which is not suitable for password storage. Should migrate to bcrypt or argon2 for production use. The `JWT_SECRET` defaults to `'crabcli-arcade-secret'` — must be set via environment variable in production.

---

## 3. Architecture Evaluation

### 3.1 Strengths

1. **Single Gateway Pattern**: Clean, centralized routing. All games share one port, one domain, one TLS certificate. Simple to deploy and monitor.
2. **File-based Game Registration**: Adding a game = adding a directory + one JSON entry. No code changes to the gateway needed for static games.
3. **Progressive Enhancement**: The hub works without auth; games work independently; shared styles maintain visual consistency.
4. **Type Safety**: TypeScript interfaces in `hub-types.ts` define the contract for games, auth, and scores.

### 3.2 Risks

1. **No build pipeline for non-Vite games**: Only `trivia-royale` has a build step. Games with plain HTML/JS/CSS work fine, but games using frameworks (React, Svelte) would need individual build configurations.
2. **Asset path conflicts**: The `/assets/*` route (`server.ts:192-212`) searches all game directories for matching filenames. If two games have assets with the same name, the first match wins — potential collision.
3. **SQLite single-writer**: `better-sqlite3` is synchronous and single-writer. Under high concurrent load (many score submissions), this could become a bottleneck. WAL mode helps but doesn't eliminate the constraint.
4. **No game sandboxing**: Games run in the same origin. A malicious or buggy game could access `/api/*` endpoints on behalf of a logged-in user (the cookie is sent with all same-origin requests). Consider per-game CSP headers or iframe sandboxing for user-contributed games.

---

## 4. Recommendations for Scaling to Hundreds of Games

### 4.1 Immediate (no breaking changes)

| Action | Effort | Impact |
|--------|--------|--------|
| Batch implemented-game detection into single API call | Low | Eliminates N HEAD requests on hub load |
| Add `implemented: true/false` field to registry JSON at build time | Low | Removes need for runtime detection entirely |
| Fix password hashing to bcrypt | Medium | Security hardening |
| Set `JWT_SECRET` from env only (no default) | Low | Security hardening |

### 4.2 Medium-term (for 100-200 games)

| Action | Effort | Impact |
|--------|--------|--------|
| Server-side search endpoint with text filtering | Medium | Offloads client-side computation |
| Asset path namespacing (`/games/:id/assets/*`) | Medium | Eliminates asset collision risk |
| Game metadata validation (JSON schema for registry.json) | Low | Prevents broken game entries |

### 4.3 Long-term (for 500+ games)

| Action | Effort | Impact |
|--------|--------|--------|
| Virtual scrolling in game grid | Medium | Smooth rendering of large lists |
| Client-side search index (MiniSearch) with pre-built index JSON | Medium | Instant search without server round-trip |
| PostgreSQL migration from SQLite | High | Concurrent write support, proper indexing |
| Game sandboxing via iframe + CSP | High | Security isolation for user-contributed games |

---

## 5. Existing Code Patterns to Follow

### 5.1 Adding a New Static Game

1. Create `games/<id>/index.html` (can include `app.js`, `style.css`)
2. Include shared styles: `<link rel="stylesheet" href="/games/shared/game-frame.css" />`
3. Add back-to-hub link: `<a href="/" class="back-to-hub">← Arcade</a>`
4. Call `recordPlayed('<id>')` on game launch (optional, for recently-played tracking)
5. Register in `games/registry.json` with full metadata
6. For score integration: call `POST /api/scores` from the game (requires auth)

### 5.2 Adding a New Multiplayer (WebSocket) Game

Follow steps 1-5 above, plus:
6. Add `hasServer: true` and `wsPath: "/ws/game/<id>"` in registry entry
7. Add a case in `src/server/game-logic.ts` → `handleConnection()` for the game ID
8. Or create a separate handler module and import it

---

## 6. Conclusion

The Game Hub infrastructure is **already substantially built** and addresses all three requirements from Issue #101:

1. **Navigation/Search**: ✅ Hub with category filtering, search, sorting, pagination
2. **Port Unification**: ✅ Single gateway on PORT 3000 with path-based routing
3. **Unified Accounts**: ✅ JWT auth with SQLite-backed user/score/favorite system

The main gap is **scaling performance** — the current client-side approach works well for the current 26 registered games but will need optimization (batched detection, server-side search, virtual scrolling) as the catalog grows toward hundreds of games. The two existing games in the `games/` directory (`trivia-royale`, `099-idle-lemonade-stand`) already follow the hub convention and serve as reference implementations for new games.
