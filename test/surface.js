/* Every gameplay hold is a point on the cliff mesh. */
const FX = require("../game.js");

function dist2(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function main() {
  const mesh = FX.buildCliffMesh(0.32, 0.36);
  const p = mesh.positions;
  let worst = 0;
  let worstI = 0;
  const rows = [];
  for (let i = 0; i < FX.HOLDS.length; i++) {
    const h = FX.HOLDS[i];
    let best = 1e9;
    for (let v = 0; v < p.length; v += 3) {
      const d = dist2(0, h.y, h.z, p[v], p[v + 1], p[v + 2]);
      if (d < best) best = d;
    }
    const gap = Math.sqrt(best);
    rows.push(gap);
    if (gap > worst) {
      worst = gap;
      worstI = i;
    }
  }
  const mobile = FX.buildCliffMesh(0.48, 0.52);
  const mp = mobile.positions;
  let mobileWorst = 0;
  for (let i = 0; i < FX.HOLDS.length; i++) {
    const h = FX.HOLDS[i];
    let best = 1e9;
    for (let v = 0; v < mp.length; v += 3) {
      const d = dist2(0, h.y, h.z, mp[v], mp[v + 1], mp[v + 2]);
      if (d < best) best = d;
    }
    const gap = Math.sqrt(best);
    if (gap > mobileWorst) mobileWorst = gap;
  }
  console.log("holds", FX.HOLDS.length, "verts", p.length / 3);
  console.log("worst", worst.toFixed(4), "at", worstI, "mobile", mobileWorst.toFixed(4));
  if (worst > 0.05 || mobileWorst > 0.05) {
    console.log("FAIL");
    process.exitCode = 1;
  } else console.log("PASS");
}

main();
