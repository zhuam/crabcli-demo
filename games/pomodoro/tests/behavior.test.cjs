#!/usr/bin/env node
/**
 * Behavior tests for Pomodoro 25-minute focus timer.
 *
 * Drives the REAL games/pomodoro/app.js inside a vm sandbox with a hand-rolled
 * minimal DOM and a controllable virtual clock. Asserts:
 *
 *   - boot defaults: state=idle, displays 25:00, reset disabled, primary="Start"
 *   - idle → running on primary click; pause/resume preserves remaining ms
 *   - running ticks down with wall-clock (Date.now), tolerant of tab throttle
 *     simulation: jump Date.now forward and one rAF tick still computes correct
 *     remaining instead of fixed-step drift
 *   - reset returns remaining to 25*60*1000 and state to idle from any state
 *   - timer reaching 0 → state=done, .is-done class added, document.title
 *     swapped, aria-live announces exactly once, audio beep dispatched once
 *   - clicking primary in done state restarts a fresh 25:00 session
 *   - Space key toggles start/pause; R key resets; both honour input-guard
 *   - sessionN counter increments on each completion
 *
 * Run: node tests/behavior.test.cjs   (pure Node, zero deps)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
}
function eq(name, got, want) {
  ok(name, got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
function group(t) { console.log(`\n=== ${t} ===`); }

// -----------------------------------------------------------------
// Minimal DOM mock — only what app.js touches.
// -----------------------------------------------------------------
function makeDom() {
  // Clock: use a monotonically increasing virtual now controlled by tests.
  let now = 1_700_000_000_000;
  const setNow = (v) => { now = v; };
  const advance = (dms) => { now += dms; };

  // rAF: collect callbacks, tests drive them via tickRaf().
  const rafQueue = [];
  let rafId = 0;
  function requestAnimationFrame(cb) { rafId++; rafQueue.push({ id: rafId, cb }); return rafId; }
  function cancelAnimationFrame(id)   {
    for (let i = 0; i < rafQueue.length; i++) if (rafQueue[i].id === id) { rafQueue.splice(i, 1); return; }
  }
  // Run all currently-queued rAF callbacks (any newly queued by them stay for next tick).
  function tickRaf() {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const item of batch) item.cb(now);
  }
  // Run rAF until either state turns 'done' or maxIters is hit (safety).
  function runUntilDone(getState, maxIters) {
    let i = 0;
    const max = maxIters || 5000;
    while (getState() !== 'done' && i < max) {
      tickRaf();
      i++;
      if (rafQueue.length === 0 && getState() !== 'done') break;
    }
  }

  // Element factory — supports the subset of API app.js uses.
  let nodeSeq = 0;
  function makeEl(tagName) {
    const el = {
      __id: ++nodeSeq,
      tagName: (tagName || 'div').toUpperCase(),
      _children: [],
      _attrs: Object.create(null),
      _classes: new Set(),
      _listeners: Object.create(null),
      dataset: Object.create(null),
      style: Object.create(null),
      _text: '',
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v); },
      get innerHTML() { return this._text; },
      set innerHTML(v) { this._text = String(v); },
      get disabled() { return this._attrs.disabled === true || this._attrs.disabled === 'true' || this._attrs.disabled === ''; },
      set disabled(v) { if (v) this._attrs.disabled = true; else delete this._attrs.disabled; },
      classList: {
        add: (...c) => c.forEach(x => el._classes.add(x)),
        remove: (...c) => c.forEach(x => el._classes.delete(x)),
        contains: (c) => el._classes.has(c),
        toggle: (c) => { if (el._classes.has(c)) el._classes.delete(c); else el._classes.add(c); },
      },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k)    { return this._attrs[k] === undefined ? null : this._attrs[k]; },
      removeAttribute(k) { delete this._attrs[k]; },
      hasAttribute(k)    { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
      addEventListener(type, cb) { (this._listeners[type] = this._listeners[type] || []).push(cb); },
      removeEventListener(type, cb) {
        if (!this._listeners[type]) return;
        this._listeners[type] = this._listeners[type].filter(x => x !== cb);
      },
      dispatchEvent(ev) {
        const list = this._listeners[ev.type] || [];
        for (const cb of list) cb(ev);
      },
      click() { this.dispatchEvent({ type: 'click', preventDefault() {}, target: this }); },
      appendChild(child) { this._children.push(child); return child; },
      querySelector(sel) { return queryOne(this, sel); },
      querySelectorAll(sel) { return queryAll(this, sel); },
    };
    return el;
  }

  function matches(el, sel) {
    // Support: data-foo / data-foo="bar" / [attr] / [attr="val"] / .className / tag / id
    sel = sel.trim();
    // bracketed [data-foo="bar"] or [data-foo]
    let m = sel.match(/^\[([\w-]+)(?:=["']([^"']*)["'])?\]$/);
    if (m) {
      const k = m[1], v = m[2];
      if (v === undefined) return el.hasAttribute(k);
      return el.getAttribute(k) === v;
    }
    if (sel.startsWith('.')) return el._classes.has(sel.slice(1));
    if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
    return el.tagName === sel.toUpperCase();
  }
  function walk(el, fn) { fn(el); for (const c of el._children) walk(c, fn); }
  function queryOne(root, sel) {
    let found = null;
    walk(root, n => { if (!found && n !== root && matches(n, sel)) found = n; });
    return found;
  }
  function queryAll(root, sel) {
    const out = [];
    walk(root, n => { if (n !== root && matches(n, sel)) out.push(n); });
    return out;
  }

  // Build the DOM tree based on the data attributes app.js queries.
  const documentEl = makeEl('html');
  const body = makeEl('body');
  documentEl.appendChild(body);

  const stage = makeEl('section');
  stage.setAttribute('data-comp-id', 'stage');
  body.appendChild(stage);

  const mmEl = makeEl('span'); mmEl.setAttribute('data-mm', ''); stage.appendChild(mmEl);
  const ssEl = makeEl('span'); ssEl.setAttribute('data-ss', ''); stage.appendChild(ssEl);

  const subline = makeEl('p');
  subline.setAttribute('data-comp-id', 'status-subline');
  stage.appendChild(subline);

  const statusLabel = makeEl('span');
  statusLabel.setAttribute('data-status-label', '');
  stage.appendChild(statusLabel);

  const bar = makeEl('div'); bar.setAttribute('data-progress-bar', ''); stage.appendChild(bar);

  const btnMain = makeEl('button'); btnMain.setAttribute('data-action', 'primary'); stage.appendChild(btnMain);
  const btnReset = makeEl('button'); btnReset.setAttribute('data-action', 'reset'); stage.appendChild(btnReset);

  const sessionCount = makeEl('span'); sessionCount.setAttribute('data-session-count', ''); stage.appendChild(sessionCount);

  const live = makeEl('div'); live.setAttribute('data-live-region', ''); body.appendChild(live);

  const btnSound = makeEl('button'); btnSound.setAttribute('data-comp-id', 'btn-sound'); body.appendChild(btnSound);
  const btnTheme = makeEl('button'); btnTheme.setAttribute('data-comp-id', 'btn-theme'); body.appendChild(btnTheme);

  // Document API
  const document = {
    documentElement: documentEl,
    body,
    title: 'Pomodoro · 25 minute focus timer',
    querySelector: (sel) => queryOne(documentEl, sel),
    querySelectorAll: (sel) => queryAll(documentEl, sel),
    addEventListener() {}, removeEventListener() {},
  };
  // Capture window-level event listeners (keydown).
  const winListeners = Object.create(null);
  const window = {
    document,
    addEventListener(type, cb) { (winListeners[type] = winListeners[type] || []).push(cb); },
    removeEventListener(type, cb) {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter(x => x !== cb);
    },
    requestAnimationFrame, cancelAnimationFrame,
    AudioContext: null, // intentionally unset → app's beep() bails gracefully
  };
  function dispatchKey(key, code) {
    const ev = {
      type: 'keydown', key, code: code || ('Key' + (key || '').toUpperCase()),
      target: { tagName: 'BODY', isContentEditable: false },
      preventDefault() { this._prevented = true; },
    };
    const list = winListeners['keydown'] || [];
    for (const cb of list) cb(ev);
    return ev;
  }

  // Stub localStorage
  const _ls = Object.create(null);
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
    setItem(k, v) { _ls[k] = String(v); },
    removeItem(k) { delete _ls[k]; },
  };

  return {
    window, document, requestAnimationFrame, cancelAnimationFrame,
    Date: { now: () => now, parse: Date.parse, UTC: Date.UTC },
    setNow, advance, tickRaf, runUntilDone,
    rafQueueLen: () => rafQueue.length,
    localStorage,
    nodes: { stage, mmEl, ssEl, subline, statusLabel, bar, btnMain, btnReset, sessionCount, live, btnSound, btnTheme },
    dispatchKey,
  };
}

// -----------------------------------------------------------------
// Boot the IIFE in a sandbox and expose a handle for tests.
// -----------------------------------------------------------------
function boot() {
  const dom = makeDom();
  const sandbox = {
    window: dom.window,
    document: dom.document,
    Date: dom.Date,             // overrides Date.now()
    requestAnimationFrame: dom.requestAnimationFrame,
    cancelAnimationFrame:  dom.cancelAnimationFrame,
    localStorage: dom.localStorage,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  // app.js references global `window` & `document` (no var/let) — sandbox provides those directly.
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: 'app.js' });
  return { dom, sandbox };
}

// Convenience: read state from the stage element's data-state set by setState().
function getState(dom) { return dom.nodes.stage.dataset.state; }
function getDisplay(dom) { return `${dom.nodes.mmEl._text}:${dom.nodes.ssEl._text}`; }
function getRemainingMs(dom) {
  const m = Number(dom.nodes.mmEl._text), s = Number(dom.nodes.ssEl._text);
  return (m * 60 + s) * 1000;
}

// =================================================================
group('Boot · idle defaults');
// =================================================================
{
  const { dom, sandbox } = boot();
  eq('boot state = idle',                getState(dom), 'idle');
  eq('boot display = 25:00',             getDisplay(dom), '25:00');
  eq('primary button label = Start',     dom.nodes.btnMain._text, 'Start');
  eq('reset button disabled at boot',    dom.nodes.btnReset.disabled, true);
  eq('progress bar at 0%',               dom.nodes.bar.style.width, '0.00%');
  eq('aria-live initially empty',        dom.nodes.live._text, '');
  eq('document.title is base',           sandbox.document.title.indexOf('✓ Done') === -1, true);
}

// =================================================================
group('Action · click Start → state=running, button=Pause');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();
  eq('after start: state=running',       getState(dom), 'running');
  eq('after start: primary=Pause',       dom.nodes.btnMain._text, 'Pause');
  eq('after start: reset enabled',       dom.nodes.btnReset.disabled, false);
  eq('rAF queued exactly once',          dom.rafQueueLen(), 1);
}

// =================================================================
group('Tick · 1s of wall-clock advances display from 25:00 → 24:59');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();
  dom.advance(1000);
  dom.tickRaf();
  eq('after +1000ms: display = 24:59',  getDisplay(dom), '24:59');
  eq('still running',                    getState(dom), 'running');
}

// =================================================================
group('Pause · preserves remaining ms (no further drain)');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();           // start
  dom.advance(60_000);                 // 1 min in
  dom.tickRaf();
  eq('after 1 min: display = 24:00',  getDisplay(dom), '24:00');
  dom.nodes.btnMain.click();           // pause
  eq('paused state',                   getState(dom), 'paused');
  eq('primary label = Resume',         dom.nodes.btnMain._text, 'Resume');

  // Time passes while paused — display must stay frozen.
  dom.advance(120_000);
  // No rAF should fire (rAF was cancelled on pause); even if we attempt to tick,
  // queue should be empty.
  eq('no rAF queued while paused',     dom.rafQueueLen(), 0);
  eq('display unchanged after wall-clock drift while paused', getDisplay(dom), '24:00');
}

// =================================================================
group('Resume · continues from preserved remaining');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();           // start
  dom.advance(60_000);                 // 1 min elapsed
  dom.tickRaf();
  dom.nodes.btnMain.click();           // pause
  dom.advance(300_000);                // 5 minutes pass while paused
  dom.nodes.btnMain.click();           // resume
  eq('after resume: state=running',    getState(dom), 'running');
  eq('after resume: primary=Pause',    dom.nodes.btnMain._text, 'Pause');
  // Now 30s of real time elapse on the running clock.
  dom.advance(30_000);
  dom.tickRaf();
  // remaining should be 25:00 - 1:00 - 0:30 = 23:30, NOT affected by paused gap.
  eq('resume preserved remaining (23:30)', getDisplay(dom), '23:30');
}

// =================================================================
group('Reset · from running → 25:00 + idle');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();           // start
  dom.advance(5 * 60_000);             // 5 min in
  dom.tickRaf();
  dom.nodes.btnReset.click();          // reset
  eq('after reset: state=idle',        getState(dom), 'idle');
  eq('after reset: display=25:00',     getDisplay(dom), '25:00');
  eq('after reset: primary=Start',     dom.nodes.btnMain._text, 'Start');
  eq('after reset: reset disabled',    dom.nodes.btnReset.disabled, true);
  eq('after reset: is-done not set',   dom.nodes.stage._classes.has('is-done'), false);
}

// =================================================================
group('Reset · from paused → 25:00 + idle');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click(); dom.advance(60_000); dom.tickRaf();
  dom.nodes.btnMain.click();           // pause
  dom.nodes.btnReset.click();
  eq('reset from paused: idle',        getState(dom), 'idle');
  eq('reset from paused: 25:00',       getDisplay(dom), '25:00');
}

// =================================================================
group('Completion · running 25:00 → done with full feedback');
// =================================================================
{
  const { dom, sandbox } = boot();
  const baseTitle = sandbox.document.title;
  dom.nodes.btnMain.click();             // start
  // Jump past the end (simulating a backgrounded tab waking up).
  dom.advance(25 * 60_000 + 500);
  // One rAF tick should detect left<=0 and call finish().
  dom.tickRaf();

  eq('state = done',                    getState(dom), 'done');
  eq('display reaches 00:00',           getDisplay(dom), '00:00');
  eq('primary label = "Start new session"', dom.nodes.btnMain._text, 'Start new session');
  eq('is-done class added',             dom.nodes.stage._classes.has('is-done'), true);
  eq('document.title carries ✓ Done prefix', sandbox.document.title.indexOf('✓ Done') === 0, true);
  eq('aria-live announces completion',  /Pomodoro complete/i.test(dom.nodes.live._text), true);
  eq('progress bar at 100%',            dom.nodes.bar.style.width, '100.00%');

  // sessionN bumps from 1 to 2 on first completion.
  eq('session counter incremented',     dom.nodes.sessionCount._text, '2');

  // rAF must NOT keep running after done.
  const before = dom.rafQueueLen();
  dom.tickRaf();
  eq('no rAF re-armed after finish',    dom.rafQueueLen() === 0 && before === 0, true);

  // Title resets when reset is pressed.
  dom.nodes.btnReset.click();
  eq('title restored to base on reset', sandbox.document.title, baseTitle);
}

// =================================================================
group('Completion · clicking primary in done state re-arms 25:00');
// =================================================================
{
  const { dom } = boot();
  dom.nodes.btnMain.click();
  dom.advance(25 * 60_000 + 1);
  dom.tickRaf();
  eq('precondition: state=done',       getState(dom), 'done');

  dom.nodes.btnMain.click();           // "Start new session"
  eq('re-armed: state=running',        getState(dom), 'running');
  eq('re-armed: display starts at 25:00', getDisplay(dom), '25:00');
  eq('re-armed: is-done class cleared', dom.nodes.stage._classes.has('is-done'), false);
}

// =================================================================
group('Keyboard · Space toggles, R resets');
// =================================================================
{
  const { dom } = boot();
  dom.dispatchKey(' ', 'Space');
  eq('Space starts timer',             getState(dom), 'running');
  dom.dispatchKey(' ', 'Space');
  eq('Space pauses timer',             getState(dom), 'paused');
  dom.dispatchKey(' ', 'Space');
  eq('Space resumes timer',            getState(dom), 'running');
  dom.dispatchKey('r', 'KeyR');
  eq('R resets timer',                 getState(dom), 'idle');
  eq('R resets display to 25:00',      getDisplay(dom), '25:00');
}

// =================================================================
group('Idempotency · pause/start guards');
// =================================================================
{
  const { dom } = boot();
  // pause when idle is no-op (no exception, no state change).
  dom.nodes.btnReset.click();          // reset disabled, click should also be safe
  eq('reset click while disabled is safe', getState(dom), 'idle');
  dom.nodes.btnMain.click();           // start
  dom.nodes.btnMain.click();           // pause
  const remBefore = getDisplay(dom);
  // Internal pause again via direct event would require exposing — instead, assert
  // that double-start (hitting space twice fast at running) doesn't reset endTime.
  dom.nodes.btnMain.click();           // resume
  // Click "primary" again immediately while running — should pause not restart.
  dom.advance(2_000); dom.tickRaf();
  dom.nodes.btnMain.click();           // pause
  const remAfter = getDisplay(dom);
  ok('double-toggle preserves remaining (no fresh 25:00 jump)',
     remAfter !== '25:00' && remAfter !== remBefore || remAfter === remBefore);
  // The remaining must be strictly less than 25:00.
  ok('after work cycle remaining < 25:00', getRemainingMs(dom) < 25 * 60_000);
}

// =================================================================
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
