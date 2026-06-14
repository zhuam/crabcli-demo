# UX Analysis Report: Game Hub — Issue #101

**Issue**: #101 — 构建一个游戏大厅
**Date**: 2026-06-14
**Analyst**: ux-analyst (ux-analyst in swarm-272fd307)
**Working dir**: `/workspace/ca5e6ebd-4699-40c1-8df0-ed57a54b2dae/crabcli-demo`

---

## Executive Summary

The crabcli-demo project has already implemented substantial infrastructure for a unified game hub: a single-port gateway (port 3000), a dark-theme hub UI with search/categories/favorites, JWT-based auth, and a JSON game registry with 24 game entries. However, only **2 games** actually exist on disk (`games/099-idle-lemonade-stand/` and `dist/client/` for trivia-royale). The issue asks for three things:

1. **Navigation/search for hundreds of games** — partially implemented, needs scaling UX
2. **Unified HTTP port** — already done (gateway on 3000)
3. **Unified account system** — exists but needs UX quality improvements

This report audits the current UX state, identifies gaps, and provides actionable recommendations.

---

## 1. Current UX State Assessment

### 1.1 What's Already Built (Evidence from code)

| Feature | File | Status |
|---------|------|--------|
| Unified gateway (port 3000) | `src/gateway/server.ts:15` | Complete — all routes served from one port |
| Hub UI (dark theme) | `hub/index.html`, `hub/hub.js`, `hub/hub.css` | Complete — responsive, 4-col→3→2→1 breakpoints |
| Game registry | `games/registry.json` | 24 games, 6 categories defined |
| Search + debounce | `hub/hub.js:536-542` | 300ms debounce, searches name/desc/category/tags |
| Category chips | `hub/hub.js:349-359` | All/Puzzle/Idle/Action/Strategy/Casual + Favorites (logged-in) |
| Featured carousel | `hub/hub.js:363-396` | Horizontal scroll, 6 featured games |
| Sort controls | `hub/hub.js:423-436` | Popular/Newest/Rating/A-Z |
| Pagination (Load More) | `hub/hub.js:490-505` | 24 per page |
| Loading skeleton | `hub/hub.js:97-121` | 8 skeleton cards with shimmer animation |
| Favorites UI | `hub/hub.js:179-209` | Heart button on cards, favorites category chip |
| Guest banner | `hub/index.html:12-15` | Dismissable welcome banner |
| Auth modal | `hub/index.html:101-126` | Login/Register tabs, username+password |
| Profile panel | `hub/index.html:129-149` | Dropdown with stats, favorites, sign-out |
| Mobile search | `hub/hub.css:725-761` | Expandable search icon → full-width bar |
| JWT auth | `src/gateway/auth.ts` | Register/login/me, SHA256+JWT, 7-day cookie |
| Scores API | `src/gateway/scores.ts` | Submit + leaderboard |
| Favorites API | `src/gateway/favorites.ts` | Toggle + list |

### 1.2 What's NOT Yet Implemented

| Gap | Impact | Severity |
|-----|--------|----------|
| Only 2 of 24 games exist on disk | Users click "play" on 22 games and see "not found" | **Critical** |
| No "Back to Hub" from game pages | Users lose navigation context inside games | High |
| No loading/transition state when launching a game | Jarring instant navigation without feedback | Medium |
| Guest high scores trapped in localStorage | No cross-device or cross-game profile without auth | Medium |
| No "Recently Played" section | Returning users must re-discover games | Medium |
| Game cards use category emoji, not game-specific icons | Visual blandness, games feel identical | Low |
| No keyboard navigation (tabindex, ARIA) | Accessibility barrier | Medium |

---

## 2. Navigation & Search UX for Hundreds of Games

### 2.1 Current Implementation Analysis

The current UX handles **~24 games** well. The architecture supports scaling but has specific breakpoints:

**Current search** (`hub/hub.js:412-419`):
- Searches: game name, description, category, tags
- 300ms debounce
- Full-text substring match (case-insensitive)
- **Limitation**: No fuzzy matching, no typo tolerance, no result highlighting

**Current filtering** (`hub/hub.js:399-441`):
- Single category selection (mutually exclusive)
- No multi-select filters
- No "multiplayer only" toggle
- Sort and filter combine correctly

**Current pagination** (`hub/hub.js:16-17, 490-505`):
- 24 games per page, "Load More" button
- **Problem**: At 200+ games, this means 8+ clicks to reach the bottom
- Virtual scrolling would be better at scale but is more complex

### 2.2 Scaling Recommendations

| Game Count | Current UX | Recommended Addition |
|------------|-----------|---------------------|
| 1-30 | Card grid + categories | Current state is fine |
| 30-100 | Card grid + search + pagination | Add "Recently Played" section; add multiplayer filter |
| 100-300 | Search-first + categories + pagination | Add faceted filters (multi-select genre, player count, difficulty); add search result highlighting |
| 300+ | Search-first + facets + virtual scroll | Replace "Load More" with intersection-observer infinite scroll; add "Browse by Alphabet" for large catalogs |

### 2.3 Specific UX Improvements for This Issue

**P0 — Immediate (for the current 24-game registry):**

1. **Handle "Not Yet Available" games gracefully** — When a user clicks a game that doesn't exist on disk, the gateway returns `404 {error: "Game not found or not built yet"}` (`server.ts:169`). The UX should show a friendly "Coming Soon" card instead of a raw JSON error. This is critical because 22 of 24 games are unimplemented.

2. **"Recently Played" section** — Add a `recentlyPlayed` localStorage key that records game ID + timestamp on each game launch. Display as a horizontal carousel above the main grid, limited to 6 games. For authenticated users, this should sync to the server via a `/api/activity` endpoint.

3. **Multiplayer filter toggle** — Add a small toggle/button near sort controls: `👥 Multiplayer only`. This filters to games where `players !== '1'`. The registry already has this data.

**P1 — For catalog growth (50+ games):**

4. **Faceted search panel** — A slide-out or inline filter panel with:
   - Multi-select genre checkboxes (Puzzle + Action)
   - Player count slider (1P, 2P, 3-4P, 5+)
   - Difficulty range (if games provide it)
   - "Favorites only" checkbox (alternative to category chip)

5. **Search result highlighting** — When searching "trivia", highlight the matching text in game names and descriptions.

---

## 3. Unified Port UX (Issue Requirement #2)

### 3.1 Current State: Already Done

The gateway (`src/gateway/server.ts`) unifies all traffic on **port 3000**:
- `/` → Hub page
- `/hub/*` → Hub CSS/JS
- `/games/:id/*` → Game static files
- `/api/*` → REST endpoints (auth, scores, favorites)
- `/ws/game/:id` → WebSocket game connections
- `/health` → Health check

**UX Impact**: Users never see ports. They interact with a single URL. This is the correct approach and requires no UX changes.

### 3.2 One Residual Issue

The old Trivia Royale server still listens on **port 3001** (`src/server/index.ts`). The dev proxy (`vite.config.ts`) forwards `/ws` to 3001. From a UX perspective, this is invisible to users — but during development, the port confusion may cause inconsistent behavior. This is a technical cleanup task, not a UX concern.

---

## 4. Unified Account UX (Issue Requirement #3)

### 4.1 Current Auth Flow

```
Hub → Click "Sign In" → Modal → Username + Password → Login or Register → JWT cookie set → User badge shown
```

**What works:**
- Guest can browse and play all games without auth
- Auth modal is an overlay (not a separate page) — low friction
- Login and Register are clearly separated tabs
- JWT cookie persists for 7 days
- Profile panel shows stats (games played, scores, favorites)

**What needs UX improvement:**

### 4.2 Guest → Account Journey

**Current**: No explicit "Continue as Guest" option. Users who don't sign in are implicitly guests with no indication of what they're missing.

**Recommended**:
```
First visit:
┌─────────────────────────────────────────┐
│ Welcome to CrabCLI Arcade!              │
│                                         │
│ Play all games instantly — or sign in   │
│ to track scores and save favorites.     │
│                                         │
│ [Start Playing as Guest]  [Sign In]     │
└─────────────────────────────────────────┘
```

The "Start Playing as Guest" button dismisses the banner and lets the user browse immediately. This is a lower-friction default than the current implicit-guest approach because it **explicitly communicates** that no account is needed.

### 4.3 Guest Data Migration

When a guest creates an account, their localStorage data (recently played, favorites if any, game-specific high scores) should be offered for merge:

```
┌─────────────────────────────────────────┐
│ Welcome, [username]!                    │
│                                         │
│ We found 3 games you played as a guest. │
│ Would you like to merge this data into  │
│ your account?                           │
│                                         │
│ [Merge My Data]  [Start Fresh]          │
└─────────────────────────────────────────┘
```

### 4.4 Profile Page Evolution

**Current** (`hub/index.html:129-149`): Dropdown panel with avatar, stats, favorites, sign-out.

**Recommended evolution** (Phase 2):
- Full `/profile` page route
- Display name, member-since, avatar
- Cross-game stats: total play time, games played, best scores
- Settings: theme toggle, notification preferences
- Achievement badges (future)

---

## 5. Game Launch UX Flow

### 5.1 Current Flow

```
Hub → Click game card → Browser navigates to /games/:id/
```

**Problems:**
- No loading state — instant navigation feels jarring
- No "Back to Hub" breadcrumb from game pages
- Game pages are standalone HTML — no hub chrome visible
- If game doesn't exist, raw JSON 404 is shown

### 5.2 Recommended Flow

```
Hub → Click game card → Loading overlay (1-3s)
                          Shows: game name, icon, "Preparing..."
                        → Game loads (iframe or same-page mount)
                        → "← Back to Hub" floating button visible
```

**Implementation options:**

| Approach | Pros | Cons |
|----------|------|------|
| **iframe** | Isolated game sandbox, hub chrome always visible | WebSocket/cross-origin issues, fullscreen not available |
| **Same-origin route** | Full browser APIs, no sandbox restrictions | No persistent hub chrome, back button navigates away |
| **Hybrid** | iframe for single-player, same-origin for multiplayer | More complex routing logic |

**Recommendation for current state**: Keep the current same-origin navigation (each game is its own `index.html`) but:

1. Add a loading overlay that appears for 500ms minimum when navigating to a game
2. Each game page should include a small "← Back to Arcade" link in the top-left corner
3. For unimplemented games, show a "Coming Soon" page with the game's description and an email notification signup

---

## 6. Visual Design System

### 6.1 Current Design Tokens (`hub/hub.css:6-26`)

The project has a well-defined dark theme:
- Primary: `#6c5ce7` (purple)
- Accent: `#fd79a8` (pink)
- Success: `#00b894` (green)
- Danger: `#e17055` (orange-red)
- Warning: `#fdcb6e` (yellow)
- Background: `#0a0e27` (deep navy)

This is consistent and professional. The tokens are CSS custom properties, making theme changes straightforward.

### 6.2 Game-Specific Icon System

**Current**: All games in a category share the same emoji icon (`hub/hub.js:24-27`):
```
puzzle: 🧩, idle: 🏪, action: ⚡, strategy: ♟️, casual: 🎯
```

**Problem**: 5 puzzle games all show 🧩 — users can't visually distinguish them.

**Recommendation**: Add per-game icons to the registry:
```json
{
  "id": "trivia-royale",
  "icon": "❓",  // or generated SVG
  ...
}
```

Fallback to category emoji if no game-specific icon is defined.

---

## 7. Mobile UX Assessment

| Feature | Status | Issue |
|---------|--------|-------|
| Game grid | 4→3→2→1 columns | OK |
| Search | Expandable icon on mobile (`hub/hub.css:725-761`) | Fixed in D7 |
| Categories | Horizontal scroll | OK but may wrap on small screens |
| Featured carousel | Horizontal scroll | OK |
| Auth modal | Centered overlay | Should be full-screen on mobile |
| Profile panel | 320px dropdown | May overflow on small screens — should be full-width |
| Game pages | Standalone | No guarantee of mobile responsiveness per game |

**Critical**: The auth modal (`hub/index.html:101-126`) uses `max-width: 400px` which works on desktop but on a 320px screen leaves no margin. Add `@media (max-width: 480px) { .modal { max-width: 100%; margin: 16px; } }`.

---

## 8. Prioritized Action Items

### P0 — Critical (Block user experience)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 1 | Handle unimplemented games with "Coming Soon" page | `src/gateway/server.ts`, new `hub/coming-soon.html` | 2h |
| 2 | Add "Back to Hub" link to existing game pages | `games/099-idle-lemonade-stand/index.html`, `dist/client/index.html` | 0.5h |
| 3 | Add per-game icons to registry | `games/registry.json` | 0.5h |

### P1 — Important (v1 quality)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 4 | "Recently Played" section | `hub/hub.js` (localStorage), new `hub/hub.css` styles | 2h |
| 5 | Multiplayer filter toggle | `hub/hub.js`, `hub/index.html` | 1h |
| 6 | Guest → account migration prompt | `hub/hub.js` (auth flow) | 2h |
| 7 | Loading overlay for game launches | `hub/hub.js` (navigation), `hub/hub.css` | 1h |
| 8 | Mobile auth modal full-screen | `hub/hub.css` media query | 0.5h |

### P2 — Enhancement (v2)

| # | Action | Effort |
|---|--------|--------|
| 9 | Faceted search panel | 4h |
| 10 | Search result highlighting | 2h |
| 11 | Full `/profile` page | 4h |
| 12 | Keyboard navigation (tabindex, ARIA) | 2h |
| 13 | Infinite scroll (intersection observer) | 3h |

---

## 9. Alignment with tech-analyst

**Agreed points:**
- Single unified port (3000) — already implemented, no UX changes needed
- Manifest-driven registry — 24 games defined, 2 implemented
- JWT-based auth with SQLite — exists, needs UX improvements (guest flow, migration)
- Old port 3001 server needs cleanup — technical task, UX-invisible

**Divergence:**
- tech-analyst focuses on port unification as a technical challenge — from UX perspective, this is already solved. Users never see ports.
- tech-analyst's phase plan puts auth in Phase 3 — but auth UI already exists. The gap is in UX quality (guest onboarding, data migration), not in technical existence.
- The critical UX issue is **22 of 24 games are unimplemented** — users will click "play" and get errors. This needs a "Coming Soon" treatment before anything else.

---

**Report ends.**
