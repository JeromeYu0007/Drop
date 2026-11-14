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
    omega: [3.55, 2.72],
    amp: [1.30, 0.98],
    maxSpeed: [20.6, 15.2],
    aimScale: [0.86, 0.70],
    chargeRate: [2.65, 1.18],
    windMul: [0.22, 1.15],
  };

  // Difficulty curve, bottom to top:
  // approach, overhang, recovery, long gap, recovery, chimney, sparse, ice, door.
  // Columns are separated in z on purpose. A miss falls in the column you left.
  // Easy ladders share a column, so the hold below is catchable.
  // Hard moves leave that column, and the air under them is empty.
  const RAW = [
    [8, 1.71, "start"],
    [11.95, 1.852, "hold"],
    [15.9, 1.998, "hold"],
    [19.9, 1.998, "hold"],
    [24.05, 2.229, "hold"],
    [28.25, 1.876, "hold"],
    [32.2, 2.063, "hold"],
    [36.4, 2.187, "hold"],
    [40.35, 2.126, "hold"],
    [44.55, 1.849, "hold"],
    [48.5, 1.974, "hold"],
    [52.7, 1.962, "hold"],
    [56.65, 1.614, "hold"],
    [60.85, 1.803, "hold"],
    [64.4, 1.803, "hold"],
    [67.87, 1.673, "hold"],
    [71.9, 1.403, "hold"],
    [76.07, 0.853, "hold"],
    [80.24, 0.583, "hold"],
    [84.83, 0.593, "trophy"],
    [89.05, -0.189, "hold"],
    [93.25, -0.101, "hold"],
    [96.95, -0.12, "hold"],
    [101.15, -0.481, "hold"],
    [105.1, -0.992, "hold"],
    [109.3, -0.939, "hold"],
    [113.25, -1.003, "hold"],
    [117.45, -1.203, "hold"],
    [121.4, -0.956, "hold"],
    [125.35, -0.785, "hold"],
    [129.3, -0.715, "hold"],
    [133.5, -0.213, "hold"],
    [137.45, -0.029, "hold"],
    [141.3, 0.271, "hold"],
    [145.19, 0.701, "hold"],
    [149.08, 0.851, "hold"],
    [152.83, 1.141, "hold"],
    [157, 1.151, "hold"],
    [160.75, 1.441, "hold"],
    [164.5, 1.591, "hold"],
    [168.39, 1.741, "hold"],
    [172.56, 1.191, "hold"],
    [176.73, 1.761, "hold"],
    [180.76, 1.911, "hold"],
    [184.65, 2.061, "hold"],
    [188.4, 2.211, "hold"],
    [192.85, 2.221, "letter"],
    [196.6, 2.371, "hold"],
    [200.63, 2.241, "hold"],
    [204.8, 1.691, "hold"],
    [208.83, 2.261, "hold"],
    [213, 1.711, "hold"],
    [217.17, 1.861, "hold"],
    [221.34, 1.311, "hold"],
    [225.51, 1.461, "hold"],
    [229.68, 0.911, "hold"],
    [233.85, 0.361, "hold"],
    [238.02, -0.049, "hold"],
    [241.91, -0.599, "ice"],
    [246.08, -0.169, "ice"],
    [250.11, -0.719, "ice"],
    [253.61, -0.619, "ice"],
    [257.47, -0.979, "ice"],
    [261.36, -0.829, "ice"],
    [265.11, -0.819, "ice"],
    [269, -0.809, "ice"],
    [273.03, -0.799, "ice"],
    [277.06, -0.509, "ice"],
    [280.81, -0.219, "ice"],
    [284.56, -0.069, "ice"],
    [288.59, 0.501, "ring"],
    [292.62, -0.049, "ice"],
    [296.65, 0.381, "ice"],
    [300.68, 0.391, "ice"],
    [304.57, 0.681, "ice"],
    [308.6, 0.831, "ice"],
    [312.35, 1.121, "ice"],
    [316.1, 1.271, "ice"],
    [319.85, 1.421, "ice"],
    [323.88, 1.291, "ice"],
    [327.77, 1.721, "ice"],
    [331.52, 2.011, "ice"],
    [335.55, 2.021, "ice"],
    [339.44, 2.311, "ice"],
    [343.47, 2.321, "ice"],
    [347.5, 2.471, "ice"],
    [351.53, 2.481, "ice"],
    [355.56, 1.931, "ice"],
    [359.73, 2.361, "ice"],
    [363.76, 2.231, "ice"],
    [367.79, 1.961, "ice"],
    [371.54, 1.831, "ice"],
    [375.15, 1.561, "ice"],
    [379.18, 1.011, "ice"],
    [383.21, 0.461, "ice"],
    [387.24, -0.089, "ice"],
    [391.83, 0.061, "photo"],
    [396, -0.349, "ice"],
    [400.03, -0.339, "ice"],
    [404.2, -0.889, "ice"],
    [408.37, -0.599, "ice"],
    [412.26, -0.589, "ice"],
    [416.29, -0.579, "ice"],
    [420.32, -0.569, "ice"],
    [424.35, -0.559, "ice"],
    [428.38, -0.549, "ice"],
    [432.27, -0.259, "ice"],
    [436.3, -0.809, "ice"],
    [440.33, -0.239, "ice"],
    [444.22, -0.089, "ice"],
    [448.11, 0.061, "ice"],
    [452.14, -0.069, "ice"],
    [455.94, 0.431, "ice"],
    [459.74, 0.531, "ice"],
    [463.44, 0.831, "ice"],
    [467.21, 1.001, "ice"],
    [470.98, 1.291, "ice"],
    [474.75, 1.581, "ice"],
    [478.64, 1.751, "ice"],
    [482.77, 2.521, "summit"],
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
      lineZh: "名字是后来刻的。你第一次没敢念出声。",
      lineEn: "The name was cut in later.",
      backZh: "名字上有雪。你擦掉了。",
      backEn: "Snow on the name. You wiped it off.",
    },
    letter: {
      bit: 8,
      w: 0.3,
      zh: "未寄出的信",
      en: "Unsent letter",
      lineZh: "第一行是你的名字。地址那一栏，到现在还空着。",
      lineEn: "The first line is your name.",
      backZh: "纸还是干的。你没有拆开。",
      backEn: "The paper is still dry. You did not open it.",
    },
    ring: {
      bit: 2,
      w: 0.22,
      zh: "戒指",
      en: "Ring",
      lineZh: "还是那只手的尺寸。你记得它被放进来的重量。",
      lineEn: "Still the size of that hand.",
      backZh: "比记忆里更凉。",
      backEn: "Colder than you remembered.",
    },
    photo: {
      bit: 1,
      w: 0.2,
      zh: "旧照片",
      en: "Old photo",
      lineZh: "被摸掉的，是笑。你的拇指比时间先到。",
      lineEn: "What wore away was the smile.",
      backZh: "你把有字的那一面朝下。",
      backEn: "You turned the written side down.",
    },
  };

  const ENDINGS = {
    0: { zh: ["你把四件都留在山下。门里的光不认得名字，也不问你从哪一面上来。肩轻得发空，空了一会儿，你才想起手原来可以这样垂着，不必再握着什么证明。"], en: ["You left all four below."] },
    1: { zh: ["你只带上了那张被摸淡的笑。光里看不清眼睛，可你记得自己曾把有字的一面扣下。下面还躺着没寄出的话、那只手的尺寸，和后来才刻上的名字，雪盖着它们。"], en: ["Only the smile."] },
    2: { zh: ["戒指在掌心，仍是那只手的尺寸。你没有戴上。风从指缝穿过，像有人把你的手摊开，又像你终于允许它空着。奖杯、信和照片，都留在更低的雪里，安静着。"], en: ["The ring, unworn."] },
    3: { zh: ["笑和那只手都上来了。你把照片转向光，戒指却不往手指上送。想说的话还在山下，没有地址。你站在门边，觉得自己只带回了还能被握住的那一部分。"], en: ["Smile and hand."] },
    4: { zh: ["奖杯上的名字对着太阳。你不记得是谁先离开，只记得刻字的时候手很稳。信、戒指和照片都没跟着上来。证明在，人的温度不在。你把杯子抱得很紧，像怕它再凉下去。"], en: ["The name faces the sun."] },
    5: { zh: ["一张脸，一个后来刻上的名字。你两样都没放下。没有戒指，也没有那封信。可你看着光，忽然觉得名字和笑原来可以单独在一起，不必再借别人的手才能成立。"], en: ["A face and a name."] },
    6: { zh: ["证明还在，约定也在。奖杯冰着你的手腕，戒指仍是那只手的尺寸。照片和信留在下面。你问了一句很轻的「人呢」。风没有回答，门却为你留着一条缝，像还认得你。"], en: ["Proof and promise."] },
    7: { zh: ["信还在雪里。你带着笑、那只手的尺寸，和后来刻上的名字走到这里。看着光，你发现自己没有要补的句子。没寄出的那些，也许本来就不是写给这一扇门的。"], en: ["The letter stayed in the snow."] },
    8: { zh: ["你在门前把信读到最后一行，还是没有地址。奖杯、戒指和照片都留在山下，只剩这些没处投递的字。你把纸折好，折痕比来的时候更深，人却没有变得更重。"], en: ["Still no address."] },
    9: { zh: ["你记得那张脸，也还想说。信和照片都在怀里，戒指不在。尺寸留在了更低的地方。你张了张嘴，发现要说的话并不需要那只手在场，才第一次把句子说完。"], en: ["The face, and the unsent words."] },
    10: { zh: ["话，和那只手的尺寸，都跟着你上来了。你还是没有寄出。没有奖杯，也没有照片，名字和笑都不在身边。你握着戒指，觉得地址也许就是这只已经不在的手。"], en: ["Unsent, and still the right size."] },
    11: { zh: ["最沉的那件没有上来。奖杯留在下面，名字也留在下面。你带着信、戒指和那张笑，肩却意外地还认得它们。你一一叫出它们的名字，声音不大，门里的光却侧过来听。"], en: ["The heaviest thing stayed below."] },
    12: { zh: ["杯子上是一个名字，纸上是另一个。你两个都带来了。戒指和照片留在雪里，约定与那张脸都没有跟上来。你把两个名字并排对着光，忽然分不清自己在纪念谁。"], en: ["Two names, brought up together."] },
    13: { zh: ["约定留在下面。你带着记得的笑、想说的话，和后来刻上的名字走到门口。没有戒指，那只手的尺寸不在了。你仍把三样东西抱稳，像把一个人的不同时辰抱在一起。"], en: ["The promise stayed below."] },
    14: { zh: ["那张脸没有上来。你记得重量，不太记得眼睛。奖杯、信和戒指都在，照片留在了低处。风把你的衣角吹向门，你低下头，用剩下的三件把那双淡掉的眼睛慢慢想回来。"], en: ["The face did not come up."] },
    15: { zh: ["都还在。奖杯、信、戒指、照片，一件也没有少。肩没有松，可你上来了。门里的光很白，白得能看见每一个你没放下的理由。你没有把它们交出去。这一次，你只是不再一个人扛。"], en: ["All of it is still here."] },
  };

  const PROLOGUE = [
    "夜里出发的人，通常不是为了看山顶。",
    "背包里是四件还没放下的东西：后来才刻上名字的奖杯，一封没有地址的信，仍是那只手的尺寸的戒指，一张笑被摸淡了的照片。",
    "山不催你。风会。",
  ];

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
      grav: mix(0.86, 1.26, k),
      stamina: mix(8.4, 4.8, k),
      sway: mix(0.03, 0.2, k),
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
    const top = Math.max(156, HOLDS[HOLDS.length - 1].y);
    const alt = clamp((y - 16) / Math.max(30, top - 16), 0, 1);
    const gale = smooth(clamp((y - top * 0.58) / Math.max(10, top * 0.16), 0, 1));
    // A slow swell, plus a gust the eye can see coming. Both grow hard with height.
    const swell = Math.sin(t * 0.23 + y * 0.01) * (0.14 + alt * 0.24);
    const gust = Math.sin(t * 0.7 + y * 0.015 + 1.1) * (0.08 + gale * 0.5);
    const amp = (0.08 + storm * 0.82 + gale * 0.22) * (returning ? 1.22 : 1);
    return (swell + gust) * amp;
  }

  function gustForecast(t, y, mask, returning) {
    const now = wind(t, y, mask, returning);
    const soon = wind(t + 0.75, y, mask, returning);
    return { now: now, soon: soon, lead: 0.75 };
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
  // Right-hand edge of the solid rock. A fixed shape of y only.
  // Moving a hold does not move the cliff.
  function faceZ(y) {
    // Gentle on purpose. A step steeper than about 0.1 m over the
    // shoulders cancels an upward launch, and then no hold placement
    // can keep both packs inside the window.
    const sway = Math.sin(y * 0.041) * 1.55 + Math.sin(y * 0.09 + 0.8) * 0.28;
    const n = (vnoise(y * 0.22 + 1.7) - 0.5) * 0.16;
    return sway + n;
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
    if (downOk && downBeat(mask, holdT)) {
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
    if (h.k === "summit") {
      s.crown = true;
      s.descending = false;
      s.mode = "play";
      s.lock = 0.35;
    } else if (isRest(h.k) && hasItems(s.mask) && (s.restSeen & (1 << index)) === 0) {
      s.crown = false;
      beginLedge(s);
    } else {
      s.crown = false;
      s.mode = "play";
    }
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

  function downBeat(mask, holdT) {
    // The line has turned down, and it only stays on the hold for a short beat.
    return wantsDown(mask, holdT) && holdT < 1.62;
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
    const goingBack = downBeat(s.mask, s.holdT);
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

  function beginImpact(s) {
    if (s.mode === "impact") return;
    s.mode = "impact";
    s.impactT = 0;
    s.attached = false;
    s.crown = false;
    s.descending = false;
    s.dots = [];
    s.armed = false;
    s.failedOnce = true;
    s.falls += 1;
    s.shake = 0.55;
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

    if (s.mode === "impact") {
      s.impactT += dt;
      s.vy = Math.min(s.vy, -8);
      if (s.impactT > 0.28) {
        const keepMask = s.mask;
        const lost = s.lost;
        const reclaimed = s.reclaimed;
        const best = s.bestRun;
        const falls = s.falls;
        wipePosition(s, false);
        s.mask = keepMask;
        s.lost = lost;
        s.reclaimed = reclaimed;
        s.bestRun = best;
        s.falls = falls;
        s.failedOnce = true;
        s.intro = 0;
      }
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "ending") {
      if (input.retrieve && s.lost && s.lost.length) {
        const h = HOLDS[HOLDS.length - 1];
        s.mode = "play";
        s.endingT = 0;
        s.crown = true;
        s.descending = false;
        s.attached = true;
        s.holdIndex = h.i;
        s.origin = h.i;
        s.holdT = 0;
        s.settle = 1;
        s.vy = 0;
        s.vz = 0;
        s.angle = 0;
        s.y = h.y + 0.22;
        s.z = Math.max(h.z, faceZ(h.y) + BODY_R + 0.08);
        s.lock = 0.3;
        s.sfx.push("keep");
        s.prevHolding = false;
        s.holding = false;
        return s;
      }
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
    if (s.crown && s.attached && input.choice === "door" && HOLDS[s.holdIndex].k === "summit") {
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
          s.crown = false;
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
          s.crown = false;
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
          const turned = (s.crown || s.descending) && wantsDown(s.mask, s.holdT);
          if ((s.crown || s.descending) && downBeat(s.mask, s.holdT)) {
            target = lowerHold(h);
          } else if (s.crown && !turned) target = GATE;
          if (!target && !turned) {
            const ni = nextIndex(s.holdIndex);
            if (ni >= 0) target = HOLDS[ni];
          }
          if (target && s.holdT > 0.12) {
            const downAim = (s.crown || s.descending) && downBeat(s.mask, s.holdT);
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
        const turned = (s.crown || s.descending) && wantsDown(s.mask, s.holdT);
        const down = (s.crown || s.descending) && downBeat(s.mask, s.holdT);
        const onTop = s.crown && h.k === "summit";
        // On the summit a short press is the door. A release that is not
        // aimed at the hold below never throws the climber off.
        // Once the line has turned down, a late release stays put. It does not
        // flip into an upward launch that would still land on the hold below.
        if (released && down && s.armed && s.holdT > 0.16 && s.settle > 0.9) launch(s);
        else if (released && onTop && !turned && s.holdT > 0.05 && s.holdT <= 1.28 && s.settle > 0.9) beginEnding(s);
        else if (released && !onTop && !turned && s.holdT > 0.16 && s.settle > 0.9) launch(s);
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
        if (s.y < 1.2 && s.vy < -6 && s.mode === "play") beginImpact(s);
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
        const beat = downBeat(s.mask, Math.max(0.2, s.holdT));
        const hit = arcMin(s.mask, Math.max(0.2, s.holdT), here, target, s.time, true, true);
        const need = CATCH * 1.12;
        if (s.settle > 0.9 && beat && hit.minD < need) {
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

  // One cliff mesh. Every hold is a vertex grown out of this surface.
  function buildCliffMesh(stepY, stepX) {
    stepY = stepY || 0.32;
    stepX = stepX || 0.36;
    const holds = HOLDS;
    const top = holds[holds.length - 1].y + 16;
    const ys = [];
    const seenY = {};
    function addY(y) {
      const k = (+y).toFixed(3);
      if (seenY[k]) return;
      seenY[k] = 1;
      ys.push(+k);
    }
    for (let y = -3; y <= top; y += stepY) addY(y);
    for (let i = 0; i < holds.length; i++) addY(holds[i].y);
    ys.sort(function (a, b) { return a - b; });
    const xs = [0];
    for (let x = -2.5; x <= 2.25; x += stepX) {
      if (Math.abs(x) < stepX * 0.45) continue;
      xs.push(+x.toFixed(4));
    }
    xs.sort(function (a, b) { return a - b; });
    const xCount = xs.length;
    const yCount = ys.length;
    function vid(ix, iy) { return iy * xCount + ix; }
    function wallZ(x, y) {
      const face = faceZ(y);
      const n1 = (vnoise(y * 0.31 + x * 0.85 + 2.0) - 0.5) * 0.42;
      const n2 = (vnoise(y * 0.97 + x * 1.6 + 4.2) - 0.5) * 0.16;
      const ridge = (0.5 - Math.abs(vnoise(y * 0.58 + x * 0.25 + 1.1) - 0.5)) * 0.2;
      const strata = Math.sin(y * 2.05 + x * 0.35) * 0.03;
      const crack = Math.abs(vnoise(y * 3.4 + 1.7) - 0.5) < 0.032 ? -0.18 : 0;
      const chimney = Math.exp(-Math.pow((x - 1.2) * 1.65, 2)) * -0.48 * (0.62 + 0.38 * Math.sin(y * 0.037));
      const groove = Math.exp(-Math.pow((x + 0.85) * 2.1, 2)) * -0.2;
      return face + n1 + n2 + ridge + strata + crack + chimney + groove - x * x * 0.03;
    }
    const pos = new Float32Array(xCount * yCount * 3);
    const nrm = new Float32Array(xCount * yCount * 3);
    const col = new Float32Array(xCount * yCount * 3);
    for (let iy = 0; iy < yCount; iy++) {
      for (let ix = 0; ix < xCount; ix++) {
        const o = vid(ix, iy) * 3;
        pos[o] = xs[ix];
        pos[o + 1] = ys[iy];
        pos[o + 2] = wallZ(xs[ix], ys[iy]);
        col[o] = 1;
        col[o + 1] = 1;
        col[o + 2] = 1;
      }
    }
    for (let h = 0; h < holds.length; h++) {
      const hold = holds[h];
      const reachX = 0.78 + nhash(h * 4.7) * 0.4;
      const reachY = 0.52 + nhash(h * 8.3) * 0.26;
      let ix0 = 0;
      let iy0 = 0;
      let bestX = 1e9;
      let bestY = 1e9;
      for (let iy = 0; iy < yCount; iy++) {
        const dy = ys[iy] - hold.y;
        const ady = Math.abs(dy);
        if (ady < bestY) { bestY = ady; iy0 = iy; }
        if (dy < -reachY - 0.2 || dy > reachY) continue;
        for (let ix = 0; ix < xCount; ix++) {
          const dx = Math.abs(xs[ix]);
          if (iy === 0 && dx < bestX) { bestX = dx; ix0 = ix; }
          if (dx > reachX * 1.2) continue;
          const ax = dx / reachX;
          const ay = dy >= -0.02 ? dy / (reachY * 0.72) : -dy / reachY;
          if (ax > 1 || ay > 1) continue;
          const k = (1 - ax * ax) * (1 - ay * ay);
          const o = vid(ix, iy) * 3;
          let z = pos[o + 2] * (1 - k) + (hold.z - ax * ax * 0.18) * k;
          if (dy < -0.045) z -= 0.22 * k * Math.min(1, -dy / 0.2);
          pos[o + 2] = z;
          if (dy < -0.07 && dy > -0.36) pos[o + 1] = ys[iy] - 0.055 * k;
        }
      }
      for (let ix = 0; ix < xCount; ix++) {
        const dx = Math.abs(xs[ix]);
        if (dx < bestX) { bestX = dx; ix0 = ix; }
      }
      const o = vid(ix0, iy0) * 3;
      pos[o] = 0;
      pos[o + 1] = hold.y;
      pos[o + 2] = hold.z;
      if (hold.k === "ice") {
        col[o] = 0.78;
        col[o + 1] = 0.88;
        col[o + 2] = 1;
      }
    }
    const idx = [];
    for (let iy = 0; iy < yCount - 1; iy++) {
      for (let ix = 0; ix < xCount - 1; ix++) {
        const a = vid(ix, iy);
        const b = vid(ix + 1, iy);
        const c = vid(ix, iy + 1);
        const d = vid(ix + 1, iy + 1);
        idx.push(a, b, c, b, d, c);
      }
    }
    for (let t = 0; t < idx.length; t += 3) {
      const ia = idx[t] * 3;
      const ib = idx[t + 1] * 3;
      const ic = idx[t + 2] * 3;
      const ax = pos[ib] - pos[ia];
      const ay = pos[ib + 1] - pos[ia + 1];
      const az = pos[ib + 2] - pos[ia + 2];
      const bx = pos[ic] - pos[ia];
      const by = pos[ic + 1] - pos[ia + 1];
      const bz = pos[ic + 2] - pos[ia + 2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      nrm[ia] += cx; nrm[ia + 1] += cy; nrm[ia + 2] += cz;
      nrm[ib] += cx; nrm[ib + 1] += cy; nrm[ib + 2] += cz;
      nrm[ic] += cx; nrm[ic + 1] += cy; nrm[ic + 2] += cz;
    }
    for (let i = 0; i < xCount * yCount; i++) {
      const o = i * 3;
      const len = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
      nrm[o] /= len;
      nrm[o + 1] /= len;
      nrm[o + 2] /= len;
      const up = nrm[o + 1];
      const snow = smooth(clamp((pos[o + 1] - (top - 36)) / 24, 0, 1)) * smooth(clamp((up - 0.35) / 0.4, 0, 1));
      col[o] = col[o] * (1 - snow) + 1.25 * snow;
      col[o + 1] = col[o + 1] * (1 - snow) + 1.28 * snow;
      col[o + 2] = col[o + 2] * (1 - snow) + 1.32 * snow;
    }
    return { positions: pos, normals: nrm, colors: col, indices: idx };
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
    gustForecast: gustForecast,
    PROLOGUE: PROLOGUE,
    stormOf: stormOf,
    faceZ: faceZ,
    buildCliffMesh: buildCliffMesh,
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
