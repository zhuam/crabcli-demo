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
import vm from "node:vm";
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

/* ────────────── Behavior tests (review rework: C1 physics regression + M2) ──────────────
 * The static regexes above prove constraints are DECLARED; this section runs the
 * REAL physics code — traceSegment / stepBullet / explodeDestructible extracted
 * verbatim from index.html into a vm sandbox with injected colliders and stubs —
 * and proves it BEHAVES. Regression guard for the review P0 (C1: AABB entry-face
 * normal flipped for negative-direction incidence) plus the reflection invariants.
 *
 *   B1. entry-face normal points into the arena — all 4 boundary walls × both
 *       incidence directions (this is exactly what C1 broke)
 *   B2. reflection angle == incidence angle (v' = v - 2(v·n)n)
 *   B3. speed drift < 1e-9 after repeated reflections (renormalization)
 *   B4. MAX_BOUNCES terminates the shell with ZERO phantom zero-normal bounces
 *   B5. 120Hz boundary survival sim — west/north bounce & survive like east/south
 *   B6. barrel/mine hit → explodes, leaves the collider list; self-immunity src
 *   B7. hit counter counts player-owned shells only
 */

function extractFn(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
  if (!m) return null;
  let i = src.indexOf("{", m.index), depth = 1, end = i + 1;
  while (depth && end < src.length) {
    if (src[end] === "{") depth++;
    else if (src[end] === "}") depth--;
    end++;
  }
  return src.slice(m.index, end);
}
function numConst(src, name) {
  const m = src.match(new RegExp(`(?:const|,)\\s*${name}\\s*=\\s*([\\d.]+(?:\\s*/\\s*[\\d.]+)?)`));
  if (!m) throw new Error(`constant ${name} not found in index.html`);
  return vm.runInContext(m[1], vm.createContext({}));
}

const SUBSTEP_V = numConst(html, "SUBSTEP");
const MAX_BOUNCES_V = numConst(html, "MAX_BOUNCES");
const AX_V = numConst(html, "AX"), AZ_V = numConst(html, "AZ"), WALL_T_V = numConst(html, "WALL_T");
const PLAY_X_V = AX_V - WALL_T_V / 2, PLAY_Z_V = AZ_V - WALL_T_V / 2;   /* inner wall faces */

section("⚙️ Behavior harness: extract real physics code into a vm sandbox");
const PHYS_FNS = ["segCircleDist", "traceSegment", "removeCollider", "explodeDestructible", "stepBullet"];
const extracted = {};
for (const n of PHYS_FNS) {
  extracted[n] = extractFn(html, n);
  assert(!!extracted[n], `extracted ${n}() verbatim from index.html`);
}
const CONSTS = ["BULLET_SPEED", "BULLET_RANGE", "MAX_BOUNCES", "SUBSTEP", "TANK_R", "BULLET_R",
  "EXPLODE_R_BARREL", "EXPLODE_R_MINE", "CHAIN_R", "AX", "AZ", "WALL_T"]
  .map((n) => `const ${n} = ${numConst(html, n)};`).join("\n");

const sandbox = { Math, Infinity, console };
vm.createContext(sandbox);
vm.runInContext(`
${CONSTS}
var colliders = [], barrels = [], mines = [], enemies = [];
var player = { alive: false, x: 0, z: 0 };
var state = { hits: 0 };
var traceOut = { dist: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', ref: null };
var __events = { bounces: [], kills: [], explosions: [], playerDamage: 0, enemyDamage: 0 };
function resetEvents() {
  __events.bounces.length = 0; __events.kills.length = 0; __events.explosions.length = 0;
  __events.playerDamage = 0; __events.enemyDamage = 0;
}
function killBullet(b, silent) { b.alive = false; __events.kills.push({ silent, bounces: b.bounces }); }
function onBounce(b, x, z) {
  __events.bounces.push({ x, z, nx: traceOut.nx, nz: traceOut.nz, n: b.bounces, dx: b.dirX, dz: b.dirZ });
}
function damagePlayer() { __events.playerDamage++; }
function damageEnemy(e, b) { __events.enemyDamage++; }
function hideInstance() {}
var barrelBody = {}, barrelCap = {}, mineBase = {}, mineCore = {};   /* hideInstance() arg stubs */
function bigBoom(x, z, radius, owner, src) { __events.explosions.push({ x, z, radius, owner, src }); }
function makeBullet(x, z, dirX, dirZ, owner) {
  return { x, z, dirX, dirZ, range: BULLET_RANGE, bounces: 0, alive: true, owner };
}
${PHYS_FNS.map((n) => extracted[n]).join("\n")}
`, sandbox, { filename: "extracted-physics.js" });

/* the four boundary walls exactly as buildMap() constructs them */
function walls4() {
  const bx = AX_V + WALL_T_V / 2, bz = AZ_V + WALL_T_V / 2;
  return [
    { kind: "aabb", minX: -bx, maxX: bx, minZ: -bz, maxZ: -bz + WALL_T_V },   /* north (-z) */
    { kind: "aabb", minX: -bx, maxX: bx, minZ: bz - WALL_T_V, maxZ: bz },     /* south (+z) */
    { kind: "aabb", minX: -bx, maxX: -bx + WALL_T_V, minZ: -bz, maxZ: bz },   /* west  (-x) */
    { kind: "aabb", minX: bx - WALL_T_V, maxX: bx, minZ: -bz, maxZ: bz },     /* east  (+x) */
  ];
}
function trace(ox, oz, dx, dz, len) {
  const t = sandbox.traceOut;
  t.dist = 0; t.x = 0; t.z = 0; t.nx = 0; t.nz = 0; t.kind = "none"; t.ref = null;
  return sandbox.traceSegment(ox, oz, dx, dz, len, t) ? { ...t } : null;
}
function runToDeath(b, maxSteps = 5000) {
  let steps = 0;
  while (b.alive && steps++ < maxSteps) sandbox.stepBullet(b, SUBSTEP_V);
  return steps;
}
const unit = (nx, nz) => Math.hypot(nx, nz);
const isPhantom = (e) => unit(e.nx, e.nz) < 0.5;   /* a real bounce normal is always unit length */

section("🧭 B1: entry-face normal points into the arena (C1 regression)");
sandbox.colliders = walls4();
const b1cases = [
  /* [label, ox, oz, dx, dz, expectNx, expectNz, expectDist] */
  ["WEST wall, fired from inside (-x)", 0, 0, -1, 0, +1, 0, PLAY_X_V],
  ["WEST wall, fired from outside (+x)", -bxOut(), 0, +1, 0, -1, 0, null],
  ["EAST wall, fired from inside (+x)", 0, 0, +1, 0, -1, 0, PLAY_X_V],
  ["EAST wall, fired from outside (-x)", +bxOut(), 0, -1, 0, +1, 0, null],
  ["NORTH wall, fired from inside (-z)", 0, 0, 0, -1, 0, +1, PLAY_Z_V],
  ["NORTH wall, fired from outside (+z)", 0, -bzOut(), 0, +1, 0, -1, null],
  ["SOUTH wall, fired from inside (+z)", 0, 0, 0, +1, 0, -1, PLAY_Z_V],
  ["SOUTH wall, fired from outside (-z)", 0, +bzOut(), 0, -1, 0, +1, null],
];
function bxOut() { return AX_V + 8; }
function bzOut() { return AZ_V + 7; }
for (const [label, ox, oz, dx, dz, ex, ez, eDist] of b1cases) {
  const t = trace(ox, oz, dx, dz, 60);
  assert(!!t, `${label}: hit registered`);
  if (!t) continue;
  assert(t.nx === ex && t.nz === ez, `${label}: normal = (${ex}, ${ez}), got (${t.nx}, ${t.nz})`);
  assert(t.nx * dx + t.nz * dz < 0, `${label}: normal opposes incidence (dot < 0)`);
  if (eDist !== null) assert(Math.abs(t.dist - eDist) < 1e-9, `${label}: hit distance ${eDist} (inner face)`);
}
{
  /* oblique negative-direction incidence must also report the right face */
  const t = trace(0, 0, -0.8, -0.6, 60);
  assert(!!t && t.nx === 1 && t.nz === 0, `oblique (-0.8,-0.6): west face first, normal (+1, 0), got (${t && t.nx}, ${t && t.nz})`);
}

section("🪞 B2: reflection angle == incidence angle");
{
  sandbox.colliders = walls4();
  sandbox.resetEvents();
  const b = sandbox.makeBullet(0, 0, -0.8, -0.6, "player");
  let steps = 0;
  while (b.alive && sandbox.__events.bounces.length === 0 && steps++ < 5000) sandbox.stepBullet(b, SUBSTEP_V);
  const ev = sandbox.__events.bounces[0];
  assert(!!ev, "first bounce occurred");
  if (ev) {
    const n = { x: ev.nx, z: ev.nz };
    const dIn = { x: -0.8, z: -0.6 }, dOut = { x: b.dirX, z: b.dirZ };
    const dotIn = dIn.x * n.x + dIn.z * n.z, dotOut = dOut.x * n.x + dOut.z * n.z;
    assert(Math.abs(dotOut + dotIn) < 1e-9, `normal component flips sign (in ${dotIn.toFixed(3)} → out ${dotOut.toFixed(3)})`);
    /* tangent component (perpendicular to n) preserved → equal angles */
    const tan = { x: -n.z, z: n.x };
    const tIn = dIn.x * tan.x + dIn.z * tan.z, tOut = dOut.x * tan.x + dOut.z * tan.z;
    assert(Math.abs(tOut - tIn) < 1e-9, "tangent component preserved (angle in == angle out)");
    const rx = dIn.x - 2 * dotIn * n.x, rz = dIn.z - 2 * dotIn * n.z;
    assert(Math.abs(dOut.x - rx) < 1e-9 && Math.abs(dOut.z - rz) < 1e-9, "v' = v - 2(v·n)n matches exactly");
  }
}

section("♻️ B3+B4: renormalization drift < 1e-9 and MAX_BOUNCES termination, zero phantom bounces");
{
  /* narrow corridor (2u gap) forces many fast bounces — the phantom-bounce breeding ground */
  sandbox.colliders = [
    { kind: "aabb", minX: -1.4, maxX: -1.0, minZ: -5, maxZ: 5 },
    { kind: "aabb", minX: 1.0, maxX: 1.4, minZ: -5, maxZ: 5 },
  ];
  sandbox.resetEvents();
  const b = sandbox.makeBullet(0, 0, 1, 0, "player");
  runToDeath(b);
  const evs = sandbox.__events.bounces;
  assert(!b.alive, "shell terminated");
  assert(b.bounces === MAX_BOUNCES_V, `terminated by MAX_BOUNCES=${MAX_BOUNCES_V} (got ${b.bounces})`);
  assert(evs.length === MAX_BOUNCES_V, `exactly ${MAX_BOUNCES_V} bounce events (got ${evs.length})`);
  const phantoms = evs.filter(isPhantom).length;
  assert(phantoms === 0, `zero phantom zero-normal bounces (got ${phantoms}) — C1 fixed`);
  const maxDrift = Math.max(...evs.map((e) => Math.abs(unit(e.dx, e.dz) - 1)));
  assert(maxDrift < 1e-9, `speed drift after ${evs.length} reflections < 1e-9 (max ${maxDrift.toExponential(3)})`);
}

section("🧪 B5: 120Hz boundary survival — west/north must bounce like east/south");
{
  const cases = [
    ["WEST (-x)", -PLAY_X_V + 1, 0, -1, 0],
    ["EAST (+x)", PLAY_X_V - 1, 0, +1, 0],
    ["NORTH (-z)", 0, -PLAY_Z_V + 1, 0, -1],
    ["SOUTH (+z)", 0, PLAY_Z_V - 1, 0, +1],
  ];
  for (const [label, x, z, dx, dz] of cases) {
    sandbox.colliders = walls4();
    sandbox.resetEvents();
    const b = sandbox.makeBullet(x, z, dx, dz, "player");
    for (let i = 0; i < 120 && b.alive; i++) sandbox.stepBullet(b, SUBSTEP_V);   /* 1.0s @120Hz */
    const evs = sandbox.__events.bounces;
    const phantoms = evs.filter(isPhantom).length;
    assert(b.alive, `${label}: shell survives 1.0s (pre-fix: died at bounce ${MAX_BOUNCES_V} in ~67ms)`);
    assert(evs.length === 1, `${label}: exactly 1 bounce (got ${evs.length})`);
    assert(phantoms === 0, `${label}: zero phantom zero-normal bounces`);
    assert(Math.abs(b.x) < PLAY_X_V && Math.abs(b.z) < PLAY_Z_V, `${label}: pushed OUT of the wall after bounce`);
  }
  /* oblique multi-surface flight across the full arena */
  sandbox.colliders = walls4();
  sandbox.resetEvents();
  const ob = sandbox.makeBullet(0, 0, -0.8, -0.6, "player");
  for (let i = 0; i < 240 && ob.alive; i++) sandbox.stepBullet(ob, SUBSTEP_V);   /* 2.0s */
  assert(ob.alive && sandbox.__events.bounces.filter(isPhantom).length === 0,
    "oblique (-0.8,-0.6) flight: alive, no phantom bounces");
  assert(Math.abs(ob.x) < PLAY_X_V && Math.abs(ob.z) < PLAY_Z_V, "oblique flight stays inside the inner faces");
}

section("💥 B6: barrel/mine hit → explodes, leaves collider list, self-immunity src");
{
  const barrelObj = { x: 0, z: -5, alive: true, inst: 0, chainT: -1, chainOwner: null };
  const barrelObj2 = { x: 3, z: 0, alive: true, inst: 1, chainT: -1, chainOwner: null };
  const mineObj = { x: 0, z: 6, alive: true, inst: 0 };
  sandbox.barrels = [barrelObj, barrelObj2];
  sandbox.mines = [mineObj];
  sandbox.enemies = [];
  sandbox.player = { alive: false, x: 0, z: 0 };

  sandbox.colliders = [...walls4(),
    { kind: "circle", x: barrelObj.x, z: barrelObj.z, r: 0.58, ctype: "barrel", ref: barrelObj },
    { kind: "circle", x: barrelObj2.x, z: barrelObj2.z, r: 0.58, ctype: "barrel", ref: barrelObj2 },
    { kind: "circle", x: mineObj.x, z: mineObj.z, r: 0.52, ctype: "mine", ref: mineObj }];
  sandbox.resetEvents();
  const pb = sandbox.makeBullet(0, 0, 0, -1, "player");
  runToDeath(pb);
  assert(barrelObj.alive === false, "player shell: barrel exploded");
  assert(!sandbox.colliders.some((c) => c.ref === barrelObj), "player shell: barrel removed from collider list");
  assert(sandbox.__events.explosions.length === 1 && sandbox.__events.explosions[0].src === "player-self"
    && sandbox.__events.explosions[0].owner === "player",
    "player shell: bigBoom src='player-self' (self-explosion immunity)");

  sandbox.resetEvents();
  const mb = sandbox.makeBullet(0, 0, 0, 1, "player");
  runToDeath(mb);
  assert(mineObj.alive === false && !sandbox.colliders.some((c) => c.ref === mineObj),
    "player shell: mine exploded and removed from collider list");
  assert(sandbox.__events.explosions[0] && sandbox.__events.explosions[0].src === "player-self",
    "player shell on mine: src='player-self'");

  sandbox.resetEvents();
  const eb = sandbox.makeBullet(-3, 0, 1, 0, "enemy");
  runToDeath(eb);
  assert(barrelObj2.alive === false, "enemy shell: barrel exploded");
  assert(sandbox.__events.explosions[0] && sandbox.__events.explosions[0].src === "barrel",
    "enemy shell: src='barrel' — enemy-started blasts still damage the player");
}

section("🎯 B7: hit counter counts player-owned shells only");
{
  sandbox.colliders = walls4();
  sandbox.enemies = [{ alive: true, spawnT: 0, x: 0, z: -5 }];
  sandbox.player = { alive: true, x: 0, z: 8 };
  sandbox.state = { hits: 0 };
  sandbox.resetEvents();
  const p = sandbox.makeBullet(0, 0, 0, -1, "player");
  runToDeath(p);
  assert(sandbox.__events.enemyDamage === 1 && sandbox.state.hits === 1,
    "player shell landing on enemy → hits = 1");
  const e = sandbox.makeBullet(0, 0, 0, 1, "enemy");
  runToDeath(e);
  assert(sandbox.__events.playerDamage === 1 && sandbox.state.hits === 1,
    "enemy shell landing on player → hits unchanged (accuracy stat not polluted)");
  sandbox.state = { hits: 0 };
  sandbox.enemies = [];
  sandbox.player = { alive: false, x: 0, z: 0 };
}

/* ────────────── results ────────────── */
console.log(`\n${"═".repeat(48)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed ? 1 : 0);
