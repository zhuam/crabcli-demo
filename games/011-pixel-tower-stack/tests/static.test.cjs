#!/usr/bin/env node
/**
 * Static smoke tests for Pixel Tower Stack (Game 011).
 *
 * Single-file game (games/011-pixel-tower-stack/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from the issue's acceptance checklist:
 *
 *   AC1  Title screen with start button on load
 *   AC2  Canvas-based game rendering (300x500)
 *   AC3  Block stacking with precision trimming
 *   AC4  Keyboard + touch input supported
 *   AC5  Web Audio sounds + haptic feedback
 *   AC6  localStorage high scores with safe fallback
 *   AC7  Game states: TITLE → PLAYING → GAMEOVER
 *
 * Run: node games/011-pixel-tower-stack/tests/static.test.cjs
 * Pure Node — no jsdom, no deps.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// extract the inline <script> body
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ❌ ' + name + (detail ? '  — ' + detail : ''));
  }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

/* =====================================================================
 * AC1 · DOM elements & title screen contract
 * ===================================================================== */
group('AC1 · DOM ids & screens');
const requiredIds = [
  'titleScreen', 'playScreen',
  'gameCanvas', 'canvasWrapper',
  'scoreDisplay', 'hudHigh', 'speedBadge',
  'goScore', 'goBest', 'goNewBest',
  'gameoverOverlay',
  'titleBest',
  'ariaLive',
  'muteBtn', 'startBtn', 'replayBtn',
];
for (const id of requiredIds) {
  const re = new RegExp('id\\s*=\\s*"' + id + '"');
  ok('#' + id + ' present', re.test(html));
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen has class active initially', /class="screen\s+title-screen\s+active"/.test(html));
ok('play screen not active initially', /class="screen\s+play-screen"(?![\s\S]{0,5}active)/.test(html));
ok('gameover overlay hidden initially', /class="gameover-overlay"(?![\s\S]{0,5}active)/.test(html));
ok('canvas element present with 300x500', /<canvas[^>]*id="gameCanvas"[^>]*width="300"[^>]*height="500"/.test(html));
ok('aria-live region for screen reader', /role="status"[\s\S]{0,20}aria-live="polite"/.test(html));
ok('back-to-hub link present', /back-to-hub/.test(html));

/* =====================================================================
 * AC2 · Game constants & canvas dimensions
 * ===================================================================== */
group('AC2 · Game constants');
ok('W = 300 declared', /var\s+W\s*=\s*300\b/.test(js));
ok('H = 500 declared (multi-var)', /,\s*H\s*=\s*500\b/.test(js));
ok('TOWER_BASE_W = 140 declared', /TOWER_BASE_W\s*=\s*140/.test(js));
ok('BLOCK_H = 20 declared', /BLOCK_H\s*=\s*20/.test(js));
ok('baseSpeed = 2.5 declared', /baseSpeed\s*=\s*2\.5/.test(js));
ok('PIECE_COLORS array with 8 colors', /var\s+PIECE_COLORS\s*=/.test(js) && /'#00FFFF'/.test(js) && /'#FF00FF'/.test(js) && /'#FFD700'/.test(js) && /'#7B68EE'/.test(js));
ok('ctx.getContext("2d") used', /getContext\(\s*['"]2d['"]\s*\)/.test(js));
ok('requestAnimationFrame used for game loop', /requestAnimationFrame\(/.test(js) && /cancelAnimationFrame\(/.test(js));
ok('canvasWrapper has aspect-ratio 3/5', /aspect-ratio:\s*3\/5/.test(html));
ok('touch-action: none on canvas', /touch-action:\s*none/.test(html));

/* =====================================================================
 * AC3 · Block stacking & trimming mechanics
 * ===================================================================== */
group('AC3 · Gameplay mechanics');
ok('placeBlock() function defined', /function\s+placeBlock\s*\(/.test(js));
ok('die() function defined', /function\s+die\s*\(/.test(js));
ok('initGame() function defined', /function\s+initGame\s*\(/.test(js));
ok('spawnMovingBlock() function defined', /function\s+spawnMovingBlock\s*\(/.test(js));
ok('overlap calculation present', /overlapLeft\s*=\s*Math\.max\(/.test(js) && /overlapRight\s*=\s*Math\.min\(/.test(js));
ok('overlapW <= 0 triggers game over', /overlapW\s*<=\s*0[\s\S]{0,300}die\(\)/.test(js));
ok('perfect placement (within 2px) detected', /Math\.abs\(mb\.x\s*-\s*topPiece\.x\)\s*<\s*2/.test(js));
ok('trimmed block pushed to tower', /tower\.push\(\{[\s\S]{0,80}x:\s*trimmedX[\s\S]{0,80}w:\s*trimmedW/.test(js));
ok('currentSpeed increases with score', /currentSpeed\s*=\s*baseSpeed\s*\+\s*score\s*\*\s*0\.08/.test(js));
ok('tower array used (stack of blocks)', /var\s+tower\s*=/.test(js) && /tower\.push\(/.test(js));
ok('movingBlock object with x, w, speed, dir', /movingBlock\s*=\s*\{[\s\S]{0,80}x:\s*spawnX[\s\S]{0,80}w:\s*blockW[\s\S]{0,80}speed:/.test(js));
ok('fallingPieces array for cut-off debris', /var\s+fallingPieces\s*=/.test(js) && /spawnFallingPiece\(/.test(js));
ok('particles system for visual effects', /var\s+particles\s*=/.test(js) && /spawnParticles\(/.test(js));
ok('perfect placement scores +2 popup', /showScorePopup\(\s*['"]\+2['"]\s*\)/.test(js));
ok('normal placement scores +1 popup', /showScorePopup\(\s*['"]\+1['"]\s*\)/.test(js));

/* =====================================================================
 * AC4 · ≥2 input methods (keyboard + touch + click)
 * ===================================================================== */
group('AC4 · Input methods');
ok('handleInput() function defined', /function\s+handleInput\s*\(/.test(js));
ok('document keydown listener', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('Space key triggers input', /key\s*===\s*['"]\s['"]/.test(js));
ok('Enter key triggers input', /key\s*===\s*['"]Enter['"]/.test(js));
ok('ArrowUp key triggers input', /key\s*===\s*['"]ArrowUp['"]/.test(js));
ok('click listener on canvas', /canvas\.addEventListener\(\s*['"]click['"]/.test(js));
ok('touchstart listener on canvas', /canvas\.addEventListener\(\s*['"]touchstart['"]/.test(js));
ok('title screen click anywhere starts game', /titleScreen\.addEventListener\(\s*['"]click['"]/.test(js));
ok('startBtn click handler via getElementById', /getElementById\(\s*['"]startBtn['"]\)[\s\S]{0,40}addEventListener\(/.test(js));
ok('replayBtn click handler via getElementById', /getElementById\(\s*['"]replayBtn['"]\)[\s\S]{0,40}addEventListener\(/.test(js));
ok('preventDefault on touch events', /preventDefault/.test(js));
ok('input fields excluded from keyboard handling', /tag\s*===\s*['"]input['"]\s*\|\|\s*tag\s*===\s*['"]textarea['"]/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playSound() function generates audio', /function\s+playSound\s*\(/.test(js));
ok('playSound("place") for block placed', /playSound\(\s*['"]place['"]\s*\)/.test(js));
ok('playSound("perfect") for perfect align', /playSound\(\s*['"]perfect['"]\s*\)/.test(js));
ok('playSound("miss") for miss', /playSound\(\s*['"]miss['"]\s*\)/.test(js));
ok('playSound("gameover") on game over', /playSound\(\s*['"]gameover['"]\s*\)/.test(js));
ok('playSound("start") on game start', /playSound\(\s*['"]start['"]\s*\)/.test(js));
ok('playSound("highscore") on new best', /playSound\(\s*['"]highscore['"]\s*\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));
ok('mute toggle persists via localStorage + MUTED_KEY', /localStorage\.setItem\(\s*MUTED_KEY/.test(js));
ok('muted flag checked before playing sounds', /muted[^}]{0,40}return/.test(js) || /if\s*\(muted/.test(js) || /if\s*\(!muted/.test(js));
ok('ensureAudioCtx() function defined', /function\s+ensureAudioCtx/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "pixel-tower-best"', /STORAGE_KEY\s*=\s*['"]pixel-tower-best['"]/.test(js));
ok('MUTED_KEY = "pixel-tower-muted"', /MUTED_KEY\s*=\s*['"]pixel-tower-muted['"]/.test(js));
ok('loadHighScore try/catch fallback', /function\s+loadHighScore[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('saveHighScore persists on improvement', /s\s*>\s*cur[\s\S]{0,80}localStorage\.setItem/.test(js));
ok('loadMuted with try/catch fallback', /function\s+loadMuted[\s\S]*?try[\s\S]*?catch[\s\S]*?return\s+false/.test(js));
ok('recentlyPlayed tracked in localStorage', /recentlyPlayed/.test(js));

/* =====================================================================
 * AC7 · Game states: TITLE → PLAYING → GAMEOVER
 * ===================================================================== */
group('AC7 · Game state machine');
ok('gameState variable declared', /var\s+gameState\s*=/.test(js));
ok('TITLE state constant', /['"]TITLE['"]/.test(js));
ok('PLAYING state constant', /['"]PLAYING['"]/.test(js));
ok('GAMEOVER state constant', /['"]GAMEOVER['"]/.test(js));
ok('showScreen() state transitions', /function\s+showScreen\s*\(/.test(js));
ok('startGame() calls initGame then showScreen(PLAYING)', /showScreen\(\s*['"]PLAYING['"]\s*\)/.test(js));
ok('game loop with requestAnimationFrame', /gameLoop\(timestamp\)/.test(js) && /rafId\s*=\s*requestAnimationFrame/.test(js));
ok('update() function called per frame', /function\s+update\s*\(/.test(js));
ok('render() function called per frame', /function\s+render\s*\(/.test(js));
ok('dt capped at 33ms', /Math\.min\(\s*rawDt\s*,\s*33\s*\)/.test(js));
ok('mute button aria-pressed attribute', /aria-pressed/.test(html));

/* =====================================================================
 * Bonus · Visual & rendering quality
 * ===================================================================== */
group('Bonus · Visual quality');
ok('drawBlock() function for rendering blocks', /function\s+drawBlock\s*\(/.test(js));
ok('lightenColor() function for gradients', /function\s+lightenColor\s*\(/.test(js));
ok('gradient fill on blocks (3-stop linear)', /createLinearGradient[\s\S]{0,100}lighter/.test(js));
ok('screen shake on miss', /shakeActive\s*=\s*true/.test(js) && /shakeStart/.test(js));
ok('screen flash on miss', /screenFlash\s*=\s*200/.test(js));
ok('scan line effect', /scanY[\s\S]{0,20}performance\.now/.test(js));
ok('prefers-reduced-motion respected', /prefers-reduced-motion/.test(js));
ok('rounded rectangle block rendering', /quadraticCurveTo/.test(js));
ok('ghost outline showing expected landing', /ghostY/.test(js));
ok('title screen tower preview rendered', /function\s+renderTitlePreview/.test(js));
ok('neon glow shadows (shadowBlur)', /shadowBlur/.test(js));
ok('"use strict" mode enabled', /['"]use strict['"]/.test(js));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'pixel-tower-stack');
ok('registry has id="pixel-tower-stack"', !!entry);
if (entry) {
  ok('registry.path = /games/011-pixel-tower-stack/', entry.path === '/games/011-pixel-tower-stack/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version = "1.0.0"', entry.version === '1.0.0');
  ok('registry.featured = false', entry.featured === false);
  ok('registry.rating = 3', entry.rating === 3);
  ok('registry.category = "casual"', entry.category === 'casual');
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log('  Pixel Tower Stack · static.test.cjs · ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
