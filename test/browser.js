/* Real browser input journey. Requires Playwright and a running local server.
 * No state injection: the pilot plans on copies, then mouse events drive play.
 * node test/browser.js [http://127.0.0.1:8123] [--mobile] [--screens]
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

async function main() {
  const base = process.argv.find(x => /^https?:/.test(x)) || "http://127.0.0.1:8123";
  const mobile = process.argv.includes("--mobile");
  const screens = process.argv.includes("--screens");
  const fast = process.argv.includes("--fast");
  const fallTest = process.argv.includes("--fall");
  const out = process.env.DROP_CAPTURE_DIR || "/tmp/drop-validation";
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: fast ? { width: 640, height: 480 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => { errors.push(e.stack || e.message); console.error("BROWSER ERROR", e.stack || e.message); });
  page.on("console", m => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });
  const prefix = mobile ? "mobile" : "desktop";
  const capture = name => page.screenshot({ path: path.join(out, prefix + "-" + name + ".png") });
  try {
    if (screens) {
      for (const shot of ["base", "mid", "gale", "charge", "summit", "ending"]) {
        await page.goto(base + "/index.html?shot=" + shot);
        await page.waitForTimeout(1500);
        await capture(shot);
        console.log(prefix, shot, await page.evaluate(() => ({ y: __fx.state.y, mode: __fx.state.mode, quality: __fx.quality })));
      }
      assert.deepEqual(errors, [], "browser console errors");
      return;
    }
    await page.goto(base + "/index.html");
    if (fast) await page.evaluate(() => {
      quality = 0; FXRender.setQuality(0); resize();
      // SwiftShader is much slower than a device GPU. Keep the real input,
      // DOM and 120 Hz physics loop; render one scene per second in this input
      // journey. Separate visual/runtime checks render every frame.
      const draw = FXRender.draw; let drawnAt = -Infinity;
      FXRender.draw = function (o) { const now = performance.now(); if (now-drawnAt >= 1000) { drawnAt=now; draw(o); } };
    });
    await page.addScriptTag({ path: path.join(__dirname, "pilot.js") });
    await page.waitForTimeout(1500);
    await capture("start");
    const position = mobile ? { x: 300, y: 700 } : fast ? { x: 530, y: 415 } : { x: 1100, y: 700 };
    await page.mouse.move(position.x, position.y);
    let holding = false;
    async function press() { if (!holding) { await page.mouse.move(position.x, position.y); await page.mouse.down(); holding = true; } }
    async function release() { if (holding) { await page.mouse.up(); holding = false; } }
    async function read() { return page.evaluate(() => { const s = __fx.state; return { mode: s.mode, i: s.holdIndex, y: s.y, mask: s.mask, crown: s.crown, attached: s.attached, lost: s.lost.length, falls: s.falls, time: s.time, launches: s.launches, holdT: s.holdT, flightT: s.flightT, descending: s.descending, grabT: s.grabT }; }); }
    let stage = "ascent", moves = 0, dropped = false, lastI = -1, setbacks = 0;
    let fallOrigin = null, switched = false;
    const started = Date.now();
    while (Date.now() - started < 15 * 60 * 1000 && moves < 300) {
      const s = await read();
      if (fallOrigin !== null && s.mode === "impact") {
        assert.ok(s.falls > 0, "a badly timed launch must cause a real ground fall");
        await capture("missed-launch-fall");
        assert.deepEqual(errors, []);
        console.log("PASS real-input missed launch falls without magnetic rescue", { from: fallOrigin, falls: s.falls });
        return;
      }
      if (s.i !== lastI) { console.log(JSON.stringify({ stage, moves, ...s })); lastI = s.i; }
      if (s.mode === "ending") {
        await release();
        await page.waitForFunction(() => __fx.state.endingT > 2.1 && Number(getComputedStyle(document.querySelector("#ending")).opacity) > .99);
        await capture(stage === "return-ascent" ? "reclaimed-ending" : "first-ending");
        if (stage === "return-ascent") { assert.equal(s.mask, 15); console.log("PASS browser ascent / drop / ending / descent / pickup / re-ascent", { moves, setbacks, elapsedSeconds: (Date.now() - started) / 1000 }); break; }
        assert.equal(s.mask, 11, "trophy was left below");
        await page.locator("#retrieve").click();
        await page.waitForFunction(() => __fx.state.mode === "play" && __fx.state.descending);
        stage = "descent";
        continue;
      }
      if (stage === "descent" && s.mask === 15 && s.lost === 0) {
        await release(); await page.locator("#directionUp").click();
        await page.waitForFunction(() => !__fx.state.descending);
        assert.equal((await read()).descending, false, "player can select ascent after pickup");
        stage = "return-ascent"; await capture("pickup");
      }
      if (stage === "descent" && s.attached && s.mode === "play" && s.i < 46 && !switched) {
        await release();
        await page.locator("#directionUp").click();
        await page.waitForFunction(() => !__fx.state.descending);
        assert.equal((await read()).descending, false, "up control works during return trip");
        await page.locator("#directionDown").click();
        await page.waitForFunction(() => __fx.state.descending);
        assert.equal((await read()).descending, true, "down control remains available after switching up");
        switched = true;
      }
      if (s.mode === "ledge") {
        await release();
        await page.waitForTimeout(150);
        await capture("ledge-" + s.i);
        if (!dropped && (s.mask & 4)) {
          await page.locator("#packItems button").filter({ hasText: "奖杯" }).click();
          dropped = true;
        } else await page.locator("#packKeep").click();
        await page.waitForFunction(() => __fx.state.mode !== "ledge");
        continue;
      }
      if (s.mode !== "play") { await release(); await page.waitForTimeout(150); continue; }
      if (!s.attached) {
        await page.waitForFunction(() => __fx.state.attached || __fx.state.mode !== "play", null, { timeout: 20000 });
        await release();
        continue;
      }
      await release();
      await page.waitForFunction(() => { const s = __fx.state; return s.mode !== "play" || (s.attached && !s.lock && !s.needUp && s.settle > .9 && s.holdT === 0); }, null, { timeout: 10000 });
      const ready = await read();
      if (ready.mode !== "play") continue;
      if (ready.crown && stage !== "descent") {
        await capture("summit-" + stage);
        await press(); await page.waitForFunction(() => __fx.state.holdT >= .15); await release();
        continue;
      }
      const direction = stage === "descent" ? -1 : 1;
      let plan = await page.evaluate(dir => DropPilot.plan(__fx.state, dir), direction);
      for (let wait=0; !plan && wait<8; wait++) {
        const at = (await read()).time;
        await page.waitForFunction(t => __fx.state.time >= t+1.5, at);
        plan = await page.evaluate(dir => DropPilot.plan(__fx.state, dir), direction);
      }
      assert.ok(plan, "no input plan at hold " + ready.i + " direction " + direction);
      await press();
      const miss = fallTest && moves === 8;
      // Normal travel has exactly one press/release. The optional fall case
      // deliberately releases before enough force exists, then supplies no rescue.
      await page.waitForFunction(t => !__fx.state.attached || __fx.state.holdT >= t, miss ? .23 : plan.release, { timeout: 10000 });
      await release();
      await page.waitForFunction(n => __fx.state.launches > n, ready.launches);
      if (miss) fallOrigin = ready.i;
      moves++;
      await page.waitForTimeout(10);
      const next = await read();
      if (next.attached && next.i === ready.i) setbacks++;
      if (moves % 12 === 0 && next.attached) await capture(stage + "-" + moves);
    }
    const final = await read();
    assert.equal(final.mode, "ending", "journey must reach an ending");
    assert.equal(final.mask, 15, "final ending must retain reclaimed items");
    assert.equal(stage, "return-ascent", "must exercise complete return journey");
    assert.equal(switched, true, "return trip must exercise both direction controls");
    assert.deepEqual(errors, [], "browser console errors");
  } catch (error) {
    console.error("JOURNEY FAILURE", await page.evaluate(() => ({ state: __fx.state, paused: __fx.paused, holding, keyHeld, activePointer, packClass: document.querySelector("#pack").className })).catch(() => null));
    console.error("BROWSER ERRORS", errors);
    await capture("failure").catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
