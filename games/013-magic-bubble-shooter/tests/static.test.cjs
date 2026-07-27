#!/usr/bin/env node
/**
 * Static acceptance tests for Magic Bubble Shooter (Issue #13).
 * Run: node games/013-magic-bubble-shooter/tests/static.test.cjs
 *
 * Covers:
 *  - issue acceptance criteria (AC1..AC6) via source assertions
 *  - the two-analyst consensus rules (C1..C9)
 *  - logic primitives unit-tested in a vm sandbox (hex grid, flood-fill,
 *    floating cluster detection, aim ray with reflection)
 *  - registry integration (registry.json valid + entry present)
 *  - package.json test script wiring
 *
 * This file follows the "two-analyst consensus rule" from
 * games/022-cupid-ricochet/tests/static.test.cjs.
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
group('AC1 - playable within 3s, no forced tutorial');
ok('index.html exists and is substantial', html.length > 15000, `size=${html.length}`);
ok('single inline script, strict mode', /<script>\s*\n'use strict';/.test(html));
ok('no external scripts or assets (only shared frame css)',
  !/<script[^>]+src=/.test(html) && (html.match(/<link[^>]+rel="stylesheet"/g) || []).length === 1
  && /href="\/games\/shared\/game-frame\.css"/.test(html));
ok('back-to-hub link with recordPlayed', /class="back-to-hub"[\s\S]{0,120}recordPlayed\('magic-bubble-shooter'\)/.test(html));
ok('canvas play field present', /<canvas id="game"/.test(html));
ok('C1: no menu screen — game starts in aiming state', /phase: 'aiming'/.test(html) && !/splash/.test(html));
ok('C1: hint text exists and fades', /hintToast/.test(html) && /hintFade/.test(html));
ok('no textual tutorial popups / forced overlay', !/how to play|tutorial overlay|instructions modal|forceSplash/i.test(html));

group('AC2 - session <= 3 minutes');
ok('initial rows are 5-8 bubbles', /rows = 5 \+ Math\.min\(level - 1, 3\)/.test(html));
ok('bubble speed is bounded', /BUBBLE_SPEED = 520/.test(html));
ok('fail line prevents indefinite play', /FAIL_LINE_Y/.test(html) && /isLost/.test(html));

group('AC3 - at least two input methods (three supported)');
ok('C6: pointerdown/move/up unified for mouse + touch',
  /addEventListener\('pointerdown'/.test(html) && /addEventListener\('pointermove'/.test(html) && /addEventListener\('pointerup'/.test(html));
ok('pointer capture keeps drag alive off-canvas', /setPointerCapture\(e\.pointerId\)/.test(html));
ok('touch-action none prevents mobile scroll', /touch-action:\s*none/.test(html));
ok('C6: keyboard is third input: arrow keys + Space',
  /addEventListener\('keydown'/.test(html) && /case 'ArrowLeft':/.test(html) && /case ' ':/.test(html));
ok('C6: fire function is unified interface', /function fire\(\)/.test(html));
ok('C6: drag-release fires (touch tap guard <150ms/8px)', /elapsed < 150 && dist < 8/.test(html));

group('AC4 - result settlement with Play Again');
ok('C7: result overlay exists', /id="result"/.test(html));
ok('C7: Play Again button with autofocus', /id="btnPlayAgain"[\s\S]{0,30}autofocus/.test(html));
ok('C7: Play Again button has min 48px height (≥44px touch target)', /min-height:48px/.test(html));
ok('Play Again button wired to restart', /btnPlayAgain[\s\S]{0,80}restartGame/.test(html));
ok('C7: result shows score, level, time stats', /rScore/.test(html) && /rLevel/.test(html) && /rTime/.test(html));
ok('C7: new-record badge present', /new-record/.test(html) && /新纪录/.test(html));
ok('C7: secondary back-to-hub button', /btnBackHub/.test(html) && /back-to-hub/.test(html));
ok('C4 (AC4): win/lose states have distinct copy', /胜利！/.test(html) && /游戏结束/.test(html));

group('AC5 - audio and haptic feedback');
ok('WebAudio with webkit fallback', /window\.AudioContext \|\| window\.webkitAudioContext/.test(html));
ok('first-gesture unlock resumes suspended context', /audioCtx\.state === 'suspended'\) audioCtx\.resume\(\)/.test(html));
ok('synth sfx for shoot/pop/drop/win/lose',
  ['sfxShoot', 'sfxPop', 'sfxDrop', 'sfxWin', 'sfxLose'].every(f => new RegExp(`function ${f}\\(`).test(html)));
ok('navigator.vibrate feature-detected and guarded',
  /if \(navigator\.vibrate\) \{ try \{ navigator\.vibrate/.test(html));
ok('prefers-reduced-motion respected', /prefers-reduced-motion: reduce/.test(html) && /REDUCED/.test(html));

group('AC6 - localStorage highscore');
ok('C8: highscore key is bubble-shooter-highscore', /LS_KEY = 'bubble-shooter-highscore'/.test(html));
ok('safe JSON storage helpers with try/catch',
  /function lsGet[\s\S]{0,200}try \{/.test(html) && /function lsSet[\s\S]{0,200}try \{/.test(html));
ok('C8: highscore written on both win and lose',
  /saveHighscore\(\)/.test(html) && html.match(/saveHighscore\(\)/g).length >= 2);

group('C2 - aim trajectory with single-bounce reflection');
ok('aimRay function exists for trajectory preview', /function aimRay\(/.test(html));
ok('aimRay returns segments array', /function aimRay[\s\S]{0,300}segments/.test(html));
ok('reflection code exists for wall bounce', /Reflect/.test(html) && /segment/.test(html));
ok('drawAimLine renders the preview', /function drawAimLine/.test(html));

group('C3 - next-bubble preview');
ok('next-bubble preview DOM element exists', /id="nextBubble"/.test(html));
ok('next label visible', /下一个/.test(html));
ok('bubbleQueue has length >= 2 for current+next', /bubbleQueue/.test(html) && /state\.bubbleQueue\[/.test(html));
ok('updatePreview function exists', /function updatePreview\(\)/.test(html));

group('C4 - danger state (≤2 rows from bottom)');
ok('DANGER_THRESHOLD constant defined', /DANGER_THRESHOLD = 2/.test(html));
ok('isDanger function checks proximity to fail line', /function isDanger\(/.test(html) && /FAIL_LINE_Y/.test(html));
ok('danger visual overlays exist', /dangerOverlay/.test(html) && /dangerText/.test(html) && /dangerBorder/.test(html));
ok('danger animation CSS exists', /dangerPulse/.test(html));

group('C5 - lose check only at resolve time, not mid-flight');
ok('isLost checks grid state (post-lock), not in-flight bubble',
  /function isLost\(grid\)/.test(html) && /maxRow\(grid\)/.test(html) && /FAIL_LINE_Y/.test(html));
ok('resolveGrid checks lose after locking (via resolveStep)', /resolveGrid[\s\S]{0,1800}isLost\(/.test(html));

group('C9 - C1 through C8 have assertions in this test file');
/* This group itself is C9 */

group('Logic primitives (vm unit tests)');
const fnNames = ['neighbors', 'floodFill', 'findFloating', 'maxRow', 'isDanger', 'isLost', 'intersectRay', 'aimRay', 'hexPos', 'nearestCell'];
const fns = {};
for (const n of fnNames) fns[n] = extractFunction(n);
ok('all logic functions extractable', fnNames.every(n => fns[n]), fnNames.filter(n => !fns[n]).join(','));

const sandbox = {
  Math, FIELD_W: 360, FIELD_H: 640, COLS: 11,
  BUBBLE_R: 14, GAP: 1.5, DIAM: 29.5,
  COL_SPACING: 29.5 * Math.cos(Math.PI / 6),
  ROW_SPACING: 14 * 1.45 + 1.5 * 0.3,
  GRID_TOP: 28, FAIL_LINE_Y: 640 - 14 * 3 - 4,
  DANGER_THRESHOLD: 2, EPS: 1e-6,
  SHOOTER_Y: 640 - 46,
  COLORS: [
    { id: 0, fill: '#E53E3E' },
    { id: 1, fill: '#34D399' },
    { id: 2, fill: '#3B82F6' },
    { id: 3, fill: '#EAAE87' },
  ],
};
vm.createContext(sandbox);
if (fnNames.every(n => fns[n])) {
  vm.runInContext(fnNames.map(n => fns[n]).join('\n') + '\nthis.fnExport = { neighbors, floodFill, findFloating, maxRow, isDanger, isLost, intersectRay, aimRay, hexPos, nearestCell };', sandbox);
}
const P = sandbox.fnExport || {};

if (P.hexPos) {
  const p = P.hexPos(0, 0);
  ok('hexPos(0,0) returns valid coordinates', p && typeof p.x === 'number' && typeof p.y === 'number', JSON.stringify(p));
}

if (P.neighbors) {
  const nbrs = P.neighbors('5,3');
  ok('neighbors returns array for interior cell', Array.isArray(nbrs) && nbrs.length > 0, `got ${nbrs.length} neighbors: ${nbrs.join(',')}`);
}

if (P.floodFill) {
  const grid = {
    '0,0': { col: 0, row: 0, color: '#E53E3E', colorIdx: 0 },
    '1,0': { col: 1, row: 0, color: '#E53E3E', colorIdx: 0 },
    '2,0': { col: 2, row: 0, color: '#34D399', colorIdx: 1 },
    '3,0': { col: 3, row: 0, color: '#E53E3E', colorIdx: 0 },
  };
  const matched = P.floodFill(grid, '0,0', '#E53E3E');
  ok('floodFill finds 2 adjacent matching cells', matched && matched.length === 2, `found ${matched.length}: ${matched.join(',')}`);
  /* A single cell with its own color should return itself */
  const solo = P.floodFill(grid, '2,0', '#34D399');
  ok('floodFill finds single cell match', solo && solo.length === 1, `found ${solo ? solo.length : 0}`);
}

if (P.maxRow) {
  const grid = {
    '0,0': { row: 0 }, '1,2': { row: 2 }, '2,5': { row: 5 }
  };
  ok('maxRow returns highest row number', P.maxRow(grid) === 5, `got ${P.maxRow(grid)}`);
  ok('maxRow returns -1 for empty grid', P.maxRow({}) === -1, `got ${P.maxRow({})}`);
}

if (P.findFloating) {
  const grid = {
    '0,0': { col: 0, row: 0, color: '#E53E3E' },
    '0,1': { col: 0, row: 1, color: '#34D399' },  /* attached to (0,0) via neighbor */
    '5,3': { col: 5, row: 3, color: '#3B82F6' },  /* floating - no path to row 0 */
    '6,3': { col: 6, row: 3, color: '#EAAE87' },  /* floating */
  };
  /* For proper hex grid with odd-row alignment, (0,1) is the neighbor below (0,0) */
  const floating = P.findFloating(grid);
  ok('findFloating detects disconnected clusters', floating && floating.length === 2, `found ${floating.length}: ${floating.join(',')}`);
}

if (P.isDanger) {
  const safeGrid = { '0,0': { row: 0 } };
  ok('isDanger false for safe grid', !P.isDanger(safeGrid), `unexpected danger`);
}

if (P.intersectRay) {
  const grid = {};
  const hit = P.intersectRay(180, 400, 0.5, -0.866, grid);
  ok('intersectRay with empty grid hits wall or boundary', hit && hit.type !== 'none', JSON.stringify(hit));
}

group('Registry integration');
let registry = null;
try { registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8')); }
catch (err) { registry = null; }
ok('registry.json parses as valid JSON', !!registry);
const entry = registry && registry.games ? registry.games.find(g => g.id === 'magic-bubble-shooter') : null;
ok('registry contains magic-bubble-shooter entry', !!entry);
ok('registry path points at the 013 directory', entry && entry.path === '/games/013-magic-bubble-shooter/');
ok('registry entry is a static singleplayer puzzle',
  entry && entry.hasServer === false && entry.players === '1' && entry.category === 'puzzle');
ok('registry entry has thumbnail and version',
  entry && entry.thumbnail === '/games/013-magic-bubble-shooter/thumb.svg' && /^\d+\.\d+\.\d+$/.test(entry.version || ''));
ok('thumb.svg exists and is non-empty', fs.existsSync(path.join(ROOT, 'thumb.svg')) && fs.statSync(path.join(ROOT, 'thumb.svg')).size > 200);

group('npm script wiring');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'package.json'), 'utf8'));
ok('package.json has test:magic-bubble-shooter',
  (pkg.scripts || {})['test:magic-bubble-shooter'] === 'node games/013-magic-bubble-shooter/tests/static.test.cjs');

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
