/**
 * Chat Master (Issue #58) — Playwright E2E Acceptance Suite
 *
 * Browser-level verification of the six acceptance criteria plus regression
 * checks for the round-1 defects (F1 loss high score, F2 ending judgement,
 * AudioContext leak, stale DOM on character switch).
 *
 *   AC1. First screen playable within 3s, no tutorial
 *   AC2. Single round <= 3 minutes
 *   AC3. At least two of touch / mouse / keyboard
 *   AC4. Clear "play again" button on victory and defeat screens
 *   AC5. Key sound effects and vibration feedback
 *   AC6. High score persisted to localStorage on victory AND defeat
 *
 * Run: node tests/chat-master.e2e.mjs
 * Requires: playwright (>= 1.61) with chromium, e.g. npm i -g playwright
 *
 * Serves the repo root over local HTTP (localStorage behaves like a real
 * deployment, unlike file://), injects spies for AudioContext construction
 * and navigator.vibrate, then drives real user flows.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(REPO_ROOT, "games/058-chat-master/index.html");

// Resolve playwright from the local install first, then common global roots.
function loadPlaywright() {
  const roots = [
    createRequire(import.meta.url),
    createRequire(path.join("/usr/lib/node_modules", "noop.js")),
    createRequire(path.join("/usr/local/lib/node_modules", "noop.js")),
  ];
  for (const req of roots) {
    try { return { pw: req("playwright"), req }; } catch { /* next root */ }
  }
  throw new Error("playwright module not found (npm i -g playwright)");
}
const { pw } = loadPlaywright();
const { chromium } = pw;

/* ---------- tiny static server ---------- */
const server = http.createServer((req, res) => {
  let p = path.join(REPO_ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(REPO_ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const GAME_URL = `http://127.0.0.1:${PORT}/games/058-chat-master/index.html`;

/* ---------- probe injected before page scripts ---------- */
const PROBE = `
(() => {
  window.__acCount = 0;
  window.__vibrations = [];
  const RealAC = window.AudioContext || window.webkitAudioContext;
  if (RealAC) {
    function SpyAC(...args) { window.__acCount += 1; return new RealAC(...args); }
    SpyAC.prototype = RealAC.prototype;
    window.AudioContext = SpyAC;
  }
  try {
    Object.defineProperty(navigator, 'vibrate', {
      value: (ms) => { window.__vibrations.push(ms); return true; },
      configurable: true
    });
  } catch (e) { /* some builds forbid redefining; vibrate checks will report 0 */ }
})();
`;

/* ---------- dialogue graph (extracted from the HTML for AC2 analysis) ---------- */
const html = fs.readFileSync(HTML_PATH, "utf8");
const storyMatch = html.match(/const STORIES = (\{[\s\S]*?\n\});/);
if (!storyMatch) throw new Error("could not extract STORIES from index.html");
const STORIES = new Function(`return (${storyMatch[1]})`)();

function analyzeStory(story) {
  // DFS over the dialogue tree: depth = number of choices made when an
  // ending node is reached. Detects back edges (cycles) via the path stack.
  let min = Infinity, max = 0;
  const endings = new Set();
  let cycles = false;
  const onPath = new Set();
  const dfs = (id, depth) => {
    const node = story.tree[id];
    if (!node) throw new Error(`missing node: ${id}`);
    if (node.ending) {
      endings.add(node.ending);
      min = Math.min(min, depth);
      max = Math.max(max, depth);
      return;
    }
    if (onPath.has(id)) { cycles = true; return; }
    onPath.add(id);
    for (const opt of node.options) dfs(opt.next, depth + 1);
    onPath.delete(id);
  };
  dfs("start", 0);
  return { min, max, endings: [...endings], cycles };
}

/* ---------- flow helpers ---------- */
async function waitForEnabledOptions(page) {
  await page.waitForFunction(
    () => {
      const os = [...document.querySelectorAll("#options .opt")];
      return os.length > 0 && os.every((o) => !o.disabled);
    },
    null,
    { timeout: 15000 },
  );
}
async function choose(page, n) {
  await waitForEnabledOptions(page);
  await page.locator("#options .opt").nth(n - 1).click();
}
async function playPath(page, picks) {
  for (const p of picks) await choose(page, p);
}
async function waitForResult(page) {
  await page.waitForSelector("#victory.active, #defeat.active", { timeout: 20000 });
}
async function newGamePage(browser, opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  await context.addInitScript(PROBE);
  page.on("pageerror", (e) => page.__jsErrors.push(String(e)));
  page.__jsErrors = [];
  await page.goto(GAME_URL, { waitUntil: "load" });
  return { context, page };
}
async function startChar(page, id, { touch = false } = {}) {
  const card = page.locator(`.char-card[onclick="startGame('${id}')"]`);
  if (touch) await card.tap(); else await card.click();
  await waitForEnabledOptions(page);
}
const hs = (page) => page.evaluate(() => localStorage.getItem("chatmaster_hs"));

/* ---------- runner ---------- */
const results = [];
let cur = null;
function scenario(id, ac, title) { cur = { id, ac, title, checks: [] }; results.push(cur); }
function check(ok, label, detail = "") {
  cur.checks.push({ ok: !!ok, label, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${cur.id}] ${label}${detail ? ` (${detail})` : ""}`);
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

try {
  /* ===== S1 — AC1: first screen < 3s, zero external requests, no tutorial ===== */
  scenario("S1", "AC1", "first screen within 3s, no tutorial, no external deps");
  {
    const { context, page } = await newGamePage(browser);
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    const t0 = Date.now();
    await page.goto(GAME_URL, { waitUntil: "load" });
    await page.locator("#splash.active .tap-start").waitFor({ timeout: 5000 });
    const t1 = Date.now();
    check(t1 - t0 < 3000, `splash interactive in ${t1 - t0}ms (< 3000ms)`);
    const external = requests.filter((u) => !u.startsWith(`http://127.0.0.1:${PORT}/`));
    check(external.length === 0, "zero external/sub-resource requests", external.join(", "));
    check((await page.locator(".tutorial, [class*=guide], [class*=onboard]").count()) === 0, "no tutorial/guide markup");
    await page.locator("#splash").click();
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    check(true, "splash click enters character select directly (no tutorial step)");
    check(page.__jsErrors.length === 0, "no page JS errors", page.__jsErrors.join("; "));
    await context.close();
  }

  /* ===== S2 — AC2: dialogue tree bounded, live round << 3 min ===== */
  scenario("S2", "AC2", "single round length <= 3 minutes");
  {
    for (const [cid, story] of Object.entries(STORIES)) {
      const g = analyzeStory(story);
      check(!g.cycles, `${cid}: dialogue tree is acyclic`);
      check(g.min >= 1 && g.max <= 10, `${cid}: every path ends in ${g.min}-${g.max} choices (<= 10)`);
      check(
        ["good", "normal", "bad"].every((e) => g.endings.includes(e)),
        `${cid}: all 3 endings reachable`, g.endings.join("/"),
      );
    }
    const { context, page } = await newGamePage(browser);
    const t0 = Date.now();
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    const elapsed = Date.now() - t0;
    check(elapsed < 180000, `automated full round wall-clock ${elapsed}ms (< 180000ms)`);
    await context.close();
  }

  /* ===== S3 — AC3 mouse: full victory playthrough by click ===== */
  scenario("S3", "AC3", "mouse input drives a full game");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    check(await page.locator("#victory.active").count() === 1, "mouse-driven playthrough reaches victory");
    const title = await page.locator("#ending-title").textContent();
    check(title === "星空告白", `victory ending title is 星空告白`, title);
    await context.close();
  }

  /* ===== S4 — AC3 keyboard: Enter start, digit picks, Escape back ===== */
  scenario("S4", "AC3", "keyboard input drives core gameplay");
  {
    const { context, page } = await newGamePage(browser);
    await page.keyboard.press("Enter");
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    check(true, "Enter starts from splash");
    await startChar(page, "shuo"); // char cards are click/tap only (see report note)
    for (let i = 0; i < 5; i++) {
      await waitForEnabledOptions(page);
      await page.keyboard.press("1");
    }
    await waitForResult(page);
    check(await page.locator("#victory.active").count() === 1, "digit keys 1-9 select options through to ending");
    await page.locator("#victory .btn").click();
    await page.locator("#splash.active").waitFor({ timeout: 5000 });
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await page.keyboard.press("Escape");
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    check(true, "Escape returns from game to character select");
    await context.close();
  }

  /* ===== S5 — AC3 touch: full game via taps ===== */
  scenario("S5", "AC3", "touch input drives a full game");
  {
    const { context, page } = await newGamePage(browser, { hasTouch: true });
    await page.locator("#splash").tap();
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    await startChar(page, "xing", { touch: true });
    for (const p of [1, 1, 1, 1, 1]) {
      await waitForEnabledOptions(page);
      await page.locator("#options .opt").nth(p - 1).tap();
    }
    await waitForResult(page);
    check(await page.locator("#victory.active").count() === 1, "tap-driven playthrough reaches an ending screen");
    await context.close();
  }

  /* ===== S6 — AC4: play-again on victory fully resets ===== */
  scenario("S6", "AC4", "victory screen play-again resets state");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    const btn = page.locator("#victory.active .btn", { hasText: "再来一局" });
    check(await btn.count() === 1, "victory screen has a 再来一局 button");
    await btn.click();
    await page.locator("#splash.active").waitFor({ timeout: 5000 });
    check(true, "再来一局 returns to splash");
    await page.locator("#splash").click();
    await startChar(page, "xing");
    const affinity = await page.locator("#affinity-text").textContent();
    check(affinity.includes("好感度: 10"), `affinity reset to 10 after replay`, affinity);
    check(await page.locator("#chat-area .msg").count() === 1, "chat area cleared on new game (1 fresh message)");
    await context.close();
  }

  /* ===== S7 — AC4: play-again on defeat ===== */
  scenario("S7", "AC4", "defeat screen play-again resets state");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [2, 2, 2, 2, 2]);
    await waitForResult(page);
    check(await page.locator("#defeat.active").count() === 1, "all-low choices reach defeat screen");
    const btn = page.locator("#defeat.active .btn", { hasText: "再来一局" });
    check(await btn.count() === 1, "defeat screen has a 再来一局 button");
    await btn.click();
    await page.locator("#splash.active").waitFor({ timeout: 5000 });
    check(true, "再来一局 returns to splash from defeat");
    await context.close();
  }

  /* ===== S8 — AC5: sound on key events, vibration wired, no AudioContext leak ===== */
  scenario("S8", "AC5", "audio + haptics wired, single AudioContext across replays");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    const ac1 = await page.evaluate(() => window.__acCount);
    check(ac1 === 1, `exactly 1 AudioContext constructed in a full round (got ${ac1})`);
    const vibs = await page.evaluate(() => window.__vibrations);
    check(vibs[0] === 10, `splash vibration 10ms fired`, JSON.stringify(vibs));
    check(vibs.filter((v) => v === 15).length >= 5, `choice vibration 15ms fired per choice (${vibs.filter((v) => v === 15).length}x)`);
    // replay in the same session: context count must NOT grow (leak regression)
    await page.locator("#victory .btn").click();
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    const ac2 = await page.evaluate(() => window.__acCount);
    check(ac2 === 1, `AudioContext still 1 after a second full round (got ${ac2})`);
    await context.close();
  }

  /* ===== S9 — AC6: victory persists high score ===== */
  scenario("S9", "AC6", "victory writes high score to localStorage");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [1, 1, 1, 1, 1]);
    await waitForResult(page);
    const v = await hs(page);
    check(v === "86", `chatmaster_hs == '86' after 86-affinity victory`, `hs=${v}`);
    const disp = await page.locator("#score-display").textContent();
    check(disp.includes("最高好感度: 86"), `victory screen shows best 86`, disp);
    await context.close();
  }

  /* ===== S10 — AC6 / F1 regression: defeat ALSO persists high score ===== */
  scenario("S10", "AC6", "defeat writes high score to localStorage (round-1 F1 regression)");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [2, 2, 2, 2, 2]);
    await waitForResult(page);
    const v = await hs(page);
    check(v === "5", `chatmaster_hs == '5' after 5-affinity defeat`, `hs=${v}`);
    const disp = await page.locator("#defeat-score").textContent();
    check(disp.includes("最终好感度: 5 / 80"), `defeat screen shows 5 / 80`, disp);
    await context.close();
  }

  /* ===== S11 — AC6: high score is a maximum, lower replay does not overwrite ===== */
  scenario("S11", "AC6", "lower score replay keeps the stored maximum");
  {
    const { context, page } = await newGamePage(browser);
    await page.goto(GAME_URL, { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("chatmaster_hs", "86"));
    await page.reload({ waitUntil: "load" });
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [2, 2, 2, 2, 2]);
    await waitForResult(page);
    const v = await hs(page);
    check(v === "86", `chatmaster_hs stays '86' after a 5-affinity defeat`, `hs=${v}`);
    await context.close();
  }

  /* ===== S12 — AC6: corrupted stored value is handled (NaN guard) ===== */
  scenario("S12", "AC6", "corrupted localStorage value does not break high score");
  {
    const { context, page } = await newGamePage(browser);
    await page.goto(GAME_URL, { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("chatmaster_hs", "abc"));
    await page.reload({ waitUntil: "load" });
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [2, 2, 2, 2, 2]);
    await waitForResult(page);
    const v = await hs(page);
    check(v === "5", `'abc' treated as 0, chatmaster_hs becomes '5'`, `hs=${v}`);
    check(page.__jsErrors.length === 0, "no JS errors with corrupted value", page.__jsErrors.join("; "));
    await context.close();
  }

  /* ===== S13 — F2 regression: affinity >= target wins even on a normal ending ===== */
  scenario("S13", "AC/ending", "affinity >= target wins regardless of ending type (round-1 F2 regression)");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "xing");
    await playPath(page, [1, 1, 1, 1, 2]); // 10+12+15+18+18+8 = 81, normal ending
    await waitForResult(page);
    check(await page.locator("#victory.active").count() === 1, "81 affinity + normal ending shows VICTORY (was defeat pre-fix)");
    const title = await page.locator("#ending-title").textContent();
    check(title === "音乐知己", `victory shows the earned normal ending title 音乐知己`, title);
    const v = await hs(page);
    check(v === "81", `chatmaster_hs == '81'`, `hs=${v}`);
    await context.close();
  }

  /* ===== S14 — ending consistency: good ending below target is defeat with coherent copy ===== */
  scenario("S14", "AC/ending", "good ending below target is a coherent defeat");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await playPath(page, [2, 2, 1, 2, 1]); // 10+0+5+10+8+15 = 48, good ending node
    await waitForResult(page);
    check(await page.locator("#defeat.active").count() === 1, "48 affinity + good ending shows defeat (target 80 not met)");
    const disp = await page.locator("#defeat-score").textContent();
    check(disp.includes("48 / 80") && disp.includes("星空告白"), `defeat copy names score and ending`, disp);
    await context.close();
  }

  /* ===== S15 — Major-5 regression: character switch leaves no stale DOM ===== */
  scenario("S15", "stale-DOM", "switching characters clears previous session DOM");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await choose(page, 1);
    await waitForEnabledOptions(page);
    await choose(page, 1); // two choices in, chat has history
    await waitForEnabledOptions(page);
    await page.locator("#game .back").click();
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    await startChar(page, "xing");
    const msgs = page.locator("#chat-area .msg");
    check(await msgs.count() === 1, `xing's game starts with exactly 1 message`, `count=${await msgs.count()}`);
    check((await msgs.first().textContent()).includes("社团招新季"), "the only message is xing's intro (no 朔 leftovers)");
    const header = await page.locator("#char-name").textContent();
    check(header === "星 🎸", `header shows 星 🎸`, header);
    const affinity = await page.locator("#affinity-text").textContent();
    check(affinity.includes("好感度: 10"), `affinity reset to 10 on switch`, affinity);
    check(await page.locator("#options .opt").count() === 2, "xing's start options rendered (2)");
    await context.close();
  }

  /* ===== S16 — round invalidation: abandoned session's timeouts cannot leak into next game ===== */
  scenario("S16", "stale-DOM", "pending timeouts from an abandoned round are invalidated");
  {
    const { context, page } = await newGamePage(browser);
    await page.locator("#splash").click();
    await startChar(page, "shuo");
    await page.locator("#options .opt").nth(0).click(); // schedules 400ms/800ms timers
    await page.waitForTimeout(60);
    await page.locator("#game .back").click(); // abandon before timers fire
    await page.locator("#char-select.active").waitFor({ timeout: 5000 });
    await startChar(page, "xing");
    await page.waitForTimeout(2000); // let the abandoned timers fire
    const body = await page.locator("#chat-area").textContent();
    check(!body.includes("朔眼底的笑意"), "abandoned round's response bubble never appears");
    check(await page.locator("#chat-area .msg").count() === 1, "chat area still has only xing's intro after timers fired");
    check(page.__jsErrors.length === 0, "no JS errors during rapid switch", page.__jsErrors.join("; "));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* ---------- summary ---------- */
const totalChecks = results.flatMap((r) => r.checks);
const failed = totalChecks.filter((c) => !c.ok);
console.log(`\n${totalChecks.length - failed.length}/${totalChecks.length} checks passed across ${results.length} scenarios (${failed.length} failed)`);

const out = {
  game: "058-chat-master",
  issue: 58,
  url: GAME_URL.replace(/:\d+/, `:${PORT}`),
  playwright: pw.chromium ? "playwright+chromium" : "playwright",
  scenarios: results,
  totals: { scenarios: results.length, checks: totalChecks.length, failed: failed.length },
};
const outPath = process.env.RESULTS_OUT || path.resolve(REPO_ROOT, "../artifacts/t3-test/results.json");
try {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`results written to ${outPath}`);
} catch (e) {
  console.log(`could not write results file: ${e.message}`);
}
process.exit(failed.length ? 1 : 0);
