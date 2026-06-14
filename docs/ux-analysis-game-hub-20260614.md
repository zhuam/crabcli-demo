# UX Analysis Report: Game Hub for crabcli-demo

**Issue #101**: 构建一个游戏大厅
**Date**: 2026-06-14
**Analyst**: ux-analyst

---

## 1. Executive Summary

The existing game hub (`hub/index.html` + `hub/hub.js` + `hub.css`) already implements most of the core UX patterns needed: category chip filters, card grid with pagination (PAGE_SIZE=24), debounced search (300ms), sort controls (Popular/Newest/Rating/A-Z), multiplayer toggle, guest banner, auth modal, favorites system, and profile panel. This report identifies UX gaps, proposes improvements for scaling to hundreds of games, and recommends patterns for the two existing games (Trivia Royale, Idle Lemonade Stand) to feel cohesive within the hub.

---

## 2. Current UX State — What's Already Built

### 2.1 Hub Page (`hub/index.html`, `hub/hub.js`)

| Feature | Status | Evidence |
|---------|--------|----------|
| Header with logo + search + auth area | ✅ Implemented | `hub/index.html:21-44` |
| Mobile search overlay | ✅ Implemented | `hub/index.html:47-50`, `hub.js:602-614` |
| Category chip navigation | ✅ 6 categories (all/puzzle/idle/action/strategy/casual) | `games/registry.json:328-334`, `hub.js:428-439` |
| Featured games section | ✅ Horizontal card row | `hub/index.html:65-68`, `hub.js:442-478` |
| Game card grid | ✅ With pagination | `hub/index.html:100`, `hub.js:534-582` |
| Search with debounce | ✅ 300ms, searches name/desc/category/tags | `hub.js:502-509`, `hub.js:630-636` |
| Sort controls | ✅ Popular/Newest/Rating/A-Z | `hub/index.html:86-91`, `hub.js:513-526` |
| Multiplayer filter toggle | ✅ | `hub/index.html:75-85`, `hub.js:494-499` |
| Game count badge | ✅ | `hub/index.html:92`, `hub.js:549` |
| Load More pagination | ✅ PAGE_SIZE=24 | `hub.js:17`, `hub.js:584-593` |
| Loading skeleton | ✅ 8 skeleton cards | `hub.js:110-128` |
| Recently Played section | ✅ localStorage-backed | `hub/index.html:56-59`, `hub.js:161-202` |
| Guest onboarding banner | ✅ Dismissible | `hub/index.html:15-18`, `hub.js:217-223` |
| Auth modal (login/register) | ✅ Tabbed form | `hub/index.html:115-140`, `hub.js:409-421` |
| User profile panel | ✅ Avatar, stats, favorites list | `hub/index.html:143-163`, `hub.js:324-395` |
| Favorites system | ✅ Heart buttons on cards | `hub.js:258-288`, `hub.js:367-383` |
| Coming Soon badges | ✅ For unimplemented games | `hub.js:554`, `hub.js:561` |
| Guest banner | ✅ With dismiss + sign-in link | `hub/index.html:15-18` |

### 2.2 Game Registry (`games/registry.json`)

24 games registered across 6 categories, each with: id, name, icon (emoji), description, category, tags, path, hasServer, wsPath, players, version, featured, rating.

### 2.3 Gateway (`src/gateway/server.ts`)

Single port 3000 entry. Serves hub at `/`, game assets at `/games/:id/*`, WebSocket at `/ws/game/:id`. Games registered but not built get a friendly "Coming Soon" page (`hub/coming-soon.html`).

---

## 3. UX Gaps & Recommendations

### 3.1 Navigation for Hundreds of Games

**Current**: 24 games rendered via paginated grid (24 per page). Client-side filtering on a single JSON fetch.

**Problems at scale**:
- `registry.json` grows linearly — at 200 games it's ~50KB+ JSON, blocking first paint
- Client-side O(n) string matching on 500 games will feel sluggish on mobile
- "Load More" pattern works up to ~100 games; beyond that, users need better discovery

**Recommendations (evidence: `hub.js:481-532` filter/sort logic)**:

| Scale | Change | Priority |
|-------|--------|----------|
| 20-50 games | Current architecture is fine | P0 (current state) |
| 50-200 games | Split registry by category (`registry-puzzle.json` etc.); lazy-load per category | P2 |
| 200-500 games | Server-side search API (`/api/games?q=xxx&category=xxx&page=2`) + virtual scrolling | P3 |
| 500+ games | Full faceted search with autocomplete dropdown + personalized "For You" row | P4 |

### 3.2 Search UX — Missing States

**Current**: Single search input, 300ms debounce, filters the visible grid in-place.

**Gaps**:
1. **No search-as-you-type dropdown** — users don't see matches until the grid re-renders, which is jarring for large grids
2. **No search history** — repeat searches require re-typing
3. **No "no results" illustration** — currently renders `🔍` emoji + text (`hub.js:538-544`), which is functional but not delightful
4. **Search doesn't highlight matches** — the grid shows filtered games but doesn't bold the matching terms

**Recommendations**:
- Add a typeahead dropdown below the search input showing up to 8 matches with icon + name + category chip
- Store last 5 searches in localStorage, show as "Recent searches" when input is focused and empty
- Replace the emoji-only no-results state with a friendly illustration + "Suggest a game" CTA

### 3.3 Visual Hierarchy & Game Card Design

**Current game card** (`hub.js:550-571`): emoji icon (large) + name + description + category tag + rating + player count. All in an `<a>` tag. Heart button overlaid top-right.

**Strengths**:
- Consistent card structure across all 24 games
- Emoji icons provide instant visual recognition without needing image assets
- Coming Soon badge clearly marks unimplemented games
- Heart button for favorites is discoverable

**Gaps**:
1. **No thumbnail images** — emoji-only works for 24 games but won't differentiate 200 games well (many games would share similar emojis)
2. **No difficulty indicator** — registry has no difficulty field; casual vs hardcore users can't filter by challenge level
3. **Rating display inconsistency** — some games have ratings, some don't; the card conditionally shows `⭐ X` but there's no "be the first to rate" prompt
4. **No play count / popularity indicator** — "Popular" sort exists but there's no visual cue (e.g., "🔥 Hot" badge) for trending games
5. **Cards are all the same size** — featured games should be visually larger or have a "Featured" ribbon

**Recommendations**:
- Add a `difficulty` field to `GameEntry` (easy/medium/hard) with color-coded badges
- Add a `playCount` field for popularity; show "🔥" badge for top 10%
- Make featured cards span 2 columns in the grid or show a featured carousel above the grid (already implemented at `hub/index.html:65-68`)
- Generate unique thumbnail colors/gradients per game as a fallback until real thumbnails exist

### 3.4 Responsive Layout

**Current**: `hub/index.html` includes a mobile search button (`hub/index.html:36-40`) that expands to a full-width overlay (`hub/index.html:47-50`). But the main grid and header have no explicit responsive breakpoints in the visible markup.

**Gaps**:
1. **Grid column count is CSS-controlled** (`hub.css` — not read here, but referenced) — need to verify it collapses to 1 column on mobile
2. **Category chips** scroll horizontally on mobile but have no visual affordance (no fade edge or scroll hint)
3. **Profile panel** (`hub/index.html:143-163`) is a slide-out drawer — needs to confirm it works on small viewports without covering the entire screen
4. **Auth modal** (`hub/index.html:115-140`) uses a centered overlay — should be full-screen on mobile for easier form input

**Recommendations**:
- Grid: 4 columns desktop (>1200px), 3 columns tablet (768-1200px), 2 columns small tablet (480-768px), 1 column mobile (<480px)
- Category chips: add `scroll-snap-type: x mandatory` + left/right gradient fade to indicate scrollability
- Profile panel: on mobile, make it a full-screen overlay with back arrow instead of a side drawer
- Test touch targets: heart buttons on game cards need minimum 44×44px hit area

### 3.5 User Onboarding Flow

**Current**: Guest banner at top (`hub/index.html:15-18`) with "Browse games or Sign In" message + dismiss button. Auth modal opens on Sign In click.

**Strengths**:
- Guest-first: users can browse and play without any sign-in
- Banner is dismissible and remembers dismissal via localStorage
- Auth modal is an overlay, not a redirect — preserves context

**Gaps**:
1. **No progressive value proposition** — the banner says "Sign In to track scores and save favorites" but doesn't show what the user is missing (e.g., "5 friends are playing now")
2. **No guest-to-account migration** — if a guest plays 3 games, then creates an account, their recently-played history (localStorage) is lost
3. **No social proof** — the hub doesn't show "X players online" or "Y games played today"

**Recommendations**:
- Add a "What you get" section to the guest banner: bullet list of account benefits
- On account creation, merge localStorage `recentlyPlayed` into the user's profile via `/api/favorites` + `/api/scores` API calls
- Show a subtle activity indicator in the header: "3 players online" (computed from active WebSocket connections in `src/gateway/server.ts:264-296`)

### 3.6 Game Launch Experience

**Current**: Clicking a game card navigates to `/games/:id/` via `<a href>`. For unimplemented games, a Coming Soon page is shown (`server.ts:231-245`). For implemented games, static files are served directly.

**Gaps**:
1. **No loading screen** — when clicking a game, the browser navigates directly. If the game takes time to load (especially Vite-built games), users see a blank page
2. **No "Back to Hub" breadcrumb** — once in a game, there's no consistent way to return to the hub (the game itself would need to provide this)
3. **No fullscreen toggle** — users can't expand a game to fullscreen from within the hub context

**Recommendations**:
- Add a shared game wrapper HTML at `/games/shared/wrapper.html` that provides: loading spinner, "Back to Hub" button, fullscreen toggle. Each game is loaded in an `<iframe>` within this wrapper
- The wrapper reads the game's `hasServer` and `wsPath` from the registry to pre-connect WebSocket if needed
- Loading state: show the game's icon + name + "Preparing..." with an animated spinner (respecting `prefers-reduced-motion`)

---

## 4. Unified Account UX — Detailed Flow

### 4.1 Current Auth State

The hub implements a full auth system: JWT Cookie + SQLite users table + register/login/me endpoints (`src/gateway/auth.ts`). The UI has a sign-in/register modal, user badge in header, profile panel with stats and favorites.

### 4.2 Recommended Account UX Flow

```
┌──────────────────────────────────────────────┐
│                  GUEST PATH                   │
│                                               │
│  [Browse Hub] → [Click Game] → [Play Game]   │
│       ↓                                       │
│  localStorage: recentlyPlayed                 │
│                                               │
│  (Optional trigger: try to favorite a game)   │
│       ↓                                       │
│  ┌─────────────────────────────────────────┐  │
│  │ "Sign in to save favorites & scores!"   │  │
│  │ [Sign In] [Create Account] [Maybe Later]│  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              ACCOUNT HOLDER PATH              │
│                                               │
│  [Sign In] → [Browse Hub] → [Play Game]      │
│       ↓                                       │
│  Profile: games played, scores, favorites     │
│  Global leaderboards via /api/scores          │
│  Cross-game identity: same name everywhere    │
└──────────────────────────────────────────────┘
```

### 4.3 Profile Page UX

**Current** (`hub/index.html:143-163`, `hub.js:324-395`): A slide-out panel showing avatar, name, member-since, game count, score count, favorites count, favorites list, and sign-out.

**Recommendations for scaling**:
- Add a "Recent Scores" section showing last 5 scores submitted across all games
- Add "Achievements" section (future) — badges for milestones like "Played 10 games", "Scored 1000+ points"
- Profile stats should link to drill-down views: clicking "5 Games" shows which games, clicking "12 Scores" shows score history

---

## 5. Accessibility Audit

Based on reviewing `hub/index.html`:

| Check | Status | Notes |
|-------|--------|-------|
| `lang="en"` on `<html>` | ✅ Pass | `hub/index.html:2` |
| `aria-label` on icon buttons | ✅ Pass | `hub/index.html:37` (search), `hub/index.html:49` (close) |
| `autocomplete` on form fields | ✅ Pass | `hub/index.html:126,130` |
| Keyboard navigation | ⚠️ Partial | Game cards are `<a>` tags (tabbable), but fav buttons are `<button>` inside `<a>` — nested interactive elements are an a11y anti-pattern |
| Focus management on modal open/close | ⚠️ Partial | Modal closes on Escape (`hub.js:778-788`) but focus isn't returned to the trigger element |
| Screen reader live regions | ❌ Missing | Filter results update without announcement; add `aria-live="polite"` to game count |
| Color contrast | ⚠️ Unknown | Depends on `hub.css` values — should be verified against WCAG AA |
| `prefers-reduced-motion` | ❌ Missing | No media query found in JS for disabling animations |

**Critical a11y fix**: Move fav buttons outside of `<a>` tags. Use event delegation on the grid container instead of nesting `<button>` inside `<a>`.

---

## 6. Two Existing Games — UX Integration

### 6.1 Trivia Royale

**Current**: Dark space theme, screen-by-screen flow (lobby → game → results). Multiplayer trivia with WebSocket.

**Integration requirements**:
- The game should feel like it belongs to the hub, not a separate app
- Add a "← Back to Arcade" button in the game's header/top-left corner
- The game's name input should be replaced by reading the hub's JWT cookie — auto-identify the logged-in user
- High scores should be submitted to `/api/scores` on game end
- Visual consistency: use the hub's color tokens (or at minimum, don't clash)

### 6.2 Idle Lemonade Stand

**Current**: Bright cartoon style, tabbed bottom navigation, single-player idle game.

**Integration requirements**:
- Add a "← Back to Arcade" button
- Game progress stored in localStorage currently — add an option to "Save to cloud" for logged-in users
- No high score concept currently; consider adding "Total earnings" as a submit-to-leaderboard metric
- Visual consistency: the bright cartoon style is intentionally different from Trivia Royale's dark theme — this is acceptable and desirable (games should have their own identity), but shared UI elements (back button, loading states) should use the hub's design tokens

---

## 7. Design System Recommendations

The hub uses Inter font (loaded from Google Fonts, `hub/index.html:9`), with a dark theme implied by the existing games. Recommendations:

| Token | Value | Rationale |
|-------|-------|-----------|
| Primary | `#6C5CE7` (purple) | Matches Trivia Royale's existing palette |
| Surface | `#151A3A` (dark navy) | Hub background, card backgrounds |
| Card hover | `#1E2548` | Subtle lift on interaction |
| Text primary | `#F0F0F0` | High contrast on dark surface |
| Text secondary | `#A0A0C0` | Descriptions, metadata |
| Accent | `#FD79A8` (pink) | Heart buttons, CTAs |
| Success | `#00B894` | Online indicators, positive actions |
| Border | `rgba(255,255,255,0.08)` | Subtle card borders |
| Font heading | `Inter 700` | Bold, modern |
| Font body | `Inter 400` | Readable at small sizes |
| Font mono | `JetBrains Mono` | Scores, numbers |
| Card radius | `12px` | Friendly, modern |
| Button radius | `8px` | Tactile feel |
| Spacing unit | `4px` | 4/8/12/16/24/32/48 scale |

---

## 8. Implementation Phases (UX Priority Order)

### Phase 1: Polish Current Hub (Immediate)
- Fix nested interactive a11y issue (fav buttons inside `<a>`)
- Add `aria-live` region for filter result count
- Add focus trap and focus return to auth modal
- Add "Back to Hub" button to both existing games
- Ensure responsive grid breakpoints work correctly

### Phase 2: Enhance Discovery
- Add search typeahead dropdown
- Add search history (localStorage, last 5)
- Add difficulty field to registry + filter
- Add play count / popularity badges
- Improve "no results" state with illustration

### Phase 3: Game Wrapper & Launch
- Create shared game wrapper (`/games/shared/wrapper.html`)
- Loading screen with game icon + name
- Fullscreen toggle in wrapper
- Guest-to-account data migration

### Phase 4: Profile & Social
- Expand profile panel with score history
- Add "players online" indicator to header
- Add achievement system scaffolding
- Global leaderboards UI

---

## 9. Alignment with tech-analyst

**Agreed positions**:
- Single entry point: all games served through gateway port 3000 — users never see ports
- Manifest-driven registry: JSON metadata powers all hub navigation/search/filter
- Guest-first auth: no forced sign-in; account is an enhancement, not a gate
- JWT Cookie session: auto-renewed, survives browser restart

**Open questions for tech-analyst**:
- Can the game wrapper use iframes for games that need WebSocket access, or should games be same-origin routed? (iframe sandbox may block certain game features)
- Should the registry be extended with `difficulty` and `playCount` fields? (I recommend yes for UX — difficulty badge + trending indicator)
- How will "players online" be computed? (WebSocket connection count in `game-logic.ts`?)

---

**Report ends.**
