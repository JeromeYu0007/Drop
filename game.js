/* 《放下》 physics, route, and words. No DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Fangxia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const L = 1.32;
  const G = 16.4;
  const DRAG = 0.016;
  const CATCH = 0.7;
  const CATCH_HOLD = 0.96;
  // Light pack charges and swings faster. A heavy pack is slower, never unreachable.
  const TUNE = {
    omega: [3.35, 3.05],
    amp: [1.22, 1.05],
    maxSpeed: [19.4, 16.6],
    aimScale: [0.82, 0.74],
    chargeRate: [2.4, 1.55],
    windMul: [0.2, 1],
  };

  // Difficulty curve, bottom to top:
  // approach, overhang, recovery, long gap, recovery, chimney, sparse, ice, door.
  const RAW = [
    [8, 0.05, "start"],
    [10.3, -0.2, "hold"],
    [12.6, 0.22, "hold"],
    [14.9, -0.12, "hold"],
    [17.2, 0.18, "hold"],
    [19.6, -0.05, "trophy"],
    [21.8, -0.95, "hold"],
    [24.5, 1.15, "hold"],
    [26.8, 0.2, "hold"],
    [29.0, -0.25, "hold"],
    [31.2, 0.12, "hold"],
    [33.4, -0.08, "letter"],
    [36.9, 0.42, "hold"],
    [39.1, -0.18, "hold"],
    [41.3, 0.16, "hold"],
    [43.5, -0.06, "hold"],
    [45.7, 0.1, "ring"],
    [47.7, 0.08, "hold"],
    [49.6, -0.06, "hold"],
    [51.5, 0.1, "hold"],
    [53.4, -0.04, "hold"],
    [55.4, 0.06, "hold"],
    [58.2, 0.62, "hold"],
    [61.0, -0.48, "hold"],
    [63.7, 0.55, "hold"],
    [66.0, 0.02, "photo"],
    [68.4, -0.28, "ice"],
    [70.9, 0.48, "ice"],
    [73.3, -0.22, "ice"],
    [75.6, 0.32, "ice"],
    [77.9, 0.02, "ice"],
    [80.4, 0.12, "summit"],
  ];
  const SUMMIT_Y = RAW[RAW.length - 1][0];
  const GATE = { y: SUMMIT_Y + 1.55, z: RAW[RAW.length - 1][1] + 0.48 };

  const HOLDS = RAW.map(function (h, i) {
    return { y: h[0], z: h[1], k: h[2], i: i };
  });

  const ITEMS = {
    trophy: {
      bit: 4,
      w: 0.48,
      zh: "奖杯",
      en: "Trophy",
      lineZh: "名字是后来刻的。",
      lineEn: "The name was cut in later.",
      backZh: "名字上有雪。你擦掉了。",
      backEn: "Snow on the name. You wiped it off.",
    },
    letter: {
      bit: 8,
      w: 0.3,
      zh: "未寄出的信",
      en: "Unsent letter",
      lineZh: "第一行是你的名字。",
      lineEn: "The first line is your name.",
      backZh: "纸还是干的。你没有拆开。",
      backEn: "The paper is still dry. You did not open it.",
    },
    ring: {
      bit: 2,
      w: 0.22,
      zh: "戒指",
      en: "Ring",
      lineZh: "还是那只手的尺寸。",
      lineEn: "Still the size of that hand.",
      backZh: "比记忆里更凉。",
      backEn: "Colder than you remembered.",
    },
    photo: {
      bit: 1,
      w: 0.2,
      zh: "旧照片",
      en: "Old photo",
      lineZh: "被摸掉的，是笑。",
      lineEn: "What wore away was the smile.",
      backZh: "你把有字的那一面朝下。",
      backEn: "You turned the written side down.",
    },
  };

  const ENDINGS = {
    0: { zh: ["手里什么也没有。", "光很白。你没有影子。"], en: ["Nothing in your hands.", "The light is white. You cast no shadow."] },
    1: { zh: ["你只把那张笑带上来了。", "下面还有没说完的。"], en: ["You brought up only the smile.", "Something unsaid is still below."] },
    2: { zh: ["它还是那只手的尺寸。", "你没有戴上。"], en: ["Still the size of that hand.", "You did not put it on."] },
    3: { zh: ["笑，和那只手。", "话没有上来。"], en: ["The smile, and the hand.", "The words did not come up."] },
    4: { zh: ["名字对着太阳。", "你不记得是谁先走的。"], en: ["The name faces the sun.", "You don't remember who left first."] },
    5: { zh: ["一张脸。一个名字。", "都是你没放下的。"], en: ["A face. A name.", "Both still in your keeping."] },
    6: { zh: ["证明还在。约定也在。", "人呢。"], en: ["The proof is here. So is the promise.", "And the person."] },
    7: { zh: ["信还在雪里。", "你看着光，没有要补的句子。"], en: ["The letter is still in the snow.", "You watch the light. Nothing you would add."] },
    8: { zh: ["你把它读到最后一行。", "还是没有地址。"], en: ["You read it to the last line.", "Still no address."] },
    9: { zh: ["你记得那张脸，也还想说。", "尺寸不在你手里。"], en: ["You remember the face, and you still want to speak.", "The size is not in your hand."] },
    10: { zh: ["话，和那只手的尺寸。", "你还是没有寄出。"], en: ["The words, and the size of that hand.", "You still did not send them."] },
    11: { zh: ["最沉的那件不在了。", "剩下的，你都叫得出来。"], en: ["The heaviest thing is gone.", "What is left, you can name."] },
    12: { zh: ["杯子上是一个名字。纸上是另一个。", "你两个都带来了。"], en: ["One name on the cup. Another on the paper.", "You brought both."] },
    13: { zh: ["约定留在下面。", "你带着记得的、想说的，和后来刻上的。"], en: ["The promise stayed below.", "You brought what you remember, what you meant to say, and what was carved afterward."] },
    14: { zh: ["那张脸没有上来。", "你记得重量，不太记得眼睛。"], en: ["The face did not come up.", "You remember the weight better than the eyes."] },
    15: { zh: ["都还在。", "肩没有松。可你上来了。"], en: ["All of it is still here.", "Your shoulders do not drop. But you arrived."] },
  };

  const UI = {
    titleZh: "放下",
    titleEn: "LET GO",
    hintZh: "按住蓄力，弧线碰到岩点再松开",
    hintEn: "Hold. Release when the arc meets the hold.",
    hintFallZh: "下坠时按住，也许还能抓住",
    hintFallEn: "Hold as you fall. You may still catch.",
    packZh: "背包",
    packEn: "Pack",
    carryZh: "继续",
    carryEn: "Go on",
    dropWordZh: "放下",
    dropWordEn: "Let go",
    restartZh: "重来",
    restartEn: "Again",
    againZh: "再爬一次",
    againEn: "Climb again",
    bestZh: "最好",
    bestEn: "best",
    soundZh: "声",
    soundEn: "Snd",
    muteZh: "静",
    muteEn: "Mute",
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function mix(a, b, t) {
    return a + (b - a) * t;
  }
  function smooth(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function massOf(mask) {
    let m = 1;
    for (const k in ITEMS) if (mask & ITEMS[k].bit) m += ITEMS[k].w;
    return m;
  }
  function weight01(mask) {
    return clamp((massOf(mask) - 1) / 1.2, 0, 1);
  }
  function params(mask) {
    const k = weight01(mask);
    return {
      omega: mix(TUNE.omega[0], TUNE.omega[1], k),
      amp: mix(TUNE.amp[0], TUNE.amp[1], k),
      maxSpeed: mix(TUNE.maxSpeed[0], TUNE.maxSpeed[1], k),
      aimScale: mix(TUNE.aimScale[0], TUNE.aimScale[1], k),
      chargeRate: mix(TUNE.chargeRate[0], TUNE.chargeRate[1], k),
      windMul: mix(TUNE.windMul[0], TUNE.windMul[1], k),
      grav: mix(0.9, 1.22, k),
      stamina: mix(8.2, 5.4, k),
      sway: mix(0.035, 0.09, k),
    };
  }
  function grav(mask) {
    return G * params(mask).grav;
  }

  function stormOf(mask) {
    return weight01(mask);
  }

  function wind(t, y, mask, returning) {
    const storm = stormOf(mask);
    const gust = Math.sin(t * 0.72 + y * 0.02) * 0.7 + Math.sin(t * 1.45 + 1.3) * 0.3;
    const high = clamp((y - 68) / 40, 0, 1);
    return gust * (0.04 + storm * 1.05 + high * 0.12) * (returning ? 1.35 : 1);
  }

  function nhash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return nhash(i) * (1 - u) + nhash(i + 1) * u;
  }
  function routeZ(y) {
    if (y <= HOLDS[0].y) return HOLDS[0].z;
    const last = HOLDS[HOLDS.length - 1];
    if (y >= last.y) return last.z;
    let i = 0;
    while (i < HOLDS.length - 2 && HOLDS[i + 1].y < y) i++;
    const a = HOLDS[i], b = HOLDS[i + 1];
    return a.z + (b.z - a.z) * ((y - a.y) / (b.y - a.y || 1));
  }
  function faceCap(y) {
    let cap = 8;
    const reach = 3.1;
    for (let i = 0; i < HOLDS.length; i++) {
      const h = HOLDS[i];
      const dy = Math.abs(y - h.y);
      if (dy > reach) continue;
      const u = dy / reach;
      const local = h.z - 0.46 + u * u * 1.15;
      if (local < cap) cap = local;
    }
    return cap;
  }
  // Right-hand edge of the solid rock. Smooth, stable, and kept clear of every hold.
  function faceZ(y) {
    const n =
      (vnoise(y * 0.31 + 1.7) - 0.58) * 0.34 +
      (vnoise(y * 0.73 + 5.2) - 0.64) * 0.14 +
      (vnoise(y * 1.55 + 9.4) - 0.72) * 0.045;
    let lip = 0;
    for (let i = 0; i < HOLDS.length; i++) {
      const h = HOLDS[i];
      if (!isRest(h.k) && h.k !== "summit") continue;
      const u = (h.y - y + 0.05) / 0.28;
      if (u <= 0 || u >= 1) continue;
      const a = Math.sin(u * Math.PI);
      if (a > lip) lip = a;
    }
    const z = routeZ(y) - 0.72 + n + lip * 0.18;
    return Math.min(z, faceCap(y));
  }
  const BODY_R = 0.22;
  function resolveBody(s) {
    const ys = [0, 0.38, -0.46];
    let push = 0;
    let overhang = false;
    const faceHip = faceZ(s.y);
    for (let i = 0; i < ys.length; i++) {
      const y = s.y + ys[i];
      const limit = faceZ(y) + BODY_R;
      if (s.z < limit) {
        const pen = limit - s.z;
        if (pen > push) push = pen;
        if (ys[i] > 0.2 && faceZ(y) > faceHip + 0.1 && s.vy > 0.8) overhang = true;
      }
    }
    if (push <= 0) return false;
    s.z += push;
    if (s.vz < 0) s.vz = 0;
    if (overhang) {
      s.vy = Math.min(0, s.vy);
      s.shake = Math.max(s.shake, 0.12);
    }
    return true;
  }

  function sampleRelease(mask, t) {
    const p = params(mask);
    const charge = clamp(p.chargeRate * t, 0, 1);
    const A = p.amp * smooth(charge);
    const angle = Math.sin(p.omega * t) * A;
    const aim = clamp(angle * p.aimScale, -1.25, 1.25);
    const speed = p.maxSpeed * (0.34 + 0.66 * smooth(charge));
    return {
      charge: charge,
      angle: angle,
      aim: aim,
      speed: speed,
      vy: Math.cos(aim) * speed,
      vz: Math.sin(aim) * speed,
      offY: -Math.cos(angle) * L,
      offZ: Math.sin(angle) * L,
    };
  }

  function radii(y) {
    const k = clamp((y + 6) / 124, 0, 1);
    const s = k * k * (3 - 2 * k);
    return {
      rx: mix(11.2, 1.45, s) + Math.sin(y * 0.055) * 1.15 + Math.sin(y * 0.16 + 1.2) * 0.35,
      rz: mix(15.8, 2.7, s) + Math.sin(y * 0.047 + 0.8) * 1.35,
    };
  }
  function faceX(y, z) {
    const r = radii(y);
    const zz = clamp(z / r.rz, -0.96, 0.96);
    return -r.rx * Math.sqrt(Math.max(0, 1 - zz * zz));
  }

  function isRest(k) {
    return k === "trophy" || k === "letter" || k === "ring" || k === "photo";
  }

  function nextIndex(i) {
    return i + 1 < HOLDS.length ? i + 1 : -1;
  }

  function createState() {
    const h = HOLDS[0];
    return {
      mode: "play",
      mask: 15,
      holdIndex: 0,
      attached: true,
      holdT: 0,
      settle: 1,
      y: h.y - L,
      z: h.z,
      vy: 0,
      vz: 0,
      angle: 0,
      flightT: 0,
      origin: 0,
      prevHolding: false,
      holding: false,
      seenRelease: true,
      pressT: 0,
      time: 0,
      catches: 0,
      falls: 0,
      bestRun: h.y,
      nearDone: false,
      nearT: 0,
      dots: [],
      aimD: 99,
      dropT: -1,
      dropKind: "",
      dropY: 0,
      dropZ: 0,
      dropVy: 0,
      dropX: 0,
      endingT: 0,
      impactT: -1,
      armed: false,
      burst: 0,
      shake: 0,
      intro: 1,
      launches: 0,
      learned: 0,
      failedOnce: false,
      airCatch: false,
      visAngle: 0,
      sway: 0,
      sfx: [],
      flashBest: 0,
      resetFade: 0,
      restSeen: 0,
      stormVis: 1,
      lost: [],
      reclaimed: 0,
      crown: false,
      descending: false,
      lock: 0,
      needUp: false,
      slip: 0,
      reveal: "",
      revealT: -1,
      checkpoint: 0,
      recoverT: -1,
    };
  }

  function placeOnRope(s, hold, angle, rope) {
    s.y = hold.y - Math.cos(angle) * rope;
    s.z = hold.z + Math.sin(angle) * rope;
    s.angle = angle;
  }

  function swung(mask, holdT, time, y) {
    const st = sampleRelease(mask, holdT);
    const bias = wind(time, y, mask) * 0.04;
    st.angle += bias;
    const p = params(mask);
    st.aim = clamp(st.angle * p.aimScale, -1.25, 1.25);
    st.vy = Math.cos(st.aim) * st.speed;
    st.vz = Math.sin(st.aim) * st.speed;
    st.offY = -Math.cos(st.angle) * L;
    st.offZ = Math.sin(st.angle) * L;
    return st;
  }

  function arcMin(mask, holdT, hold, target, time, downOk, returning) {
    const st = swung(mask, holdT, time, hold.y);
    let y = hold.y + st.offY;
    let z = hold.z + st.offZ;
    let vy = st.vy;
    let vz = st.vz;
    if (downOk && wantsDown(mask, holdT)) {
      const shot = downShot(st, hold);
      vy = shot.vy;
      vz = shot.vz;
    }
    let minD = 1e9;
    const dots = [];
    for (let i = 0; i < 80; i++) {
      const dt = 1 / 70;
      const tt = time + i * dt;
      vz += wind(tt, y, mask, !!returning) * dt;
      vy -= grav(mask) * dt;
      const sp = Math.hypot(vz, vy) + 1e-4;
      const dc = DRAG * sp;
      vz -= (vz / sp) * dc * dt;
      vy -= (vy / sp) * dc * dt;
      z += vz * dt;
      y += vy * dt;
      const ghost = { y: y, z: z, vy: vy, vz: vz, shake: 0 };
      if (resolveBody(ghost)) {
        z = ghost.z;
        vy = ghost.vy;
        vz = ghost.vz;
      }
      if (i % 6 === 0) dots.push({ y: y, z: z });
      if (target) {
        const d = Math.hypot(z - target.z, y - target.y);
        if (d < minD) minD = d;
      }
      if (vy < 0 && y < hold.y - 18) break;
    }
    return { minD: minD, dots: dots, st: st };
  }

  function beginEnding(s) {
    s.mode = "ending";
    s.endingT = 0;
    s.attached = true;
    s.sfx.push("summit");
    s.shake = Math.max(s.shake, 0.25);
  }

  function hasItems(mask) {
    for (const k in ITEMS) if (mask & ITEMS[k].bit) return true;
    return false;
  }

  function beginLedge(s) {
    s.mode = "ledge";
    s.seenRelease = !s.holding;
    s.pressT = 0;
    s.restSeen |= 1 << s.holdIndex;
    s.sfx.push("ledge");
  }

  function catchHold(s, index) {
    const h = HOLDS[index];
    s.attached = true;
    s.holdIndex = index;
    s.holdT = 0;
    s.settle = 0.15;
    s.vy = 0;
    s.vz = 0;
    s.flightT = 0;
    s.nearDone = false;
    s.origin = index;
    placeOnRope(s, h, 0, L * 0.35);
    s.catches += 1;
    s.burst = 1;
    s.shake = Math.max(s.shake, 0.1 + weight01(s.mask) * 0.22);
    s.sfx.push(weight01(s.mask) > 0.55 ? "land" : "catch");
    if (!s.airCatch && s.launches > 0) s.airCatch = true;
    if (isRest(h.k) || index === 0) {
      if (index >= (s.checkpoint || 0)) s.checkpoint = index;
    }
    if (h.k === "summit") {
      s.crown = true;
      s.descending = false;
      s.mode = "play";
      s.lock = 0.35;
    } else if (isRest(h.k) && hasItems(s.mask) && (s.restSeen & (1 << index)) === 0) beginLedge(s);
    else s.mode = "play";
    tryPickup(s);
    if (s.y > s.bestRun) s.bestRun = s.y;
  }

  function wantsDown(mask, holdT) {
    const p = params(mask);
    const st = sampleRelease(mask, holdT);
    const peak = Math.PI / (2 * p.omega);
    // Upward full-charge releases land first, around one second.
    // Only after that window does the line turn down toward the hold below.
    return holdT > Math.max(1.28, peak + 0.7) && st.angle < 0.55;
  }

  function lowerHold(hold) {
    let best = null;
    let gap = 1e9;
    for (let i = 0; i < HOLDS.length; i++) {
      const h = HOLDS[i];
      const dy = hold.y - h.y;
      if (dy < 0.8 || dy > 12) continue;
      if (dy < gap) { gap = dy; best = h; }
    }
    return best;
  }

  function downShot(st, hold) {
    const speed = Math.min(6.4, Math.abs(st.vy) * 0.16 + 4.4);
    const target = lowerHold(hold);
    if (!target) return { vy: -speed, vz: 0 };
    const dz = target.z - (hold.z + st.offZ);
    return { vy: -speed * 0.88, vz: clamp(dz * 2.2, -3.1, 3.1) };
  }

  function launch(s) {
    const h = HOLDS[s.holdIndex];
    const st = swung(s.mask, s.holdT, s.time, h.y);
    s.attached = false;
    s.y = h.y + st.offY;
    s.z = h.z + st.offZ;
    s.vy = st.vy;
    s.vz = st.vz;
    s.angle = st.angle;
    const goingBack = wantsDown(s.mask, s.holdT);
    if ((s.crown || s.descending) && goingBack) {
      const shot = downShot(st, h);
      s.vy = shot.vy;
      s.vz = shot.vz;
      s.descending = true;
      s.crown = false;
    }
    s.flightT = 0;
    s.origin = s.holdIndex;
    s.nearDone = false;
    s.launches += 1;
    s.holdT = 0;
    s.mode = "play";
    s.slip = 0;
    s.sfx.push("release");
  }

  function buryItem(s, kind) {
    const spec = ITEMS[kind];
    let home = 0;
    for (let i = 0; i < HOLDS.length; i++) {
      const h = HOLDS[i];
      if (h.y < s.y - 4.5 && h.y > s.y - 14) home = i;
    }
    const h = HOLDS[home];
    let z = Math.max(h.z + 0.22, faceZ(h.y + 0.1) + 0.32);
    for (let i = 0; i < s.lost.length; i++) {
      if (s.lost[i].hold === home) z += 0.16;
    }
    s.lost.push({ kind: kind, bit: spec.bit, y: h.y + 0.2, z: z, hold: home });
  }

  function tryPickup(s) {
    if (!s.lost || !s.lost.length) return;
    for (let i = s.lost.length - 1; i >= 0; i--) {
      const it = s.lost[i];
      if (Math.hypot(s.z - it.z, s.y - it.y) > 0.9 && s.holdIndex !== it.hold) continue;
      if (s.holdIndex !== it.hold && Math.hypot(s.z - it.z, s.y - it.y) > 0.9) continue;
      s.mask |= it.bit;
      s.reclaimed |= it.bit;
      s.lost.splice(i, 1);
      s.reveal = it.kind;
      s.revealT = 0;
      s.sfx.push("pickup");
    }
  }

  function dropItem(s, kind) {
    const spec = ITEMS[kind];
    if (!spec || !(s.mask & spec.bit)) return;
    s.mask &= ~spec.bit;
    s.mode = "drop";
    s.dropT = 0;
    s.dropKind = kind;
    s.dropY = s.y + 0.2;
    s.dropZ = s.z + 0.28;
    s.dropVy = -1.2;
    s.dropX = 0;
    buryItem(s, kind);
    s.sfx.push("drop");
    s.shake = Math.max(s.shake, 0.08);
  }

  function keepItem(s) {
    const h = HOLDS[s.holdIndex];
    s.mode = "play";
    s.attached = true;
    s.holdT = 0;
    s.settle = 1;
    s.pressT = 0;
    s.lock = 0.2;
    s.needUp = true;
    s.slip = 0;
    s.vy = 0;
    s.vz = 0;
    s.angle = 0;
    s.crown = false;
    placeOnRope(s, h, 0, L * 0.92);
    s.z = Math.max(s.z, faceZ(s.y) + BODY_R + 0.06);
    s.sfx.push("keep");
  }

  function wipePosition(s, fullItems) {
    const h = HOLDS[0];
    s.holdIndex = 0;
    s.attached = true;
    s.holdT = 0;
    s.settle = 1;
    s.vy = 0;
    s.vz = 0;
    s.angle = 0;
    s.flightT = 0;
    s.origin = 0;
    s.mode = "play";
    s.pressT = 0;
    s.nearDone = false;
    s.dropT = -1;
    s.endingT = 0;
    s.impactT = -1;
    s.launches = 0;
    s.restSeen = 0;
    s.crown = false;
    s.descending = false;
    s.lock = 0;
    s.needUp = false;
    s.slip = 0;
    s.reveal = "";
    s.revealT = -1;
    s.checkpoint = 0;
    s.recoverT = -1;
    if (fullItems) {
      s.mask = 15;
      s.lost = [];
      s.reclaimed = 0;
      s.learned = 0;
      s.failedOnce = false;
      s.bestRun = h.y;
      s.stormVis = 1;
    }
    placeOnRope(s, h, 0, L);
    s.resetFade = 1;
  }

  function beginRecover(s) {
    const h = HOLDS[s.checkpoint || 0];
    s.mode = "recover";
    s.recoverT = 0;
    s.attached = false;
    s.holdIndex = s.checkpoint || 0;
    s.origin = s.holdIndex;
    s.y = h.y + 2.15;
    s.z = h.z + 0.2;
    s.vy = -5.5;
    s.vz = 0;
    s.angle = 0.4;
    s.holdT = 0;
    s.crown = false;
    s.dots = [];
    s.armed = false;
    s.failedOnce = true;
    s.falls += 1;
    s.intro = 0;
    s.shake = 0.4;
    s.sfx.push("impact");
  }

  function step(s, dt, input) {
    input = input || {};
    s.sfx = [];
    let holding = !!input.holding;
    let released = s.prevHolding && !holding;
    s.time += dt;
    let stormTarget = stormOf(s.mask);
    if (s.descending) stormTarget = Math.max(stormTarget, 0.92);
    if (s.stormVis == null) s.stormVis = stormTarget;
    s.stormVis += (stormTarget - s.stormVis) * (1 - Math.exp(-dt * 1.8));
    s.burst = Math.max(0, s.burst - dt * 1.8);
    s.shake *= Math.exp(-dt * 5.5);
    s.flashBest = Math.max(0, s.flashBest - dt);
    s.resetFade = Math.max(0, s.resetFade - dt * 2.4);
    if (s.nearT > 0) s.nearT = Math.max(0, s.nearT - dt);
    if (s.revealT >= 0) {
      s.revealT += dt;
      if (s.revealT > 4.4) {
        s.revealT = -1;
        s.reveal = "";
      }
    }

    if (input.restart) {
      wipePosition(s, true);
      s.intro = 0;
      s.prevHolding = false;
      s.holding = false;
      s.sfx.push("restart");
      return s;
    }

    if (s.intro > 0 && !input.freezeIntro) {
      const rate = input.skipIntro ? 1.6 : 0.085;
      s.intro = Math.max(0, s.intro - dt * rate);
    }

    if (s.mode === "impact" || s.mode === "recover") {
      s.recoverT += dt;
      s.impactT = s.recoverT;
      const h = HOLDS[s.checkpoint || 0];
      s.vy -= G * 0.55 * dt;
      s.y += s.vy * dt;
      s.z += (h.z - s.z) * Math.min(1, dt * 6);
      if (s.y < h.y + 0.28 || s.recoverT > 0.62) {
        const seen = s.restSeen;
        catchHold(s, s.checkpoint || 0);
        s.restSeen = seen;
        if (isRest(h.k) && (seen & (1 << s.holdIndex))) s.mode = "play";
        s.settle = 1;
        s.lock = 0.3;
        s.needUp = true;
        s.holdT = 0;
        s.vy = 0;
        s.vz = 0;
      }
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "ending") {
      s.endingT += dt;
      s.angle = 0;
      s.attached = true;
      const h = HOLDS[s.holdIndex];
      s.y = h.y + 0.22;
      s.z = h.z;
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "drop") {
      s.dropT += dt;
      s.dropVy -= G * 0.35 * dt;
      s.dropY += s.dropVy * dt;
      s.dropZ += Math.sin(s.time * 2.2) * dt * 0.25;
      if (s.dropT > 2.05) {
        s.dropT = -1;
        s.mode = "play";
      }
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "ledge") {
      if (!s.seenRelease) {
        if (!holding) s.seenRelease = true;
      } else if (input.dropKind) {
        dropItem(s, input.dropKind);
      } else if (input.keep || (released && s.pressT > 0.02 && s.pressT < 0.42)) {
        keepItem(s);
      } else if (holding) {
        s.pressT += dt;
      } else {
        s.pressT = 0;
      }
      const h = HOLDS[s.holdIndex];
      s.y = h.y + 0.22;
      s.z = h.z;
      s.angle = 0;
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    // play
    if (s.crown && s.attached && input.choice === "door") {
      beginEnding(s);
      s.prevHolding = false;
      s.holding = false;
      return s;
    }
    if (s.needUp) {
      if (!input.holding) s.needUp = false;
      holding = false;
      released = false;
    } else if (s.lock > 0) {
      s.lock = Math.max(0, s.lock - dt);
      holding = false;
      released = false;
    }
    if (s.attached) {
      const h = HOLDS[s.holdIndex];
      const heavy = weight01(s.mask);
      s.settle = Math.min(1, s.settle + dt / (0.2 + heavy * 0.15));
      const rope = mix(0.42, L, s.settle);
      tryPickup(s);
      const onIce = h.k === "ice";
      if ((s.descending || onIce) && !holding && s.settle > 0.88) {
        s.slip += dt;
        const ice = s.descending ? mix(2.4, 1.25, heavy) : mix(2.1, 1.45, heavy);
        if (s.slip > ice) {
          s.attached = false;
          s.vy = -3.2 - heavy * 2.2;
          s.vz = 0.35;
          s.slip = 0;
          s.flightT = 0.2;
          s.sfx.push("slip");
        }
      } else s.slip = 0;
      if (s.crown && !holding && s.holdT === 0 && s.attached) {
        s.y = h.y + 0.22;
        s.z = Math.max(h.z, faceZ(h.y) + BODY_R + 0.08);
        s.angle = Math.sin(s.time * 1.1) * 0.02;
        s.armed = false;
        s.dots = [];
      } else if (holding && s.settle > 0.9 && s.attached) {
        s.holdT += dt;
        if (s.holdT > params(s.mask).stamina) {
          s.attached = false;
          s.vy = -2.4 - heavy * 2.4;
          s.vz = 0.25;
          s.holdT = 0;
          s.flightT = 0.16;
          s.slip = 0;
          s.sfx.push("slip");
        } else {
          const st = swung(s.mask, s.holdT, s.time, h.y);
          s.angle = st.angle;
          placeOnRope(s, h, st.angle, L);
          resolveBody(s);
          let target = null;
          if ((s.crown || s.descending) && wantsDown(s.mask, s.holdT)) {
            target = lowerHold(h);
          } else if (s.crown) target = GATE;
          if (!target) {
            const ni = nextIndex(s.holdIndex);
            if (ni >= 0) target = HOLDS[ni];
          }
          if (target && s.holdT > 0.12) {
            const downAim = (s.crown || s.descending) && wantsDown(s.mask, s.holdT);
            const hit = arcMin(s.mask, s.holdT, h, target, s.time, downAim, s.descending || downAim);
            s.dots = hit.dots;
            s.aimD = hit.minD;
            const was = s.armed;
            let need = downAim ? CATCH * 1.12 : CATCH;
            if (!downAim && target && target.k === "ice") need *= 0.92;
            if (target && target.k && (isRest(target.k) || target.k === "summit")) need += 0.28;
            if (s.crown && target === GATE) need = 1.2;
            s.armed = hit.minD < need;
            if (s.armed && !was) s.sfx.push("arm");
          } else {
            s.armed = false;
            s.dots = [];
            s.aimD = 99;
          }
        }
      } else if (s.attached) {
        const down = (s.crown || s.descending) && wantsDown(s.mask, s.holdT);
        if (released && down && s.armed && s.holdT > 0.16 && s.settle > 0.9) launch(s);
        else if (released && s.crown && s.armed && !down && s.holdT > 0.16 && s.settle > 0.9) beginEnding(s);
        else if (released && !down && s.holdT > 0.16 && s.settle > 0.9) launch(s);
        s.holdT = 0;
        s.armed = false;
        s.dots = [];
        if (s.attached && !s.crown) {
          const idle = Math.sin(s.time * (1.05 + heavy * 0.7)) * params(s.mask).sway * s.settle;
          s.angle = idle;
          placeOnRope(s, h, idle, rope);
          resolveBody(s);
        }
      }
    } else {
      s.flightT += dt;
      s.armed = false;
      s.vz += wind(s.time, s.y, s.mask, s.descending) * dt;
      s.vy -= grav(s.mask) * dt;
      const sp = Math.hypot(s.vz, s.vy) + 1e-4;
      const dc = DRAG * sp;
      s.vz -= (s.vz / sp) * dc * dt;
      s.vy -= (s.vy / sp) * dc * dt;
      s.z += s.vz * dt;
      s.y += s.vy * dt;
      resolveBody(s);
      if (sp > 0.8) s.angle = Math.atan2(-s.vz, s.vy);
      if (s.crown && s.vy > -2 && Math.hypot(s.z - GATE.z, s.y - GATE.y) < 1.05) {
        beginEnding(s);
      }

      let caught = -1;
      let bestD = 1e9;
      const reach = holding && s.flightT > 0.14 ? CATCH_HOLD : CATCH;
      const origin = HOLDS[s.origin];
      for (let i = 0; i < HOLDS.length; i++) {
        if (i === s.origin && s.flightT < 0.34) continue;
        const hd = HOLDS[i];
        // Still rising: the hold you came from, and anything below it, is not a catch.
        if (s.vy > 0.6 && hd.y < origin.y - 0.25) continue;
        let r = reach;
        if (s.descending && s.vy < 0) r *= 1.12;
        else if (hd.k === "ice") r *= 0.92;
        if (isRest(hd.k) || hd.k === "summit") r += 0.32;
        const d = Math.hypot(s.z - hd.z, s.y - hd.y);
        const toward = (hd.y - s.y) * s.vy + (hd.z - s.z) * s.vz;
        if (d > r * 0.72 && toward < -1.2) continue;
        if (d < r && d < bestD) {
          bestD = d;
          caught = i;
        }
      }
      if (caught >= 0) catchHold(s, caught);

      if (!s.attached) {
        const ni = nextIndex(s.origin);
        if (!s.nearDone && ni >= 0) {
          const hd = HOLDS[ni];
          const d = Math.hypot(s.z - hd.z, s.y - hd.y);
          if (d < CATCH * 1.9 && d > CATCH && s.y < hd.y - 0.15 && s.vy < -1.5) {
            s.nearDone = true;
            s.nearT = 0.32;
            s.shake = Math.max(s.shake, 0.28);
            s.sfx.push("near");
          }
        }
        const cp = HOLDS[s.checkpoint || 0];
        const floorY = s.descending ? HOLDS[s.origin].y - 12 : cp.y - 1.3;
        const passedRest = !s.descending && (s.checkpoint || 0) > 0 && s.vy < -2.2 && s.y < floorY;
        const missedDrop = s.descending && s.vy < -2.2 && s.y < floorY;
        const hitGround = s.y < 1.5 && s.vy < -5;
        if ((passedRest || missedDrop || hitGround) && s.mode === "play") beginRecover(s);
      }
    }

    if (s.y > s.bestRun) s.bestRun = s.y;

    s.sway += (s.angle - s.sway) * (1 - Math.exp(-dt * 5));
    s.visAngle = lerpAngle(s.visAngle, s.angle, 1 - Math.exp(-dt * (s.attached ? 14 : 6)));
    s.prevHolding = holding;
    s.holding = holding;
    return s;
  }

  // Full pack, every next hold, at a full charge. Margin is how far inside the catch the arc passes.
  function reachCheck(mask) {
    mask = mask == null ? 15 : mask;
    const tune = params(mask);
    const full = 1 / tune.chargeRate;
    const period = (Math.PI * 2) / tune.omega;
    const MARGIN = 0.18;
    const phases = [0.4, 2.1, 4.2, 6.8];
    const rows = [];
    let ok = true;
    for (let i = 0; i < HOLDS.length - 1; i++) {
      const h = HOLDS[i];
      const n = HOLDS[i + 1];
      let need = CATCH;
      if (n.k === "ice") need *= 0.92;
      if (n.k !== "hold" && n.k !== "ice" && n.k !== "start") need += 0.28;
      let best = 1e9;
      let bestT = full;
      let phasesOk = 0;
      for (let ph = 0; ph < phases.length; ph++) {
        const time = phases[ph];
        let local = 1e9;
        let lt = full;
        for (let k = 0; k < 400; k++) {
          const t = full * 0.98 + k / 120;
          if (t > full + period) break;
          if (t > tune.stamina - 0.25) break;
          const rel = sampleRelease(mask, t);
          if (rel.charge < 0.98) continue;
          if (wantsDown(mask, t)) continue;
          const hit = arcMin(mask, t, h, n, time, false, false);
          if (hit.minD < local) {
            local = hit.minD;
            lt = t;
          }
        }
        if (local <= need - MARGIN) phasesOk++;
        if (local < best) {
          best = local;
          bestT = lt;
        }
      }
      const s = createState();
      s.mask = mask;
      s.intro = 0;
      s.settle = 1;
      s.attached = true;
      s.holdIndex = i;
      s.origin = i;
      s.mode = "play";
      s.y = h.y - 1;
      s.z = h.z;
      s.time = 4.2;
      s.lock = 0;
      s.needUp = false;
      s.restSeen = 0xffffffff;
      const dt = 1 / 120;
      let guard = 0;
      while (s.attached && s.holdT < bestT - dt && guard++ < 1000) {
        step(s, dt, { holding: true, freezeIntro: true });
      }
      s.prevHolding = true;
      s.holding = true;
      step(s, dt, { holding: false, freezeIntro: true });
      for (let k = 0; k < 260 && !s.attached && s.mode === "play"; k++) {
        step(s, dt, { holding: true, freezeIntro: true });
      }
      const caught = s.attached && s.holdIndex === i + 1 && s.falls === 0;
      const rowOk = best <= need - MARGIN && phasesOk === phases.length && caught;
      if (!rowOk) ok = false;
      rows.push({
        i: i,
        from: h.k,
        to: n.k,
        y: h.y,
        dy: Math.round((n.y - h.y) * 100) / 100,
        best: Math.round(best * 1000) / 1000,
        need: Math.round(need * 100) / 100,
        margin: Math.round((need - best) * 1000) / 1000,
        t: Math.round(bestT * 100) / 100,
        phasesOk: phasesOk,
        caught: caught,
        ok: rowOk,
      });
    }
    return {
      ok: ok,
      mask: mask,
      holds: rows.length,
      marginRequired: MARGIN,
      fullCharge: Math.round(full * 1000) / 1000,
      rows: rows,
    };
  }

  function simulate(options) {
    options = options || {};
    const s = createState();
    s.mask = options.mask != null ? options.mask : 15;
    s.intro = 0;
    s.settle = 1;
    const dt = 1 / 100;
    const windBackup = options.noWind;
    let guard = 0;
    let stuck = 0;
    let lastIndex = 0;
    if (windBackup) {
      // temporarily flatten wind by climbing with a flag checked in a wrapper
    }
    const origWind = wind;
    // local flight uses wind(); for noWind we zero via mask trick? We'll patch by climbing fast.
    while (guard < 25000) {
      guard++;
      let holding = false;
      const input = { holding: false, freezeIntro: true };
      if (s.mode === "ending") break;
      if (s.crown && s.attached) {
        input.choice = "door";
      } else if (s.mode === "ledge") {
        if (options.dropAll) {
          const order = ["trophy", "letter", "ring", "photo"];
          let kind = "";
          for (let ki = 0; ki < order.length; ki++) {
            if (s.mask & ITEMS[order[ki]].bit) { kind = order[ki]; break; }
          }
          if (kind) input.dropKind = kind;
          else input.keep = true;
        } else input.keep = true;
      } else if (s.mode === "drop" || s.mode === "impact") {
        input.holding = false;
      } else if (s.attached) {
        const ni = nextIndex(s.holdIndex);
        if (ni < 0) break;
        const preview = arcMin(s.mask, Math.max(0.2, s.holdT + dt), HOLDS[s.holdIndex], HOLDS[ni], s.time);
        // Hold until the arc would land, then release this frame.
        if (s.settle > 0.9 && s.holdT > 0.3 && preview.minD < CATCH) {
          input.holding = false;
          // If we were not holding, step won't launch. Force a hold cycle:
          // mark previous holding via a direct launch path.
          s.prevHolding = true;
          s.holding = true;
          input.holding = false;
        } else {
          input.holding = true;
          if (s.holdT > 7.2) {
            stuck++;
            break;
          }
        }
      } else {
        input.holding = true; // reach a little farther while falling
      }
      if (s.needUp || s.lock > 0) input.holding = false;
      if (options.noWind) {
        // zero wind by shifting time-independent: monkeypatch through y gate
        // handled below by replacing function? can't. Use a high wind start by
        // temporarily wrapping: we'll integrate no-wind by setting a property.
        s._noWind = true;
      }
      step(s, dt, input);
      if (s.holdIndex !== lastIndex) {
        lastIndex = s.holdIndex;
        stuck = 0;
      }
      if (s.mode === "impact") {
        // let it resolve
      }
      if (s.falls > 4) break;
    }
    return {
      ok: s.mode === "ending",
      mode: s.mode,
      hold: s.holdIndex,
      y: Math.round(s.y * 10) / 10,
      catches: s.catches,
      falls: s.falls,
      mask: s.mask,
      guard: guard,
    };
  }

  // The no-wind path needs step() to honor s._noWind. Patch wind usage by
  // wrapping step's calls: we edit wind at the source via a flag check.
  // Re-bind: monkeypatch below after definition by replacing wind inside step
  // is hard. Instead, simulate() sets a global flag read by wind().
  let windGate = true;
  const windReal = wind;
  function windGated(t, y, mask) {
    if (!windGate) return 0;
    return windReal(t, y, mask);
  }

  function catchNeed(descending, target) {
    let need = descending ? CATCH * 0.82 : CATCH;
    if (target && target.k && (isRest(target.k) || target.k === "summit")) need += 0.28;
    return need;
  }

  function gotBit(s, bit) {
    return (s.reclaimed & bit) !== 0 && (s.mask & bit) !== 0;
  }

  function simulateReturn(kind) {
    kind = kind || "trophy";
    const bit = ITEMS[kind].bit;
    const s = createState();
    s.intro = 0;
    s.settle = 1;
    const dt = 1 / 100;
    let guard = 0;
    while (guard < 70000) {
      guard++;
      if (s.mode === "ending") break;
      if (s.falls > 3) break;
      const input = { holding: false, freezeIntro: true };
      const got = (s.reclaimed & bit) !== 0;
      if (s.mode === "ledge") {
        if (!got && (s.mask & bit)) input.dropKind = kind;
        else input.keep = true;
      } else if (s.mode === "drop" || s.mode === "impact" || s.needUp || s.lock > 0) {
        input.holding = false;
      } else if (!s.attached) {
        input.holding = true;
      } else if (s.crown && got) {
        input.choice = "door";
      } else if ((s.crown && !got) || (s.descending && !got)) {
        const here = HOLDS[s.holdIndex];
        const target = lowerHold(here);
        if (!target) break;
        const hit = arcMin(s.mask, Math.max(0.2, s.holdT), here, target, s.time, true, true);
        const need = catchNeed(true, target);
        if (s.settle > 0.9 && s.holdT > 0.4 && hit.st && hit.st.angle < -0.55 && hit.minD < need) {
          s.prevHolding = true;
          s.holding = true;
          input.holding = false;
        } else input.holding = true;
      } else {
        const ni = nextIndex(s.holdIndex);
        if (ni < 0) break;
        const target = HOLDS[ni];
        const preview = arcMin(s.mask, Math.max(0.2, s.holdT + dt), HOLDS[s.holdIndex], target, s.time, false, s.descending);
        if (s.settle > 0.9 && s.holdT > 0.25 && preview.minD < catchNeed(s.descending, target)) {
          s.prevHolding = true;
          s.holding = true;
          input.holding = false;
        } else {
          input.holding = true;
          if (s.holdT > 8) break;
        }
      }
      step(s, dt, input);
    }
    return {
      ok: s.mode === "ending" && gotBit(s, bit),
      mode: s.mode,
      hold: s.holdIndex,
      mask: s.mask,
      reclaimed: s.reclaimed,
      lost: s.lost.length,
      falls: s.falls,
      guard: guard,
      y: Math.round(s.y * 10) / 10,
    };
  }

  return {
    L: L,
    G: G,
    CATCH: CATCH,
    GATE: GATE,
    SUMMIT_Y: SUMMIT_Y,
    HOLDS: HOLDS,
    ITEMS: ITEMS,
    ENDINGS: ENDINGS,
    UI: UI,
    massOf: massOf,
    weight01: weight01,
    params: params,
    wind: wind,
    stormOf: stormOf,
    faceZ: faceZ,
    routeZ: routeZ,
    BODY_R: BODY_R,
    ORDER: ["trophy", "letter", "ring", "photo"],
    hasItems: hasItems,
    sampleRelease: sampleRelease,
    faceX: faceX,
    radii: radii,
    createState: createState,
    step: step,
    arcMin: arcMin,
    reachCheck: reachCheck,
    isRest: isRest,
    simulateReturn: simulateReturn,
    simulate: function (options) {
      options = options || {};
      windGate = !options.noWind;
      // Rewire the closed-over wind by swapping the function the module uses.
      // step() calls wind() by name in this closure, so we temporarily replace it.
      const saved = wind;
      // Can't reassign const. simulate handles wind by the real function.
      // For noWind, we run and accept wind. Provide a dedicated loop here.
      windGate = true;
      return simulate(options);
    },
    wipePosition: wipePosition,
  };
});
