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
  // Snapshot the runtime asset closure so a concurrent edit cannot invalidate
  // the route version between saving a session and reloading it in this test.
  const sources = require("./budget.js").runtimeFiles(root);
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
    assert.match(await page.locator("#hint").textContent(), /按住蓄力/, "the initial climb explains upward controls");

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

    // Exercise the actual ending button and keyboard handlers. The guide must
    // come from the page's render loop, without a test calling updateGuide().
    phase = "ending selects independent descent controls";
    await page.evaluate(() => {
      cancelCharge();
      const s = __fx.state, h = Fangxia.HOLDS.at(-1);
      const left = Fangxia.HOLDS.find(h => h.k === "trophy");
      Object.assign(s, Fangxia.createState(), {
        mode: "ending", endingT: 2, intro: 0, catches: 6,
        holdIndex: h.i, origin: h.i, y: h.y + .22, z: h.z,
        attached: true, crown: true, mask: 11,
        lost: [{ kind: "trophy", bit: 4, y: left.y - 1.8, z: left.z, hold: left.i }],
      });
      prologueLeft = 0;
    });
    await page.locator("#retrieve").click();
    await page.waitForFunction(() => {
      const s = __fx.state;
      return s.mode === "play" && s.descending && s.returning && document.body.dataset.scene === "descend";
    });
    const selected = await page.evaluate(() => ({ attached: __fx.state.attached, launches: __fx.state.launches, crown: __fx.state.crown, index: __fx.state.holdIndex }));
    assert.equal(selected.attached, true);
    assert.equal(selected.launches, 0, "choosing descent cannot launch without a press/release gesture");
    assert.equal(selected.crown, false);
    assert.match(await page.locator("#hint").textContent(), /按住稳住身体，松手向下/);
    assert.match(await page.locator("#c").getAttribute("aria-label"), /松手向下/);
    assert.equal(await page.locator("#backHint").count(), 0, "the obsolete long-press direction hint is gone");
    await page.waitForFunction(() => {
      const s = __fx.state;
      return s.attached && s.settle > .9 && !s.lock && !s.needUp;
    }, null, { timeout: 15000 });
    await page.keyboard.down("Space");
    await page.waitForFunction(() => {
      const s = __fx.state, h = Fangxia.HOLDS[s.holdIndex];
      return s.holding && s.holdT > .25 && s.armed && s.aimD < .35 && s.dots.some(p => p.y < h.y - 2);
    }, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => __fx.state.launches), 0, "holding the descent curve cannot release automatically");
    await page.keyboard.up("Space");
    await page.waitForFunction(() => __fx.state.launches === 1 && !__fx.state.attached, null, { timeout: 10000 });
    // Reach through the catch, then keep the same physical key down. A catch
    // must consume that gesture rather than starting another automatic drop.
    await page.keyboard.down("Space");
    await page.waitForFunction(origin => __fx.state.attached && __fx.state.holdIndex < origin, selected.index, { timeout: 15000 });
    const caught = await page.evaluate(() => ({ index: __fx.state.holdIndex, time: __fx.state.time, launches: __fx.state.launches, falls: __fx.state.falls }));
    assert.equal(caught.index, selected.index - 1, "the downward curve catches the next lower hold");
    assert.equal(caught.launches, 1);
    assert.match(await page.locator("#hint").textContent(), /再次按住、松开才会继续下放/);
    await page.waitForFunction(time => __fx.state.time > time + 3, caught.time, { timeout: 20000 });
    const resting = await page.evaluate(() => ({ index: __fx.state.holdIndex, attached: __fx.state.attached, launches: __fx.state.launches, falls: __fx.state.falls, descending: __fx.state.descending }));
    assert.deepEqual(resting, { index: caught.index, attached: true, launches: 1, falls: caught.falls, descending: true }, "holding after a catch remains stable beyond the old 2.4-second slip timeout");
    await page.keyboard.up("Space");
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => __fx.state.launches), 1, "releasing the consumed catch gesture cannot launch again");
    console.log("PASS ending selects descent; real keyboard draws a downward arc; one release makes one stable lower catch", resting);

    // Catch the second pack node with a held reach gesture, as happens in the
    // full journey after discarding the trophy. Releasing and briefly tapping
    // the climbing key must leave the choice visible until its button is used.
    phase = "caught rest point keeps its explicit backpack choice";
    await page.keyboard.down("Space");
    const packIndex = await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS.find(h => h.k === "letter");
      const left = Fangxia.HOLDS.find(h => h.k === "trophy");
      Object.assign(s, Fangxia.createState(), {
        intro: 0, catches: 19, launches: 20, mask: 11,
        holdIndex: h.i - 1, origin: h.i - 1, attached: false,
        flightT: 1, y: h.y + .2, z: h.z, vy: -1,
        holding: true, prevHolding: true,
        lost: [{ kind: "trophy", bit: 4, y: left.y - 1.8, z: left.z, hold: left.i }],
      });
      return h.i;
    });
    await page.waitForFunction(index => __fx.state.mode === "ledge" && __fx.state.holdIndex === index, packIndex, { timeout: 10000 });
    await page.keyboard.up("Space");
    await page.waitForFunction(() => __fx.state.seenRelease && !__fx.state.holding);
    await page.keyboard.down("Space");
    const tapAt = await page.evaluate(() => __fx.state.time);
    await page.waitForFunction(time => __fx.state.holding && __fx.state.time > time + .09, tapAt, { timeout: 10000 });
    await page.keyboard.up("Space");
    await page.waitForFunction(() => {
      const s = __fx.state;
      return s.mode === "ledge" && s.settle >= .9 && document.querySelector("#pack").classList.contains("show");
    }, null, { timeout: 10000 });
    const packStableAt = await page.evaluate(() => __fx.state.time);
    await page.waitForFunction(time => __fx.state.time > time + .25, packStableAt, { timeout: 10000 });
    assert.equal(await page.evaluate(() => __fx.state.mode), "ledge", "the short climbing tap cannot implicitly choose Continue");
    assert(await page.locator("#packKeep").isVisible(), "Continue stays available after the caught body settles");
    assert.equal(await page.locator("#packItems button").count(), 3, "only the three retained objects are offered");
    await page.keyboard.down("Space");
    await page.waitForFunction(() => __fx.state.holding, null, { timeout: 10000 });
    await page.locator("#packKeep").click();
    await page.waitForFunction(() => __fx.state.mode === "play", null, { timeout: 10000 });
    const keptAt = await page.evaluate(() => __fx.state.time);
    await page.waitForFunction(time => __fx.state.time > time + .2, keptAt, { timeout: 10000 });
    const kept = await page.evaluate(() => ({ index: __fx.state.holdIndex, attached: __fx.state.attached, mask: __fx.state.mask, lost: __fx.state.lost.length, launches: __fx.state.launches }));
    assert.deepEqual(kept, { index: packIndex, attached: true, mask: 11, lost: 1, launches: 20 }, "explicit Continue works while Space stays held, without another launch");
    await page.keyboard.up("Space");
    await page.waitForFunction(() => !__fx.state.holding);
    assert.equal(await page.evaluate(() => __fx.state.launches), 20, "releasing Space after Continue cannot launch");
    console.log("PASS real multi-frame rest catch keeps its pack choice until explicit Continue", kept);

    phase = "background pause and safe input reset";
    await page.evaluate(() => {
      const s = __fx.state, h = Fangxia.HOLDS[4];
      Object.assign(s, Fangxia.createState(), { mode: "play", intro: 0, holdIndex: 4, origin: 4, attached: true, y: h.y - 1, z: h.z, holdT: 1, holding: true, prevHolding: true, launches: 3, mask: 15, lost: [] });
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
      // Freeze a real scene and compare the rendered pixels across context
      // restoration. Resuming physics alone misses lost generated GPU content
      // such as the environment reflection map.
      await page.evaluate(() => { setPaused(true); quality = 2; FXRender.setQuality(2); resize(); });
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        const gl = document.querySelector("canvas").getContext("webgl2");
        const options = { state: structuredClone(__fx.state), dt: 0, camY, focusZ, alt: .25 };
        window.captureRestoredScene = () => {
          FXRender.draw(options);
          const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return pixels;
        };
        captureRestoredScene();
        window.beforeContextLossPixels = captureRestoredScene();
      });
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
      const restoredPixels = await page.evaluate(() => {
        captureRestoredScene();
        const after = captureRestoredScene(), before = beforeContextLossPixels;
        let sum = 0, changed = 0, signal = 0;
        for (let i = 0; i < before.length; i++) {
          if (i % 4 === 3) continue;
          const delta = Math.abs(before[i] - after[i]);
          sum += delta; if (delta > 2) changed++; signal += before[i];
        }
        return { sameSize: before.length === after.length, meanDelta: sum / (before.length * .75), changedRatio: changed / (before.length * .75), signal };
      });
      assert(restoredPixels.sameSize && restoredPixels.signal > 0, "compare a nonempty restored framebuffer of equal size");
      assert(restoredPixels.meanDelta < .1 && restoredPixels.changedRatio < .001, "restored lighting and generated GPU content match the frozen original scene: " + JSON.stringify(restoredPixels));
      console.log("PASS restored lighting matches original pixels", restoredPixels);
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
