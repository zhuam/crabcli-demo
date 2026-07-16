/**
 * Behavior tests for Memory Match Pairs (Game #68)
 * Code analysis and pattern verification tests.
 */
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..');

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

console.log('\n=== Memory Match Pairs — Behavior Tests ===\n');

// Load source files
const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(GAME_DIR, 'style.css'), 'utf-8');
const js = fs.readFileSync(path.join(GAME_DIR, 'app.js'), 'utf-8');

console.log('[JS Code Quality]');
test('App JS is syntactically valid', () => {
  try {
    new Function(js);
  } catch (e) {
    throw new Error(`Syntax error: ${e.message}`);
  }
});

test('CSS is syntactically valid (no obvious issues)', () => {
  // Check balanced braces
  let braceCount = 0;
  for (const ch of css) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (braceCount < 0) throw new Error('Unbalanced CSS braces: too many closing }');
  }
  if (braceCount !== 0) throw new Error(`Unbalanced CSS braces: ${braceCount} unclosed`);
  // Check for selectors
  if (!css.includes('{')) throw new Error('CSS has no rule blocks');
});

test('Contains THEMES array with 5 themes', () => {
  const themeMatches = js.match(/id:\s*'/g);
  if (!themeMatches || themeMatches.length < 5) {
    throw new Error(`Expected at least 5 theme ids, got ${themeMatches ? themeMatches.length : 0}`);
  }
  // Verify each theme name
  ['经典', '太空之旅', '海洋世界', '美食派对', '奇幻王国'].forEach(name => {
    if (!js.includes(name)) throw new Error(`Missing theme: ${name}`);
  });
});

test('Contains Fisher-Yates shuffle implementation', () => {
  if (!js.includes('Math.floor(Math.random() * (i + 1))')) {
    throw new Error('Missing Fisher-Yates shuffle core');
  }
  if (!js.includes('function shuffle')) {
    throw new Error('Missing shuffle function');
  }
});

test('State machine with all phases', () => {
  if (!js.includes("phase: 'MENU'")) throw new Error("Missing MENU phase");
  if (!js.includes("= 'PLAYING'")) throw new Error("Missing PLAYING phase assignment");
  if (!js.includes('endGame')) throw new Error("Missing endGame function");
  if (!js.includes('isAnimating')) throw new Error("Missing animation lock");
  // Verify animation guard
  if (!js.includes("state.isAnimating")) throw new Error("Animation check guard missing");
  // Verify flip state guard
  if (!js.includes("card.flipped")) throw new Error("Card flipped state guard missing");
  if (!js.includes("card.matched")) throw new Error("Card matched state guard missing");
});

test('Timer implementation present', () => {
  if (!js.includes('setInterval')) throw new Error("Missing timer interval");
  if (!js.includes('clearInterval')) throw new Error("Missing timer cleanup");
  if (!js.includes('timeRemaining')) throw new Error("Missing time tracking");
  // Verify timer stops on game end
  if (!js.includes('stopTimer')) throw new Error("Missing stopTimer function");
});

test('Audio and vibration support', () => {
  if (!js.includes('AudioContext') && !js.includes('webkitAudioContext')) {
    throw new Error("Missing Audio Web API");
  }
  if (!js.includes('navigator.vibrate')) throw new Error("Missing Vibration API");
  // Check each audio function
  ['playFlip', 'playMatch', 'playMismatch', 'playWin', 'playLose', 'playTick'].forEach(fn => {
    if (!js.includes(`function ${fn}`)) throw new Error(`Missing audio function: ${fn}`);
  });
});

test('localStorage persistence with error handling', () => {
  if (!js.includes('setItem')) throw new Error("Missing localStorage write");
  if (!js.includes('getItem')) throw new Error("Missing localStorage read");
  if (!js.includes('try') && !js.includes('catch')) throw new Error("Missing error handling for storage");
  if (!js.includes('safeStorage')) throw new Error("Missing safe storage wrapper");
  // Check storage keys
  ['mm_best_time', 'mm_games_won', 'mm_unlocked_themes', 'mm_current_theme', 'mm_sound_enabled'].forEach(key => {
    if (!js.includes(key)) throw new Error(`Missing storage key: ${key}`);
  });
});

test('Keyboard accessibility', () => {
  if (!js.includes('keydown')) throw new Error("Missing keydown event listener");
  if (!js.includes('key ===') && !js.includes("key ===")) {
    throw new Error("Missing keyboard key check");
  }
  if (!js.includes('tabindex')) throw new Error("Missing tabindex for focus");
  if (!js.includes('Enter') && !js.includes("Space")) {
    throw new Error("Missing Enter/Space keyboard support");
  }
});

test('Touch device support', () => {
  if (!js.includes('touchstart')) throw new Error("Missing touch event");
  if (!css.includes('touch-action: manipulation') && !html.includes('touch-action')) throw new Error("Missing touch-action CSS");
  if (!html.includes('user-scalable=no')) throw new Error("Missing user-scalable=no");
});

test('DOM event binding after content loaded', () => {
  if (!js.includes('DOMContentLoaded')) throw new Error("Missing DOMContentLoaded init");
});

console.log('\n[Game Logic Verification]');
test('Match check uses pairId comparison', () => {
  if (!js.includes('pairId')) throw new Error("Missing pairId matching logic");
  if (!js.includes('state.cards[first].pairId === state.cards[second].pairId')) {
    throw new Error("Missing pair comparison");
  }
});

test('Win condition when all pairs matched', () => {
  if (!js.includes('state.matchedPairs === state.totalPairs')) {
    throw new Error("Missing win condition check");
  }
});

test('Lose condition when time expires', () => {
  if (!js.includes('timeRemaining <= 0')) throw new Error("Missing lose condition");
});

test('Theme unlock progression system', () => {
  if (!js.includes('unlockNextTheme')) throw new Error("Missing unlock progression");
  if (!js.includes('unlockCondition')) throw new Error("Missing unlock conditions");
  // Check unlock conditions text
  ['通关 1 次', '通关 2 次', '胜利 5 次'].forEach(cond => {
    if (!js.includes(cond)) throw new Error(`Missing unlock condition: ${cond}`);
  });
});

test('Result screen has Play Again and menu buttons', () => {
  if (!js.includes('btn-play-again-result')) throw new Error("Missing play again button");
  if (!js.includes('btn-menu-result')) throw new Error("Missing menu button");
});

test('Start game resets state properly', () => {
  if (!js.includes('function startGame')) throw new Error("Missing startGame function");
  if (!js.includes("state.phase = 'PLAYING'")) throw new Error("Phase not reset to PLAYING");
  if (!js.includes("state.matchedPairs = 0")) throw new Error("Matched pairs not reset");
  if (!js.includes("state.attempts = 0")) throw new Error("Attempts not reset");
  if (!js.includes("state.isAnimating = false")) throw new Error("Animation lock not reset");
});

console.log('\n[HTML/CSS Structure]');
test('Cards use CSS 3D transform', () => {
  if (!css.includes('rotateY')) throw new Error("Missing rotateY transform");
  if (!css.includes('perspective')) throw new Error("Missing perspective property");
  if (!css.includes('backface-visibility')) throw new Error("Missing backface-visibility");
  if (!css.includes('transform-style: preserve-3d')) throw new Error("Missing preserve-3d");
});

test('Responsive design', () => {
  if (!css.includes('@media')) throw new Error("Missing media queries");
  if (!css.includes('max-width')) throw new Error("Missing max-width responsive");
});

test('Visual feedback states', () => {
  if (!css.includes('.card.matched')) throw new Error("Missing matched state");
  if (!css.includes('card.flipped .card-inner')) throw new Error("Missing flipped state trigger");
  if (!css.includes('@keyframes')) throw new Error("Missing CSS animations");
  if (!css.includes('matchPulse') || !css.includes('shake')) {
    throw new Error("Missing match/mismatch animations");
  }
});

test('HUD elements have proper styling', () => {
  if (!css.includes('.game-hud')) throw new Error("Missing game HUD styles");
  if (!css.includes('.hud-timer')) throw new Error("Missing timer styles");
  if (!css.includes('.hud-timer.warning')) throw new Error("Missing timer warning state");
  if (!css.includes('.progress-fill')) throw new Error("Missing progress bar styles");
});

test('Theme selector with locked state', () => {
  if (!css.includes('.theme-chip')) throw new Error("Missing theme chip styles");
  if (!css.includes('.theme-chip.active')) throw new Error("Missing active theme state");
  if (!css.includes('.theme-chip.locked')) throw new Error("Missing locked theme state");
});

test('Settings panel has hidden state', () => {
  if (!html.includes('settings-panel')) throw new Error("Missing settings panel");
  if (!css.includes('.settings-panel.hidden')) throw new Error("Missing hidden state for settings");
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
