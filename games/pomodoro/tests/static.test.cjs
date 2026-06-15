#!/usr/bin/env node
/**
 * Static smoke tests for Pomodoro 25-minute focus timer.
 * Run: node tests/static.test.cjs
 * Pure Node — no jsdom. Regex + light HTML/CSS parsing.
 *
 * Asserts the contract that the behavior tests then exercise dynamically:
 *   - 25 * 60 * 1000 ms total
 *   - 4-state machine: idle | running | paused | done
 *   - Three required action surfaces: Start, Pause/Resume, Reset
 *   - Audio-on-completion + aria-live announcement (hard completion signal)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// ================================================================
group('AC · Files & boot');
// ================================================================
ok('index.html exists',  html.length > 200);
ok('app.js exists',      js.length   > 500);
ok('style.css exists',   css.length  > 200);
ok('README.md exists',   readme.length > 100);
ok('<html lang=...> set', /<html\s+lang=/.test(html));
ok('viewport meta present', /name="viewport"/.test(html));
ok('app.js linked from index.html', /<script[^>]+app\.js/.test(html));
ok('style.css linked from index.html', /<link[^>]+style\.css/.test(html));

// ================================================================
group('AC1 · Required DOM hooks (data attributes used by app.js)');
// ================================================================
const requiredDataAttrs = [
  'data-comp-id="stage"',
  'data-mm',
  'data-ss',
  'data-comp-id="status-subline"',
  'data-status-label',
  'data-progress-bar',
  'data-action="primary"',
  'data-action="reset"',
  'data-session-count',
  'data-live-region',
  'data-comp-id="btn-sound"',
  'data-comp-id="btn-theme"',
];
for (const a of requiredDataAttrs) {
  ok(`${a} present in index.html`, html.indexOf(a) !== -1);
}

// ================================================================
group('AC2 · 25-minute total & state machine constants');
// ================================================================
ok('TOTAL_MS = 25 * 60 * 1000',           /TOTAL_MS\s*=\s*25\s*\*\s*60\s*\*\s*1000/.test(js));
ok('all 4 states defined: idle',          /['"]idle['"]/.test(js));
ok('all 4 states defined: running',       /['"]running['"]/.test(js));
ok('all 4 states defined: paused',        /['"]paused['"]/.test(js));
ok('all 4 states defined: done',          /['"]done['"]/.test(js));
ok('setState() switch covers all 4',      /case\s+['"]idle['"]/.test(js)
                                          && /case\s+['"]running['"]/.test(js)
                                          && /case\s+['"]paused['"]/.test(js)
                                          && /case\s+['"]done['"]/.test(js));

// ================================================================
group('AC3 · Three core actions: Start / Pause / Reset');
// ================================================================
ok('start() function defined',  /function\s+start\s*\(/.test(js));
ok('pause() function defined',  /function\s+pause\s*\(/.test(js));
ok('reset() function defined',  /function\s+reset\s*\(/.test(js));
ok('finish() function defined', /function\s+finish\s*\(/.test(js));
ok('btnMain toggles start/pause', /btnMain\.addEventListener\([^)]*\)/.test(js)
                                  && /state\s*===\s*['"]running['"]\s*\)\s*pause\(\)/.test(js));
ok('btnReset wired to reset()',   /btnReset\.addEventListener\([^)]*\)[\s\S]{0,80}reset\(/.test(js));

// ================================================================
group('AC4 · Wall-clock timing (drift-resistant)');
// ================================================================
ok('start uses Date.now() + remaining',   /endTime\s*=\s*Date\.now\(\)\s*\+\s*remaining/.test(js));
ok('pause caches remaining = endTime-now', /remaining\s*=\s*Math\.max\(0,\s*endTime\s*-\s*Date\.now\(\)\)/.test(js));
ok('loop drives via requestAnimationFrame', /requestAnimationFrame\(loop\)/.test(js));
ok('loop calls finish() when left<=0',     /left\s*<=\s*0[\s\S]{0,40}finish\(\)/.test(js));

// ================================================================
group('AC5 · Completion signals (visible + audible + a11y)');
// ================================================================
ok('finish() sets state=done',                /setState\(['"]done['"]\)/.test(js));
ok('finish() adds is-done class for visual',  /classList\.add\(['"]is-done['"]\)/.test(js));
ok('finish() updates document.title',         /document\.title\s*=\s*['"]✓\s*Done/.test(js));
ok('finish() sets aria-live announcement',    /live\.textContent\s*=\s*['"]Pomodoro complete/i.test(js));
ok('finish() calls beep()',                   /finish\s*\([\s\S]*?beep\(\)/.test(js));
ok('beep() uses Web Audio AudioContext',      /AudioContext|webkitAudioContext/.test(js));
ok('CSS has .is-done rule (visual cue)',      /\.is-done\b/.test(css));
ok('aria-live element in DOM',                /aria-live=/.test(html));

// ================================================================
group('AC6 · Reset semantics — back to 25:00 / idle');
// ================================================================
ok('reset() restores remaining = TOTAL_MS', /remaining\s*=\s*TOTAL_MS/.test(js));
ok('reset() sets state idle',               /function\s+reset[\s\S]{0,400}setState\(['"]idle['"]\)/.test(js));
ok('reset() clears is-done class',          /reset[\s\S]{0,200}classList\.remove\(['"]is-done['"]\)/.test(js));
ok('reset() restores document.title',       /reset[\s\S]{0,200}document\.title\s*=\s*baseTitle/.test(js));
ok('reset() cancels rAF if running',        /reset[\s\S]{0,200}cancelAnimationFrame/.test(js));

// ================================================================
group('AC7 · Keyboard shortcuts (Space=toggle, R=reset)');
// ================================================================
ok('keydown handler present', /addEventListener\(\s*['"]keydown['"]/.test(js));
ok('Space toggles start/pause', /e\.code\s*===\s*['"]Space['"]/.test(js));
ok('R triggers reset',          /e\.key\s*===\s*['"]r['"]\s*\|\|\s*e\.key\s*===\s*['"]R['"]/.test(js));
ok('input/textarea guard',      /tagName\s*===\s*['"]INPUT['"]/.test(js));

// ================================================================
group('AC8 · README content');
// ================================================================
ok('README mentions 25 minutes',     /25\s*(?:分钟|minute|min)/i.test(readme));
ok('README mentions Start/开始',     /(start|开始)/i.test(readme));
ok('README mentions Pause/暂停',     /(pause|暂停)/i.test(readme));
ok('README mentions Reset/重置',     /(reset|重置)/i.test(readme));

// ================================================================
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
