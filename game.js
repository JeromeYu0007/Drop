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
  let windEnabled = true;
  // Light pack charges and swings faster. A heavy pack is slower, never unreachable.
  const TUNE = {
    omega: [3.55, 2.72],
    amp: [1.30, 0.98],
    maxSpeed: [20.6, 15.2],
    aimScale: [0.86, 0.70],
    chargeRate: [2.65, 1.18],
    windMul: [0.70, 1.15],
  };

  // Four acts with breathers, changing wall slope, and a short exposed crown.
  // Preserve the proven local launch geometry; shorten the climb, not each jump.
  const RAW = [
    [8, 1.71, "start"],
    [11.95, 1.852, "hold"],
    [15.9, 1.998, "hold"],
    [19.9, 1.998, "hold"],
    [24.05, 2.229, "hold"],
    [28.25, 1.876, "hold"],
    [32.25, 2.063, "hold"],
    [36.4, 2.187, "hold"],
    [40.35, 2.126, "hold"],
    [44.55, 1.849, "trophy"],
    [48.5, 1.974, "hold"],
    [52.7, 1.962, "hold"],
    [56.65, 1.614, "hold"],
    [60.85, 1.803, "hold"],
    [64.55, 1.803, "hold"],
    [67.87, 1.673, "hold"],
    [71.9, 1.403, "hold"],
    [76.07, 0.853, "hold"],
    [80.24, 0.583, "hold"],
    [84.62, 0.593, "hold"],
    [88.95, -0.189, "letter"],
    [93.25, -0.101, "hold"],
    [97.15, -0.12, "hold"],
    [101.15, -0.481, "hold"],
    [105.1, -0.992, "hold"],
    [109.3, -0.939, "hold"],
    [113.25, -1.003, "hold"],
    [117.45, -1.203, "ice"],
    [121.4, -0.956, "ice"],
    [125.35, -0.785, "ice"],
    [129.3, -0.715, "ice"],
    [133.5, -0.213, "ring"],
    [137.45, -0.029, "ice"],
    [141.3, 0.271, "ice"],
    [145.19, 0.608, "ice"],
    [149.08, 0.819, "ice"],
    [152.83, 1.013, "ice"],
    [156.92, 1.271, "ice"],
    [160.75, 1.337, "ice"],
    [164.65, 1.506, "ice"],
    [168.75, 1.741, "photo"],
    [172.72, 1.191, "ice"],
    [176.73, 1.761, "ice"],
    [180.76, 1.911, "ice"],
    [184.65, 2.008, "ice"],
    [188.5, 2.116, "ice"],
    [192.85, 2.221, "summit"],
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
      preload: mix(0.04, 0.20, k),
      settleDuration: mix(0.36, 0.90, k),
    };
  }
  function grav(mask) {
    return G * params(mask).grav;
  }

  function stageAt(y) {
    let stage = 0;
    for (const h of HOLDS) if (isRest(h.k) && y >= h.y - 0.001) stage++;
    return stage;
  }
  function weatherAt(y, returning) {
    const stage = stageAt(y), intensity = [0.10, 0.28, 0.48, 0.71, 0.94][stage];
    return { stage: stage, intensity: Math.min(1, intensity + (returning ? .10 : 0)),
      windScale: [0.16, 0.38, 0.70, 1.05, 1.40][stage] * (returning ? 1.12 : 1) };
  }
  function stormOf(mask, y, returning) {
    return weatherAt(y == null ? HOLDS[0].y : y, returning).intensity;
  }

  function wind(t, y, mask, returning) {
    if (!windEnabled) return 0;
    const weather = weatherAt(y, returning);
    const swell = Math.sin(t * 0.23 + y * 0.01) * .55;
    const gust = Math.sin(t * 0.7 + y * 0.015 + 1.1) * .45;
    return (swell + gust) * weather.windScale * params(mask).windMul;
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
  let solid = null;
  function solidWorld() {
    if (!solid) {
      const factory = typeof module !== "undefined" && module.exports ? require("./surface.js") : globalThis.FXSurface;
      solid = factory.create({ buildCliffMesh: buildCliffMesh, faceZ: faceZ, top: SUMMIT_Y });
    }
    return solid;
  }
  function surfaceZ(x, y) { return solidWorld().surfaceZ(x, y); }
  const BODY = { torso: .53, upperArm: .36, forearm: .34, thigh: .42, shin: .41 };
  const KIP = [
    [0,-.675,.17,.05,0,.07],[.24,-.630,.29,.33,.02,.08],
    [.49,-.510,.47,.72,.02,.10],[.65,-.405,.40,.36,-.95,1.20],
    [.79,-.150,.40,.07,-.60,.95],[.97,.290,.34,.32,-.20,.70],
    [1.12,.470,.28,.27,-.17,.58],[1.27,-.120,.37,.23,.20,.38],
    [1.39,-.470,.45,.50,.15,.16],[1.49,-.110,.37,.15,-.60,.95],
    [1.62,.330,.29,.30,-.18,.68],[1.82,.430,.26,.28,-.18,.58],
    [2.12,.470,.28,.27,-.17,.58],
  ];
  function sampleKip(phase) {
    let i=0; while(i<KIP.length-2 && phase>KIP[i+1][0])i++;
    const a=KIP[i],b=KIP[i+1],p=KIP[Math.max(0,i-1)],n=KIP[Math.min(KIP.length-1,i+2)];
    const span=b[0]-a[0],t=clamp((phase-a[0])/span,0,1),t2=t*t,t3=t2*t;
    return a.slice(1).map(function(v,j){const k=j+1,m0=i===0?0:(b[k]-p[k])/(b[0]-p[0]),m1=i===KIP.length-2?0:(n[k]-a[k])/(n[0]-a[0]);
      return (2*t3-3*t2+1)*v+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[k]+(t3-t2)*span*m1;});
  }
  function chargeFrame(mask,t,time,y,descending) {
    const w=weight01(mask),st=sampleRelease(mask,t,y);
    const phase=st.phase<=1.12?st.phase:1.12+(st.phase-1.12)%1;
    let sy,sz,theta,hipFlex,kneeFlex;
    if(descending){
      const active=Math.max(0,t-params(mask).preload),lean=smooth(active/.8);
      sy=mix(-.675,-.61,lean);sz=.17+.11*lean+.035*Math.sin(active*2.4)*lean;
      theta=.05+.10*lean;hipFlex=-.12*lean;kneeFlex=.07+.32*lean;
    }else{
      [sy,sz,theta,hipFlex,kneeFlex]=sampleKip(phase);
      const amplitude=mix(1,.84,w)*(.65+.35*st.charge),fade=1-smooth((phase-.6)/.2);
      const angle=Math.atan2(sz,-sy),radius=Math.hypot(sy,sz),scaled=mix(angle,.247+(angle-.247)*amplitude,fade);
      sy=-Math.cos(scaled)*radius;sz=Math.sin(scaled)*radius;theta*=mix(1,amplitude,fade);
    }
    const length=Math.hypot(sy,sz);if(length>.697){sy*=.697/length;sz*=.697/length;}
    return {sy:sy,sz:sz,theta:theta,hipFlex:hipFlex,kneeFlex:kneeFlex,phase:phase};
  }
  function launchBodyFor(s) {
    const h=HOLDS[s.holdIndex],p=chargeFrame(s.mask,s.holdT,s.time,h.y,s.descending);
    return {hipY:h.y+.035+p.sy-Math.cos(p.theta)*BODY.torso,
      hipZ:h.z+.035+p.sz+Math.sin(p.theta)*BODY.torso,
      theta:p.theta,hipFlex:p.hipFlex,kneeFlex:p.kneeFlex};
  }
  // Reaching is a continuous physical pose, not a yes/no predicted catch.
  // A trajectory can just miss a grip after brushing the rock. Its body must
  // release that reach smoothly instead of losing a large hip correction in
  // one tick. Blend nearby grips; a closest-target switch cannot move the root.
  function forecastBodyContact(s) {
    const origin=HOLDS[s.origin],t=Math.max(0,s.flightT||0),speed=Math.abs(s.vy||0);
    const band=clamp(speed*.20,.85,3.0),age=smooth(t/.08);
    let sum=0,none=1,anchorY=0,anchorZ=0,best=null,bestWeight=0,exact=null;
    for(const h of HOLDS){
      const d=Math.hypot(s.y-h.y,s.z-h.z);
      const radius=catchRadius(h,true,!!s.descending);
      if(d>=radius+band)continue;
      // A far sideways miss must not drag the whole body toward every lip it
      // passes. Within the real grab radius this factor is exactly one.
      let eligible=1-smooth((Math.abs(s.z-h.z)-radius)/.6);
      if(h.i===s.origin)eligible*=smooth((t-.16)/.18);
      if(h.i===s.origin||(origin&&h.y<origin.y-.25))eligible*=1-smooth(((s.vy||0)-.6)/3);
      const near=(1-smooth((d-radius)/band))*eligible*age,weight=near*near;
      if(weight<=1e-8)continue;
      none*=1-weight;
      // Odds weighting is continuous between neighbouring lips, and makes a
      // reachable grip dominate completely at contact instead of averaging it
      // with the next rock and shifting the body at the actual catch.
      if(weight>1-1e-8)exact={x:0,y:h.y+.035,z:h.z+.035};
      const odds=weight/Math.max(1e-8,1-weight);
      sum+=odds;anchorY+=(h.y+.035)*odds;anchorZ+=(h.z+.035)*odds;
      if(weight>bestWeight){bestWeight=weight;best={hold:h,index:h.i,eta:Math.max(0,d-radius)/Math.max(1,speed)};}
    }
    if(!best)return null;
    return {...best,weight:1-none,grip:exact||{x:0,y:anchorY/sum,z:anchorZ/sum},before:{y:s.y,z:s.z}};
  }
  const solvedBodies = new WeakMap();
  function bodyFrame(s) {
    const cached = solvedBodies.get(s);
    if (cached && cached.time === s.time && cached.flightT === s.flightT && cached.y === s.y && cached.z === s.z && cached.vy === s.vy && cached.vz === s.vz) return cached.frame;
    return freeBodyFrame(s);
  }
  function freeBodyFrame(s) {
    const t=Math.max(0,s.flightT||0),start=s.launchBody,down=!!s.downLaunch;
    const extend=smooth(t/(down?.40:.38)),fade=1-smooth(t/(down?.40:.38));
    const ascending=smooth(clamp((s.vy+1)/2,0,1));
    const pitch=mix(.12,clamp((s.vz||0)*.022,-.12,.26),ascending);
    let theta=start?mix(start.theta,pitch,extend):pitch;
    const dy=start?start.hipY-s.launchY:-.96,dz=start?start.hipZ-s.launchZ:.34;
    const targetY=down?-.96:-.43-Math.cos(theta)*BODY.torso+.60*clamp((s.vy||0)/5,-1,1);
    let hip={x:0,y:s.y+mix(targetY,dy,fade),z:s.z+mix(.33+Math.sin(theta)*BODY.torso,dz,fade)};
    let hipFlex=start?mix(start.hipFlex,.07,extend):.07;
    let kneeFlex=start?mix(start.kneeFlex,mix(.42,.22,ascending),extend):mix(.42,.22,ascending);
    let contact=null;
    const predicted=forecastBodyContact(s);
    if(predicted){
      const weight=predicted.weight,sy=-.43,grip=predicted.grip;
      const catchY=grip.y+sy-Math.cos(.20)*BODY.torso;
      const catchZ=grip.z+.33+Math.sin(.20)*BODY.torso;
      // A missed lip may be metres behind a fast-falling body. Bound the
      // preparatory trunk correction smoothly; arms can reach, but the body
      // must not stop in mid-air then whip back to its ballistic trajectory.
      const reachY=catchY-hip.y,reachZ=catchZ-hip.z;
      const reachScale=1/Math.sqrt(1+(reachY*reachY+reachZ*reachZ)/1.44);
      hip.y+=reachY*reachScale*weight;hip.z+=reachZ*reachScale*weight;
      theta=mix(theta,.20,weight);hipFlex=mix(hipFlex,0,weight);kneeFlex=mix(kneeFlex,.65,weight);
      contact={...predicted,weight:weight,sy:sy,grip:grip};
    }
    return {hip:hip,theta:theta,hipFlex:hipFlex,kneeFlex:kneeFlex,contact:contact};
  }
  function flightArms(s, frame) {
    const r=frame||bodyFrame(s),p=r.hip,up={y:Math.cos(r.theta),z:-Math.sin(r.theta)},back={y:Math.sin(r.theta),z:Math.cos(r.theta)},out={};
    const start=s.launchBody,origin=HOLDS[s.origin],extend=smooth((s.flightT||0)/.32);
    for(const side of ['L','R']){
      const sign=side==='L'?-1:1,sh={x:sign*.17,y:p.y+up.y*BODY.torso,z:p.z+up.z*BODY.torso};
      const ty=up.y*.43-back.y*.33,tz=up.z*.43-back.z*.33;
      let hand={x:sh.x+sign*.025,y:sh.y+ty,z:sh.z+tz};
      if(start&&origin){
        const fy=origin.y+.035-(start.hipY+Math.cos(start.theta)*BODY.torso),fz=origin.z+.035-(start.hipZ-Math.sin(start.theta)*BODY.torso);
        if(s.downLaunch){hand={x:sh.x,y:sh.y+fy,z:sh.z+fz};}
        else{
          const a0=Math.atan2(fy,-fz);let a1=Math.atan2(ty,-tz);
          while(a1-a0>Math.PI)a1-=Math.PI*2;while(a1-a0<-Math.PI)a1+=Math.PI*2;
          const angle=mix(a0,a1,extend),radius=mix(Math.hypot(fy,fz),Math.hypot(ty,tz),extend);
          hand={x:sh.x+sign*.025*extend,y:sh.y+Math.sin(angle)*radius,z:sh.z-Math.cos(angle)*radius};
        }
      }
      if(r.contact){
        const w=r.contact.weight;
        hand.x=mix(hand.x,sh.x,w);hand.y=mix(hand.y,sh.y-r.contact.sy,w);hand.z=mix(hand.z,sh.z-.33,w);
      }
      let dx=hand.x-sh.x,dy=hand.y-sh.y,dz=hand.z-sh.z,len=Math.hypot(dx,dy,dz);
      if(len>.697){dx*=.697/len;dy*=.697/len;dz*=.697/len;len=.697;hand={x:sh.x+dx,y:sh.y+dy,z:sh.z+dz};}
      const d=Math.max(.020001,len),ax=dx/d,ay=dy/d,az=dz/d,along=(BODY.upperArm**2-BODY.forearm**2+d*d)/(2*d),lift=Math.sqrt(Math.max(0,BODY.upperArm**2-along*along));
      const dot=sign*.55*ax+.42*az;let px=sign*.55-ax*dot,py=-ay*dot,pz=.42-az*dot,pl=Math.hypot(px,py,pz)||1;
      const elbow={x:sh.x+ax*along+px/pl*lift,y:sh.y+ay*along+py/pl*lift,z:sh.z+az*along+pz/pl*lift};
      out['sh'+side]=sh;out['elbow'+side]=elbow;out['hand'+side]=hand;
    }
    return out;
  }
  function bodyCapsules(s,frame) {
    const r=frame||bodyFrame(s),p=r.hip,up={y:Math.cos(r.theta),z:-Math.sin(r.theta)},back={y:Math.sin(r.theta),z:Math.cos(r.theta)};
    const point=(x,y,z)=>({x:x,y:p.y+up.y*y+back.y*z,z:p.z+up.z*y+back.z*z});
    const shoulder=point(0,BODY.torso,0),head=point(0,BODY.torso+.23,-.02),parts=[];
    const add=(a,b,radius,kind)=>parts.push({a:a,b:b,r:radius,kind:kind});
    add(point(0,0,0),shoulder,.15,'torso');add(point(0,.75,-.02),point(0,.78,-.02),.145,'head');
    add(point(0,.205,.207),point(0,.425,.207),mix(.16,.195,weight01(s.mask)),'pack');
    const arms=flightArms(s,r);
    for(const sign of [-1,1]){
      const pelvis=point(sign*.105,0,0),a=r.theta+r.hipFlex+(sign>0?-.035:0),b=a+Math.max(.04,r.kneeFlex);
      const knee={x:pelvis.x,y:pelvis.y-Math.cos(a)*BODY.thigh,z:pelvis.z+Math.sin(a)*BODY.thigh};
      const foot={x:pelvis.x,y:knee.y-Math.cos(b)*BODY.shin,z:knee.z+Math.sin(b)*BODY.shin};
      add(pelvis,knee,.120,'thigh');add(knee,foot,.091,'shin');
      const boot=(z)=>({x:foot.x,y:foot.y-Math.cos(b)*.035+Math.sin(b)*z,z:foot.z+Math.sin(b)*.035+Math.cos(b)*z});
      add(boot(-.13),boot(.035),.085,'boot');
      const side=sign<0?'L':'R',sh=arms['sh'+side],elbow=arms['elbow'+side],hand=arms['hand'+side];
      add(sh,elbow,.094,'upperArm');
      const cuff={x:mix(elbow.x,hand.x,.86),y:mix(elbow.y,hand.y,.86),z:mix(elbow.z,hand.z,.86)};
      add(elbow,cuff,.080,'forearm');
    }
    return parts;
  }
  function resolveBody(s) {
    if (s.attached) return false;
    // Articulate once, then translate the whole volume. Re-forecasting a catch
    // during projection would pull the wrists back into the same rock.
    const world = solidWorld(), frame = freeBodyFrame(s), parts = bodyCapsules(s, frame);
    let push = 0, contactY = s.y;
    for (const part of parts) {
      const n = Math.max(1, Math.ceil(Math.hypot(part.b.y-part.a.y,part.b.z-part.a.z)/.075));
      for (let i = 0; i <= n; i++) {
        const t = i/n, y = mix(part.a.y,part.b.y,t), z = mix(part.a.z,part.b.z,t);
        // A 6mm skin covers the curved intervals between section samples.
        for (const off of [-.94,-.70,0,.70,.94]) {
          const cy = y + off*part.r, depth = world.envelopeZ(cy) + part.r*Math.sqrt(1-off*off) + .006 - z;
          if (depth > push) { push = depth; contactY = cy; }
        }
      }
    }
    if (push > 0) {
      s.z += push+.002; frame.hip.z += push+.002;
      // This is an actively driven climbing pose. Projection constrains the
      // actual displacement, while vz/vy retain the intended launch effort.
      // A sleeve grazing the departure lip must not erase inward drive for the
      // rest of the jump once the body has cleared that lip.
      s.shake=Math.max(s.shake||0,Math.min(.22,push*.4));
    }
    solvedBodies.set(s, { frame: frame, time: s.time, flightT: s.flightT, y:s.y, z:s.z, vy:s.vy, vz:s.vz });
    return push > 0;
  }

  function sampleRelease(mask, t, y) {
    const p = params(mask);
    const active = Math.max(0, t - p.preload);
    const charge = clamp(p.chargeRate * active, 0, 1);
    const A = p.amp * smooth(charge);
    const angle = Math.sin(p.omega * active) * A;
    const aim = clamp(angle * p.aimScale, -1.25, 1.25);
    // Drive peaks as the body comes over the grip. A mistimed release loses
    // useful lift; later exposed sections require a more precise turnover.
    const strokeWidth = [1.65, 1.40, 1.18, .90, .78][stageAt(y == null ? HOLDS[0].y : y)];
    const efficiency = .34 + .66 * Math.exp(-Math.pow(Math.sin(p.omega * active) / strokeWidth, 2));
    const speed = p.maxSpeed * (0.34 + 0.66 * smooth(charge)) * efficiency;
    return {
      charge: charge,
      angle: angle,
      aim: aim,
      speed: speed,
      vy: Math.cos(aim) * speed,
      vz: Math.sin(aim) * speed,
      offY: -Math.cos(angle) * L,
      offZ: Math.sin(angle) * L,
      phase: p.omega * active / Math.PI,
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

  function catchRadius(target, holding, descending) {
    let reach = holding ? CATCH_HOLD : CATCH;
    if (descending) reach *= .94;
    else if (target) reach *= [1, .91, .80, .70, .60][stageAt(target.y - .02)];
    if (target && isRest(target.k)) reach += 0.16;
    if (target && target.k === "summit") reach += 0.28;
    return reach;
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
      downLaunch: false,
      launchBody: null,
      launchY: h.y - L,
      launchZ: h.z,
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
      stormVis: weatherAt(h.y, false).intensity,
      lost: [],
      reclaimed: 0,
      crown: false,
      descending: false,
      returning: false,
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
    const st = sampleRelease(mask, holdT, y);
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

  // Live motion and the optional guide use the same volume-aware integrator.
  function integrateFlight(s, dt) {
    const speed = Math.hypot(s.vz, s.vy);
    const count = Math.max(1, Math.ceil(speed * dt / .075));
    const sub = dt / count;
    for (let i = 0; i < count; i++) {
      s.vz += wind(s.time, s.y, s.mask, !!(s.returning || s.descending)) * sub;
      s.vy -= grav(s.mask) * sub;
      s.vz *= Math.max(0, 1 - DRAG * sub);
      s.vy *= Math.max(0, 1 - DRAG * sub);
      const origin = HOLDS[s.origin];
      const missedDown = !s.downLaunch || !origin || s.y < origin.y - 5.2;
      if (s.vy < 0 && missedDown) {
        const contact = faceZ(s.y) + BODY_R + .12;
        const exposure = clamp(((origin ? origin.y : s.y) - 40) / Math.max(40, SUMMIT_Y - 40), 0, 1);
        s.vz += (clamp((contact - s.z) * mix(8, 7.2, exposure), -48, 48) - s.vz * 5) * sub;
        if (s.z <= contact + .5) s.vy = Math.max(s.vy, -14.5);
      }
      s.z += s.vz * sub;
      s.y += s.vy * sub;
      resolveBody(s);
    }
    return speed;
  }

  function sampleDown(mask, t, hold, time) {
    const p = params(mask), active = Math.max(0, t - p.preload);
    const charge = clamp(active * .9, 0, 1), phase = active * 2.4;
    const offY = -.62 - .12 * smooth(charge), offZ = .16 + .12 * Math.sin(phase);
    const vy = -(1.4 + 3.2 * smooth(charge));
    const target = lowerHold(hold);
    const gap = target ? Math.max(.2, hold.y + offY - target.y) : 4;
    const g = grav(mask), flight = (vy + Math.sqrt(vy * vy + 2 * g * gap)) / g;
    const aim = .70 * Math.sin(phase - 1.3);
    const vz = target ? (target.z - hold.z - offZ + aim) / Math.max(.18, flight) : 0;
    return { charge: charge, angle: .10 + .10 * Math.sin(phase), aim: aim,
      speed: Math.hypot(vy, vz), vy: vy, vz: vz, offY: offY, offZ: offZ, phase: phase / Math.PI };
  }
  function releaseSample(s, t) {
    const h = HOLDS[s.holdIndex];
    t = t == null ? s.holdT : t;
    return s.descending ? sampleDown(s.mask, t, h, s.time) : swung(s.mask, t, s.time, h.y);
  }
  function arcMin(mask, holdT, hold, target, time, downOk, returning) {
    const ghost = { mask: mask, holdT: holdT, holdIndex: hold.i, origin: hold.i,
      time: time, descending: !!downOk, returning: !!returning, attached: false,
      downLaunch: !!downOk, flightT: 0, holding: false, shake: 0 };
    const st = releaseSample(ghost);
    ghost.launchBody = launchBodyFor(ghost);
    ghost.y = ghost.launchY = hold.y + st.offY;
    ghost.z = ghost.launchZ = hold.z + st.offZ;
    ghost.vy = st.vy; ghost.vz = st.vz;
    let minD = 1e9;
    const dots = [], dt = 1 / 120;
    for (let i = 0; i < 168; i++) {
      ghost.time += dt; ghost.flightT += dt;
      const oldY = ghost.y, oldZ = ghost.z;
      integrateFlight(ghost, dt);
      if (i % 12 === 0) dots.push({ y: ghost.y, z: ghost.z });
      if (target) {
        const dy = ghost.y - oldY, dz = ghost.z - oldZ;
        const f = clamp(((target.y-oldY)*dy+(target.z-oldZ)*dz)/(dy*dy+dz*dz||1),0,1);
        minD = Math.min(minD, Math.hypot(oldY+f*dy-target.y,oldZ+f*dz-target.z));
      }
      if (ghost.vy < 0 && ghost.y < (target ? target.y : hold.y) - 1.5) break;
    }
    return { minD: minD, dots: dots, st: st };
  }
  const guideTimes = new WeakMap();
  function updateGuide(s) {
    if (s.mode !== "play" || !s.attached || !s.holding || s.holdT <= .12 || s.crown) {
      s.armed = false; s.dots = []; s.aimD = 99; guideTimes.delete(s); return false;
    }
    const previous = guideTimes.get(s);
    if (previous != null && s.time >= previous && s.time - previous < .05) return false;
    guideTimes.set(s, s.time);
    const h = HOLDS[s.holdIndex], target = s.descending ? lowerHold(h) : HOLDS[nextIndex(s.holdIndex)];
    if (!target) return false;
    const hit = arcMin(s.mask, s.holdT, h, target, s.time, s.descending, s.returning);
    const was = s.armed;
    s.dots = hit.dots; s.aimD = hit.minD;
    s.armed = hit.minD < catchRadius(target, false, s.descending);
    return s.armed && !was;
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
    s.needUp = true;
    s.lock = .08;
    s.vy = 0;
    s.vz = 0;
    s.flightT = 0;
    s.downLaunch = false;
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
    } else if (!s.descending && isRest(h.k) && hasItems(s.mask) && (s.restSeen & (1 << index)) === 0) {
      s.crown = false;
      beginLedge(s);
    } else {
      s.crown = false;
      s.mode = "play";
    }
    tryPickup(s);
    if (s.y > s.bestRun) s.bestRun = s.y;
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

  function launch(s) {
    const h = HOLDS[s.holdIndex], st = releaseSample(s);
    s.launchBody = launchBodyFor(s);
    s.attached = false;
    s.y = s.launchY = h.y + st.offY;
    s.z = s.launchZ = h.z + st.offZ;
    s.vy = st.vy; s.vz = st.vz; s.angle = st.angle;
    s.downLaunch = !!s.descending;
    s.crown = false;
    s.flightT = 0; s.origin = s.holdIndex; s.nearDone = false;
    s.launches += 1; s.holdT = 0; s.mode = "play"; s.slip = 0;
    resolveBody(s);
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
    if (s.descending && s.returning && s.lost.length === 0) {
      s.descending = false; s.needUp = true; s.holdT = 0;
      s.prevHolding = false; s.holding = false; s.lock = .2;
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
    s.prevHolding = false;
    s.holding = false;
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
    s.downLaunch = false;
    s.launchBody = null;
    s.launchY = h.y - L;
    s.launchZ = h.z;
    s.returning = false;
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
      s.stormVis = weatherAt(h.y, false).intensity;
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
    const stormTarget = stormOf(s.mask, s.attached ? HOLDS[s.holdIndex].y : s.y, s.returning || s.descending);
    if (s.attached) s.settle = Math.min(1, s.settle + dt / params(s.mask).settleDuration);
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
        s.crown = false;
        s.descending = true;
        s.returning = true;
        s.needUp = true;
        s.attached = true;
        s.holdIndex = h.i;
        s.origin = h.i;
        s.holdT = 0;
        s.settle = .15;
        s.vy = 0;
        s.vz = 0;
        s.angle = 0;
        s.y = h.y - L;
        s.z = h.z;
        s.lock = .86;
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
        keepItem(s);
        holding = false;
      }
      s.prevHolding = holding;
      s.holding = holding;
      return s;
    }

    if (s.mode === "ledge") {
      // Explicit menu choices must work even while another input is held.
      // Releasing the catch gesture alone never chooses what to leave behind.
      if (input.dropKind) dropItem(s, input.dropKind);
      else if (input.keep) keepItem(s);
      else if (!holding) s.seenRelease = true;
      const h = HOLDS[s.holdIndex];
      s.y = h.y - mix(.42, L, s.settle);
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
    const locked = s.lock > 0;
    s.lock = Math.max(0, s.lock - dt);
    if (s.needUp) {
      if (!input.holding) s.needUp = false;
      holding = false;
      released = false;
    } else if (locked) {
      holding = false;
      released = false;
    }
    s.holding = holding;
    if (s.attached) {
      const h = HOLDS[s.holdIndex], heavy = weight01(s.mask);
      const rope = mix(.42, L, s.settle);
      tryPickup(s);
      if (s.crown && !s.descending) {
        if (holding && s.settle > .9) s.holdT += dt;
        else {
          if (released && s.holdT > .05 && s.settle > .9) beginEnding(s);
          s.holdT = 0;
        }
        s.y = h.y + .22; s.z = h.z; s.angle = 0;
        s.armed = false; s.dots = [];
      } else if (holding && s.settle > .9) {
        s.holdT += dt;
        const st = releaseSample(s);
        s.angle = st.angle; s.y = h.y + st.offY; s.z = h.z + st.offZ;
      } else {
        if (released && s.holdT > .16 && s.settle > .9) launch(s);
        s.holdT = 0; s.armed = false; s.dots = [];
        if (s.attached) {
          const idle = Math.sin(s.time * (1.05 + heavy * .7)) * params(s.mask).sway * s.settle;
          placeOnRope(s, h, idle, rope);
        }
      }
    } else {
      s.flightT += dt;
      s.armed = false;
      const oldY = s.y, oldZ = s.z;
      const sp = integrateFlight(s, dt);
      if (sp > 0.8) s.angle = Math.atan2(-s.vz, s.vy);
      if (s.crown && s.vy > -2 && Math.hypot(s.z - GATE.z, s.y - GATE.y) < 1.05) {
        beginEnding(s);
      }

      let caught = -1;
      let bestD = 1e9;
      const reaching = holding && s.flightT > 0.14;
      const origin = HOLDS[s.origin];
      for (let i = 0; i < HOLDS.length; i++) {
        if (i === s.origin && s.flightT < 0.34) continue;
        const hd = HOLDS[i];
        // Still rising: the hold you came from, and anything below it, is not a catch.
        if (s.vy > 0.6 && (i === s.origin || hd.y < origin.y - 0.25)) continue;
        const r = catchRadius(hd, reaching, s.descending && s.vy < 0);
        // Sweep the frame segment so a reachable hold cannot be skipped by
        // a fast fall between physics samples.
        const dy = s.y - oldY, dz = s.z - oldZ;
        const f = clamp(((hd.y - oldY) * dy + (hd.z - oldZ) * dz) / (dy * dy + dz * dz || 1), 0, 1);
        const d = Math.hypot(oldZ + dz * f - hd.z, oldY + dy * f - hd.y);
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
      const need = catchRadius(n, false, false);
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

  // Greedy smoke-test player, not a proof of reachability or human difficulty.
  function simulate(options) {
    options = options || {};
    const s = createState();
    s.mask = options.mask != null ? options.mask : 15;
    s.intro = 0;
    s.settle = 1;
    const dt = 1 / 100;
    let guard = 0;
    let stuck = 0;
    let lastIndex = 0;
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
        if (s.settle > 0.9 && s.holdT > 0.3 && preview.minD < catchRadius(HOLDS[ni], false, false)) {
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

  function catchNeed(descending, target) {
    return catchRadius(target, false, descending);
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
      if (s.mode === "ending" && gotBit(s, bit)) break;
      if (s.falls > 3) break;
      const input = { holding: false, freezeIntro: true };
      const got = (s.reclaimed & bit) !== 0;
      if (s.mode === "ending") {
        input.retrieve = true;
      } else if (s.mode === "ledge") {
        if (!got && (s.mask & bit)) input.dropKind = kind;
        else input.keep = true;
      } else if (s.mode === "drop" || s.mode === "impact" || s.needUp || s.lock > 0) {
        input.holding = false;
      } else if (!s.attached) {
        input.holding = true;
      } else if (s.crown) {
        input.choice = "door";
      } else if (s.descending && !got) {
        const here = HOLDS[s.holdIndex];
        const target = lowerHold(here);
        if (!target) break;
        const beat = s.holdT > .2;
        const hit = arcMin(s.mask, Math.max(0.2, s.holdT), here, target, s.time, true, true);
        const need = catchRadius(target, false, true);
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
    catchRadius: catchRadius,
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
    sampleDown: sampleDown,
    releaseSample: releaseSample,
    stageAt: stageAt,
    weatherAt: weatherAt,
    chargeFrame: chargeFrame,
    bodyFrame: bodyFrame,
    flightArms: flightArms,
    bodyCapsules: bodyCapsules,
    surfaceZ: surfaceZ,
    updateGuide: updateGuide,
    faceX: faceX,
    radii: radii,
    createState: createState,
    step: step,
    arcMin: arcMin,
    integrateFlight: integrateFlight,
    reachCheck: reachCheck,
    isRest: isRest,
    simulateReturn: simulateReturn,
    simulate: function (options) {
      options = options || {};
      const saved = windEnabled;
      windEnabled = !options.noWind;
      try { return simulate(options); }
      finally { windEnabled = saved; }
    },
    wipePosition: wipePosition,
  };
});
