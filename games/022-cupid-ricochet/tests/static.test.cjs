#!/usr/bin/env node
/**
 * Static acceptance tests for Cupid Ricochet (Issue #22).
 * Run: node games/022-cupid-ricochet/tests/static.test.cjs
 *
 * Covers:
 *  - issue acceptance criteria (AC1..AC6) via source assertions
 *  - the two-analyst consensus rule: aim preview = first ray segment only
 *  - physics primitives unit-tested in a vm sandbox (slab ray-vs-AABB,
 *    ray-vs-segment mirror reflection, ray-vs-circle, mover ping-pong)
 *  - level solvability: every shipped level's solution is simulated
 *    through the extracted physics, asserting all hearts are collected
 *  - registry integration (registry.json valid + entry present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/* extract `function name(...) { ... }` by brace matching */
function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = html.match(re);
  if (!m) return null;
  let i = html.indexOf('{', m.index), depth = 1, end = i + 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    if (html[end] === '}') depth--;
    end++;
  }
  return html.slice(m.index, end);
}

/* extract `const NAME = {...}` or `const NAME = [...]` by bracket matching */
function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*[\\[{]`);
  const m = html.match(re);
  if (!m) return null;
  const open = html[html.indexOf(m[0]) + m[0].length - 1];
  let i = html.indexOf(open, m.index), depth = 1, end = i + 1;
  while (depth && end < html.length) {
    if (html[end] === '{' || html[end] === '[') depth++;
    if (html[end] === '}' || html[end] === ']') depth--;
    end++;
  }
  return html.slice(m.index, end);
}

/* ============================================================ */
group('AC1 - playable within 3s, zero-text tutorial');
ok('index.html exists and is substantial', html.length > 20000, `size=${html.length}`);
ok('single inline script, strict mode', /<script>\s*\n'use strict';/.test(html));
ok('no external scripts or assets (only shared frame css)',
  !/<script[^>]+src=/.test(html) && (html.match(/<link[^>]+rel="stylesheet"/g) || []).length === 1
  && /href="\/games\/shared\/game-frame\.css"/.test(html));
ok('back-to-hub link with recordPlayed', /class="back-to-hub"[\s\S]{0,120}recordPlayed\('cupid-ricochet'\)/.test(html));
ok('canvas play field present', /<canvas id="game"/.test(html));
ok('splash is the first screen (tap to start)', /id="splash"/.test(html) && /Tap to draw your bow/.test(html));
ok('no textual tutorial popups', !/how to play|tutorial overlay|instructions modal/i.test(html));
ok('zero-text teaching: ghost drag hand + breathing wall highlight',
  /drawGhostHand/.test(html) && /breathing highlight/.test(html) && /hint\.edges/.test(html));

group('AC2 - sessions <= 3 minutes');
ok('10 levels ship', /id: 10, name: "Cupid's Gauntlet"/.test(html));
ok('flight time cap bounds every attempt', /FLIGHT_CAP = 8/.test(html) && /flightTime > FLIGHT_CAP/.test(html));
ok('bounce cap bounds the physics loop', /MAX_BOUNCES = 10/.test(html) && /bounces >= MAX_BOUNCES/.test(html));
ok('fixed 120 Hz substep physics', /SUBSTEP = 1 \/ 120/.test(html));

group('AC3 - at least two input methods (three supported)');
ok('pointerdown/move/up unified for mouse + touch',
  /addEventListener\('pointerdown'/.test(html) && /addEventListener\('pointermove'/.test(html) && /addEventListener\('pointerup'/.test(html));
ok('pointer capture keeps drag alive off-canvas', /setPointerCapture\(e\.pointerId\)/.test(html));
ok('touch-action none prevents mobile scroll', /touch-action:\s*none/.test(html));
ok('slingshot pull-back aiming (fire = drag inverse)', /launch\.x - p\.x/.test(html));
ok('keyboard is the third input: arrows + space + R',
  /addEventListener\('keydown'/.test(html) && /case 'ArrowLeft':/.test(html) && /case ' ':/.test(html) && /case 'r': case 'R':/.test(html));

group('AC4 - result settlement with Play Again');
ok('result overlay is a dialog', /id="result"[\s\S]{0,300}role="dialog"/.test(html));
ok('Play Again primary button present', /id="btnAgain"/.test(html) && /Play again/.test(html));
ok('Play Again button wired to retry', /btnAgain'\)\.addEventListener\('click'/.test(html) && /function retryLevel\(\)/.test(html));
ok('Next level button wired forward', /btnNext'\)\.addEventListener\('click'/.test(html));
ok('result shows bounces / arrow / time stats', /stBounces/.test(html) && /stArrows/.test(html) && /stTime/.test(html));
ok('win/lose states have distinct copy', /Level <em>clear<\/em>/.test(html) && /Arrow <em>spent<\/em>/.test(html));

group('AC5 - audio and haptic feedback');
ok('WebAudio with webkit fallback', /window\.AudioContext \|\| window\.webkitAudioContext/.test(html));
ok('first-gesture unlock resumes suspended context', /audioCtx\.state === 'suspended'\) audioCtx\.resume\(\)/.test(html));
ok('synth sfx for launch/bounce/heart/win/lose/portal',
  ['sfxLaunch', 'sfxBounce', 'sfxHeart', 'sfxWin', 'sfxLose', 'sfxPortal'].every(f => new RegExp(`function ${f}\\(`).test(html)));
ok('navigator.vibrate feature-detected and guarded',
  /if \(navigator\.vibrate\) \{ try \{ navigator\.vibrate\(pattern\); \} catch/.test(html));
ok('mute toggle persisted with aria-pressed', /settings\.muted = !settings\.muted/.test(html) && /aria-pressed/.test(html) && /lsSet\(LS_SETTINGS, settings\)/.test(html));
ok('prefers-reduced-motion respected', /prefers-reduced-motion: reduce/.test(html) && /REDUCED/.test(html));

group('AC6 - localStorage best score');
ok('best-score key cupid-ricochet-best', /LS_BEST = 'cupid-ricochet-best'/.test(html));
ok('safe JSON storage helpers with try/catch',
  /function lsGet[\s\S]{0,200}try \{/.test(html) && /function lsSet[\s\S]{0,200}try \{/.test(html));
ok('progress tracks unlocked level, stars, best bounces',
  /unlocked/.test(html) && /bestBounces\[key\] = state\.bounces/.test(html) && /stars\[key\]/.test(html));

group('Aim preview - first segment only (analyst consensus)');
ok('traceRay stops at the earliest solid impact', /function traceRay/.test(html));
ok('preview draws a single segment to the impact point', /function drawPreview[\s\S]{0,900}ctx\.lineTo\(ray\.x, ray\.y\)/.test(html));
ok('preview never recurses into bounce prediction', !/function drawPreview[\s\S]{0,1600}?drawPreview\(/.test(html));
ok('portals truncate the preview (mouths are ray stops)', /kind = 'portal'/.test(html) && /ray\.kind === 'portal'/.test(html));
ok('hearts are pierceable and do not block the ray', /arrow pierces through/.test(html));

group('Physics primitives (vm unit tests)');
const fnNames = ['segVsAABB', 'segVsSeg', 'segVsCircle', 'reflectVec', 'moverPos', 'traceRay'];
const fns = {};
for (const n of fnNames) fns[n] = extractFunction(n);
ok('all physics functions extractable', fnNames.every(n => fns[n]), fnNames.filter(n => !fns[n]).join(','));

const sandbox = { Math, FIELD_W: 360, FIELD_H: 640, EPS: 1e-6, PORTAL_R: 18 };
vm.createContext(sandbox);
if (fnNames.every(n => fns[n])) {
  vm.runInContext(fnNames.map(n => fns[n]).join('\n') + '\nthis.fnExport = { segVsAABB, segVsSeg, segVsCircle, reflectVec, moverPos, traceRay };', sandbox);
}
const P = sandbox.fnExport || {};

if (P.segVsAABB) {
  let h = P.segVsAABB(0, 0, 1, 0, 10, -5, 4, 10);
  ok('slab: horizontal ray hits box left face at t=10', h && Math.abs(h.t - 10) < 1e-9 && h.nx === -1 && h.ny === 0, JSON.stringify(h));
  h = P.segVsAABB(0, 0, 0, 1, -5, 20, 10, 4);
  ok('slab: vertical ray hits box top face with normal (0,-1)', h && Math.abs(h.t - 20) < 1e-9 && h.nx === 0 && h.ny === -1, JSON.stringify(h));
  h = P.segVsAABB(12, 0, 1, 0, 10, -5, 4, 10);
  ok('slab: origin inside box reports no entry (t=null)', h === null || h.t === null, JSON.stringify(h));
  h = P.segVsAABB(0, 50, 1, 0, 10, -5, 4, 10);
  ok('slab: parallel ray above box misses', h === null, JSON.stringify(h));
  h = P.segVsAABB(0, 0, -1, 0, 10, -5, 4, 10);
  ok('slab: ray pointing away never hits', h === null, JSON.stringify(h));
}

if (P.segVsSeg && P.reflectVec) {
  let h = P.segVsSeg(0, 0, 1, 0, 10, -10, 10, 10);
  ok('mirror: vertical segment hit at t=10, normal faces the ray', h && Math.abs(h.t - 10) < 1e-9 && h.nx === -1, JSON.stringify(h));
  let r = P.reflectVec(1, 0, h.nx, h.ny);
  ok('mirror: head-on reflection reverses the ray', Math.abs(r.vx + 1) < 1e-9 && Math.abs(r.vy) < 1e-9, JSON.stringify(r));
  h = P.segVsSeg(0, 0, 1, 0, 20, 10, 30, 0); /* 45-degree mirror like level 4 */
  r = h ? P.reflectVec(1, 0, h.nx, h.ny) : null;
  ok('mirror: 45-degree mirror bends (1,0) into (0,-1)', r && Math.abs(r.vx) < 1e-9 && Math.abs(r.vy + 1) < 1e-9, JSON.stringify(r));
  const speed = r ? Math.hypot(r.vx, r.vy) : 0;
  ok('mirror: reflection preserves speed (no drift)', Math.abs(speed - 1) < 1e-9, `speed=${speed}`);
  h = P.segVsSeg(0, 0, 1, 0, 10, 5, 20, 15);
  ok('mirror: segment off the ray path misses', h === null, JSON.stringify(h));
}

if (P.segVsCircle) {
  let h = P.segVsCircle(0, 0, 1, 0, 20, 0, 5);
  ok('circle: ray enters at near edge (t=15)', h && Math.abs(h.t - 15) < 1e-9, JSON.stringify(h));
  h = P.segVsCircle(0, 0, 1, 0, 20, 10, 5);
  ok('circle: grazing ray misses', h === null, JSON.stringify(h));
  h = P.segVsCircle(20, 0, 1, 0, 20, 0, 5);
  ok('circle: origin inside exits forward', h && h.t > 0, JSON.stringify(h));
}

if (P.moverPos) {
  const m = { x1: 0, y1: 0, x2: 0, y2: 100, speed: 100 };
  const p0 = P.moverPos(m, 0);
  ok('mover starts at p0', Math.abs(p0.x) < 1e-9 && Math.abs(p0.y) < 1e-9, JSON.stringify(p0));
  const pMid = P.moverPos(m, 1); /* half period = L/speed */
  ok('mover reaches p1 at half period', Math.abs(pMid.y - 100) < 1e-6, JSON.stringify(pMid));
  const pFull = P.moverPos(m, 2);
  ok('mover returns to p0 at full period (ping-pong)', Math.abs(pFull.y) < 1e-6, JSON.stringify(pFull));
}

if (P.traceRay) {
  const lvl = {
    walls: [{ x: 100, y: -20, w: 10, h: 60 }],
    mirrors: [],
    portals: [{ a: { x: 50, y: 0, dx: -1, dy: 0 }, b: { x: 300, y: 0, dx: 1, dy: 0 } }]
  };
  let ray = P.traceRay(0, 0, 1, 0, lvl);
  ok('traceRay: portal mouth truncates the ray before the wall behind it',
    ray.kind === 'portal' && Math.abs(ray.x - 32) < 1e-6, JSON.stringify(ray));
  const lvl2 = { walls: [{ x: 100, y: -20, w: 10, h: 60 }], mirrors: [], portals: [] };
  ray = P.traceRay(0, 0, 1, 0, lvl2);
  ok('traceRay: wall is the first segment end', ray.kind === 'wall' && Math.abs(ray.x - 100) < 1e-9, JSON.stringify(ray));
  ray = P.traceRay(0, -100, 1, 0, lvl2);
  ok('traceRay: clear shot ends at the field bounds', ray.kind === 'edge' && Math.abs(ray.x - 360) < 1e-9, JSON.stringify(ray));
}

group('Level data + solvability (full arrow simulation)');
const levelsSrc = extractConst('LEVELS');
ok('LEVELS table extractable', !!levelsSrc);
let LEVELS = null;
if (levelsSrc && P.segVsAABB) {
  const lctx = { Math };
  vm.createContext(lctx);
  vm.runInContext(levelsSrc + '\nthis.lvExport = LEVELS;', lctx);
  LEVELS = lctx.lvExport;
}
ok('exactly 10 levels', LEVELS && LEVELS.length === 10, LEVELS ? `count=${LEVELS.length}` : 'n/a');
if (LEVELS) {
  ok('every level has launch, hearts and a solution', LEVELS.every(l => l.launch && l.hearts && l.hearts.length > 0 && l.sol));
  ok('progression introduces mirrors, portals and movers',
    LEVELS.some(l => l.mirrors.length > 0) && LEVELS.some(l => l.portals.length > 0) && LEVELS.some(l => l.movers.length > 0));
  ok('zero-text teaching covers hand + bounce + each new mechanic',
    ['hand', 'bounce', 'mirror', 'portal', 'mover'].every(t => LEVELS.some(l => l.teach === t)));

  /* simulate each level's solution through the extracted physics */
  const W = 360, H = 640, HIT_R = 17, PORTAL_R2 = 18, EPS2 = 1e-6;
  const DT = 1 / 120, CAP = 8, MAXB = 10;
  function simulate(level) {
    const s = level.sol;
    let x = level.launch.x + s.dx * 26, y = level.launch.y + s.dy * 26; /* runtime spawn offset */
    let vx = s.dx * s.spd, vy = s.dy * s.spd;
    const hitS = level.hearts.map(() => false);
    const hitM = level.movers.map(() => false);
    const usedPortals = new Set();
    let t = 0, bounces = 0, alive = true;
    while (t < CAP && alive) {
      let remaining = DT, guard = 0;
      while (remaining > EPS2 && guard++ < 12) {
        let bestT = remaining, kind = 'none', nx = 0, ny = 0, si = -1, mi = -1, pair = null, pairIdx = -1;
        if (vx > 0) { const tt = (W - x) / vx; if (tt < bestT) { bestT = tt; kind = 'edge'; nx = -1; ny = 0; } }
        else if (vx < 0) { const tt = -x / vx; if (tt < bestT) { bestT = tt; kind = 'edge'; nx = 1; ny = 0; } }
        if (vy > 0) { const tt = (H - y) / vy; if (tt < bestT) { bestT = tt; kind = 'edge'; nx = 0; ny = -1; } }
        else if (vy < 0) { const tt = -y / vy; if (tt < bestT) { bestT = tt; kind = 'edge'; nx = 0; ny = 1; } }
        for (const w of level.walls) {
          const hh = P.segVsAABB(x, y, vx, vy, w.x, w.y, w.w, w.h);
          if (hh && hh.t !== null && hh.t < bestT) { bestT = hh.t; kind = 'wall'; nx = hh.nx; ny = hh.ny; }
        }
        for (const m of level.mirrors) {
          const hh = P.segVsSeg(x, y, vx, vy, m.x1, m.y1, m.x2, m.y2);
          if (hh && hh.t < bestT) { bestT = hh.t; kind = 'mirror'; nx = hh.nx; ny = hh.ny; }
        }
        level.portals.forEach((pr, pi) => {
          if (usedPortals.has(pi)) return;
          for (const [mo, other] of [[pr.a, pr.b], [pr.b, pr.a]]) {
            const hh = P.segVsCircle(x, y, vx, vy, mo.x, mo.y, PORTAL_R2);
            if (hh && hh.t < bestT) { bestT = hh.t; kind = 'portal'; pair = other; pairIdx = pi; }
          }
        });
        level.hearts.forEach((h, i) => {
          if (hitS[i]) return;
          const hh = P.segVsCircle(x, y, vx, vy, h.x, h.y, HIT_R);
          if (hh && hh.t < bestT) { bestT = hh.t; kind = 'heartS'; si = i; }
        });
        level.movers.forEach((m, i) => {
          if (hitM[i]) return;
          const p = P.moverPos(m, s.wait + t + (DT - remaining) + bestT);
          const hh = P.segVsCircle(x, y, vx, vy, p.x, p.y, HIT_R);
          if (hh && hh.t < bestT) { bestT = hh.t; kind = 'heartM'; mi = i; }
        });
        x += vx * bestT; y += vy * bestT; remaining -= bestT;
        if (kind === 'heartS') { hitS[si] = true; }
        else if (kind === 'heartM') { hitM[mi] = true; }
        else if (kind === 'portal') {
          usedPortals.add(pairIdx);
          const spd = Math.hypot(vx, vy);
          x = pair.x + pair.dx * (PORTAL_R2 + 6); y = pair.y + pair.dy * (PORTAL_R2 + 6);
          vx = pair.dx * spd; vy = pair.dy * spd;
        } else if (kind === 'wall' || kind === 'edge' || kind === 'mirror') {
          const r = P.reflectVec(vx, vy, nx, ny);
          vx = r.vx; vy = r.vy;
          const spd = Math.hypot(vx, vy);
          vx = vx / spd * s.spd; vy = vy / spd * s.spd; /* runtime re-normalizes */
          bounces++;
          if (bounces >= MAXB) { alive = false; break; }
        }
      }
      t += DT;
      if (hitS.every(Boolean) && hitM.every(Boolean)) return { win: true, bounces, t };
    }
    return { win: hitS.every(Boolean) && hitM.every(Boolean), bounces, t };
  }

  for (const level of LEVELS) {
    const res = simulate(level);
    ok(`level ${level.id} (${level.name}) is solvable with its intended shot`, res.win,
      `bounces=${res.bounces} t=${res.t.toFixed(2)}s`);
    ok(`level ${level.id} solves within the bounce cap`, res.win && res.bounces < MAXB, `bounces=${res.bounces}`);
  }
}

group('Registry integration');
let registry = null;
try { registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8')); }
catch (err) { registry = null; }
ok('registry.json parses as valid JSON', !!registry);
const entry = registry && registry.games ? registry.games.find(g => g.id === 'cupid-ricochet') : null;
ok('registry contains cupid-ricochet entry', !!entry);
ok('registry path points at the 022 directory', entry && entry.path === '/games/022-cupid-ricochet/');
ok('registry entry is a static singleplayer puzzle',
  entry && entry.hasServer === false && entry.players === '1' && entry.category === 'puzzle');
ok('registry entry has thumbnail and version',
  entry && entry.thumbnail === '/games/022-cupid-ricochet/thumb.svg' && /^\d+\.\d+\.\d+$/.test(entry.version || ''));
ok('thumb.svg exists and is non-empty', fs.existsSync(path.join(ROOT, 'thumb.svg')) && fs.statSync(path.join(ROOT, 'thumb.svg')).size > 200);

group('npm script wiring');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'package.json'), 'utf8'));
ok('package.json has test:cupid-ricochet', (pkg.scripts || {})['test:cupid-ricochet'] === 'node games/022-cupid-ricochet/tests/static.test.cjs');

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
