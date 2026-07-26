#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n');

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

group('AC1 · DOM & title screen');
const ids = ['titleScreen','editorScreen','galleryScreen','pixelCanvas','startBtn','muteBtn','ariaLive','toolbar','backToEditorBtn'];
ids.forEach(id => ok(`#${id} present`, new RegExp(`id=["']${id}["']`).test(html)));
ok('viewport no zoom', /maximum-scale=1/.test(html));
ok('lang zh-CN', /lang=["']zh-CN["']/.test(html));
ok('game-frame.css', /game-frame\.css/.test(html));
ok('title active initially', /id="titleScreen"[^>]*class="[^"]*active/.test(html));
ok('aria-live region', /aria-live=["']polite["']/.test(html));
ok('back-to-hub link', /back-to-hub/.test(html));
ok('canvas element', /<canvas/.test(html));

group('AC2 · Grid & canvas');
ok('CANVAS_SIZE=320', /CANVAS_SIZE\s*=\s*320/.test(js));
ok('GRID_SIZE=16', /GRID_SIZE\s*=\s*16/.test(js));
ok('CELL_SIZE computed', /CELL_SIZE/.test(js));
ok('ctx.getContext("2d")', /getContext\(["']2d["']\)/.test(js));
ok('initGrid() function', /function\s+initGrid/.test(js));
ok('draw() function', /function\s+draw\b/.test(js));
ok('16x16 palette defined', /PALETTE\s*=/.test(js) && (js.match(/hex:/g) || []).length >= 12);
ok('image-rendering: pixelated', /pixelated/.test(html));

group('AC3 · Drawing mechanics');
ok('getCell() coordinate lookup', /function\s+getCell/.test(js));
ok('placeColor() function', /function\s+placeColor/.test(js));
ok('Paint on drag (mousedown+move)', /isDrawing/.test(js));
ok('Eraser toggle', /isErasing/.test(js));
ok('clearCanvas() function', /function\s+clearCanvas/.test(js));

group('AC4 · Input methods');
ok('mousedown handler', /mousedown/.test(js) && /getCell/.test(js));
ok('mousemove handler', /mousemove/.test(js));
ok('mouseup handler', /mouseup/.test(js));
ok('touchstart handler', /touchstart/.test(js));
ok('touchmove handler', /touchmove/.test(js));
ok('touchend handler', /touchend/.test(js));
ok('keyboard number palette select', /parseInt\(e\.key\)/.test(js));
ok('E key eraser shortcut', /key\s*===?\s*["']e["']/.test(js));
ok('C key clear shortcut', /key\s*===?\s*["']c["']/.test(js));
ok('preventDefault on touch', /preventDefault/.test(js));

group('AC5 · Audio');
ok('AudioContext used', /AudioContext/.test(js));
ok('audioCtx.resume', /audioCtx\.resume/.test(js));
ok('playSound() defined', /function\s+playSound/.test(js));
ok('playSound("place")', /playSound\(["']place["']\)/.test(js));
ok('playSound("erase")', /playSound\(["']erase["']\)/.test(js));
ok('playSound("save")', /playSound\(["']save["']\)/.test(js));
ok('playSound("clear")', /playSound\(["']clear["']\)/.test(js));
ok('mute toggle persisting', /MUTED_KEY/.test(js) && /localStorage\.setItem\(/.test(js));
ok('muted check before play', /if\s*\(muted\)/.test(js));

group('AC6 · localStorage gallery');
ok('STORAGE_KEY="block-bliss-gallery"', /STORAGE_KEY\s*=\s*['"]block-bliss-gallery['"]/.test(js));
ok('loadGallery() try/catch', /loadGallery[\s\S]*localStorage[\s\S]*catch/.test(js));
ok('saveGallery() function', /function\s+saveGallery/.test(js));
ok('saveArtwork() with prompt', /function\s+saveArtwork/.test(js));
ok('Gallery display with load/save', /showGallery/.test(js));

group('AC7 · UI States');
ok('Screen switching via showScreen', /function\s+showScreen/.test(js));
ok('Title → Editor transition', /startEditor/.test(js));
ok('Gallery view', /galleryScreen/.test(js));
ok('Color swatch selection', /selectPalette/.test(js));
ok('Toolbar built dynamically', /buildToolbar/.test(js));
ok('Keyboard shortcuts: Space/Enter start', /key\s*===?\s*["']\s["']|key\s*===?\s*["']Enter["']/.test(js));
ok('Escape returns from gallery', /key\s*===?\s*["']Escape["']/.test(js));
ok('"use strict" mode', /["']use strict["']/.test(js));

group('Registry');
try {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
  const g = (reg.games || []).find(x => x.id === 'block-bliss');
  if (g) {
    ok('registry id="block-bliss"', true);
    ok('registry.path = /games/021-block-bliss/', g.path === '/games/021-block-bliss/');
    ok('players="1"', g.players === '1');
    ok('featured=false', g.featured === false);
    ok('thumbnail set', !!g.thumbnail);
  } else {
    ok('registry entry exists', false, 'block-bliss not found');
  }
} catch(e) { ok('registry readable', false, e.message); }

console.log('\n' + '='.repeat(56));
console.log(`  Block Bliss · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
process.exit(fail > 0 ? 1 : 0);
