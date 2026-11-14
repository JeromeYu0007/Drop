/* Input cancellation and rest-menu decisions must preserve the real skeleton.
 * The UI pause/save/restore functions run unchanged in a minimal DOM fixture;
 * gameplay and rendered joints are production code, without WebGL. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FX = require("../game.js");
const Pilot = require("./pilot.js");
const { rendererPose, lengths, finitePose } = require("./pose.js");
const Render = rendererPose();
const joints = ["hip", "shoulder", "head", "elbowL", "elbowR", "handL", "handR", "kneeL", "kneeR", "footL", "footR"];
let poses = 0, transitions = 0, worstStep = 0;

function pose(state, label) {
  const p = Render.computePose(state);
  finitePose(p, label);
  lengths(p, Render.poseDimensions, label);
  poses++;
  return p;
}
function continuous(a, b, label, tolerance = .08) {
  for (const key of joints) {
    const d = Math.hypot(a[key].x-b[key].x,a[key].y-b[key].y,a[key].z-b[key].z);
    worstStep = Math.max(worstStep, d);
    assert.ok(d < tolerance, `${label}: ${key} jumped ${d.toFixed(4)}m in one physics frame`);
  }
  transitions++;
}
function recover(state, label) {
  const launches = state.launches;
  let previous = pose(state, label);
  for (let i = 0; i < 180; i++) {
    Pilot.tick(state, { holding: false });
    const p = pose(state, label);
    continuous(previous,p,label); previous=p;
    assert.ok(state.attached, `${label}: clearing a gesture detached the climber`);
    assert.equal(state.launches, launches, `${label}: old press launched after cancellation`);
  }
  assert.equal(state.settle, 1, `${label}: body did not finish recovery`);
}
function charged(mask, down, time) {
  const s = Pilot.fresh(mask, 10, 0);
  s.descending = down;
  while (s.holdT < time) Pilot.tick(s, { holding: true });
  return s;
}

// Menu choices may arrive on the same frame as catching a rest lip. Keeping
// the pack must not skip the pending arrest of momentum and straighten limbs.
for (const h of FX.HOLDS.filter(h => FX.isRest(h.k))) {
  const s = Pilot.fresh(15, h.i - 1, 0), plan = Pilot.plan(s);
  assert.ok(plan, `rest ${h.i}: reachable fixture`);
  Pilot.execute(s, plan);
  assert.equal(s.mode, "ledge", `rest ${h.i}: actual approach did not open menu`);
  const before = pose(s, `rest ${h.i} incoming`);
  Pilot.tick(s, { keep: true });
  assert.equal(s.mode, "play");
  assert.ok(s.settle < .1, "keep decision skipped catch recovery");
  continuous(before, pose(s, "keep"), `rest ${h.i} keep`);
  recover(s, `rest ${h.i} recovery`);
}

// Test each direction during preload, pull, and high turnover. Direct physics
// input must be safe even when no browser helper cancelled the gesture first.
for (const mask of [0, 15]) for (const down of [false, true]) {
  for (const time of [.25, .8, 1.3, 1.7]) {
    const s = charged(mask, down, time), before = pose(s, "charged");
    const launches = s.launches;
    Pilot.tick(s, { direction: down ? "up" : "down", holding: true });
    assert.equal(s.descending, !down);
    assert.equal(s.holdT, 0);
    assert.equal(s.launches, launches);
    continuous(before, pose(s, "changed direction"), "direction cancellation", .002);
    // A physical key may still be down after clicking a direction button.
    for (let i=0;i<18;i++) Pilot.tick(s,{holding:true});
    assert.equal(s.holdT, 0, "held old key began charging in the new direction");
    recover(s, "direction recovery");
  }
}

function uiFixture(state) {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const extract = name => {
    const start = html.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing UI function ${name}`);
    return html.slice(start, html.indexOf("\n}",start)+2);
  };
  const storage = new Map(), noop = () => {}, classList = { toggle:noop };
  const context = {
    FX, state, shot:false, restartPulse:false, SESSION_KEY:"session", SESSION_SCHEMA:4,
    routeVersion:FX.HOLDS.map(h => [h.y,h.z,h.k].join(":")).join("|"),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    activePointer:null,keyHeld:true,holding:true,wantKeep:false,wantDrop:"",wantRetrieve:false,wantDirection:"",
    sessionActive:false,paused:false,pausedNeedsRender:false,contextLost:false,acc:0,last:0,slowSeconds:0,
    ac:null,muted:false,camY:0,focusZ:0,prologueLeft:0,canvas:{},
    document:{body:{classList}},ui:{resume:{classList}},persist:noop,stopSoundVoices:noop,
  };
  vm.createContext(context);
  vm.runInContext(["cancelCharge","saveSession","restoreSession","setPaused"].map(extract).join("\n"),context);
  return context;
}

// Pausing first cancels the active gesture, then saves the captured posture.
// Reloading that save must preserve the same shoulder and not resume charging.
for (const down of [false, true]) {
  const s = charged(15, down, 1.7), before = pose(s, "before pause"), ui = uiFixture(s);
  ui.setPaused(true);
  continuous(before, pose(s,"paused"), "pause cancellation", .002);
  assert.ok(ui.paused);
  assert.equal(ui.holding,false);
  assert.equal(s.holdT,0);
  assert.ok(s.catchPose);
  ui.state = FX.createState();
  assert.equal(ui.restoreSession(),true,"paused schema 4 save failed to restore");
  assert.equal(ui.state.descending,down,"reload changed the chosen direction");
  continuous(before,pose(ui.state,"restored"),"restore cancelled charge",.002);
  ui.setPaused(false);
  assert.equal(ui.paused,false);
  recover(ui.state,"resumed recovery");
}

console.log(`PASS transition: ${poses} real skeletal poses, ${transitions} continuity checks; worst frame ${worstStep.toFixed(4)}m; keep, direction, pause and restored cancellation never auto-launch`);
