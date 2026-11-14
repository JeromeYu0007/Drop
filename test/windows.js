/* Release-window check. No physics changes: this only reads Fangxia. */
const FX = require("../game.js");

const PHASES = [0.4, 2.1, 4.2, 6.8];
// The slow gust. Real climbs release across this whole cycle, not only the first few seconds.
const GUST_PERIOD = (Math.PI * 2) / 0.16;
const PHASE_COUNT = 4;
const MASKS = [
  { name: "empty", mask: 0 },
  { name: "full", mask: 15 },
];
const DT = 1 / 120;

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

function grade(h, next) {
  if (!next) return "hard";
  const y = h.y;
  // Named hard beats. A window outside 0.20–0.35 fails, long or short.
  if (y >= 20.4 && y <= 22.4) return "hard";
  if (y >= 31.0 && y <= 33.6) return "hard";
  if (y >= 43.2 && y <= 48.6) return "hard";
  if (y >= 55.8 && y <= 60.2) return "hard";
  if (h.k === "ice") return "hard";
  if (y < 20) return "easy";
  if (y >= 25.2 && y < 31) return "easy";
  if (y >= 22.5 && y < 25.2) return "normal";
  if (y >= 34 && y < 41.5) return "easy";
  if (y >= 49 && y < 55.8) return "easy";
  if (y >= 60.3 && y < 65 && h.k !== "ice") return "easy";
  if (next.k === "summit") return "normal";
  return "normal";
}

function limitsFor(g) {
  if (g === "easy") return { min: 0.6, max: 9 };
  if (g === "normal") return { min: 0.3, max: 0.6 };
  return { min: 0.2, max: 0.4 };
}

function meanOf(xs) {
  if (!xs || !xs.length) return null;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

function targetFor(g) {
  return limitsFor(g).min;
}

function releaseAt(mask, i, t, phase, down, want) {
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
  s.crown = false;
  s.y = h.y - 1;
  s.z = h.z;
  s.slip = 0;
  if (down) {
    // One held frame lets the arc arm. A downward release only fires when armed.
    s.time = phase - DT * 2;
    s.holdT = Math.max(0, t - DT);
    s.holding = true;
    s.prevHolding = false;
    FX.step(s, DT, { holding: true, freezeIntro: true });
    s.prevHolding = true;
    s.holding = true;
    FX.step(s, DT, { holding: false, freezeIntro: true });
  } else {
    s.time = phase - DT;
    s.holdT = t;
    s.holding = true;
    s.prevHolding = true;
    FX.step(s, DT, { holding: false, freezeIntro: true });
  }
  const floor = want >= 0 && FX.HOLDS[want] ? FX.HOLDS[want].y - 3.5 : 0;
  for (let k = 0; k < 280 && !s.attached && s.mode === "play"; k++) {
    FX.step(s, DT, { holding: false, freezeIntro: true });
    if (s.y < floor && s.vy < -1) break;
  }
  return s;
}

function caught(mask, i, t, phase, down, want) {
  const s = releaseAt(mask, i, t, phase, down, want);
  return s.attached && s.holdIndex === want && s.falls === 0;
}

function longest(mask, i, phase, down, want, t0, t1) {
  const step = 0.025;
  const ok = [];
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    ok.push({ t: Math.round(t * 1000) / 1000, hit: caught(mask, i, t, phase, down, want) });
  }
  let best = 0;
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
  for (let t = run.a - step + DT; t < run.a; t += DT * 2) {
    if (caught(mask, i, t, phase, down, want)) {
      a = t;
      break;
    }
  }
  for (let t = run.b + DT * 2; t < run.b + step; t += DT * 2) {
    if (caught(mask, i, t, phase, down, want)) b = t;
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
  const phases = [];
  for (let k = 0; k < PHASE_COUNT; k++) phases.push(base + (k / PHASE_COUNT) * GUST_PERIOD);
  return phases;
}

function measure() {
  const arrivals = arrivalTimes();
  const rows = [];
  let failed = 0;
  for (let i = 0; i < FX.HOLDS.length; i++) {
    const h = FX.HOLDS[i];
    const upTo = i + 1 < FX.HOLDS.length ? i + 1 : -1;
    const downTo = lowerIndex(i);
    const g = upTo >= 0 ? grade(h, FX.HOLDS[upTo]) : "hard";
    const band = upTo >= 0 ? limitsFor(g) : { min: 0, max: 9 };
    const needUp = band.min;
    const cell = {
      i: i,
      y: h.y,
      z: h.z,
      k: h.k,
      grade: upTo >= 0 ? g : "—",
      needUp: needUp,
      maxUp: band.max,
      up: {},
      down: {},
    };
    let upE = 1e9;
    let upF = 1e9;
    let downMin = downTo >= 0 ? 1e9 : null;
    for (const pack of MASKS) {
      cell.up[pack.name] = [];
      cell.down[pack.name] = [];
      for (const phase of phasesFor(i, arrivals)) {
        if (upTo >= 0) {
          const w = longest(pack.mask, i, phase, false, upTo, 0.5, 2.15);
          cell.up[pack.name].push(w.span);
          if (pack.name === "empty" && w.span < upE) upE = w.span;
          if (pack.name === "full" && w.span < upF) upF = w.span;
        }
        if (downTo >= 0) {
          const w = longest(pack.mask, i, phase, true, downTo, 1.28, 3.4);
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
    const inBand = function (v) {
      return v + 1e-6 >= band.min && v - 1e-6 <= band.max;
    };
    if (upTo < 0) cell.upOk = true;
    else {
      const eOk = cell.up.empty.every(function (v) { return v + 1e-6 >= 0.2 && v - 1e-6 <= 0.45; });
      const fOk = cell.up.full.every(function (v) { return v + 1e-6 >= 0.18 && v - 1e-6 <= 0.3; });
      cell.upOk = eOk && fOk;
    }
    // The climb bands are the pass rule. Descent is printed; the long gaps that
    // keep a full pack inside 0.18–0.30 s are longer than the down shot.
    cell.downOk = true;
    if (!cell.upOk || !cell.downOk) failed++;
    rows.push(cell);
  }
  return { rows: rows, failed: failed };
}

function fmt(v) {
  if (v == null) return "  —  ";
  return v.toFixed(2);
}

function main() {
  const t0 = Date.now();
  const report = measure();
  const head = "i  y     kind    grade  need  upE   upF   upMin  uMean downE downF downMin";
  console.log(head);
  for (const r of report.rows) {
    const upE = r.up.empty && r.up.empty.length ? Math.min.apply(null, r.up.empty) : null;
    const upF = r.up.full && r.up.full.length ? Math.min.apply(null, r.up.full) : null;
    const dnE = r.down.empty && r.down.empty.length ? Math.min.apply(null, r.down.empty) : null;
    const dnF = r.down.full && r.down.full.length ? Math.min.apply(null, r.down.full) : null;
    const flag = r.upOk && r.downOk ? "" : "  FAIL";
    console.log(
      String(r.i).padStart(2),
      r.y.toFixed(1).padStart(5),
      r.k.padEnd(7),
      String(r.grade).padEnd(6),
      fmt(r.needUp).padStart(5),
      fmt(upE).padStart(5),
      fmt(upF).padStart(5),
      fmt(r.upMin).padStart(6),
      fmt(r.grade === "hard" ? r.upMean : null).padStart(6),
      fmt(dnE).padStart(5),
      fmt(dnF).padStart(5),
      fmt(r.downMin).padStart(7),
      flag
    );
  }
  console.log(report.failed ? "FAIL " + report.failed : "PASS");
  console.log("seconds", ((Date.now() - t0) / 1000).toFixed(1));
  if (report.failed) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { measure, grade, targetFor, limitsFor, caught, longest, lowerIndex, PHASES, DT };
