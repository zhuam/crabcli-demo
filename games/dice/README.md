# Dice

A minimal **dice roller** Web component. Click the button — or press
<kbd>Space</kbd> / <kbd>Enter</kbd> — and the die spins for ~700 ms before
landing on a fair random 1–6.

## Highlights

- **Vanilla** HTML + CSS + JS. No frameworks, no build step, no CDN.
- **Modern-minimal** look: white face, rounded corners, soft shadow,
  traditional 3×3 pip layout. Light + dark via `prefers-color-scheme`.
- **Fair randomness**: uses `crypto.getRandomValues` with rejection
  sampling (unbiased over 1–6); falls back to `Math.random` if missing.
- **Accessible**: live region announces each roll, button has `aria-busy`
  while rolling, and `prefers-reduced-motion` disables the spin.
- **Mobile responsive** (smaller dice / pips < 480 px).

## Run

Just open `index.html` in any modern browser. No server required.

```bash
# from repo root
xdg-open games/dice/index.html   # linux
open      games/dice/index.html  # macOS
```

When served from the hub, it lives at `/games/dice/`.

## Files

```
games/dice/
├── index.html   # markup: dice (7 pip slots) + roll button
├── style.css    # tokens, pip layout, roll keyframes
├── main.js      # click / keyboard handler, random face, animation gate
└── README.md
```

## How the pips work

The dice element holds **7 fixed slots** in a 3×3 grid (corners + middle
row + center). CSS rules of the form `.dice[data-face="N"] .pip[data-slot="X"]`
toggle which slots are visible. Changing `data-face` to a value in 1–6 is
all the JS does to update the face.
