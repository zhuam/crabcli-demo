# Technical Analysis: [Game 078] Photo Puzzle Restore

## Overview

- **Issue**: #78 — Photo Puzzle Restore
- **Genre**: Puzzle/Jigsaw — drag pieces to restore a photo
- **Proposed directory**: `games/078-photo-puzzle-restore/`
- **Proposed game ID**: `photo-puzzle-restore`
- **Category**: `puzzle`
- **Player count**: 1 (singleplayer)
- **Has server**: false (pure client-side)
- **Version**: 1.0.0

---

## 1. Architecture & Rendering Approach

### Decision: Canvas2D with DOM overlay

**Chosen approach**: Canvas2D for the puzzle board + HTML/CSS for UI chrome (title screen, result screen, toolbar).

**Rationale** (evidence: `games/080-guinea-pig-jigsaw/index.html` — identical architecture proven in production):

| Aspect | Canvas2D | Pure DOM |
|--------|----------|----------|
| Piece rendering | Native — drawImage clips, transforms | CSS clip-path + position — complex & janky |
| Drag & drop | PointerEvents on canvas, single capture | Each piece is a DOM element — event management N× |
| Grid snapping | Euclidean distance < threshold | Same logic but on DOM positions |
| High-DPI | Canvas DPR scaling built-in | CSS transform or JS correction needed |
| Performance | Single draw call per frame | N DOM reflows per frame |
| Custom upload | Draw uploaded image to canvas | File → CSS background-image clips |

### File structure (follows project convention)

```
games/078-photo-puzzle-restore/
├── index.html      # All-in-one: HTML + CSS + JS (single file deploy)
├── style.css       # (optional — split if CSS exceeds 200 lines)
├── app.js          # (optional — split if JS exceeds 800 lines)
├── tests/
│   ├── static.test.cjs   # Static analysis test (Node)
│   └── behavior.test.cjs # Behavioral test (Puppeteer/Playwright)
├── thumb.png       # Thumbnail for hub
└── README.md       # Chinese + English, with acceptance checklist
```

**Recommendation**: Start as a single `index.html` (inline CSS + JS) matching the `080-guinea-pig-jigsaw` pattern. Split only if file exceeds 2000 lines.

---

## 2. Key Technology Choices

### 2.1 Input Handling — PointerEvents API

**Unified pointer model** (evidence: `080-guinea-pig-jigsaw/index.html:1543-1546`):

```js
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
```

- Touch + mouse + pen handled by one API — **no dual binding**.
- `touch-action: none` on canvas prevents scroll interference.
- `setPointerCapture` keeps drag target stable even if finger moves off canvas.
- **Keyboard** (arrow keys for fine adjustment + Enter/Space to snap) also supported — `080` lines 1549-1588.

### 2.2 Photo Source — Canvas-generated images with upload support

**Two modes**:

1. **Built-in images** (5+ procedural images generated via canvas drawing functions) — see `080:642-807`. For #78, replace guinea pig drawings with:
   - Colorful geometric patterns (circles, stripes, gradients) 
   - Nature-inspired color palettes (sunset, ocean, forest, etc.)
   - Each image is ~5KB as dataURL → no external assets needed

2. **Custom upload** (file input → FileReader → Image → canvas) — `080:1516-1535`

**Progression mechanism**: "New photo pack" = cycle through procedural image seeds. The game can pre-generate 5-10 visually distinct images. On win → unlock next image. The pool is expandable by adding more `IMAGE_SEEDS` functions.

### 2.3 Timer — performance.now monotonic

Follow `080:1249-1289`: `performance.now()` monotonic clock (same as Stopwatch pattern from `concept-timer-state-machine.md`). Wall-clock not used since this is real-time gameplay, not a delayed finish.

- Max: 180 seconds (3 minutes, matching spec)
- Warning state: last 15 seconds → pulsing timer
- Timeout → result screen with partial score → "再来一局" button

### 2.4 Audio — Web Audio API lazy init

Follow `080:837-890`:
- Lazy creation on first user gesture (`initAudio()` called on Start button click)
- OscillatorNode-based sound synthesis (no audio files needed)
- Sounds: pickup (triangle 600Hz), snap (click + thump), complete (C5-E5-G5 arpeggio), wrong drop (sawtooth 150Hz)
- Haptic: `navigator.vibrate()` on pickup (10ms), snap (15ms), complete (pattern)
- Mute toggle button, state persisted?

### 2.5 Persistence — localStorage

Key: `photo_puzzle_restore_best`

Schema:
```json
{
  "bestScore": 2400,
  "fastestTime": 45,
  "gamesPlayed": 12,
  "wins": 8,
  "unlockedPacks": 3
}
```

Also: `recentlyPlayed` list for hub (`096-word-ladder-climb/index.html:125-133`).

---

## 3. Data Flow

```
Title Screen                    Game Screen                    Result Screen
┌──────────────┐              ┌──────────────────┐           ┌──────────────────┐
│ Select diff   │──[start]──→  │ Generate image    │──[win]──→│ Show score        │
│ Select pack   │              │ Slice into N×N    │          │ Calc stars        │
│ View HS       │              │ Shuffle & scatter │          │ Save best         │
│ Start btn     │              │ Timer counts up   │          │ "再来一局"/菜单    │
└──────────────┘              │ Drag→snap pieces   │          └──────────────────┘
                              │ Progress bar       │
                              │ Preview toggle     │──[timeout]──→ Partial result  │
                              │ Shuffle btn        │              "时间到!再快一点" │
                              │ Upload photo btn   │              └──────────────────┘
                              └──────────────────┘
```

### State machine

```
IDLE → PLAYING → WON / TIMEOUT → RESULT → IDLE (replay) or back to menu
              ↘ (back to menu) → IDLE
```

**States**:
- `title` — difficulty selection screen
- `playing` — active puzzle game (timer running)
- `complete` — result screen (won or timeout)

---

## 4. Difficulty Design

Follow `080:592-597` with slight adjustment:

| Difficulty | Grid | Pieces | Snap threshold | Est. time |
|-----------|------|--------|---------------|-----------|
| Easy | 3×3 | 9 | 48px | 30-60s |
| Medium | 4×4 | 16 | 36px | 60-120s |
| Hard | 5×5 | 25 | 28px | 120-180s |

**UX analyst recommended 3×3 and 4×4** — I align but suggest adding 5×5 as "hard" for replayability. All within 3-minute limit.

**Touch target validation**: At 420px phone-frame width:
- 3×3: ~140px per piece ✅ (well over 60px minimum)
- 4×4: ~105px per piece ✅
- 5×5: ~84px per piece ✅

---

## 5. Technical Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Image upload on slow device | Memory pressure | Low | Limit file size client-side, use downscaled canvas |
| DPR rendering on very large images | Jank on old phones | Low | Cap canvas resolution at 1024×1024 |
| Canvas pointer capture on iOS Safari | Drag may break on scroll | Medium | Test on iOS Safari; `touch-action: none` + `overscroll-behavior: none` |
| Arrow key snapping UX unclear | Players don't know keyboard mode | Medium | Show keyboard hint in title screen footer |
| 080-guinea-pig-jigsaw already very similar | Duplicate effort | High (already happened) | **Reuse pattern** but differentiate: #78 has procedural photo images (geometric/landscape), not character art; "photo packs" progression; simpler mascot-free title screen |

---

## 6. Key Differences from `080-guinea-pig-jigsaw` (Critical)

Since `080-guinea-pig-jigsaw` is already a complete jigsaw puzzle game, we should:

**Reuse**:
- Canvas2D + pointer events architecture
- Timer, scoring, star rating system
- Sound synthesis + haptics
- localStorage persistence pattern
- Screen management (title → game → result)
- Preview ghost overlay
- Shuffle button

**Change**:
- Image generation: Replace guinea pig drawing functions with abstract geometric/photo-style renders (color gradients, circles, triangles, stripe patterns — visually more "photo-like")
- Title screen: Remove mascot CSS art, use a clean centered title + photo icon
- Photo packs as progression: Track `unlockedPacks` in localStorage; new pack unlocks on first win at each difficulty
- "换图" cycles through packs rather than same-style images
- Game ID and all localStorage keys will be different (`photo_puzzle_restore_*`)

---

## 7. Registering the Game

Add to `games/registry.json`:

```json
{
  "id": "photo-puzzle-restore",
  "name": "Photo Puzzle Restore",
  "description": "被打乱的照片需重新还原 — 拖拽拼块，完成照片!",
  "category": "puzzle",
  "tags": ["singleplayer", "puzzle", "drag", "short-session"],
  "thumbnail": "/games/078-photo-puzzle-restore/thumb.png",
  "path": "/games/078-photo-puzzle-restore/",
  "hasServer": false,
  "players": "1",
  "version": "1.0.0",
  "rating": 4.0
}
```

---

## 8. Acceptance Criteria — Technical Mapping

| AC | Technical Implementation |
|----|------------------------|
| 首屏3秒可进入游玩 | Single HTML file, no external deps; click Start → Game screen within one frame cycle |
| 单局≤3分钟 | Timer capped at 180s; eval timeout at 180s |
| 触屏/鼠标/键盘至少两种 | PointerEvents (touch+mouse) + keyboard (arrows+Enter) = 3 types |
| 失败/胜利有"再来一局" | `btn-replay` on result screen (both won and timeout) |
| 音效与震动齐全 | Web Audio pickup/snap/complete + vibrate patterns |
| 最高分存到本地 | localStorage `photo_puzzle_restore_best` on each game end |

---

## 9. Estimated Implementation Effort

| Component | Est. lines | Based on |
|-----------|-----------|----------|
| HTML structure + CSS | 400 | `080:1-451` |
| Image generation (5 procedural photos) | 200 | `080:642-807` style |
| Game logic (pieces, drag, snap, timer) | 500 | `080:896-1510` |
| Input handling | 150 | `080:1136-1243` |
| Audio + haptics | 80 | `080:837-890` |
| Result screen + scoring + persistence | 150 | `080:1295-1436` |
| Event binding + init | 100 | `080:1541-1711` |
| **Total** | **~1580** | Inline in one HTML file |

---

## References

- `games/080-guinea-pig-jigsaw/index.html` — primary reference (full jigsaw implementation)
- `games/096-word-ladder-climb/` — project structure pattern
- `games/registry.json` — registration format
- `wiki/crabcli-games/concept-vanilla-web-stack.md` — zero-dependency architecture
- `wiki/crabcli-games/concept-timer-state-machine.md` — timer patterns
- `wiki/crabcli-games/concept-game-hub-architecture.md` — registry-driven game loading
- `games/shared/game-frame.css` — "← Arcade" back-navigation bar
