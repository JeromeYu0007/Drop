/* Release-window check across route stages and sampled wind phases. This is a
 * reachability/precision guard; difficulty.js separately checks stage trends. */
const FX = require("../game.js");

// Current wind uses a 0.23 rad/s swell and a 0.70 rad/s gust. A
// golden-ratio stride avoids repeatedly sampling the same phase of either.
// These twelve offsets are a deterministic sample, not an exhaustive period.
const SWELL_PERIOD = (Math.PI * 2) / 0.23;
const GUST_PERIOD = (Math.PI * 2) / 0.70;
const PHASE_OFFSETS = Array.from({ length: 12 }, (_, i) => i * SWELL_PERIOD * ((Math.sqrt(5) - 1) / 2));
const BANDS = {
  empty: [
    { min: .15, max: .60 }, { min: .12, max: .52 }, { min: .10, max: .44 },
    { min: .08, max: .38 }, { min: .06, max: .32 },
  ],
  full: [
    { min: .12, max: .50 }, { min: .10, max: .44 }, { min: .08, max: .38 },
    { min: .06, max: .32 }, { min: .05, max: .28 },
  ],
  // Descent is selected explicitly and no longer has an artificial 340ms
  // direction-switch gate. Report its real usable range rather than preserving
  // the obsolete downBeat window as an acceptance criterion.
  down: { min: .10, max: 2.4 },
};
const MASKS = [
  { name: "empty", mask: 0 },
  { name: "full", mask: 15 },
];
const DT = 1 / 120;

// Edges are refined every two physics frames. Compare targets with one frame
// of quantization tolerance; a completely closed window is never acceptable.
function inBand(value, band) {
  return value > 0 && value + DT + 1e-6 >= band.min && value - DT - 1e-6 <= band.max;
}
function meetsMinimum(value, band) {
  return value > 0 && value + DT + 1e-6 >= band.min;
}

function lowerIndex(i) {
  const h = FX.HOLDS[i];
  let best = -1;
  let gap = 1e9;
  for (let j = 0; j < FX.HOLDS.length; j++) {
    const dy = h.y - FX.HOLDS[j].y;
    if (dy < 0.8 || dy > 12) continue;
    if (dy < gap) {
      gap = dy;
      best = j;
    }
  }
  return best;
}

function meanOf(xs) {
  if (!xs || !xs.length) return null;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

function releaseAt(mask, i, t, phase, down, want, assisted) {
  const h = FX.HOLDS[i];
  const s = FX.createState();
  s.mask = mask;
  s.intro = 0;
  s.settle = 1;
  s.attached = true;
  s.holdIndex = i;
  s.origin = i;
  s.mode = "play";
  s.lock = 0;
  s.needUp = false;
  s.restSeen = 0xffffffff;
  s.descending = !!down;
  s.returning = !!down;
  s.crown = false;
  s.y = h.y - 1;
  s.z = h.z;
  s.slip = 0;
  // Isolate release timing at a known wind phase. A production held step
  // establishes the same release sample as a live gesture before
  // the release edge. Input-history and long-hold contracts live in descent.js.
  s.time = phase - DT * 2;
  s.holdT = Math.max(0, t - DT);
  s.holding = true;
  s.prevHolding = false;
  FX.step(s, DT, { holding: true, freezeIntro: true });
  FX.step(s, DT, { holding: false, freezeIntro: true });
  const floor = want >= 0 && FX.HOLDS[want] ? FX.HOLDS[want].y - 3.5 : 0;
  for (let k = 0; k < 280 && !s.attached && s.mode === "play"; k++) {
    FX.step(s, DT, { holding: !!assisted && s.vy < 0, freezeIntro: true });
    if (s.y < floor && s.vy < -1) break;
  }
  return s;
}

function caught(mask, i, t, phase, down, want, assisted) {
  const s = releaseAt(mask, i, t, phase, down, want, assisted);
  return s.attached && s.holdIndex === want && s.falls === 0;
}

function longest(mask, i, phase, down, want, t0, t1, assisted) {
  const step = 0.025;
  const ok = [];
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    ok.push({ t: Math.round(t * 1000) / 1000, hit: caught(mask, i, t, phase, down, want, assisted) });
  }
  let best = -1;
  let run = null;
  let cur = null;
  for (let n = 0; n < ok.length; n++) {
    if (ok[n].hit) {
      if (!cur) cur = { a: ok[n].t, b: ok[n].t };
      else cur.b = ok[n].t;
    } else if (cur) {
      if (cur.b - cur.a > best) {
        best = cur.b - cur.a;
        run = cur;
      }
      cur = null;
    }
  }
  if (cur && cur.b - cur.a > best) {
    best = cur.b - cur.a;
    run = cur;
  }
  if (!run) return { span: 0, a: 0, b: 0 };
  // Refine the edges to about one frame.
  let a = run.a;
  let b = run.b;
  for (let t = Math.max(t0, run.a - step + DT); t < run.a; t += DT * 2) {
    if (caught(mask, i, t, phase, down, want, assisted)) {
      a = t;
      break;
    }
  }
  for (let t = run.b + DT * 2; t <= t1 && t < run.b + step; t += DT * 2) {
    if (caught(mask, i, t, phase, down, want, assisted)) b = t;
    else break;
  }
  return { span: Math.max(0, b - a), a: a, b: b };
}

function arrivalTimes() {
  const seen = { 0: {}, 15: {} };
  for (const mask of [0, 15]) {
    const s = FX.createState();
    s.mask = mask;
    s.intro = 0;
    s.settle = 1;
    let guard = 0;
    while (guard++ < 50000 && s.mode !== "ending" && s.falls < 2) {
      const input = { holding: false, freezeIntro: true };
      if (s.mode === "ledge") input.keep = true;
      else if (s.mode !== "play" || s.needUp || s.lock > 0) input.holding = false;
      else if (!s.attached) input.holding = true;
      else if (s.crown) input.choice = "door";
      else {
        if (seen[mask][s.holdIndex] == null) seen[mask][s.holdIndex] = s.time;
        const ni = s.holdIndex + 1;
        if (ni >= FX.HOLDS.length) break;
        if (s.holdT > 0.6 && caught(mask, s.holdIndex, s.holdT, s.time, false, ni)) {
          s.prevHolding = true;
          s.holding = true;
          input.holding = false;
        } else input.holding = true;
      }
      FX.step(s, DT, input);
    }
  }
  return seen;
}

function phasesFor(i, arrivals) {
  const samples = [];
  if (arrivals[0][i] != null) samples.push(arrivals[0][i]);
  if (arrivals[15][i] != null) samples.push(arrivals[15][i]);
  const base = samples.length ? Math.min.apply(null, samples) : 6 + i;
  return PHASE_OFFSETS.map(offset => base + offset);
}

function measure(onRow) {
  const arrivals = arrivalTimes();
  const rows = [];
  let failed = 0;
  for (let i = 0; i < FX.HOLDS.length; i++) {
    const h = FX.HOLDS[i];
    const upTo = i + 1 < FX.HOLDS.length ? i + 1 : -1;
    const downTo = lowerIndex(i);
    const cell = {
      i: i,
      y: h.y,
      z: h.z,
      k: h.k,
      stage: FX.stageAt(h.y),
      up: {},
      reach: {},
      reachCases: [],
      down: {},
    };
    let upE = 1e9;
    let upF = 1e9;
    let downMin = downTo >= 0 ? 1e9 : null;
    for (const pack of MASKS) {
      cell.up[pack.name] = [];
      cell.reach[pack.name] = [];
      cell.down[pack.name] = [];
      for (const phase of phasesFor(i, arrivals)) {
        if (upTo >= 0) {
          const w = longest(pack.mask, i, phase, false, upTo, 0.17, 2.2);
          cell.up[pack.name].push(w.span);
          // Let go to launch; while falling, press to extend the hand. Preserve
          // the passive timing data and test this supported recovery gesture
          // separately when the passive route is narrower than its target.
          const needsReach = !meetsMinimum(w.span, BANDS[pack.name][cell.stage]);
          const reach = needsReach ? longest(pack.mask, i, phase, false, upTo, .17, 2.2, true) : null;
          cell.reach[pack.name].push(reach ? reach.span : null);
          if (reach) cell.reachCases.push({ pack: pack.name, phase, passive: w, active: reach });
          if (pack.name === "empty" && w.span < upE) upE = w.span;
          if (pack.name === "full" && w.span < upF) upF = w.span;
        }
        if (downTo >= 0) {
          const w = longest(pack.mask, i, phase, true, downTo, 0.25, 2.4);
          cell.down[pack.name].push(w.span);
          if (w.span < downMin) downMin = w.span;
        }
      }
    }
    const upMin = upTo >= 0 ? Math.min(upE, upF) : null;
    const ups = (cell.up.empty || []).concat(cell.up.full || []);
    const downs = (cell.down.empty || []).concat(cell.down.full || []);
    cell.upMin = upMin;
    cell.upMean = meanOf(ups);
    cell.downMin = downMin;
    cell.downMax = downs.length ? Math.max.apply(null, downs) : null;
    if (upTo < 0) cell.upOk = true;
    else {
      const accepted = name => cell.up[name].every((passive, index) => {
        const band = BANDS[name][cell.stage], active = cell.reach[name][index];
        // The passive upper bound controls launch precision. A deliberate
        // reaching gesture may help more, so it has only a minimum-width gate.
        return passive - DT - 1e-6 <= band.max &&
          (meetsMinimum(passive, band) || meetsMinimum(active, band));
      });
      const eOk = accepted("empty");
      const fOk = accepted("full");
      cell.upOk = eOk && fOk;
    }
    cell.requiresReach = cell.reachCases.length > 0;
    if (downTo < 0) cell.downOk = true;
    else {
      const dOk = downs.length > 0 && downs.every(v => inBand(v, BANDS.down));
      cell.downOk = dOk;
    }
    if (!cell.upOk || !cell.downOk) failed++;
    rows.push(cell);
    if (onRow) onRow(cell);
  }
  return { rows: rows, failed: failed };
}

function fmt(v) {
  if (v == null) return "  —  ";
  return v.toFixed(3);
}

function main() {
  const t0 = Date.now();
  console.log("Sampled wind offsets:", PHASE_OFFSETS.length, "over", PHASE_OFFSETS.at(-1).toFixed(1), "seconds; not exhaustive.");
  console.log("Accepted seconds by route stage:", JSON.stringify(BANDS));
  console.log("Window-edge quantization tolerance:", DT.toFixed(6), "seconds; zero-width windows fail.");
  console.log("Up columns retain passive windows. requiresReach separately verifies holding on descent; active windows have no passive upper bound.");
  console.log("i  stage y     kind     upEmin upEmax upFmin upFmax downMin downMax");
  const report = measure(r => {
    const range = xs => xs.length ? [Math.min(...xs), Math.max(...xs)] : [null, null];
    const values = [...range(r.up.empty), ...range(r.up.full), r.downMin, r.downMax];
    const flag = r.upOk && r.downOk ? "" : "  FAIL";
    console.log(String(r.i).padStart(2), r.stage, r.y.toFixed(1).padStart(5), r.k.padEnd(8),
      ...values.map(v => fmt(v).padStart(6)), r.requiresReach ? " requiresReach" : "", flag);
    for (const c of r.reachCases) {
      console.log(`  active ${c.pack} phase ${c.phase.toFixed(6)}: passive ${c.passive.span.toFixed(6)}s; active range ${c.active.a.toFixed(6)}–${c.active.b.toFixed(6)}s, width ${c.active.span.toFixed(6)}s`);
    }
  });
  console.log(report.failed ? "FAIL " + report.failed : "PASS");
  console.log("seconds", ((Date.now() - t0) / 1000).toFixed(1));
  if (report.failed) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { measure, caught, longest, lowerIndex, phasesFor, arrivalTimes, inBand, meetsMinimum, PHASE_OFFSETS, BANDS, DT, SWELL_PERIOD, GUST_PERIOD };
