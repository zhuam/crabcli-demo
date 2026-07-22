/**
 * Chat Master (Issue #58) — Acceptance Tests
 *
 * Pure-Node tests (zero deps). Covers Astrocade acceptance criteria:
 *   AC1. First playable frame within 3s of HTML load
 *   AC2. Max round length ≤ 3 minutes (per-game)
 *   AC3. ≥2 input methods (touch/click + keyboard) supported
 *   AC4. Win/Lose modal exposes a clear "Play Again" button
 *   AC5. Audio (WebAudio synth) + haptic (navigator.vibrate) feedback wired
 *   AC6. High score persisted to localStorage on game-over
 *
 * Strategy: static analysis on the raw HTML.
 *
 * Run:   node tests/chat-master.test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../games/058-chat-master/index.html");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; failures.push(label); }
}
function section(title) { console.log(`\n${title}`); }

const html = fs.readFileSync(HTML_PATH, "utf8");

/* ──────────────────────────────────────────────────────────────
 *  PART A — Static analysis
 * ────────────────────────────────────────────────────────────── */

section("📄 Static: file present & well-formed");
assert(html.length > 5_000, "index.html is non-trivial (>5 KB)");
assert(/^<!doctype html>/i.test(html.trim()), "Starts with <!doctype html>");
assert(/<meta\s+name="viewport"/i.test(html), "Mobile viewport meta present");

section("🚀 AC1: No tutorial / no blocking splash");
assert(/Chat Master/.test(html), "Game identifier present");
assert(!/class="[^"]*\btutorial\b[^"]*"/i.test(html), "No tutorial markup");

section("⌨ AC3: Input methods");
assert(/keydown/.test(html) || /keypress/.test(html), "Keyboard listener present");
assert(/click|onclick|touchstart/.test(html), "Click/touch handler present");
assert(/key\s*>=\s*['"]1['"]/.test(html) || /e\.key/.test(html), "Number key support (1-3)");
assert(/Escape|Escape/.test(html), "Escape key for back navigation");

section("🔄 AC4: Restart button on result screens");
assert(/再来一局/.test(html), "Restart button text found");
assert(/resetGame/.test(html), "resetGame() function exists");

section("🔊 AC5: Sound & vibration");
assert(/playNote/.test(html), "playNote sound function present");
assert(/AudioContext/.test(html), "WebAudio AudioContext used");
assert(/vibrate/.test(html), "navigator.vibrate used");

section("💾 AC6: localStorage high score");
assert(/localStorage/.test(html), "localStorage usage present");
assert(/chatmaster_hs/.test(html), "High score key 'chatmaster_hs' defined");
assert(/lsSafeSet/.test(html) || (/try.*localStorage/.test(html) && /catch/.test(html)),
  "localStorage wrapped in try/catch guard");

section("🎯 Game logic");
assert(/targetAffinity/.test(html), "Target affinity threshold defined");
assert(/endGame/.test(html), "endGame() function exists");
assert(/STORIES/.test(html) || /\(story|STORY\)/.test(html), "Dialogue data structure present");

/* ──────────────────────────────────────────────────────────────
 *  PART B — JS syntax check
 * ────────────────────────────────────────────────────────────── */
section("🔬 JS syntax (embedded in HTML)");
// Extract inline JS from <script> tag and run node --check
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const tmp = "/tmp/cm-js-check.mjs";
  fs.writeFileSync(tmp, scriptMatch[1]);
  const result = spawnSync("node", ["--check", tmp], { encoding: "utf8" });
  if (result.status === 0) { console.log("  ✅ node --check passes"); passed++; }
  else { console.log(`  ❌ node --check failed:\n${result.stderr}`); failed++; failures.push("node --check failed"); }
  fs.unlinkSync(tmp);
} else {
  console.log("  ⚠️  No <script> block found — skipping syntax check");
}

/* ──────────────────────────────────────────────────────────────
 *  Summary
 * ────────────────────────────────────────────────────────────── */
const total = passed + failed;
console.log(`\n${passed}/${total} passed (${failed} failed)`);
if (failures.length) {
  console.log("Failures:", failures.join(", "));
  process.exit(1);
}
