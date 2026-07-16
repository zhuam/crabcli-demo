/* ============================================================
   Memory Match Pairs — Game Logic
   State machine: MENU → PLAYING → WIN/LOSE → MENU
   ============================================================ */

'use strict';

// ─── THEME DEFINITIONS ───
const THEMES = [
  {
    id: 'classic',
    name: '经典',
    icon: '🎯',
    emoji: ['🎈','🌟','🎵','🎨','🦋','🌺','🐱','🍀'],
    cardBack: 'linear-gradient(145deg, #3a2a5c, #2a1a4a)',
    unlocked: true,
    unlockCondition: '初始解锁'
  },
  {
    id: 'space',
    name: '太空之旅',
    icon: '🚀',
    emoji: ['🚀','🌍','⭐','🌙','🛸','☄️','👾','🛰️'],
    cardBack: 'linear-gradient(145deg, #1a1a3e, #0d0d2b)',
    unlocked: false,
    unlockCondition: '通关 1 次'
  },
  {
    id: 'ocean',
    name: '海洋世界',
    icon: '🌊',
    emoji: ['🐠','🐙','🦈','🐬','🐳','🦀','🐡','🐟'],
    cardBack: 'linear-gradient(145deg, #0d3b4f, #092433)',
    unlocked: false,
    unlockCondition: '通关 2 次'
  },
  {
    id: 'food',
    name: '美食派对',
    icon: '🍕',
    emoji: ['🍕','🍔','🌮','🍩','🍪','🍰','🥨','🍉'],
    cardBack: 'linear-gradient(145deg, #4a2a1a, #2a1a0a)',
    unlocked: false,
    unlockCondition: '胜利 5 次'
  },
  {
    id: 'fantasy',
    name: '奇幻王国',
    icon: '🏰',
    emoji: ['🐉','🦄','🧙‍♂️','👸','🏰','⚔️','🛡️','🧝'],
    cardBack: 'linear-gradient(145deg, #3a2a1a, #2a1a0a)',
    unlocked: false,
    unlockCondition: '全部通关'
  }
];

// ─── CONSTANTS ───
const CONFIG = {
  gridRows: 4,
  gridCols: 4,
  pairs: 8,
  timeLimit: 90,
  flipDuration: 300,
  mismatchViewDuration: 600,
  matchAnimDuration: 500
};

const STORAGE_KEYS = {
  bestScore: 'mm_best_time',
  lastScore: 'mm_last_score',
  gamesPlayed: 'mm_games_played',
  gamesWon: 'mm_games_won',
  unlockedThemes: 'mm_unlocked_themes',
  currentTheme: 'mm_current_theme',
  soundEnabled: 'mm_sound_enabled',
  vibrationEnabled: 'mm_vibration_enabled'
};

// ─── STORAGE ───
function safeStorage() {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch (_) {
    return null;
  }
}

function loadData(key, fallback) {
  const store = safeStorage();
  if (!store) return fallback;
  try {
    const val = store.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch (_) { return fallback; }
}

function saveData(key, value) {
  const store = safeStorage();
  if (!store) return;
  try { store.setItem(key, JSON.stringify(value)); } catch (_) {}
}

// ─── AUDIO (Web Audio API) ───
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function isSoundEnabled() {
  return loadData(STORAGE_KEYS.soundEnabled, true);
}

function playTone(frequency, duration, type, volume) {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playFlip() {
  playTone(800, 0.08, 'sine', 0.1);
}

function playMatch() {
  playTone(523, 0.12, 'sine', 0.12);
  setTimeout(() => playTone(659, 0.12, 'sine', 0.12), 80);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 160);
}

function playMismatch() {
  playTone(220, 0.18, 'square', 0.08);
}

function playWin() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, 'sine', 0.12), i * 150);
  });
}

function playLose() {
  const notes = [400, 350, 300, 250];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, 'sine', 0.1), i * 150);
  });
}

function playTick() {
  playTone(1000, 0.04, 'sine', 0.06);
}

// ─── VIBRATION ───
function isVibrationEnabled() {
  return loadData(STORAGE_KEYS.vibrationEnabled, true);
}

function vibrate(pattern) {
  if (!navigator.vibrate || !isVibrationEnabled()) return;
  try { navigator.vibrate(pattern); } catch (_) {}
}

// ─── SHUFFLE (Fisher-Yates) ───
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── GAME STATE ───
const state = {
  phase: 'MENU',       // MENU | PLAYING | WIN | LOSE
  subPhase: 'IDLE',    // IDLE | FLIP_FIRST | WAITING_SECOND | CHECKING
  cards: [],
  flipped: [],         // [firstIdx, secondIdx]
  matchedPairs: 0,
  totalPairs: CONFIG.pairs,
  attempts: 0,
  timeRemaining: CONFIG.timeLimit,
  timerId: null,
  currentThemeIndex: 0,
  isAnimating: false
};

// ─── DOM REFS ───
let dom = {};

function initDOM() {
  dom = {
    screenMenu: document.getElementById('screen-menu'),
    screenGame: document.getElementById('screen-game'),
    screenResult: document.getElementById('screen-result'),
    cardGrid: document.getElementById('card-grid'),
    hudTimer: document.getElementById('hud-timer'),
    hudProgress: document.getElementById('hud-progress'),
    hudTheme: document.getElementById('hud-theme'),
    progressFill: document.getElementById('progress-fill'),
    themeList: document.getElementById('theme-list'),
    bestTimeEl: document.getElementById('best-time'),
    gamesPlayedEl: document.getElementById('games-played'),
    gamesWonEl: document.getElementById('games-won'),
    resultInner: document.getElementById('result-inner'),
    settingsPanel: document.getElementById('settings-panel'),
    soundToggle: document.getElementById('sound-toggle'),
    vibrationToggle: document.getElementById('vibration-toggle'),
    btnPlay: document.getElementById('btn-play'),
    btnSettings: document.getElementById('btn-settings'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnNextTheme: document.getElementById('btn-next-theme'),
    btnBackMenu: document.getElementById('btn-back-menu')
  };
}

// ─── SCREEN MANAGEMENT ───
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

// ─── THEME UI ───
function renderThemes() {
  const list = dom.themeList;
  if (!list) return;
  list.innerHTML = '';
  THEMES.forEach((theme, idx) => {
    const chip = document.createElement('div');
    chip.className = 'theme-chip';
    if (theme.unlocked && idx === state.currentThemeIndex) chip.classList.add('active');
    if (!theme.unlocked) chip.classList.add('locked');
    chip.dataset.index = idx;

    let label = `<span>${theme.icon}</span> ${theme.name}`;
    if (!theme.unlocked) {
      label = `<svg class="lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg> ${theme.name} <span class="unlock-cond">${theme.unlockCondition}</span>`;
    }
    chip.innerHTML = label;

    if (theme.unlocked) {
      chip.addEventListener('click', () => {
        state.currentThemeIndex = idx;
        saveData(STORAGE_KEYS.currentTheme, idx);
        renderThemes();
      });
    }
    list.appendChild(chip);
  });
}

// ─── STATS ───
function updateMenuStats() {
  const best = loadData(STORAGE_KEYS.bestScore, null);
  const played = loadData(STORAGE_KEYS.gamesPlayed, 0);
  const won = loadData(STORAGE_KEYS.gamesWon, 0);

  if (dom.bestTimeEl) {
    if (best !== null) {
      dom.bestTimeEl.innerHTML = `<span class="highlight">${formatTime(best)}</span>`;
    } else {
      dom.bestTimeEl.textContent = '---';
    }
  }
  if (dom.gamesPlayedEl) dom.gamesPlayedEl.textContent = played;
  if (dom.gamesWonEl) dom.gamesWonEl.textContent = won;
}

// ─── BUILD DECK ───
function buildDeck() {
  const theme = THEMES[state.currentThemeIndex];
  const pairs = [];
  for (let i = 0; i < CONFIG.pairs; i++) {
    pairs.push({ pairId: i, emoji: theme.emoji[i] });
    pairs.push({ pairId: i, emoji: theme.emoji[i] });
  }
  return shuffle(pairs).map((p, idx) => ({
    id: idx,
    pairId: p.pairId,
    emoji: p.emoji,
    flipped: false,
    matched: false
  }));
}

// ─── RENDER GRID ───
function renderGrid() {
  const grid = dom.cardGrid;
  if (!grid) return;
  grid.innerHTML = '';
  state.cards.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (card.flipped) cardEl.classList.add('flipped');
    if (card.matched) cardEl.classList.add('matched');
    cardEl.dataset.index = idx;
    cardEl.setAttribute('role', 'button');
    cardEl.setAttribute('tabindex', '0');
    cardEl.setAttribute('aria-label', `Card ${idx + 1}`);

    cardEl.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back">
          <div class="card-back-pattern"></div>
          <svg class="card-back-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="card-face card-front"><span class="card-emoji">${card.emoji}</span></div>
      </div>
    `;

    cardEl.addEventListener('click', () => handleCardClick(idx));
    cardEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleCardClick(idx);
    }, { passive: false });
    cardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardClick(idx);
      }
    });

    grid.appendChild(cardEl);
  });
}

// ─── UPDATE GRID ───
function updateGrid() {
  const cards = dom.cardGrid.querySelectorAll('.card');
  state.cards.forEach((card, idx) => {
    const el = cards[idx];
    if (!el) return;
    el.classList.toggle('flipped', card.flipped);
    el.classList.toggle('matched', card.matched);
  });
}

// ─── HUD UPDATE ───
function updateHUD() {
  if (dom.hudTimer) {
    const mins = Math.floor(state.timeRemaining / 60);
    const secs = state.timeRemaining % 60;
    dom.hudTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    dom.hudTimer.classList.toggle('warning', state.timeRemaining <= 10);
  }
  if (dom.hudProgress) {
    dom.hudProgress.innerHTML = `配对 <span class="score-num">${state.matchedPairs}</span>/${state.totalPairs}`;
  }
  if (dom.hudTheme) {
    const theme = THEMES[state.currentThemeIndex];
    dom.hudTheme.textContent = `${theme.icon} ${theme.name}`;
  }
  if (dom.progressFill) {
    dom.progressFill.style.width = `${(state.matchedPairs / state.totalPairs) * 100}%`;
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── HANDLE CARD CLICK ───
function handleCardClick(idx) {
  if (state.phase !== 'PLAYING') return;
  if (state.isAnimating) return;
  if (state.flipped.length >= 2) return;

  const card = state.cards[idx];
  if (!card || card.flipped || card.matched) return;

  // Flip the card
  card.flipped = true;
  state.flipped.push(idx);
  state.subPhase = state.flipped.length === 1 ? 'FLIP_FIRST' : 'FLIP_SECOND';

  updateGrid();
  playFlip();
  vibrate(10);

  if (state.flipped.length === 2) {
    state.attempts++;
    state.isAnimating = true;
    state.subPhase = 'CHECKING';

    const [first, second] = state.flipped;
    if (state.cards[first].pairId === state.cards[second].pairId) {
      // Match!
      setTimeout(() => {
        state.cards[first].matched = true;
        state.cards[second].matched = true;
        state.matchedPairs++;
        state.flipped = [];
        state.isAnimating = false;
        state.subPhase = 'IDLE';
        updateGrid();
        updateHUD();
        playMatch();
        vibrate([50, 30, 50]);

        if (state.matchedPairs === state.totalPairs) {
          endGame(true);
        }
      }, CONFIG.matchAnimDuration);
    } else {
      // Mismatch
      const firstEl = dom.cardGrid.querySelectorAll('.card')[first];
      const secondEl = dom.cardGrid.querySelectorAll('.card')[second];
      setTimeout(() => {
        playMismatch();
        vibrate(30);
      }, 300);
      setTimeout(() => {
        state.cards[first].flipped = false;
        state.cards[second].flipped = false;
        state.flipped = [];
        state.isAnimating = false;
        state.subPhase = 'IDLE';
        updateGrid();
      }, CONFIG.flipDuration + CONFIG.mismatchViewDuration);
    }
  }
}

// ─── TIMER ───
function startTimer() {
  state.timeRemaining = CONFIG.timeLimit;
  updateHUD();
  let lastTickSecond = state.timeRemaining;

  state.timerId = setInterval(() => {
    state.timeRemaining--;
    updateHUD();

    // Tick sound for last 10 seconds
    if (state.timeRemaining <= 10 && state.timeRemaining > 0 && state.timeRemaining !== lastTickSecond) {
      playTick();
    }
    lastTickSecond = state.timeRemaining;

    if (state.timeRemaining <= 0) {
      endGame(false);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

// ─── END GAME ───
function endGame(won) {
  stopTimer();
  state.phase = won ? 'WIN' : 'LOSE';
  state.isAnimating = false;

  const timeUsed = CONFIG.timeLimit - state.timeRemaining;
  const played = loadData(STORAGE_KEYS.gamesPlayed, 0) + 1;
  saveData(STORAGE_KEYS.gamesPlayed, played);

  let isNewBest = false;

  if (won) {
    const wonCount = loadData(STORAGE_KEYS.gamesWon, 0) + 1;
    saveData(STORAGE_KEYS.gamesWon, wonCount);
    saveData(STORAGE_KEYS.lastScore, timeUsed);

    const best = loadData(STORAGE_KEYS.bestScore, null);
    if (best === null || timeUsed < best) {
      saveData(STORAGE_KEYS.bestScore, timeUsed);
      isNewBest = true;
    }

    // Unlock next theme
    unlockNextTheme(wonCount);

    playWin();
    vibrate([100, 50, 100, 50, 200]);
  } else {
    playLose();
    vibrate(150);
  }

  showResult(won, timeUsed, isNewBest);
}

function unlockNextTheme(wonCount) {
  const unlocked = loadData(STORAGE_KEYS.unlockedThemes, [0]);
  let changed = false;

  // space: 1 win
  if (wonCount >= 1 && !unlocked.includes(1)) {
    unlocked.push(1);
    changed = true;
  }
  // ocean: 2 wins
  if (wonCount >= 2 && !unlocked.includes(2)) {
    unlocked.push(2);
    changed = true;
  }
  // food: 5 wins
  if (wonCount >= 5 && !unlocked.includes(3)) {
    unlocked.push(3);
    changed = true;
  }
  // fantasy: all others completed
  if (unlocked.includes(1) && unlocked.includes(2) && unlocked.includes(3) && !unlocked.includes(4)) {
    // Only fantasy when ALL other themes (1,2,3) are done + classic always unlocked
    const allOthersDone = true; // simplified: after 5 wins, all non-fantasy are unlocked
    if (allOthersDone) {
      unlocked.push(4);
      changed = true;
    }
  }

  if (changed) {
    saveData(STORAGE_KEYS.unlockedThemes, [...new Set(unlocked)]);
    // Apply to THEMES
    unlocked.forEach(idx => { THEMES[idx].unlocked = true; });
  } else {
    // Still sync THEMES
    unlocked.forEach(idx => { THEMES[idx].unlocked = true; });
  }
}

function showResult(won, timeUsed, isNewBest) {
  showScreen('screen-result');
  const inner = dom.resultInner;
  if (!inner) return;

  const theme = THEMES[state.currentThemeIndex];
  const wonCount = loadData(STORAGE_KEYS.gamesWon, 0);

  // Check if unlocking anything
  let newlyUnlocked = null;
  if (won) {
    const nextThemeIdx = state.currentThemeIndex + 1;
    if (nextThemeIdx < THEMES.length && THEMES[nextThemeIdx].unlocked) {
      newlyUnlocked = THEMES[nextThemeIdx];
    }
  }

  if (won) {
    inner.innerHTML = `
      <div class="result-icon animate">
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="14" cy="10" r="2" fill="#f6ad55" stroke="none"/>
          <circle cx="36" cy="8" r="1.5" fill="#48bb78" stroke="none"/>
          <circle cx="40" cy="20" r="2" fill="#f56565" stroke="none"/>
          <circle cx="8" cy="22" r="1.5" fill="#4299e1" stroke="none"/>
          <circle cx="32" cy="36" r="2" fill="#b794f4" stroke="none"/>
          <circle cx="16" cy="38" r="1.5" fill="#f6ad55" stroke="none"/>
          <path d="M24 14 C24 14, 26 18, 28 18 C26 18, 24 22, 24 22 C24 22, 22 18, 20 18 C22 18, 24 14, 24 14Z" fill="#f6ad55" stroke="none"/>
          <path d="M24 26 C24 26, 27 30, 30 30 C27 30, 24 34, 24 34 C24 34, 21 30, 18 30 C21 30, 24 26, 24 26Z" fill="#48bb78" stroke="none"/>
          <circle cx="24" cy="5" r="1" fill="#f6ad55" stroke="none"/>
          <circle cx="42" cy="32" r="1.5" fill="#f56565" stroke="none"/>
          <circle cx="6" cy="36" r="1" fill="#48bb78" stroke="none"/>
        </svg>
      </div>
      <h2 class="result-headline">恭喜通关！</h2>
      <p class="result-sub">成功匹配全部 ${state.totalPairs} 对卡片</p>
      <div class="result-stats">
        <div class="result-stat">
          <span class="result-stat-value">${formatTime(timeUsed)}</span>
          <span class="result-stat-label">用时</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-value">${state.matchedPairs}</span>
          <span class="result-stat-label">配对</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-value ${isNewBest ? 'gold' : ''}">${isNewBest ? 'NEW' : formatTime(loadData(STORAGE_KEYS.bestScore, timeUsed))}</span>
          <span class="result-stat-label">最佳纪录</span>
        </div>
      </div>
      ${newlyUnlocked ? `
      <div class="unlock-notice">
        <svg class="unlock-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 5.83-1"/></svg>
        <span class="unlock-text">解锁新主题 <strong>「${newlyUnlocked.icon} ${newlyUnlocked.name}」</strong> — 尝试新主题继续挑战！</span>
      </div>` : ''}
      <div class="result-actions">
        <button class="btn-primary" id="btn-play-again-result">再来一局</button>
        <button class="btn-ghost" id="btn-menu-result">返回主页</button>
      </div>
    `;
    // Spawn celebration particles
    spawnParticles();
  } else {
    inner.innerHTML = `
      <div class="result-icon animate">⏰</div>
      <h2 class="result-headline">时间到！</h2>
      <p class="result-sub">配对数 ${state.matchedPairs} / ${state.totalPairs}</p>
      <div class="result-stats">
        <div class="result-stat">
          <span class="result-stat-value">${state.matchedPairs}</span>
          <span class="result-stat-label">配对成功</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-value">${state.attempts}</span>
          <span class="result-stat-label">尝试次数</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-value">${formatTime(timeUsed)}</span>
          <span class="result-stat-label">用时</span>
        </div>
      </div>
      <div class="result-actions">
        <button class="btn-primary" id="btn-play-again-result">再来一局</button>
        <button class="btn-ghost" id="btn-menu-result">返回主页</button>
      </div>
    `;
  }

  // Bind result buttons
  const playAgainBtn = document.getElementById('btn-play-again-result');
  if (playAgainBtn) playAgainBtn.addEventListener('click', startGame);

  const menuBtn = document.getElementById('btn-menu-result');
  if (menuBtn) menuBtn.addEventListener('click', goToMenu);

  // Next theme button in design - combined with play again
  updateMenuStats();
}

function spawnParticles() {
  const container = dom.resultInner;
  if (!container) return;
  const colors = ['#f6ad55', '#48bb78', '#f56565', '#4299e1', '#b794f4', '#ed64a6'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 40}%`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = `${Math.random() * 1}s`;
    p.style.animationDuration = `${1.5 + Math.random() * 1}s`;
    p.style.width = `${4 + Math.random() * 6}px`;
    p.style.height = p.style.width;
    container.appendChild(p);
    setTimeout(() => p.remove(), 3000);
  }
}

// ─── START GAME ───
function startGame() {
  // Reset state
  state.phase = 'PLAYING';
  state.subPhase = 'IDLE';
  state.flipped = [];
  state.matchedPairs = 0;
  state.attempts = 0;
  state.isAnimating = false;
  state.cards = buildDeck();

  showScreen('screen-game');
  renderGrid();
  updateHUD();
  startTimer();
}

// ─── GO TO MENU ───
function goToMenu() {
  stopTimer();
  state.phase = 'MENU';
  state.subPhase = 'IDLE';

  // Reload saved theme/state
  const savedTheme = loadData(STORAGE_KEYS.currentTheme, 0);
  const savedThemes = loadData(STORAGE_KEYS.unlockedThemes, [0]);
  savedThemes.forEach(idx => {
    if (idx >= 0 && idx < THEMES.length) THEMES[idx].unlocked = true;
  });
  state.currentThemeIndex = savedTheme;

  showScreen('screen-menu');
  renderThemes();
  updateMenuStats();
}

// ─── SETTINGS ───
function toggleSettings() {
  dom.settingsPanel.classList.toggle('hidden');
  syncSettingsToggles();
}

function syncSettingsToggles() {
  if (dom.soundToggle) dom.soundToggle.checked = isSoundEnabled();
  if (dom.vibrationToggle) dom.vibrationToggle.checked = isVibrationEnabled();
}

// ─── INIT ───
function init() {
  initDOM();

  // Load saved data
  const savedTheme = loadData(STORAGE_KEYS.currentTheme, 0);
  const savedThemes = loadData(STORAGE_KEYS.unlockedThemes, [0]);
  savedThemes.forEach(idx => {
    if (idx >= 0 && idx < THEMES.length) THEMES[idx].unlocked = true;
  });
  state.currentThemeIndex = Math.min(savedTheme, THEMES.length - 1);

  // Render
  renderThemes();
  updateMenuStats();
  showScreen('screen-menu');

  // Events
  dom.btnPlay.addEventListener('click', startGame);
  dom.btnSettings.addEventListener('click', toggleSettings);
  dom.btnSettingsClose.addEventListener('click', toggleSettings);
  dom.soundToggle.addEventListener('change', () => {
    saveData(STORAGE_KEYS.soundEnabled, dom.soundToggle.checked);
  });
  dom.vibrationToggle.addEventListener('change', () => {
    saveData(STORAGE_KEYS.vibrationEnabled, dom.vibrationToggle.checked);
  });

  // Keyboard: Enter/Space on Play button
  dom.btnPlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') startGame();
  });
}

// ─── START ───
document.addEventListener('DOMContentLoaded', init);
