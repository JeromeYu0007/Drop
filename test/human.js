/* Informational sensitivity experiment, not a human playtest or duration claim.
 * An oracle selects the best release window. Seeded timing noise is then added:
 * Gaussian sd80ms, plus a10% chance of an additional signed200–400ms mistake.
 * No invented thinking delays or artificial waiting inflate the run time. */
const P = require("./pilot.js");
function main() {
  const seeds = [7, 19, 41, 73, 101, 173];
  const results = [];
  for (const scenario of ["constant-empty", "constant-full", "natural-drop-all"]) {
    const runs = [];
    for (const seed of seeds) {
      const options = scenario === "constant-empty" ? { mask: 0 } : scenario === "natural-drop-all" ? { targetMask: 0 } : { mask: 15 };
      const r = P.climb({ ...options, seed, error: true, seconds: 3600 });
      const row = { scenario, seed, completed: r.ok, minutes: +(r.seconds / 60).toFixed(2), moves: r.moves, setbacks: r.setbacks, groundFalls: r.falls, noPlan: r.noPlan };
      runs.push(row);
      console.log(JSON.stringify(row));
    }
    const times = runs.filter(r => r.completed).map(r => r.minutes).sort((a, b) => a - b);
    results.push({ scenario, completed: times.length, total: runs.length,
      minMinutes: times[0] || null, medianMinutes: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null,
      maxMinutes: times[times.length - 1] || null });
  }
  console.log("SUMMARY (oracle timing model only; learning and real-device behavior are not modeled)");
  console.log(JSON.stringify(results, null, 2));
  return results;
}
if (require.main === module) main();
module.exports = { main };
