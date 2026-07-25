// Basic static validation for Save the Doge game
const fs = require('fs');
const path = require('path');

const dir = path.dirname(__dirname); // games/038-save-the-doge/
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// 1. Check index.html exists and is valid
const htmlPath = path.join(dir, 'index.html');
assert(fs.existsSync(htmlPath), 'index.html exists');

const html = fs.readFileSync(htmlPath, 'utf-8');
assert(html.includes('<!DOCTYPE html>'), 'Has DOCTYPE');
assert(html.includes('<canvas'), 'Has canvas element');
assert(html.includes('Save the Doge'), 'Has game title');
assert(html.includes('画线'), 'Has Chinese description');
assert(html.includes('mousedown'), 'Has mouse input');
assert(html.includes('touchstart'), 'Has touch input');
assert(html.includes('requestAnimationFrame'), 'Uses rAF game loop');
assert(html.includes('localStorage'), 'Uses localStorage for saves');
assert(html.includes('nextBtn') || html.includes('再来一局'), 'Has replay/next button');
assert(html.includes('muteBtn'), 'Has mute button');
assert(html.includes('AudioContext') || html.includes('webkitAudioContext'), 'Has audio support');
assert(html.includes('vibrate') || html.includes('Vibration'), 'Has vibration feedback or reference');

// 2. Check directory structure
assert(fs.existsSync(dir), 'Game directory exists');
assert(fs.statSync(htmlPath).size > 5000, 'index.html > 5KB');

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
