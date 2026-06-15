/* ============================================================
 * Stopwatch · app.js
 *
 * Core ideas (per t1-tech / t1-ux / t1-design consensus):
 *   - High-precision timing via performance.now()
 *   - Anti-drift pause model:  startRef = now − elapsed
 *   - Render driven by requestAnimationFrame, throttled to ≥33ms
 *     (~30fps) so the cs (1/100s) digit stays readable.
 *   - State machine: 'idle' | 'running' | 'paused'.
 *   - Laps stored as [{idx, lapMs, totalMs}] and unshift-ed so
 *     the newest sits on top of the list.
 *   - Keyboard shortcuts Space / L / R, ignored when an input
 *     element holds focus.
 * ============================================================ */

(() => {
  'use strict';

  // ---------- Element refs ----------
  const $display = document.querySelector('[data-comp-id="display"]');
  const $mm      = $display.querySelector('[data-mm]');
  const $ss      = $display.querySelector('[data-ss]');
  const $cs      = $display.querySelector('[data-cs]');

  const $btnPrimary = document.querySelector('[data-action="primary"]');
  const $btnLap     = document.querySelector('[data-action="lap"]');
  const $btnReset   = document.querySelector('[data-action="reset"]');
  const $primaryLbl = $btnPrimary.querySelector('[data-label]');

  const $laps     = document.querySelector('[data-comp-id="laps"]');
  const $announce = document.querySelector('[data-announce]');

  // ---------- State ----------
  /** @type {'idle' | 'running' | 'paused'} */
  let state    = 'idle';
  let startRef = 0;       // performance.now() anchor (running)
  let elapsed  = 0;       // accumulated ms when not running
  let laps     = [];      // [{idx, lapMs, totalMs}]
  let rafId    = 0;
  let lastDrawn = -Infinity; // last rAF tick time we wrote DOM

  const RENDER_INTERVAL = 33; // ms — ~30fps DOM throttle

  // ---------- Pure helpers (testable) ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /**
   * Format ms → display parts.
   * < 60min  → MM:SS.cc      (mm "00".."59")
   * ≥ 60min  → H:MM:SS.cc    (mm zero-padded; hour shown joined to mm)
   */
  function format(ms) {
    if (ms < 0) ms = 0;
    const totalCs = Math.floor(ms / 10);          // 1/100s units
    const cs = totalCs % 100;
    const totalSec = Math.floor(totalCs / 100);
    const s  = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m  = totalMin % 60;
    const h  = Math.floor(totalMin / 60);
    const mmText = h > 0 ? `${h}:${pad2(m)}` : pad2(m);
    return { mm: mmText, ss: pad2(s), cs: pad2(cs) };
  }

  // ---------- Render ----------
  function paint(ms) {
    const { mm, ss, cs } = format(ms);
    if ($mm.textContent !== mm) $mm.textContent = mm;
    if ($ss.textContent !== ss) $ss.textContent = ss;
    if ($cs.textContent !== cs) $cs.textContent = cs;
  }

  function setDisplayState(next) {
    $display.setAttribute('data-state', next);
  }

  function syncButtons() {
    // Primary label per state
    const labels = { idle: '开始', running: '暂停', paused: '继续' };
    $primaryLbl.textContent = labels[state];
    $btnPrimary.setAttribute(
      'aria-label',
      `${labels[state]} (Space)`
    );

    // Disabled matrix
    $btnLap.disabled   = (state !== 'running');
    $btnReset.disabled = !(state === 'paused' && elapsed > 0);
  }

  function announce(msg) {
    // Use a polite live region for non-noisy SR announcements.
    if (!$announce) return;
    $announce.textContent = '';
    // Defer so SR pickup the change reliably.
    requestAnimationFrame(() => { $announce.textContent = msg; });
  }

  // ---------- rAF loop with ~30fps DOM throttle ----------
  function tick() {
    if (state !== 'running') return;
    const now = performance.now();
    const ms  = now - startRef;
    if (ms - lastDrawn >= RENDER_INTERVAL) {
      paint(ms);
      lastDrawn = ms;
    }
    rafId = requestAnimationFrame(tick);
  }

  // ---------- Actions ----------
  function start() {
    if (state === 'running') return;
    startRef = performance.now() - elapsed;
    state = 'running';
    setDisplayState(state);
    syncButtons();
    lastDrawn = -Infinity;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (state !== 'running') return;
    elapsed = performance.now() - startRef;
    state = 'paused';
    setDisplayState(state);
    cancelAnimationFrame(rafId);
    paint(elapsed); // commit final frame
    syncButtons();
    announce('已暂停');
  }

  function togglePrimary() {
    if (state === 'running') pause();
    else start(); // idle or paused both → start
  }

  function lap() {
    if (state !== 'running') return;
    const total = performance.now() - startRef;
    const prev  = laps.length > 0 ? laps[0].totalMs : 0;
    const entry = {
      idx: laps.length + 1,
      lapMs: total - prev,
      totalMs: total,
    };
    laps.unshift(entry);
    insertLapRow(entry);
    announce(`记圈 ${entry.idx}`);
  }

  function reset() {
    // Per state machine: reset only when paused with content.
    if (!(state === 'paused' && elapsed > 0)) return;
    cancelAnimationFrame(rafId);
    state = 'idle';
    startRef = 0;
    elapsed = 0;
    laps = [];
    lastDrawn = -Infinity;
    clearLaps();
    paint(0);
    setDisplayState(state);
    syncButtons();
    announce('已清零');
  }

  // ---------- Lap DOM ops ----------
  function insertLapRow(entry) {
    const li = document.createElement('li');
    li.className = 'lap is-fresh';
    li.setAttribute('data-idx', String(entry.idx));

    const idx = document.createElement('span');
    idx.className = 'lap__idx';
    idx.textContent = `圈 ${entry.idx}`;

    const lapTime = document.createElement('span');
    lapTime.className = 'lap__time';
    const lf = format(entry.lapMs);
    lapTime.textContent = `${lf.mm}:${lf.ss}.${lf.cs}`;

    const total = document.createElement('span');
    total.className = 'lap__total';
    const tf = format(entry.totalMs);
    total.textContent = `${tf.mm}:${tf.ss}.${tf.cs}`;

    li.append(idx, lapTime, total);

    // Insert directly after the header row (which is the first child).
    const head = $laps.querySelector('.laps__head');
    if (head && head.nextSibling) {
      $laps.insertBefore(li, head.nextSibling);
    } else {
      $laps.appendChild(li);
    }

    // Reveal list on first lap
    $laps.setAttribute('data-empty', 'false');

    // Drop highlight class after animation so re-renders don't loop
    setTimeout(() => li.classList.remove('is-fresh'), 260);
  }

  function clearLaps() {
    // Remove every <li> except the header
    const rows = $laps.querySelectorAll('li.lap');
    rows.forEach(r => r.remove());
    $laps.setAttribute('data-empty', 'true');
  }

  // ---------- Wiring ----------
  $btnPrimary.addEventListener('click', togglePrimary);
  $btnLap.addEventListener('click',     lap);
  $btnReset.addEventListener('click',   reset);

  document.addEventListener('keydown', (e) => {
    // Focus guard: ignore when an editable element is focused
    const t = e.target;
    if (t && (
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable
    )) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePrimary();
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      lap();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
      return;
    }
  });

  // ---------- Initial paint ----------
  paint(0);
  setDisplayState('idle');
  syncButtons();

  // Expose tiny surface for tests / debugging (non-breaking).
  // Guard so production users don't see a global by default.
  if (typeof window !== 'undefined' && window.__STOPWATCH_EXPOSE__) {
    window.__stopwatch__ = {
      format,
      getState: () => ({ state, elapsed, laps: laps.slice() }),
    };
  }
})();
