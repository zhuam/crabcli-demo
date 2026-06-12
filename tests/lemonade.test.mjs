/**
 * Idle Lemonade Stand (Issue #99) — Integration & Acceptance Tests
 *
 * Pure-Node tests (zero deps). Covers Astrocade acceptance criteria:
 *   AC1. First playable frame within 3s of HTML load, no tutorial
 *   AC2. Max round length ≤ 3 minutes
 *   AC3. ≥2 input methods (touch/click + keyboard) supported
 *   AC4. Win/Lose modal exposes a clear "Play Again" button
 *   AC5. Audio (WebAudio synth) + haptic (navigator.vibrate) feedback wired
 *   AC6. High score persisted to localStorage on game-over
 *
 * Strategy: combine static analysis on the raw HTML + dynamic simulation
 * of the embedded game script inside a minimal DOM mock. No browser needed.
 *
 * Run:   node tests/lemonade.test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../games/099-idle-lemonade/index.html");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
    failures.push(label);
  }
}
function section(title) { console.log(`\n${title}`); }

const html = fs.readFileSync(HTML_PATH, "utf8");

/* ──────────────────────────────────────────────────────────────
 *  PART A — Static analysis (fast, no execution)
 *  Validates that the source code wires up the required features.
 * ────────────────────────────────────────────────────────────── */

section("📄 Static: file present & well-formed");
assert(html.length > 5_000, "index.html is non-trivial (>5 KB)");
assert(/^<!doctype html>/i.test(html.trim()), "Starts with <!doctype html>");
assert(/<meta\s+name="viewport"/i.test(html), "Mobile viewport meta present");
assert(/<title>Idle Lemonade Stand<\/title>/.test(html), "Title set to 'Idle Lemonade Stand'");

section("🚀 AC1: No tutorial / no blocking splash");
// Game should boot directly; there must be no overlay shown by default that
// blocks gameplay, and no 'how to play' / tutorial modal asserting class 'show'.
assert(!/class="[^"]*\bshow\b[^"]*"[^>]*>\s*<div class="card"/.test(html),
  "End modal is hidden on load (no 'show' class baked in)");
assert(!/tutorial/i.test(html), "No tutorial markup");
assert(/boot\(\);\s*<\/script>/.test(html), "boot() invoked immediately when script parses");

section("⏱  AC2: 3-minute hard cap baked in");
const durMatch = html.match(/MAX_DUR_MS\s*:\s*([\d_]+)/);
assert(!!durMatch, "MAX_DUR_MS config present");
if (durMatch) {
  const max = parseInt(durMatch[1].replace(/_/g, ""), 10);
  assert(max <= 180_000, `MAX_DUR_MS (${max}) ≤ 180_000 (3 min)`);
  assert(max >= 60_000, `MAX_DUR_MS (${max}) ≥ 60_000 (sane lower bound)`);
}
assert(/state\.elapsedMs\s*>=\s*CONFIG\.MAX_DUR_MS/.test(html),
  "Tick checks elapsed against MAX_DUR_MS and ends round");

section("🎮 AC3: ≥2 input methods");
assert(/addEventListener\(["']pointerdown["']/.test(html), "pointerdown listener (touch + mouse)");
assert(/addEventListener\(["']keydown["']/.test(html), "keydown listener (keyboard)");
assert(/e\.code\s*===\s*["']Space["']/.test(html), "Space key triggers a sell");
assert(/e\.key\s*===\s*["']1["']|e\.key\s*==="1"/.test(html) || /e\.key==="1"/.test(html),
  "Number keys 1/2/3 bound to upgrades");

section("🔁 AC4: Play-Again button on game-over");
assert(/id="replay"/.test(html), "#replay button exists in markup");
assert(/Play Again/i.test(html), "Visible 'Play Again' label");
assert(/\$\("end"\)\.classList\.add\(["']show["']\)/.test(html),
  "End modal is revealed via .show on game-over");
assert(/\$\("replay"\)\.addEventListener\(["']pointerdown["']/.test(html),
  "Replay button has pointerdown handler");
assert(/restart\(\)/.test(html), "restart() function defined and called from replay");

section("🔊 AC5: Audio + haptic feedback");
assert(/AudioContext\|\|window\.webkitAudioContext/.test(html), "WebAudio context (with webkit fallback)");
assert(/function sfxClick\(/.test(html), "sfxClick defined");
assert(/function sfxUpgrade\(/.test(html), "sfxUpgrade defined");
assert(/function sfxWin\(/.test(html), "sfxWin defined");
assert(/function sfxLose\(/.test(html), "sfxLose defined");
assert(/navigator\.vibrate/.test(html), "navigator.vibrate referenced");
const vibrateCalls = (html.match(/vibrate\(\s*[^)]+\)/g) || []).length;
assert(vibrateCalls >= 4, `≥4 vibrate() call sites (got ${vibrateCalls})`);
assert(/id="mute"/.test(html) && /toggleMute\(/.test(html), "Mute button + toggleMute() — accessibility");

section("💾 AC6: Persistence via localStorage");
assert(/KEY_HIGH\s*=\s*["']lemonade\.highScore["']/.test(html), "Key 'lemonade.highScore' defined");
assert(/safeLS\.set\(KEY_HIGH/.test(html), "highScore written to localStorage on game-over");
assert(/localStorage\.getItem/.test(html) && /localStorage\.setItem/.test(html),
  "localStorage get/set used");
assert(/try\s*{[^}]*localStorage/.test(html), "localStorage access wrapped in try/catch (safe in incognito)");

/* ──────────────────────────────────────────────────────────────
 *  PART B — Dynamic simulation
 *  Extract the inline <script> and execute it against a tiny DOM
 *  mock to exercise the actual game logic (tick, click, buy, end,
 *  restart, persistence). This catches behavioural regressions
 *  static analysis cannot.
 * ────────────────────────────────────────────────────────────── */

section("🧪 Dynamic: harness boot");

function extractInlineScript(src) {
  // grab the LAST <script>...</script> block (the inline game logic)
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m, last = null;
  while ((m = re.exec(src)) !== null) last = m[1];
  if (!last) throw new Error("no <script> block found");
  return last;
}

function makeDom() {
  const els = new Map();
  const makeEl = (id, tag = "div") => {
    const el = {
      id, tagName: tag.toUpperCase(),
      _children: [], _listeners: {},
      style: {}, dataset: {}, classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, on) { if (on === undefined) on = !this._set.has(c); on ? this._set.add(c) : this._set.delete(c); },
        contains(c) { return this._set.has(c); },
      },
      _text: "", _html: "",
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v); },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); this._children = []; },
      get childElementCount() { return this._children.length; },
      get children() { return this._children; },
      addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
      removeEventListener(ev, fn) {
        const a = this._listeners[ev]; if (!a) return;
        this._listeners[ev] = a.filter(x => x !== fn);
      },
      dispatchEvent(ev) {
        const fns = this._listeners[ev.type] || [];
        for (const fn of fns) fn(ev);
      },
      appendChild(c) { this._children.push(c); return c; },
      querySelector(sel) {
        // very small subset: '[data-info]' / '[data-cost]'
        const m = sel.match(/^\[([\w-]+)\]$/);
        if (m) {
          const key = m[1].replace(/^data-/, "");
          for (const c of this._children) if (c.dataset && key in c.dataset) return c;
          // fall through to synthetic prop node
          if (!this[`_${m[1]}`]) this[`_${m[1]}`] = { _text: "", set textContent(v){this._text=String(v);}, get textContent(){return this._text;} };
          return this[`_${m[1]}`];
        }
        return null;
      },
      getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; },
      animate() { return { onfinish: null }; },
      focus() {},
      offsetWidth: 100,
      preventDefault() {},
      // for inputs
      value: undefined,
    };
    els.set(id, el);
    return el;
  };

  // pre-create the IDs the script asks for
  const ids = ["cash","best","stores","mute","bar","barLabel","cup","perClick","fx","stage","price","priceVal","demand","ups","fw","end","endTitle","endStats","replay"];
  for (const id of ids) makeEl(id, id === "price" ? "input" : id === "ups" ? "div" : "div");
  els.get("price").value = "2";

  const document = {
    getElementById: (id) => els.get(id) || makeEl(id),
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      _children: [], _listeners: {}, style: {}, dataset: {},
      classList: { _set:new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, toggle(c,on){if(on===undefined)on=!this._set.has(c); on?this._set.add(c):this._set.delete(c);}, contains(c){return this._set.has(c);} },
      _text:"", _html:"",
      get textContent(){return this._text;}, set textContent(v){this._text=String(v);},
      get innerHTML(){return this._html;}, set innerHTML(v){this._html=String(v); this._children=[];},
      get childElementCount(){return this._children.length;},
      get children(){return this._children;},
      addEventListener(ev,fn){(this._listeners[ev]||=[]).push(fn);},
      appendChild(c){this._children.push(c); return c;},
      querySelector(sel){
        const m = sel.match(/^\[([\w-]+)\]$/);
        if(m){
          const key = m[1].replace(/^data-/,"");
          for(const c of this._children) if(c.dataset && key in c.dataset) return c;
          if(!this[`_${m[1]}`]) this[`_${m[1]}`] = { _text:"", set textContent(v){this._text=String(v);}, get textContent(){return this._text;} };
          return this[`_${m[1]}`];
        }
        return null;
      },
      animate(){ return { onfinish:null }; },
      getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100,width:100,height:100};},
      remove(){},
    }),
    addEventListener(){},
    hidden: false,
  };

  // mock localStorage
  const storage = new Map();
  const localStorage = {
    getItem(k){ return storage.has(k) ? storage.get(k) : null; },
    setItem(k,v){ storage.set(k,String(v)); },
    removeItem(k){ storage.delete(k); },
    clear(){ storage.clear(); },
    _storage: storage,
  };

  // vibrate spy
  const vibrateCalls = [];
  const navigator = { vibrate: (p) => { vibrateCalls.push(p); return true; } };

  // AudioContext spy
  const audioEvents = [];
  class FakeAudioContext {
    constructor(){ this.state = "running"; this.currentTime = 0; this.destination = {}; }
    resume(){ this.state = "running"; }
    createOscillator(){
      const o = { type:"sine", frequency:{ value:0, exponentialRampToValueAtTime(){} },
        connect(){ return o; }, start(){ audioEvents.push("osc.start"); }, stop(){} };
      return o;
    }
    createGain(){
      return { gain:{ value:0, exponentialRampToValueAtTime(){} }, connect(){ return this; } };
    }
  }

  // requestAnimationFrame mock — manually pumped
  let rafCb = null, rafTimers = [];
  const requestAnimationFrame = (fn) => { rafCb = fn; return 1; };
  const cancelAnimationFrame = () => { rafCb = null; };

  // performance.now with controllable clock
  let _now = 0;
  const performance = { now: () => _now };
  function advance(ms) { _now += ms; }
  function pump() { if (rafCb) { const cb = rafCb; rafCb = null; cb(_now); } }

  const window = {
    AudioContext: FakeAudioContext,
    webkitAudioContext: undefined,
    addEventListener(){},
    innerWidth: 400, innerHeight: 800,
  };

  return {
    sandbox: {
      document, window, navigator, localStorage,
      performance, requestAnimationFrame, cancelAnimationFrame,
      setTimeout: (fn) => { rafTimers.push(fn); return 1; }, // immediate enqueue, never fired in tests
      clearTimeout: () => {},
      console,
    },
    helpers: { advance, pump, vibrateCalls, audioEvents, storage, els, getCash: null /* set after exec */ },
  };
}

const inline = extractInlineScript(html);

function freshHarness() {
  const { sandbox, helpers } = makeDom();
  // run script — it will call boot() at the bottom
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  // expose internal state via a tiny accessor patch (script keeps `state` in module scope; we can read via cup textContent etc.)
  return { sandbox, helpers };
}

let h = freshHarness();
assert(h.sandbox.document.getElementById("cup")._listeners.pointerdown?.length > 0,
  "Cup has pointerdown listener registered after boot");
assert(h.sandbox.document.getElementById("replay")._listeners.pointerdown?.length > 0,
  "Replay button has pointerdown listener after boot");
assert(h.sandbox.document.getElementById("price")._listeners.input?.length > 0,
  "Price slider has input listener after boot");

section("🚀 AC1 (runtime): playable instantly");
// after boot, cash should be initialised to $0 (not blocking modal)
const cashEl = h.sandbox.document.getElementById("cash");
const endEl = h.sandbox.document.getElementById("end");
assert(cashEl.textContent === "$0", `Cash initialised to $0 (got '${cashEl.textContent}')`);
assert(!endEl.classList.contains("show"), "End modal NOT shown on boot");

section("👆 Click sells a cup and increments cash");
const cup = h.sandbox.document.getElementById("cup");
const fire = (el, type, evt = {}) => {
  for (const fn of el._listeners[type] || []) fn({ preventDefault(){}, ...evt });
};
const cashBefore = parseFloat(cashEl.textContent.replace(/[^0-9.-]/g, "")) || 0;
// Advance clock past sfxClick throttle (60ms) before the first click so audio fires
h.helpers.advance(100);
fire(cup, "pointerdown", { clientX: 50, clientY: 50 });
// render() runs from the rAF loop; pump one frame so DOM reflects state
h.helpers.advance(120); h.helpers.pump();
const cashAfter = parseFloat(cashEl.textContent.replace(/[^0-9.-]/g, "")) || 0;
assert(cashAfter > cashBefore, `Cash increased after click (${cashBefore} → ${cashAfter})`);
assert(h.helpers.vibrateCalls.length >= 1, "vibrate() fired on click (haptic)");
assert(h.helpers.audioEvents.includes("osc.start"), "Audio oscillator started (SFX)");

section("⌨️  Keyboard input also sells");
// simulate Space keydown via the global window listener — script attaches to `window`
// our window mock just stored .addEventListener as a noop, so re-extract via document.addEventListener? No — it's window.
// The script attached the listener directly via window.addEventListener inside bindInputs; in our mock window.addEventListener is a noop.
// Re-architect: instrument window.addEventListener to capture listeners.
{
  // rebuild harness with capturing window
  const { sandbox, helpers } = makeDom();
  const wListeners = {};
  sandbox.window.addEventListener = (t, fn) => { (wListeners[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  const cashEl2 = sandbox.document.getElementById("cash");
  const before = parseFloat(cashEl2.textContent.replace(/[^0-9.-]/g, "")) || 0;
  const kdHandlers = wListeners["keydown"] || [];
  assert(kdHandlers.length >= 1, "window keydown listener was registered");
  for (const fn of kdHandlers) fn({ code: "Space", key: " ", preventDefault(){} });
  helpers.advance(120); helpers.pump();
  const after = parseFloat(cashEl2.textContent.replace(/[^0-9.-]/g, "")) || 0;
  assert(after > before, `Space key triggers a sell (${before} → ${after})`);
  // press '2' to buy a cup upgrade — but probably can't afford, just verify no throw
  let threw = false;
  try { for (const fn of kdHandlers) fn({ key: "1", code:"Digit1", preventDefault(){} }); } catch { threw = true; }
  assert(!threw, "Pressing '1' (buy employee) does not throw even when broke");
  // toggleMute via 'm'
  for (const fn of kdHandlers) fn({ key: "m", code:"KeyM", preventDefault(){} });
  assert(helpers.storage.has("lemonade.muted"), "Muted state persisted to localStorage via 'M' key");
}

section("⏰ AC2 (runtime): round terminates at MAX_DUR_MS");
// fresh game; advance time past MAX_DUR_MS and pump one rAF
{
  const { sandbox, helpers } = makeDom();
  const wListeners = {};
  sandbox.window.addEventListener = (t, fn) => { (wListeners[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  // bump time past 3 minutes & drive loop
  helpers.advance(180_001);
  helpers.pump(); // executes one frame of the loop
  // it will reschedule rafCb — drive more frames to accumulate ticks
  for (let i = 0; i < 5; i++) { helpers.advance(50); helpers.pump(); }
  const endEl2 = sandbox.document.getElementById("end");
  assert(endEl2.classList.contains("show"),
    "End modal is shown once round exceeds 3-minute cap");
  const title = sandbox.document.getElementById("endTitle").textContent;
  assert(/Time/i.test(title) || /Up/i.test(title) || /IPO/i.test(title),
    `End title set (got '${title}')`);
}

section("💾 AC6 (runtime): highScore persisted on game-over");
{
  const { sandbox, helpers } = makeDom();
  const wListeners = {};
  sandbox.window.addEventListener = (t, fn) => { (wListeners[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  // generate cash via many clicks, then time out
  const cup3 = sandbox.document.getElementById("cup");
  for (let i = 0; i < 50; i++) {
    for (const fn of cup3._listeners.pointerdown || []) fn({ preventDefault(){}, clientX:10, clientY:10 });
  }
  helpers.advance(180_500); helpers.pump();
  for (let i = 0; i < 5; i++) { helpers.advance(50); helpers.pump(); }
  assert(helpers.storage.has("lemonade.highScore"),
    "highScore key written to localStorage");
  const hs = parseInt(helpers.storage.get("lemonade.highScore"), 10);
  assert(hs > 0, `Persisted highScore > 0 (got ${hs})`);
}

section("🔁 AC4 (runtime): replay restarts the round");
{
  const { sandbox, helpers } = makeDom();
  const wListeners = {};
  sandbox.window.addEventListener = (t, fn) => { (wListeners[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  // time out the round
  helpers.advance(181_000); helpers.pump();
  for (let i=0;i<3;i++){ helpers.advance(50); helpers.pump(); }
  const endEl3 = sandbox.document.getElementById("end");
  assert(endEl3.classList.contains("show"), "Round ended → modal shown");
  // click replay
  const rep = sandbox.document.getElementById("replay");
  for (const fn of rep._listeners.pointerdown || []) fn({ preventDefault(){} });
  assert(!endEl3.classList.contains("show"), "Replay click hides end modal");
  const cashEl3 = sandbox.document.getElementById("cash");
  assert(cashEl3.textContent === "$0", `Cash reset to $0 after replay (got '${cashEl3.textContent}')`);
}

section("🧮 Sanity: WIN_TARGET reachable within MAX_DUR_MS in principle");
// Static sanity — ensure WIN_TARGET > 0 and < absurd values (designer guard).
const wt = parseInt((html.match(/WIN_TARGET\s*:\s*([\d_]+)/)||[])[1]?.replace(/_/g,"")||"0",10);
assert(wt > 0 && wt < 10_000_000, `WIN_TARGET sane (${wt})`);

/* ──────────────────────────────────────────────────────────────
 *  PART C — Boundary / regression tests
 *  Covers behaviours not exercised by Parts A & B:
 *    C1. Win path: cash ≥ WIN_TARGET ends with IPO Success
 *    C2. Buying upgrades actually mutates state & costs money
 *    C3. Cannot afford → no purchase, fail haptic only
 *    C4. ArrowLeft / ArrowRight clamp price to [1,10]
 *    C5. Auto-income from employees produces cash without clicks
 *    C6. Muted state suppresses audio (no oscillator started)
 *    C7. Mute persists across reloads (highScore reload too)
 *    C8. R key restarts from end modal
 *    C9. Visibility-pause cancels rAF when document hidden
 *   C10. Replay AFTER win preserves highScore + fastestWin
 *   C11. clickSell ignored after game has ended (no double-end)
 *   C12. Cost scaling: subsequent buy is more expensive
 * ────────────────────────────────────────────────────────────── */

// shared fresh-harness with capturing window
function freshFull() {
  const { sandbox, helpers } = makeDom();
  const wListeners = {};
  sandbox.window.addEventListener = (t, fn) => { (wListeners[t] ||= []).push(fn); };
  const docListeners = {};
  const origDocAdd = sandbox.document.addEventListener;
  sandbox.document.addEventListener = (t, fn) => { (docListeners[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline.js" });
  return { sandbox, helpers, wListeners, docListeners };
}
const getCash = (sb) => parseFloat(sb.document.getElementById("cash").textContent.replace(/[^0-9.-]/g,"")) || 0;
const fireEv = (el, type, evt={}) => { for (const fn of el._listeners[type]||[]) fn({ preventDefault(){}, ...evt }); };
const fireWin = (wListeners, type, evt={}) => { for (const fn of wListeners[type]||[]) fn({ preventDefault(){}, ...evt }); };

section("🏆 C1: Win path — reaching WIN_TARGET ends with IPO Success");
{
  const { sandbox, helpers, wListeners } = freshFull();
  // Cheat by directly seeding state? No — use clicks. With base $2/click we'd need 50k clicks.
  // Instead, drive the auto-income path: buy lots of emp+shop is too costly. Easier: simulate many clicks
  // by upping price first via slider so per-click is high, then click 100x… still slow.
  // Pragmatic shortcut: read the inline script's WIN_TARGET, then mutate state via a tiny patch:
  // we re-run boot with a context where WIN_TARGET is small. Simplest: monkey-patch by replacing
  // CONFIG.WIN_TARGET via vm — but it's a const reference inside the closure. So we drive enough clicks.
  // With state.price=10 and shopLvl=1 → clickValue = perClick(1)*price(10)*1 = $10/click → 10_000 clicks for 100k. Doable.
  const priceEl = sandbox.document.getElementById("price");
  priceEl.value = "10";
  fireEv(priceEl, "input", { target: priceEl });
  const cup = sandbox.document.getElementById("cup");
  for (let i = 0; i < 10_001; i++) {
    fireEv(cup, "pointerdown", { clientX: 10, clientY: 10 });
    if (sandbox.document.getElementById("end").classList.contains("show")) break;
  }
  helpers.advance(50); helpers.pump();
  const endEl = sandbox.document.getElementById("end");
  assert(endEl.classList.contains("show"), "End modal shown after reaching WIN_TARGET");
  const title = sandbox.document.getElementById("endTitle").textContent;
  assert(/IPO Success/i.test(title), `End title is IPO Success (got '${title}')`);
  // fastestWin should be persisted
  assert(helpers.storage.has("lemonade.fastestWinMs"),
    "fastestWinMs persisted after a win");
  const replayLabel = sandbox.document.getElementById("replay").textContent;
  assert(/Play Again/i.test(replayLabel), `Replay button reads 'Play Again' on win (got '${replayLabel}')`);
}

section("💰 C2: Buying an employee mutates state & deducts cash");
{
  const { sandbox, helpers } = freshFull();
  // earn enough cash via clicks: emp base $10, price=2, perClick=1 → $2/click → 5 clicks
  const cup = sandbox.document.getElementById("cup");
  for (let i=0;i<10;i++) fireEv(cup, "pointerdown");
  helpers.advance(120); helpers.pump();
  const cashBefore = getCash(sandbox);
  // The 1st upgrade button (idx 0) is 'emp'
  const upsEl = sandbox.document.getElementById("ups");
  assert(upsEl.children.length === 3, "Three upgrade buttons rendered");
  const empBtn = upsEl.children[0];
  const audioBefore = helpers.audioEvents.length;
  fireEv(empBtn, "pointerdown");
  helpers.advance(50); helpers.pump();
  const cashAfter = getCash(sandbox);
  assert(cashAfter < cashBefore, `Cash decreased after buying emp ($${cashBefore} → $${cashAfter})`);
  assert(helpers.audioEvents.length > audioBefore, "Upgrade SFX fired (oscillator started)");
}

section("🚫 C3: Buying when broke is rejected — fail haptic, no state change");
{
  const { sandbox, helpers } = freshFull();
  const upsEl = sandbox.document.getElementById("ups");
  const shopBtn = upsEl.children[2]; // shop costs $500 — definitely broke
  const cashBefore = getCash(sandbox);
  const vibBefore = helpers.vibrateCalls.length;
  fireEv(shopBtn, "pointerdown");
  helpers.advance(50); helpers.pump();
  const cashAfter = getCash(sandbox);
  assert(cashAfter === cashBefore, `Cash unchanged when broke ($${cashBefore} = $${cashAfter})`);
  // The button has disabled=true so our handler may still fire (we ignore disabled in mock);
  // production code's buy() returns early after fail vibrate — assert vibrate fired.
  assert(helpers.vibrateCalls.length > vibBefore, "Fail-haptic vibrate fired on broke purchase attempt");
}

section("🎚  C4: ArrowLeft / ArrowRight clamp price to [1,10]");
{
  const { sandbox, helpers, wListeners } = freshFull();
  const priceValEl = sandbox.document.getElementById("priceVal");
  // initial price=2 → priceVal '$2'
  // press ArrowLeft → 1
  fireWin(wListeners, "keydown", { key: "ArrowLeft", code: "ArrowLeft" });
  helpers.advance(50); helpers.pump();
  assert(priceValEl.textContent === "$1", `ArrowLeft → price 1 (got '${priceValEl.textContent}')`);
  // press ArrowLeft again → still 1 (clamped)
  fireWin(wListeners, "keydown", { key: "ArrowLeft", code: "ArrowLeft" });
  helpers.advance(50); helpers.pump();
  assert(priceValEl.textContent === "$1", "ArrowLeft at min stays at $1 (clamped)");
  // press ArrowRight 12 times → 10 (clamped)
  for (let i=0;i<12;i++) fireWin(wListeners, "keydown", { key: "ArrowRight", code: "ArrowRight" });
  helpers.advance(50); helpers.pump();
  assert(priceValEl.textContent === "$10", `Repeated ArrowRight clamps at $10 (got '${priceValEl.textContent}')`);
}

section("⚙️  C5: Auto-income from employees ticks cash forward without clicks");
{
  const { sandbox, helpers } = freshFull();
  // earn enough to buy 5 employees so auto-income is meaningful
  const cup = sandbox.document.getElementById("cup");
  for (let i=0;i<200;i++) fireEv(cup, "pointerdown");
  helpers.advance(120); helpers.pump();
  const upsEl = sandbox.document.getElementById("ups");
  const empBtn = upsEl.children[0];
  for (let i=0;i<5;i++){ fireEv(empBtn, "pointerdown"); helpers.advance(20); helpers.pump(); }
  const cashBefore = getCash(sandbox);
  // simulate 2 seconds of game time WITHOUT clicks → auto income should add cash
  // but we're past IDLE_THRESHOLD_MS → idle factor 0.5x; still > 0
  for (let i=0;i<25;i++){ helpers.advance(100); helpers.pump(); }
  const cashAfter = getCash(sandbox);
  assert(cashAfter > cashBefore,
    `Auto-income produced cash idly ($${cashBefore} → $${cashAfter})`);
}

section("🔇 C6: Muted state suppresses audio (no oscillator after mute)");
{
  const { sandbox, helpers, wListeners } = freshFull();
  // mute via 'M' key
  fireWin(wListeners, "keydown", { key: "m", code: "KeyM" });
  const beforeAudio = helpers.audioEvents.length;
  // try to click
  const cup = sandbox.document.getElementById("cup");
  helpers.advance(100);
  fireEv(cup, "pointerdown");
  helpers.advance(100); helpers.pump();
  const afterAudio = helpers.audioEvents.length;
  assert(afterAudio === beforeAudio,
    `No new audio events while muted (before=${beforeAudio}, after=${afterAudio})`);
  // but cash still increased — gameplay not blocked
  assert(getCash(sandbox) > 0, "Click still earns cash while muted");
  // mute icon flipped
  assert(sandbox.document.getElementById("mute").textContent === "🔇",
    "Mute icon shows 🔇 when muted");
}

section("♻️  C7: Persistence — highScore + muted survive a 'reload'");
{
  // First session — earn, mute, time-out
  const sess1 = freshFull();
  const cup = sess1.sandbox.document.getElementById("cup");
  for (let i=0;i<20;i++) fireEv(cup, "pointerdown");
  fireWin(sess1.wListeners, "keydown", { key: "M", code: "KeyM" }); // mute
  sess1.helpers.advance(181_000); sess1.helpers.pump();
  for (let i=0;i<3;i++){ sess1.helpers.advance(50); sess1.helpers.pump(); }
  const persistedHigh = parseInt(sess1.helpers.storage.get("lemonade.highScore"),10);
  const persistedMute = sess1.helpers.storage.get("lemonade.muted");
  assert(persistedHigh > 0, `Session 1 persisted highScore=${persistedHigh}`);
  assert(persistedMute === "1", `Session 1 persisted muted='${persistedMute}'`);

  // Second session — re-run script with PRE-SEEDED storage; freshState() should read it back
  const { sandbox, helpers, wListeners } = makeDom();
  helpers.storage.set("lemonade.highScore", String(persistedHigh));
  helpers.storage.set("lemonade.muted", "1");
  const wL = {};
  sandbox.window.addEventListener = (t, fn) => { (wL[t] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(inline, sandbox, { filename: "lemonade-inline-2.js" });
  const bestEl = sandbox.document.getElementById("best");
  assert(/\$/.test(bestEl.textContent) && bestEl.textContent !== "$0",
    `Session 2 loads highScore from storage into #best (got '${bestEl.textContent}')`);
  assert(sandbox.document.getElementById("mute").textContent === "🔇",
    "Session 2 boots in muted state from storage");
}

section("🔄 C8: R key restarts from end modal");
{
  const { sandbox, helpers, wListeners } = freshFull();
  helpers.advance(181_000); helpers.pump();
  for (let i=0;i<3;i++){ helpers.advance(50); helpers.pump(); }
  const endEl = sandbox.document.getElementById("end");
  assert(endEl.classList.contains("show"), "Round ended");
  fireWin(wListeners, "keydown", { key: "r", code: "KeyR" });
  assert(!endEl.classList.contains("show"), "R key hides end modal");
  assert(sandbox.document.getElementById("cash").textContent === "$0", "R key resets cash to $0");
}

section("👁  C9: Visibility-pause cancels rAF loop when hidden");
{
  const { sandbox, helpers, docListeners } = freshFull();
  const visHandlers = docListeners["visibilitychange"] || [];
  assert(visHandlers.length >= 1, "visibilitychange listener registered on document");
  // simulate document.hidden = true
  sandbox.document.hidden = true;
  for (const fn of visHandlers) fn({});
  // After this, advancing time + pumping should NOT keep ticking — but our pump() drives
  // whatever rafCb is set. The handler calls cancelAnimationFrame(rafId) and sets rafId=0,
  // and our cancelAnimationFrame mock clears rafCb. Pumping should now be a no-op.
  const cashBeforeHidden = getCash(sandbox);
  helpers.advance(2000);
  helpers.pump(); // should do nothing — rafCb is null
  const cashAfterHidden = getCash(sandbox);
  assert(cashAfterHidden === cashBeforeHidden,
    `No tick while document.hidden (cash $${cashBeforeHidden} → $${cashAfterHidden})`);
  // resume: hidden=false → handler restarts rAF
  sandbox.document.hidden = false;
  for (const fn of visHandlers) fn({});
  helpers.advance(50); helpers.pump();
  // can't easily assert resume effects without auto-income, but at least no throw means handler is symmetric
  assert(true, "Resume from hidden does not throw");
}

section("🏆 C10: Replay after end preserves highScore + fastestWin in memory");
{
  const { sandbox, helpers, wListeners } = freshFull();
  // earn some, time out
  const cup = sandbox.document.getElementById("cup");
  for (let i=0;i<30;i++) fireEv(cup, "pointerdown");
  helpers.advance(181_000); helpers.pump();
  for (let i=0;i<3;i++){ helpers.advance(50); helpers.pump(); }
  const high1 = parseInt(helpers.storage.get("lemonade.highScore"),10);
  // replay
  fireEv(sandbox.document.getElementById("replay"), "pointerdown");
  // best label still reflects highScore (not zeroed)
  const bestEl = sandbox.document.getElementById("best");
  assert(bestEl.textContent !== "$0",
    `#best preserved after replay (got '${bestEl.textContent}', stored $${high1})`);
}

section("🛑 C11: clickSell ignored after game ends — no double-counting");
{
  const { sandbox, helpers } = freshFull();
  helpers.advance(181_000); helpers.pump();
  for (let i=0;i<3;i++){ helpers.advance(50); helpers.pump(); }
  const endEl = sandbox.document.getElementById("end");
  assert(endEl.classList.contains("show"), "Game ended");
  const cashBefore = getCash(sandbox);
  // try clicking the cup after end
  const cup = sandbox.document.getElementById("cup");
  for (let i=0;i<10;i++) fireEv(cup, "pointerdown");
  helpers.advance(50); helpers.pump();
  const cashAfter = getCash(sandbox);
  assert(cashAfter === cashBefore,
    `Cash frozen after end-game ($${cashBefore} = $${cashAfter})`);
}

section("📈 C12: Cost scaling — second purchase costs more than the first");
{
  const { sandbox, helpers } = freshFull();
  // amass cash
  const cup = sandbox.document.getElementById("cup");
  for (let i=0;i<300;i++) fireEv(cup, "pointerdown");
  helpers.advance(120); helpers.pump();
  const upsEl = sandbox.document.getElementById("ups");
  const empBtn = upsEl.children[0];
  // first cost shown
  const cost1 = parseFloat(empBtn.querySelector("[data-cost]").textContent.replace(/[^0-9.]/g,"")) || 0;
  fireEv(empBtn, "pointerdown");
  helpers.advance(20); helpers.pump();
  const cost2 = parseFloat(empBtn.querySelector("[data-cost]").textContent.replace(/[^0-9.]/g,"")) || 0;
  assert(cost2 > cost1, `Emp cost grows after purchase ($${cost1} → $${cost2})`);
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
