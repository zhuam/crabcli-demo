/* ═══════════════════════════════════════════════════════
   Tank Rumble — app.js
   Grid-based tank battle game with AI opponent
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     CONFIG
     ═══════════════════════════════════════════════════════ */
  var COLS = 15;
  var ROWS = 10;
  var TILE_SIZE = 44;
  var MOVE_COOLDOWN = 300;
  var SHELL_SPEED = 8;
  var TANK_HP = 3;
  var ROUNDS_TO_WIN = 3;
  var STORAGE_KEY = 'tank-rumble-best';
  var DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];

  // 0 = empty, 1 = wall (indestructible), 2 = destructible wall
  var MAPS = [
    // Map 1: Classic arena with central obstacle
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,2,0,2,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,2,2,0,0,0,2,2,0,0,0,1],
      [1,0,2,0,0,0,0,1,0,0,0,0,2,0,1],
      [1,0,2,0,0,0,0,1,0,0,0,0,2,0,1],
      [1,0,0,0,2,2,0,0,0,2,2,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,2,0,2,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    // Map 2: Corridors
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,1,0,0,0,1,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,0,1,0,0,2,0,0,1,0,1,0,1],
      [1,2,1,0,1,0,0,0,0,0,1,0,1,2,1],
      [1,2,1,0,1,0,0,0,0,0,1,0,1,2,1],
      [1,0,1,0,1,0,0,2,0,0,1,0,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,1,0,0,0,1,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    // Map 3: Open with scattered cover
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,2,0,0,2,0,0,0,2,0,0,2,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,2,0,0,0,0,0,0,0,2,0,0,1],
      [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
      [1,0,2,0,0,0,0,0,0,0,0,0,2,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  ];

  /* ═══════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════ */
  var state = {
    screen: 'title', // title | playing | roundResult | matchResult

    // Match state
    playerWins: 0,
    enemyWins: 0,
    round: 1,
    totalKills: 0,
    currentMap: 0,

    // Round state
    mapData: null,
    player: { gridX: 1, gridY: 1, x: 0, y: 0, dir: DIR.RIGHT, hp: TANK_HP, alive: true, moveTimer: 0 },
    enemy: { gridX: 13, gridY: 8, x: 0, y: 0, dir: DIR.LEFT, hp: TANK_HP, alive: true, moveTimer: 0, aiState: 'patrol', aiTimer: 0, aiDirTimer: 0, aiDir: DIR.UP },
    shells: [],
    explosions: [],
    particles: [],
    floatingTexts: [],
    screenShake: 0,
    hitFlash: 0,
    flashColor: '',

    // Gameplay
    paused: false,
    playing: false,
    matchOver: false,
    roundOver: false,
    gameStartTime: 0,

    // Canvas
    canvas: null,
    ctx: null,
    canvasW: 0,
    canvasH: 0,
    tileSize: TILE_SIZE,
    offsetX: 0,
    offsetY: 0,
    isMobile: false,
    dpr: 1,

    // Audio
    audioCtx: null,
  };

  /* ═══════════════════════════════════════════════════════
     DOM REFS
     ═══════════════════════════════════════════════════════ */
  var el = function (id) { return document.getElementById(id); };
  var titleScreen = el('titleScreen');
  var gameScreen = el('gameScreen');
  var resultScreen = el('resultScreen');
  var pauseOverlay = el('pauseOverlay');
  var roundOverlay = el('roundOverlay');
  var playBtn = el('playBtn');
  var pauseBtn = el('pauseBtn');
  var resumeBtn = el('resumeBtn');
  var quitBtn = el('quitBtn');
  var retryBtn = el('retryBtn');
  var homeBtn = el('homeBtn');
  var roundDisplay = el('roundDisplay');
  var playerScoreDisplay = el('playerScoreDisplay');
  var enemyScoreDisplay = el('enemyScoreDisplay');
  var playerScore = el('playerScore');
  var enemyScore = el('enemyScore');
  var canvas = el('gameCanvas');
  var resultIcon = el('resultIcon');
  var resultTitle = el('resultTitle');
  var resultMyScore = el('resultMyScore');
  var resultEnemyScore = el('resultEnemyScore');
  var resultDetail = el('resultDetail');
  var resultKills = el('resultKills');
  var resultBestLabel = el('resultBestLabel');
  var resultBest = el('resultBest');
  var titleBestScore = el('titleBestScore');
  var roundAnnounce = el('roundAnnounce');
  var controlsBar = el('controlsBar');
  var fireBtn = el('fireBtn');

  /* ═══════════════════════════════════════════════════════
     AUDIO (Web Audio API)
     ═══════════════════════════════════════════════════════ */

  function initAudio() {
    if (!state.audioCtx) {
      try { state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(function () {});
    }
  }

  function playTone(freq, duration, type, volume) {
    if (!state.audioCtx) return;
    try {
      var osc = state.audioCtx.createOscillator();
      var gain = state.audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
      gain.gain.setValueAtTime((volume || 0.12) * 0.3, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + (duration || 0.1));
      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      osc.start();
      osc.stop(state.audioCtx.currentTime + (duration || 0.1));
    } catch (e) {}
  }

  function playNoise(duration, volume) {
    if (!state.audioCtx) return;
    try {
      var bufferSize = state.audioCtx.sampleRate * (duration || 0.1);
      var buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      var source = state.audioCtx.createBufferSource();
      source.buffer = buffer;
      var gain = state.audioCtx.createGain();
      gain.gain.setValueAtTime((volume || 0.1) * 0.3, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + (duration || 0.1));
      source.connect(gain);
      gain.connect(state.audioCtx.destination);
      source.start();
    } catch (e) {}
  }

  function playMove() { playTone(250, 0.06, 'square', 0.06); }
  function playShoot() { playNoise(0.15, 0.12); playTone(200, 0.08, 'sawtooth', 0.08); }
  function playHit() { playNoise(0.2, 0.15); playTone(100, 0.15, 'square', 0.12); }
  function playWallHit() { playTone(80, 0.1, 'triangle', 0.08); }
  function playExplosion() { playNoise(0.35, 0.2); playTone(60, 0.3, 'sawtooth', 0.15); }
  function playRoundWin() {
    [0, 100, 200].forEach(function (d, i) { setTimeout(function () { playTone(400 + i * 200, 0.12, 'sine', 0.08); }, d); });
  }
  function playRoundLose() {
    [0, 150, 250].forEach(function (d, i) { setTimeout(function () { playTone(500 - i * 150, 0.15, 'triangle', 0.06); }, d); });
  }
  function playMatchWin() {
    [0, 100, 200, 350, 500].forEach(function (d, i) { setTimeout(function () { playTone(400 + i * 150, 0.15, 'sine', 0.1); }, d); });
  }
  function playMatchLose() {
    [0, 150, 300, 400, 500].forEach(function (d, i) { setTimeout(function () { playTone(400, 0.2, 'triangle', 0.06); }, d); });
  }

  /* ═══════════════════════════════════════════════════════
     VIBRATION
     ═══════════════════════════════════════════════════════ */
  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════
     STORAGE
     ═══════════════════════════════════════════════════════ */
  function getBest() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      return { wins: 0, losses: 0, totalKills: 0, bestStreak: 0 };
    } catch (e) { return { wins: 0, losses: 0, totalKills: 0, bestStreak: 0 }; }
  }

  function setBest(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function updateBestUI() {
    var best = getBest();
    titleBestScore.textContent = best.bestStreak || 0;
  }

  /* ═══════════════════════════════════════════════════════
     CANVAS SETUP
     ═══════════════════════════════════════════════════════ */
  function resizeCanvas() {
    var wrap = canvas.parentElement;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    var dpr = window.devicePixelRatio || 1;

    // Calculate tile size to fit canvas
    var maxTileW = Math.floor((w - 8) / COLS);
    var maxTileH = Math.floor((h - 8) / ROWS);
    var tileSize = Math.max(20, Math.min(maxTileW, maxTileH, TILE_SIZE));

    var boardW = tileSize * COLS;
    var boardH = tileSize * ROWS;

    // Center the board in the canvas
    var offsetX = Math.floor((w - boardW) / 2);
    var offsetY = Math.floor((h - boardH) / 2);

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    state.canvasW = w;
    state.canvasH = h;
    state.tileSize = tileSize;
    state.offsetX = offsetX;
    state.offsetY = offsetY;
    state.dpr = dpr;
    state.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (state.isMobile) {
      controlsBar.classList.add('visible');
    } else {
      controlsBar.classList.remove('visible');
    }

    if (state.ctx) {
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /* ═══════════════════════════════════════════════════════
     MAP & POSITION HELPERS
     ═══════════════════════════════════════════════════════ */
  function gridToPixel(gx, gy) {
    return {
      x: state.offsetX + gx * state.tileSize + state.tileSize / 2,
      y: state.offsetY + gy * state.tileSize + state.tileSize / 2,
    };
  }

  function isWall(gx, gy, mapData) {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
    return mapData[gy][gx] === 1 || mapData[gy][gx] === 2;
  }

  function canMoveTo(gx, gy, mapData) {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return false;
    if (mapData[gy][gx] === 1 || mapData[gy][gx] === 2) return false;
    // Check if another tank is there
    if (state.player.alive && state.player.gridX === gx && state.player.gridY === gy) return false;
    if (state.enemy.alive && state.enemy.gridX === gx && state.enemy.gridY === gy) return false;
    return true;
  }

  /* ═══════════════════════════════════════════════════════
     DRAWING
     ═══════════════════════════════════════════════════════ */

  function drawGrid() {
    var ctx = state.ctx;
    var ts = state.tileSize;
    var ox = state.offsetX;
    var oy = state.offsetY;
    var map = state.mapData;

    ctx.save();
    ctx.translate(ox, oy);

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tile = map[r][c];
        var x = c * ts;
        var y = r * ts;

        if (tile === 0) {
          // Ground - alternating beige
          ctx.fillStyle = (r + c) % 2 === 0 ? '#bcaaa4' : '#a1887f';
          ctx.fillRect(x, y, ts, ts);
          // Subtle grid lines
          ctx.strokeStyle = 'rgba(0,0,0,0.06)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, ts, ts);
        } else if (tile === 1) {
          // Wall (indestructible) - dark bricks
          ctx.fillStyle = '#4e342e';
          ctx.fillRect(x, y, ts, ts);
          ctx.strokeStyle = '#3e2723';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, ts, ts);
          // Brick pattern
          ctx.strokeStyle = '#5d4037';
          ctx.lineWidth = 0.5;
          var half = ts / 2;
          ctx.beginPath();
          ctx.moveTo(x, y + half);
          ctx.lineTo(x + ts, y + half);
          ctx.moveTo(x + half, y);
          ctx.lineTo(x + half, y + half);
          ctx.moveTo(x, y + half + half / 2);
          ctx.lineTo(x + half, y + half + half / 2);
          ctx.moveTo(x + half + half / 2, y + half);
          ctx.lineTo(x + half + half / 2, y + ts);
          ctx.stroke();
        } else if (tile === 2) {
          // Destructible wall
          ctx.fillStyle = '#795548';
          ctx.fillRect(x, y, ts, ts);
          ctx.strokeStyle = '#5d4037';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, ts, ts);
          // Cross pattern
          ctx.strokeStyle = '#8d6e63';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 2);
          ctx.lineTo(x + ts - 2, y + ts - 2);
          ctx.moveTo(x + ts - 2, y + 2);
          ctx.lineTo(x + 2, y + ts - 2);
          ctx.stroke();
          // Dot in center
          ctx.fillStyle = '#8d6e63';
          ctx.beginPath();
          ctx.arc(x + ts / 2, y + ts / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  function drawTank(tank, isPlayer) {
    if (!tank.alive) return;
    var ctx = state.ctx;
    var ts = state.tileSize;
    var ox = state.offsetX;
    var oy = state.offsetY;
    var cx = ox + tank.gridX * ts + ts / 2;
    var cy = oy + tank.gridY * ts + ts / 2;
    var size = ts * 0.75;
    var halfSize = size / 2;

    ctx.save();
    ctx.translate(cx, cy);

    // Tank body
    var bodyColor = isPlayer ? '#388e3c' : '#d32f2f';
    var bodyDark = isPlayer ? '#1b5e20' : '#b71c1c';

    // Main body (rectangle)
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-halfSize, -halfSize * 0.7, size, size * 1.4);

    // Body outline
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(-halfSize, -halfSize * 0.7, size, size * 1.4);

    // Tracks (left and right)
    ctx.fillStyle = '#37474f';
    ctx.fillRect(-halfSize - 2, -halfSize * 0.75, 4, size * 1.5);
    ctx.fillRect(halfSize - 2, -halfSize * 0.75, 4, size * 1.5);

    // Track details
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 0.5;
    for (var i = 0; i < 4; i++) {
      var ty = -halfSize * 0.6 + i * (size * 0.35);
      ctx.beginPath();
      ctx.moveTo(-halfSize - 2, ty);
      ctx.lineTo(-halfSize + 2, ty);
      ctx.moveTo(halfSize - 2, ty);
      ctx.lineTo(halfSize + 2, ty);
      ctx.stroke();
    }

    // Turret (circle on top)
    ctx.fillStyle = isPlayer ? '#43a047' : '#e53935';
    ctx.beginPath();
    ctx.arc(0, 0, halfSize * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Barrel (points in direction)
    var barrelLen = halfSize * 1.2;
    var barrelWidth = 4;
    var angle = tank.dir * Math.PI / 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = isPlayer ? '#2e7d32' : '#c62828';
    ctx.fillRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
    // Barrel tip
    ctx.fillStyle = '#555';
    ctx.fillRect(barrelLen - 3, -barrelWidth / 2 - 1, 4, barrelWidth + 2);
    ctx.restore();

    // Direction indicator (small dot or line on turret)
    ctx.fillStyle = isPlayer ? '#66bb6a' : '#ef5350';
    ctx.beginPath();
    ctx.arc(0, 0, halfSize * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar above tank
    drawHPBar(cx, cy - halfSize - 8, tank.hp, TANK_HP);
  }

  function drawHPBar(x, y, hp, maxHp) {
    var ctx = state.ctx;
    var barW = state.tileSize * 0.7;
    var barH = 5;
    var bx = x - barW / 2;
    var by = y;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

    // HP fill
    var pct = Math.max(0, hp / maxHp);
    var color = hp <= 1 ? '#f44336' : (hp === 2 ? '#ff9800' : '#4caf50');
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, barW * pct, barH);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx - 1, by - 1, barW + 2, barH + 2);
  }

  function drawShells() {
    var ctx = state.ctx;
    for (var i = 0; i < state.shells.length; i++) {
      var s = state.shells[i];
      var px = state.offsetX + s.gridX * state.tileSize + state.tileSize / 2;
      var py = state.offsetY + s.gridY * state.tileSize + state.tileSize / 2;

      // Shell glow
      ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();

      // Shell body
      ctx.fillStyle = '#ff6d00';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawExplosions() {
    var ctx = state.ctx;
    for (var i = state.explosions.length - 1; i >= 0; i--) {
      var e = state.explosions[i];
      e.life -= 0.03;
      e.radius += 2;
      if (e.life <= 0) { state.explosions.splice(i, 1); continue; }

      var alpha = e.life;
      // Outer blast
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = '#ff6d00';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = '#ffd740';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    }
  }

  function drawParticles() {
    var ctx = state.ctx;
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.5;
      p.life -= 0.025;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    var ctx = state.ctx;
    var w = state.canvasW;

    // Map indicator at top
    var mapNames = ['CLASSIC', 'CORRIDORS', 'COVER'];
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'right';
    ctx.fillText('MAP: ' + mapNames[state.currentMap], w - 10, 18);
    ctx.textAlign = 'left';

    // Round info on canvas
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '10px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'left';
    ctx.fillText('HP: ' + state.player.hp + '/' + TANK_HP, state.offsetX + 2, state.offsetY - 6);
    ctx.textAlign = 'right';
    ctx.fillText('ENEMY HP: ' + state.enemy.hp + '/' + TANK_HP, state.offsetX + COLS * state.tileSize - 2, state.offsetY - 6);
    ctx.textAlign = 'left';
  }

  function render() {
    var ctx = state.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, state.canvasW, state.canvasH);

    // Screen shake
    ctx.save();
    if (state.screenShake > 0) {
      var shake = state.screenShake;
      ctx.translate(Math.random() * shake - shake / 2, Math.random() * shake - shake / 2);
    }

    // Background
    ctx.fillStyle = '#3e4d2b';
    ctx.fillRect(0, 0, state.canvasW, state.canvasH);

    // Grid
    if (state.mapData) drawGrid();

    // Shells
    drawShells();

    // Tanks
    drawTank(state.enemy, false);
    drawTank(state.player, true);

    // Explosions and particles (on top)
    drawParticles();
    drawExplosions();

    // HUD
    drawHUD();

    ctx.restore();

    // Hit flash overlay
    if (state.hitFlash > 0) {
      ctx.fillStyle = state.flashColor || 'rgba(255, 100, 50, ' + (state.hitFlash * 0.3) + ')';
      ctx.fillRect(0, 0, state.canvasW, state.canvasH);
      state.hitFlash -= 0.04;
    }
  }

  /* ═══════════════════════════════════════════════════════
     GAME LOGIC
     ═══════════════════════════════════════════════════════ */

  function moveTank(tank, dir, mapData) {
    var nx = tank.gridX + DX[dir];
    var ny = tank.gridY + DY[dir];

    if (canMoveTo(nx, ny, mapData)) {
      tank.gridX = nx;
      tank.gridY = ny;
      tank.dir = dir;
      return true;
    }
    return false;
  }

  function fireShell(tank, dir, fromPlayer) {
    if (!tank.alive) return;

    var startX = tank.gridX + DX[dir];
    var startY = tank.gridY + DY[dir];

    // Check if shell would start in a wall (shouldn't happen, but guard)
    if (isWall(startX, startY, state.mapData)) return;

    state.shells.push({
      gridX: startX,
      gridY: startY,
      dir: dir,
      fromPlayer: fromPlayer,
    });

    playShoot();
    vibrate(10);
  }

  function updateShells() {
    var shells = state.shells;
    var map = state.mapData;

    for (var i = shells.length - 1; i >= 0; i--) {
      var s = shells[i];
      var moved = false;

      // Move shell one tile at a time at SHELL_SPEED tiles/sec
      // We'll handle this in the game loop with delta time
      // Shells move 1 tile per update call

      var nx = s.gridX + DX[s.dir];
      var ny = s.gridY + DY[s.dir];

      // Check bounds
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        // Shell goes out of bounds - remove
        shells.splice(i, 1);
        continue;
      }

      // Check wall hit
      if (map[ny][nx] === 1) {
        // Indestructible wall - shell destroyed
        spawnExplosion(
          state.offsetX + nx * state.tileSize + state.tileSize / 2,
          state.offsetY + ny * state.tileSize + state.tileSize / 2
        );
        playWallHit();
        shells.splice(i, 1);
        continue;
      }

      if (map[ny][nx] === 2) {
        // Destructible wall - destroyed, shell continues
        map[ny][nx] = 0;
        spawnExplosion(
          state.offsetX + nx * state.tileSize + state.tileSize / 2,
          state.offsetY + ny * state.tileSize + state.tileSize / 2
        );
        playWallHit();
        // Screen shake for wall destruction
        state.screenShake = 4;
        shells.splice(i, 1);
        continue;
      }

      // Check tank hit
      if (s.fromPlayer) {
        // Shell from player checking enemy hit
        if (state.enemy.alive && state.enemy.gridX === nx && state.enemy.gridY === ny) {
          // Hit enemy
          state.enemy.hp--;
          spawnExplosion(
            state.offsetX + nx * state.tileSize + state.tileSize / 2,
            state.offsetY + ny * state.tileSize + state.tileSize / 2
          );
          state.screenShake = 6;
          state.hitFlash = 0.5;
          state.flashColor = 'rgba(76, 175, 80, 0.2)';
          playHit();
          vibrate(30);
          shells.splice(i, 1);

          if (state.enemy.hp <= 0) {
            state.enemy.alive = false;
            state.totalKills++;
            playExplosion();
            vibrate([30, 20, 50]);
            // Big explosion
            var ep = gridToPixel(nx, ny);
            spawnExplosion(ep.x, ep.y);
            spawnExplosion(ep.x - 10, ep.y - 10);
            spawnExplosion(ep.x + 10, ep.y + 10);
            setTimeout(function () { endRound(true); }, 400);
          }
          continue;
        }
      } else {
        // Shell from enemy checking player hit
        if (state.player.alive && state.player.gridX === nx && state.player.gridY === ny) {
          // Hit player
          state.player.hp--;
          spawnExplosion(
            state.offsetX + nx * state.tileSize + state.tileSize / 2,
            state.offsetY + ny * state.tileSize + state.tileSize / 2
          );
          state.screenShake = 6;
          state.hitFlash = 0.5;
          state.flashColor = 'rgba(244, 67, 54, 0.2)';
          playHit();
          vibrate(30);
          shells.splice(i, 1);

          if (state.player.hp <= 0) {
            state.player.alive = false;
            playExplosion();
            vibrate([30, 20, 50]);
            var ep2 = gridToPixel(nx, ny);
            spawnExplosion(ep2.x, ep2.y);
            spawnExplosion(ep2.x - 10, ep2.y - 10);
            spawnExplosion(ep2.x + 10, ep2.y + 10);
            setTimeout(function () { endRound(false); }, 400);
          }
          continue;
        }
      }

      // Move shell forward
      s.gridX = nx;
      s.gridY = ny;
    }
  }

  function spawnExplosion(x, y) {
    state.explosions.push({ x: x, y: y, radius: 5, life: 1 });
    spawnParticles(x, y, 12, '#ff6d00');
    spawnParticles(x, y, 8, '#ffd740');
    spawnParticles(x, y, 6, '#fff');
  }

  function spawnParticles(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1 + Math.random() * 3;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        color: color,
        size: 2 + Math.random() * 3,
        life: 0.6 + Math.random() * 0.4,
      });
    }
  }

  /* ═══════════════════════════════════════════════════════
     AI LOGIC
     ═══════════════════════════════════════════════════════ */

  function updateAI() {
    var ai = state.enemy;
    if (!ai.alive || state.roundOver) return;

    var now = Date.now();

    // Decrease move cooldown
    if (ai.moveTimer > 0 && now - ai.aiTimer > MOVE_COOLDOWN) {
      ai.moveTimer = 0;
      ai.aiTimer = now;
    }

    if (ai.moveTimer > 0) return;

    // Determine if player is in line of sight
    var losInfo = checkLineOfSight(ai.gridX, ai.gridY, state.player.gridX, state.player.gridY, state.mapData);
    var canSeePlayer = losInfo.canSee;
    var losDir = losInfo.direction;

    if (canSeePlayer && losDir !== null) {
      // Attack state: shoot at player
      ai.dir = losDir;
      ai.aiState = 'attack';

      // Shoot with ~60% accuracy
      if (Math.random() < 0.6) {
        fireShell(ai, losDir, false);
        ai.moveTimer = 1;
        ai.aiTimer = now;
        return;
      }
    }

    // Hunt or Patrol: move around
    ai.aiState = 'patrol';

    // Decide direction
    if (now - ai.aiDirTimer > 1000 + Math.random() * 1500) {
      ai.aiDir = Math.floor(Math.random() * 4);
      ai.aiDirTimer = now;
    }

    // Smart movement: occasionally move toward player
    if (Math.random() < 0.3) {
      // Move toward player
      var dx = state.player.gridX - ai.gridX;
      var dy = state.player.gridY - ai.gridY;

      if (Math.abs(dx) > Math.abs(dy)) {
        ai.aiDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      } else {
        ai.aiDir = dy > 0 ? DIR.DOWN : DIR.UP;
      }
    }

    // Try to move
    var moved = moveTank(ai, ai.aiDir, state.mapData);
    if (!moved) {
      // Try random direction
      var tries = 0;
      while (!moved && tries < 4) {
        ai.aiDir = Math.floor(Math.random() * 4);
        moved = moveTank(ai, ai.aiDir, state.mapData);
        tries++;
      }
    }

    if (moved) {
      ai.moveTimer = 1;
      ai.aiTimer = now;
    }
  }

  function checkLineOfSight(x1, y1, x2, y2, mapData) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dir = null;

    // Check if aligned in a straight line
    if (dx === 0 && dy === 0) return { canSee: true, direction: null };
    if (dx !== 0 && dy !== 0) return { canSee: false, direction: null };

    if (dx === 0) {
      dir = dy > 0 ? DIR.DOWN : DIR.UP;
      var step = dy > 0 ? 1 : -1;
      for (var y = y1 + step; y !== y2; y += step) {
        if (isWall(x1, y, mapData)) return { canSee: false, direction: dir };
      }
    } else {
      dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      var stepX = dx > 0 ? 1 : -1;
      for (var x = x1 + stepX; x !== x2; x += stepX) {
        if (isWall(x, y1, mapData)) return { canSee: false, direction: dir };
      }
    }

    return { canSee: true, direction: dir };
  }

  /* ═══════════════════════════════════════════════════════
     ROUND & MATCH MANAGEMENT
     ═══════════════════════════════════════════════════════ */

  function startRound() {
    state.mapData = MAPS[state.currentMap].map(function (row) { return row.slice(); });
    state.player = { gridX: 1, gridY: 1, x: 0, y: 0, dir: DIR.RIGHT, hp: TANK_HP, alive: true, moveTimer: 0 };
    state.enemy = { gridX: 13, gridY: 8, x: 0, y: 0, dir: DIR.LEFT, hp: TANK_HP, alive: true, moveTimer: 0, aiState: 'patrol', aiTimer: 0, aiDirTimer: 0, aiDir: DIR.UP };
    state.shells = [];
    state.explosions = [];
    state.particles = [];
    state.roundOver = false;
    state.screenShake = 0;
    state.hitFlash = 0;

    updateScoreUI();
    hideRoundOverlay();
  }

  function endRound(playerWon) {
    if (state.roundOver) return;
    state.roundOver = true;
    state.shells = [];

    if (playerWon) {
      state.playerWins++;
      playRoundWin();
      vibrate([20, 10, 30]);
    } else {
      state.enemyWins++;
      playRoundLose();
      vibrate([30, 20, 20]);
    }

    updateScoreUI();

    setTimeout(function () {
      if (state.playerWins >= ROUNDS_TO_WIN || state.enemyWins >= ROUNDS_TO_WIN) {
        endMatch(playerWon);
      } else {
        // Next round
        state.round++;
        state.currentMap = (state.currentMap + 1) % MAPS.length;
        var ann = 'Round ' + state.round;
        var sub = playerWon ? 'You won round ' + (state.round - 1) + '!' : 'Enemy took round ' + (state.round - 1) + '...';
        showRoundAnnounce(ann, sub);
        setTimeout(function () { startRound(); }, 1200);
      }
    }, 600);
  }

  function endMatch(playerWon) {
    state.matchOver = true;
    state.playing = false;

    var best = getBest();

    if (playerWon) {
      playMatchWin();
      vibrate([50, 30, 50, 30, 100]);
      best.wins = (best.wins || 0) + 1;
      best.totalKills = (best.totalKills || 0) + state.totalKills;

      // Update best streak
      if (!best.streak) {
        best.streak = 1;
      } else {
        best.streak++;
      }
      if (best.streak > (best.bestStreak || 0)) {
        best.bestStreak = best.streak;
      }
      if (state.playerWins > (best.bestStreak || 0)) {
        best.bestStreak = state.playerWins;
      }
    } else {
      playMatchLose();
      vibrate([30, 30, 50]);
      best.losses = (best.losses || 0) + 1;
      best.totalKills = (best.totalKills || 0) + state.totalKills;
      best.streak = 0;
    }

    setBest(best);
    showResultScreen(playerWon, best);
  }

  function showRoundAnnounce(text, sub) {
    roundAnnounce.innerHTML = '<div>' + text + '</div><div class="sub">' + sub + '</div><div class="go-text" style="margin-top:16px;">&#x2694;</div>';
    roundOverlay.classList.add('active');
  }

  function hideRoundOverlay() {
    roundOverlay.classList.remove('active');
  }

  function showResultScreen(isWin, best) {
    resultIcon.textContent = isWin ? '&#x1F3C6;' : '&#x2620;';
    resultTitle.textContent = isWin ? 'VICTORY!' : 'DEFEATED';
    resultTitle.className = 'result-title ' + (isWin ? 'win' : 'lose');
    resultMyScore.textContent = state.playerWins;
    resultEnemyScore.textContent = state.enemyWins;
    resultKills.textContent = state.totalKills || 0;
    resultBest.textContent = best.bestStreak || 0;

    showScreen('result');
  }

  /* ═══════════════════════════════════════════════════════
     GAME START / STOP
     ═══════════════════════════════════════════════════════ */

  function startGame() {
    initAudio();
    state.playerWins = 0;
    state.enemyWins = 0;
    state.round = 1;
    state.totalKills = 0;
    state.currentMap = 0;
    state.matchOver = false;
    state.playing = true;
    state.paused = false;
    state.gameStartTime = Date.now();

    startRound();
    updateScoreUI();
    showScreen('game');
    showRoundAnnounce('Round 1', 'Get ready... FIGHT!');
    setTimeout(function () {
      hideRoundOverlay();
    }, 1000);
  }

  function showScreen(id) {
    [titleScreen, gameScreen, resultScreen].forEach(function (s) { s.classList.remove('active'); });
    if (id === 'title') titleScreen.classList.add('active');
    else if (id === 'game') gameScreen.classList.add('active');
    else if (id === 'result') resultScreen.classList.add('active');
    pauseOverlay.classList.remove('active');
    roundOverlay.classList.remove('active');
  }

  function updateScoreUI() {
    roundDisplay.textContent = 'Round ' + state.round;
    playerScore.textContent = state.playerWins;
    enemyScore.textContent = state.enemyWins;
  }

  /* ═══════════════════════════════════════════════════════
     GAME LOOP
     ═══════════════════════════════════════════════════════ */

  var lastTime = 0;
  var shellAccumulator = 0;
  var SHELL_TICK = 1000 / SHELL_SPEED;

  function gameLoop(timestamp) {
    var dt = timestamp - lastTime;
    if (dt > 100) dt = 16;
    lastTime = timestamp;

    if (state.playing && !state.paused && !state.matchOver) {
      update(dt);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    if (state.roundOver) return;

    // Decrease screen shake
    if (state.screenShake > 0) {
      state.screenShake *= 0.85;
      if (state.screenShake < 0.5) state.screenShake = 0;
    }

    // Update shells (move them)
    shellAccumulator += dt;
    while (shellAccumulator >= SHELL_TICK) {
      shellAccumulator -= SHELL_TICK;
      updateShells();
    }

    // Update AI
    updateAI();
  }

  /* ═══════════════════════════════════════════════════════
     INPUT — Keyboard
     ═══════════════════════════════════════════════════════ */

  var keysDown = {};
  var lastMoveTime = 0;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.playing && !state.matchOver) togglePause();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      var active = document.activeElement;
      if (active && active.tagName === 'BUTTON') return;

      if (titleScreen.classList.contains('active')) {
        e.preventDefault();
        startGame();
        return;
      } else if (resultScreen.classList.contains('active')) {
        e.preventDefault();
        retryBtn.click();
        return;
      }

      // Space in game = shoot
      if (state.playing && !state.paused && !state.roundOver && state.player.alive) {
        e.preventDefault();
        playerShoot();
        return;
      }
    }

    if (!state.playing || state.paused || state.matchOver || state.roundOver || !state.player.alive) return;

    // Movement: WASD or Arrow keys
    var dir = -1;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dir = DIR.UP;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dir = DIR.DOWN;
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = DIR.LEFT;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = DIR.RIGHT;

    if (dir >= 0) {
      e.preventDefault();
      keysDown[e.key] = true;
      playerMove(dir);
    }
  });

  document.addEventListener('keyup', function (e) {
    delete keysDown[e.key];
  });

  function playerMove(dir) {
    var now = Date.now();
    if (now - lastMoveTime < MOVE_COOLDOWN) return;
    if (state.roundOver || !state.player.alive) return;

    state.player.dir = dir;
    var moved = moveTank(state.player, dir, state.mapData);
    if (moved) {
      lastMoveTime = now;
      playMove();
    } else {
      playWallHit();
    }
  }

  function playerShoot() {
    if (state.roundOver || !state.player.alive) return;
    fireShell(state.player, state.player.dir, true);
  }

  /* ═══════════════════════════════════════════════════════
     INPUT — Touch / D-Pad
     ═══════════════════════════════════════════════════════ */

  var dpadBtns = document.querySelectorAll('.dpad-btn');
  for (var di = 0; di < dpadBtns.length; di++) {
    var btn = dpadBtns[di];
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var dir = this.dataset.dir;
      var dirMap = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };
      if (dirMap[dir] !== undefined) playerMove(dirMap[dir]);
      this.classList.add('active');
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      this.classList.remove('active');
    }, { passive: false });
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var dir = this.dataset.dir;
      var dirMap = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };
      if (dirMap[dir] !== undefined) playerMove(dirMap[dir]);
    });
  }

  // Fire button
  fireBtn.addEventListener('touchstart', function (e) {
    e.preventDefault();
    initAudio();
    playerShoot();
  }, { passive: false });
  fireBtn.addEventListener('mousedown', function (e) {
    e.preventDefault();
    initAudio();
    playerShoot();
  });

  // Canvas tap to shoot (touch)
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    initAudio();
    // On mobile, tap canvas to shoot
    if (state.playing && !state.paused && !state.roundOver && state.player.alive) {
      playerShoot();
    }
  }, { passive: false });

  /* ═══════════════════════════════════════════════════════
     PAUSE / RESUME
     ═══════════════════════════════════════════════════════ */

  function togglePause() {
    if (state.matchOver) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle('active', state.paused);
  }

  /* ═══════════════════════════════════════════════════════
     EVENT BINDING
     ═══════════════════════════════════════════════════════ */

  playBtn.addEventListener('click', function () { startGame(); });
  retryBtn.addEventListener('click', function () { startGame(); });
  homeBtn.addEventListener('click', function () { showScreen('title'); updateBestUI(); });
  pauseBtn.addEventListener('click', togglePause);
  resumeBtn.addEventListener('click', togglePause);

  quitBtn.addEventListener('click', function () {
    state.paused = false;
    state.playing = false;
    state.matchOver = true;
    pauseOverlay.classList.remove('active');
    showScreen('title');
    updateBestUI();
  });

  // Window resize
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.playing && !state.matchOver) {
        resizeCanvas();
      }
    }, 200);
  });

  /* ═══════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════ */

  state.ctx = canvas.getContext('2d');
  updateBestUI();
  resizeCanvas();

  // Show demo map on title screen
  state.mapData = MAPS[0].map(function (row) { return row.slice(); });
  state.player.gridX = 1; state.player.gridY = 1;
  state.enemy.gridX = 13; state.enemy.gridY = 8;

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);

})();
