# Tests · Idle Lemonade Stand (Issue #99)

## Files

| File | Type | Purpose |
|---|---|---|
| `static.test.cjs` | Node CommonJS | Headless static analysis: DOM ids, regex over JS source, sandboxed unit-tests of pure functions (`priceMultiplier`, `employeeCost`). 119 assertions. CI-friendly. |
| `behavior.test.cjs` | Node CommonJS | Behavior + boundary + regression tests: VM-executed `fmtMoney`/`fmtTime` extremes, `priceMultiplier` continuity, `computeIncomePerSec` upgrade-mult composition, localStorage round-trip with mock (incl. corrupt-JSON / Safari-private fallback), full `restartGame` purity, SFX+haptic 6-trigger completeness, P0/P1 regression locks (legacy dir removed; default tab=staff). 127 assertions. |
| `integration.test.cjs` | Node CommonJS | **NEW** — E2E-style boot of the REAL `app.js` inside a hand-rolled DOM stub (no jsdom dep): asserts post-boot DOM mutations, drives sell/click/tab/keydown/mute/price events, simulates the timeout end-state by advancing fake `performance.now()` past `MAX_GAME_SEC`, verifies modal + LS persistence, then triggers restart via Enter and asserts full DOM reset. Plus boundary sweeps (priceMultiplier monotonicity, fmtMoney 200-sample fuzz, employeeCost @ n∈{0..100}) and additional regression locks (best loaded before renderAll, no-op sellOne after finished, badge guards). 82 assertions. |
| `smoke.test.html` | Browser harness | Loads the actual game in an `<iframe>`, simulates pointer/keyboard events, asserts DOM mutations and localStorage round-trip. Good for visual & timing checks. |

## Run

### Static (no browser, deterministic)

```bash
cd games/099-idle-lemonade-stand
node tests/static.test.cjs       # 119 passed · 0 failed
node tests/behavior.test.cjs     # 127 passed · 0 failed
node tests/integration.test.cjs  #  82 passed · 0 failed
```

Combined: **328 assertions** across all three Node suites.

### Browser smoke

Serve the repository root via any static HTTP server (browsers refuse `file://` iframes):

```bash
# from repo root
python -m http.server 8000
# then open
# http://localhost:8000/games/099-idle-lemonade-stand/tests/smoke.test.html
```

The page auto-runs on load and shows a green/red summary banner.

## What is verified

Acceptance criteria for Issue #99:

1. **首屏 3s 进入** — required DOM ids present, no tutorial overlay, sell button enabled on boot.
2. **单局 ≤ 3 min** — `IPO_GOAL = 1_000_000` reachable, `MAX_GAME_SEC = 240` hard cap.
3. **多种输入** — pointerdown (touch+mouse) + keydown (Space/Enter/1/2/3/±/M).
4. **结算页 + 再来一局** — modal hidden on boot, restart button labelled and ≥60px, full state reset.
5. **音效 + 震动** — WebAudio sfx wired, `navigator.vibrate` guarded + try/catch, mute toggle persisted.
6. **本地最高分** — `localStorage:idle_lemonade_best` schema `{ fastestSec, maxEarn, gamesPlayed, ipoCount }` written on victory and on timeout.

Plus bonus checks: a11y roles, `prefers-reduced-motion`, IIFE/strict-mode hardening, tab state machine, economy math (sandboxed).

### Regression locks (commit `a9fd812`)
- **P0**: `games/099-idle-lemonade/` legacy directory must NOT exist (`behavior.test.cjs` fs-asserts).
- **P1**: Boot path AND restart path must both call `switchTab('staff')` so a new player lands on the staff tab (the action with the highest growth leverage), not the price slider.

### Notable boundary findings
- `fmtMoney(999_999)` renders as `"$1000.00K"` and `fmtMoney(9_999)` renders as `"$10.00K"` (cosmetic 1-frame edge at the K→M / decimal-rounding boundary). Locked as current behavior in `integration.test.cjs`; safe to flip the assertion when the formatter is improved.

### What integration.test.cjs adds beyond the other two suites
- **Real boot path** — the IIFE in `app.js` runs in a `vm` context with a hand-rolled DOM (no jsdom dependency). Catches regressions like missing element ids, wrong-default tab on boot, or a renamed listener.
- **Event-driven E2E** — simulates `pointerdown`/`click`/`keydown` and asserts DOM text mutations + classList changes on the SAME runtime object the user would touch.
- **Timeout end-state simulation** — advances stub `performance.now()` past `MAX_GAME_SEC` and asserts both the modal title (“⏰ 时间到”) AND the localStorage best-schema persistence (`gamesPlayed=1`, `ipoCount=0`).
- **Post-finish no-op guard** — confirms `sellOne` is dead after `state.finished` (cash text doesn’t mutate).
- **Boundary sweeps** — 200 random fmtMoney samples, full-range monotonicity for priceMultiplier, employeeCost @ n=100.
