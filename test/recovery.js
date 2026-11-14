/* Manual grip contracts. A missed launch is allowed to fail: this suite never
 * requires a rescue percentage. Geometry, fresh input and a finite reach window
 * must all agree before a catch can stop a fall. */
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
function compareGestures() {
  const rows = [];
  for (const mask of [0, 15]) for (const i of HOLDS) {
    const original = P.fresh(mask, i), plan = P.plan(original, 1);
    assert(plan, `reachable fixture ${i}/${mask}`);
    const active = P.copy(original), passive = P.copy(original), late = P.copy(original);
    const catchResult = P.execute(active, plan);
    assert(catchResult.landed && catchResult.delta === 1, "a correctly timed second press catches a reachable hold");
    let belowTargetAt = null;
    P.execute(passive, plan, flight => {
      if (!flight.attached && flight.vy < 0 && belowTargetAt === null &&
          FX.bodyFrame(flight).hip.y + 1.23 < FX.HOLDS[i + 1].y) belowTargetAt = flight.flightT;
    }, { reach: false });
    assert.equal(passive.catches, original.catches, "hands-off flight never attaches to a passing hold");
    assert.equal(passive.mode, "impact", "without another press the same flight ends in a real fall");
    assert(belowTargetAt !== null, "the passive trajectory genuinely passes below the target");
    P.execute(late, plan, null, { grabAt: belowTargetAt });
    assert(late.holdIndex <= i || late.mode === "impact", "pressing after passing the target cannot retroactively catch it");
    rows.push({ i, mask, release: +plan.release.toFixed(3), grabAt: +plan.grabAt.toFixed(3),
      active: active.holdIndex, passiveFalls: passive.falls, lateHold: late.holdIndex, lateFalls: late.falls });
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
      // Preserve the planned reach time. An erroneous release does not receive
      // another oracle search or repeated automatic catch attempts.
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
  const contracts = compareGestures(), rows = measure();
  const counts = rows.reduce((out, row) => {
    for (const key of ["advanced", "lower", "same", "ground"]) if (row[key]) out[key]++;
    return out;
  }, { advanced: 0, lower: 0, same: 0, ground: 0 });
  assert(counts.ground > 0, "meaningful release mistakes must sometimes produce a real fall");
  console.log("GRIP_CONTRACTS", JSON.stringify(contracts));
  console.log("RELEASE_ERRORS", JSON.stringify({ note: "Six holds × empty/full × two wind phases × ±180ms. Diagnostic sample, no required rescue rate.", ...counts }));
  console.log(`PASS active, finite, geometric grip contracts (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  return rows;
}
if (require.main === module) main();
module.exports = { main, measure, noHomingOrDistantCatch, finiteReach, compareGestures, deliberateRetry, PHASES, OFFSETS };
