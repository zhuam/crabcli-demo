# UX Analysis Report: Unified Game Hub for crabcli-demo

**Issue #101**: 构建一个游戏大厅
**Date**: 2026-06-14
**Analyst**: ux-analyst

---

## 1. Current State Assessment

### Existing Games (2 found)

| Game | Type | Tech | Port/Entry | Auth | Visual Style |
|------|------|------|------------|------|--------------|
| Astrocade Trivia Royale | Real-time multiplayer (WebSocket) | Vite SPA + Node server | Vite dev:3000, Server:3001 | Ad-hoc name input, no persistence | Dark space theme, screen-by-screen flow |
| Idle Lemonade Stand | Single-player idle/clicker | Static HTML+JS+CSS | Served as static file (no dedicated port) | None (anonymous) | Bright cartoon style, tabbed bottom-nav |

### UX Problems Identified

1. **No unified entry point**: Users must know each game's URL/port directly
2. **Inconsistent auth flows**: Trivia asks for a name; Lemonade has no identity concept
3. **Visual inconsistency**: Each game uses its own design tokens, color palettes, typography
4. **No game discovery**: At scale (hundreds of games), users cannot browse, search, or filter
5. **No game state persistence**: High scores in Trivia stored in localStorage per-game; no cross-game profile

---

## 2. Information Architecture for Hundreds of Games

### 2.1 Proposed Navigation Hierarchy

```
Game Hub (Home)
├── Featured / Popular (carousel or hero)
├── Categories (grid of genre tiles)
│   ├── Puzzle & Trivia
│   ├── Idle & Clicker
│   ├── Action & Arcade
│   ├── Strategy & Simulation
│   └── ...
├── Search (full-text, debounced)
├── Recently Played (localStorage / account-based)
└── My Favorites (account-based)
```

### 2.2 Game Discovery Patterns

#### Primary: Category Taxonomy + Card Grid
- **Grid layout**: 3-column on desktop, 2 on tablet, 1 on mobile
- **Game cards** display: icon/thumbnail, title, genre tag, player count (if multiplayer), rating
- **Infinite scroll** or **virtual scrolling** for hundreds of games — avoid pagination which adds friction for browsing
- **Lazy loading** of game thumbnails to avoid initial page weight

#### Secondary: Search & Filter
- **Search bar** at top, always visible after scroll
- **Filters**: Genre (multi-select), Player count (1P / Multiplayer), Difficulty, Popularity, New
- **Debounced search** (300ms) with instant results dropdown
- **No results state**: friendly illustration + "suggest a game" CTA

#### Tertiary: Sorting
- Default: Popular / Trending
- Options: Newest, A-Z, Rating, Most Played (per user)

### 2.3 Scalability Considerations

| Scale | Pattern | Rationale |
|-------|---------|-----------|
| 1-20 games | Simple card grid | Browsable at a glance |
| 20-100 games | Category tabs + grid + search | Need way to narrow scope |
| 100-500 games | Virtual scrolling + faceted search + featured carousel | Avoid rendering all cards; surface top games |
| 500+ games | Full faceted search + personalized recommendations | Browse-by-discovery fails; search-first UX |

**Recommendation**: Start with Category + Grid + Search, and add virtual scrolling when game count exceeds ~50. The manifest-driven architecture (per tech-analyst) makes this transition seamless.

---

## 3. Unified Port / Routing UX

### 3.1 User-Facing URL Pattern

```
/game-hub                    → Hub home (browse/search)
/game-hub/games/trivia       → Trivia Royale
/game-hub/games/lemonade     → Lemonade Stand
/game-hub/profile            → User profile
/game-hub/settings           → Settings
```

### 3.2 UX Principles

- **Users should never see ports**: The hub acts as a reverse proxy / iframe host, abstracting all port complexity
- **Consistent back-navigation**: Every game page has a "← Back to Hub" breadcrumb
- **Loading state**: Games load inside an iframe or mounted SPA route; show a skeleton/loading spinner while the game initializes
- **Error handling**: If a game is down or not found, show a friendly error page with "Back to Hub" and "Report Issue" actions

### 3.3 Game Launch Experience

```
Hub → Click game card → Loading screen (3-5s) → Game iframe renders
                           ↑
                    Shows game name, icon, and "Preparing your game..."
                    Auto-hides when iframe content loads
```

- **Pre-warming**: For popular games, pre-fetch the game bundle on hub idle time
- **Fullscreen toggle**: Each game page should have a fullscreen/expand button
- **Mobile responsiveness**: Games must work within the hub's viewport or redirect to a standalone game page

---

## 4. Unified Account Flow

### 4.1 Current State: No Unified Auth

| Game | Identity Model | Persistence |
|------|---------------|-------------|
| Trivia Royale | Ephemeral name input per session | High scores in localStorage |
| Lemonade Stand | Anonymous (no identity) | Best time in localStorage |

### 4.2 Proposed Account UX

#### Lightweight Onboarding (Optional, Not Forced)
```
┌─────────────────────────────┐
│  Welcome to CrabCli Arcade  │
│                             │
│  [Continue as Guest]  ← Default path, no friction
│  [Sign In / Create Account] ← Unlock features
│                             │
│  Guest users can:           │
│  • Play all games           │
│  • View local high scores   │
│                             │
│  Account holders also get:  │
│  • Cross-game profile       │
│  • Cloud-saved progress     │
│  • Global leaderboards      │
│  • Friends & challenges     │
└─────────────────────────────┘
```

#### Account Features (Progressive Enhancement)
1. **Profile**: Display name, avatar (auto-generated or uploaded), member since
2. **Cross-game stats**: Total games played, total play time, achievements
3. **Unified high scores**: Per-game bests, global rankings
4. **Preferences**: Theme (dark/light), notification settings, language
5. **Session management**: Login on one device, continue on another

#### Auth Flow
- **Sign in**: Email/username + password OR social login (GitHub, Google)
- **Sign up**: Minimal fields — username + password (email optional for recovery)
- **Session**: JWT cookie, auto-renewed, survives browser restart
- **Guest → Account migration**: If a guest creates an account, merge their localStorage data (high scores, favorites) into the cloud profile

### 4.3 Account UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Avatar + name chip | Top-right of hub header | Current user identity, dropdown for profile/settings/logout |
| Guest badge | Top-right of hub header | "Guest" with CTA to sign in |
| Auth modal | Overlay | Sign in / Sign up / Continue as Guest — not a separate page |
| Profile page | /profile | Stats, achievements, account settings |
| Game-specific stats | Within each game page | "Your best: 1500 pts (rank #42)" |

---

## 5. Visual Design System

### 5.1 Design Tokens (Recommended)

The hub should establish a shared design system that individual games can optionally adopt:

```
Colors:
  Primary:     #6C5CE7 (purple — matches existing Trivia Royale)
  Accent:      #FD79A8 (pink)
  Success:     #00B894
  Warning:     #FDCB6E
  Danger:      #E17055
  Background:  #0A0E27 (dark) / #F8F9FA (light)
  Surface:     #151A3A (dark) / #FFFFFF (light)
  Text:        #F0F0F0 (dark) / #1A1A2E (light)

Typography:
  Heading:     System UI, 800 weight
  Body:        System UI, 400 weight
  Mono:        JetBrains Mono (for scores/numbers)

Spacing:       4px base (4, 8, 12, 16, 24, 32, 48)
Border radius: 12px (cards), 8px (buttons), 20px (chips)
```

### 5.2 Game Card Component

```
┌──────────────────────────┐
│  [Game Thumbnail/Icon]   │  ← 16:9 or square
│                          │
│  Game Title              │  ← 14px, 600 weight
│  Genre Tag · Players     │  ← 12px, dim
│  ★★★★☆  (4.2)           │  ← Optional rating
└──────────────────────────┘
```

Hover state: slight scale-up (1.03), shadow increase, "Play" overlay button appears.

---

## 6. Accessibility Requirements

1. **Keyboard navigation**: Full tab-order through game cards, categories, search
2. **Screen reader**: ARIA labels on game cards, live regions for dynamic content
3. **Color contrast**: WCAG AA minimum (4.5:1 for text, 3:1 for large text)
4. **Reduced motion**: Respect `prefers-reduced-motion` — disable card hover animations, loading spinners become static
5. **Touch targets**: Minimum 44×44px for all interactive elements on mobile
6. **Focus management**: When navigating into a game iframe, focus should move into the game; on back, return focus to the game card

---

## 7. Mobile-First Considerations

- **Bottom navigation** on mobile: Hub / Categories / Search / Profile
- **Game cards**: Full-width on mobile, 2-column on tablet, 3-4 on desktop
- **In-game**: Games should either adapt to mobile viewport or offer a "Play in fullscreen" mode that hides the hub chrome
- **Touch-friendly**: Larger tap targets, swipe gestures for category navigation
- **Offline**: Service worker to cache hub shell; games that support offline play should be marked with an "Offline" badge

---

## 8. Recommended Implementation Phases

### Phase 1: Foundation (MVP)
- Hub landing page with game card grid
- Static game manifest (JSON) with 2-5 games
- Game launching via iframe
- "Back to Hub" navigation
- Guest mode (no auth)

### Phase 2: Discovery
- Category taxonomy
- Search with debounce
- Sort/filter controls
- Featured/trending section
- Virtual scrolling for large catalogs

### Phase 3: Account System
- Optional sign-in/sign-up modal
- JWT-based session management
- Cross-game profile page
- Cloud-saved high scores
- Guest → account data migration

### Phase 4: Social & Engagement
- Global leaderboards
- Friend lists & challenges
- Game ratings & reviews
- Achievement system
- Notifications

---

## 9. Key UX Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| iframe sandbox blocks game features (WebSocket, fullscreen) | High | Test each game type in iframe; fall back to same-origin routing for games that need full access |
| Hundreds of cards cause slow initial render | Medium | Virtual scrolling + lazy image loading; skeleton placeholders |
| Forced auth creates friction | High | Guest-first design; auth is always opt-in, never a gate |
| Inconsistent game UX across different games | Medium | Provide a shared design system + embedding SDK for game developers |
| Mobile game viewport conflicts with hub chrome | Medium | Games can request "fullscreen mode" that hides hub chrome |

---

## 10. Alignment with tech-analyst

Agreed on:
- Single entry point (unified gateway, no port visibility to users)
- Manifest-driven game registry (JSON metadata for navigation/search)
- Lightweight auth (JWT, optional, guest-first)

Open questions for tech-analyst:
- Can games be embedded in iframes without WebSocket/auth restrictions, or do we need same-origin routing?
- How will the game manifest be structured? (I can provide the UX field requirements: title, description, icon, category, tags, playerCount, difficulty, etc.)

---

**Report ends.**
