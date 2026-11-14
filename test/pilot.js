/* Deterministic input-only test pilot. Planning inspects cloned states; execution
 * always goes through the same 120 Hz step() used by the browser. This oracle
 * is a reachability tool, not a model of learning, attention or human skill. */
(function (root, factory) {
  const api = factory(typeof module !== "undefined" && module.exports ? require("../game.js") : root.Fangxia);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DropPilot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (FX) {
  "use strict";
  const DT = 1 / 120;
  function copy(s) {
    const c = Object.assign({}, s);
    c.lost = (s.lost || []).map(x => Object.assign({}, x));
    c.launchBody = s.launchBody ? Object.assign({}, s.launchBody) : null;
    c.dots = [];
    c.sfx = [];
    for (const k of ["restSeen", "restVisited"]) if (Array.isArray(s[k])) c[k] = s[k].slice();
    return c;
  }
  function tick(s, input) { return FX.step(s, DT, Object.assign({ holding: false, freezeIntro: true }, input)); }
  function fresh(mask, i, time) {
    const s = FX.createState(), h = FX.HOLDS[i || 0];
    s.mask = mask;
    s.intro = 0;
    s.holdIndex = h.i;
    s.origin = h.i;
    s.time = time || 0;
    s.y = h.y - FX.L;
    s.z = h.z;
    s.settle = 1;
    s.crown = h.k === "summit";
    return s;
  }
  function finishFlight(s, origin, limit, onTick) {
    let frames = 0;
    const max = Math.ceil((limit || 30) / DT);
    while (!s.attached && s.mode === "play" && frames++ < max) {
      tick(s, { holding: s.vy < 0 });
      if (onTick) onTick(s);
    }
    return { state: s, frames: frames, landed: s.attached && s.mode !== "impact", delta: s.holdIndex - origin };
  }
  function trial(snapshot, direction) {
    const s = copy(snapshot), origin = s.holdIndex, launches = s.launches;
    tick(s, { holding: false });
    if (s.launches === launches || s.attached) return false;
    if (direction > 0) {
      const next = FX.HOLDS[origin + 1];
      const apex = s.y + Math.max(0, s.vy) ** 2 / (2 * FX.G * FX.params(s.mask).grav);
      // Gravity is the only vertical acceleration; wall contacts change z.
      // Even the widest held catch cannot reach above this generous bound.
      if (next && apex < next.y - FX.catchRadius(next, true, false)) return false;
    }
    const ceiling = 3.5;
    let frames = 0;
    while (!s.attached && s.mode === "play" && frames++ < ceiling / DT) {
      tick(s, { holding: s.vy < 0 });
      if (direction > 0 && s.y < FX.HOLDS[origin].y - 2 && s.vy < 0) return false;
    }
    return s.attached && (direction > 0 ? s.holdIndex > origin : s.holdIndex === origin - 1);
  }
  function plan(state, direction) {
    direction = direction || (state.descending ? -1 : 1);
    // A plan may inspect a direction, but must never silently switch the live
    // control mode. Selection/pickup owns that transition in production.
    if ((direction < 0) !== !!state.descending) return null;
    const s = copy(state), startTime = s.time;
    const low = direction < 0 ? 0.25 : 0.17;
    const high = direction < 0 ? 2.4 : 2.2;
    let samples = [], guard = 0, open = null;
    while (s.holdT <= high && guard++ < 720 && s.attached && s.mode === "play") {
      tick(s, { holding: true });
      if (s.holdT >= low && guard % 3 === 0) {
        const x = { t: s.holdT, elapsed: s.time - startTime, good: trial(s, direction) };
        samples.push(x);
        if (x.good) {
          if (!open) open = { a: x.t, b: x.t };
          else open.b = x.t;
        } else if (open) {
          // Prefer the first usable effort. Later cycles are a fallback when
          // the first opening is narrower than six physics frames.
          if (open.b - open.a >= .05 - 1e-7) break;
          open = null;
        }
      }
    }
    let best = null, current = null;
    for (const x of samples) {
      if (x.good) {
        if (!current) current = { a: x.t, b: x.t, startElapsed: x.elapsed };
        else current.b = x.t;
      } else if (current) {
        if (!best || current.b - current.a > best.b - best.a) best = current;
        current = null;
      }
    }
    if (current && (!best || current.b - current.a > best.b - best.a)) best = current;
    if (!best) return null;
    // A collision can split a release window between two 25ms samples. Use
    // an actual successful input trace near the center, not an untested mean.
    const middle = (best.a + best.b) / 2;
    const chosen = samples.filter(x => x.good && x.t >= best.a && x.t <= best.b)
      .reduce((a, b) => Math.abs(a.t - middle) <= Math.abs(b.t - middle) ? a : b);
    return { a: best.a, b: best.b, span: best.b - best.a, release: chosen.t, direction: direction };
  }
  function execute(s, release, onTick) {
    const origin = s.holdIndex, launches = s.launches;
    let guard = 0;
    while (s.attached && s.mode === "play" && s.holdT + 1e-7 < release && guard++ < 600) {
      tick(s, { holding: true });
      if (onTick) onTick(s);
    }
    tick(s, { holding: false });
    if (onTick) onTick(s);
    if (s.launches === launches) return { launched: false, delta: 0 };
    const result = finishFlight(s, origin, 30, onTick);
    return { launched: true, delta: result.delta, landed: result.landed };
  }
  function ready(s) {
    let n = 0;
    // Release after a catch, clear UI input locks, settle before a new charge.
    do { tick(s, { holding: false }); }
    while (s.mode === "play" && s.attached && (s.lock > 0 || s.needUp || s.settle <= 0.9) && n++ < 240);
  }
  function door(s) {
    ready(s);
    for (let i = 0; i < 18; i++) tick(s, { holding: true });
    tick(s, { holding: false });
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function normal(random) {
    return Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random());
  }
  function climb(options) {
    options = options || {};
    const s = options.state || fresh(options.mask == null ? 15 : options.mask);
    const targetMask = options.targetMask == null ? s.mask : options.targetMask;
    const random = rng(options.seed || 1);
    let moves = 0, setbacks = 0, noPlan = 0, worstLoss = 0;
    const limit = options.seconds || 3600;
    const start = s.time;
    while (s.mode !== "ending" && s.time - start < limit && moves < 10000) {
      if (s.mode === "ledge") {
        tick(s, { holding: false });
        const kind = FX.HOLDS[s.holdIndex].k;
        const spec = FX.ITEMS[kind];
        tick(s, spec && (s.mask & spec.bit) && !(targetMask & spec.bit) ? { dropKind: kind } : { keep: true });
        continue;
      }
      if (s.mode === "drop" || s.mode === "impact" || !s.attached) { tick(s, { holding: !s.attached && s.vy < 0 }); continue; }
      ready(s);
      if (s.crown) { door(s); continue; }
      const p = plan(s, 1);
      if (!p) { noPlan++; break; }
      let timing = 0;
      if (options.error) {
        timing = normal(random) * 0.08;
        if (random() < 0.1) timing += (random() < 0.5 ? -1 : 1) * (0.2 + random() * 0.2);
      }
      const old = s.holdIndex;
      const result = execute(s, Math.max(0.18, p.release + timing));
      moves++;
      if (!result.launched || result.delta <= 0 || s.mode === "impact") setbacks++;
      worstLoss = Math.max(worstLoss, old - s.holdIndex);
      if (options.onMove) options.onMove(s, { moves, result, plan: p, timing });
    }
    return { ok: s.mode === "ending", mask: s.mask, seconds: s.time - start, moves, falls: s.falls, setbacks, worstLoss, noPlan, state: s };
  }
  return { DT, copy, tick, fresh, finishFlight, plan, execute, ready, door, climb, rng, normal };
});
