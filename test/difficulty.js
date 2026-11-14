/* Actual input/flight measurements for the five climbing acts. These are
 * deterministic reachability and timing samples, not a human playtest.
 * node test/difficulty.js [--report-only | --route-only]
 */
"use strict";
const assert = require("node:assert/strict");
const FX = require("../game.js");
const P = require("./pilot.js"), W = require("./windows.js");
const DT = 1 / 120;
const REPRESENTATIVES = [3, 13, 24, 35, 43];
const WIND_TIMES = [0, 7, 19];
const MASKS = [0, 15];
const copy = s => { const c = structuredClone(s); c.dots = []; c.sfx = []; return c; };
const tick = (s, holding) => FX.step(s, DT, { holding, freezeIntro: true });
const mean = xs => xs.reduce((sum, n) => sum + n, 0) / xs.length;

function fresh(mask, index, time) {
  const s = FX.createState(), h = FX.HOLDS[index];
  Object.assign(s, { mask, holdIndex: index, origin: index, time, intro: 0,
    y: h.y - FX.L, z: h.z, mode: "play", attached: true, crown: false,
    descending: false, returning: false, settle: 1, lock: 0, needUp: false,
    holding: false, prevHolding: false, holdT: 0, restSeen: 0xffffffff });
  return s;
}

function releaseAndLand(held) {
  const route = P.trial(held, 1);
  if (!route) return { launched: true, delta: 0 };
  return { launched: true, delta: 1, plan: { release: held.holdT, direction: 1, ...route } };
}

function runs(samples, key) {
  const found = []; let current;
  for (const sample of samples) {
    if (sample[key]) {
      if (!current) current = { a: sample.t, b: sample.t };
      else current.b = sample.t;
    } else if (current) { found.push(current); current = null; }
  }
  if (current) found.push(current);
  return found.map(r => ({ ...r, span: r.b - r.a }));
}

function scan(mask, index, phase, stopAfterWindow = 0) {
  const held = fresh(mask, index, phase), samples = [];
  let runStart = null, stopped = false;
  // One actual held sequence; only future release trials run on copies.
  for (let frame = 1; frame <= Math.round(2.2 / DT); frame++) {
    tick(held, true);
    assert(held.attached && held.mode === "play", "holding alone must not launch or drop the climber");
    if (frame % 2 || held.holdT <= .16) continue;
    const result = releaseAndLand(held);
    samples.push({ t: held.holdT, next: result.delta === 1, progress: result.delta > 0, plan: result.plan || null });
    if (result.delta === 1) {
      if (runStart === null) runStart = held.holdT;
      if (stopAfterWindow && held.holdT - runStart + 1e-7 >= stopAfterWindow) { stopped = true; break; }
    } else runStart = null;
  }
  const next = runs(samples, "next"), progress = runs(samples, "progress");
  const longest = rs => rs.reduce((a, b) => b.span > a.span ? b : a, { a: 0, b: 0, span: 0 });
  const central = next.length ? (next[0].a + next[0].b) / 2 : 0;
  const centralSample = samples.filter(x => x.next).reduce((a, b) => !a || Math.abs(b.t - central) < Math.abs(a.t - central) ? b : a, null);
  return { centerPlan: centralSample && centralSample.plan, index, stage: FX.stageAt(FX.HOLDS[index].y), mask, phase, completeScan: !stopped,
    firstPlan: (samples.find(x => x.next) || {}).plan || null, nextWindows: next, firstNext: next[0] || null, widestNext: longest(next), widestProgress: longest(progress) };
}

function routeReachability() {
  const samples = [];
  // This is a quick hole finder, not a replacement for wind-phase sweeps or
  // full journeys. Once a usable real window exists, its total width is moot.
  for (let index = 0; index < FX.HOLDS.length - 1; index++) {
    for (const mask of MASKS) samples.push(scan(mask, index, 0, .05));
  }
  return { note: "Every ascending route link, empty/full pack, wind phase 0; stops at the first verified 50ms window.", samples };
}

function chargeTime(mask, amount) {
  for (let frame = 0; frame < 4 / DT; frame++) {
    const t = frame * DT;
    if (FX.sampleRelease(mask, t).charge >= amount) return t;
  }
  throw new Error("charge never reaches " + amount);
}

function readyAfterCatch(mask, measured) {
  assert(measured.firstNext, "settling fixture must have a reachable next hold");
  // Reuse an actually sampled release; averaging two successful frames could
  // invent an untested frame while contact behavior is being tuned.
  const s = fresh(mask, measured.index, measured.phase);
  const result = P.execute(s, measured.firstPlan);
  assert(result.delta > 0, "settling measurement must begin with a real upward catch");
  const contactTime = s.time;
  for (let frame = 0; frame < 2 / DT; frame++) {
    tick(s, false); // The player releases the previous gesture after contact.
    const probe = copy(s);
    tick(probe, true);
    if (probe.holdT > 0) return probe.time - contactTime;
  }
  throw new Error("climber cannot begin another pull within two seconds of contact");
}

function measure() {
  assert.equal(typeof FX.stageAt, "function", "game must expose the shared five-act stage helper");
  assert.equal(typeof FX.weatherAt, "function", "game must expose the shared weather model");
  const samples = [];
  for (const index of REPRESENTATIVES) for (const mask of MASKS) for (const phase of WIND_TIMES) samples.push(scan(mask, index, phase));
  const stages = REPRESENTATIVES.map((index, stage) => {
    const y = FX.HOLDS[index].y;
    const weather = FX.weatherAt(y, false), returning = FX.weatherAt(y, true);
    const packs = MASKS.map(mask => {
      const windows = samples.filter(x => x.index === index && x.mask === mask);
      const wind = Array.from({ length: 601 }, (_, i) => FX.wind(i * .1, y, mask, false));
      const central = windows.find(x => x.phase === WIND_TIMES[0]);
      const reach = central && central.centerPlan ? W.reachWindow(fresh(mask, index, central.phase), central.centerPlan) : { span: 0 };
      return { mask, reachWindow: reach.span, meanWindow: mean(windows.map(x => x.widestNext.span)), minWindow: Math.min(...windows.map(x => x.widestNext.span)),
        firstRelease: mean(windows.map(x => x.firstNext ? x.firstNext.a : NaN)),
        windRms: Math.sqrt(mean(wind.map(x => x * x))), maxWind: Math.max(...wind.map(Math.abs)) };
    });
    return { stage, index, y, weather, returning, packs, meanWindow: mean(packs.map(p => p.meanWindow)) };
  });
  const burden = MASKS.map(mask => {
    const fixture = samples.find(s => s.mask === mask && s.index === REPRESENTATIVES[0] && s.phase === 0);
    return { mask, charge10: chargeTime(mask, .1), charge90: chargeTime(mask, .9),
      readyAfterCatch: fixture.firstNext ? readyAfterCatch(mask, fixture) : null };
  });
  return { note: "Five representative holds × two pack extremes × three wind phases; not exhaustive and not a human completion-time estimate.", dt: DT, stages, burden, samples };
}

function validate(report) {
  for (const sample of report.samples) assert(sample.widestNext.span + 1e-7 >= .05,
    "no usable upward window: " + JSON.stringify({ hold: sample.index, mask: sample.mask, phase: sample.phase, window: sample.widestNext }));
  const { stages, burden } = report;
  stages.forEach((s, i) => {
    assert.equal(FX.stageAt(s.y), i);
    assert(s.returning.intensity >= s.weather.intensity, "return weather must not erase the current exposure");
    if (!i) return;
    assert(s.weather.intensity > stages[i - 1].weather.intensity, "weather must worsen after every rest decision");
    for (const mask of MASKS) assert(s.packs.find(p => p.mask === mask).windRms > stages[i - 1].packs.find(p => p.mask === mask).windRms,
      "actual wind energy must increase by stage for both pack extremes");
    // Two sampled physics frames allow quantization and small route differences;
    // a visibly wider later act is still a regression, even if a tuning array falls.
    assert(s.meanWindow <= stages[i - 1].meanWindow + DT * 2, "later stage has a materially wider actual release window");
  });
  assert(stages[4].meanWindow < stages[0].meanWindow * .8, "final act must require materially more precise release timing than the opening");
  const emptyRelease = mean(stages.map(s => s.packs.find(p => p.mask === 0).meanWindow));
  const fullRelease = mean(stages.map(s => s.packs.find(p => p.mask === 15).meanWindow));
  assert(fullRelease <= emptyRelease * .85, "full pack must require materially more precise release timing across the route");
  for (const stage of stages) {
    const empty = stage.packs.find(p => p.mask === 0), full = stage.packs.find(p => p.mask === 15);
    assert(full.windRms > empty.windRms * 1.5, "heavy load must increase actual lateral wind disturbance");
    for (const pack of stage.packs) assert(pack.reachWindow + DT >= .05, "a deliberate reach needs a usable real timing window");
  }
  const empty = burden.find(x => x.mask === 0), full = burden.find(x => x.mask === 15);
  assert(full.charge10 > empty.charge10 + .1 && full.charge90 > empty.charge90 + .35, "heavy pack must build force perceptibly later");
  assert(full.readyAfterCatch > empty.readyAfterCatch + .25 && full.readyAfterCatch > .8 && empty.readyAfterCatch < .9,
    "heavy pack must take noticeably longer to recover after a real catch");
}

if (require.main === module) {
  const started = Date.now();
  if (process.argv.includes("--route-only")) {
    const report = routeReachability(), failed = report.samples.filter(s => s.widestNext.span + 1e-7 < .05);
    console.log("ROUTE", JSON.stringify(report));
    assert.equal(failed.length, 0, "route links without a 50ms window: " + JSON.stringify(failed));
    console.log("PASS " + report.samples.length + " upward route/pack fixtures (" + ((Date.now() - started) / 1000).toFixed(1) + "s)");
  } else {
    const report = measure();
    console.table(report.stages.map(s => ({ stage: s.stage + 1, hold: s.index, emptyWindow: s.packs[0].meanWindow.toFixed(3), fullWindow: s.packs[1].meanWindow.toFixed(3),
      emptyWindRms: s.packs[0].windRms.toFixed(3), fullWindRms: s.packs[1].windRms.toFixed(3), weather: s.weather.intensity.toFixed(3) })));
    console.log("BURDEN", JSON.stringify(report.burden));
    console.log("REPORT", JSON.stringify(report));
    if (!process.argv.includes("--report-only")) validate(report);
    console.log((process.argv.includes("--report-only") ? "MEASURED" : "PASS") + " stage difficulty and burden (" + ((Date.now() - started) / 1000).toFixed(1) + "s)");
  }
}
module.exports = { measure, validate, scan, routeReachability, readyAfterCatch, fresh, DT, REPRESENTATIVES, WIND_TIMES };
