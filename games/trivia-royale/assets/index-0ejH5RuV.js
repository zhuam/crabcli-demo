(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const GAME_CONFIG = {
  SECONDS_PER_QUESTION: 10
};
function recordPlayed(gameId) {
  try {
    const recent = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
    const filtered = recent.filter((p) => p.id !== gameId);
    filtered.unshift({ id: gameId, playedAt: Date.now() });
    localStorage.setItem("recentlyPlayed", JSON.stringify(filtered.slice(0, 10)));
  } catch {
  }
}
function submitGatewayScore(score) {
  fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "trivia-royale", score, metadata: "{}" })
  }).catch(() => {
  });
}
const $ = (id) => document.getElementById(id);
const nameInput = $("name-input");
const joinBtn = $("join-btn");
const lobbyWaiting = $("lobby-waiting");
const roomIdEl = $("room-id");
const playerListEl = $("player-list");
const countdownValue = $("countdown-value");
const qCounter = $("q-counter");
const qText = $("q-text");
const optionsGrid = $("options-grid");
const timeText = $("time-text");
const timerCircle = $("timer-circle");
const timerRing = $("timer-ring");
const answeredBar = $("answered-bar");
const resultsTitle = $("results-title");
const resultsList = $("results-list");
const highScoreArea = $("high-score-area");
const playAgainBtn = $("play-again-btn");
let ws = null;
let playerId = "";
let playerName = "";
let currentQuestionId = "";
let selectedOption = -1;
let hasAnswered = false;
let timerInterval = null;
let timeLeft = 0;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, duration, type = "sine", volume = 0.15) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(1e-3, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
  }
}
function sfxClick() {
  playTone(800, 0.08, "square", 0.1);
}
function sfxCorrect() {
  playTone(523, 0.1);
  setTimeout(() => playTone(659, 0.1), 100);
  setTimeout(() => playTone(784, 0.15), 200);
}
function sfxWrong() {
  playTone(200, 0.3, "sawtooth", 0.1);
}
function sfxCountdown() {
  playTone(440, 0.1, "square", 0.08);
}
function sfxGameOver() {
  playTone(784, 0.15);
  setTimeout(() => playTone(988, 0.15), 150);
  setTimeout(() => playTone(1175, 0.3), 300);
}
function sfxTick() {
  playTone(600, 0.04, "square", 0.05);
}
function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
  }
}
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
}
function getHighScores() {
  try {
    return JSON.parse(localStorage.getItem("trivia_royale_highscores") || "[]");
  } catch {
    return [];
  }
}
function saveHighScore(score, rank, playerCount) {
  const scores = getHighScores();
  const entry = { score, rank, playerCount, date: (/* @__PURE__ */ new Date()).toISOString() };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 10);
  localStorage.setItem("trivia_royale_highscores", JSON.stringify(top));
  return top[0]?.score === score && top[0]?.date === entry.date;
}
function getBestScore() {
  const scores = getHighScores();
  return scores.length > 0 ? scores[0].score : 0;
}
function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}/ws/game/trivia-royale`;
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    console.log("Connected to server");
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };
  ws.onclose = () => {
    console.log("Disconnected");
  };
  ws.onerror = (err) => {
    console.error("WebSocket error", err);
  };
}
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
function handleServerMessage(msg) {
  switch (msg.type) {
    case "joined":
      playerId = msg.playerId;
      playerName = msg.name;
      lobbyWaiting.style.display = "block";
      roomIdEl.textContent = `Room: ${msg.roomId}`;
      joinBtn.style.display = "none";
      nameInput.style.display = "none";
      recordPlayed("trivia-royale");
      vibrate(50);
      break;
    case "room_update":
      renderPlayerList(msg.roomState.players);
      break;
    case "countdown":
      showScreen("countdown");
      countdownValue.textContent = String(msg.value);
      countdownValue.style.animation = "none";
      void countdownValue.offsetHeight;
      countdownValue.style.animation = "countPulse 1s ease";
      sfxCountdown();
      vibrate(100);
      break;
    case "question":
      showScreen("question");
      currentQuestionId = msg.question.id;
      hasAnswered = false;
      selectedOption = -1;
      qCounter.textContent = `Q${msg.questionIndex + 1}/${msg.totalQuestions}`;
      qText.textContent = msg.question.text;
      renderOptions(msg.question.options);
      startTimer(msg.timeLeft);
      break;
    case "time_sync":
      updateTimer(msg.timeLeft);
      break;
    case "answer_result":
      clearTimer();
      revealAnswer(msg.correctIndex, msg.yourScore, msg.yourRank);
      msg.yourScore;
      msg.yourRank;
      if (selectedOption === msg.correctIndex) {
        sfxCorrect();
        vibrate([50, 50, 50]);
      } else {
        sfxWrong();
        vibrate(200);
      }
      break;
    case "game_over":
      showScreen("results");
      renderResults(msg.rankings, msg.winnerId, msg.yourRank, msg.yourScore);
      sfxGameOver();
      vibrate([100, 50, 100, 50, 200]);
      const isNewHigh = saveHighScore(msg.yourScore, msg.yourRank, msg.rankings.length);
      submitGatewayScore(msg.yourScore);
      if (isNewHigh) {
        highScoreArea.innerHTML = '<div class="high-score-badge">🎉 NEW HIGH SCORE!</div>';
      } else {
        highScoreArea.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem;">Best: ${getBestScore()} pts</div>`;
      }
      break;
    case "error":
      console.error("Server error:", msg.code, msg.message);
      break;
  }
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function renderPlayerList(players) {
  playerListEl.innerHTML = players.map((p) => `<span class="player-chip">${escapeHtml(p.name)}</span>`).join("");
}
function renderOptions(options) {
  const labels = ["A", "B", "C", "D"];
  const isDesktop = !("ontouchstart" in window);
  optionsGrid.innerHTML = options.map((opt, i) => `
    <button class="option-btn" data-index="${i}" tabindex="0" aria-label="Option ${labels[i]}: ${opt}">
      ${isDesktop ? `<span class="key-hint">${labels[i]}/${i + 1}</span>` : ""}
      ${opt}
    </button>
  `).join("");
  optionsGrid.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      selectAnswer(idx);
    });
  });
}
function selectAnswer(index) {
  if (hasAnswered) return;
  hasAnswered = true;
  selectedOption = index;
  optionsGrid.querySelectorAll(".option-btn").forEach((btn, i) => {
    if (i === index) btn.classList.add("selected");
  });
  sfxClick();
  vibrate(30);
  answeredBar.textContent = "✓ Answer locked in!";
  send({
    type: "answer",
    questionId: currentQuestionId,
    optionIndex: index,
    timestamp: Date.now()
  });
}
function revealAnswer(correctIndex, score, rank) {
  optionsGrid.querySelectorAll(".option-btn").forEach((btn, i) => {
    if (i === correctIndex) {
      btn.classList.add("reveal-correct");
    } else if (i === selectedOption && i !== correctIndex) {
      btn.classList.add("wrong");
    }
  });
  const scorePopup = document.createElement("div");
  scorePopup.className = "reveal-score";
  scorePopup.textContent = `${score} pts • Rank #${rank}`;
  const questionScreen = $("screen-question");
  questionScreen.appendChild(scorePopup);
  setTimeout(() => scorePopup.remove(), 2500);
}
function renderResults(rankings, winnerId, yourRank, yourScore) {
  const isWinner = winnerId === playerId;
  resultsTitle.textContent = isWinner ? "🏆 YOU WIN!" : "GAME OVER";
  resultsTitle.className = `results-title ${isWinner ? "winner" : ""}`;
  resultsList.innerHTML = rankings.map((p, i) => {
    const isYou = p.id === playerId;
    const rankClass = i < 3 ? `rank-${i + 1}` : "";
    return `
      <div class="result-row ${isYou ? "you" : ""}" style="animation-delay:${i * 0.1}s">
        <span class="rank-badge ${rankClass}">${i + 1}</span>
        <span class="result-name">${escapeHtml(p.name)}${isYou ? " (You)" : ""}</span>
        <span class="result-score">${p.score} pts</span>
      </div>
    `;
  }).join("");
}
const CIRCLE_CIRCUMFERENCE = 150.8;
function startTimer(seconds) {
  timeLeft = seconds;
  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearTimer();
      timeLeft = 0;
    }
    updateTimerDisplay();
    if (timeLeft <= 3 && timeLeft > 0) {
      sfxTick();
      timerRing.classList.add("urgent");
    }
  }, 1e3);
}
function updateTimer(seconds) {
  timeLeft = seconds;
  updateTimerDisplay();
}
function updateTimerDisplay() {
  timeText.textContent = String(Math.max(0, timeLeft));
  const total = GAME_CONFIG.SECONDS_PER_QUESTION;
  const offset = CIRCLE_CIRCUMFERENCE * (1 - timeLeft / total);
  timerCircle.style.strokeDashoffset = String(offset);
  timerRing.classList.toggle("urgent", timeLeft <= 3);
}
function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
document.addEventListener("keydown", (e) => {
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (e.key >= "1" && e.key <= "4") {
    e.preventDefault();
    selectAnswer(parseInt(e.key) - 1);
    return;
  }
  const letterMap = { "a": 0, "b": 1, "c": 2, "d": 3 };
  const lower = e.key.toLowerCase();
  if (lower in letterMap) {
    e.preventDefault();
    selectAnswer(letterMap[lower]);
    return;
  }
  if (e.key === "Enter" && $("screen-lobby").classList.contains("active")) {
    joinGame();
  }
});
joinBtn.addEventListener("click", () => {
  if (audioCtx.state === "suspended") audioCtx.resume();
  joinGame();
});
function joinGame() {
  const name = nameInput.value.trim() || `Player-${Math.floor(Math.random() * 9e3 + 1e3)}`;
  playerName = name;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect();
    const waitJoin = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(waitJoin);
        send({ type: "join", name });
      }
    }, 100);
  } else {
    send({ type: "join", name });
  }
}
playAgainBtn.addEventListener("click", () => {
  sfxClick();
  send({ type: "play_again" });
  showScreen("lobby");
  lobbyWaiting.style.display = "none";
  joinBtn.style.display = "";
  nameInput.style.display = "";
  connect();
  const name = playerName;
  const waitJoin = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitJoin);
      send({ type: "join", name });
    }
  }, 100);
});
connect();
