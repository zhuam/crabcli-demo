# Quote

A minimal **random quote** Web component. Click the button — or press
<kbd>Space</kbd> / <kbd>Enter</kbd> — and a new quote fades in from a
small curated list of five.

## Highlights

- **Vanilla** HTML + CSS + JS. No frameworks, no build step, no CDN.
- **Modern-minimal** look: grayscale palette, serif quote on a quiet
  card, centered layout. Light + dark via `prefers-color-scheme`.
- **Five curated quotes** baked into `script.js`.
- **Never repeats**: the picker skips the previously shown quote so two
  consecutive clicks always produce a different one.
- **Fair randomness**: `crypto.getRandomValues` with rejection sampling;
  falls back to `Math.random` if missing.
- **Accessible**: live region announces each new quote, button has
  `aria-busy` while swapping, `prefers-reduced-motion` is respected.

## Run

Just open `index.html` in any modern browser. No server required.

```bash
# from repo root
xdg-open games/quote/index.html   # linux
open      games/quote/index.html  # macOS
```

When served from the hub, it lives at `/games/quote/`.

## Files

```
games/quote/
├── index.html   # markup: quote card + "New quote" button
├── style.css    # tokens, card layout, swap transition
├── script.js    # quote list, no-repeat picker, click/keyboard handler
└── README.md
```

## Customising the list

Edit the `QUOTES` array at the top of `script.js`:

```js
var QUOTES = [
  { text: '…',  author: '…' },
  // add more here
];
```

The no-repeat rule needs at least two entries; a single-entry list will
just keep showing the same one.
