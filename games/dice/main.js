/* Dice — minimal roller
 * Click / Space / Enter to roll. Uses crypto.getRandomValues for an
 * unbiased 1–6. Animates ~700ms, then commits the new face.
 */
(function () {
  'use strict';

  var ROLL_MS = 700;

  var dice    = document.getElementById('dice');
  var btn     = document.getElementById('rollBtn');
  var status  = document.getElementById('srStatus');

  if (!dice || !btn) return;

  var rolling = false;

  /** Cryptographically-random integer in [1, 6] (rejection-sampled, unbiased). */
  function randomFace() {
    var crypto = window.crypto || window.msCrypto;
    if (crypto && typeof crypto.getRandomValues === 'function') {
      var buf = new Uint8Array(1);
      // 252 = floor(256/6)*6 — reject above to keep the distribution uniform.
      do { crypto.getRandomValues(buf); } while (buf[0] >= 252);
      return (buf[0] % 6) + 1;
    }
    return Math.floor(Math.random() * 6) + 1;
  }

  function setFace(n) {
    dice.setAttribute('data-face', String(n));
    dice.setAttribute('aria-label', 'Dice showing ' + n);
    if (status) status.textContent = 'Rolled ' + n;
  }

  function roll() {
    if (rolling) return;
    rolling = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');

    // restart animation
    dice.classList.remove('is-rolling');
    // force reflow so re-adding the class restarts the keyframes
    void dice.offsetWidth;
    dice.classList.add('is-rolling');

    var next = randomFace();

    window.setTimeout(function () {
      dice.classList.remove('is-rolling');
      setFace(next);
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      rolling = false;
    }, ROLL_MS);
  }

  btn.addEventListener('click', roll);

  // Global Space / Enter shortcut, but ignore when typing in an input.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    var t = e.target;
    var tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    // Avoid double-firing when the button itself is focused — browser already
    // dispatches click for Space/Enter on a focused button.
    if (t === btn) return;
    e.preventDefault();
    roll();
  });

  // Initial face
  setFace(randomFace());
})();
