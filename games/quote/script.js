/* Quote — random quote viewer
 * Click / Space / Enter to draw a new quote. Five curated quotes.
 * Avoids showing the same quote twice in a row.
 */
(function () {
  'use strict';

  /** @type {{ text: string, author: string }[]} */
  var QUOTES = [
    { text: 'The unexamined life is not worth living.',                         author: 'Socrates' },
    { text: 'Simplicity is the ultimate sophistication.',                       author: 'Leonardo da Vinci' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
    { text: 'The only way to do great work is to love what you do.',            author: 'Steve Jobs' },
    { text: 'In the middle of difficulty lies opportunity.',                    author: 'Albert Einstein' }
  ];

  var SWAP_MS = 240; // matches CSS transition

  var card    = document.getElementById('card');
  var textEl  = document.getElementById('quoteText');
  var authEl  = document.getElementById('quoteAuthor');
  var btn     = document.getElementById('newBtn');

  if (!card || !textEl || !authEl || !btn) return;

  var lastIndex = -1;
  var swapping  = false;

  /** Cryptographically-random integer in [0, n). Falls back to Math.random. */
  function randomInt(n) {
    var crypto = window.crypto || window.msCrypto;
    if (crypto && typeof crypto.getRandomValues === 'function') {
      var max = Math.floor(0x100000000 / n) * n; // rejection threshold
      var buf = new Uint32Array(1);
      do { crypto.getRandomValues(buf); } while (buf[0] >= max);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /** Pick a random index different from the previous one (when possible). */
  function pickIndex() {
    if (QUOTES.length <= 1) return 0;
    var i;
    do { i = randomInt(QUOTES.length); } while (i === lastIndex);
    return i;
  }

  function render(i) {
    var q = QUOTES[i];
    textEl.textContent = q.text;
    authEl.textContent = q.author;
    lastIndex = i;
  }

  function next() {
    if (swapping) return;
    var i = pickIndex();

    swapping = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    card.classList.add('is-swapping');

    window.setTimeout(function () {
      render(i);
      card.classList.remove('is-swapping');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      swapping = false;
    }, SWAP_MS);
  }

  btn.addEventListener('click', next);

  // Global Space / Enter shortcut, ignored in form fields.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    var t = e.target;
    var tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    // Avoid double-firing when the button itself is focused.
    if (t === btn) return;
    e.preventDefault();
    next();
  });

  // Initial quote (no transition on first paint).
  render(pickIndex());
})();
