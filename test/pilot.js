/* Deterministic single-gesture input pilot. Planning inspects copies; execution
 * holds then releases once. Normal movement never gets an oracle-timed second
 * press. This proves route reachability, not human skill or completion time. */
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
    c.catchPose = s.catchPose ? Object.assign({}, s.catchPose) : null;
    c.dots = []; c.sfx = [];
    for (const k of ["restSeen", "restVisited"]) if (Array.isArray(s[k])) c[k] = s[k].slice();
    return c;
  }
  function tick(s, input) { return FX.step(s, DT, Object.assign({ holding: false, freezeIntro: true }, input)); }
  function fresh(mask, i, time) {
    const s = FX.createState(), h = FX.HOLDS[i || 0];
    Object.assign(s, { mask, intro: 0, holdIndex: h.i, origin: h.i,
      time: time || 0, y: h.y - FX.L, z: h.z, settle: 1, crown: h.k === "summit" });
    return s;
  }
  function finishFlight(s, origin, limit, onTick, grabAt = Infinity) {
    let frames = 0;
    const max = Math.ceil((limit || 30) / DT);
    while (!s.attached && s.mode === "play" && frames++ < max) {
      tick(s, { holding: s.flightT + 1e-7 >= grabAt });
      if (onTick) onTick(s);
    }
    return { state: s, frames, landed: s.attached && s.mode !== "impact", delta: s.holdIndex - origin };
  }
  function desired(s, origin, direction) {
    return s.attached && s.holdIndex === origin + direction && s.mode !== "impact";
  }
  function trial(snapshot, direction) {
    const flight = copy(snapshot), origin = flight.holdIndex, launches = flight.launches;
    tick(flight, { holding: false });
    if (flight.launches === launches || flight.attached) return null;
    if (direction > 0) {
      const next = FX.HOLDS[origin + 1], hip = FX.bodyFrame(flight).hip;
      // A generous shoulder/arm upper bound: air motion only translates the
      // launch hip, gravity/drag cannot add upward energy, and rotation cannot
      // lift a shoulder more than the .53m torso length. This is not s.y, the
      // legacy motion marker that previously caused false reachability cuts.
      const upperReach = hip.y + .53 + .70 + .05 + Math.max(0, flight.vy) ** 2 / (2 * FX.G * FX.params(flight.mask).grav);
      if (next && upperReach < next.y) return null;
    }
    const initialTime = flight.time;
    finishFlight(flight, origin, 3.5);
    if (!desired(flight, origin, direction)) return null;
    return { grabAt: Infinity, contactAt: flight.time-initialTime,
      geometryAt: flight.time-initialTime, delta: direction };
  }

  function trialAt(state, release, direction) {
    const held = copy(state);
    let guard = 0;
    while (held.attached && held.mode === "play" && held.holdT + 1e-7 < release && guard++ < 720) tick(held, { holding: true });
    return trial(held, direction || (held.descending ? -1 : 1));
  }
  function plan(state, direction) {
    direction = direction || (state.descending ? -1 : 1);
    if ((direction < 0) !== !!state.descending) return null;
    const s = copy(state), low = direction < 0 ? .25 : .17, high = direction < 0 ? 2.4 : 2.2;
    const samples = []; let guard = 0, open = null;
    while (s.holdT <= high && guard++ < 720 && s.attached && s.mode === "play") {
      tick(s, { holding: true });
      if (s.holdT >= low && guard % 3 === 0) {
        const route = trial(s, direction), sample = { t: s.holdT, good: !!route, route };
        samples.push(sample);
        if (sample.good) {
          if (!open) open = { a: sample.t, b: sample.t }; else open.b = sample.t;
        } else if (open) {
          if (open.b - open.a >= .05 - 1e-7) break;
          open = null;
        }
      }
    }
    let best = null, current = null;
    for (const sample of samples) {
      if (sample.good) {
        if (!current) current = { a: sample.t, b: sample.t }; else current.b = sample.t;
      } else if (current) {
        if (!best || current.b - current.a > best.b - best.a) best = current;
        current = null;
      }
    }
    if (current && (!best || current.b - current.a > best.b - best.a)) best = current;
    if (!best) return null;
    const middle = (best.a + best.b) / 2;
    const chosen = samples.filter(x => x.good && x.t >= best.a && x.t <= best.b)
      .reduce((a, b) => Math.abs(a.t - middle) <= Math.abs(b.t - middle) ? a : b);
    return Object.assign({ a: best.a, b: best.b, span: best.b - best.a, release: chosen.t, direction }, chosen.route);
  }
  function planWithWait(state, direction, minimum = 0, maxSeconds = 12) {
    let planNow = plan(state, direction), waited = 0;
    while ((!planNow || planNow.span + 1e-7 < minimum) && waited + 1.5 <= maxSeconds) {
      for (let frame = 0; frame < Math.round(1.5 / DT); frame++) tick(state, { holding: false });
      waited += 1.5;
      if (!state.attached || state.mode !== "play") return null;
      planNow = plan(state, direction);
    }
    return planNow && planNow.span + 1e-7 >= minimum ? Object.assign({}, planNow, { waitSeconds: waited }) : null;
  }
  function execute(s, schedule, onTick, options) {
    options = options || {};
    // A numeric fixed release is useful for non-oracle usability regressions.
    // Only explicit recovery tests may supply a finite airborne press time.
    if (typeof schedule === "number") schedule = { release: schedule, grabAt: Infinity };
    const origin = s.holdIndex, launches = s.launches;
    let guard = 0;
    while (s.attached && s.mode === "play" && s.holdT + 1e-7 < schedule.release && guard++ < 720) {
      tick(s, { holding: true }); if (onTick) onTick(s);
    }
    tick(s, { holding: false }); if (onTick) onTick(s);
    if (s.launches === launches) return { launched: false, delta: 0 };
    const grabAt = options.reach === false ? Infinity : options.grabAt == null ? schedule.grabAt : options.grabAt;
    const result = finishFlight(s, origin, 30, onTick, grabAt);
    return { launched: true, delta: result.delta, landed: result.landed };
  }
  function ready(s) {
    let n = 0;
    do { tick(s, { holding: false }); }
    while (s.mode === "play" && s.attached && (s.lock > 0 || s.needUp || s.settle <= .9) && n++ < 240);
  }
  function direction(s, value) {
    tick(s, { direction: value < 0 || value === "down" ? "down" : "up" });
    ready(s);
  }
  function door(s) {
    ready(s); for (let i = 0; i < 18; i++) tick(s, { holding: true }); tick(s, { holding: false });
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function normal(random) { return Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random()); }
  function climb(options) {
    options = options || {};
    const s = options.state || fresh(options.mask == null ? 15 : options.mask);
    const targetMask = options.targetMask == null ? s.mask : options.targetMask, random = rng(options.seed || 1);
    let moves = 0, setbacks = 0, noPlan = 0, worstLoss = 0, gustWaitSeconds = 0;
    const limit = options.seconds || 3600, start = s.time;
    while (s.mode !== "ending" && s.time - start < limit && moves < 10000) {
      if (s.mode === "ledge") {
        tick(s, { holding: false });
        const kind = FX.HOLDS[s.holdIndex].k, spec = FX.ITEMS[kind];
        tick(s, spec && (s.mask & spec.bit) && !(targetMask & spec.bit) ? { dropKind: kind } : { keep: true });
        continue;
      }
      if (s.mode === "drop" || s.mode === "impact" || !s.attached) { tick(s, { holding: false }); continue; }
      ready(s);
      if (s.descending) direction(s, 1);
      if (s.crown) { door(s); continue; }
      const p = planWithWait(s, 1);
      if (!p) { noPlan++; break; }
      gustWaitSeconds += p.waitSeconds;
      let timing = 0;
      if (options.error) {
        timing = normal(random) * .08;
        if (random() < .1) timing += (random() < .5 ? -1 : 1) * (.2 + random() * .2);
      }
      const old = s.holdIndex;
      const result = execute(s, Object.assign({}, p, { release: Math.max(.18, p.release + timing), grabAt: Infinity }));
      moves++;
      if (!result.launched || result.delta <= 0 || s.mode === "impact") setbacks++;
      worstLoss = Math.max(worstLoss, old - s.holdIndex);
      if (options.onMove) options.onMove(s, { moves, result, plan: p, timing });
    }
    return { ok: s.mode === "ending", mask: s.mask, seconds: s.time - start, moves, falls: s.falls, setbacks, worstLoss, noPlan, gustWaitSeconds, state: s };
  }
  return { DT, copy, tick, fresh, finishFlight, trial, trialAt, plan, planWithWait, execute, ready, direction, door, climb, rng, normal };
});
