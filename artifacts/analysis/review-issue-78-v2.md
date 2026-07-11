# Code Review — Photo Puzzle Restore (Issue #78 / v2)

**Reviewer**: reviewer2 (t6)  
**Review date**: 2026-07-11  
**Commit under review**: `7c44eb3` (t2-develop bug fix round)  
**Prior review**: None found on disk — this is the first systematic review of this game.

---

## 1. Bug Fix Verification (t2-develop changes)

### ✅ Fix #1: Star thresholds — time-based, achievable
- **Before**: `calcStars` used score thresholds (`expectation * 2 ≈ 2700`) that were mathematically unreachable (max achievable ≈ 1500 for 3×3).
- **After**: Time-based thresholds — 3★ < 60s, 2★ < 120s.
- **Verdict**: Correct. The new thresholds are achievable and well-balanced for both grid sizes (3×3 limit = 120s, 4×4 limit = 180s).

### ✅ Fix #2: Hint flash — rendered in game loop
- **Before**: Hint drawn directly in the click handler then immediately overwritten by the next render frame (~16 ms). The `setTimeout(1500)` was a no-op.
- **After**: `STATE.hintPiece` + `STATE.hintTimer` drive the highlight in `render()` via `gameLoop`. Pulsing glow with `performance.now()`/200 sine wave.
- **Verdict**: Correct. The 1.5s visible duration is verified in the code. One minor observation: hintTimer decay uses `1/60` per frame rather than delta-time, making it frame-rate-dependent (see §2).

### ✅ Fix #3: Upload timer state reset
- **Before**: `handleCustomPhoto` replaced pieces but did NOT reset timer, timerStarted, timerRunning, drag state, or hint state. Timer continued running from its previous value.
- **After**: Resets `STATE.timer`, `timerStarted`, `timerRunning`, `dragPiece`, `glowAnimations`, `hintPiece`, `hintTimer`, cancels `timerRAF`, removes `warning` class, and updates timer display.
- **Verdict**: Correct. Complete state reset.

### ✅ Fix #4: gamesPlayed increment on every win
- **Before**: `gamesPlayed` only incremented inside the `if (isNew)` block — only counted wins that were also new high scores.
- **After**: Moved outside the block; always increments on win.
- **Verdict**: Correct.

### ✅ Fix #5: Tab-background timer pause
- **Added**: `visibilitychange` listener. Pauses timer when tab hidden; resumes with `timerLastTime = performance.now()` when tab focused (avoiding accumulated time skew).
- **Edge case**: If tab was hidden and game timed out, on return it won't resume because `remaining > 0` check fails — correct behavior.
- **Verdict**: Clean implementation.

---

## 2. Remaining Code Quality Issues

### 🔶 M2.1 — hintTimer decay is frame-rate dependent (minor)
- **File**: `index.html:1385-1387`
- **Code**: `STATE.hintTimer -= 1/60;`
- **Issue**: Each frame reduces hintTimer by a fixed 16.7ms regardless of actual frame delta. On 30 fps, the hint lasts ~3 seconds instead of 1.5s. On 120 fps, it lasts ~0.75s.
- **Suggestion**: Use a delta-time approach (store `hintLastTime` and subtract actual elapsed seconds), similar to how the main timer works. Low priority — the feature is cosmetic.

### 🔶 M2.2 — hintIndex not reset on custom photo upload (minor)
- **File**: `index.html:1516` (hint button handler tracks STATE.hintIndex)
- **Issue**: `handleCustomPhoto` resets `hintTimer` and `hintPiece` but does NOT reset `STATE.hintIndex`. After upload, the hint cycle continues from wherever it was rather than starting at index 0 of the new puzzle.
- **Impact**: Very minor — the hint highlight still works, just points to an arbitrary unsnapped piece rather than the "first" one.
- **Suggestion**: Add `STATE.hintIndex = 0;` in `handleCustomPhoto` alongside the other reset lines.

### 🔶 M2.3 — calcStars has an unused parameter (code smell)
- **File**: `index.html:1146`
- **Code**: `function calcStars(score)` — but the function body only uses `STATE.timer`, not `score`.
- **Suggestion**: Remove the parameter for clarity, or keep it for future use. Not a functional issue.

### 🔶 M2.4 — handleCustomPhoto duplicates initPieces logic (moderate)
- **File**: `index.html:1396-1452`
- **Issue**: The custom photo handler duplicates the piece-initialization loop (rows × cols, creating canvas per cell, drawing sub-image, adding border + connector dots) that already exists in `initPieces()` at line 784.
- **Suggestion**: Refactor `handleCustomPhoto` to call `initPieces()` with a synthetic image canvas, then only re-shuffle. DRY improvement.

### 🔶 M2.5 — No double-click guard on startGame (minor)
- **File**: `index.html:1318-1365`
- **Issue**: Rapid clicks on "开始游戏" could trigger multiple concurrent `generateImage` calls. The `cancelAnimationFrame(STATE.animFrame)` helps but there's no guard flag (`STATE.starting`) to prevent re-entry before the async Image.onload fires.
- **Impact**: In practice, the last callback wins; the risk is wasted image generation work, not a crash.

---

## 3. Acceptance Criteria Check

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | 首屏 3 秒内进入游玩 | ✅ Pass | Game loads inline, no assets to fetch |
| 2 | 单局时长 ≤ 3 分钟 | ✅ Pass | 3×3=120s, 4×4=180s |
| 3 | 触屏/鼠标/键盘 | ✅ Pass | PointerEvents + keyboard (arrows, Space, Enter, Esc) |
| 4 | "再来一局"按钮 | ✅ Pass | `btn-replay` on result screen |
| 5 | 音效与震动反馈 | ✅ Pass | sfx functions + navigator.vibrate |
| 6 | 本地存储最高分 | ✅ Pass | localStorage (win and fail both save) |

---

## 4. Additional Observations

### Structure & Readability
- Code is wrapped in an IIFE with no global leakage (`'use strict'`). Good.
- Constants (GRID_SIZES, PACKS, IMAGE_SEEDS) are cleanly separated.
- Screens are managed via CSS class `.active` toggle — simple and effective.
- Overall ~1620 lines for a single-file game — acceptable for this genre.

### Edge Cases Covered
- Canvas context loss: Not handled (acceptable for Astrocade-style games).
- localStorage unavailable: Graceful try/catch (✓).
- AudioContext init on first user gesture (✓).
- `ref-thumb` label hidden after image loads (✓).
- Timer display shows full countdown immediately on game start (✓).

### Accessibility
- ARIA roles on difficulty radio buttons (✓).
- Back-link to hub for screen readers (✓).
- No `alt` text on procedural images — acceptable as they are decorative.
- `prefers-reduced-motion` media query honored (✓).

---

## 5. Summary

**Bug fixes**: All 5 changes from t2-develop are correct, complete, and clean.

**Remaining issues found**: 5 code-quality observations (2 minor, 2 moderate, 1 code smell). No correctness bugs found beyond the bugs already fixed.

**Verdict**: The code is in good shape post-fix. The remaining issues are non-blocking — M2.2 (hintIndex reset) is the most actionable quick fix. Recommend accepting the fix commit.

**Suggested follow-up**: Consider M2.4 (deduplicate piece initialization) if further refactoring work is planned.
