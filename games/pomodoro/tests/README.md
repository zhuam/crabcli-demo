# Pomodoro Tests

Pure-Node test suite for `games/pomodoro/`. Zero dependencies, runs on stock Node ≥ 16.

## Files

| File | Layer | Purpose |
|---|---|---|
| `static.test.cjs` | static | Regex / structural checks on `index.html`, `style.css`, `app.js`, `README.md`. Asserts the contract that the behavior tests exercise dynamically (constants, state names, function presence, completion signals). |
| `behavior.test.cjs` | dynamic | Loads the real `app.js` into a `vm` sandbox with a hand-rolled minimal DOM and a controllable virtual clock (`Date.now`, `requestAnimationFrame`). Drives the full `idle → running → paused → running → done` lifecycle, plus reset / re-arm / keyboard / idempotency. |

## Run

```bash
node games/pomodoro/tests/static.test.cjs
node games/pomodoro/tests/behavior.test.cjs
```

Each script exits non-zero on any failure.

## What's covered (behavior layer)

| Scenario | Asserts |
|---|---|
| Boot | state=`idle`, display=`25:00`, Start button label, Reset disabled, progress 0%, aria-live empty |
| Start | state=`running`, primary→`Pause`, Reset enabled, exactly one rAF queued |
| Tick | +1000 ms wall-clock → display `24:59` |
| Pause | remaining frozen even if real time advances 2 min while paused; no rAF queued |
| Resume | preserves accumulated remaining (paused gap does NOT count against budget) |
| Reset (running) | back to `idle` / `25:00` / Start / disabled / `.is-done` cleared |
| Reset (paused) | back to `idle` / `25:00` |
| Completion | state=`done`, display `00:00`, `.is-done` set, `document.title` prefixed `✓ Done`, aria-live announces, progress 100%, session counter incremented, rAF NOT re-armed |
| Re-arm | clicking primary in `done` state restarts a fresh 25:00 running session |
| Keyboard | Space toggles start↔pause↔resume; R resets |
| Idempotency | clicking disabled Reset is safe; double-toggle does not jump back to 25:00 |

## Why a hand-rolled DOM mock?

`app.js` is wrapped in an IIFE and queries the real DOM at boot time. Rather than
patch the production source to export internals (which would change the file the
developer & reviewer signed off on), the behavior test:

1. Builds a minimal `document` tree containing exactly the `data-*` hooks `app.js` looks up.
2. Provides controllable `Date.now()` and `requestAnimationFrame` so virtual time is deterministic.
3. Runs `app.js` inside `vm.runInContext(...)` so the IIFE wires up against the mock DOM.
4. Tests then click buttons, dispatch keys, and advance the virtual clock to exercise behavior.

Trade-off: the mock isn't a real browser, so layout / repaint / Web Audio aren't
validated here — `smoke` is left to manual `index.html` open-in-browser.
