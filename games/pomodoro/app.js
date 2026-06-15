/* ============================================================
 * Pomodoro · 25-minute focus timer
 *
 * Implementation notes (per analyst reports):
 *   - State machine: idle | running | paused | done
 *   - Wall-clock timing: endTime = Date.now() + remaining; rAF render loop.
 *     Avoids setInterval drift, survives tab-throttling and sleep/wake.
 *   - Completion feedback (3 layers, all non-blocking):
 *       1) Visual:  .is-done class -> radial glow pulse + done-color timer
 *       2) Title:   document.title swap so backgrounded tab is informed
 *       3) Audio:   Web Audio synth two short beeps (220Hz -> 440Hz)
 *                   AudioContext lazily created on first user gesture.
 *   - Keyboard:  Space = start/pause toggle, R = reset, S = sound toggle
 *   - Persistence: localStorage stores sound + theme preferences
 *   - A11y: aria-live region announces completion exactly once.
 * ============================================================ */

(function () {
  "use strict";

  // ---------- constants ----------
  var TOTAL_MS   = 25 * 60 * 1000;   // 25 minutes
  var STORAGE_K  = {
    sound: "pomodoro:sound",
    theme: "pomodoro:theme"
  };

  // ---------- DOM lookups ----------
  var stage        = document.querySelector('[data-comp-id="stage"]');
  var mmEl         = stage.querySelector('[data-mm]');
  var ssEl         = stage.querySelector('[data-ss]');
  var subline      = stage.querySelector('[data-comp-id="status-subline"]');
  var statusLabel  = stage.querySelector('[data-status-label]');
  var bar          = stage.querySelector('[data-progress-bar]');
  var btnMain      = stage.querySelector('[data-action="primary"]');
  var btnReset     = stage.querySelector('[data-action="reset"]');
  var sessionCount = stage.querySelector('[data-session-count]');
  var live         = document.querySelector('[data-live-region]');
  var btnSound     = document.querySelector('[data-comp-id="btn-sound"]');
  var btnTheme     = document.querySelector('[data-comp-id="btn-theme"]');

  // ---------- state ----------
  var state     = 'idle';   // idle | running | paused | done
  var endTime   = null;     // ms wall-clock when timer should hit 0
  var remaining = TOTAL_MS; // ms cached when paused / idle
  var rafId     = null;
  var sessionN  = 1;
  var soundOn   = readBool(STORAGE_K.sound, true);
  var audioCtx  = null;
  var lastSec   = -1;
  var baseTitle = document.title;

  // ============================================================
  // Persistence helpers
  // ============================================================
  function readBool(key, dflt) {
    try {
      var v = localStorage.getItem(key);
      if (v === null) return dflt;
      return v === "1" || v === "true";
    } catch (_) { return dflt; }
  }
  function writeBool(key, v) {
    try { localStorage.setItem(key, v ? "1" : "0"); } catch (_) {}
  }
  function readStr(key, dflt) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? dflt : v;
    } catch (_) { return dflt; }
  }
  function writeStr(key, v) {
    try {
      if (v) localStorage.setItem(key, v);
      else   localStorage.removeItem(key);
    } catch (_) {}
  }

  // ============================================================
  // Formatting / rendering
  // ============================================================
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function format(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    return { mm: pad(Math.floor(total / 60)), ss: pad(total % 60) };
  }

  function render() {
    var f = format(remaining);
    var sec = Number(f.mm) * 60 + Number(f.ss);
    if (sec !== lastSec) {
      mmEl.textContent = f.mm;
      ssEl.textContent = f.ss;
      lastSec = sec;
    }
    var pct = (1 - remaining / TOTAL_MS) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    bar.style.width = pct.toFixed(2) + "%";
  }

  function setState(next) {
    state = next;
    stage.dataset.state = next;
    switch (next) {
      case 'idle':
        btnMain.textContent = 'Start';
        btnMain.setAttribute('aria-label', 'Start 25-minute focus session');
        btnReset.disabled = true;
        statusLabel.textContent = 'Ready when you are';
        subline.textContent = 'Focus session · 25 minutes · no distractions';
        document.title = baseTitle;
        break;
      case 'running':
        btnMain.textContent = 'Pause';
        btnMain.setAttribute('aria-label', 'Pause timer');
        btnReset.disabled = false;
        statusLabel.textContent = 'Focusing';
        subline.textContent = 'Stay with it. The page will let you know when time is up.';
        break;
      case 'paused':
        btnMain.textContent = 'Resume';
        btnMain.setAttribute('aria-label', 'Resume timer');
        btnReset.disabled = false;
        statusLabel.textContent = 'Paused';
        subline.textContent = 'Take a breath. Press Space or Resume to continue.';
        break;
      case 'done':
        btnMain.textContent = 'Start new session';
        btnMain.setAttribute('aria-label', 'Start a new 25-minute session');
        btnReset.disabled = false;
        statusLabel.textContent = 'Time is up';
        subline.textContent = "Nice work. Stand up, breathe, take a five.";
        document.title = '✓ Done — ' + baseTitle;
        break;
    }
  }

  // ============================================================
  // Audio (Web Audio API, lazy init on first user gesture)
  // ============================================================
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { audioCtx = new Ctor(); } catch (_) { return null; }
    return audioCtx;
  }

  function beep() {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (_) {}
    }
    var now = ctx.currentTime;
    // Two short tones: 220Hz -> 440Hz, ~180ms each, separated 220ms.
    var pulses = [
      { freq: 220, at: now,        dur: 0.18 },
      { freq: 440, at: now + 0.22, dur: 0.18 }
    ];
    pulses.forEach(function (p) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = p.freq;
      g.gain.setValueAtTime(0.0001, p.at);
      g.gain.exponentialRampToValueAtTime(0.25,    p.at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,  p.at + p.dur);
      o.connect(g).connect(ctx.destination);
      o.start(p.at);
      o.stop(p.at + p.dur + 0.05);
      o.onended = function () {
        try { o.disconnect(); g.disconnect(); } catch (_) {}
      };
    });
  }

  // ============================================================
  // State transitions
  // ============================================================
  function start() {
    if (state === 'running') return;       // guard double-click
    if (state === 'done') reset(true);     // re-arm 25:00 first
    ensureAudio();                         // bind audio to user gesture
    endTime = Date.now() + remaining;
    setState('running');
    if (rafId !== null) cancelAnimationFrame(rafId);
    loop();
  }

  function pause() {
    if (state !== 'running') return;
    remaining = Math.max(0, endTime - Date.now());
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    setState('paused');
    render();
  }

  function reset(silent) {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    endTime   = null;
    remaining = TOTAL_MS;
    lastSec   = -1;
    stage.classList.remove('is-done');
    document.title = baseTitle;
    setState('idle');
    render();
    if (!silent) live.textContent = '';
  }

  function finish() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    remaining = 0;
    setState('done');
    stage.classList.add('is-done');
    render();
    live.textContent = 'Pomodoro complete. Time for a break.';
    beep();
    sessionN += 1;
    sessionCount.textContent = String(sessionN);
  }

  function loop() {
    var left = endTime - Date.now();
    if (left <= 0) { finish(); return; }
    remaining = left;
    render();
    rafId = requestAnimationFrame(loop);
  }

  // ============================================================
  // Bindings
  // ============================================================
  btnMain.addEventListener('click', function () {
    if (state === 'running') pause();
    else start();
  });
  btnReset.addEventListener('click', function () { reset(); });

  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    btnSound.setAttribute('aria-pressed', String(soundOn));
    btnSound.title = soundOn ? 'Sound on (S)' : 'Sound off (S)';
    writeBool(STORAGE_K.sound, soundOn);
  });

  btnTheme.addEventListener('click', function () {
    var root = document.documentElement;
    var cur  = root.getAttribute('data-theme');
    // cycle: auto -> dark -> light -> auto
    var next = cur === 'dark' ? 'light' : (cur === 'light' ? '' : 'dark');
    if (next) root.setAttribute('data-theme', next);
    else      root.removeAttribute('data-theme');
    writeStr(STORAGE_K.theme, next || '');
  });

  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'running') pause(); else start();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      btnSound.click();
    }
  });

  // ============================================================
  // Bootstrap
  // ============================================================
  // Restore preferences before first paint.
  btnSound.setAttribute('aria-pressed', String(soundOn));
  btnSound.title = soundOn ? 'Sound on (S)' : 'Sound off (S)';

  var savedTheme = readStr(STORAGE_K.theme, '');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  setState('idle');
  render();
})();
