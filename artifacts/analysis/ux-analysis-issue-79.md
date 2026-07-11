# UX Analysis: Mario Pixel Painter (Issue #79)

## Overview

**Game**: Super Mario themed pixel coloring game
**Core Loop**: Select color → Paint cell → Complete artwork → Next level
**Platform**: Astrocade arcade (web, touch/mouse/keyboard)
**Target session**: ≤ 3 minutes per round, casual pick-up-and-play

---

## 1. User Flow

### State Machine

```
[Title Screen] → [Color Select + Paint Grid] → [Win Screen] → [Next Level]
                                                      ↓
                                              [High Score Save]
```

Four screens, no loading screens, no tutorial. The flow matches the existing `screen` pattern from games like Baby Shark Manicure (`games/073-baby-shark-manicure/index.html:57-64`): `.screen` with `.hidden` class toggle for transitions.

### Critical Path (first-time user)

| Step | Action | System Response | Notes |
|------|--------|-----------------|-------|
| 1 | Land on page | Title screen with Mario-themed art + 'PLAY' button | Must render within 3s |
| 2 | Tap 'PLAY' | Fade to game screen; show pixel grid + color palette | No loading spinner — grid pre-built |
| 3 | Tap a color swatch | Swatch highlights; subtle tone plays (select sound) | Clear visual selection state |
| 4 | Tap an empty cell | Cell fills with selected color; paint sound + vibration | Instant feedback |
| 5 | Repeat 3-4 | Cells fill; progress indicator updates | — |
| 6 | All cells filled | Victory animation plays; score calculated | Auto-advance or 'Complete' button |
| 7 | Result screen | Show "Level Complete!", score, best score, Play Again | Same UI for all outcomes |

### Decision: No Tutorial

Per AC "no tutorial needed" — pixel coloring is universally understood (tap color → tap cell). A single line of hint text (like Baby Shark's `💡 Tap a color, then tap a nail to paint!` at line 579) is sufficient.

---

## 2. Visual Design: Mario Theme

### Design Language

- **Background**: Deep navy/space blue gradient (`#0f0c29` → `#302b63`) evoking classic Mario underwater/underground levels, matching the project's existing dark theme convention (Baby Shark: `#0b1a2e`, Sparkle Sweep: `#1a1025`).
- **Typography**: `'Outfit'` for display (consistent with game-frame.css), `'Inter'` for body.
- **Pixel grid**: Distinct 1px border between cells; cell size `min(48px, 10vw)` to ensure touch targets ≥ 44px WCAG minimum.
- **Color palette**: Mario-IP-inspired colors (red `#e52521`, green `#049d10`, yellow `#fbd000`, blue `#0051a8`, brown `#6b4400`, white `#ffffff`, black `#000000`, skin tone `#fbb040`).

### Level Artwork Suggestions

| Level | Subject | Grid Size | Cells | Approx Time |
|-------|---------|-----------|-------|-------------|
| 1-1 | Super Mushroom (1UP) | 8×10 | 80 | ~90s |
| 1-2 | ? Block / Question Block | 8×8 | 64 | ~75s |
| 1-3 | Star (Super Star) | 8×10 | 80 | ~90s |
| 2-1 | Goomba | 10×10 | 100 | ~120s |
| 2-2 | Pipe (Warp Pipe) | 10×8 | 80 | ~90s |
| 3-1 | 1UP Mushroom with background | 12×12 | 144 | ~150s |
| 3-2 | Mario face (simple) | 12×12 | 144 | ~150s |

*Grid sizing recommended at 10×10 as the default — it's the sweet spot for identifiability vs. completion time (tech-analyst concurred), beats Baby Shark's 10-nail intensity level.*

### Why Pixel Art Works for This Genre

- Pixel art maps 1:1 to the grid — each grid cell = 1 pixel in the reference sprite. No anti-aliasing or partial fills.
- The "Mario" aesthetic is inherently pixel-based (NES era), so the theme and the interaction pattern are congruent.
- A completed 10×10 pixel mushroom is instantly recognizable → strong satisfaction on completion.

---

## 3. Color Palette UI

### Layout: Bottom Palette (Preferred UX)

```
┌──────────────────────────────────────────┐
│   ← Back                         ⭐ Lv 1 │  ← Game header
│                                          │
│   ┌────┬────┬────┬────┬────┐            │
│   │    │    │    │    │    │  pixel     │
│   │    │    │    │    │    │  grid      │
│   │    │    │    │    │    │  (10×10)   │
│   │    │    │    │    │    │            │
│   └────┴────┴────┴────┴────┘            │
│                                          │
│   ┌──┬──┬──┬──┬──┬──┬──┬──┐             │
│   │🔴│🟢│🟡│🔵│🟤│⬜│⬛│👆│ ← Palette   │
│   └──┴──┴──┴──┴──┴──┴──┴──┘             │
│                                          │
└──────────────────────────────────────────┘
```

**Rationale**: Bottom placement follows the touch-ergonomics principle of "thumb zone" — on mobile, the thumb's natural arc covers the lower portion of the screen. The pixel grid occupies the upper-center (the "easy" thumb zone), palette at the bottom (the "reachable" zone). This matches Baby Shark Manicure's layout where the interactive palette/controls are at the bottom.

### Palette Design Rules

- **8 colors max** per level — keeps cognitive load low and prevents palette scrolling
- **Selected color** has a bold white ring + scale(1.15) animation (following the `.color-swatch` pattern at line 734)
- **Color swatch size**: `min(40px, 9vw)` — exceeds the 44px WCAG minimum on all devices
- **Eyedropper/undo**: Optional — can be a deselect action (tap selected color again, or tap 'Escape')
- **Eraser tool**: Optional for later levels — follows Baby Shark's eraser pattern (line 1044-1055)

---

## 4. Level Selection

### Approach: Linear Progression

Given the short-session nature (≤ 3 min), implement **linear level progression**:

1. Levels unlock sequentially — complete Level 1 to unlock Level 2
2. Title screen shows "Level X" and current level's preview (silhouette or question mark)
3. Data persisted to `localStorage`: `marioPixelPainter_unlockedLevel` + `marioPixelPainter_highScore`
4. No level map/overworld screen — keep the flow: Title → Game → Result → (Next Level or Retry)

This matches Baby Shark Manicure's simple level progression (level index with `LEVELS[level % LEVELS.length]`).

### Reference Artwork per Level

Each level should provide:
- A `pixels[][]` or `bitmask` array defining which cells are fillable (others are "background" and already colored)
- A `referenceColors: {row: number, col: number, color: string}[]` — the target color mapping for validation
- A level name (e.g., "Super Mushroom", "Question Block")

---

## 5. Win/Lose Screen

### Win State

**Trigger**: All cells filled with correct colors matching the reference.

**Screen Elements** (following Baby Shark's `.result-screen` pattern at line 583-594):

```
┌─────────────────────────────────────┐
│                                     │
│           ⭐ WINNER! ⭐             │  ← 72px icon with pop animation
│                                     │
│        Level 1 Complete!            │  ← Gradient text (win)
│                                     │
│        Accuracy: 100%               │
│        Time: 01:23                  │
│        Score: 1250                  │
│                                     │
│     🌟 New Best Score! 🌟          │  ← Shown only on new high score
│                                     │
│        🏆 Best: 1250                │
│                                     │
│        [➡️ Next Level]              │  ← Primary CTA
│        [🔄 Play Again]             │  ← Secondary CTA
│                                     │
└─────────────────────────────────────┘
```

**Scoring Formula** (proposed):
- Base: 1000 points for completion
- Accuracy bonus: each wrong cell = −50 points (if implemented)
- Time bonus: remaining_seconds × 10 (capped at 600)
- **Score stored**: `marioPixelPainter_highScore` in localStorage (same pattern as line 950-953)

### Lose State (if implemented)

Not strictly needed for a pure coloring game (no time limit → no "lose"). However, if a timer variant is added:

```
┌─────────────────────────────────────┐
│                                     │
│           ⏰ Time's Up!             │
│                                     │
│        Grid: 42/80 filled            │
│                                     │
│        🏆 Best: 1250                │
│                                     │
│        [🔄 Try Again]               │  ← Primary CTA
│        [🏠 Title Screen]           │
│                                     │
└─────────────────────────────────────┘
```

### Button Requirements (AC)

Both win and lose screens MUST feature:
- Clear "Play Again" / "Retry" button — Visible, tappable, contrasting color
- Primary button is visually prominent (`btn-primary`), secondary is outlined (`btn-secondary`)
- Touch target ≥ 48px height per WCAG 2.2

---

## 6. Sound Design

### Audio Architecture

Use **Web Audio API** with oscillator tones (no external audio files) — proven pattern from Baby Shark Manicure (lines 676-711).

| Interaction | Sound | Frequency / Pattern | Duration |
|-------------|-------|---------------------|----------|
| Select color | Soft sine pop | 500Hz, sine | 80ms |
| Paint cell | Rising chirp | 600Hz → 800Hz dual tone | 120ms |
| Wrong color | Low buzz (optional) | 200Hz, square | 100ms |
| Row/area complete | Ascending triple | 523→659→784, sine | 60ms each |
| Level complete | Victory arpeggio | 523→659→784→1047→1319 | 80ms each |
| Cell hover | Subtle tick | 400Hz, sine | 30ms |

### Haptic Feedback

Following `vibe(ms)` pattern in Baby Shark (line 714):

```javascript
function vibe(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }
```

| Action | Vibration | Duration |
|--------|-----------|----------|
| Paint cell | Short pulse | 10ms |
| Level complete | Triple buzz | 10-20-30ms pattern |
| Wrong selection | Reject buzz | 50ms |

Vibration is an enhancement — games must be fully functional without it.

---

## 7. Mobile / Touch UX

### Touch-Optimized Design

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| Cell size ≥ 44px | `min(48px, 10vw)` | WCAG target size, matches existing games |
| No double-tap zoom | `touch-action: manipulation` | Same as Baby Shark's `touch-action: none` (line 51) |
| No 300ms tap delay | `touch-action: manipulation` + pointer events | Use `pointerdown` not `click` |
| Safe area insets | `viewport-fit=cover` + padding + env(safe-area-inset-bottom) | Viewport meta (line 5) |
| Palette at thumb reach | Bottom-mounted, horizontal scroll | Ergonomic analysis |
| Prevent accidental nav | `-webkit-touch-callout: none; user-select: none;` | Standard pattern (line 50-52) |

### Pointer Event Usage

All interactive elements should use **`pointerdown`** (not `click`) for immediate response, matching Baby Shark line 738: `swatch.addEventListener('pointerdown', e => ...)`. This gives sub-100ms response on both touch and mouse.

---

## 8. Accessibility

### Current Pattern Assessment

Existing games in this project follow a "visual-first but accessible" pattern:

| Dimension | Status | Recommendation |
|-----------|--------|---------------|
| Color contrast | ✅ Good | Dark backgrounds with light foregrounds |
| Touch targets | ✅ ≥44px | With `min(48px, 10vw)` cells |
| Keyboard support | ⚠️ Partial | **Required** per AC "at least 2 of 3 input methods" |
| Screen reader | ❌ Not present | Low priority for casual games |
| Motion sensitivity | ⚠️ No prefers-reduced-motion | Add `@media (prefers-reduced-motion: no-preference)` guard on animations |

### Keyboard Controls (Required)

| Key | Action |
|-----|--------|
| `1`-`8` | Select color palette slot (1-8) |
| Arrow keys | Navigate grid cursor |
| `Enter` / `Space` | Paint selected cell |
| `Escape` | Deselect color |
| `Tab` / `Shift+Tab` | Cycle focus between palette and grid |

This satisfies **AC: support at least 2 of touch/mouse/keyboard**. Keyboard support also enables `e` for eraser if implemented.

---

## 9. Responsive Layout Strategy

Following existing game conventions (Baby Shark's responsive block at lines 431-452):

| Breakpoint | Grid Behavior | Cell Size | Palette |
|------------|---------------|-----------|---------|
| > 768px (desktop) | Centered, max 420px width | 48px fixed | Bottom, flex-center |
| 480-768px (tablet) | 85vw width | calc(85vw / gridSize) | Bottom, scrollable |
| < 480px (phone) | 92vw width | calc(92vw / gridSize) | Bottom, swipeable |
| < 640px height | Compact padding | Scale down 15% | Smaller swatches |

The grid itself should use CSS Grid (`display: grid; grid-template-columns: repeat(N, 1fr)`) for cells, not Canvas — this gives:
- Native hit-testing for free (no manual coordinate math)
- CSS transitions for fill animations
- Keyboard focusability for free

---

## 10. Acceptance Criteria Mapping

| AC | UX Design Response | Evidence |
|----|-------------------|----------|
| 3s entry, no tutorial | Single-page app, pre-built DOM, instant grid | Same pattern as Baby Shark (readyState check at line 1067) |
| ≤ 3 min per round | 10×10 grid = ideal; 12×12 max; all levels timed | Analysis per level grid sizing |
| 2/3 input support | Touch (primary) + Mouse (built-in) + Keyboard (explicit) | Controls section above |
| "Play Again" button | `.result-btns` with primary `.btn-primary` + secondary `.btn-secondary` | Baby Shark line 592-594 |
| Sound + haptic | Web Audio API oscillators + `navigator.vibrate()` | Proven pattern line 676-714 |
| High score localStorage | `marioPixelPainter_highScore` key | Pattern line 950-953 |

---

## 11. Competitive Analysis (within project)

Comparing to the closest existing games:

| Element | Baby Shark Manicure | Sparkle Sweep | Mario Pixel Painter (proposed) |
|---------|-------------------|---------------|-------------------------------|
| Interaction | Tap nail → paint | Swipe to clean | Select color → tap cell |
| Grid type | 10 pre-drawn nails | Freeform canvas | N×N pixel grid |
| Tutorial | Implicit (hint text) | Implicit (hint text) | Implicit (hint text) |
| Palette | Bottom color row | N/A (eraser only) | Bottom color row |
| Sound | Web Audio API | N/A | Web Audio API |
| Vibration | ✅ `vibe(10)` | ❌ | ✅ |
| Win screen | ✅ Stars + animation | ✅ Stars + score | ✅ Stars + score |
| Score calc | Speed + accuracy | Clean count | Accuracy + time |
| Best score | localStorage | localStorage | localStorage |

**Key differentiation**: Mario Pixel Painter is the first **grid-based coloring** game in the project. The pixel grid introduces a spatial challenge (matching to a reference) not present in Baby Shark's free-form nail painting.

---

## 12. Visual Design Mockup (ASCII)

### Title Screen
```
┌──────────────────────────────────────────┐
│                                          │
│                🎨 🏁 🎨                  │
│                                          │
│          MARIO PIXEL PAINTER              │  ← Outfit font, bold gradient
│                                          │
│           ⬛ A pixel art journey          │
│                                          │
│               [ ▶ PLAY ]                 │  ← Large, pulsing CTA
│                                          │
│              🏆 Best: 1250               │  ← localStorage
│              Level 1 of 6               │
│                                          │
└──────────────────────────────────────────┘
```

### Game Screen
```
┌──────────────────────────────────────────┐
│   ← Back    ⭐ Level 1    ⏱ 00:45      │  ← Header: back, level, timer
│                                          │
│        ┌──┬──┬──┬──┬──┬──┬──┬──┐        │
│        │⚪│⚪│⚪│🔴│🔴│⚪│⚪│⚪│        │
│        │⚪│🔴│🔴│🟡│🟡│🔴│🔴│⚪│        │  ← Pixel grid
│        │⚪│🔴│🟡│🟡│🟡│🟡│🔴│⚪│        │    10×8 mushroom
│        │⚪│🔴│🟢│🟢│🟢│🟢│🔴│⚪│        │
│        │⚪│⚪│🟤│🟤│🟤│🟤│⚪│⚪│        │
│        └──┴──┴──┴──┴──┴──┴──┴──┘        │
│                                          │
│   Progress: ▰▰▰▰▰▰▰▰▰▰ 42/80            │  ← Progress bar
│                                          │
│   ┌──┬──┬──┬──┬──┬──┬──┬──┐             │
│   │🔴│🟢│🟡│🔵│🟤│⬜│⬛│👆│             │  ← Palette (color selected)
│   └──┴──┴──┴──┴──┴──┴──┴──┘             │
│                                          │
└──────────────────────────────────────────┘
```

---

## 13. Implementation Recommendations (to Tech Side)

1. **Grid rendering**: Use CSS Grid (not Canvas) for cell-level interactivity, keyboard focus, and CSS transitions — Canvas is only needed for complex pixel effects (optional).
2. **Level data format**: JSON array of `{name, gridW, gridH, pixels: number[][], palette: string[]}` where `pixels[row][col]` references palette index (0 = empty/unfillable, 1+ = fill target).
3. **Scoring**: Store high score as flat integer. The scoring formula should be simple (completion + speed bonus).
4. **Touch guard**: Add `touch-action: manipulation` on the game container to prevent double-tap zoom.
5. **Preload images**: If using Mario-themed decorative elements (pipes, clouds, coins), use inline SVG or CSS to avoid network requests — matches the "3s entry" AC.

---

## 14. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Grid cells too small on mobile | Medium | High | Use `min(48px, 10vw)` — verified across devices |
| Level artwork too hard to recognize | Medium | Medium | Use iconic Mario shapes (mushroom, star, question block) at 10×10 minimum |
| Color palette over 8 colors | Low | Medium | Clamp at 8; use Mario's established palette |
| Users confused about what to do | Low | Medium | Hint text + first level is the simplest (mushroom) |

---

*Analysis prepared by UX-Analyst (Issue #79 Mario Pixel Painter)*
*Based on project patterns from games/073-baby-shark-manicure, games/075-sparkle-sweep, games/shared/game-frame.css*
*Sibling coordination: tech-analyst — confirmed grid size 10×10, palette bottom placement, vibration API feasibility*
