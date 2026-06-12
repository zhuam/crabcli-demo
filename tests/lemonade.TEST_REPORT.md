# Idle Lemonade Stand — Test Report (Issue #99)

**Code under test**: `games/099-idle-lemonade/index.html` (commit `d08fef8`)
**Test file**: `tests/lemonade.test.mjs`
**Run**: `npm run test:lemonade`  → **82 passed, 0 failed**

## Strategy

Pure-Node, zero-dep tests. Two layers:

1. **Static analysis (Part A)** — regex over the raw HTML to assert wiring of
   acceptance criteria features (event listeners, config constants, DOM IDs,
   localStorage keys, audio/haptic API references).
2. **Dynamic simulation (Parts B & C)** — extract the inline `<script>` block,
   run it inside `node:vm` against a minimal DOM/`localStorage`/`navigator`/
   `AudioContext`/`requestAnimationFrame` mock, then drive real game flow:
   pointer events, key events, clock advance + frame pump.

## Coverage matrix vs. Acceptance Criteria

| AC | Description                                  | Static | Dynamic |
| -- | -------------------------------------------- | :----: | :-----: |
| 1  | First playable frame ≤ 3s, no tutorial       |   ✅   |    ✅   |
| 2  | Round ≤ 3 minutes (`MAX_DUR_MS = 180_000`)   |   ✅   |    ✅   |
| 3  | ≥ 2 input methods (touch + mouse + keyboard) |   ✅   |    ✅   |
| 4  | Win/Lose modal + clear "Play Again" button   |   ✅   |    ✅   |
| 5  | Audio (WebAudio) + haptic (`navigator.vibrate`) |  ✅   |    ✅   |
| 6  | High score persisted to `localStorage`       |   ✅   |    ✅   |

## Boundary / regression tests added (Part C)

| ID  | Scenario                                                                  |
| --- | ------------------------------------------------------------------------- |
| C1  | Win path: cash ≥ `WIN_TARGET` ⇒ "🎉 IPO Success!" + `fastestWinMs` saved. |
| C2  | Buying an employee deducts cash and fires upgrade SFX.                    |
| C3  | Buying when broke is rejected — fail haptic only, no state change.        |
| C4  | `ArrowLeft` / `ArrowRight` clamp price to `[1, 10]`.                      |
| C5  | Auto-income from employees ticks cash forward without clicks.             |
| C6  | Muted state suppresses audio but keeps gameplay intact.                   |
| C7  | `highScore` + `muted` survive a "reload" (re-running the inline script).  |
| C8  | `R` key restarts the round from the end modal.                            |
| C9  | `visibilitychange` pauses rAF when `document.hidden`.                     |
| C10 | Replay after end preserves `highScore` in `#best`.                        |
| C11 | `clickSell` is ignored after the game has ended (no double-counting).     |
| C12 | Cost scaling: 2nd purchase costs strictly more than the 1st.              |

## Findings

No production bugs uncovered. The implementation cleanly satisfies all
documented acceptance criteria and is robust to the boundary cases above.

## How to run

```bash
npm run test:lemonade
```
