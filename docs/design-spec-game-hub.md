# Game Hub Design Specification (v2)

**Issue**: #101 — 构建一个游戏大厅
**Date**: 2026-06-14
**Based on**: tech-analysis-issue-101.md + ux-gap-analysis-issue-101.md

This document specifies visual/interaction changes for the hub UI. The developer implements against this spec.

---

## D1: Favorites on Game Cards

**Current**: Game cards have no favorite interaction. Favorites API exists but no UI.

**Design**:
- Add a heart icon (♥) to the **top-right corner** of every game card
- Default state: hollow outline heart, opacity 0.5, small (18px)
- Active state (favorited): solid red heart (`--accent: #fd79a8`), full opacity
- On click: toggle via `POST /api/favorites/{gameId}`, animate with a quick scale pulse
- Position: `position: absolute; top: 8px; right: 8px;` on the card
- Game card needs `position: relative;` for this to work
- Guests clicking heart → show auth modal ("Sign in to favorite games")

**CSS additions**:
```css
.game-card { position: relative; }
.fav-btn {
  position: absolute; top: 8px; right: 8px;
  background: none; border: none; cursor: pointer;
  font-size: 18px; opacity: 0.5; transition: all 0.15s ease;
  color: var(--text-dim);
}
.fav-btn:hover { opacity: 1; transform: scale(1.2); }
.fav-btn.active { color: var(--accent); opacity: 1; }
```

---

## D2: "My Favorites" Category Chip

**Current**: Categories loaded from registry only (All, Puzzle, Idle, Action, Strategy, Casual).

**Design**:
- Add a "❤️ Favorites" chip at the **end** of the category row, after all registry categories
- Only visible when user is logged in
- When active: shows only favorited games (fetch from `GET /api/favorites`)
- Empty state: "You haven't favorited any games yet. Click the heart on a game card!"
- Icon: filled heart emoji, same as D1 active state

---

## D3: Auth Modal — Add Password Field

**Current**: Username-only form. Zero identity security.

**Design**:
- Add a **Password** input below the username field in the auth modal
- Label: "Password"
- Type: `password`
- Placeholder: "4+ characters"
- Min length: 4 characters (client-side validation)
- For Login tab: username + password → `POST /api/auth/login` with `{name, password}`
- For Register tab: username + password → `POST /api/auth/register` with `{name, password}`
- Error: "Password must be at least 4 characters" shown below password field
- Auth form order: Username → Password → Tab buttons → Submit

**CSS**: Reuse existing `.form-group` styles — no new CSS needed.

---

## D4: User Profile Panel

**Current**: Clicking user avatar → confirm dialog for sign out only.

**Design**:
- Replace the sign-out confirm with a **dropdown panel** (not a full page — this is v1)
- Panel appears below the user badge when clicked
- Panel content:
  - **Header**: User avatar (larger, 40px) + name + member-since date
  - **Stats row**: Total games played | Total scores submitted | Favorites count
  - **Favorites list**: Horizontal scroll of favorited game names (clickable → go to game)
  - **Actions**: "Sign Out" button at bottom (full width, subtle style)
- Panel style: `position: absolute; top: 100%; right: 0;` with `z-index: 150`
- Background: `var(--bg-light)`, border: `1px solid var(--surface2)`, border-radius: `var(--radius)`
- Width: 320px max
- Close on: click outside, Escape key
- Header badge click toggles panel open/close

**CSS additions**:
```css
.profile-panel {
  position: absolute; top: calc(100% + 8px); right: 0;
  width: 320px; background: var(--bg-light);
  border: 1px solid var(--surface2); border-radius: var(--radius);
  box-shadow: var(--shadow-lg); z-index: 150;
  animation: panelIn 0.15s ease;
}
@keyframes panelIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.profile-header { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--surface2); }
.profile-stats { display: flex; gap: 16px; padding: 12px 16px; }
.profile-stat { text-align: center; flex: 1; }
.profile-stat-value { font-size: 1.2rem; font-weight: 700; color: var(--text); }
.profile-stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }
.profile-favorites { padding: 12px 16px; max-height: 120px; overflow-y: auto; }
.profile-fav-item { padding: 6px 0; font-size: 0.85rem; cursor: pointer; }
.profile-fav-item:hover { color: var(--primary-light); }
.profile-signout { padding: 12px 16px; border-top: 1px solid var(--surface2); }
.profile-signout button { width: 100%; padding: 10px; background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius-sm); color: var(--danger); cursor: pointer; font-weight: 600; }
```

---

## D5: Pagination — "Load More" Button

**Current**: All games rendered at once. Will be slow at 50+ games.

**Design**:
- Show max **24 games** initially
- Add a "Load More" button below the grid when more games exist
- Button style: centered, full-width-ish (max 200px), outlined style
- On click: reveal next 24 games (append to DOM)
- When all games shown: hide the button
- Count display in button: "Show 24 of 48 more"

**CSS additions**:
```css
.load-more-wrap { display: flex; justify-content: center; margin-top: 24px; }
.load-more-btn {
  padding: 12px 32px; background: transparent;
  border: 1px solid var(--primary); border-radius: 24px;
  color: var(--primary-light); font-weight: 600; cursor: pointer;
  transition: all 0.15s ease;
}
.load-more-btn:hover { background: var(--primary); color: white; }
```

---

## D6: Loading Skeleton

**Current**: Empty grid until API responds. No visual feedback.

**Design**:
- Show 8 skeleton cards while loading
- Each skeleton: same dimensions as game card, with animated gradient shimmer
- Skeleton structure: icon placeholder (square) → name placeholder (short bar) → desc placeholder (2 bars) → tags placeholder (2 small pills)

**CSS additions**:
```css
.skeleton {
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface2) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton-card { padding: 20px; background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius); }
.skeleton-icon { width: 48px; height: 48px; margin-bottom: 12px; }
.skeleton-name { height: 16px; width: 70%; margin-bottom: 8px; }
.skeleton-desc { height: 12px; width: 100%; margin-bottom: 4px; }
.skeleton-desc:last-of-type { width: 60%; }
.skeleton-tags { display: flex; gap: 6px; margin-top: 12px; }
.skeleton-tag { width: 50px; height: 18px; border-radius: 12px; }
```

---

## D7: Mobile Expandable Search

**Current**: Search bar `display: none` on <480px screens.

**Design**:
- Replace hidden search with a **search icon** (magnifying glass) in the header on mobile
- Icon sits in header-center area, right-aligned on mobile
- On tap: icon transforms into a full-width search input that slides down below the header
- The expanded search bar has: text input + X (close) button
- On close or losing focus: collapse back to icon
- On desktop: keep existing search bar as-is

**CSS additions**:
```css
@media (max-width: 480px) {
  .header-center { display: flex; justify-content: flex-end; }
  .search-icon-btn {
    background: none; border: none; color: var(--text-dim);
    cursor: pointer; padding: 8px; font-size: 1.2rem;
  }
  .mobile-search-bar {
    position: absolute; top: 100%; left: 0; right: 0;
    padding: 12px 16px; background: var(--bg-light);
    border-bottom: 1px solid var(--surface2);
    display: flex; align-items: center; gap: 8px;
  }
  .mobile-search-bar .search-input-full {
    flex: 1; padding: 10px 14px; border: 1px solid var(--surface2);
    border-radius: 24px; background: var(--surface); color: var(--text);
    font-size: 0.9rem;
  }
  .mobile-search-close {
    background: none; border: none; color: var(--text-dim);
    cursor: pointer; font-size: 1.2rem; padding: 8px;
  }
}
```

---

## D8: Guest Welcome Banner (Bonus P1)

**Design**:
- On first visit (no auth cookie, no localStorage flag), show a subtle banner below the header
- "Welcome to CrabCLI Arcade! Browse games or [Sign In] to track your scores."
- Dismissable (X button), dismissal saved to localStorage
- Banner style: `background: linear-gradient(135deg, rgba(108,92,231,0.15), rgba(253,121,168,0.15))`, border-bottom: `1px solid var(--surface2)`

---

## Summary of Files to Change

| File | Changes |
|------|---------|
| `hub/index.html` | Add profile panel HTML, mobile search icon, load-more button, skeleton container, guest banner |
| `hub/hub.css` | Add D1-D8 CSS (favorites, profile panel, pagination, skeleton, mobile search, guest banner) |
| `hub/hub.js` | Add favorite toggle logic, favorites category, password field handling, profile panel render+fetch, pagination state, loading skeleton, mobile search toggle, guest banner |
