# Code Review: Photo Puzzle Restore (Issue #78)

**Reviewer**: `reviewer` (t6)
**Date**: 2026-07-11
**Target**: `games/078-photo-puzzle-restore/index.html` (commit `65b0795`)
**Review scope**: Full game implementation: HTML/CSS/JS inline (1579 lines)

---

## Executive Summary

**Overall verdict**: ✅ **Pass with moderate concerns**. The implementation is functionally complete, meets all 6 acceptance criteria, and follows the established project patterns from `080-guinea-pig-jigsaw`. The game is playable and well-structured. However, there are 2 bugs requiring attention (one timer-related, one persistence inconsistency) and several moderate quality/robustness gaps.

| Dimension | Rating | Key Finding |
|-----------|--------|-------------|
| Structure & Readability | 🟢 Good | Well-organized IIFE, clear section comments |
| Correctness | 🟡 Moderate | 1 real bug (timer pause), 1 data consistency bug |
| Boundary/Error Handling | 🟡 Moderate | Silent failure on image gen, no file size limit |
| Security | 🟢 Safe | Upload uses canvas — no XSS vector confirmed |
| Performance | 🟡 Minor | Render loop runs on title screen, hint draws outside loop |
| Accessibility | 🟡 Adequate | Aria roles present; missing focus management, aria-live |
| AC Compliance | 🟢 Full | All 6 acceptance criteria met |
| UX Fidelity vs Design Spec | 🟡 Minor gaps | Snap animation, empty-grid dash outline not implemented |

---

## Detailed Findings

### 🔴 CRITICAL

#### C1. Tab-background timer pause (game integrity issue)

**Location**: `index.html:1080-1103` (`timerTick` using `requestAnimationFrame`)
**Severity**: Medium-High

`requestAnimationFrame` pauses when the tab is backgrounded. A player can effectively **pause the timer by switching tabs**, gaining an unfair advantage in a timed game.

**Evidence**:
- Line 1080: `function timerTick()` uses `performance.now()` deltas
- Lines 1082-1083: delta is computed from `performance.now() - timerLastTime`
- When tab is hidden, rAF callbacks stop entirely; no delta accumulates

**Suggested fix**: Add `document.addEventListener('visibilitychange', ...)` to pause/resume the timer:
```js
document.addEventListener('visibilitychange', function() {
  if (document.hidden && STATE.timerRunning) {
    STATE.timerRunning = false;
  } else if (!document.hidden && STATE.timerStarted && !STATE.timerRunning) {
    timerLastTime = performance.now();
    STATE.timerRunning = true;
    timerTick();
  }
});
```

---

#### C2. `gamesPlayed` not incremented on non-record wins (data inconsistency)

**Location**: `index.html:1151-1168` (`saveBest`, `saveProgress`)
**Severity**: Medium

The save logic has a gap: non-record-breaking wins silently skip incrementing `gamesPlayed`.

| Outcome | `saveBest()` called? | `gamesPlayed` incremented? |
|---------|---------------------|---------------------------|
| Win + new record | Yes (line 1245) | ✅ Yes, inside `saveBest()` (line 1158) |
| Win + no new record | Yes (line 1245) | ❌ **No** — `saveBest()` returns early at line 1155 |
| Loss | No | ✅ Yes, via `saveProgress()` (line 1248) |

**Root cause** (lines 1155-1158):
```js
if (isNew) {
  data.bestScore = score;
  data.gamesPlayed = (data.gamesPlayed || 0) + 1;
}
```
`gamesPlayed` increment is inside the `if (isNew)` block. Non-record wins fall through without counting.

**Suggested fix**: Move `gamesPlayed` increment outside the `if` guard, or always call `saveProgress()` on game end regardless of outcome:
```js
// In showResult():
saveProgress(); // always record a game was played
var result = won ? saveBest(score) : { isNewRecord: false };
```

---

### 🟡 MODERATE

#### M1. Silent failure on image generation error

**Location**: `index.html:775, 1329`
**Impact**: User clicks "开始游戏" — nothing happens, no error feedback

When `generateImage` fails (e.g., memory pressure on low-end device), the callback receives `null` for `img`. The handler at line 1329 silently returns (`if (!img) return;`). The user sees no visual change — the button click appears to do nothing.

**Suggested fix**: Show a toast/alert or retry mechanism:
```js
function startGame() {
  // ...
  generateImage(seedIdx, Math.max(cw, ch) * 2, function(img, imgCanvas) {
    if (!img) {
      $('btn-start').textContent = '生成失败，请重试';
      setTimeout(function() { $('btn-start').textContent = '开始游戏'; }, 2000);
      return;
    }
    // ...
  });
}
```

---

#### M2. No file size validation on custom photo upload

**Location**: `index.html:1373-1418` (`handleCustomPhoto`)
**Impact**: A 20+ MB photo from a phone camera could cause memory pressure on low-end devices

The `FileReader` reads the entire file into a data URL (`reader.readAsDataURL(file)`) without any size check. The tech analysis (section 5) recommended client-side file size limiting.

**Suggested fix**: Add size check before reading:
```js
function handleCustomPhoto(file) {
  if (!file || !file.type.match(/image\/.*/)) return;
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    alert('图片文件过大，请选择 5MB 以内的图片');
    return;
  }
  // ...
}
```

---

#### M3. Upload during active game doesn't reset timer/progress

**Location**: `index.html:1373-1418`
**Impact**: If user uploads a photo mid-game, the old timer keeps running and progress bar shows stale snapped count

The upload button is in the game toolbar (active during gameplay). `handleCustomPhoto` replaces pieces but doesn't:
- Reset `STATE.timer` / `STATE.timerStarted` / `STATE.timerRunning`
- Reset `STATE.snappedCount`
- Clear `STATE.glowAnimations`

This means the existing timer can expire while the user is working on the newly uploaded photo.

**Suggested fix**: Reset relevant state at the start of `handleCustomPhoto`:
```js
function handleCustomPhoto(file) {
  STATE.snappedCount = 0;
  STATE.timer = 0;
  STATE.timerStarted = false;
  STATE.timerRunning = false;
  STATE.glowAnimations = [];
  // ... rest of function
}
```

---

#### M4. Continuous render loop on title screen wastes battery

**Location**: `index.html:1363-1368` (`gameLoop`)
**Impact**: Unnecessary CPU/GPU usage on mobile when player is just browsing the menu

`gameLoop` runs continuously even on the title screen (line 1364: `STATE.screen === 'playing' || STATE.screen === 'title'`). The canvas content doesn't change on the title screen — there's nothing to render.

**Suggested fix**: Only render during gameplay:
```js
function gameLoop() {
  if (STATE.screen === 'playing') {
    render();
    STATE.animFrame = requestAnimationFrame(gameLoop);
  } else if (STATE.screen === 'title') {
    render(); // render once
  }
}
```

---

#### M5. Hint draws directly to canvas outside render loop — fragile

**Location**: `index.html:1470-1490`
**Impact**: Hint flash may be overwritten before user sees it, or persist if render loop stops

The hint button directly calls `ctx.save()/strokeRect()/restore()` outside the render loop. This works only because the render loop runs continuously. If the render loop is optimized (see M4), the flash would be lost in 16ms.

**Suggested fix**: Use the `glowAnimations` array pattern instead:
```js
$('btn-hint').addEventListener('click', function() {
  var unsnapped = STATE.pieces.filter(function(p) { return !p.snapped; });
  if (unsnapped.length === 0) return;
  var target = unsnapped[STATE.hintIndex % unsnapped.length];
  STATE.hintIndex++;
  STATE.glowAnimations.push({ piece: { homeX: target.homeX, homeY: target.homeY }, alpha: 0.8 });
});
```

---

### 🟢 MINOR

#### N1. `ref-label` hidden via inline style instead of CSS class

**Location**: `index.html:1336, 1390`
```js
$('ref-thumb').querySelector('.ref-label').style.display = 'none';
```
Prefer a CSS class for maintainability:
```js
$('ref-thumb').querySelector('.ref-label').classList.add('hidden');
```

---

#### N2. Keyboard hint — Esc only works during drag

**Location**: `index.html:1036-1052, 414`
The hint says "Esc 取消" but Esc only deselects a currently-dragging piece. If no piece is being dragged, Esc is a no-op. Hint could be clearer: "Space 放置 · Esc 取消拖拽".

---

#### N3. No focus management on screen transitions

When switching between title/game/result screens, focus is not moved to the first interactive element (e.g., the difficulty radio group or the "再来一局" button). Keyboard users may lose context.

**Suggested fix**: In `showScreen()`, move focus explicitly:
```js
function showScreen(id) {
  // ...
  var firstFocusable = target.querySelector('button, [tabindex]');
  if (firstFocusable) firstFocusable.focus();
}
```

---

#### N4. No `aria-live` region for game state announcements

Screen reader users receive no audio feedback when:
- A piece snaps into place
- Timer enters warning state
- Game ends (win/loss)

**Suggested fix**: Add a hidden `aria-live="polite"` region and update its text on state changes:
```html
<div id="sr-announce" class="sr-only" aria-live="polite"></div>
```

---

## UX Fidelity vs Design Spec

Comparison against UX analysis (`artifacts/analysis/ux-analysis-issue-78.md`):

| Feature | UX Spec | Implementation | Status |
|---------|---------|---------------|--------|
| Snap threshold | 30px | 42px (3×3) / 32px (4×4) | 🟢 Reasonable adjustment |
| Timer warning | <30s → red pulse | <15s → red pulse | 🟡 Minor diff — consider <30s |
| Piece scale on select | 1.05x + shadow | Border highlight only | 🟡 Missing — would improve feel |
| Empty grid dashed line | Show on piece pickup | Not implemented | 🟡 Acceptable |
| Wrong-place spring-back | Animated bounce | Instant reposition | 🟡 Missing — feels mechanical |
| Star criteria | Time-based | Score-based (time+puzzle) | 🟢 Better — more nuanced |
| Haptic: select | 10ms | 10ms | ✅ Match |
| Haptic: correct | 18ms | 15ms | ✅ Close enough |
| Haptic: win | [60,35,90] | [15,30,15,30,15] | 🟡 Different pattern (acceptable) |
| 5×5 hard mode | Mentioned as option | Not implemented | 🟢 Per analyst recommendation |

---

## Code Quality Summary

| Metric | Observation |
|--------|-------------|
| File size | 1579 lines — within single-file limits (under 2000) |
| IIFE | ✅ Uses `(function() { 'use strict'; ... })()` |
| CSS custom properties | ✅ Well-organized, clean theme system |
| Event binding | ✅ Cleanly in `init()` function |
| Audio | ✅ Lazy init on first gesture, good pattern |
| localStorage | ✅ Graceful with try-catch around JSON.parse |
| Security (upload) | ✅ Canvas-based rendering, no innerHTML injection |

---

## Recommendations (Priority Order)

1. **🔴 Fix C1** — Add `visibilitychange` handler to prevent timer pause cheating
2. **🔴 Fix C2** — Always increment `gamesPlayed` on game end
3. **🟡 Fix M2** — Add 5MB file size limit on upload
4. **🟡 Fix M3** — Reset timer/state on photo upload mid-game
5. **🟡 Fix M1** — Show error feedback when image generation fails
6. **🟡 Fix M4** — Stop render loop on title screen (battery)
7. **🟡 Fix M5** — Move hint flash to `glowAnimations` pattern
8. **🟢 Fix N3 + N4** — Focus management + aria-live for a11y

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | 首屏3秒可进入游玩 | ✅ | Single HTML, no deps, ~15KB gzipped |
| 2 | 单局≤3分钟 | ✅ | 120s (3×3) / 180s (4×4) capped |
| 3 | 触屏/鼠标/键盘≥2种 | ✅ | PointerEvents (touch+mouse) + keyboard arrows/Enter/Esc |
| 4 | 结算页"再来一局" | ✅ | `#btn-replay` + `#btn-menu` on result screen |
| 5 | 音效与震动齐全 | ✅ | 5 sound types + vibrate patterns for each event |
| 6 | 最高分本地存储 | ✅ | localStorage `photo_puzzle_restore` key, updates on game end |
