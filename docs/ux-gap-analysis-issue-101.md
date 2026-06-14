# UX Analysis Report: Game Hub — Gap Audit & Recommendations

**Issue #101**: 构建一个游戏大厅
**Date**: 2026-06-14
**Analyst**: ux-analyst

> This report audits the **already-implemented** Game Hub against UX best practices for a multi-game platform supporting hundreds of titles. It identifies gaps and provides prioritized recommendations.

---

## 1. Current State: What's Already Built

The project has substantial implementation already in place:

| Component | Files | Status |
|-----------|-------|--------|
| **Gateway** (single port 3000) | `src/gateway/server.ts` | Complete — serves hub, games, API, WebSocket |
| **Hub UI** | `hub/index.html`, `hub/hub.js`, `hub/hub.css` | Complete — dark theme, responsive grid |
| **Game Registry** | `games/registry.json` | 24 games, 6 categories |
| **Auth** | `src/gateway/auth.ts`, `auth-middleware.ts` | JWT cookie, username-only login |
| **Scores** | `src/gateway/scores.ts` | Submit + leaderboard API |
| **Favorites** | `src/gateway/favorites.ts` | Toggle + list API |
| **Shared Types** | `src/shared/hub-types.ts` | TypeScript interfaces |
| **Database** | `src/gateway/db.ts` | SQLite (users, scores, favorites) |

### What the Hub UI Currently Provides
- Header with logo, search bar, auth button
- Category chips (All, Puzzle, Idle, Action, Strategy, Casual)
- Featured games horizontal scroll carousel
- Game card grid (4-col desktop, 3-col tablet, 2-col mobile, 1-col small mobile)
- Sort by Popular / Newest / Rating / A-Z
- Game count display
- Auth modal (sign in / create account, username only)
- User avatar badge with sign-out

---

## 2. UX Gap Analysis

### GAP-1: Favorites API Has No UI Integration
**Severity**: High
**Impact**: Users who favorite games have no way to see or manage them

The `/api/favorites` endpoints work (toggle + list), but the hub UI never calls them. Missing:
- Heart/star icon on each game card to toggle favorite (`hub/hub.js:206` — game card render has no favorite button)
- "My Favorites" category chip in the navigation (`hub/hub.js:125` — categories are loaded from registry only)
- Favorites count badge on the user profile

**Recommendation**: Add a heart icon to each game card, wire it to `POST /api/favorites/:gameId`, and add a "Favorites" chip that filters to favorited games.

### GAP-2: No "Recently Played" History
**Severity**: Medium
**Impact**: Returning users must re-discover games each visit

No mechanism tracks which games a user has played. For a hub with 24+ games, this is a critical discovery feature.

**Recommendation**: Track last-played timestamps — `localStorage` for guests, `POST /api/scores` or a new `/api/activity` endpoint for authenticated users. Display a "Recently Played" section above the main grid, limited to 6 games.

### GAP-3: Auth Is Username-Only — Identity Trust Gap
**Severity**: High
**Impact**: No password means zero identity security; anyone can claim any username

Current flow (`src/gateway/auth.ts:22-43`): register requires only `name`. Login also requires only `name`. No password, no email verification. This means:
- User A can "log in" as User B and see their scores/favorites
- Cross-game leaderboards are easily gamed
- No account recovery possible

**Recommendation**: Add at minimum a password field to both register and login. The UI already has a single username input — needs a second password input. For a demo project, a simple 4+ character password is acceptable; no need for complexity rules.

### GAP-4: No Guest-to-Account Migration Path
**Severity**: Medium
**Impact**: Guests who later create accounts lose their play history and favorites

Guests can play all games, but when they sign up, there's no merge of their `localStorage` data (favorites, recently played) into the cloud account.

**Recommendation**: On first login after guest play, show a one-time dialog: "We found games you played as a guest. Merge this data into your account?" Sync localStorage keys into the API.

### GAP-5: No Pagination or Virtual Scrolling for Large Catalogs
**Severity**: Medium (currently), High (at scale)
**Impact**: With 24 games the grid renders fine, but at 100+ games it will be slow

Current code (`hub/hub.js:193-221`) renders ALL filtered games into the DOM at once. No pagination, no virtual scrolling, no "load more" button.

**Recommendation**: Implement "load more" button (simpler than virtual scrolling) that reveals 24 games at a time. At 200+ games, switch to intersection-observer-based infinite scroll.

### GAP-6: Game Cards Use Emoji Icons Only — No Actual Thumbnails
**Severity**: Low-Medium
**Impact**: Visual blandness; games don't feel distinct or premium

The `CATEGORY_ICONS` map (`hub/hub.js:16-19`) provides 5 emoji for all categories. Every game card in its category shows the same icon. The registry has a `thumbnail` field, but no game actually provides one.

**Recommendation**: Generate simple SVG-based game icons (or use distinct emoji per game, not per category) as a stopgap. For production, require each game to provide a `thumb.png` (120x120) in its directory.

### GAP-7: No User Profile Page
**Severity**: Medium
**Impact**: Users have nowhere to see their cross-game stats, settings, or achievements

The user badge in the header only offers sign-out. There's no `/profile` page or settings panel.

**Recommendation**: Create a profile page with:
- Display name, member-since date
- Total games played (from scores API)
- Best scores per game
- Favorite games list
- Settings: theme toggle (dark/light), sign out

### GAP-8: No Keyboard Navigation or Accessibility Features
**Severity**: Medium
**Impact**: Non-mouse users cannot effectively use the hub

Missing:
- No `tabindex` management on game cards
- No ARIA labels on interactive elements
- No `prefers-reduced-motion` handling for hover animations
- No focus trap in the auth modal

**Recommendation**: Add `tabindex="0"`, `role="link"`, and `aria-label` to game cards. Respect `prefers-reduced-motion` in CSS. Add focus trap and `aria-modal="true"` to the auth modal.

### GAP-9: No Loading States for Async Operations
**Severity**: Low
**Impact**: Users see blank grids or stale data during API calls

The hub calls `/api/games` (`hub/hub.js:54-63`) and `/api/auth/me` (`hub/hub.js:67-82`) without showing loading indicators. If the network is slow, the page appears broken.

**Recommendation**: Show a skeleton loader for the game grid and a "Checking session..." state for the auth badge.

### GAP-10: No Error Recovery for Failed API Calls
**Severity**: Low-Medium
**Impact**: Transient failures leave the user stuck

`hub/hub.js:60-62` shows an error message for failed registry load, but there's no retry button. The auth check silently falls back to guest mode on failure.

**Recommendation**: Add a "Retry" button on error states. Implement exponential backoff for auth check retries.

---

## 3. Information Architecture Assessment

### Navigation Hierarchy — Current vs. Recommended

**Current**:
```
/ (Hub) → Categories → Game Grid → Click → /games/:id/
        → Search (header bar)
        → Featured (horizontal carousel)
        → Auth (modal overlay)
```

**Recommended additions**:
```
/ (Hub) → Categories (including "Favorites", "Recently Played")
        → Search (header bar, sticky on scroll)
        → Featured (horizontal carousel)
        → Sort/Filter (dropdown)
        → /profile (user stats, settings, favorites management)
        → /games/:id/ (game launch with "Back to Hub" breadcrumb)
```

### Category Taxonomy — Assessment

Current categories (6) are well-chosen and cover the game types in the registry:
- All, Puzzle (4 games), Idle (4), Action (5), Strategy (5), Casual (6)

**Recommendation for scaling to 100+ games**:
- Add sub-categories (e.g., under Puzzle: "Word", "Logic", "Trivia")
- Add a "Multiplayer" filter toggle (independent of category)
- Consider a "New" tag that auto-expire after 30 days

---

## 4. Unified Account Flow Assessment

### Current Auth Flow
```
Guest → Click "Sign In" → Modal → Enter username → Login or Register → Cookie set
```

**Problems**:
1. No distinction between login and register — if username exists, login succeeds silently; if not, register creates a new account. This means a typo in login creates a new account instead of an error.
2. No password → no identity security
3. No email → no account recovery
4. No guest option → implicit guest (no auth cookie), but no explicit "Continue as Guest" button

### Recommended Auth Flow
```
First visit → "Welcome" banner:
  [Continue as Guest]  → Play immediately, localStorage tracking
  [Sign In]            → Username + password modal
  [Create Account]     → Username + password + optional email

Guest plays → later clicks auth badge → "Upgrade to Account" → Merge guest data
```

---

## 5. Visual Design Assessment

### Strengths
- Consistent dark theme with purple/pink accent palette
- Good responsive breakpoints (1024px, 768px, 480px)
- Sticky header with backdrop blur
- Smooth hover animations on game cards
- Category chips with active state

### Areas for Improvement
- **Color-coded categories**: Each category should have a distinct color, not just the purple accent. Currently all active chips use the same purple (`--primary`).
- **Empty states**: No illustration or friendly message for "0 games" or "no favorites yet"
- **Typography hierarchy**: Only two font weights used (400, 600, 700, 800). Consider adding a 500 weight for secondary text.
- **Micro-interactions**: Card hover only has `translateY(-2px)`. Consider a subtle scale, shadow increase, and a "Play" overlay reveal.
- **Loading skeleton**: No skeleton state — the grid is empty until the registry loads.

---

## 6. Mobile UX Assessment

| Feature | Desktop | Mobile | Gap |
|---------|---------|--------|-----|
| Game grid | 4 columns | 1 column (<480px) | OK |
| Search bar | Visible | Hidden (<480px) | High — search is the primary discovery tool |
| Categories | Horizontal chips | Horizontal chips (smaller) | OK but cramped |
| Featured carousel | Horizontal scroll | Horizontal scroll | OK |
| Auth modal | Center overlay | Full-screen overlay | Modal may be too small on mobile |
| Game cards | Hover effects | Tap to play | Hover doesn't translate to touch |

**Critical mobile gap**: The search bar is `display: none` on screens <480px (`hub/hub.css:369`). This removes the primary discovery mechanism on the smallest devices. Replace with a search icon that expands into a full-width search bar on tap.

---

## 7. Prioritized Recommendations

### P0 (Must Fix Before Launch)
| # | Gap | Effort | Why |
|---|-----|--------|-----|
| GAP-3 | Add password to auth | 2h | Identity security — anyone can currently impersonate any user |
| GAP-1 | Wire favorites into UI | 3h | API is built but invisible; wastes existing work |
| GAP-8 | Basic keyboard navigation | 2h | Accessibility baseline |

### P1 (Should Have in v1)
| # | Gap | Effort | Why |
|---|-----|--------|-----|
| GAP-2 | Recently played history | 3h | Critical for return visits |
| GAP-5 | Pagination / load more | 2h | Needed as catalog grows past 50 |
| GAP-7 | User profile page | 4h | Central place for cross-game identity |
| GAP-4 | Guest-to-account migration | 3h | Respect guest investment |

### P2 (Nice to Have)
| # | Gap | Effort | Why |
|---|-----|--------|-----|
| GAP-6 | Real game thumbnails | 4h | Visual polish |
| GAP-9 | Loading states | 1h | Perceived performance |
| GAP-10 | Error recovery | 1h | Resilience |
| Mobile search fix | Replace hidden search with expandable icon | 1h | Mobile usability |

---

## 8. Alignment with tech-analyst

Both analyses agree on:
- Single unified port (3000) — already implemented
- Manifest-driven registry — already implemented with 24 games
- JWT-based auth — already implemented
- SQLite for persistence — already implemented

Divergence:
- tech-analyst recommends "Auth Service + JWT/OIDC" — current implementation is simpler (single JWT in gateway). For a demo project, the current approach is sufficient; OIDC is overkill.
- tech-analyst's phase plan puts auth in Phase 3, but auth is already wired up. The gap is in UX quality (password, guest flow, profile), not in existence.

---

**Report ends.**
