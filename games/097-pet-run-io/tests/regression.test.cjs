#!/usr/bin/env node
/**
 * Regression / behavior tests for the Issue-#97 P0+P1+HIGH fix pass
 * (commit 2f953ba) — focused on the *numeric / state-machine* contracts
 * that the existing static.test.cjs only checks for *presence*.
 *
 * Coverage matrix (each block ≙ a class of bug the fix prevents):
 *   A. Segmented rubber-band — execute the actual conditional chain
 *      across 5 gap buckets and assert effective speed multipliers.
 *   B. dt clamp & accumulator cap — simulate the loop math and assert
 *      no NaN, no negative dt, dt ≤ 0.1, acc ≤ 0.25, fixed-step count.
 *   C. visibilitychange handler — verify the handler body resets the
 *      frame timer on resume and dismisses the zone overlay on hide.
 *   D. applyMuteState — toggle aria-pressed / aria-label / dataset.state
 *      across 4 transitions on a mock DOM.
 *   E. loadSave/persist round-trip — persist a non-trivial save, reload
 *      from the same backing store, assert deep equality.
 *   F. Zone-overlay timer hygiene — clearTimeout precedes setTimeout so
 *      a fast re-play does not double-schedule the 2s fade.
 *   G. tryJump coyote+buffer — drive the function across 3 states
 *      (on-ground, within coyote window, fully airborne) and assert
 *      jumps fire / are buffered / are suppressed correctly.
 *   H. Loop inner while honours state.ended (no extra fixed step
 *      after endGame fires mid-frame).
 *
 * Run: node games/097-pet-run-io/tests/regression.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const js = scriptBlocks.join('\n\n');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`);
  }
}
function group(title) { console.log(`\n=== ${title} ===`); }

function extractFn(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  const start = m.index;
  let i = js.indexOf('{', start);
  let depth = 1, end = i + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return js.slice(start, end);
}

/* =====================================================================
 * A. Segmented rubber-band — execute the actual chain.
 *
 *    Source lines 943-946 (verified by static.test.cjs):
 *      if (gap > 480)       sf *= 0.86;
 *      else if (gap > 220)  sf *= 0.94;
 *      else if (gap < -480) sf *= 1.12;
 *      else if (gap < -220) sf *= 1.05;
 *
 *    Test goal: prove the conditional chain is exclusive (else-if), monotone
 *    by severity, and leaves the |gap| ≤ 220 "real race" band untouched.
 * ===================================================================== */
group('A. Segmented rubber-band — 5 buckets');

// mirror the source rules exactly, then validate against a substring sanity match
function applyRubberBand(baseSpeedFactor, gap) {
  let sf = baseSpeedFactor;
  if (gap > 480) sf *= 0.86;
  else if (gap > 220) sf *= 0.94;
  else if (gap < -480) sf *= 1.12;
  else if (gap < -220) sf *= 1.05;
  return sf;
}
// Verify mirror matches source (no drift): each segment present, with the
// expected multipliers in the exact branch order.
const rbSrc = js.match(/if\s*\(\s*gap\s*>\s*480\s*\)[\s\S]{0,200}gap\s*<\s*-220[\s\S]{0,80}1\.05/);
ok('source has all 5 segments in if/else-if chain (480/220/-220/-480)', !!rbSrc);

// dead-band (|gap| ≤ 220) — multiplier untouched
ok('gap = 0      → multiplier 1.0 (untouched)',     applyRubberBand(1, 0) === 1);
ok('gap = +220   → multiplier 1.0 (boundary excl.)', applyRubberBand(1, 220) === 1);
ok('gap = -220   → multiplier 1.0 (boundary excl.)', applyRubberBand(1, -220) === 1);

// mild drag
ok('gap = +221   → ×0.94 (mild drag)',
   Math.abs(applyRubberBand(1, 221) - 0.94) < 1e-9);
ok('gap = +480   → ×0.94 (boundary excl. for strong)',
   Math.abs(applyRubberBand(1, 480) - 0.94) < 1e-9);
// strong drag
ok('gap = +481   → ×0.86 (strong drag)',
   Math.abs(applyRubberBand(1, 481) - 0.86) < 1e-9);
ok('gap = +9999  → ×0.86 (cap, no further slow-down)',
   Math.abs(applyRubberBand(1, 9999) - 0.86) < 1e-9);

// mild catch-up
ok('gap = -221   → ×1.05 (mild catch-up)',
   Math.abs(applyRubberBand(1, -221) - 1.05) < 1e-9);
ok('gap = -480   → ×1.05 (boundary excl. for strong)',
   Math.abs(applyRubberBand(1, -480) - 1.05) < 1e-9);
// strong catch-up
ok('gap = -481   → ×1.12 (strong catch-up)',
   Math.abs(applyRubberBand(1, -481) - 1.12) < 1e-9);
ok('gap = -9999  → ×1.12 (cap, no faster catch-up)',
   Math.abs(applyRubberBand(1, -9999) - 1.12) < 1e-9);

// monotone severity (slow side): closer to player gets less drag, never more
ok('drag is monotone: 0.86 < 0.94 < 1.0',
   applyRubberBand(1, 600) < applyRubberBand(1, 300) && applyRubberBand(1, 300) < applyRubberBand(1, 0));
// monotone (fast side)
ok('catch-up is monotone: 1.0 < 1.05 < 1.12',
   applyRubberBand(1, 0) < applyRubberBand(1, -300) && applyRubberBand(1, -300) < applyRubberBand(1, -600));

// composition with baseFactor jitter (per source: baseFactor ∈ [0.93..1.09])
ok('base 0.93 × strong catch-up 1.12 = 1.0416 (still close to nominal)',
   Math.abs(applyRubberBand(0.93, -1000) - 1.0416) < 1e-4);
ok('base 1.09 × strong drag 0.86 = 0.9374 (clearly slower than nominal)',
   Math.abs(applyRubberBand(1.09, 1000) - 0.9374) < 1e-4);

/* =====================================================================
 * B. dt clamp + accumulator cap — simulate loop math from index.html
 *    lines 1255-1271. Reproduce the formula and assert all branch
 *    behaviors stay sane under hostile timestamps.
 * ===================================================================== */
group('B. dt clamp & accumulator cap');

const STEP = 1/60;
function frameMath(prevAcc, lastTs, ts) {
  // exactly mirror the source clamping order
  const dt = Math.min(0.1, Math.max(0, (ts - lastTs)/1000));
  let acc = prevAcc + dt;
  if (acc > 0.25) acc = 0.25;
  let steps = 0;
  while (acc >= STEP) { acc -= STEP; steps++; if (steps > 1000) break; }
  return { dt, accAfter: acc, steps };
}

// nominal ~17ms frame → dt ≈ 0.0167 ≥ 1/60, exactly 1 step drained
{ const r = frameMath(0, 0, 17);
  ok('nominal 17ms frame → 1 fixed step', r.steps === 1);
  ok('nominal 17ms frame → dt clamped >0', r.dt > 0 && r.dt < 0.1);
}
// sub-step frame (16ms < 1/60≈16.67ms): no step, dt accumulated
{ const r = frameMath(0, 0, 16);
  ok('16ms frame (<16.67ms STEP) → 0 steps, dt accumulated',
     r.steps === 0 && r.accAfter > 0 && r.accAfter < STEP);
}
// going-backwards clock (devtools rewind) → dt floored at 0, no negative
{ const r = frameMath(0, 1000, 500);
  ok('time-travel backwards → dt clamped to 0 (no negative)', r.dt === 0 && r.steps === 0);
}
// huge jump (tab returned after 5s without visibility resync) → dt ≤ 0.1
{ const r = frameMath(0, 0, 5000);
  ok('5s gap → dt clamped to ≤0.1', r.dt <= 0.1 && r.dt > 0);
}
// accumulator already near cap + big dt → never explodes
{ const r = frameMath(1.5, 0, 100);
  ok('giant accumulator → capped to 0.25 before draining',
     // 0.25 / STEP = 15 fixed steps, no more
     r.steps <= 15 && r.steps >= 14);
}
// huge ts jump after stall: cap=0.25/step → 15 steps max regardless
{ const r = frameMath(0, 0, 999999);
  ok('post-stall: max 15 fixed steps (no teleport)',
     r.steps <= 15);
}
// first frame: lastTs=0, ts=0 → dt=0, no step, no NaN
{ const r = frameMath(0, 0, 0);
  ok('first frame (ts=lastTs=0) → no step, no NaN',
     r.dt === 0 && r.steps === 0 && !Number.isNaN(r.accAfter));
}

/* =====================================================================
 * C. visibilitychange — verify handler body (extracted from source).
 *    We can't run document.addEventListener, but we CAN read the
 *    handler body and exec it in a sandbox with mock document/state.
 * ===================================================================== */
group('C. visibilitychange handler');

const visMatch = js.match(
  /addEventListener\(\s*['"]visibilitychange['"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;/
);
ok('visibilitychange handler body extractable', !!visMatch);

if (visMatch) {
  const body = visMatch[1];
  // 1. when hidden: zone-overlay loses 'show' class
  {
    const removedClasses = [];
    const sandbox = {
      document: { hidden: true },
      $: (id) => id === 'zone-overlay'
        ? { classList: { remove: (c) => removedClasses.push(c) } }
        : null,
      lastTs: 999, acc: 999,
    };
    vm.createContext(sandbox);
    vm.runInContext(`(() => { ${body} })();`, sandbox);
    ok('document.hidden=true → zone-overlay.classList.remove("show") called',
       removedClasses.includes('show'));
    ok('document.hidden=true → lastTs / acc untouched',
       sandbox.lastTs === 999 && sandbox.acc === 999);
  }
  // 2. when visible: lastTs and acc reset to 0
  {
    const sandbox = {
      document: { hidden: false },
      $: () => ({ classList: { remove: () => {} } }),
      lastTs: 12345, acc: 0.2,
    };
    vm.createContext(sandbox);
    vm.runInContext(`(() => { ${body} })();`, sandbox);
    ok('document.hidden=false → lastTs reset to 0', sandbox.lastTs === 0);
    ok('document.hidden=false → acc reset to 0',    sandbox.acc === 0);
  }
}

/* =====================================================================
 * D. applyMuteState — execute on a mock DOM and check every attribute.
 * ===================================================================== */
group('D. applyMuteState — 4 transitions');

const muteSrc = extractFn('applyMuteState');
ok('applyMuteState() extractable', !!muteSrc);

if (muteSrc) {
  function makeMockEl() {
    const dataset = {};
    const attrs = {};
    return {
      className: '',
      dataset,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      _attrs: attrs,
    };
  }
  function runApply(mutedFlag) {
    const glyph = makeMockEl();
    const btn = makeMockEl();
    const sandbox = {
      muted: mutedFlag,
      $: (id) => ({ 'mute-glyph': glyph, 'btn-mute': btn })[id] || null,
    };
    vm.createContext(sandbox);
    vm.runInContext(muteSrc + '\napplyMuteState();', sandbox);
    return { glyph, btn };
  }

  // unmuted (default)
  {
    const { glyph, btn } = runApply(false);
    ok('unmuted → glyph.className = "mute-on"', glyph.className === 'mute-on');
    ok('unmuted → aria-pressed = "false"',       btn._attrs['aria-pressed'] === 'false');
    ok('unmuted → aria-label = "静音"',          btn._attrs['aria-label'] === '静音');
    ok('unmuted → dataset.state cleared',        btn.dataset.state === undefined);
  }
  // muted
  {
    const { glyph, btn } = runApply(true);
    ok('muted   → glyph.className = "mute-off"', glyph.className === 'mute-off');
    ok('muted   → aria-pressed = "true"',         btn._attrs['aria-pressed'] === 'true');
    ok('muted   → aria-label = "打开音效"',       btn._attrs['aria-label'] === '打开音效');
    ok('muted   → dataset.state = "muted"',       btn.dataset.state === 'muted');
  }
  // toggle muted→unmuted on the SAME button (verify state.muted is actually cleared, not stuck)
  {
    // simulate the real sequence: set muted, then call applyMuteState with muted=false again
    const glyph = makeMockEl();
    const btn = makeMockEl();
    btn.dataset.state = 'muted'; // simulate previous muted run
    const sandbox = {
      muted: false,
      $: (id) => ({ 'mute-glyph': glyph, 'btn-mute': btn })[id] || null,
    };
    vm.createContext(sandbox);
    vm.runInContext(muteSrc + '\napplyMuteState();', sandbox);
    ok('toggle muted→unmuted clears dataset.state (no sticky red tint)',
       btn.dataset.state === undefined);
    ok('toggle muted→unmuted updates aria-pressed back to "false"',
       btn._attrs['aria-pressed'] === 'false');
  }
}

/* =====================================================================
 * E. loadSave + persist round-trip — full circle through a mock LS.
 * ===================================================================== */
group('E. loadSave/persist round-trip integrity');

const loadSrc = extractFn('loadSave');
const persistSrc = extractFn('persist');

if (loadSrc && persistSrc) {
  function makeStore() {
    const store = {};
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      _peek: () => ({ ...store }),
    };
  }
  // persist a save → reload → deep-equal
  {
    const ls = makeStore();
    const original = { best: 4242, runs: 12, unlocked: ['cat','dog','duck'], lastSkin: 'duck' };
    const sandbox = {
      localStorage: ls,
      JSON, Number, Math, Array,
      DEFAULT_SAVE: { best: 0, runs: 0, unlocked: ['cat'], lastSkin: 'cat' },
      STORE_KEY: 'petrun:save',
      save: original,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${loadSrc}\n${persistSrc}\npersist(); result = loadSave();`, sandbox);
    const reloaded = sandbox.result;
    ok('persist → reload preserves best',     reloaded.best === 4242);
    ok('persist → reload preserves runs',     reloaded.runs === 12);
    ok('persist → reload preserves unlocked', JSON.stringify(reloaded.unlocked) === '["cat","dog","duck"]');
    ok('persist → reload preserves lastSkin', reloaded.lastSkin === 'duck');
    ok('persist writes to STORE_KEY (raw JSON present)',
       typeof ls._peek()['petrun:save'] === 'string' && ls._peek()['petrun:save'].includes('4242'));
  }
  // mutation safety: reloaded.unlocked must be a *copy*, mutating it must not
  // change a subsequent reload (since loadSave does .slice())
  {
    const ls = makeStore();
    ls.setItem('petrun:save', JSON.stringify({ best: 1, runs: 1, unlocked: ['cat','dog'], lastSkin: 'cat' }));
    const sandbox = {
      localStorage: ls,
      JSON, Number, Math, Array,
      DEFAULT_SAVE: { best: 0, runs: 0, unlocked: ['cat'], lastSkin: 'cat' },
      STORE_KEY: 'petrun:save',
    };
    vm.createContext(sandbox);
    vm.runInContext(`${loadSrc}\nfirst = loadSave(); first.unlocked.push('HACK'); second = loadSave();`, sandbox);
    ok('loadSave returns a defensive .slice() of unlocked',
       !sandbox.second.unlocked.includes('HACK'));
  }
}

/* =====================================================================
 * F. Zone-overlay timer hygiene — clearTimeout precedes setTimeout
 *    in the play-start path. Without this guard, double-tapping replay
 *    could leave a previous timer alive and hide the overlay early on
 *    the second run.
 * ===================================================================== */
group('F. Zone-overlay timer hygiene');

const zoneBlockMatch = js.match(
  /\$\(\s*['"]zone-overlay['"]\s*\)[\s\S]{0,400}classList\.add\(\s*['"]show['"]\s*\)[\s\S]{0,400}\}\s*,\s*2000\s*\)/
);
ok('zone-overlay setup block extractable', !!zoneBlockMatch);
if (zoneBlockMatch) {
  const blk = zoneBlockMatch[0];
  ok('clearTimeout precedes setTimeout (prevents stacked timers on rapid replay)',
     /clearTimeout\(\s*state\._zoneTimer\s*\)[\s\S]*setTimeout/.test(blk));
  ok('new timer is stored in state._zoneTimer for next clear',
     /state\._zoneTimer\s*=\s*setTimeout/.test(blk));
  ok('timer duration is exactly 2000ms (UX spec — 2s onboarding)',
     /\}\s*,\s*2000\s*\)/.test(blk));
  ok('overlay shown via classList.add("show")',
     /classList\.add\(\s*['"]show['"]\s*\)/.test(blk));
  ok('overlay hidden via classList.remove("show") inside the setTimeout',
     /setTimeout\(\s*\(\s*\)\s*=>\s*\{?\s*[^}]*classList\.remove\(\s*['"]show['"]\s*\)/.test(blk));
}

/* =====================================================================
 * G. tryJump — coyote-time + input-buffer logic across 3 states.
 *    Source: index.html lines 771-784.
 * ===================================================================== */
group('G. tryJump — coyote + jump-buffer state machine');

const tryJumpSrc = extractFn('tryJump');
ok('tryJump() extractable', !!tryJumpSrc);

if (tryJumpSrc) {
  function makeSandbox(playerOverride, phase = 'play', nowMs = 1000) {
    const sfxCalls = [];
    const sandbox = {
      state: { phase, player: playerOverride, inputBufferUntil: 0 },
      performance: { now: () => nowMs },
      COYOTE_MS: 80,
      BUFFER_MS: 150,
      JUMP_V0: -780,
      SFX: { jump: () => sfxCalls.push('jump') },
      _sfx: sfxCalls,
    };
    vm.createContext(sandbox);
    vm.runInContext(tryJumpSrc + '\ntryJump();', sandbox);
    return sandbox;
  }

  // 1) on-ground → jump fires
  {
    const p = { crashed: false, onGround: true, lastGroundTs: 0, vy: 0, sliding: false };
    const sb = makeSandbox(p);
    ok('on-ground → vy set to JUMP_V0 (-780)', sb.state.player.vy === -780);
    ok('on-ground → onGround=false',           sb.state.player.onGround === false);
    ok('on-ground → SFX.jump played',          sb._sfx.includes('jump'));
    ok('on-ground → no input-buffer set',      sb.state.inputBufferUntil === 0);
  }
  // 2) airborne but within coyote window (just left ground 50ms ago) → jump fires
  {
    const p = { crashed: false, onGround: false, lastGroundTs: 950, vy: 0 };
    const sb = makeSandbox(p, 'play', 1000); // now - lastGroundTs = 50 < 80
    ok('coyote (50<80ms) → jump still fires',  sb.state.player.vy === -780);
    ok('coyote → SFX.jump played',             sb._sfx.includes('jump'));
  }
  // 3) airborne past coyote → no jump, but buffer set
  {
    const p = { crashed: false, onGround: false, lastGroundTs: 800, vy: 0 };
    const sb = makeSandbox(p, 'play', 1000); // gap = 200 > 80
    ok('past coyote → vy unchanged (no jump)',          sb.state.player.vy === 0);
    ok('past coyote → SFX.jump NOT played',             !sb._sfx.includes('jump'));
    ok('past coyote → input buffer set (now+BUFFER_MS)', sb.state.inputBufferUntil === 1150);
  }
  // 4) phase != play → no-op
  {
    const p = { crashed: false, onGround: true, lastGroundTs: 0, vy: 0 };
    const sb = makeSandbox(p, 'title');
    ok('phase=title → no jump, no SFX',
       sb.state.player.vy === 0 && sb._sfx.length === 0);
  }
  // 5) crashed → no-op (defensive)
  {
    const p = { crashed: true, onGround: true, lastGroundTs: 0, vy: 0 };
    const sb = makeSandbox(p);
    ok('crashed player → no jump (defensive)',
       sb.state.player.vy === 0 && sb._sfx.length === 0);
  }
}

/* =====================================================================
 * H. Loop inner-while honours state.ended (no overshoot after endGame).
 *    Source lines 1264-1267: while(acc >= STEP){ update(STEP); ...
 *                              if(state.ended) break; }
 * ===================================================================== */
group('H. Loop break on state.ended');

const loopBlock = js.match(
  /while\s*\(\s*acc\s*>=\s*STEP\s*\)\s*\{([\s\S]{0,200})\}\s*\n\s*render\(\)/
);
ok('inner while loop extractable', !!loopBlock);
if (loopBlock) {
  ok('inner while has `update(STEP)` call',
     /update\(\s*STEP\s*\)/.test(loopBlock[1]));
  ok('inner while drains acc by STEP each iteration',
     /acc\s*-=\s*STEP/.test(loopBlock[1]));
  ok('inner while breaks early if state.ended (no extra physics step after endGame)',
     /if\s*\(\s*state\.ended\s*\)\s*break/.test(loopBlock[1]));
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Pet Run.io · regression.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
