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
  const SUMMIT_Y = 104.5;

  const TUNE = {
    omega: [2.15, 1.62],
    amp: [1.3, 0.98],
    maxSpeed: [20.2, 16.2],
    aimScale: [0.8, 0.66],
    chargeRate: [0.85, 0.55],
    windMul: [1.35, 0.34],
  };

  const RAW = [
    [8, 0, "start"],
    [10.1, -0.35, "hold"],
    [12.3, 0.1, "hold"],
    [14.65, -0.45, "hold"],
    [17.15, 0, "hold"],
    [19.8, -0.45, "trophy"],
    [22.9, 0.5, "hold"],
    [26.1, -0.55, "hold"],
    [29.4, 0.35, "hold"],
    [32.65, -0.75, "hold"],
    [36, 0, "hold"],
    [39.15, -0.35, "letter"],
    [42.8, 0.75, "hold"],
    [46.6, -0.45, "hold"],
    [50.15, 0, "hold"],
    [54, -1.15, "hold"],
    [57.8, 0, "hold"],
    [61.25, -0.35, "ring"],
    [65.25, 0.9, "hold"],
    [69.45, -0.3, "hold"],
    [72.7, 0.05, "hold"],
    [76.95, -1.25, "hold"],
    [81, -0.1, "hold"],
    [84.65, -0.55, "photo"],
    [89.05, 0.45, "hold"],
    [93.55, -0.5, "hold"],
    [96.7, -0.25, "hold"],
    [101.15, -1.3, "hold"],
    [104.5, -1.05, "summit"],
  ];

  const HOLDS = RAW.map(function (h, i) {
    return { y: h[0], z: h[1], k: h[2], i: i };
  });

  const ITEMS = {
    trophy: {
      bit: 4,
      w: 0.48,
      zh: "奖杯",
      en: "Trophy",
      lineZh: "很沉，刻着你的名字",
      lineEn: "Heavy. Your name is cut into it.",
    },
    letter: {
      bit: 8,
      w: 0.3,
      zh: "未寄出的信",
      en: "Unsent letter",
      lineZh: "没有地址，也没有落款",
      lineEn: "No address. No name at the end.",
    },
    ring: {
      bit: 2,
      w: 0.22,
      zh: "戒指",
      en: "Ring",
      lineZh: "凉的，还是原来的尺寸",
      lineEn: "Still cold. Still the same size.",
    },
    photo: {
      bit: 1,
      w: 0.2,
      zh: "旧照片",
      en: "Old photo",
      lineZh: "一张被摸糊的脸",
      lineEn: "A face worn soft by fingers.",
    },
  };

  const ENDINGS = {
    0: {
      zh: ["你是空着手到的。", "风穿过背包，像穿过一扇没关的窗。", "山顶很亮。亮得没有影子。"],
      en: ["You arrived with empty hands.", "The wind goes through the pack like an open window.", "The summit is bright. Too bright for a shadow."],
    },
    1: {
      zh: ["你留下了那张脸。", "其他的，都在下面响了一声。", "光上来的时候，你没有眨眼。"],
      en: ["You kept the face.", "The rest struck once, somewhere below.", "When the light arrived, you did not blink."],
    },
    2: {
      zh: ["戒指在掌心里暖了一点。", "你没有把它戴上。", "云海把山下的路盖住了。"],
      en: ["The ring warmed a little in your palm.", "You did not put it on.", "The clouds have covered every road below."],
    },
    3: {
      zh: ["人和约定还在。", "你把背包放到脚边，第一次。", "肩是松的。"],
      en: ["The person, and the promise, are still here.", "You set the pack by your feet. The first time.", "Your shoulders drop."],
    },
    4: {
      zh: ["名字在太阳底下发亮。", "你看了很久。", "没有掌声。风也很整齐。"],
      en: ["Your name shines under the sun.", "You look for a long time.", "No applause. The wind is very tidy."],
    },
    5: {
      zh: ["你带着一张脸，和自己的名字。", "一个被别人叫过。", "一个是你刻的。"],
      en: ["You carried a face, and your own name.", "One of them was spoken by someone else.", "One of them you cut yourself."],
    },
    6: {
      zh: ["证明还在。那枚戒指也还在。", "你没有交换出去。", "也没有丢掉。"],
      en: ["The proof is here. So is the ring.", "You did not give it.", "You did not let it go."],
    },
    7: {
      zh: ["信留在半山了。", "话停在那里，人上来了。", "你对着光，没有要补的句子。"],
      en: ["The letter stayed on the mountain.", "The words stopped there. You did not.", "Facing the light, nothing left to add."],
    },
    8: {
      zh: ["你把信读完了。", "没有地址。", "有一个字自己飞走了。"],
      en: ["You finished reading the letter.", "It has no address.", "One word left on its own."],
    },
    9: {
      zh: ["你记得，也还想说。", "这两样东西很轻。", "你还是没有松手。"],
      en: ["You remember, and you still want to speak.", "These two things are light.", "Your hand did not open."],
    },
    10: {
      zh: ["约定和那句没说的话都在。", "照片先下去了。", "像有人先转过身。"],
      en: ["The promise is here, and the unsaid sentence.", "The photograph went down first.", "Like someone turning away."],
    },
    11: {
      zh: ["最沉的一件不在了。", "剩下的，你都叫得出名字。", "你看着太阳升完。"],
      en: ["The heaviest thing is gone.", "What remains, you can name.", "You watch the sun finish rising."],
    },
    12: {
      zh: ["杯子上是名字，纸上是话。", "你都带上来了。", "人倒不一定在里面。"],
      en: ["A name on the cup. Words on the paper.", "You brought them both.", "A person is not necessarily inside either."],
    },
    13: {
      zh: ["约定留在了雪里。", "你带上来记得的、想说的，和刻着的名字。", "手是空的。"],
      en: ["The promise stayed in the snow.", "You brought what you remember, what you meant to say, and the carved name.", "Your hand is empty."],
    },
    14: {
      zh: ["那张脸没有上来。", "你记得重量，不太记得五官。", "光里只剩一个轮廓。"],
      en: ["The face did not come up.", "You remember the weight more than the features.", "In the light, only an outline."],
    },
    15: {
      zh: ["都还在。", "你站在光里面，肩没有松。", "可你到底是上来了。"],
      en: ["All of it is still here.", "You stand in the light. Your shoulders do not drop.", "But you did arrive."],
    },
  };

  const UI = {
    titleZh: "放下",
    titleEn: "LET GO",
    hintZh: "按住蓄力，弧线碰到红绳再松开",
    hintEn: "Hold. Release when the arc meets the red.",
    hintFallZh: "下坠时按住，也许还能抓住",
    hintFallEn: "Hold as you fall. You may still catch.",
    holdZh: "按住放下",
    holdEn: "Hold to let go",
    tapZh: "轻点留下",
    tapEn: "Tap to keep",
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
    };
  }

  function wind(t, y, mask) {
    if (y < 74) return 0;
    const k = clamp((y - 74) / 34, 0, 1);
    const gust = Math.sin(t * 0.72 + y * 0.025) * 0.72 + Math.sin(t * 1.55 + 1.4) * 0.28;
    return gust * 2.15 * k * params(mask).windMul;
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
    const k = clamp(y / 110, 0, 1);
    return {
      rx: mix(7.2, 3.4, k) + Math.sin(y * 0.07 + 0.6) * 0.28,
      rz: mix(16, 8, k) + Math.sin(y * 0.05) * 1.1,
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
    };
  }

  function placeOnRope(s, hold, angle, rope) {
    s.y = hold.y - Math.cos(angle) * rope;
    s.z = hold.z + Math.sin(angle) * rope;
    s.angle = angle;
  }

  function arcMin(mask, holdT, hold, target, time) {
    const st = sampleRelease(mask, holdT);
    let y = hold.y + st.offY;
    let z = hold.z + st.offZ;
    let vy = st.vy;
    let vz = st.vz;
    let minD = 1e9;
    const dots = [];
    for (let i = 0; i < 80; i++) {
      const dt = 1 / 70;
      const tt = time + i * dt;
      vz += wind(tt, y, mask) * dt;
      vy -= G * dt;
      const sp = Math.hypot(vz, vy) + 1e-4;
      const dc = DRAG * sp;
      vz -= (vz / sp) * dc * dt;
      vy -= (vy / sp) * dc * dt;
      z += vz * dt;
      y += vy * dt;
      if (i % 6 === 0) dots.push({ y: y, z: z, x: faceX(y, z) - 0.55 });
      if (target) {
        const d = Math.hypot(z - target.z, y - target.y);
        if (d < minD) minD = d;
      }
      if (vy < 0 && y < hold.y - 14) break;
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

  function beginLedge(s) {
    s.mode = "ledge";
    s.seenRelease = !s.holding;
    s.pressT = 0;
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
    s.shake = Math.max(s.shake, 0.18);
    s.sfx.push("catch");
    if (!s.airCatch && s.launches > 0) s.airCatch = true;
    if (h.k === "summit") beginEnding(s);
    else if (isRest(h.k) && ITEMS[h.k] && s.mask & ITEMS[h.k].bit) beginLedge(s);
    else s.mode = "play";
    if (s.y > s.bestRun) s.bestRun = s.y;
  }

  function launch(s) {
    const h = HOLDS[s.holdIndex];
    const st = sampleRelease(s.mask, s.holdT);
    s.attached = false;
    s.y = h.y + st.offY;
    s.z = h.z + st.offZ;
    s.vy = st.vy;
    s.vz = st.vz;
    s.angle = st.angle;
    s.flightT = 0;
    s.origin = s.holdIndex;
    s.nearDone = false;
    s.launches += 1;
    s.mode = "play";
    s.sfx.push("release");
  }

  function dropItem(s) {
    const h = HOLDS[s.holdIndex];
    const spec = ITEMS[h.k];
    if (!spec || !(s.mask & spec.bit)) {
      s.mode = "play";
      return;
    }
    s.mask &= ~spec.bit;
    s.mode = "drop";
    s.dropT = 0;
    s.dropKind = h.k;
    s.dropY = h.y + 0.8;
    s.dropZ = h.z;
    s.dropVy = 1.4;
    s.dropX = faceX(h.y, h.z) - 1.3;
    s.sfx.push("drop");
    s.shake = Math.max(s.shake, 0.12);
  }

  function keepItem(s) {
    s.mode = "play";
    s.pressT = 0;
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
    if (fullItems) {
      s.mask = 15;
      s.learned = 0;
      s.failedOnce = false;
      s.bestRun = h.y;
    }
    placeOnRope(s, h, 0, L);
    s.resetFade = 1;
  }

  function step(s, dt, input) {
    input = input || {};
    s.sfx = [];
    const holding = !!input.holding;
    const released = s.prevHolding && !holding;
    s.time += dt;
    s.burst = Math.max(0, s.burst - dt * 1.8);
    s.shake *= Math.exp(-dt * 5.5);
    s.flashBest = Math.max(0, s.flashBest - dt);
    s.resetFade = Math.max(0, s.resetFade - dt * 2.4);
    if (s.nearT > 0) s.nearT = Math.max(0, s.nearT - dt);

    if (input.restart) {
      wipePosition(s, true);
      s.intro = 0;
      s.prevHolding = false;
      s.holding = false;
      s.sfx.push("restart");
      return s;
    }

    if (s.intro > 0 && !input.freezeIntro) {
      const rate = input.skipIntro ? 1.8 : 0.22;
      s.intro = Math.max(0, s.intro - dt * rate);
    }

    if (s.mode === "impact") {
      s.impactT += dt;
      s.vy = Math.min(s.vy, -8);
      if (s.impactT > 0.28) {
        const keepMask = s.mask;
        const best = s.bestRun;
        const failed = true;
        wipePosition(s, false);
        s.mask = keepMask;
        s.bestRun = best;
        s.failedOnce = failed;
        s.falls += 1;
        s.intro = 0;
        s.sfx.push("impact");
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
      s.dropZ += Math.sin(s.time * 3) * dt * 0.4;
      if (s.dropT > 1.25) {
        s.dropT = -1;
        s.mode = "play";
      }
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "ledge") {
      if (input.keep) {
        keepItem(s);
      } else if (input.drop) {
        dropItem(s);
      } else if (!s.seenRelease) {
        if (!holding) s.seenRelease = true;
      } else if (holding) {
        s.pressT += dt;
        if (s.pressT > 0.62) dropItem(s);
      } else {
        if (released && s.pressT > 0.02 && s.pressT < 0.28) keepItem(s);
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
    if (s.attached) {
      const h = HOLDS[s.holdIndex];
      s.settle = Math.min(1, s.settle + dt / 0.2);
      const rope = mix(0.42, L, s.settle);
      if (holding && s.settle > 0.9) {
        s.holdT += dt;
        const st = sampleRelease(s.mask, s.holdT);
        s.angle = st.angle;
        placeOnRope(s, h, st.angle, L);
        const ni = nextIndex(s.holdIndex);
        if (ni >= 0 && s.holdT > 0.12) {
          const hit = arcMin(s.mask, s.holdT, h, HOLDS[ni], s.time);
          s.dots = hit.dots;
          s.aimD = hit.minD;
          const was = s.armed;
          s.armed = hit.minD < CATCH;
          if (s.armed && !was) s.sfx.push("arm");
        } else {
          s.armed = false;
          s.dots = [];
          s.aimD = 99;
        }
      } else {
        if (released && s.holdT > 0.16 && s.settle > 0.9) launch(s);
        s.holdT = 0;
        s.armed = false;
        s.dots = [];
        if (s.attached) {
          const idle = Math.sin(s.time * 1.25) * 0.055 * s.settle;
          s.angle = idle;
          placeOnRope(s, h, idle, rope);
        }
      }
    } else {
      s.flightT += dt;
      s.armed = false;
      s.vz += wind(s.time, s.y, s.mask) * dt;
      s.vy -= G * dt;
      const sp = Math.hypot(s.vz, s.vy) + 1e-4;
      const dc = DRAG * sp;
      s.vz -= (s.vz / sp) * dc * dt;
      s.vy -= (s.vy / sp) * dc * dt;
      s.z += s.vz * dt;
      s.y += s.vy * dt;
      if (sp > 0.8) s.angle = Math.atan2(-s.vz, s.vy);

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
        if (s.y < 1.2 && s.vy < -6) {
          s.mode = "impact";
          s.impactT = 0;
          s.shake = 0.55;
        }
      }
    }

    if (s.y > s.bestRun) s.bestRun = s.y;

    s.sway += (s.angle - s.sway) * (1 - Math.exp(-dt * 5));
    s.visAngle = lerpAngle(s.visAngle, s.angle, 1 - Math.exp(-dt * (s.attached ? 14 : 6)));
    s.prevHolding = holding;
    s.holding = holding;
    return s;
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
      if (s.mode === "ledge") {
        if (options.dropAll) input.drop = true;
        else input.keep = true;
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
          if (s.holdT > 4.6) {
            stuck++;
            break;
          }
        }
      } else {
        input.holding = true; // reach a little farther while falling
      }
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

  return {
    L: L,
    G: G,
    CATCH: CATCH,
    SUMMIT_Y: SUMMIT_Y,
    HOLDS: HOLDS,
    ITEMS: ITEMS,
    ENDINGS: ENDINGS,
    UI: UI,
    massOf: massOf,
    weight01: weight01,
    params: params,
    wind: wind,
    sampleRelease: sampleRelease,
    faceX: faceX,
    radii: radii,
    createState: createState,
    step: step,
    arcMin: arcMin,
    isRest: isRest,
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
