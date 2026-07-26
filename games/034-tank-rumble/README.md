# Tank Rumble · 坦克大乱斗

> Issue #34 · Grid-based tank battle · Best-of-3 rounds · Single match ≤ 3 minutes

## Gameplay

Player tank vs AI tank on a 15x10 grid map with walls, obstacles, and destructible cover. Destroy the enemy tank 3 times in a match to win!

- **First screen 3 seconds to play**: No tutorial, just tap PLAY
- **Single match ≤ 3 minutes** (best-of-3 rounds)
- **Core loop**: Move → Aim → Shoot → Destroy

## Controls

| Input | Action |
|---|---|
| `W` / `Arrow Up` | Move up |
| `S` / `Arrow Down` | Move down |
| `A` / `Arrow Left` | Move left |
| `D` / `Arrow Right` | Move right |
| `Space` | Fire shell in current direction |
| Touch D-pad (mobile) | Move tank |
| Fire button (mobile) | Shoot |

## Rules

- Each tank has 3 HP per round
- Shells travel in a straight line until hitting a wall or tank
- Indestructible walls (dark brown) block movement and shells
- Destructible walls (light brown) break when hit by a shell
- First to win 3 rounds wins the match

## Feedback

- Sound effects for move, shoot, hit, explosion, and win/lose
- `navigator.vibrate` haptic feedback
- Screen shake on explosions
- `prefers-reduced-motion` automatically reduces animations

## Storage

`localStorage` key `tank-rumble-best`:
```json
{ "wins": 0, "losses": 0, "totalKills": 0, "bestStreak": 0 }
```

## Files

```
games/034-tank-rumble/
├── index.html   # Game structure: title, gameplay, result screens
├── style.css    # Military theme, responsive, a11y
├── app.js       # Game engine, AI, canvas rendering, audio
├── thumb.svg    # Thumbnail icon
└── tests/       # Static and behavior tests
```

Zero external dependencies. Hostable via GitHub Pages or `python -m http.server`.

## Acceptance Checklist

- [x] Playable in 3 seconds, no tutorial
- [x] Single match ≤ 3 minutes
- [x] Touch + mouse + keyboard (all 3 supported)
- [x] Win/lose screen with "Play Again" button
- [x] Sound effects (move, shoot, hit, explosion, win/lose)
- [x] Vibration feedback on mobile
- [x] High score in localStorage ('tank-rumble-best')
- [x] 3 grid maps with different layouts
- [x] AI patrols, hunts, and shoots with line-of-sight
