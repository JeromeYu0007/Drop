/* Production skeleton/terrain regressions. These check occupied body volume,
 * real release input and station transitions without a GPU or screenshot mock. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FX = require("../game.js");
const Pilot = require("./pilot.js");

const context = { window: { THREE: require("../vendor/three.min.js"), Fangxia: FX }, console, Math, Float32Array, Uint32Array };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../render.js"), "utf8"), context, { filename: "render.js" });
const Render = context.window.FXRender;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (a, b, label, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);
let samples = 0, poses = 0, deepest = { depth: -Infinity };

function skeleton(p, label) {
  for (const side of ["L", "R"]) {
    for (const [a, b, length] of [
      ["sh", "elbow", .36], ["elbow", "hand", .34],
      ["pelvis", "knee", .42], ["knee", "foot", .41],
    ]) close(distance(p[a + side], p[b + side]), length, `${label} ${a}/${b}${side}`, .00001);
    for (const key of ["sh", "elbow", "hand", "pelvis", "knee", "foot"]) {
      for (const axis of ["x", "y", "z"]) assert.ok(Number.isFinite(p[key + side][axis]), `${label} ${key}${side}.${axis}`);
    }
  }
  close(distance(p.hip, p.shoulder), .53, `${label} torso`);
  poses++;
}

function clearTerrain(p, label) {
  // Inspect sphere cross-sections as well as the centre line: a thigh can
  // overlap the top of a sharp rock while its zero-radius joint is outside.
  const offsets = [[0, 0], [.7, 0], [-.7, 0], [0, .7], [0, -.7], [.5, .5], [.5, -.5], [-.5, .5], [-.5, -.5]];
  for (const point of Render.visualCapsuleSamples(p, .045)) {
    for (const [dx, dy] of offsets) {
      const x = point.x + dx * point.radius, y = point.y + dy * point.radius;
      const front = point.z - point.radius * Math.sqrt(1 - dx * dx - dy * dy);
      const depth = FX.surfaceZ(x, y) - front;
      if (depth > deepest.depth) deepest = { depth, label, part: point.name, x, y, front };
      assert.ok(depth < .008, `${label}: ${point.name} penetrated rendered cliff ${(depth * 100).toFixed(2)}cm at y=${y.toFixed(3)}`);
      samples++;
    }
  }
}

function livePose(s, label, terrain = true) {
  const before = structuredClone(s), p = Render.updatePose(s);
  assert.deepEqual(s, before, `${label}: renderer mutated gameplay`);
  skeleton(p, label);
  if (!s.attached) {
    const frame = FX.bodyFrame(s), arms = FX.flightArms(s, frame);
    assert.ok(distance(p.hip, frame.hip) < 1e-9, `${label}: rendered root differs from physical root`);
    close(p.theta, frame.theta, `${label} physical pitch`);
    for (const side of ["L", "R"]) {
      for (const key of ["sh", "elbow", "hand"]) assert.ok(distance(p[key + side], arms[key + side]) < 1e-9, `${label}: ${key}${side} differs from physical arm`);
    }
  }
  if (terrain) clearTerrain(p, label);
  return p;
}

function attachedAndStations() {
  for (const mask of [0, 15]) {
    for (const h of FX.HOLDS) {
      if (h.k === "summit") continue;
      const s = Pilot.fresh(mask, h.i);
      // Sweep the hollow/compression and turnover extrema for both weights;
      // identical clock times miss the heavy pack's delayed knee drive.
      const params=FX.params(mask);
      const phases=[0,.22,.34,.46,.52,.58,.635,.69,.745,.80,.88,.96,1.04,1.12,1.24,1.37,1.425,1.48,1.55,1.62,1.84];
      const times=[0,...phases.map(p=>params.preload+p*Math.PI/params.omega)];
      for (const t of times) {
        s.holding = t > 0; s.holdT = t;
        const p = Render.computePose(s);
        skeleton(p, `attached/${mask}/${h.i}/${t}`);
        clearTerrain(p, `attached/${mask}/${h.i}/${t}`);
        for (const side of ["L", "R"]) {
          close(p["hand" + side].y, h.y + .035, "fixed grip y");
          close(p["hand" + side].z, h.z + .035, "fixed grip z");
        }
      }
    }
  }
  for (const h of FX.HOLDS.filter(h => FX.ITEMS[h.k])) {
    const s = Pilot.fresh(15, h.i);
    s.mode = "ledge"; s.lock = 0;
    Render.resetPoseHistory();
    let previous = livePose(s, `rest/${h.k}`);
    for (let i = 0; i < 360; i++) {
      Pilot.tick(s, i === 20 ? { dropKind: h.k } : { holding: false });
      const p = livePose(s, `rest/${h.k}/${i}`);
      assert.equal(p.standing, false, `${h.k}: a tiny rock lip is not a standing platform`);
      assert.ok(p.hip.y < h.y - .75, `${h.k}: drop prompt lifted the body onto the hold`);
      assert.ok(distance(previous.hip, p.hip) < .025, `${h.k}: drop transition popped the pelvis`);
      for (const side of ["L", "R"]) {
        close(p["hand" + side].y, h.y + .035, `${h.k} attached wrist y`);
        close(p["hand" + side].z, h.z + .035, `${h.k} attached wrist z`);
      }
      previous = p;
    }
    assert.equal(s.mode, "play", `${h.k}: discard did not complete`);
    assert.equal(s.mask & FX.ITEMS[h.k].bit, 0, `${h.k}: item was not discarded`);
  }
}

function inertialFlight() {
  // A nearby grip, falling velocity, or reach input may alter an arm pose but
  // must never pull the body's centre away from its released trajectory.
  for(const mask of [0,15])for(const from of [8,23,43]){
    const s=Pilot.fresh(mask,from),h=FX.HOLDS[from];
    s.attached=false;s.launchY=h.y-1.1;s.launchZ=h.z+.2;
    s.launchBody={hipY:h.y-.12,hipZ:h.z+.49,theta:.32,hipFlex:-.18,kneeFlex:.55};
    for(const t of [0,.08,.22,.6,1.2])for(const vy of [12,0,-12])for(const holding of [false,true]){
      s.flightT=t;s.time=t;s.y=h.y+vy*t;s.z=h.z+.15;s.vy=vy;s.vz=-.5;s.holding=holding;s.grabT=holding?.10:-1;
      const p=FX.bodyFrame(s);
      close(p.hip.y-s.y,s.launchBody.hipY-s.launchY,"airborne pelvis retains release y offset");
      close(p.hip.z-s.z,s.launchBody.hipZ-s.launchZ,"airborne pelvis retains release z offset");
      skeleton(Render.computePose(s),`inertia/${mask}/${from}/${t}/${vy}/${holding}`);
    }
  }
}

function realFlights() {
  const fixtures = [];
  for (const from of [8, 14, 23, 43]) {
    for (const mask of [0, 15]) {
      for (const release of [.65, 1.2, 1.65, 2.2]) fixtures.push({ from, mask, release });
    }
  }
  for (const from of [14, 43, FX.HOLDS.length - 1]) {
    for (const mask of [0, 15]) {
      for (const release of [.45, 1.4]) fixtures.push({ from, mask, release, down: true });
    }
  }
  for (const { from, mask, release, down } of fixtures) {
    const s = Pilot.fresh(mask, from);
    if (down) { s.descending = true; s.returning = true; s.crown = false; }
    Render.resetPoseHistory();
    livePose(s, `start/${from}/${mask}`);
    let flightFrames = 0;
    const result = Pilot.execute(s, release, () => {
      if (s.mode === "impact") return;
      livePose(s, `flight/${down ? "down" : "up"}/${from}/${mask}/${release}/${s.flightT.toFixed(3)}`);
      if (!s.attached) flightFrames++;
    });
    assert.ok(result.launched && flightFrames > 0, `fixture ${from}/${mask}/${release} did not exercise flight`);
  }
}

function summitAndReturn() {
  const h = FX.HOLDS.at(-1);
  for (const mask of [0, 15]) {
    // A real arriving pose is different from an already standing fixture.
    // Follow the capture through the whole mantle, including wrist release.
    const arrival=Pilot.fresh(mask,h.i-1),schedule=Pilot.plan(arrival,1);
    assert.ok(schedule,"summit must have a real hold/release schedule");
    assert.equal(schedule.grabAt,Infinity,"summit arrival must not need a hidden second press");
    Render.resetPoseHistory();
    const result=Pilot.execute(arrival,schedule,()=>livePose(arrival,`summit approach/${mask}`));
    assert.ok(result.landed&&arrival.holdIndex===h.i,"summit approach did not catch the lip");
    for(let i=0;i<150;i++){
      Pilot.tick(arrival,{holding:false});livePose(arrival,`real summit mantle/${mask}/${i}`);
    }
    const s = Pilot.fresh(mask, h.i);
    s.mode = "ending";
    s.lost = [{ kind: "trophy", bit: FX.ITEMS.trophy.bit, hold: 8, y: FX.HOLDS[8].y, z: FX.HOLDS[8].z }];
    Render.resetPoseHistory();
    let p = livePose(s, `summit/${mask}`);
    assert.equal(p.standing, true);
    // A summit mantle has a real platform; inspect its entire swept pose too.
    for (let i = 0; i <= 150; i++) {
      const mantleState = { ...s, time: i / 120 };
      const mantle = Render.computePose(mantleState, { mantle: { time: 0, pose: null, sy: -.43 } });
      skeleton(mantle, `summit mantle/${mask}/${i}`);
      clearTerrain(mantle, `summit mantle/${mask}/${i}`);
    }
    for (const side of ["L", "R"]) {
      close(p["bootAngle" + side], 0, "grounded boots lie flat");
      const sole = p["foot" + side].y - .0875;
      assert.ok(sole >= h.y + .125 && sole <= h.y + .145, "summit boot sole misses the threshold");
    }
    Pilot.tick(s, { retrieve: true });
    assert.equal(s.descending, true, "ending's return choice must select the down curve");
    assert.equal(s.crown, false, "return choice must leave standing mode");
    for (let i = 0; i < 120; i++) {
      const next = livePose(s, `return/${mask}/${i}`);
      assert.ok(distance(p.hip, next.hip) < .065, "standing-to-hanging return teleported the hips");
      if (i < 95) assert.equal(s.launches, 0, "return transition launched without a release");
      p = next;
      Pilot.tick(s, { holding: false });
    }
    assert.equal(s.attached, true, "return must wait for a new deliberate release");
    assert.ok(p.hip.y < h.y - .75, "return did not settle to the hanging pose");
  }
}

for (const name of ["surfaceZ", "chargeFrame", "bodyFrame", "flightArms"]) assert.equal(typeof FX[name], "function", `${name} must be a shared physics/render API`);
attachedAndStations();
inertialFlight();
realFlights();
summitAndReturn();
console.log(`Body pose: ${poses} poses, ${samples} volume samples; maximum penetration ${Math.max(0, deepest.depth * 100).toFixed(2)}cm (${deepest.part}).`);
