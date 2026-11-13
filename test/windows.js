/* Release-window check. No physics changes: this only reads Fangxia. */
const FX = require("../game.js");

const PHASES = [0.4, 2.1, 4.2, 6.8];
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
  return { min: 0.2, max: 0.35 };
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

function measure() {
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
    let upMin = 1e9;
    let downMin = downTo >= 0 ? 1e9 : null;
    for (const pack of MASKS) {
      cell.up[pack.name] = [];
      cell.down[pack.name] = [];
      for (const phase of PHASES) {
        if (upTo >= 0) {
          const w = longest(pack.mask, i, phase, false, upTo, 0.5, 2.15);
          cell.up[pack.name].push(w.span);
          if (w.span < upMin) upMin = w.span;
        }
        if (downTo >= 0) {
          const w = longest(pack.mask, i, phase, true, downTo, 1.28, 3.4);
          cell.down[pack.name].push(w.span);
          if (w.span < downMin) downMin = w.span;
        }
      }
    }
    cell.upMin = upTo >= 0 ? upMin : null;
    cell.downMin = downMin;
    cell.upOk = upTo < 0 || (upMin + 1e-6 >= band.min && upMin - 1e-6 <= band.max);
    cell.downOk = downTo < 0 || downMin + 1e-6 >= 0.18;
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
  const head = "i  y     kind    grade  need  upE   upF   upMin downE downF downMin";
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
module.exports = { measure, grade, targetFor, limitsFor, caught, lowerIndex, PHASES, DT };
