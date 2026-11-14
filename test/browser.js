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
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: fast ? { width: 900, height: 600 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
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
    if (fast) await page.evaluate(() => { quality = 0; FXRender.setQuality(0); resize(); });
    await page.addScriptTag({ path: path.join(__dirname, "pilot.js") });
    await page.waitForTimeout(1500);
    await capture("start");
    const position = mobile ? { x: 300, y: 700 } : fast ? { x: 740, y: 510 } : { x: 1100, y: 700 };
    await page.mouse.move(position.x, position.y);
    let holding = false;
    async function press() { if (!holding) { await page.mouse.down(); holding = true; } }
    async function release() { if (holding) { await page.mouse.up(); holding = false; } }
    async function read() { return page.evaluate(() => { const s = __fx.state; return { mode: s.mode, i: s.holdIndex, y: s.y, mask: s.mask, crown: s.crown, attached: s.attached, lost: s.lost.length, falls: s.falls, time: s.time, launches: s.launches, holdT: s.holdT }; }); }
    let stage = "ascent", moves = 0, dropped = false, lastI = -1, setbacks = 0;
    let fallOrigin = null, fallLaunch = 0;
    const started = Date.now();
    while (Date.now() - started < 15 * 60 * 1000 && moves < 300) {
      const s = await read();
      if (fallOrigin !== null && s.launches >= fallLaunch && s.attached) {
        assert.ok(s.i < fallOrigin && s.i > 0, "mistimed launch must recover on a lower hold above the start");
        await capture("recovered-fall");
        assert.deepEqual(errors, []);
        console.log("PASS real-input mistimed launch recovered", { from: fallOrigin, to: s.i, falls: s.falls });
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
        stage = "descent";
        continue;
      }
      if (stage === "descent" && s.mask === 15 && s.lost === 0) { stage = "return-ascent"; await capture("pickup"); }
      if (s.mode === "ledge") {
        await release();
        await page.waitForTimeout(150);
        await capture("ledge-" + s.i);
        if (!dropped && (s.mask & 4)) {
          await page.locator("#packItems button").filter({ hasText: "奖杯" }).click();
          dropped = true;
        } else await page.locator("#packKeep").click();
        continue;
      }
      if (s.mode !== "play") { await release(); await page.waitForTimeout(150); continue; }
      if (!s.attached) {
        await page.waitForFunction(() => __fx.state.attached || __fx.state.vy < 0 || __fx.state.mode !== "play", null, { timeout: 20000 });
        const f = await read();
        if (!f.attached && f.mode === "play") await press();
        await page.waitForFunction(() => __fx.state.attached || __fx.state.mode !== "play", null, { timeout: 20000 });
        await release();
        continue;
      }
      await release();
      await page.waitForFunction(() => { const s = __fx.state; return s.mode !== "play" || (!s.lock && !s.needUp && s.settle > .9 && s.holdT === 0); }, null, { timeout: 10000 });
      const ready = await read();
      if (ready.mode !== "play") continue;
      if (ready.crown && stage !== "descent") {
        await capture("summit-" + stage);
        await press(); await page.waitForFunction(() => __fx.state.holdT >= .15); await release();
        continue;
      }
      const direction = stage === "descent" ? -1 : 1;
      const plan = await page.evaluate(dir => DropPilot.plan(__fx.state, dir), direction);
      assert.ok(plan, "no input plan at hold " + ready.i + " direction " + direction);
      await press();
      const miss = fallTest && moves === 8;
      await page.waitForFunction(t => !__fx.state.attached || __fx.state.holdT >= t, miss ? plan.a - .24 : plan.release, { timeout: 10000 });
      await release();
      if (miss) { fallOrigin = ready.i; fallLaunch = ready.launches + 1; }
      moves++;
      await page.waitForTimeout(50);
      const next = await read();
      if (next.attached && next.i === ready.i) setbacks++;
      if (moves % 12 === 0) await capture(stage + "-" + moves);
    }
    const final = await read();
    assert.equal(final.mode, "ending", "journey must reach an ending");
    assert.equal(final.mask, 15, "final ending must retain reclaimed items");
    assert.equal(stage, "return-ascent", "must exercise complete return journey");
    assert.deepEqual(errors, [], "browser console errors");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
