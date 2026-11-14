/* Geometric regressions for the actual renderer's skeletal pose.
 * No WebGL/DOM dependency: evaluate the production renderer with its real
 * three.js math library, then exercise the exported pure pose computation.
 * These checks supplement side-view/video inspection; they do not score beauty. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FX = require("../game.js");
const Pilot = require("./pilot.js");

function rendererPose() {
  const THREE = require("../vendor/three.min.js");
  const context = { window: { THREE, Fangxia: FX }, console, Math, Float32Array, Uint32Array, structuredClone };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../render.js"), "utf8"), context, { filename: "render.js" });
  const renderer = context.window.FXRender;
  assert.equal(typeof renderer.computePose, "function", "renderer must expose the pose used by drawClimber");
  return renderer;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = pose => Math.atan2(pose.shoulder.z - pose.hip.z, pose.shoulder.y - pose.hip.y);
const JOINTS = ["hip", "shoulder", "chest", "head", "shL", "shR", "handL", "handR", "elbowL", "elbowR", "pelvisL", "pelvisR", "kneeL", "kneeR", "footL", "footR"];

function withoutMutation(fn, state, ...args) {
  const before = structuredClone(state);
  const result = fn(state, ...args);
  assert.deepEqual(state, before, "render pose/forecast mutated live gameplay state");
  return result;
}

function forecastPurity(renderer) {
  const at = Math.floor(FX.HOLDS.length / 2), h = FX.HOLDS[at];
  const s = Pilot.fresh(11, at + 2);
  s.attached = false;
  s.y = h.y + 0.7;
  s.z = h.z;
  s.vy = -5;
  s.vz = 0;
  s.flightT = 0.5;
  s.sfx = ["sentinel"];
  s.restSeen = 0x010202;
  s.dots = [{ y: h.y, z: h.z }];
  s.lost = [{ kind: "trophy", bit: 4, hold: at, y: h.y + 0.2, z: h.z + 0.22 }];
  renderer.resetPoseHistory();
  // A forecast that accidentally used step() on a shallow copy could catch this
  // exact hold and splice the shared lost-item list. The visual prediction must
  // leave inventory, effects, rest visitation and every other live field intact.
  for (let i = 0; i < 3; i++) {
    withoutMutation(renderer.computePose, s);
    withoutMutation(renderer.updatePose, s);
  }
}

function finitePose(pose, label) {
  for (const key of JOINTS) {
    assert.ok(pose[key], `${label}: missing joint ${key}`);
    for (const axis of ["x", "y", "z"]) assert.ok(Number.isFinite(pose[key][axis]), `${label}: ${key}.${axis} is not finite`);
  }
}

function lengths(pose, dims, label) {
  for (const side of ["L", "R"]) {
    for (const [a, b, length] of [
      ["sh" + side, "elbow" + side, dims.upperArm],
      ["elbow" + side, "hand" + side, dims.forearm],
      ["pelvis" + side, "knee" + side, dims.thigh],
      ["knee" + side, "foot" + side, dims.shin],
    ]) assert.ok(Math.abs(distance(pose[a], pose[b]) - length) < 0.002,
      `${label}: ${a}–${b} changed length to ${distance(pose[a], pose[b]).toFixed(5)}m; expected ${length}`);
  }
  if (dims.torso) assert.ok(Math.abs(distance(pose.hip, pose.shoulder) - dims.torso) < 0.002, `${label}: torso changed length`);
}

// The component of a bent joint away from its endpoint chord. Near-horizontal
// chains cannot express a meaningful ±z pole, so inspect their other phases.
function bendOffsetZ(a, joint, b, minimumVertical = 0.3) {
  const dy = b.y - a.y, dz = b.z - a.z, d2 = dy * dy + dz * dz;
  if (d2 < 1e-8 || Math.abs(dy) / Math.sqrt(d2) < minimumVertical) return null;
  const t = ((joint.y - a.y) * dy + (joint.z - a.z) * dz) / d2;
  return joint.z - (a.z + t * dz);
}

function bendDirections(pose, label) {
  let checked = 0;
  for (const side of ["L", "R"]) {
    const shoulder = pose["sh" + side], elbow = pose["elbow" + side], hand = pose["hand" + side];
    // The wrist and elbow must stay on the exposed side of the grip plane.
    // Near-horizontal turnover is not a meaningful world-z bend test.
    assert.ok(elbow.z >= hand.z - 0.003, `${label}: elbow ${side} crossed inside its gripping hand`);
    const arm = bendOffsetZ(shoulder, elbow, hand, 0.6);
    if (arm !== null) {
      assert.ok(arm >= -0.003, `${label}: elbow ${side} bends through the wall (${arm.toFixed(4)}m)`);
      checked++;
    }
    const pole = pose.poles && pose.poles["elbow" + side];
    if (pole) {
      const axes = ["x", "y", "z"], chord = axes.map(k => hand[k] - shoulder[k]);
      const norm = chord.reduce((v, n) => v + n * n, 0);
      const projection = point => {
        const v = axes.map(k => point[k] - shoulder[k]);
        const along = v.reduce((sum, n, i) => sum + n * chord[i], 0) / norm;
        return v.map((n, i) => n - along * chord[i]);
      };
      const actual = projection(elbow), intended = projection(pole);
      assert.ok(actual.reduce((sum, n, i) => sum + n * intended[i], 0) >= -1e-7,
        `${label}: elbow ${side} flipped across its anatomical pole`);
      checked++;
    }
    const knee = bendOffsetZ(pose["pelvis" + side], pose["knee" + side], pose["foot" + side]);
    if (knee !== null) {
      assert.ok(knee <= 0.003, `${label}: knee ${side} bends backward (${knee.toFixed(4)}m)`);
      checked++;
    }
  }
  return checked;
}

function continuity(previous, next, maximum, label) {
  for (const joint of JOINTS) assert.ok(distance(previous[joint], next[joint]) <= maximum,
    `${label}: ${joint} moved ${distance(previous[joint], next[joint]).toFixed(4)}m; physical/pose budget ${maximum.toFixed(4)}m`);
}

function displacementChanges(previous, next, reference, history, limit, label) {
  const motion = {};
  for (const joint of JOINTS) {
    motion[joint] = { x: next[joint].x - previous[joint].x, y: next[joint].y - previous[joint].y, z: next[joint].z - previous[joint].z };
    if (history) {
      // Fast authored movement is valid. An abrupt *change* in movement that
      // cannot be explained by the physics marker is a visible pop. Keeping a
      // limb-speed ceiling instead would reject smooth release/landing poses.
      const extra = Math.hypot(...["x", "y", "z"].map(axis =>
        motion[joint][axis] - history.motion[joint][axis] - reference[axis] + history.reference[axis]));
      assert.ok(extra <= limit, `${label}: ${joint} unexplained displacement change ${extra.toFixed(4)}m exceeds ${limit.toFixed(4)}m`);
    }
  }
  return { motion, reference };
}

function actualTransitions(renderer, from, mask, stride, options = {}) {
  assert.equal(typeof renderer.updatePose, "function", "renderer must expose the stateful pose path actually used for drawing");
  renderer.resetPoseHistory();
  const s = Pilot.fresh(mask, from), dims = renderer.poseDimensions;
  s.descending = options.direction < 0;
  let previous = withoutMutation(renderer.updatePose, s), count = 0, caught = false, motionHistory = null;
  function frame(input) {
    const wasAttached = s.attached, previousMode = s.mode, previousY = s.y, previousZ = s.z;
    const previousSpeed = wasAttached ? 0 : Math.hypot(s.vy, s.vz);
    let physicalTravel = 0;
    for (let i = 0; i < stride; i++) {
      const y = s.y, z = s.z;
      Pilot.tick(s, input);
      physicalTravel += Math.hypot(s.y - y, s.z - z);
    }
    const next = withoutMutation(renderer.updatePose, s), label = `live ${120 / stride}Hz mask${mask}/from${from}/${options.direction < 0 ? "down" : options.release || "up"} frame${count} ${previousMode}→${s.mode}${!wasAttached && s.attached ? " catch" : ""}`;
    finitePose(next, label); lengths(next, dims, label);
    const catchFrame = !wasAttached && s.attached;
    const detachFrame = wasAttached && !s.attached;
    const stateTransition = previousMode !== s.mode || previous.standing !== next.standing;
    const physicalStep = Math.hypot(s.y - previousY, s.z - previousZ);
    const dt = stride * Pilot.DT;
    // A slow display can legitimately cover a metre of flight between frames.
    // On contact, budget physical travel from the previous velocity, not the
    // point-mass snap to its resting rope position. Mode changes get no such
    // snap allowance. The remaining budget is an animated limb/root movement.
    const details = `${label} [marker net ${physicalStep.toFixed(4)}m/path ${physicalTravel.toFixed(4)}m, prior speed ${previousSpeed.toFixed(2)}m/s, contact ${next.contact ? next.contact.index + ":" + next.contact.eta : "none"}]`;
    if (catchFrame || detachFrame || stateTransition) {
      const limit = detachFrame ? Math.max(0.18, physicalTravel + 8 * dt) : Math.max(0.18, (previousSpeed + 8) * dt);
      continuity(previous, next, limit, details);
      // Catching intentionally removes the physics marker's resting snap from
      // the image. Do not compare the following frame's acceleration to it.
      motionHistory = null;
    } else {
      const reference = !s.attached ? { x: 0, y: s.y - previousY, z: s.z - previousZ } : { x: 0, y: 0, z: 0 };
      // This is a second position difference (acceleration), so its allowance
      // scales with dt². Linear dt scaling falsely labels a sparsely sampled
      // but smooth knee kick at 20Hz as a pop. The 120Hz path remains strict.
      motionHistory = displacementChanges(previous, next, reference, motionHistory, 0.08 * stride * stride, details);
    }
    if (catchFrame) caught = true;
    previous = next;
    count++;
  }
  const timing = options.release ? { release: options.release } : Pilot.plan(s, options.direction || 1);
  assert.ok(timing, "live pose path needs a reachable launch");
  while (s.holdT + 1e-7 < timing.release) frame({ holding: true });
  frame({ holding: false });
  assert.equal(s.attached, false, "live pose sequence did not launch");
  for (let i = 0; i < 3600 / stride && !s.attached && s.mode === "play"; i++) frame({ holding: s.vy < 0 });
  assert.equal(caught, true, "live pose sequence never caught the next ledge");
  if (!options.release) assert.ok(options.direction < 0 ? s.holdIndex < from : s.holdIndex > from,
    "live pose sequence did not advance in its intended direction");
  for (let i = 0; i < 90 / stride; i++) frame({ holding: false });
  if (s.mode === "ledge") {
    frame({ keep: true });
    for (let i = 0; i < 90 / stride; i++) frame({ holding: false });
    for (let i = 0; i < 60 / stride; i++) frame({ holding: true });
  }
  return count;
}

function stableDescent(renderer, mask, holding) {
  renderer.resetPoseHistory();
  const from = Math.floor(FX.HOLDS.length * .75), s = Pilot.fresh(mask, from);
  s.descending = true; s.returning = true;
  let previous = withoutMutation(renderer.updatePose, s);
  for (let i = 0; i < 1200; i++) {
    Pilot.tick(s, { holding });
    const p = withoutMutation(renderer.updatePose, s), label = `descent wait/${mask}/${holding}/${i}`;
    finitePose(p, label); lengths(p, renderer.poseDimensions, label);
    continuity(previous, p, .14, label);
    assert.equal(s.attached, true, "downhill must not slip or launch without a release");
    assert.equal(s.holdIndex, from, "waiting changed the current hold");
    assert.equal(s.launches, 0, "holding input caused an automatic downhill launch");
    previous = p;
  }
  return 1200;
}

function summitDoor(renderer, stride, pressSeconds) {
  renderer.resetPoseHistory();
  const s = Pilot.fresh(15, FX.HOLDS.length - 1);
  s.crown = true;
  let previous = withoutMutation(renderer.updatePose, s), frames = 0, motionHistory = null;
  const dt = stride * Pilot.DT;
  function frame(holding) {
    const oldMode = s.mode;
    for (let i = 0; i < stride; i++) Pilot.tick(s, { holding });
    const p = withoutMutation(renderer.updatePose, s);
    const label = `summit door ${pressSeconds}s/${120 / stride}Hz ${oldMode}→${s.mode}`;
    finitePose(p, label); lengths(p, renderer.poseDimensions, label);
    if (oldMode !== s.mode || previous.standing !== p.standing) {
      continuity(previous, p, Math.max(0.18, 8 * dt), label);
      motionHistory = null;
    } else motionHistory = displacementChanges(previous, p, { x: 0, y: 0, z: 0 }, motionHistory, 0.08 * stride * stride, label);
    previous = p;
    frames++;
  }
  for (let i = 0; i < Math.round(pressSeconds / dt); i++) frame(true);
  frame(false);
  assert.equal(s.mode, "ending", "summit release must open the ending choices");
  assert.equal(s.crown, true, "summit release must remain on the summit");
  assert.equal(s.attached, true, "summit release must not launch");
  assert.equal(s.descending, false, "long press must not select downhill");
  for (let i = 0; i < Math.ceil(1 / dt); i++) frame(false);
  return frames;
}

function main() {
  const renderer = rendererPose();
  const pose = (state, ...args) => withoutMutation(renderer.computePose, state, ...args);
  const dims = renderer.poseDimensions;
  assert.ok(dims, "renderer must publish fixed anatomical segment dimensions");
  for (const k of ["upperArm", "forearm", "thigh", "shin"]) assert.ok(dims[k] > 0.2 && dims[k] < 0.6, `implausible ${k} dimension`);
  let samples = 0, bendChecks = 0;
  const rows = [];
  const holds = [0, Math.floor((FX.HOLDS.length - 1) / 2), FX.HOLDS.length - 2];
  for (const mask of [0, 15]) for (const holdIndex of holds) {
    const s = Pilot.fresh(mask, holdIndex);
    const handAnchor = pose({ ...s, holding: true });
    let previous = null;
    const angles = [];
    for (let frame = 0; frame <= 360; frame++) {
      if (frame) Pilot.tick(s, { holding: true });
      else s.holding = true;
      const p = pose(s), label = `mask${mask}/hold${holdIndex}/charge${s.holdT.toFixed(3)}`;
      finitePose(p, label);
      lengths(p, dims, label);
      bendChecks += bendDirections(p, label);
      for (const side of ["L", "R"]) {
        const hand = p["hand" + side], hold = FX.HOLDS[holdIndex];
        assert.ok(distance(hand, handAnchor["hand" + side]) < 0.001,
          `${label}: gripping hand ${side} slipped off its anchor`);
        assert.ok(Math.hypot(hand.y - hold.y, hand.z - hold.z) < 0.08,
          `${label}: gripping hand ${side} is not on the rock hold`);
        assert.ok(hand.z >= FX.faceZ(hand.y) - 0.005,
          `${label}: gripping hand ${side} is inside the collision wall`);
      }
      if (previous) continuity(previous, p, 0.14, label);
      previous = p;
      if (s.holdT < 1.4) angles.push(angle(p));
      samples++;
    }
    const angleRange = (Math.max(...angles) - Math.min(...angles)) * 180 / Math.PI;
    assert.ok(angleRange >= 12, `mask${mask}/hold${holdIndex}: torso remains rigid (${angleRange.toFixed(1)}°)`);

    const releaseState = Pilot.fresh(mask, holdIndex);
    const timing = Pilot.plan(releaseState, 1);
    assert.ok(timing, `mask${mask}/hold${holdIndex}: no valid release window`);
    // The light pack can still reach an easy hold after the body has already
    // descended from the turnover. Inspect the first part of the proven window
    // for the muscle-up itself; later releases are covered by live transitions.
    const releaseAt = Math.min(timing.b, timing.a + 2 * Pilot.DT);
    while (releaseState.holdT + 1e-7 < releaseAt) Pilot.tick(releaseState, { holding: true });
    const before = pose(releaseState);
    const gripY = (before.handL.y + before.handR.y) / 2;
    assert.ok(before.chest.y > gripY + 0.015,
      `mask${mask}/hold${holdIndex}: chest never crosses grip at valid release (${(before.chest.y - gripY).toFixed(3)}m)`);
    Pilot.tick(releaseState, { holding: false });
    assert.equal(releaseState.attached, false, "release test must launch through real game input");
    const release = { pose: before, physicsY: releaseState.y, physicsZ: releaseState.z };
    let last = pose(releaseState, release), lastY = releaseState.y, lastZ = releaseState.z;
    continuity(before, last, 0.035, "attached→flight transition");
    for (let frame = 0; frame < 35 && !releaseState.attached; frame++) {
      Pilot.tick(releaseState, { holding: false });
      if (releaseState.attached) break;
      const p = pose(releaseState, release), label = `mask${mask}/hold${holdIndex}/flight${frame}`;
      finitePose(p, label);
      lengths(p, dims, label);
      const physicalStep = Math.hypot(releaseState.y - lastY, releaseState.z - lastZ);
      continuity(last, p, Math.max(0.24, physicalStep + 0.12), `${label} [marker ${physicalStep.toFixed(4)}m, contact ${p.contact ? p.contact.index + ":" + p.contact.eta : "none"}]`);
      last = p;
      lastY = releaseState.y; lastZ = releaseState.z;
      samples++;
    }
    rows.push({ mask, holdIndex, torsoRangeDegrees: +angleRange.toFixed(1), chestAboveGrip: +(before.chest.y - gripY).toFixed(3) });
  }
  // World altitude must translate the character, never scale body proportions.
  for (const mode of ["ledge", "drop", "ending"]) {
    const s = Pilot.fresh(15, mode === "ending" ? FX.HOLDS.length - 1 : FX.HOLDS.findIndex(h => FX.ITEMS[h.k]));
    s.mode = mode;
    s.crown = mode === "ending";
    const p = pose(s);
    finitePose(p, mode); lengths(p, dims, mode);
    assert.ok(distance(p.head, p.shoulder) < 0.45, `${mode}: detached head`);
  }
  const beforeRest = FX.HOLDS.findIndex(h => FX.isRest(h.k)) - 1;
  let transitionSamples = 0;
  forecastPurity(renderer);
  const high = Math.floor(FX.HOLDS.length * 0.75);
  const cases = [
    { from: 0, mask: 15 },
    { from: beforeRest, mask: 15 },
    { from: FX.HOLDS.length - 2, mask: 15 },
    { from: high, mask: 15, direction: -1 },
    { from: high, mask: 0, release: 0.65 },
    { from: high, mask: 15, release: 1.58 },
    { from: Math.floor(FX.HOLDS.length / 2), mask: 0, release: 1.65 },
    { from: high, mask: 0, direction: -1 },
  ];
  for (const stride of [1, 2, 4, 6]) for (const c of cases) {
    transitionSamples += actualTransitions(renderer, c.from, c.mask, stride, c);
  }
  for (const stride of [1, 2, 4, 6]) for (const press of [0.15, 0.7, 1.1, 1.25]) {
    transitionSamples += summitDoor(renderer, stride, press);
  }
  for (const stride of [1, 2, 4, 6]) for (const press of [1.8, 2.2]) {
    transitionSamples += summitDoor(renderer, stride, press);
  }
  for (const mask of [0, 15]) for (const holding of [false, true]) transitionSamples += stableDescent(renderer, mask, holding);
  console.table(rows);
  console.log(`PASS pose: ${samples} skeletal samples, ${bendChecks} joint-direction checks, ${transitionSamples} live transition samples; fixed lengths, anchored hands, muscle-up, launch/catch/standing continuity`);
  return rows;
}

if (require.main === module) main();
module.exports = { main, rendererPose, finitePose, lengths, bendDirections };
