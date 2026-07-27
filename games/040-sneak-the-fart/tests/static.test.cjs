#!/usr/bin/env node
/**
 * Static acceptance tests for Sneak the Fart (Issue #40).
 * Run: node games/040-sneak-the-fart/tests/static.test.cjs
 *
 * Covers:
 *  - issue acceptance criteria (AC1..AC6) via source assertions on the
 *    single-file game (inline <script> extracted from index.html)
 *  - the Issue #40 restore consensus: AC5 haptics gap closed with a
 *    guarded navigator.vibrate helper + call sites at success / caught /
 *    level-up / victory
 *  - LEVELS config unit-checked in a vm sandbox (5 levels, targets,
 *    per-level vision-cone geometric coverage of the player spot)
 *  - registry integration (registry.json valid, entry present, files exist)
 *  - npm script wiring
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

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
ok('inline game script present', !!scriptMatch);
const js = scriptMatch ? scriptMatch[1] : '';

/* extract `const NAME = [ ... ]` by bracket matching */
function extractConstArray(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('[', m.index), depth = 1, end = i + 1;
  while (depth && end < js.length) {
    if (js[end] === '[' || js[end] === '{') depth++;
    if (js[end] === ']' || js[end] === '}') depth--;
    end++;
  }
  return js.slice(m.index, end);
}

group('AC1 - first screen playable within 3s, no tutorial gate');
ok('title / play / gameover screens present', /id="titleScreen"/.test(html) && /id="playScreen"/.test(html) && /id="gameoverScreen"/.test(html));
ok('start button present and autofocused', /id="startBtn"[^>]*autofocus/.test(html));
ok('inline control hint doubles as tutorial', /Press SPACE or tap when safe!/.test(html));
ok('only local shared stylesheet linked, zero external network resources', /href="\/games\/shared\/game-frame\.css"/.test(html) && !/https?:\/\//.test(html));

group('AC2 - single round <= 3 minutes (short level config)');
const levelsSrc = extractConstArray('LEVELS');
ok('LEVELS config extractable', !!levelsSrc);
if (levelsSrc) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${levelsSrc}; this.LEVELS = LEVELS;`, ctx);
  ok('ships exactly 5 levels', ctx.LEVELS.length === 5, `got ${ctx.LEVELS.length}`);
  ok('every level has name/desc/target/npcs', ctx.LEVELS.every(l => l.name && l.desc && Number.isInteger(l.target) && Array.isArray(l.npcs) && l.npcs.length > 0));
  ok('release targets stay small (3..8) for short rounds', ctx.LEVELS.every(l => l.target >= 3 && l.target <= 8), JSON.stringify(ctx.LEVELS.map(l => l.target)));
  ok('level names Elevator/Library/Bus/Restaurant/Meeting Room', ['Elevator', 'Library', 'Bus', 'Restaurant', 'Meeting Room'].every(n => ctx.LEVELS.some(l => l.name === n)));
  /* Issue #40 round-2 difficulty consensus: the fix is pure data, so lock it
   * geometrically — every level must be losable. Some NPC, at some patrol
   * sample point, must cover the fixed player spot (180, 400) under the
   * visionAngle cone: dist <= range * 40 px and |atan2(dy, dx) - faceAngle|
   * < visionAngle, faceAngle = 0 when looking right (lookDir > 0) else PI. */
  ok('vision cone half-angle widened to 0.8 rad in initNPCs', /visionAngle:\s*0\.8/.test(js));
  const PLAYER_X = 180, PLAYER_Y = 400, VISION_ANGLE = 0.8;
  ctx.LEVELS.forEach((level, idx) => {
    const canSpot = level.npcs.some(n => {
      const faceAngle = n.lookDir > 0 ? 0 : Math.PI;
      for (let x = n.patrol.x1; x <= n.patrol.x2; x += 5) {
        const dx = PLAYER_X - x, dy = PLAYER_Y - n.y;
        if (Math.hypot(dx, dy) <= n.range * 40 &&
            Math.abs(Math.atan2(dy, dx) - faceAngle) < VISION_ANGLE) return true;
      }
      return false;
    });
    ok(`level ${idx + 1} (${level.name}) has a patrol point covering the player`, canSpot);
  });
}

group('AC3 - at least two of keyboard / mouse / touch (all three shipped)');
ok('Space keydown handler with preventDefault', /document\.addEventListener\(['"]keydown['"][\s\S]{0,120}e\.key === ' '[\s\S]{0,60}e\.preventDefault\(\)/.test(js));
ok('canvas click handler for mouse input', /canvas\.addEventListener\(['"]click['"][\s\S]{0,80}handleAction\(\)/.test(js));
ok('canvas touchstart handler with preventDefault and passive:false', /canvas\.addEventListener\(['"]touchstart['"][\s\S]{0,120}e\.preventDefault\(\)[\s\S]{0,80}passive: false/.test(js));

group('AC4 - win/lose settlement with replay');
ok('shared gameover screen with win/lose title states', /go-title\.win/.test(html) && /go-title\.lose/.test(html) && /'go-title win'/.test(js) && /'go-title lose'/.test(js));
ok('replay button exists', /id="replayBtn"/.test(html));
ok('replay button label is 再来一局 with aria-label', /id="replayBtn"[^>]*aria-label="Play again"[^>]*>再来一局</.test(html));
ok('replay click restarts directly via startGame (no title detour)', /getElementById\(['"]replayBtn['"]\)\.addEventListener\(['"]click['"],\s*startGame\)/.test(js));
ok('gameover Space/Enter restart directly, Escape returns to title', /if \(gameState === GAMEOVER\) \{ startGame\(\); return; \}/.test(js) && /e\.key === 'Enter' && gameState === GAMEOVER\)[\s\S]{0,40}startGame\(\);/.test(js) && /e\.key === 'Escape' && gameState === GAMEOVER\)[\s\S]{0,60}showScreen\(['"]titleScreen['"]\)/.test(js));

group('AC5 - sound and vibration feedback');
ok('WebAudio with webkit fallback, lazily created', /if \(!audioCtx\) audioCtx = new \(window\.AudioContext \|\| window\.webkitAudioContext\)/.test(js));
ok('suspended context resumed on first gesture', /audioCtx\.state === 'suspended'[\s\S]{0,40}audioCtx\.resume\(\)/.test(js));
ok('fart/caught/victory/levelup SFX implemented', /case 'fart1'/.test(js) && /case 'caught'/.test(js) && /case 'victory'/.test(js) && /case 'levelup'/.test(js));
ok('navigator.vibrate guarded with if + try/catch', /if \(navigator\.vibrate\)/.test(js) && /try \{ navigator\.vibrate\(pattern\); \} catch/.test(js));
ok('successful release triggers haptic', /playSound\('fart'[\s\S]{0,60}vibrate\(15\)/.test(js));
ok('getting caught triggers fail haptic pattern', /playSound\('caught'\);[\s\S]{0,40}vibrate\(\[60, 40, 60\]\)/.test(js));
ok('level-up triggers haptic pattern', /playSound\('levelup'\);[\s\S]{0,40}vibrate\(\[30, 40, 30\]\)/.test(js));
ok('victory triggers haptic pattern', /playSound\('victory'\);[\s\S]{0,40}vibrate\(\[60, 50, 100\]\)/.test(js));
ok('mute toggle persisted and aria-pressed synced', /MUTED_KEY = 'sneak-fart-muted'/.test(js) && /setAttribute\(['"]aria-pressed['"], String\(muted\)\)/.test(js));

group('AC6 - best level persisted to localStorage with guards');
ok('game-specific storage key', /STORAGE_KEY = 'sneak-fart-best'/.test(js));
ok('loadBest guarded with try/catch', /function loadBest\(\) \{[\s\S]{0,140}try \{[\s\S]{0,100}\} catch \(e\) \{ return 0; \}/.test(js));
ok('saveBest guarded with try/catch', /function saveBest\(v\) \{[\s\S]{0,100}try \{[\s\S]{0,80}\} catch \(e\) \{\}/.test(js));
ok('victory branch persists best', /function gameComplete\(\) \{[\s\S]{0,700}saveBest\(bestLevel\)/.test(js));
ok('defeat branch persists best', /function gameOver\(\) \{[\s\S]{0,700}saveBest\(bestLevel\)/.test(js));

group('Registry integration');
const registryBuf = fs.readFileSync(path.join(ROOT, '..', 'registry.json'));
ok('registry has no null bytes', !registryBuf.includes(0));
const registry = JSON.parse(registryBuf.toString('utf8'));
const entry = registry.games.find(g => g.id === 'sneak-the-fart');
ok('registry contains sneak-the-fart', !!entry);
if (entry) {
  const keys = ['id', 'name', 'description', 'category', 'tags', 'thumbnail', 'path', 'hasServer', 'players', 'version', 'featured', 'rating'];
  ok('entry has all 12 schema keys', keys.every(k => k in entry), 'missing: ' + keys.filter(k => !(k in entry)).join(','));
  ok('path points at 040 directory', entry.path === '/games/040-sneak-the-fart/');
  ok('thumbnail points at shipped thumb.svg', entry.thumbnail === '/games/040-sneak-the-fart/thumb.svg');
  ok('game index.html exists on disk', fs.existsSync(path.join(ROOT, 'index.html')));
  ok('thumbnail file exists on disk', fs.existsSync(path.join(ROOT, 'thumb.svg')));
  ok('category is in registry enum', registry.categories.some(c => c.id === entry.category), entry.category);
  ok('client-side only game: hasServer false, players "1"', entry.hasServer === false && entry.players === '1');
}

group('npm script wiring');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'package.json'), 'utf8'));
ok('package.json has test:sneak-the-fart', (pkg.scripts || {})['test:sneak-the-fart'] === 'node games/040-sneak-the-fart/tests/static.test.cjs');

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
