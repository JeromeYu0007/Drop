/* End-to-end physics acceptance, independent of renderer/UI. */
const assert = require("node:assert/strict");
const FX = require("../game.js");
const P = require("./pilot.js");

function noForcedDrop() {
  for (const mask of [0, 15]) {
    for (const kind of ["start", "ice"]) {
      const i = FX.HOLDS.findIndex(h => h.k === kind);
      if (i < 0) continue;
      for (const holding of [false, true]) {
        const s = P.fresh(mask, i);
        for (let n = 0; n < 12 / P.DT; n++) {
          P.tick(s, { holding });
          assert.equal(s.attached, true, `${kind} mask${mask} forced ${holding ? "held" : "idle"} fall at ${s.time}`);
        }
      }
    }
  }
}

function catchContract() {
  // Being within reach on descent is sufficient, even at the departure hold.
  // This guards against tuning recovery percentages by blacklisting catches.
  for (const h of FX.HOLDS) {
    const s = P.fresh(15, h.i);
    s.attached = false;
    s.crown = false;
    s.flightT = 1;
    s.y = h.y + 0.2;
    s.z = h.z;
    s.vy = -1;
    P.tick(s, { holding: false });
    assert.equal(s.attached, true, `reachable departure hold ${h.i} was suppressed`);
    assert.equal(s.holdIndex, h.i, `reachable hold ${h.i} was not caught`);
  }
  // A large outward miss low on the route still has real consequences.
  const low = FX.HOLDS.findIndex(h => h.y > 20);
  const miss = P.fresh(0, low);
  miss.attached = false; miss.crown = false; miss.flightT = .5;
  miss.y = FX.HOLDS[low].y; miss.z = FX.HOLDS[low].z + 24;
  miss.vy = -12; miss.vz = 8;
  P.finishFlight(miss, low, 10);
  assert.equal(miss.mode, "impact", "extreme outward miss was teleported to safety");
  assert.equal(miss.falls, 1, "missing every reachable hold must count as a ground fall");
}

function roundTrip(kind) {
  const kinds = Array.isArray(kind) ? kind : [kind], label = kinds.join("+");
  const bits = kinds.reduce((mask, name) => mask | FX.ITEMS[name].bit, 0);
  const first = P.climb({ targetMask: 15 & ~bits });
  assert.equal(first.ok, true, `${label}: initial ascent`);
  assert.equal(first.falls, 0, `${label}: initial ascent fell`);
  assert.equal(first.mask & bits, 0, `${label}: selected items weren't dropped`);
  const s = first.state;
  P.tick(s, { retrieve: true });
  assert.equal(s.mode, "play", "ending retrieve must begin controllable descent");
  assert.equal(s.descending, true, "retrieve selects the downward curve immediately");
  assert.equal(s.returning, true, "retrieve retains the return weather separately");
  let downMoves = 0;
  while ((s.reclaimed & bits) !== bits && downMoves < FX.HOLDS.length * 2) {
    if (s.mode === "ledge") {
      P.tick(s, { holding: false });
      P.tick(s, { keep: true });
      continue;
    }
    P.ready(s);
    const plan = P.plan(s, -1);
    assert.ok(plan, `${label}: no downward release at hold ${s.holdIndex}, mask ${s.mask}`);
    const from = s.holdIndex;
    const result = P.execute(s, plan.release);
    assert.ok(result.launched && result.landed && result.delta === -1,
      `${label}: downward move ${from} failed: ${JSON.stringify(result)}`);
    downMoves++;
  }
  assert.equal(s.reclaimed & bits, bits, `${label}: items not reclaimed`);
  assert.equal(s.mask, 15, `${label}: inventory not restored`);
  assert.equal(s.descending, false, `${label}: last pickup restores the upward curve`);
  assert.equal(s.returning, true, `${label}: return weather persists after pickup`);
  const again = P.climb({ state: s, targetMask: 15 });
  assert.equal(again.ok, true, `${label}: re-ascent failed`);
  assert.equal(again.falls, 0, `${label}: re-ascent fell`);
  assert.equal(again.mask, 15, `${label}: wrong final ending`);
  return { kind: label, seconds: Math.round(s.time * 10) / 10, downMoves, upMoves: first.moves + again.moves };
}

function main() {
  const t = performance.now();
  noForcedDrop();
  catchContract();
  console.log("PASS: no weight-based forced drop on normal ascent (held and idle, start and ice)");
  const rows = [];
  for (let mask = 0; mask < 16; mask++) {
    const fixed = P.climb({ mask });
    assert.equal(fixed.ok, true, `fixed mask ${mask} cannot finish`);
    assert.equal(fixed.falls, 0, `fixed mask ${mask} fell`);
    assert.equal(fixed.setbacks, 0, `fixed mask ${mask} had a failed move`);
    const natural = P.climb({ targetMask: mask });
    assert.equal(natural.ok, true, `natural ending ${mask} cannot finish`);
    assert.equal(natural.mask, mask, `natural ending ${mask} wrong inventory`);
    assert.equal(natural.falls, 0, `natural ending ${mask} fell`);
    rows.push({ mask, constantPackSeconds: +fixed.seconds.toFixed(1), naturalChoicesSeconds: +natural.seconds.toFixed(1), moves: natural.moves });
    console.log(`PASS mask ${mask}: fixed ${fixed.seconds.toFixed(1)}s, natural choices ${natural.seconds.toFixed(1)}s`);
  }
  const returns = [];
  for (const kind of FX.ORDER) {
    const r = roundTrip(kind);
    returns.push(r);
    console.log(`PASS return ${kind}: ${r.downMoves} down moves, final ending 15`);
  }
  const all = roundTrip(FX.ORDER);
  returns.push(all);
  console.log(`PASS return all four items: ${all.downMoves} down moves, final ending 15`);
  const s = P.fresh(15);
  s.mask = 11;
  s.lost = [{ kind: "trophy", bit: 4, hold: 3, y: FX.HOLDS[3].y, z: FX.HOLDS[3].z }];
  s.attached = false; s.y = 1; s.vy = -12;
  for (let i = 0; i < 100; i++) P.tick(s);
  assert.equal(s.mask, 11, "ground fall returned a deliberately dropped item");
  assert.equal(s.lost.length, 1, "ground fall erased lost item");
  P.tick(s, { restart: true });
  assert.equal(s.mask, 15, "restart must restore the four items");
  assert.equal(s.lost.length, 0, "restart must clear lost items");
  console.log(`PASS journeys (${((performance.now() - t) / 1000).toFixed(1)}s wall clock)`);
  return { rows, returns };
}
if (require.main === module) main();
module.exports = { noForcedDrop, catchContract, roundTrip, main };
