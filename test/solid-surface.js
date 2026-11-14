/* The collision surface and its fast envelope must contain the rendered rock. */
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const FX = require("../game.js");
const Surface = require("../surface.js");

const mesh = FX.buildCliffMesh(0.20, 0.26);
const original = Buffer.from(mesh.positions.buffer).toString("base64");
const start = performance.now();
const surface = Surface.create({
  buildCliffMesh: (y, x) => {
    assert.equal(y, 0.20);
    assert.equal(x, 0.26);
    return mesh;
  },
  faceZ: FX.faceZ,
  top: FX.HOLDS[FX.HOLDS.length - 1].y,
});
const buildMs = performance.now() - start;
assert.equal(Buffer.from(mesh.positions.buffer).toString("base64"), original, "collision setup mutated rendered vertices");
assert.ok(surface.stats.corridor >= 0.50, "collision corridor must contain flared elbows and sleeves");

let seed = 817211;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function close(a, b, epsilon, message) {
  assert.ok(Number.isFinite(a) && Math.abs(a - b) <= epsilon, `${message}: ${a} versus ${b}`);
}

// An affine point inside each rendered triangle must give its exact Z. This
// deliberately samples the off-center columns and the warped hold undercuts.
let checked = 0;
for (let n = 0; n < 5000; n++) {
  const t = Math.floor(random() * mesh.indices.length / 3) * 3;
  const a = mesh.indices[t] * 3, b = mesh.indices[t + 1] * 3, c = mesh.indices[t + 2] * 3;
  const u = 0.05 + random() * 0.45;
  const v = 0.05 + random() * 0.45;
  const p = mesh.positions;
  const x = p[a] * (1 - u - v) + p[b] * u + p[c] * v;
  const y = p[a + 1] * (1 - u - v) + p[b + 1] * u + p[c + 1] * v;
  const z = p[a + 2] * (1 - u - v) + p[b + 2] * u + p[c + 2] * v;
  if (y > surface.stats.maxY) continue;
  close(surface.surfaceZ(x, y), z, 1e-8, `triangle ${t / 3}`);
  checked++;
}
assert.ok(checked > 4000);

for (const hold of FX.HOLDS) {
  close(surface.surfaceZ(0, hold.y), hold.z, 0.00002, `hold ${hold.i}`);
}

let samples = 0;
let leastClearance = Infinity;
function enclosed(x, y) {
  const actual = surface.surfaceZ(x, y);
  const envelope = surface.envelopeZ(y);
  assert.ok(Number.isFinite(actual), `missing wall at (${x}, ${y})`);
  const gap = envelope - actual;
  leastClearance = Math.min(leastClearance, gap);
  assert.ok(gap >= -1e-8, `collision envelope is inside the mesh at (${x}, ${y}) by ${-gap}`);
  samples++;
}
for (let n = 0; n < 25000; n++) {
  enclosed((random() * 2 - 1) * surface.stats.corridor,
    surface.stats.minY + random() * (surface.stats.maxY - surface.stats.minY));
}
// Dense non-grid-aligned sampling around every hold, including both corridor edges.
for (const hold of FX.HOLDS) {
  for (let dy = -0.8; dy <= 0.8; dy += 0.0071) {
    for (let n = 0; n <= 40; n++) enclosed(surface.stats.corridor * (-1 + 2 * n / 40), hold.y + dy);
  }
}
assert.ok(surface.stats.maxCorrection < 0.025, "collision padding should remain small on the real cliff");
assert.ok(Number.isFinite(surface.envelopeZ(surface.stats.minY)));
assert.ok(Number.isFinite(surface.surfaceZ(0, surface.stats.minY)));
assert.ok(Number.isFinite(surface.envelopeZ(surface.stats.maxY)));
assert.ok(Number.isFinite(surface.surfaceZ(0, surface.stats.maxY)));
assert.equal(surface.envelopeZ(surface.stats.maxY + 1e-6), -Infinity);
assert.equal(surface.surfaceZ(0, surface.stats.maxY + 1e-6), -Infinity);
assert.equal(surface.envelopeZ(surface.stats.minY - 1e-6), -Infinity);
assert.equal(surface.surfaceZ(0, surface.stats.minY - 1e-6), -Infinity);
assert.equal(surface.surfaceZ(surface.stats.maxX + 1e-6, 10), -Infinity);
assert.equal(surface.slope(Infinity), 0);
for (let y = surface.stats.minY; y <= surface.stats.maxY; y += 0.017) {
  assert.ok(Number.isFinite(surface.slope(y)), "collision normal must be finite");
}

// A narrow ridge between lookup nodes must not disappear during interpolation.
const ridge = Surface.create({
  buildCliffMesh: () => ({
    positions: new Float32Array([-1, 0, 0, 1, 0, 0, -1, 0.005, 1, 1, 0.005, 1, -1, 0.02, 0, 1, 0.02, 0]),
    indices: [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4],
  }),
  faceZ: () => -100,
  top: 1,
});
for (let y = 0; y < 0.02; y += 0.000031) {
  assert.ok(ridge.envelopeZ(y) >= ridge.surfaceZ(0, y) - 1e-8, "lost an inter-node peak");
}

// Overlapping triangles use the frontmost face, including reversed winding.
const overlap = Surface.create({
  buildCliffMesh: () => ({
    positions: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 1, -1, 0, 0.4, 1, 0, 0.4, 0, 1, 1.4]),
    indices: [0, 1, 2, 5, 4, 3],
  }),
  faceZ: () => 99,
  top: 1,
});
close(overlap.surfaceZ(0.1, 0.2), 0.6, 1e-7, "frontmost triangle");

let total = 0;
const queryStart = performance.now();
for (let n = 0; n < 1000000; n++) total += surface.envelopeZ(5 + (n % 18000) * 0.01);
const queryMs = performance.now() - queryStart;
assert.ok(Number.isFinite(total));
assert.ok(queryMs < 5000, "million collision samples unexpectedly slow");
console.log(`PASS solid surface: ${checked} triangle interiors, ${FX.HOLDS.length} holds, ${samples} envelope samples; clearance >= ${leastClearance.toFixed(6)}m`);
console.log(`build ${buildMs.toFixed(1)}ms; 1M envelope queries ${queryMs.toFixed(1)}ms; tables ${surface.stats.tableBytes}B; retained ${surface.stats.retainedBytes}B`);
