#!/usr/bin/env node
/**
 * Static acceptance tests for Word Ladder Climb (Issue #96).
 * Run: node games/096-word-ladder-climb/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('{', m.index), depth = 1, end = i + 1;
  while (depth && end < js.length) {
    if (js[end] === '{') depth++;
    if (js[end] === '}') depth--;
    end++;
  }
  return js.slice(m.index, end);
}

group('AC1 - first screen playable, no tutorial gate');
ok('direct game UI is present', /id="guessInput"/.test(html) && /id="guessForm"/.test(html) && /id="ladderTrack"/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('script boots immediately', /<script src="app\.js"><\/script>/.test(html) && /restartGame\(false/.test(js));
ok('static local theme data embedded', /THEMES:\s*\[/.test(js) && /sky-camp/.test(js));

group('AC2 - round length <= 3 minutes');
ok('CONFIG.MAX_GAME_SEC = 180', /MAX_GAME_SEC:\s*180\b/.test(js));
ok('timer checks gameSec against cap', /gameSec\(\)\s*>=\s*CONFIG\.MAX_GAME_SEC/.test(js));
ok('failure path exists for timeout', /finishGame\(['"]failed['"],[\s\S]{0,120}时间归零/.test(js));

group('AC3 - at least two input modes');
ok('keyboard form submit validates guess', /guessForm\.addEventListener\(['"]submit['"][\s\S]{0,120}submitGuess\(\)/.test(js));
ok('text input keydown handles keyboard editing', /guessInput\.addEventListener\(['"]keydown['"]/.test(js) && /Escape/.test(js));
ok('pointer/touch slot controls exist', /slotRow/.test(html) && /addEventListener\(['"]pointerdown['"],[\s\S]{0,120}activeSlot/.test(js));
ok('pointer/touch virtual keyboard exists', /keyboardRow/.test(html) && /addEventListener\(['"]pointerdown['"],[\s\S]{0,80}setSlotLetter/.test(js));
ok('touch-action manipulation in CSS', /touch-action:\s*manipulation/.test(css));

group('AC4 - win/fail settlement and restart');
ok('result modal is a dialog and hidden on boot', /id="resultModal"[^>]*role="dialog"[\s\S]{0,120}hidden/.test(html));
ok('clear 再来一局 button exists', /id="restartBtn"[\s\S]{0,120}再来一局/.test(html));
ok('restart button click restarts game', /restartBtn\.addEventListener\(['"]click['"],[\s\S]{0,80}restartGame\(false\)/.test(js));
ok('victory triggered by target word', /result\.guess\s*===\s*theme\.target/.test(js) && /Summit reached/.test(js));
ok('failure triggered by timer', /Climb failed/.test(js));
ok('restart touch target >= 60px and focus style', /\.restart-btn\s*\{[^}]*min-height:\s*60px/.test(css) && /restart-btn:focus-visible/.test(css));

group('AC5 - audio and vibration feedback');
ok('WebAudio with webkit fallback used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audio resumes suspended context', /audioCtx\.state\s*===\s*['"]suspended['"][\s\S]{0,60}audioCtx\.resume/.test(js));
ok('valid/invalid/win/fail SFX functions exist', /function\s+sfxValid/.test(js) && /function\s+sfxInvalid/.test(js) && /function\s+sfxWin/.test(js) && /function\s+sfxFail/.test(js));
ok('valid submit triggers sfx and haptic', /sfxValid\(\)[\s\S]{0,80}vibrate\(18\)/.test(js));
ok('invalid submit triggers sfx and haptic pattern', /sfxInvalid\(\)[\s\S]{0,80}vibrate\(\[35, 25, 35\]\)/.test(js));
ok('win/fail trigger distinct audio and vibration', /won \? sfxWin\(\) : sfxFail\(\)/.test(js) && /won \? \[60, 35, 90\] : \[120, 50, 120\]/.test(js));
ok('navigator.vibrate guarded with try/catch', /if \(navigator\.vibrate\)/.test(js) && /try \{ navigator\.vibrate\(pattern\); \} catch/.test(js));
ok('mute setting persisted', /LS\.SETTINGS/.test(js) && /lsSet\(LS\.SETTINGS, state\.settings\)/.test(js));

group('AC6 - localStorage best score on win/fail');
ok('best score key is game-specific', /BEST:\s*['"]word_ladder_climb_best['"]/.test(js));
ok('safe JSON localStorage helpers exist', /function\s+lsGet[\s\S]{0,160}JSON\.parse/.test(js) && /function\s+lsSet[\s\S]{0,160}JSON\.stringify/.test(js));
ok('best schema covers score, time, steps, played, wins', /bestScore/.test(js) && /fastestSec/.test(js) && /fewestSteps/.test(js) && /gamesPlayed/.test(js) && /wins/.test(js));
ok('finishGame updates and persists best for all outcomes', /finishGame[\s\S]{0,500}updateBest\(finalScore\)/.test(js) && /lsSet\(LS\.BEST, best\)/.test(js));

group('Word ladder validation logic');
const normalizeSrc = extractFunction('normalizeWord');
const diffSrc = extractFunction('diffCount');
const validateSrc = extractFunction('validateGuess');
ok('validation helpers extractable', normalizeSrc && diffSrc && validateSrc);
if (normalizeSrc && diffSrc && validateSrc) {
  const ctx = { String, Math };
  vm.createContext(ctx);
  vm.runInContext(`${normalizeSrc}\n${diffSrc}\n${validateSrc}`, ctx);
  const theme = { words: ['pace', 'pack', 'peck', 'peek', 'peak'] };
  ok('accepts exactly one-letter dictionary word', ctx.validateGuess('PACK', 'pace', theme, ['pace']).ok === true);
  ok('rejects same word', ctx.validateGuess('pace', 'pace', theme, ['pace']).ok === false);
  ok('rejects multi-letter jump', ctx.validateGuess('peek', 'pace', theme, ['pace']).ok === false);
  ok('rejects missing dictionary word', ctx.validateGuess('pane', 'pace', theme, ['pace']).ok === false);
  ok('rejects duplicate used word', ctx.validateGuess('pack', 'pace', theme, ['pace', 'pack']).reason.includes('Already used'));
}

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'word-ladder-climb');
ok('registry contains word-ladder-climb', !!entry);
ok('registry path points at 096 directory', entry && entry.path === '/games/096-word-ladder-climb/');
ok('registry category is puzzle', entry && entry.category === 'puzzle');

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
