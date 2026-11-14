/* Controlled movements keep the original single hold-release gesture.
 * Contact still needs real reach and speed. An uncontrolled fall is never
 * caught passively; optional fresh presses provide finite manual rescue. */
"use strict";
const assert = require("node:assert/strict");
const FX = require("../game.js"), P = require("./pilot.js");
const HOLDS = [3, 13, 24, 35, 43, 45], PHASES = [.4, 23.4], OFFSETS = [-.18, .18];
function noHomingOrDistantCatch() {
  for (const mask of [0, 15]) {
    const s = P.fresh(mask, 24);
    Object.assign(s, { attached: false, crown: false, flightT: 1, y: FX.HOLDS[24].y,
      z: FX.HOLDS[24].z + 8, vy: -4, vz: 0, grabT: -1 });
    const z = s.z;
    for (let n = 0; n < 15; n++) P.tick(s, { holding: true });
    assert.equal(s.attached, false, "an active reach cannot grab a distant cliff");
    assert(FX.gripActive(s), "distant-catch fixture actually has an active reach");
    assert(Math.abs(s.z - z) < .03, "falling bodies must not accelerate sideways toward the cliff");
    assert(Math.abs(s.vz) < .3, "horizontal motion contains wind and drag, no wall-homing spring");
  }
}
function finiteReach() {
  for (const mask of [0, 15]) {
    const s = P.fresh(mask, 43);
    Object.assign(s, { attached: false, crown: false, flightT: 1, y: 500, z: 30,
      vy: 0, vz: 0, grabT: -1, prevHolding: false });
    let activeFrames = 0;
    for (let frame = 0; frame < 120; frame++) {
      P.tick(s, { holding: true });
      if (FX.gripActive(s)) activeFrames++;
    }
    assert(activeFrames >= 12 && activeFrames < 65, "reach window is usable but expires during a continuous hold");
    assert.equal(FX.gripActive(s), false);
    for (let frame = 0; frame < 30; frame++) P.tick(s, { holding: true });
    assert.equal(FX.gripActive(s), false, "continued holding cannot silently renew an expired reach");
    P.tick(s, { holding: false });
    for (let frame = 0; frame < 15; frame++) P.tick(s, { holding: true });
    assert(FX.gripActive(s), "release then a fresh press opens another deliberate reach");
  }
}
function naturalReleaseRegression() {
  const rows = [];
  // These are fixed ordinary timings, deliberately independent of the oracle.
  for (const i of [0, 1, 2]) for (const release of [1.6, 1.7, 1.8]) {
    const s = P.fresh(15, i);
    let airborneHeld = false;
    const result = P.execute(s, release, state => {
      if (!state.attached && state.holding) airborneHeld = true;
    });
    assert(result.launched && result.landed && result.delta === 1,
      `ordinary full-pack release must catch the next grip: hold${i}, release${release}`);
    assert.equal(airborneHeld, false, "normal play must not secretly insert a second press");
    assert.equal(s.grabT, -1, "the launch catches without opening a manual rescue window");
    rows.push({ i, release, landed: s.holdIndex });
  }
  return rows;
}
function compareGestures() {
  const rows = [];
  for (const mask of [0, 15]) for (const i of HOLDS) {
    const original = P.fresh(mask, i), plan = P.plan(original, 1);
    assert(plan, `reachable fixture ${i}/${mask}`);
    assert.equal(plan.grabAt, Infinity, "route planning must use the ordinary single gesture");
    const controlled = P.copy(original), result = P.execute(controlled, plan);
    assert(result.landed && result.delta === 1, "the release catches its real adjacent target without a second press");
    // An early, weak release cannot reach the intended higher grip. It must
    // fall, rather than grab the departure rock or another lower rock for free.
    const missed = P.copy(original);
    P.execute(missed, .3);
    assert.equal(missed.catches, original.catches, "a missed launch has no passive lower-hold fallback");
    assert.equal(missed.mode, "impact", "insufficient launch effort still causes a real fall");
    rows.push({ i, mask, release: +plan.release.toFixed(3), caught: controlled.holdIndex, failedFalls: missed.falls });
  }
  // Start a genuinely reachable, slow falling body beside a grip. No directed
  // launch exists, so even this near miss needs an explicit rescue press.
  for (const mask of [0, 15]) {
    const i = 13, h = FX.HOLDS[i], s = P.fresh(mask, i + 1);
    Object.assign(s, { attached:false,flightT:.8,y:h.y+.45,z:h.z,vy:-2,vz:0,launchBody:null,holding:false,prevHolding:false });
    const candidate = FX.catchCandidate(s);
    assert(candidate && candidate.index === i && candidate.reachable && candidate.canCatchSpeed,
      "uncontrolled-fall fixture must really be within arm reach");
    P.finishFlight(s,i+1,12);
    assert.equal(s.catches,0,"nearby slow falling bodies are not automatically rescued");
    assert.equal(s.mode,"impact");
  }
  return rows;
}
function deliberateRetry() {
  function run(retry) {
    const s = P.fresh(0, 13);
    while (s.holdT + 1e-7 < 1.25) P.tick(s, { holding: true });
    P.tick(s, { holding: false });
    let expired = false, presses = 0, previouslyHeld = false;
    for (let frame = 0; frame < 12 / P.DT && !s.attached && s.mode === "play"; frame++) {
      const holding = s.flightT >= .05 && s.flightT < .55 || retry && s.flightT >= .85;
      if (holding && !previouslyHeld) presses++;
      P.tick(s, { holding });
      if (s.flightT > .5 && s.flightT < .55 && !FX.gripActive(s)) expired = true;
      previouslyHeld = holding;
    }
    return { s, expired, presses };
  }
  const noRetry = run(false), retry = run(true);
  assert(noRetry.expired && retry.expired, "the first failed reach genuinely expires before the retry");
  assert.equal(noRetry.s.mode, "impact", "an expired first reach does not automatically rescue the fall");
  assert.equal(retry.presses, 2, "the rescue needs release followed by a second airborne press");
  assert.equal(retry.s.attached, true, "a deliberate, correctly timed retry can catch during a fall");
  assert.equal(retry.s.holdIndex, 13, "the retry catches a genuinely reachable grip");
  assert.equal(retry.s.falls, 0);
  console.log("PASS a failed reach can be rescued by explicitly releasing and pressing again");
}

function measure() {
  const rows = [];
  for (const i of HOLDS) for (const mask of [0, 15]) for (const phase of PHASES) {
    const base = P.fresh(mask, i, phase), plan = P.plan(base, 1);
    assert(plan, `release-error fixture ${i}/${mask}/${phase}`);
    for (const offset of OFFSETS) {
      const s = P.copy(base);
      // Only release timing changes. No oracle-timed airborne press or
      // automatic lower-hold fallback rescues the mistake.
      const result = P.execute(s, { ...plan, release: plan.release + offset });
      rows.push({ i, mask, phase, offset, advanced: result.landed && result.delta > 0,
        lower: result.landed && result.delta < 0, same: result.landed && result.delta === 0, ground: s.mode === "impact" });
    }
  }
  return rows;
}
function main() {
  const started = performance.now();
  noHomingOrDistantCatch(); finiteReach(); deliberateRetry();
  const natural = naturalReleaseRegression(), contracts = compareGestures(), rows = measure();
  const counts = rows.reduce((out, row) => {
    for (const key of ["advanced", "lower", "same", "ground"]) if (row[key]) out[key]++;
    return out;
  }, { advanced: 0, lower: 0, same: 0, ground: 0 });
  assert(counts.ground > 0, "meaningful release mistakes must sometimes produce a real fall");
  assert.equal(counts.lower+counts.same,0,"ordinary misses cannot passively grab a fallback hold");
  console.log("NATURAL_RELEASES", JSON.stringify(natural));
  console.log("GRIP_CONTRACTS", JSON.stringify(contracts));
  console.log("RELEASE_ERRORS", JSON.stringify({ note: "Six holds × empty/full × two wind phases × ±180ms. Diagnostic sample, no required rescue rate.", ...counts }));
  console.log(`PASS single-gesture contact and finite manual rescue contracts (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  return rows;
}
if (require.main === module) main();
module.exports = { main, measure, noHomingOrDistantCatch, finiteReach, naturalReleaseRegression, compareGestures, deliberateRetry, PHASES, OFFSETS };
