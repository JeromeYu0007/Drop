/* Return-trip input contracts. These checks use the production 120 Hz step;
 * no timer, input hold or catch may replace a deliberate downward release. */
const assert = require("node:assert/strict");
const FX = require("../game.js");
const P = require("./pilot.js");

function lostItem(kind, hold) {
  const h = FX.HOLDS[hold];
  return { kind, bit: FX.ITEMS[kind].bit, hold, y: h.y + .2, z: h.z + .22 };
}
function downState(mask, hold, time = 0) {
  const s = P.fresh(mask, hold, time);
  s.descending = true; s.returning = true; s.crown = false;
  s.restSeen = 0xffffffff;
  return s;
}
function tickFor(s, seconds, holding, check) {
  for (let i = 0; i < Math.ceil(seconds / P.DT); i++) {
    P.tick(s, { holding });
    if (check) check(s);
  }
}

function selection() {
  const top = FX.HOLDS.length - 1;
  const s = P.fresh(11, top);
  s.mode = "ending"; s.lost = [lostItem("trophy", 8)];
  P.tick(s, { retrieve: true });
  assert.equal(s.mode, "play");
  assert.equal(s.holdIndex, top);
  assert.equal(s.descending, true, "the ending choice selects descent immediately");
  assert.equal(s.returning, true, "return weather is independent of direction");
  assert.equal(s.launches, 0, "choosing descent does not drop the climber automatically");
  assert.equal(s.attached, true);
  P.ready(s);
  tickFor(s, .4, true);
  FX.updateGuide(s);
  assert(FX.releaseSample(s).vy < 0, "the first held gesture uses the downward curve");
  assert(s.dots.length > 1, "the downward gesture has a visible prediction");
  const h = FX.HOLDS[top];
  assert(s.dots.every(p => p.y < h.y), "descent prediction starts below the grip");
  for (let i = 1; i < s.dots.length; i++) assert(s.dots[i].y <= s.dots[i - 1].y + 1e-6, "descent prediction must not start with an upward jump");

  for (const duration of [.15, 1.5, 3, 10]) {
    const crown = P.fresh(15, top);
    tickFor(crown, duration, true);
    P.tick(crown, { holding: false });
    assert.equal(crown.descending, false, "holding at the summit cannot select descent");
    assert.equal(crown.holdIndex, top);
    assert.equal(crown.attached, true, "summit input cannot throw the climber off");
  }
  const complete = P.fresh(15, top); complete.mode = "ending";
  P.tick(complete, { retrieve: true });
  assert.equal(complete.mode, "ending", "no retrieve action without lost objects");
  console.log("PASS descent selection and no summit long-press mode switch");
}

function separatedCurves() {
  for (const mask of [0, 15]) for (const i of [1, 12, 28, 44, 46]) {
    const h = FX.HOLDS[i], down = downState(mask, i, 7.3), up = P.fresh(mask, i, 7.3);
    for (const t of [.25, .5, .9, 1.35, 1.7, 2.4, 6, 12]) {
      const a = FX.releaseSample(up, t), b = FX.releaseSample(down, t);
      const direct = FX.sampleDown(mask, t, h, down.time);
      assert(Number.isFinite(direct.phase), "finite downward animation phase");
      for (const key of ["vy", "vz", "offY", "offZ", "angle", "charge"]) {
        assert(Number.isFinite(a[key]) && Number.isFinite(b[key]), "finite upward and downward sample " + key);
        assert(Math.abs(b[key] - direct[key]) < 1e-9, "down preview and live launch share sample " + key);
      }
      assert(a.vy > 0, "upward release remains upward");
      assert(b.vy < 0, "downward release stays downward throughout a long hold");
    }
  }
  console.log("PASS distinct upward/downward release curves across charge durations");
}

function noAutomaticDescent() {
  for (const mask of [0, 15]) for (const i of [2, 12, 28, 44, 46]) {
    const s = downState(mask, i);
    tickFor(s, 60, false, current => {
      assert.equal(current.attached, true, `idle mask${mask} hold${i} detached`);
      assert.equal(current.holdIndex, i, `idle mask${mask} hold${i} moved`);
      assert.equal(current.launches, 0);
      assert(!current.sfx.includes("slip"), "no countdown slip while idle");
    });
  }
  for (const mask of [0, 15]) for (const i of [12, 44]) {
    const s = downState(mask, i);
    tickFor(s, 12, true, current => {
      assert.equal(current.attached, true, `held mask${mask} hold${i} detached`);
      assert.equal(current.holdIndex, i);
      assert.equal(current.launches, 0);
      assert(!current.sfx.includes("slip"), "holding never triggers a timed drop");
    });
  }
  console.log("PASS no automatic descent after 60s idle or 12s continuous hold");
}

function distinctGestures() {
  for (const mask of [0, 15]) for (const i of [5, 22, 35, 46]) {
    const s = downState(mask, i, 8.1);
    const first = P.plan(s, -1);
    assert(first, `downward plan at ${i}, mask${mask}`);
    const move = P.execute(s, first.release);
    assert(move.launched && move.landed && move.delta === -1, "one release catches the next lower hold");
    assert.equal(s.needUp, true, "catch requires a new gesture before another launch");
    const caught = s.holdIndex, launches = s.launches;
    tickFor(s, 5, true, current => {
      assert.equal(current.attached, true);
      assert.equal(current.holdIndex, caught);
      assert.equal(current.launches, launches, "the catch/reach press cannot launch again");
      assert.equal(current.holdT, 0, "the catch/reach press cannot charge the next movement");
    });
    P.tick(s, { holding: false });
    assert.equal(s.launches, launches, "releasing the catch gesture does not count as a new launch");
    P.ready(s);
    const second = P.plan(s, -1);
    assert(second, "a fresh press can plan the next downward move");
    const next = P.execute(s, second.release);
    assert(next.launched && next.landed && next.delta === -1);
    assert.equal(s.launches, launches + 1);
  }
  console.log("PASS exactly one downward move per fresh press/release, including held catches");
}

function pickups() {
  const s = downState(3, 18);
  s.lost = [lostItem("trophy", 18), lostItem("letter", 5)];
  P.tick(s, { holding: false });
  assert.equal(s.lost.length, 1);
  assert.equal(s.mask, 7);
  assert.equal(s.descending, true, "continue descending while another lost object remains below");
  assert.equal(s.returning, true);

  // Isolate the final pickup transition; journeys.js reaches this point through
  // actual launches, including a complete trip with all four objects discarded.
  const h = FX.HOLDS[5];
  s.holdIndex = s.origin = h.i; s.y = h.y - FX.L; s.z = h.z;
  s.holdT = 0; s.holding = false; s.prevHolding = false; s.needUp = false;
  P.tick(s, { holding: true });
  assert.equal(s.lost.length, 0);
  assert.equal(s.mask, 15);
  assert.equal(s.descending, false, "the final pickup selects re-ascent");
  assert.equal(s.returning, true, "changing direction does not remove the return weather");
  assert.equal(s.needUp, true, "the old downward gesture cannot turn into an upward launch");
  const launches = s.launches;
  tickFor(s, 3, true);
  assert.equal(s.launches, launches);
  assert.equal(s.holdT, 0);
  P.ready(s);
  const up = P.plan(s, 1);
  assert(up, "re-ascent is reachable after the final pickup");
  assert(P.execute(s, up.release).delta > 0);
  console.log("PASS multiple pickups, automatic return to upward control, and preserved weather");
}

function restChoices() {
  for (const kind of FX.ORDER) for (const action of ["keep", "drop"]) {
    const h = FX.HOLDS.find(hold => hold.k === kind), s = P.fresh(15, h.i - 1);
    s.attached = false; s.flightT = 1;
    s.y = h.y + .2; s.z = h.z; s.vy = -1;
    P.tick(s, { holding: true });
    assert.equal(s.holdIndex, h.i, `${kind}: catch arrives at the pack decision`);
    assert.equal(s.mode, "ledge");
    tickFor(s, .4, true);
    P.tick(s, { holding: false });
    assert.equal(s.mode, "ledge", "releasing the catch gesture cannot dismiss the pack decision");
    tickFor(s, .1, true);
    P.tick(s, { holding: false });
    tickFor(s, 1, false);
    assert.equal(s.mode, "ledge", "a short climbing tap is not an explicit keep choice");
    assert.equal(s.mask, 15, "the pack waits for a deliberate choice");
    assert.equal(s.attached, true);
    P.tick(s, action === "keep" ? { keep: true } : { dropKind: kind });
    assert.equal(s.mode, action === "keep" ? "play" : "drop");
    assert.equal(s.mask, action === "keep" ? 15 : 15 & ~FX.ITEMS[kind].bit);
  }
  console.log("PASS all four pack decisions survive catch releases and require explicit keep/drop");
}

function main() {
  const started = performance.now();
  selection(); separatedCurves(); noAutomaticDescent(); distinctGestures(); pickups(); restChoices();
  console.log(`PASS descent contracts (${((performance.now() - started) / 1000).toFixed(1)}s)`);
}
if (require.main === module) main();
module.exports = { downState, selection, separatedCurves, noAutomaticDescent, distinctGestures, pickups, restChoices, main };
