# Game 099 — Idle Lemonade Stand

> Issue [#99](https://github.com/zhuam/crabcli-demo/issues/99)

A 3-minute closed-round idle / management game. Sell lemonade, hire staff, open new shops, take your empire public (IPO at $1M).

## Play

Open [`games/099-idle-lemonade/index.html`](./index.html) in any modern browser. No build step required.

(The repo root `index.html` belongs to a different game — open the file inside this folder.)

## Controls

| Action | Mouse / Touch | Keyboard |
| --- | --- | --- |
| Sell a cup | Tap big lemon button | `Space` |
| Buy upgrades | Tap upgrade row | `1` Hire / `2` Bigger Cup / `3` New Shop |
| Adjust price | Drag slider | `←` / `→` |
| Toggle mute | 🔊 button | `M` |
| Restart (end screen) | Big yellow button | `Space` / `Enter` / `R` |

## Acceptance Criteria → How they’re met

- **3-second entry, no tutorial** — static HTML skeleton, JS only wires interactions; no splash screen.
- **≤ 3-minute round** — `CONFIG.MAX_DUR_MS = 180000`; auto-ends as win or time-out.
- **≥ 2 input methods** — pointer events (mouse + touch) + keyboard.
- **Replay button on win/lose** — modal with focused yellow `Play Again (Space)`.
- **SFX + haptics** — Web Audio API synth (no asset loads) + `navigator.vibrate`.
- **Local-storage high score** — `lemonade.highScore` + `lemonade.fastestWinMs` + `lemonade.muted`.

## Tech Notes

- Single-file vanilla JS, no framework, no npm deps.
- rAF + 100 ms accumulator decouples sim tick from render frame rate.
- `visibilitychange` pauses loop in background to save CPU.
- `state.perClick` × `price` × shop-multiplier drives click income; employees auto-produce at `0.5×` while idle (no offline progression — closed round).
- Numbers auto-format K/M/B.

See `.x-miner/artifacts/t1-tech-analysis/report.md` and `.x-miner/artifacts/t1-ux-analysis/report.md` for the analyst groundwork.
