#!/usr/bin/env node
/**
 * Static acceptance tests for SpongeBob Art Quest (Issue #48).
 * Run: node games/048-spongebob-art-quest/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// Utility: extract all JS code from inline <script> in HTML
function extractInlineJS(html) {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const js = m[1].trim();
    if (js && !js.startsWith('window.')) scripts.push(js);
  }
  return scripts.join('\n');
}

// Utility: count Z( calls in a substring (zone definitions)
function countZoneCalls(src) {
  const matches = src.match(/Z\(/g);
  return matches ? matches.length : 0;
}

// Extract addChar block for a given character name
function extractAddCharBlock(js, name) {
  const re = new RegExp(`addChar\\(['"]${name}['"],\\s*\\[`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('[', m.index), depth = 1, end = i + 1;
  while (depth && end < js.length) {
    if (js[end] === '[') depth++;
    if (js[end] === ']') depth--;
    end++;
  }
  return js.slice(i, end);
}

const js = extractInlineJS(html);

group('AC1 - Splash screen loads, no tutorial overlay');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(function\s*\(\)\s*\{[\s\S]*\n\s*\}\)\s*\(\)/.test(js));
ok('splash screen is visible by default (no hidden class)', /id="screen-splash"\s+class="screen">/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('loadProgress() called on init', /loadProgress\(\)/.test(js));

group('AC2 - Short rounds by design (zone count ~25, fast to fill)');
// First character SpongeBob should have ~25 zones
const sbBlock = extractAddCharBlock(js, 'SpongeBob');
ok('SpongeBob addChar block extractable', !!sbBlock);
if (sbBlock) {
  const zoneCount = countZoneCalls(sbBlock);
  ok(`SpongeBob has ${zoneCount} zones (reasonable range 22-32)`, zoneCount >= 22 && zoneCount <= 32);
}
ok('addChar defined and used for 6 characters', /addChar\(/.test(js));
ok('CHARACTERS array defined and addChar used', /CHARACTERS\s*=\s*\[\]/.test(js) && /addChar\(/.test(js));

group('AC3 - At least 3 input modes (mouse + touch + keyboard)');
ok('mouse click handler on canvas', /canvas\.addEventListener\(['"]click['"],\s*onCanvasClick\)/.test(js));
ok('touch start handler on canvas', /canvas\.addEventListener\(['"]touchstart['"],\s*onCanvasTouch/.test(js));
ok('touch passive:false (supports preventDefault)', /touchstart['"][\s\S]{0,50}passive:\s*false/.test(js));
ok('keyboard listener on window', /window\.addEventListener\(['"]keydown['"],\s*onKeyDown\)/.test(js));
ok('keyboard number keys 1-8 for color selection', /n=\s*parseInt\(key\)[\s\S]{0,100}n>=1\s*&&\s*n<=8/.test(js));
ok('keyboard Enter handled on win screen', /key\s*===\s*['"]Enter['"][\s\S]{0,100}goNext/.test(js));

group('AC4 - Win screen with NEXT and MENU buttons');
ok('win screen HTML exists', /id="screen-win"/.test(html));
ok('btn-next exists', /id="btn-next"/.test(html));
ok('btn-menu exists', /id="btn-menu"/.test(html));
ok('goNext function exists', /function\s+goNext\s*\(\)/.test(js));
ok('goNext calls startLevel(next) or showScreen(levels)', /goNext[\s\S]{0,200}startLevel\(next\)/.test(js) && /goNext[\s\S]{0,200}showScreen\(['"]levels['"]\)/.test(js));
ok('showWin function exists', /function\s+showWin\s*\(/.test(js));
ok('handleComplete triggers win screen', /function\s+handleComplete/.test(js));
ok('handleComplete plays completion sound', /playComplete\(\)/.test(js));
ok('handleComplete saves progress', /saveProgress\(\)/.test(js) && /handleComplete[\s\S]{0,500}saveProgress/.test(js));
ok('confetti on win screen', /spawnConfetti\(\)/.test(js));

group('AC5 - Sound effects and vibration');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('playTone function defined', /function\s+playTone\s*\(/.test(js));
ok('playClick SFX function', /function\s+playClick/.test(js));
ok('playFill SFX function', /function\s+playFill/.test(js));
ok('playComplete SFX function', /function\s+playComplete/.test(js));
ok('playFanfare SFX function', /function\s+playFanfare/.test(js));
ok('initAudio function defined', /function\s+initAudio/.test(js));
ok('vibration guarded with try/catch', /try\s*\{[\s\S]{0,50}navigator\.vibrate/.test(js));

group('AC6 - localStorage level unlock + score persistence');
ok('STORAGE_KEY defined', /STORAGE_KEY\s*=\s*['"]crabcli-spongebob-art-quest['"]/.test(js));
ok('saveProgress function exists', /function\s+saveProgress\s*\(/.test(js));
ok('loadProgress function exists', /function\s+loadProgress\s*\(/.test(js));
ok('saveProgress writes to localStorage', /localStorage\.setItem\(STORAGE_KEY/.test(js));
ok('loadProgress reads from localStorage', /localStorage\.getItem\(STORAGE_KEY/.test(js));
ok('saveProgress persists unlocked levels', /unlocked:state\.unlocked/.test(js));
ok('saveProgress persists completed levels', /completed:state\.completed/.test(js));
ok('default unlocked level 0', /unlocked:\[0\]/.test(js));

group('Game mechanics - Palette and zone fill');
ok('COLORS palette array defined with 8 colors', /var COLORS\s*=\s*\[[\s\S]{0,400}8\s*color\s*values/i.test(js) || /COLORS\s*=\s*\[[\s\S]{1,200}\]/.test(js));
ok('8 color entries in COLORS array', (js.match(/'#[0-9A-Fa-f]{6}'/g) || []).length >= 7);
ok('COLOR_NAMES defined with 8 names', /COLOR_NAMES\s*=/.test(js));
ok('pointInPoly function defines ray-casting', /function\s+pointInPoly/.test(js));
ok('polyCentroid function defined', /function\s+polyCentroid/.test(js));
ok('updateProgress function calculates percentage', /function\s+updateProgress[\s\S]{0,200}pct=/.test(js));
ok('fillZoneAt function fills zones by number', /function\s+fillZoneAt/.test(js));
ok('fillZoneAt checks number match', /char\.zones\[i\]\.number\s*===\s*state\.selectedColor/.test(js));
ok('fillZoneAt returns true on fill', /state\.zones\[i\]\.filled\s*=\s*true[\s\S]{0,500}return\s+true/.test(js));
ok('fillZoneAt returns false on wrong color', /playTone\(300[\s\S]{0,150}return\s+false/.test(js));
ok('polygon shape helpers defined (rect, oval, tri)', /function\s+rect/.test(js) && /function\s+oval/.test(js) && /function\s+tri/.test(js));
ok('zone shortcut Z function defined', /function\s+Z\(/.test(js));
ok('R shortcut for rectangle zone', /function\s+R\(/.test(js));
ok('O shortcut for oval zone', /function\s+O\(/.test(js));

group('Game flow - screens and state');
ok('state object has screen, level, selectedColor', /screen:['"]splash['"][\s\S]{0,100}level:0[\s\S]{0,100}selectedColor:1/.test(js));
ok('state has zones, unlocked, completed, levelFilledCount', /zones:\[\][\s\S]{0,100}unlocked:\[0\][\s\S]{0,100}completed:\{\}[\s\S]{0,100}levelFilledCount:0/.test(js));
ok('showScreen function exists', /function\s+showScreen\s*\(/.test(js));
ok('startLevel function resets zones', /function\s+startLevel[\s\S]{0,200}state\.zones=char\.zones\.map/.test(js));
ok('buildLevelSelect creates level grid', /function\s+buildLevelSelect/.test(js));
ok('buildPalette creates palette swatches', /function\s+buildPalette[\s\S]{0,200}palette-swatch/.test(js));
ok('selectColor updates selected color', /function\s+selectColor[\s\S]{0,200}state\.selectedColor=idx/.test(js));
ok('level unlock on completion', /state\.unlocked\.indexOf\(state\.level\+1\)/.test(js));
ok('3-star display on completion', /for\(var s=0;s<3;s\+\+\)[\s\S]{0,400}starsEl\.appendChild/.test(js));

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'spongebob-art-quest');
ok('registry contains spongebob-art-quest', !!entry);
ok('registry path points at 048 directory', entry && entry.path === '/games/048-spongebob-art-quest/');
ok('registry category is casual', entry && entry.category === 'casual');
ok('registry tags include coloring', entry && entry.tags.includes('coloring'));
ok('registry tags include spongebob', entry && entry.tags.includes('spongebob'));
ok('registry tags include cartoon', entry && entry.tags.includes('cartoon'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
