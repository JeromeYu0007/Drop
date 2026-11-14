/* Misses sampled just outside the pilot's successful release window.
 * The departure hold is a valid reachable hold under the game's catch rule.
 * Report it separately: strict lower catches / all failed-to-advance moves;
 * any saved move / all failed-to-advance moves; and lower catches after the
 * falling body has actually passed below the departure hold's catch band.
 * Never silently count an origin catch as a lower catch. */
const assert = require("node:assert/strict");
const FX = require("../game.js");
const P = require("./pilot.js");
const PHASES = [0.4, 8.1, 23.4, 47.7];
const OFFSETS = [0.08, 0.16, 0.24];

function measure() {
  const rows = [];
  for (let i = 1; i < FX.HOLDS.length - 1; i++) {
    if (FX.HOLDS[i].y <= 20) continue;
    let missed = 0, lower = 0, same = 0, ground = 0, noLaunch = 0, advanced = 0;
    let passedOrigin = 0, lowerAfterPassing = 0;
    const drops = [];
    for (const mask of [0, 15]) for (const phase of PHASES) {
      const base = P.fresh(mask, i, phase);
      const p = P.plan(base, 1);
      assert.ok(p, `no launch plan at ${i}, mask ${mask}, phase ${phase}`);
      const times = OFFSETS.flatMap(d => [Math.max(0.18, p.a - d), p.b + d]);
      for (const t of times) {
        const s = P.copy(base);
        let passed = false;
        const result = P.execute(s, t, flight => {
          if (!flight.attached && flight.vy < 0 && flight.y < FX.HOLDS[i].y - 1.4) passed = true;
        });
        if (!result.launched) { noLaunch++; continue; }
        if (s.attached && s.holdIndex > i) { advanced++; continue; }
        missed++;
        if (passed) passedOrigin++;
        if (s.attached && s.holdIndex < i && s.falls === 0) {
          lower++; drops.push(i - s.holdIndex);
          if (passed) lowerAfterPassing++;
        } else if (s.attached && s.holdIndex === i && s.falls === 0) same++;
        else ground++;
      }
    }
    rows.push({ i, y: FX.HOLDS[i].y, missed, lower, same, ground, advanced, noLaunch, passedOrigin, lowerAfterPassing,
      rate: missed ? lower / missed : 0,
      savedRate: missed ? (lower + same) / missed : 0,
      conditionalLowerRate: passedOrigin ? lowerAfterPassing / passedOrigin : null,
      meanHoldsLost: drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : 0,
      maxHoldsLost: drops.length ? Math.max(...drops) : 0 });
  }
  return rows;
}
function main() {
  const t = performance.now();
  const rows = measure();
  for (const r of rows) console.log(`${r.i.toString().padStart(2)} ${r.y.toFixed(1).padStart(5)}m lower ${r.lower}/${r.missed} ${(r.rate * 100).toFixed(1)}% same ${r.same} saved ${(r.savedRate * 100).toFixed(1)}% passed-origin ${r.lowerAfterPassing}/${r.passedOrigin} ground ${r.ground} loss ${r.meanHoldsLost.toFixed(1)}/${r.maxHoldsLost}`);
  const failed = rows.filter(r => !r.missed || r.savedRate < 0.6 || (r.passedOrigin && r.conditionalLowerRate < 0.6));
  const total = rows.reduce((a, r) => ({ missed: a.missed + r.missed, lower: a.lower + r.lower, same: a.same + r.same,
    passedOrigin: a.passedOrigin + r.passedOrigin, lowerAfterPassing: a.lowerAfterPassing + r.lowerAfterPassing, ground: a.ground + r.ground }),
  { missed: 0, lower: 0, same: 0, ground: 0, passedOrigin: 0, lowerAfterPassing: 0 });
  console.log(JSON.stringify({ sample: "two pack extremes, four wind phases, ±80/160/240ms outside successful windows", ...total,
    strictLowerRecoveryRate: total.lower / total.missed, anyHoldRecoveryRate: (total.lower + total.same) / total.missed,
    afterPassingOriginRecoveryRate: total.passedOrigin ? total.lowerAfterPassing / total.passedOrigin : null,
    failedHolds: failed.map(r => r.i), wallSeconds: +((performance.now() - t) / 1000).toFixed(1) }));
  assert.equal(failed.length, 0, `${failed.length} holds below 60% any-hold or passed-origin recovery: ${failed.map(r => r.i).join(",")}`);
  console.log("PASS recovery");
  return rows;
}
if (require.main === module) main();
module.exports = { measure, PHASES, OFFSETS };
