/**
 * Static tests for Memory Match Pairs (Game #68)
 * Checks file existence, HTML structure, and game conventions.
 */
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..');
const files = [
  'index.html',
  'style.css',
  'app.js',
  'thumb.svg'
];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

console.log('\n=== Memory Match Pairs — Static Tests ===\n');

// 1. File existence
console.log('[File Existence]');
files.forEach(f => {
  test(`${f} exists`, () => {
    const full = path.join(GAME_DIR, f);
    if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
    const stat = fs.statSync(full);
    if (stat.size === 0) throw new Error(`File is empty: ${full}`);
  });
});

// 2. HTML structure
console.log('\n[HTML Structure]');
const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf-8');
test('Has DOCTYPE html', () => {
  if (!html.includes('<!DOCTYPE html>')) throw new Error('Missing DOCTYPE');
});
test('Has title', () => {
  if (!/<title>/.test(html)) throw new Error('Missing <title>');
});
test('Has viewport meta', () => {
  if (!/viewport/.test(html)) throw new Error('Missing viewport meta');
});
test('Links to style.css', () => {
  if (!html.includes('style.css')) throw new Error('Missing style.css link');
});
test('Links to app.js', () => {
  if (!html.includes('app.js')) throw new Error('Missing app.js script');
});
test('Has back-to-hub link', () => {
  if (!html.includes('back-to-hub')) throw new Error('Missing back-to-hub link');
});
test('Has game screens (menu, game, result)', () => {
  if (!html.includes('screen-menu')) throw new Error('Missing screen-menu');
  if (!html.includes('screen-game')) throw new Error('Missing screen-game');
  if (!html.includes('screen-result')) throw new Error('Missing screen-result');
});
test('Has card grid', () => {
  if (!html.includes('card-grid')) throw new Error('Missing card grid');
});
test('Has timer HUD', () => {
  if (!html.includes('hud-timer')) throw new Error('Missing timer element');
});
test('Has play button', () => {
  if (!html.includes('btn-play')) throw new Error('Missing play button');
});

// 3. CSS quality
console.log('\n[CSS Quality]');
const css = fs.readFileSync(path.join(GAME_DIR, 'style.css'), 'utf-8');
test('Has card flip animation (perspective)', () => {
  if (!css.includes('perspective')) throw new Error('Missing perspective for 3D flip');
});
test('Has backface-visibility hidden', () => {
  if (!css.includes('backface-visibility: hidden')) throw new Error('Missing backface-visibility');
});
test('Has rotateY for flip', () => {
  if (!css.includes('rotateY')) throw new Error('Missing rotateY transform');
});
test('Has responsive media queries', () => {
  if (!css.includes('@media')) throw new Error('Missing responsive queries');
});
test('Has card matched state', () => {
  if (!css.includes('.card.matched')) throw new Error('Missing .card.matched styles');
});
test('Has spring easing', () => {
  if (!css.includes('cubic-bezier')) throw new Error('Missing custom easing');
});

// 4. JS quality
console.log('\n[JS Quality]');
const js = fs.readFileSync(path.join(GAME_DIR, 'app.js'), 'utf-8');
test('Has Fisher-Yates shuffle', () => {
  if (!js.includes('shuffle')) throw new Error('Missing shuffle function');
});
test('Has state machine', () => {
  if (!js.includes('state.phase')) throw new Error('Missing game state machine');
});
test('Has timer logic', () => {
  if (!js.includes('setInterval')) throw new Error('Missing timer');
});
test('Has localStorage save', () => {
  if (!js.includes('setItem')) throw new Error('Missing localStorage save');
});
test('Has localStorage load', () => {
  if (!js.includes('getItem')) throw new Error('Missing localStorage load');
});
test('Has Web Audio API', () => {
  if (!js.includes('AudioContext')) throw new Error('Missing Audio API');
});
test('Has Vibration API', () => {
  if (!js.includes('vibrate')) throw new Error('Missing Vibration API');
});
test('Has keyboard support', () => {
  if (!js.includes('keydown')) throw new Error('Missing keyboard event');
});
test('Has touch support', () => {
  if (!js.includes('touchstart')) throw new Error('Missing touch event');
});
test('Has theme system', () => {
  if (!js.includes('THEMES')) throw new Error('Missing theme definitions');
});
test('Has unlock progression', () => {
  if (!js.includes('unlockNextTheme')) throw new Error('Missing unlock progression');
});
test('Has win/lose end conditions', () => {
  if (!js.includes('endGame')) throw new Error('Missing endGame function');
});
test('Has match/mismatch handling', () => {
  if (!js.includes('checkMatch') && !js.includes('pairId')) {
    throw new Error('Missing pair matching logic');
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
