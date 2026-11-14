/* Targeted browser regressions. Uses fixture states to isolate UI behavior;
 * test/browser.js separately verifies the complete journey with real input.
 * node test/browser-ui.js
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

async function main() {
  const root = path.resolve(__dirname, "..");
  const out = process.env.DROP_CAPTURE_DIR || "/tmp/drop-validation";
  fs.mkdirSync(out, { recursive: true });
  // Snapshot the three source files so a concurrent edit cannot invalidate
  // the route version between saving a session and reloading it in this test.
  const sources = new Map(["index.html", "game.js", "render.js", "vendor/three.min.js"].map(name => [name, fs.readFileSync(path.join(root, name))]));
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").pathname.replace(/^\//, "") || "index.html";
    if (!sources.has(name)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8");
    res.end(sources.get(name));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    let phase = "initial load";
    page.on("pageerror", error => {
      const detail = phase + "\n" + (error.stack || error.message);
      errors.push(detail);
      console.error("BROWSER ERROR", detail);
    });
    await page.goto("http://127.0.0.1:" + server.address().port + "/");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, "ui-intro.png") });

    await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS.find(h => h.k === "trophy");
      Object.assign(s, { intro: 0, holdIndex: h.i, origin: h.i, y: h.y + .22, z: h.z, attached: true, mode: "ledge", seenRelease: true, mask: 15 });
      prologueLeft = 0;
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.firstMem = document.querySelector(".mem"));
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => firstMem === document.querySelector(".mem")), "drop buttons survive intervening animation frames");
    await page.screenshot({ path: path.join(out, "ui-pack.png") });
    const box = await page.locator(".mem").first().boundingBox();
    const client = await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(150);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(200);
    const dropped = await page.evaluate(() => ({ mode: __fx.state.mode, mask: __fx.state.mask, lost: __fx.state.lost.length }));
    assert.equal(dropped.mask, 11);
    assert.equal(dropped.lost, 1);
    console.log("PASS touch drop across animation frames", dropped);

    // Begin audio, then mute an already-playing wind source.
    await page.locator("#mute").click();
    await page.locator("#mute").click();
    await page.waitForTimeout(100);
    await page.locator("#mute").click();
    await page.waitForTimeout(250);
    const audio = await page.evaluate(() => ({ muted, gain: ac ? ac._master.gain.value : null }));
    assert.equal(audio.muted, true);
    assert(audio.gain !== null && audio.gain < .001);
    console.log("PASS mute silences wind and effects", audio);

    await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS[4];
      Object.assign(s, { mode: "play", holdIndex: 4, origin: 4, attached: true, y: h.y - 1, z: h.z, holdT: 1, holding: true, prevHolding: true, launches: 3, mask: 15, lost: [] });
      holding = true;
      window.pauseDraws = 0;
      const draw = FXRender.draw;
      FXRender.draw = function (options) { pauseDraws++; return draw.call(FXRender, options); };
      dispatchEvent(new Event("blur"));
    });
    const pausedTime = await page.evaluate(() => __fx.state.time);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => __fx.state.time), pausedTime);
    assert(await page.evaluate(() => pauseDraws <= 1), "pause renders only one still frame");
    await page.locator("#resumePlay").click();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => __fx.state.launches), 3, "resuming a held gesture must not launch");
    console.log("PASS background pause and safe input reset");

    await page.evaluate(() => dispatchEvent(new Event("blur")));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fangxia-session-v2")).state);
    phase = "reload";
    await page.reload();
    await page.waitForTimeout(200);
    const restored = await page.evaluate(() => ({ paused: __fx.paused, y: __fx.state.y, index: __fx.state.holdIndex, launches: __fx.state.launches }));
    assert(restored.paused, "restore awaits a deliberate resume gesture");
    assert.equal(restored.y, saved.y);
    assert.equal(restored.index, saved.holdIndex);
    assert.equal(restored.launches, saved.launches);
    console.log("PASS reload restores exact interrupted position", restored);

    // Invalid persisted state must be discarded instead of poisoning physics.
    // pagehide correctly saves the live state; inject after that save, before
    // application startup, so this fixture actually reaches restoreSession.
    await page.evaluate(() => sessionStorage.setItem("drop-test-malformed", "1"));
    await page.addInitScript(() => {
      if (sessionStorage.getItem("drop-test-malformed") !== "1") return;
      sessionStorage.removeItem("drop-test-malformed");
      const entry = JSON.parse(localStorage.getItem("fangxia-session-v2"));
      entry.state.attached = "not a boolean";
      localStorage.setItem("fangxia-session-v2", JSON.stringify(entry));
    });
    phase = "reload";
    await page.reload();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => __fx.state.holdIndex), 0);
    assert.equal(await page.evaluate(() => __fx.paused), false);
    console.log("PASS malformed session safely ignored");

    await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS[4];
      Object.assign(s, { mode: "play", holdIndex: 4, origin: 4, attached: true, y: h.y - 1, z: h.z, launches: 1 });
      dispatchEvent(new Event("blur"));
    });
    await page.locator("#resumePlay").click();
    await page.locator("#restart").click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => __fx.state.holdIndex), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("fangxia-session-v2")), null);
    assert.equal(await page.locator("#alt").textContent(), "8米");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => __fx.paused), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => __fx.paused), false);
    console.log("PASS restart clears interrupted run; altitude starts at 8m; Escape toggles pause");

    // A short landscape viewport still exposes every memory choice and Continue.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS.find(h => h.k === "trophy");
      Object.assign(s, { holdIndex: h.i, origin: h.i, y: h.y, z: h.z, mode: "ledge", mask: 15, seenRelease: true });
    });
    await page.waitForTimeout(100);
    for (const selector of ["#pack", "#packKeep"]) {
      const bounds = await page.locator(selector).boundingBox();
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 390, selector + " fits short landscape viewport");
    }
    await page.screenshot({ path: path.join(out, "ui-landscape-pack.png") });
    phase = "before WebGL context loss";
    const canLoseContext = await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      window.__contextLossTest = gl && gl.getExtension("WEBGL_lose_context");
      return !!window.__contextLossTest;
    });
    if (canLoseContext) {
      phase = "WebGL context loss";
      await page.evaluate(() => window.__contextLossTest.loseContext());
      await page.waitForFunction(() => __fx.paused && document.querySelector("#resumePlay").disabled);
      const interruptedTime = await page.evaluate(() => __fx.state.time);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => __fx.state.time), interruptedTime, "physics remains paused while WebGL is unavailable");
      phase = "WebGL context restoration";
      await page.evaluate(() => window.__contextLossTest.restoreContext());
      await page.waitForFunction(() => !document.querySelector("#resumePlay").disabled);
      assert.equal(await page.evaluate(() => __fx.paused), true, "restored graphics still await deliberate resume");
      phase = "resume after WebGL restoration";
      await page.locator("#resumePlay").click();
      assert.equal(await page.evaluate(() => __fx.paused), false);
      await page.waitForFunction(time => __fx.state.time > time, interruptedTime);
      console.log("PASS WebGL context loss / restoration preserves and resumes physics");
    }
    await page.waitForTimeout(250);
    assert.deepEqual(errors, [], "no browser runtime errors");
    console.log("PASS short landscape layout; no browser errors");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
