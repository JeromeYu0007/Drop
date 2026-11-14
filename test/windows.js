/* Active release/reach windows. Default CI covers every route link at one wind
 * phase plus exposed/bottleneck links at two other phases. --extended samples
 * every link at twelve phases; it is diagnostic, not a hidden CI requirement. */
"use strict";
const assert = require("node:assert/strict");
const FX = require("../game.js"), P = require("./pilot.js");
const DT = P.DT;
const SWELL_PERIOD = Math.PI * 2 / .23, GUST_PERIOD = Math.PI * 2 / .70;
const PHASE_OFFSETS = Array.from({ length: 12 }, (_, i) => i * SWELL_PERIOD * ((Math.sqrt(5) - 1) / 2));
const EXTRA_HOLDS = new Set([3, 9, 12, 13, 22, 24, 26, 28, 34, 35, 40, 43, 44, 45, 46]);
const BANDS = { release: { min: .05, max: 2.4 }, reach: { min: .05, max: .65 } };
function inBand(value, band) { return value > 0 && value + DT + 1e-6 >= band.min && value - DT - 1e-6 <= band.max; }
function lowerIndex(i) { return i > 0 ? i - 1 : -1; }
function fixture(mask, i, phase, down) {
  const s = P.fresh(mask, i, phase);
  s.descending = !!down; s.returning = !!down; s.crown = false; s.restSeen = 0xffffffff;
  return s;
}
function longest(mask, i, phase, down, want, low = .17, high = 2.2) {
  const held = fixture(mask, i, phase, down), direction = down ? -1 : 1;
  let current = null, best = null;
  const samples = [];
  for (let frame = 1; held.holdT <= high && frame < 720; frame++) {
    P.tick(held, { holding: true });
    if (frame % 3 || held.holdT < low) continue;
    const route = P.trial(held, direction), sample = { t: held.holdT, route };
    samples.push(sample);
    if (route) {
      if (!current) current = { a: sample.t, b: sample.t }; else current.b = sample.t;
    } else if (current) {
      if (!best || current.b - current.a > best.b - best.a) best = current;
      if (best.b - best.a + 1e-7 >= BANDS.release.min) break;
      current = null;
    }
  }
  if (current && (!best || current.b - current.a > best.b - best.a)) best = current;
  if (!best) return { span: 0, a: 0, b: 0, plan: null };
  const middle = (best.a + best.b) / 2;
  const selected = samples.filter(x => x.route && x.t >= best.a && x.t <= best.b)
    .reduce((a, b) => Math.abs(a.t - middle) <= Math.abs(b.t - middle) ? a : b);
  return { ...best, span: best.b - best.a, plan: { release: selected.t, direction, ...selected.route } };
}
function reachWindow(state, plan) {
  if (!plan) return { a: 0, b: 0, span: 0 };
  const held = P.copy(state);
  while (held.holdT + 1e-7 < plan.release) P.tick(held, { holding: true });
  P.tick(held, { holding: false });
  // Sample the complete geometric opportunity, including a possible second
  // pass while falling. A fast ascent must not hide a valid later reach window.
  const probe = P.copy(held), target = FX.HOLDS[state.holdIndex + plan.direction];
  let lastContact = plan.contactAt || plan.grabAt;
  for (let frame = 0; frame < 3.5 / DT && probe.mode === "play"; frame++) {
    P.tick(probe, { holding: false });
    const candidate = FX.catchCandidate(probe);
    if (candidate && candidate.index === target.i && candidate.reachable && candidate.canCatchSpeed) lastContact = probe.flightT;
    if (probe.vy < 0 && FX.bodyFrame(probe).hip.y + 1.23 < target.y) break;
  }
  let current = null;
  const windows = [];
  for (let grabAt = 0; grabAt <= lastContact + .1; grabAt += .025) {
    const trial = P.copy(held);
    const result = P.finishFlight(trial, state.holdIndex, 3.5, null, grabAt);
    if (result.landed && result.delta === plan.direction) {
      if (!current) current = { a: grabAt, b: grabAt }; else current.b = grabAt;
    } else if (current) { windows.push(current); current = null; }
  }
  if (current) windows.push(current);
  const best = windows.reduce((a, b) => b.b - b.a > a.b - a.a ? b : a, { a: 0, b: 0 });
  return { ...best, span: best.b - best.a, windows: windows.map(w => ({ ...w, span: w.b - w.a })) };
}
function phasesFor(i, extended = false) {
  return extended ? PHASE_OFFSETS : EXTRA_HOLDS.has(i) ? [0, PHASE_OFFSETS[3], PHASE_OFFSETS[7]] : [0];
}
function waitForWindow(mask, index, phase, down) {
  const origin = fixture(mask, index, phase, down), direction = down ? -1 : 1;
  for (const seconds of [1.5, 3, 6, 9, 12]) {
    const waiting = P.copy(origin);
    for (let frame = 0; frame < Math.round(seconds / DT); frame++) P.tick(waiting, { holding: false });
    assert(waiting.attached && waiting.holdIndex === index, "waiting for a gust must keep the player on the same hold");
    const plan = P.plan(waiting, direction);
    if (!plan || !inBand(plan.span, BANDS.release)) continue;
    const result = P.execute(P.copy(waiting), plan);
    assert(result.landed && result.delta === direction, "the post-gust window must replay with real input");
    return { seconds, span: plan.span, plan };
  }
  return null;
}

function measure(onRow, extended = false) {
  const rows = [];
  for (let i = 0; i < FX.HOLDS.length; i++) {
    const h = FX.HOLDS[i], cell = { i, y: h.y, stage: FX.stageAt(h.y), up: [], down: [], reach: [] };
    for (const mask of [0, 15]) for (const phase of phasesFor(i, extended)) {
      for (const down of [false, true]) {
        if (down ? i === 0 : i === FX.HOLDS.length - 1) continue;
        const window = longest(mask, i, phase, down, i + (down ? -1 : 1), down ? .25 : .17, down ? 2.4 : 2.2);
        const waiting = inBand(window.span, BANDS.release) ? null : waitForWindow(mask, i, phase, down);
        cell[down ? "down" : "up"].push({ mask, phase, ...window, waiting });
        if (!down && phase === 0 && [3, 13, 24, 35, 43].includes(i)) {
          cell.reach.push({ mask, ...reachWindow(fixture(mask, i, phase, down), window.plan) });
        }
      }
    }
    cell.ok = [...cell.up, ...cell.down].every(x => inBand(x.span, BANDS.release) || x.waiting && inBand(x.waiting.span, BANDS.release)) && cell.reach.every(x => inBand(x.span, BANDS.reach));
    rows.push(cell); if (onRow) onRow(cell);
  }
  return { rows, failed: rows.filter(x => !x.ok).length };
}
function main() {
  const started = performance.now(), extended = process.argv.includes("--extended");
  console.log(extended ? "Extended: every link × both pack extremes × 12 wind phases." : "CI: every link × both pack extremes; 15 exposed/bottleneck holds also sample two separated wind phases.");
  console.log("Every catch requires a fixed second press; no passive catching or wall homing is permitted.");
  const report = measure(row => {
    const low = xs => xs.length ? Math.min(...xs.map(x => x.span)).toFixed(3) : "—";
    console.log(`hold ${row.i} stage ${row.stage + 1}: up ${low(row.up)}s, down ${low(row.down)}s, reach ${low(row.reach)}s${row.ok ? "" : " FAIL"}`);
    for (const route of [...row.up, ...row.down]) if (route.waiting) console.log(`  gust wait mask${route.mask} phase${route.phase.toFixed(3)}: raw ${route.span.toFixed(3)}s; wait ${route.waiting.seconds}s through step(); usable ${route.waiting.span.toFixed(3)}s`);
    if (!row.ok) console.log("FAILED_WINDOWS", JSON.stringify(row));
  }, extended);
  console.log(`Measured ${report.rows.reduce((sum, row) => sum + row.up.length + row.down.length, 0)} route/pack/wind/direction cases in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  if (!process.argv.includes("--report-only")) assert.equal(report.failed, 0, `${report.failed} holds have no usable deliberate release/reach window`);
  console.log(report.failed ? "FAIL" : "PASS windows");
  return report;
}
if (require.main === module) main();
module.exports = { measure, longest, lowerIndex, phasesFor, reachWindow, fixture, waitForWindow, inBand, PHASE_OFFSETS, BANDS, DT, SWELL_PERIOD, GUST_PERIOD };
