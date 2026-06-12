# Tests · Idle Lemonade Stand (Issue #99)

## Files

| File | Type | Purpose |
|---|---|---|
| `static.test.cjs` | Node CommonJS | Headless static analysis: DOM ids, regex over JS source, sandboxed unit-tests of pure functions (`priceMultiplier`, `employeeCost`). 119 assertions. CI-friendly. |
| `smoke.test.html` | Browser harness | Loads the actual game in an `<iframe>`, simulates pointer/keyboard events, asserts DOM mutations and localStorage round-trip. Good for visual & timing checks. |

## Run

### Static (no browser, deterministic)

```bash
cd games/099-idle-lemonade-stand
node tests/static.test.cjs
```

Expected output ends with: `119 passed · 0 failed`.

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
