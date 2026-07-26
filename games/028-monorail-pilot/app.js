/**
 * Monorail Pilot — Full Game Logic
 * A monorail train driving game with station timing mechanics.
 */
(function () {
  'use strict';

  /* ===================================================================
     CONFIG
     =================================================================== */
  const LEVELS = [
    {
      name: 'Green Line',
      color: '#00ff88',
      lineId: 'green',
      maxSpeed: 160,
      stations: [
        { name: 'Alderan', targetTime: 6, position: 350 },
        { name: 'Blythe', targetTime: 15, position: 850 },
        { name: 'Crestview', targetTime: 25, position: 1400 }
      ]
    },
    {
      name: 'Blue Line',
      color: '#00aaff',
      lineId: 'blue',
      maxSpeed: 180,
      stations: [
        { name: 'Delta', targetTime: 5, position: 300 },
        { name: 'Echo', targetTime: 13, position: 780 },
        { name: 'Fox Hill', targetTime: 22, position: 1300 },
        { name: 'Grove', targetTime: 32, position: 1900 }
      ]
    },
    {
      name: 'Red Line',
      color: '#ff4444',
      lineId: 'red',
      maxSpeed: 200,
      stations: [
        { name: 'Harbor', targetTime: 4, position: 250 },
        { name: 'Ivy Gate', targetTime: 11, position: 680 },
        { name: 'Junction', targetTime: 19, position: 1150 },
        { name: 'Kingston', targetTime: 28, position: 1680 },
        { name: 'Lakeside', targetTime: 38, position: 2250 }
      ]
    },
    {
      name: 'Purple Line',
      color: '#b44dff',
      lineId: 'purple',
      maxSpeed: 220,
      stations: [
        { name: 'Maple', targetTime: 4, position: 250 },
        { name: 'Northgate', targetTime: 10, position: 620 },
        { name: 'Oaktown', targetTime: 17, position: 1050 },
        { name: 'Pinehurst', targetTime: 25, position: 1520 },
        { name: 'Quarry', targetTime: 33, position: 2000 }
      ]
    },
    {
      name: 'Gold Line',
      color: '#ffd700',
      lineId: 'gold',
      maxSpeed: 240,
      stations: [
        { name: 'River', targetTime: 3.5, position: 220 },
        { name: 'Sunset', targetTime: 9, position: 560 },
        { name: 'Temple', targetTime: 15.5, position: 960 },
        { name: 'Uptown', targetTime: 22, position: 1380 },
        { name: 'Valley', targetTime: 29.5, position: 1840 },
        { name: 'West End', targetTime: 37, position: 2300 }
      ]
    },
    {
      name: 'Rainbow Line',
      color: '#ff6b6b',
      lineId: 'rainbow',
      maxSpeed: 260,
      stations: [
        { name: 'Xanadu', targetTime: 3, position: 200 },
        { name: 'Yarrow', targetTime: 8, position: 510 },
        { name: 'Zephyr', targetTime: 13.5, position: 850 },
        { name: 'Arcadia', targetTime: 19.5, position: 1220 },
        { name: 'Beacon', targetTime: 26, position: 1620 },
        { name: 'Cascade', targetTime: 33, position: 2050 },
        { name: 'Destiny', targetTime: 40.5, position: 2500 }
      ]
    }
  ];

  // Speed scale: km/h → pixels/second
  const SPEED_SCALE = 0.55;
  // Drag factor (fraction of speed lost per second when no input)
  const DRAG = 0.85;
  // Acceleration rate (km/h gained per second of input)
  const ACCEL_RATE = 100;
  // Brake rate (km/h lost per second of input)
  const BRAKE_RATE = 180;
  // Emergency brake deceleration
  const EMERGENCY_BRAKE = 400;
  // Station trigger zone radius (world units)
  const TRIGGER_RADIUS = 30;
  // Star thresholds (seconds off)
  const STAR_3 = 0.5;
  const STAR_2 = 1.5;
  const STAR_1 = 3.0;
  // Track vertical position (fraction of canvas height from bottom)
  const TRACK_Y_FRAC = 0.35;
  // Train fixed screen X (fraction of canvas width from left)
  const TRAIN_X_FRAC = 0.25;
  // Station scroll-ahead distance for rendering
  const RENDER_AHEAD = 400;
  // Star icons
  const STAR_FULL = '★';
  const STAR_EMPTY = '☆';

  /* ===================================================================
     STORAGE
     =================================================================== */
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem('monorail-pilot-best')) || null;
    } catch { return null; }
  }

  function saveBest(data) {
    try {
      localStorage.setItem('monorail-pilot-best', JSON.stringify(data));
    } catch {}
  }

  function loadUnlocked() {
    try {
      return JSON.parse(localStorage.getItem('monorail-pilot-unlocked')) || null;
    } catch { return null; }
  }

  function saveUnlocked(data) {
    try {
      localStorage.setItem('monorail-pilot-unlocked', JSON.stringify(data));
    } catch {}
  }

  function getBest() {
    return loadBest() || { bestScore: 0, totalStars: 0, gamesPlayed: 0, perLevel: [] };
  }

  function getUnlocked() {
    const u = loadUnlocked();
    if (u && u.levels) return u;
    // Default: only first level unlocked
    return { levels: LEVELS.map(function (_, i) { return i === 0; }), settings: {} };
  }

  /* ===================================================================
     DOM REFS
     =================================================================== */
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var titleScreen = document.getElementById('title-screen');
  var gameplayScreen = document.getElementById('gameplay-screen');
  var resultScreen = document.getElementById('result-screen');

  var levelList = document.getElementById('levelList');
  var startBtn = document.getElementById('startBtn');
  var bestScoreDisplay = document.getElementById('bestScoreDisplay');
  var totalStarsDisplay = document.getElementById('totalStarsDisplay');

  var stationDisplay = document.getElementById('stationDisplay');
  var timeDisplay = document.getElementById('timeDisplay');
  var starsDisplay = document.getElementById('starsDisplay');
  var targetDisplay = document.getElementById('targetDisplay');
  var speedDisplay = document.getElementById('speedDisplay');
  var speedFill = document.getElementById('speedFill');
  var accelBtn = document.getElementById('accelBtn');
  var brakeBtn = document.getElementById('brakeBtn');

  var stationOverlay = document.getElementById('stationOverlay');
  var stationCardTitle = document.getElementById('stationCardTitle');
  var stationCardStars = document.getElementById('stationCardStars');
  var stationCardDetail = document.getElementById('stationCardDetail');
  var stationCardTime = document.getElementById('stationCardTime');
  var stationContinueBtn = document.getElementById('stationContinueBtn');

  var resultHeading = document.getElementById('resultHeading');
  var resultScore = document.getElementById('resultScore');
  var resultBreakdown = document.getElementById('resultBreakdown');
  var resultTotalStars = document.getElementById('resultTotalStars');
  var replayBtn = document.getElementById('replayBtn');
  var menuBtn = document.getElementById('menuBtn');

  /* ===================================================================
     SOUND (WebAudio API)
     =================================================================== */
  var audioCtx = null;
  var masterGain = null;
  var accelOsc = null;
  var accelGain = null;
  var brakeNoiseSource = null;
  var brakeNoiseGain = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(audioCtx.destination);
    } catch (e) { audioCtx = null; }
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume()['catch'](function () {});
    }
  }

  function playTone(freq, duration, type, vol) {
    if (!audioCtx || !masterGain) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime((vol || 0.3), audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      osc.stop(audioCtx.currentTime + duration + 0.05);
    } catch {}
  }

  function playMultiple(notes, type, vol) {
    /* notes = [[freq, delay, dur], ...] */
    if (!audioCtx || !masterGain) return;
    try {
      notes.forEach(function (n) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type || 'sine';
        var startTime = audioCtx.currentTime + n[1];
        osc.frequency.setValueAtTime(n[0], startTime);
        gain.gain.setValueAtTime((vol || 0.25), startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + n[2]);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + n[2] + 0.05);
      });
    } catch {}
  }

  function playChime() {
    playMultiple([
      [880, 0, 0.15],
      [1320, 0.12, 0.25]
    ], 'sine', 0.3);
  }

  function playPerfect() {
    playMultiple([
      [523, 0, 0.12],
      [659, 0.1, 0.12],
      [784, 0.2, 0.12],
      [1047, 0.3, 0.35]
    ], 'sine', 0.3);
  }

  function playGood() {
    playMultiple([
      [660, 0, 0.1],
      [880, 0.12, 0.25]
    ], 'triangle', 0.25);
  }

  function playMiss() {
    playTone(220, 0.3, 'sawtooth', 0.15);
  }

  function playWin() {
    playMultiple([
      [523, 0, 0.12],
      [659, 0.12, 0.12],
      [784, 0.24, 0.12],
      [1047, 0.36, 0.5]
    ], 'sine', 0.3);
    setTimeout(function () {
      playMultiple([
        [1047, 0, 0.12],
        [1319, 0.12, 0.12],
        [1568, 0.24, 0.4]
      ], 'sine', 0.25);
    }, 500);
  }

  function playLose() {
    playTone(300, 0.15, 'square', 0.15);
    setTimeout(function () { playTone(200, 0.3, 'square', 0.15); }, 150);
  }

  var humOsc = null;
  var humGain = null;

  function startAccelHum() {
    if (!audioCtx || !masterGain || humOsc) return;
    try {
      humOsc = audioCtx.createOscillator();
      humGain = audioCtx.createGain();
      humOsc.type = 'sawtooth';
      humOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
      humGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      humOsc.connect(humGain);
      humGain.connect(masterGain);
      humOsc.start();
    } catch {}
  }

  function updateAccelHum(speed, maxSpeed) {
    if (!humOsc || !humGain || !audioCtx) return;
    try {
      var ratio = speed / maxSpeed;
      var freq = 60 + ratio * 120;
      humOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      humGain.gain.setValueAtTime(0.02 + ratio * 0.06, audioCtx.currentTime);
    } catch {}
  }

  function stopAccelHum() {
    if (!humOsc) return;
    try {
      humGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      var o = humOsc;
      var g = humGain;
      setTimeout(function () {
        try { o.stop(); } catch {}
        try { o.disconnect(); } catch {}
        try { g.disconnect(); } catch {}
      }, 200);
    } catch {}
    humOsc = null;
    humGain = null;
  }

  function playBrakeScreech() {
    if (!audioCtx || !masterGain) return;
    try {
      var bufferSize = audioCtx.sampleRate * 0.15;
      var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      var source = audioCtx.createBufferSource();
      source.buffer = buffer;
      var bpf = audioCtx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(3000, audioCtx.currentTime);
      bpf.Q.value = 0.5;
      var g = audioCtx.createGain();
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      source.connect(bpf);
      bpf.connect(g);
      g.connect(masterGain);
      source.start();
    } catch {}
  }

  /* ===================================================================
     GAME STATE
     =================================================================== */
  var currentLevel = 0;
  var gameState = {
    level: null,
    levelIndex: 0,
    speed: 0,
    worldX: 0,
    time: 0,
    currentStation: 0,
    stationResults: [],
    isAccelerating: false,
    isBraking: false,
    emergencyBrake: false,
    totalStars: 0,
    totalScore: 0,
    finished: false,
    paused: false
  };

  // Animation frame handle
  var animFrame = null;
  var lastTime = 0;
  var dpr = 1;
  var canvasW = 0;
  var canvasH = 0;

  // Background stars
  var stars = [];
  // City buildings
  var buildings = [];
  var cityOffset = 0;

  /* ===================================================================
     CANVAS SETUP
     =================================================================== */
  function setupCanvas() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvasW = rect.width;
    canvasH = rect.height;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function generateBackground() {
    stars = [];
    buildings = [];
    var count = Math.floor(60 + Math.random() * 20);
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvasW * 3,
        y: Math.random() * canvasH * 0.5,
        r: 0.3 + Math.random() * 0.8,
        a: 0.3 + Math.random() * 0.7
      });
    }
    var bCount = 12 + Math.floor(Math.random() * 6);
    var bWidth = canvasW * 3 / bCount;
    for (var j = 0; j < bCount; j++) {
      var bw = bWidth * (0.6 + Math.random() * 0.8);
      var bh = 20 + Math.random() * 80;
      buildings.push({ x: j * bWidth + (Math.random() - 0.5) * bWidth * 0.5, w: bw, h: bh });
    }
  }

  /* ===================================================================
     SCREEN MANAGEMENT
     =================================================================== */
  function showScreen(screen) {
    [titleScreen, gameplayScreen, resultScreen].forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');
  }

  function switchState(newState) {
    switch (newState) {
      case 'title':
        state = 'title';
        showScreen(titleScreen);
        stopSound();
        stopAccelHum();
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        populateLevelList();
        updateTitleStats();
        break;

      case 'playing':
        state = 'playing';
        showScreen(gameplayScreen);
        resumeAudio();
        if (!animFrame) { lastTime = 0; animFrame = requestAnimationFrame(gameLoop); }
        stationOverlay.hidden = true;
        break;

      case 'station-arrival':
        showScreen(gameplayScreen);
        stationOverlay.hidden = false;
        gameState.paused = true;
        break;

      case 'result':
        state = 'result';
        showScreen(resultScreen);
        stopSound();
        stopAccelHum();
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        populateResultScreen();
        break;

      default:
        break;
    }
  }

  /* ===================================================================
     LEVEL SELECTION
     =================================================================== */
  var selectedLevel = 0;

  function populateLevelList() {
    var unlocked = getUnlocked();
    levelList.innerHTML = '';
    LEVELS.forEach(function (lv, i) {
      var btn = document.createElement('button');
      btn.className = 'level-btn';
      if (i === selectedLevel) btn.classList.add('selected');
      if (!unlocked.levels[i]) btn.classList.add('locked');

      var nameSpan = document.createElement('span');
      nameSpan.className = 'level-btn-name';
      nameSpan.textContent = lv.name;
      nameSpan.style.color = lv.color;
      btn.appendChild(nameSpan);

      if (unlocked.levels[i]) {
        var best = getBest();
        var pd = best.perLevel ? best.perLevel[i] : null;
        var infoSpan = document.createElement('span');
        infoSpan.className = 'level-btn-info';
        if (pd) {
          infoSpan.textContent = lv.stations.length + ' stops · ' + Math.floor(pd.score || 0) + ' pts';
        } else {
          infoSpan.textContent = lv.stations.length + ' stops';
        }
        btn.appendChild(infoSpan);

        if (pd) {
          var starSpan = document.createElement('span');
          starSpan.className = 'level-btn-stars';
          starSpan.textContent = starString(pd.stars || 0, lv.stations.length * 3);
          btn.appendChild(starSpan);
        }

        btn.addEventListener('click', function (idx) {
          return function () {
            if (unlocked.levels[idx]) {
              selectedLevel = idx;
              populateLevelList();
            }
          };
        }(i));
      } else {
        var lockSpan = document.createElement('span');
        lockSpan.className = 'level-btn-stars';
        lockSpan.textContent = '\U0001f512';
        btn.appendChild(lockSpan);
      }

      levelList.appendChild(btn);
    });
  }

  function updateTitleStats() {
    var best = getBest();
    bestScoreDisplay.textContent = 'Best: ' + (best.bestScore || 0);
    totalStarsDisplay.textContent = 'Stars: ' + (best.totalStars || 0);
  }

  function starString(count, max) {
    var s = '';
    for (var i = 0; i < max; i++) {
      s += i < count ? STAR_FULL : STAR_EMPTY;
    }
    return s;
  }

  /* ===================================================================
     START / STOP SOUND
     =================================================================== */
  function stopSound() {
    if (humOsc) stopAccelHum();
  }

  /* ===================================================================
     GAME INIT
     =================================================================== */
  function initLevel(levelIndex) {
    var lv = LEVELS[levelIndex];
    currentLevel = levelIndex;
    gameState = {
      level: lv,
      levelIndex: levelIndex,
      speed: 0,
      worldX: -50,
      time: 0,
      currentStation: 0,
      stationResults: [],
      isAccelerating: false,
      isBraking: false,
      emergencyBrake: false,
      totalStars: 0,
      totalScore: 0,
      finished: false,
      paused: false
    };
    stationOverlay.hidden = true;
    setupCanvas();
    generateBackground();
    updateHUD();
    updateSpeedGauge();
  }

  /* ===================================================================
     STATION EVALUATION
     =================================================================== */
  function evaluateStation() {
    var lv = gameState.level;
    var idx = gameState.currentStation;
    if (idx >= lv.stations.length) return;

    var station = lv.stations[idx];
    var diff = Math.abs(gameState.time - station.targetTime);
    var stars = 0;
    var detail = '';
    var score = 0;

    if (diff <= STAR_3) {
      stars = 3;
      score = 300;
      detail = 'Perfect timing!';
      playPerfect();
      vibrate(100);
    } else if (diff <= STAR_2) {
      stars = 2;
      score = 200;
      detail = 'Good arrival!';
      playGood();
      vibrate(80);
    } else if (diff <= STAR_1) {
      stars = 1;
      score = 100;
      detail = 'Close enough.';
      playChime();
      vibrate(60);
    } else {
      stars = 0;
      score = 0;
      detail = 'Missed the window!';
      playMiss();
      vibrate([50, 30, 50]);
    }

    gameState.stationResults.push({
      name: station.name,
      stars: stars,
      score: score,
      targetTime: station.targetTime,
      actualTime: gameState.time,
      diff: diff
    });
    gameState.totalStars += stars;
    gameState.totalScore += score;

    // Show station overlay
    stationCardTitle.textContent = station.name;
    stationCardStars.textContent = starString(stars, 3);
    stationCardDetail.textContent = detail;
    stationCardTime.textContent = 'Target: ' + station.targetTime.toFixed(1) + 's  |  Arrived: ' + gameState.time.toFixed(1) + 's';

    stationOverlay.hidden = false;
    gameState.paused = true;

    // Check if this was the last station
    if (idx >= lv.stations.length - 1) {
      gameState.finished = true;
      stationContinueBtn.textContent = 'VIEW RESULTS →';
    } else {
      stationContinueBtn.textContent = 'CONTINUE →';
    }
  }

  /* ===================================================================
     HUD UPDATES
     =================================================================== */
  function updateHUD() {
    var lv = gameState.level;
    var idx = gameState.currentStation;
    var maxIdx = lv.stations.length;

    stationDisplay.textContent = (idx + 1) + '/' + maxIdx;
    timeDisplay.textContent = gameState.time.toFixed(1) + 's';

    var total = gameState.totalStars;
    var maxTotal = idx * 3; // max possible up to current
    starsDisplay.textContent = starString(total, Math.max(3, maxIdx * 3));

    if (idx < maxIdx) {
      var st = lv.stations[idx];
      targetDisplay.textContent = st.targetTime.toFixed(1) + 's';
    } else {
      targetDisplay.textContent = '--';
    }
  }

  function updateSpeedGauge() {
    var lv = gameState.level;
    var speed = gameState.speed;
    var maxSpeed = lv ? lv.maxSpeed : 160;
    var pct = Math.min(speed / maxSpeed, 1) * 100;

    speedDisplay.textContent = Math.round(speed);
    speedFill.style.height = pct + '%';

    // Color transition
    if (pct > 80) {
      speedFill.style.background = 'linear-gradient(0deg, #ff2d95 0%, #ff6b00 100%)';
    } else if (pct > 50) {
      speedFill.style.background = 'linear-gradient(0deg, #00f0ff 0%, #ff2d95 100%)';
    } else {
      speedFill.style.background = 'linear-gradient(0deg, #00f0ff 0%, #00ff88 100%)';
    }
  }

  /* ===================================================================
     VIBRATION
     =================================================================== */
  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }

  /* ===================================================================
     CANVAS RENDERING
     =================================================================== */
  function render() {
    var W = canvasW;
    var H = canvasH;
    var lv = gameState.level;
    if (W === 0 || H === 0 || !lv) return;

    // --- Sky ---
    var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#05081a');
    skyGrad.addColorStop(0.6, '#0a0e23');
    skyGrad.addColorStop(1, '#0f1535');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // --- Stars (parallax) ---
    var starOffset = gameState.worldX * 0.05;
    stars.forEach(function (s) {
      var sx = (s.x - starOffset) % (canvasW * 3);
      if (sx < -10) sx += canvasW * 3;
      ctx.globalAlpha = s.a * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // --- City silhouette (parallax) ---
    var cityOff = gameState.worldX * 0.15;
    var trackY = H * (1 - TRACK_Y_FRAC);

    buildings.forEach(function (b) {
      var bx = b.x - cityOff;
      // Wrap
      var wrapW = canvasW * 3;
      bx = ((bx % wrapW) + wrapW) % wrapW - b.w;
      var by = trackY - b.h;

      // Building body
      ctx.fillStyle = '#0d1230';
      ctx.fillRect(bx, by, b.w, b.h);

      // Neon building outline
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, b.w, b.h);

      // Window lights
      var ww = 3;
      var wh = 4;
      var gap = 4;
      for (var wy = by + 6; wy < by + b.h - 6; wy += wh + gap) {
        for (var wx = bx + 4; wx < bx + b.w - 4; wx += ww + gap) {
          if (Math.random() > 0.3) {
            ctx.fillStyle = 'rgba(255, 200, 100, 0.15)';
            ctx.fillRect(wx, wy, ww, wh);
          }
        }
      }
    });

    // --- Track rail bed ---
    var railY = trackY + 8;
    ctx.fillStyle = '#0a0e23';
    ctx.fillRect(0, railY, W, 20);

    // --- Track rail ties ---
    var tieSpacing = 30;
    var tieOffset = gameState.worldX % tieSpacing;
    for (var tx = -tieSpacing + tieOffset; tx < W + tieSpacing; tx += tieSpacing) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.fillRect(tx, railY + 2, 4, 14);
    }

    // --- Track rail line with neon glow ---
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, railY + 9);
    ctx.lineTo(W, railY + 9);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Secondary glow line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, railY + 9);
    ctx.lineTo(W, railY + 9);
    ctx.stroke();

    // --- Draw stations ---
    var viewOffset = gameState.worldX - W * TRAIN_X_FRAC;
    lv.stations.forEach(function (st, i) {
      var sx = st.position - viewOffset;
      if (sx < -60 || sx > W + 60) return;

      var isNext = (i === gameState.currentStation);
      var isPast = (i < gameState.currentStation);
      var stationH = trackY + 8;

      // Platform
      var platW = 50;
      var platH = 14;

      if (isPast && !isNext) {
        // Already visited - dim
        ctx.fillStyle = 'rgba(100, 100, 150, 0.2)';
        ctx.fillRect(sx - platW / 2, stationH, platW, platH);
      } else {
        // Upcoming or current
        ctx.shadowColor = isNext ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)';
        ctx.shadowBlur = isNext ? 15 : 6;
        ctx.fillStyle = isNext ? 'rgba(0, 240, 255, 0.3)' : 'rgba(0, 240, 255, 0.12)';
        ctx.fillRect(sx - platW / 2, stationH, platW, platH);
        ctx.shadowBlur = 0;
      }

      // Platform top highlight
      ctx.fillStyle = isNext ? 'rgba(0, 240, 255, 0.5)' : 'rgba(0, 240, 255, 0.15)';
      ctx.fillRect(sx - platW / 2, stationH, platW, 2);

      // Station pole
      ctx.fillStyle = isNext ? 'rgba(0, 240, 255, 0.4)' : 'rgba(80, 80, 120, 0.3)';
      ctx.fillRect(sx - 1, stationH - 28, 3, 28);

      // Station sign
      ctx.fillStyle = isNext ? '#00f0ff' : 'rgba(100, 100, 150, 0.4)';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i + 1, sx, stationH - 14);

      // Countdown indicator for next station
      if (isNext) {
        var timeRemaining = Math.max(0, st.targetTime - gameState.time);
        var barH = 3;
        var barW = 40;
        var barX = sx - barW / 2;
        var barY = stationH - 34;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(barX, barY, barW, barH);

        var fillRatio = Math.min(1, (st.targetTime - Math.max(0, gameState.time)) / st.targetTime);
        ctx.fillStyle = fillRatio > 0.5 ? '#00ff88' : fillRatio > 0.25 ? '#ffe600' : '#ff2d95';
        ctx.fillRect(barX, barY, barW * fillRatio, barH);
      }
    });

    // --- Train ---
    var trainX = W * TRAIN_X_FRAC;
    var trainY = railY - 14;

    // Train glow
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#1a3a5c';
    ctx.beginPath();
    ctx.roundRect(trainX - 18, trainY - 8, 36, 22, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Train body
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.roundRect(trainX - 16, trainY - 6, 32, 18, 4);
    ctx.fill();

    // Train highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.roundRect(trainX - 12, trainY - 4, 16, 4, 2);
    ctx.fill();

    // Cabin window
    ctx.fillStyle = '#0a0e23';
    ctx.beginPath();
    ctx.roundRect(trainX - 6, trainY - 2, 12, 8, 2);
    ctx.fill();

    // Headlight
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(trainX + 16, trainY + 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Headlight beam
    ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(trainX + 19, trainY);
    ctx.lineTo(trainX + 60, trainY - 15);
    ctx.lineTo(trainX + 60, trainY + 22);
    ctx.lineTo(trainX + 19, trainY + 7);
    ctx.closePath();
    ctx.fill();

    // --- Speed lines ---
    var spd = gameState.speed;
    if (spd > 50) {
      var intensity = Math.min(1, (spd - 50) / 150);
      ctx.strokeStyle = 'rgba(0, 240, 255, ' + (intensity * 0.15) + ')';
      ctx.lineWidth = 1;
      for (var li = 0; li < 8; li++) {
        var ly = railY + 12 + (Math.random() - 0.5) * 30;
        var ll = 20 + Math.random() * 40;
        ctx.globalAlpha = Math.random() * intensity * 0.3;
        ctx.beginPath();
        ctx.moveTo(trainX - 30 - Math.random() * 50, ly);
        ctx.lineTo(trainX - 30 - Math.random() * 50 + ll, ly);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // --- Destination marker (after all stations passed) ---
    if (gameState.currentStation >= lv.stations.length) {
      var destX = lv.stations[lv.stations.length - 1].position + 100 - viewOffset;
      if (destX > 0 && destX < W) {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH', destX, trackY - 35);
        ctx.shadowBlur = 0;
      }
    }

    // --- Station names floating above ---
    lv.stations.forEach(function (st, i) {
      var sx = st.position - viewOffset;
      if (sx < -80 || sx > W + 80) return;
      if (i < gameState.currentStation) return; // Don't show names of passed stations
      ctx.fillStyle = (i === gameState.currentStation)
        ? 'rgba(0, 240, 255, 0.7)' : 'rgba(200, 200, 255, 0.25)';
      ctx.font = (i === gameState.currentStation) ? 'bold 9px Inter, sans-serif' : '8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.name, sx, trackY - 40);
    });
  }

  /* ===================================================================
     GAME LOOP
     =================================================================== */
  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var rawDt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Clamp dt to avoid spiral of death
    var dt = Math.min(rawDt, 0.05);

    if (state === 'playing' && !gameState.paused) {
      update(dt);
    }

    render();

    // Stop the loop if we're no longer in playing state
    if (state !== 'playing') {
      animFrame = null;
      return;
    }
    animFrame = requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    var lv = gameState.level;
    if (!lv) return;

    // --- Speed mechanics ---
    if (gameState.emergencyBrake) {
      gameState.speed -= EMERGENCY_BRAKE * dt;
      if (gameState.speed < 0) gameState.speed = 0;
    } else if (gameState.isAccelerating) {
      gameState.speed += ACCEL_RATE * dt;
      startAccelHum();
      updateAccelHum(gameState.speed, lv.maxSpeed);
    } else if (gameState.isBraking) {
      gameState.speed -= BRAKE_RATE * dt;
      stopAccelHum();
    } else {
      // Drag
      gameState.speed *= Math.pow(DRAG, dt * 60);
      if (gameState.speed < 0.5) gameState.speed = 0;
      stopAccelHum();
    }

    // Clamp speed
    gameState.speed = Math.max(0, Math.min(gameState.speed, lv.maxSpeed));

    // --- Movement ---
    gameState.worldX += gameState.speed * SPEED_SCALE * dt;
    gameState.time += dt;

    // --- Station detection ---
    if (gameState.currentStation < lv.stations.length && !gameState.paused) {
      var nextStation = lv.stations[gameState.currentStation];
      if (gameState.worldX >= nextStation.position - TRIGGER_RADIUS) {
        evaluateStation();
      }
    }

    // --- Final destination (after last station continue) ---
    // handled by stationContinueBtn click

    updateHUD();
    updateSpeedGauge();
  }

  /* ===================================================================
     RESULT SCREEN
     =================================================================== */
  function populateResultScreen() {
    var lv = gameState.level;
    var results = gameState.stationResults;

    var totalScore = gameState.totalScore;
    var totalStars = gameState.totalStars;
    var maxScore = lv.stations.length * 300;

    // Determine heading
    var pct = maxScore > 0 ? totalScore / maxScore : 0;
    if (pct >= 0.9) {
      resultHeading.textContent = 'PERFECT RUN!';
      playWin();
      vibrate([100, 50, 100, 50, 200]);
    } else if (pct >= 0.6) {
      resultHeading.textContent = 'ROUTE COMPLETE';
      if (gameState.finished) playWin();
      else playLose();
    } else {
      resultHeading.textContent = 'KEEP PRACTICING';
      playLose();
    }

    resultScore.textContent = totalScore;
    resultTotalStars.textContent = starString(totalStars, lv.stations.length * 3);

    // Breakdown
    resultBreakdown.innerHTML = '';
    results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'result-station-row';

      var name = document.createElement('span');
      name.className = 'result-station-name';
      name.textContent = r.name;

      var stars = document.createElement('span');
      stars.className = 'result-station-stars';
      stars.textContent = starString(r.stars, 3);

      var score = document.createElement('span');
      score.className = 'result-station-score';
      score.textContent = r.score;

      row.appendChild(name);
      row.appendChild(stars);
      row.appendChild(score);
      resultBreakdown.appendChild(row);
    });

    // Save progress
    saveProgress(totalScore, totalStars);
  }

  function saveProgress(totalScore, totalStars) {
    var best = getBest();
    best.gamesPlayed = (best.gamesPlayed || 0) + 1;
    best.totalStars = (best.totalStars || 0) + totalStars;
    if (totalScore > (best.bestScore || 0)) {
      best.bestScore = totalScore;
    }

    if (!best.perLevel) best.perLevel = [];
    var lvIdx = gameState.levelIndex;
    var existing = best.perLevel[lvIdx];
    var currentStars = gameState.totalStars;

    if (!existing || currentStars > (existing.stars || 0) || totalScore > (existing.score || 0)) {
      best.perLevel[lvIdx] = {
        stars: Math.max(currentStars, (existing && existing.stars) || 0),
        score: Math.max(totalScore, (existing && existing.score) || 0),
        completed: true
      };
    }

    saveBest(best);

    // Unlock next level
    var unlocked = getUnlocked();
    if (lvIdx < LEVELS.length - 1 && !unlocked.levels[lvIdx + 1]) {
      unlocked.levels[lvIdx + 1] = true;
      saveUnlocked(unlocked);
    }
  }

  /* ===================================================================
     INPUT HANDLING
     =================================================================== */

  // --- Keyboard ---
  var keysDown = {};

  document.addEventListener('keydown', function (e) {
    if (keysDown[e.code]) return;
    keysDown[e.code] = true;

    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        if (state === 'playing' && !gameState.paused) {
          gameState.isAccelerating = true;
          initAudio();
          resumeAudio();
        }
        e.preventDefault();
        break;

      case 'ArrowDown':
      case 'KeyS':
        if (state === 'playing' && !gameState.paused) {
          gameState.isBraking = true;
          initAudio();
          resumeAudio();
          if (gameState.speed > 20) playBrakeScreech();
        }
        e.preventDefault();
        break;

      case 'Space':
        if (state === 'playing' && !gameState.paused) {
          gameState.emergencyBrake = true;
          gameState.isAccelerating = false;
          gameState.isBraking = false;
          stopAccelHum();
          if (gameState.speed > 20) playBrakeScreech();
        }
        e.preventDefault();
        break;

      case 'Enter':
        if (state === 'result') {
          startGame(selectedLevel);
        }
        break;

      default:
        break;
    }
  });

  document.addEventListener('keyup', function (e) {
    keysDown[e.code] = false;

    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        if (state === 'playing') gameState.isAccelerating = false;
        e.preventDefault();
        break;

      case 'ArrowDown':
      case 'KeyS':
        if (state === 'playing') gameState.isBraking = false;
        e.preventDefault();
        break;

      case 'Space':
        if (state === 'playing') gameState.emergencyBrake = false;
        e.preventDefault();
        break;

      default:
        break;
    }
  });

  // --- Touch / Mouse Controls ---
  function setupTouchButton(btn, onStart, onEnd) {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      btn.classList.add('pressed');
      initAudio();
      resumeAudio();
      onStart();
    });

    btn.addEventListener('pointerup', function (e) {
      e.preventDefault();
      btn.classList.remove('pressed');
      onEnd();
    });

    btn.addEventListener('pointerleave', function (e) {
      btn.classList.remove('pressed');
      onEnd();
    });

    btn.addEventListener('pointercancel', function (e) {
      btn.classList.remove('pressed');
      onEnd();
    });
  }

  setupTouchButton(accelBtn,
    function () { if (state === 'playing' && !gameState.paused) { gameState.isAccelerating = true; } },
    function () { gameState.isAccelerating = false; }
  );

  setupTouchButton(brakeBtn,
    function () {
      if (state === 'playing' && !gameState.paused) {
        gameState.isBraking = true;
        if (gameState.speed > 20) playBrakeScreech();
      }
    },
    function () { gameState.isBraking = false; }
  );

  // --- Station overlay continue button ---
  stationContinueBtn.addEventListener('click', function () {
    gameState.currentStation++;
    gameState.paused = false;
    stationOverlay.hidden = true;

    if (gameState.finished && gameState.currentStation >= gameState.level.stations.length) {
      // All stations done - show results
      switchState('result');
    } else {
      // Continue playing
      resumeAudio();
    }
  });

  // --- Result screen buttons ---
  replayBtn.addEventListener('click', function () {
    startGame(selectedLevel);
  });

  menuBtn.addEventListener('click', function () {
    switchState('title');
  });

  // --- Start button ---
  startBtn.addEventListener('click', function () {
    startGame(selectedLevel);
  });

  /* ===================================================================
     START GAME
     =================================================================== */
  function startGame(levelIndex) {
    var unlocked = getUnlocked();
    if (!unlocked.levels[levelIndex]) return;

    initAudio();
    resumeAudio();
    initLevel(levelIndex);
    state = 'playing';
    switchState('playing');
  }

  /* ===================================================================
     RESIZE HANDLING
     =================================================================== */
  var resizeTimeout = null;
  function handleResize() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      if (state === 'playing') {
        setupCanvas();
        generateBackground();
      }
    }, 200);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', function () {
    setTimeout(handleResize, 300);
  });

  /* ===================================================================
     INITIALIZATION
     =================================================================== */
  var state = 'title';

  function init() {
    // roundRect polyfill if needed
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        return this;
      };
    }

    // Default unlock if none saved
    if (!loadUnlocked()) {
      saveUnlocked({ levels: LEVELS.map(function (_, i) { return i === 0; }), settings: {} });
    }

    selectedLevel = 0;
    populateLevelList();
    updateTitleStats();
    showScreen(titleScreen);
  }

  init();

})();
