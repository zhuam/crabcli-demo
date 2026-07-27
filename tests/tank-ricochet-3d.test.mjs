/**
 * Ricochet Tank 3D (Game 101) — Static Acceptance Tests
 *
 * Pure-Node, zero-dep static analysis of the single-file Three.js game
 * plus registry/thumbnail integration. Mirrors the tests/ precedent
 * (lemonade / bridge-builder static suites).
 *
 * Covers the analyst-consensus hard constraints:
 *   AC1. Single-file, importmap-pinned three@0.160.0, zero build step
 *   AC2. Ballistics: fixed 120Hz substep, shared traceSegment (preview
 *        + live bullets), reflection renormalization, MAX_BOUNCES cap,
 *        range decay
 *   AC3. dt clamp 33ms, all motion dt-scaled
 *   AC4. Tank factory (hull → turret → muzzle anchor), unified sides
 *   AC5. Lightweight AI state object, 0.5s stuck verdict via accumulated dt
 *   AC6. Random map fairness (spawn safety radius), destructibles
 *   AC7. Chat-window UX: dark boot (no white screen), CDN fallback,
 *        touch targets ≥44px, DPR ≤ 1.5, particle pool ≤ 200
 *   AC8. Hub integration: registry.json entry + thumb.svg
 *
 * Run:   node tests/tank-ricochet-3d.test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(__dirname, "../games/101-tank-ricochet-3d");
const HTML_PATH = path.join(GAME_DIR, "index.html");
const THUMB_PATH = path.join(GAME_DIR, "thumb.svg");
const REGISTRY_PATH = path.resolve(__dirname, "../games/registry.json");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; failures.push(label); }
}
function section(t) { console.log(`\n${t}`); }

section("📄 File present & well-formed");
assert(fs.existsSync(HTML_PATH), "index.html exists");
const html = fs.readFileSync(HTML_PATH, "utf8");
assert(html.length > 40_000, `index.html is substantial (${html.length} bytes)`);
assert(/^<!doctype html>/i.test(html.trim()), "Starts with <!doctype html>");
assert(/<meta\s+name="viewport"[^>]*user-scalable=no/i.test(html), "Viewport locks user-scalable=no");
assert(/viewport-fit=cover/i.test(html), "viewport-fit=cover (notched devices)");
assert(/touch-action:\s*none/i.test(html), "touch-action: none (no scroll/zoom gestures)");
assert(/<title>Ricochet Tank 3D<\/title>/.test(html), "Title set");

section("📦 AC1: importmap pins three@0.160.0, zero build step");
assert(/<script type="importmap">/.test(html), "importmap block present");
assert(/"three":\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build\/three\.module\.js"/.test(html),
  "three pinned to exactly 0.160.0 on jsdelivr (no floating version)");
assert(/<script type="module">\s*\nimport \* as THREE from 'three'/.test(html),
  "module script imports three");
assert(!/new Worker\(/.test(html), "No workers — logic & render share the main loop");
assert(!/https:\/\/fonts\.|design-fonts\.css/.test(html), "No external font requests (local font stack)");

section("🎯 AC2: ricochet ballistics architecture (022 template)");
assert(/SUBSTEP\s*=\s*1\s*\/\s*120/.test(html), "Fixed 120 Hz physics substep");
assert(/MAX_BOUNCES\s*=\s*10/.test(html), "MAX_BOUNCES = 10 hard cap");
const traceDef = /function traceSegment\(/.test(html);
assert(traceDef, "traceSegment() defined");
const traceCalls = (html.match(/traceSegment\(/g) || []).length;
assert(traceCalls >= 4, `traceSegment shared: ≥4 call sites incl. bullets + aim preview (got ${traceCalls})`);
assert(/physAcc\s*\+=/.test(html) && /while\s*\(physAcc\s*>=\s*SUBSTEP\)/.test(html),
  "Fixed-step accumulator drives bullet integration");
assert(/2\s*\*\s*dot\s*\*\s*traceOut\.nx|dirX\s*-=\s*2\s*\*\s*dot/.test(html),
  "Reflection v' = v - 2(v·n)n");
assert(/RENORMALIZE/i.test(html) && /1\s*\/\s*Math\.hypot\(b\.dirX,\s*b\.dirZ\)/.test(html),
  "Speed renormalized after every reflection (no float drift)");
assert(/b\.range\s*-=\s*/.test(html) && /BULLET_RANGE\s*=\s*30/.test(html),
  "Range-decay budget consumed as the shell travels");
assert(/b\.bounces\s*>=\s*MAX_BOUNCES/.test(html), "Bounce cap terminates the shell");
assert(/predLine/.test(html) && /dashSize:\s*0\.45,\s*gapSize:\s*0\.36/.test(html),
  "Aim prediction dashed line (dash 10/8 → 0.45/0.36 world)");
assert(/diamond/.test(html) && /Math\.PI\s*\/\s*4/.test(html), "Diamond bounce-point marker");
assert(/first segment only|never spoil/i.test(html), "Preview draws first segment only (no multi-bounce spoilers)");

section("⏱ AC3: dt handling");
assert(/DT_CLAMP\s*=\s*0\.033/.test(html), "dt clamp = 33ms");
assert(/if\s*\(dt\s*>\s*DT_CLAMP\)\s*dt\s*=\s*DT_CLAMP/.test(html), "Clamp applied in main loop");
assert(/BULLET_SPEED\s*\*\s*sdt/.test(html), "Bullet step scales with substep dt");
assert(/PLAYER_SPEED\s*\*\s*dt/.test(html) && /ENEMY_SPEED\s*\*/.test(html) && /sp\s*\*\s*dt/.test(html),
  "Tank motion scales with dt (005 anti-pattern avoided)");

section("🚜 AC4: unified tank factory");
assert(/function createTank\(/.test(html), "createTank() factory defined");
assert(/const muzzle = new THREE\.Object3D\(\)/.test(html), "Muzzle is an empty Object3D anchor");
assert(/turret\.add\(muzzle\)/.test(html) && /hull\.add\(turret\)/.test(html),
  "Hierarchy hull → turret → muzzle (independent turret rotation)");
assert(/muzzle\.getWorldPosition/.test(html), "Bullet origin read from muzzle world transform");
const factoryCalls = (html.match(/createTank\(/g) || []).length;
assert(factoryCalls >= 3, `Factory used for player and every enemy (got ${factoryCalls} calls)`);

section("🤖 AC5: lightweight AI — no state machine");
assert(/decisionTimer/.test(html) && /preferredEngageDist/.test(html) && /stuckTimer/.test(html),
  "Per-enemy state fields: decisionTimer / preferredEngageDist / stuckTimer");
assert(/lastX/.test(html) && /lastZ/.test(html), "lastX/lastZ tracked for stuck detection");
assert(/STUCK_TIME\s*=\s*0\.5/.test(html), "Stuck threshold 0.5s");
assert(/stuckTimer\s*\+=\s*dt/.test(html), "Stuck verdict accumulates dt (not frame count)");
assert(/TELEGRAPH_T\s*=\s*0\.25/.test(html), "0.25s fire telegraph (fair reaction window)");
assert(/direct shot only/i.test(html), "AI never aims trick shots (fairness)");
assert(/hasLineOfSight/.test(html), "AI requires line-of-sight before firing");

section("🗺 AC6: random map + destructibles + fairness");
assert(/function buildMap\(/.test(html), "buildMap() regenerates layout");
assert(/SAFE_SPAWN_R\s*=\s*5/.test(html), "Spawn safety radius constant");
assert(/Math\.hypot\(x\s*-\s*PLAYER_SPAWN\.x[^)]*\)\s*<\s*SAFE_SPAWN_R/.test(html),
  "Mines/barrels rejected inside player spawn bubble");
assert(/teaching barrel/i.test(html), "Wave-1 teaching barrel at spawn vision edge");
assert(/removeCollider\(/.test(html), "Destructibles leave the collider list on explosion");
assert(/chainT/.test(html) && /CHAIN_R/.test(html), "Barrel chain-detonation queue");
assert(/InstancedMesh/.test(html), "InstancedMesh for repeat geometry (walls/barrels/mines/bullets)");
assert(/MAX_PARTICLES\s*=\s*200/.test(html), "Particle pool hard cap 200");

section("📱 AC7: chat-window UX hard constraints");
assert(/background:\s*var\(--bg\)[^}]*zero white screen/i.test(html),
  "body paints #04070B before any asset (zero white screen)");
assert(/id="boot"/.test(html) && /boot-fill/.test(html), "Boot overlay with segmented progress bar");
assert(/加载失败/.test(html), "Visible CDN-failure fallback message");
assert(/setTimeout\(function\s*\(\)\s*{[^}]*__bootFail|15000/.test(html), "Boot watchdog timeout");
assert(/DPR_CAP\s*=\s*1\.5/.test(html) && /Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*DPR_CAP\)/.test(html),
  "setPixelRatio(min(devicePixelRatio, 1.5))");
assert(/width:132px;height:132px/.test(html), "Move joystick 132px ring");
assert(/width:92px;height:92px/.test(html), "FIRE button 92px");
assert(/width:58px;height:58px/.test(html), "Joystick knob 58px");
assert(/min-height:44px|min-width:44px/.test(html), "≥44px touch-target floor");
assert(/navigator\.vibrate/.test(html), "Haptic feedback wired");
assert(/AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(html), "WebAudio with webkit fallback");
assert(/safeLS/.test(html) && /try\s*{\s*return localStorage/.test(html),
  "localStorage guarded for private mode");
assert(/visibilitychange/.test(html), "Visibility pause/resume handled");

section("🏠 AC8: hub integration");
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const entry = registry.games.find(g => g.id === "tank-ricochet-3d");
assert(!!entry, "registry.json contains tank-ricochet-3d entry");
if (entry) {
  assert(entry.path === "/games/101-tank-ricochet-3d/", "path field correct");
  assert(entry.thumbnail === "/games/101-tank-ricochet-3d/thumb.svg", "thumbnail field correct");
  assert(entry.hasServer === false, "hasServer false (pure client game)");
  assert(typeof entry.category === "string" && entry.tags.length >= 3, "category + tags present");
  for (const f of ["id", "name", "description", "players", "version", "featured", "rating"]) {
    assert(f in entry, `schema field '${f}' present`);
  }
}
assert(fs.existsSync(THUMB_PATH), "thumb.svg exists");
const thumb = fs.readFileSync(THUMB_PATH, "utf8");
assert(/^<svg /.test(thumb.trim()) && thumb.includes("</svg>"), "thumb.svg is well-formed SVG");
assert(thumb.includes("#BBF351") && thumb.includes("#00BCFF"), "thumb uses the neon palette");
assert(thumb.includes("#04070B"), "thumb background matches the game bg");

section("🎮 Gameplay surface");
assert(/MAX_HP\s*=\s*5/.test(html), "HP 5 segments");
assert(/hp-cell/.test(html) && (html.match(/class="hp-cell"/g) || []).length === 5, "5 HP cells in HUD markup");
assert(/WAVE/.test(html) && /score-chip/.test(html), "HUD exposes WAVE + SCORE chips");
assert(/padStart\(6,\s*'0'\)/.test(html), "Score rendered 6-digit tabular");
assert(/MAX_WAVES\s*=\s*5/.test(html), "5-wave victory structure");
assert(/VICTORY/.test(html) && /DESTROYED/.test(html), "Win/lose result dual state");
assert(/btn-restart/.test(html) && /再来一局/.test(html), "Restart CTA on result screen");
assert(/addEventListener\(["']keydown["']/.test(html) && /addEventListener\(["']pointerdown["']/.test(html),
  "≥2 input methods (pointer + keyboard)");
assert(/back-to-hub/.test(html), "Shared back-to-hub chrome referenced");

/* ────────────── results ────────────── */
console.log(`\n${"═".repeat(48)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed ? 1 : 0);
