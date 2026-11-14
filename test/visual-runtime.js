/* Frozen-source visual/runtime verification. No external network or test server.
 * node test/visual-runtime.js [--quick] [--measure-only] [--no-screens]
 * Optional: --profile=desktop|portrait|desktop-low --scene=base|mid|gale|summit|ending
 * DROP_CAPTURE_DIR=/tmp/drop-art-after CHROMIUM_PATH=/usr/bin/chromium
 * Frame pacing here belongs to the reported GPU/CPU; it is NOT a hardware FPS
 * guarantee. JS heap and declared GPU allocations are separate from download MB.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { inspect } = require("./budget.js");
const ORIGIN = "http://127.0.0.1:8123";
const out = process.env.DROP_CAPTURE_DIR || "/tmp/drop-art-after";
const quick = process.argv.includes("--quick");
const screenshots = !process.argv.includes("--no-screens");

function distribution(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = values.reduce((sum, x) => sum + x, 0) / Math.max(1, values.length);
  return { samples: values.length, meanMs: +mean.toFixed(2), medianMs: +(sorted[Math.floor(sorted.length / 2)] || 0).toFixed(2), p95Ms: +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0).toFixed(2), meanFps: +(1000 / mean).toFixed(2) };
}
function memoryCounters(diagnostics) {
  const memory = diagnostics && (diagnostics.memory || diagnostics.renderer?.memory || diagnostics.info?.memory);
  assert.ok(memory && Number.isFinite(memory.textures) && Number.isFinite(memory.geometries), "FXRender.diagnostics must expose renderer.info.memory texture/geometry counts");
  return { textures: memory.textures, geometries: memory.geometries };
}
async function frameWait(page, count = 2) {
  return page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, count);
}
async function metrics(page, client, frames) {
  await client.send("HeapProfiler.collectGarbage");
  await frameWait(page, 2);
  const visual = await page.evaluate(async frames => {
    const intervals = []; let last = null;
    for (let i = 0; i < frames + 1; i++) await new Promise(resolve => requestAnimationFrame(time => { if (last !== null) intervals.push(time - last); last = time; resolve(); }));
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const diagnostics = typeof FXRender.diagnostics === "function" ? FXRender.diagnostics() : FXRender.diagnostics;
    return { intervals, width: canvas.width, height: canvas.height, quality: FXRender.quality,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "not exposed",
      diagnostics: diagnostics ? JSON.parse(JSON.stringify(diagnostics)) : null,
      externalResources: performance.getEntriesByType("resource").map(x => x.name).filter(name => /^https?:/.test(name) && new URL(name).origin !== location.origin) };
  }, frames);
  const heap = await client.send("Runtime.getHeapUsage");
  assert.deepEqual(visual.externalResources, [], "runtime loaded external resources");
  const counts = memoryCounters(visual.diagnostics);
  return { ...visual, framePacing: distribution(visual.intervals), heap, counts };
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const { assets, report: budget } = inspect();
  fs.writeFileSync(path.join(out, "resource-budget.json"), JSON.stringify(budget, null, 2));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-precise-memory-info"] });
  const report = { note: "Measured browser/GPU shown below; software rendering is not a real-device 60 FPS claim. Heap is JS-managed memory, GPU figures are renderer-owned estimates, and neither equals the download budget.", budget, scenes: [], resourceCycles: [] };
  const allErrors = [], unexpectedRequests = [];
  try {
    const requestedProfile = process.argv.find(x => x.startsWith("--profile="))?.split("=")[1];
    const requestedScene = process.argv.find(x => x.startsWith("--scene="))?.split("=")[1];
    const profiles = [
      { name: "desktop", width: 1280, height: 800, quality: 2 },
      { name: "portrait", width: 390, height: 844, quality: 1 },
      { name: "desktop-low", width: 1280, height: 800, quality: 0 },
    ].filter(p => requestedProfile ? p.name === requestedProfile : !quick || p.name === "desktop-low");
    assert.ok(profiles.length, "unknown profile");
    if (requestedScene) assert.ok(["base", "mid", "gale", "summit", "ending"].includes(requestedScene), "unknown scene");
    const shots = requestedScene ? [requestedScene] : quick ? ["mid"] : ["base", "mid", "summit"];
    for (const profile of profiles) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const client = await context.newCDPSession(page);
      let phase = profile.name;
      page.on("pageerror", error => allErrors.push({ phase, error: error.stack || error.message }));
      page.on("console", message => { if (message.type() === "error") allErrors.push({ phase, error: message.text() }); });
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        const name = decodeURIComponent(url.pathname.replace(/^\//, "")) || "index.html";
        if (url.origin === ORIGIN && assets.has(name)) {
          const type = /\.m?js$/.test(name) ? "application/javascript" : /\.css$/.test(name) ? "text/css" : /\.html?$/.test(name) ? "text/html; charset=utf-8" : "application/octet-stream";
          await route.fulfill({ body: assets.get(name), contentType: type });
        } else {
          unexpectedRequests.push({ phase, url: url.href });
          await route.abort();
        }
      });
      for (const shot of shots) {
        phase = profile.name + "/" + shot;
        const loadStarted = Date.now();
        await page.goto(ORIGIN + "/index.html?shot=" + shot);
        const localLoadMs = Date.now() - loadStarted;
        await page.evaluate(q => { quality = q; FXRender.setQuality(q); resize(); }, profile.quality);
        await frameWait(page, 4);
        const measurement = await metrics(page, client, quick ? 6 : 10);
        if (screenshots) await page.screenshot({ path: path.join(out, profile.name + "-" + shot + ".png") });
        report.scenes.push({ profile, shot, localLoadMs, ...measurement });
        console.log("MEASURE", phase, JSON.stringify({ canvas: [measurement.width, measurement.height], localLoadMs, framePacing: measurement.framePacing, jsHeapBytes: measurement.heap.usedSize, backingStorageBytes: measurement.heap.backingStorageSize, counts: measurement.counts, gpu: measurement.gpu }));
      }
      if (profile.name === "desktop-low" && !process.argv.includes("--measure-only")) {
        phase = "quality-resize-cycles";
        // Every cycle visits the same states and returns to 1280×800, quality 2.
        // Two warm-up cycles compile all variants before leak comparisons.
        for (let cycle = 0; cycle < 5; cycle++) {
          for (const mode of [{ w: 720, h: 480, q: 0 }, { w: 390, h: 844, q: 1 }, { w: 1280, h: 800, q: 2 }]) {
            await page.setViewportSize({ width: mode.w, height: mode.h });
            await page.evaluate(q => { quality = q; FXRender.setQuality(q); resize(); }, mode.q);
            await frameWait(page, 3);
          }
          const measurement = await metrics(page, client, 2);
          report.resourceCycles.push({ cycle, heap: measurement.heap, counts: measurement.counts, diagnostics: measurement.diagnostics });
          console.log("CYCLE", cycle, JSON.stringify({ counts: measurement.counts, jsHeapBytes: measurement.heap.usedSize, backingStorageBytes: measurement.heap.backingStorageSize }));
        }
        const settled = report.resourceCycles.slice(1), baseline = settled[0];
        for (const sample of settled.slice(1)) {
          assert.ok(sample.counts.textures <= baseline.counts.textures, "GPU texture count grows after identical warmed quality/resize cycles");
          assert.ok(sample.counts.geometries <= baseline.counts.geometries, "GPU geometry count grows after identical warmed quality/resize cycles");
        }
        const final = settled.at(-1);
        const allowedHeapGrowth = Math.max(2_000_000, baseline.heap.usedSize * .15);
        assert.ok(final.heap.usedSize - baseline.heap.usedSize < allowedHeapGrowth, "retained JS heap grows materially after GC across warmed repeated quality/resize cycles");
      }
      await context.close();
    }
    report.errors = allErrors;
    report.unexpectedRequests = unexpectedRequests;
    fs.writeFileSync(path.join(out, "runtime.json"), JSON.stringify(report, null, 2));
    assert.deepEqual(unexpectedRequests, [], "undeclared/external runtime network dependencies");
    assert.deepEqual(allErrors, [], "browser or shader errors");
    console.log("PASS visual runtime: local asset closure and clean shaders; " + (report.resourceCycles.length ? "stable warmed GPU resource counts and resize/quality cycles" : "resource-cycle checks skipped by --measure-only") + ". Report:", out);
  } catch (error) {
    report.errors = allErrors; report.unexpectedRequests = unexpectedRequests; report.failure = error.stack || error.message;
    fs.writeFileSync(path.join(out, "runtime.json"), JSON.stringify(report, null, 2));
    throw error;
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, distribution };
