/* Collision queries use the rendered triangles, including every hold. No DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FXSurface = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GRID = 0.01;
  // Flared elbows extend past the torso: sleeves reach about +/-0.47m.
  const CORRIDOR = 0.52;
  const SKIN = 0.002;
  const BIN_X = 0.26;
  const BIN_Y = 0.2;

  function clipX(poly, edge, keepRight) {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const insideA = keepRight ? a.x >= edge : a.x <= edge;
      const insideB = keepRight ? b.x >= edge : b.x <= edge;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (edge - a.x) / (b.x - a.x);
        result.push({ x: edge, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return result;
  }

  function create(options) {
    const mesh = options.buildCliffMesh(0.20, 0.26);
    const p = mesh.positions;
    const indices = new Uint32Array(mesh.indices);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]);
      maxX = Math.max(maxX, p[i]);
      minY = Math.min(minY, p[i + 1]);
      maxY = Math.max(maxY, p[i + 1]);
    }
    maxY = Math.min(maxY, options.top + 2.75);
    if (!(maxX > minX && maxY > minY)) throw new Error("Cliff collision mesh has no area");

    // Small XY cells retain triangle IDs, so precise queries do not depend on
    // assumptions about the shifted rows beneath a hold or triangle winding.
    const countX = Math.max(1, Math.ceil((maxX - minX) / BIN_X));
    const countY = Math.max(1, Math.ceil((maxY - minY) / BIN_Y));
    const cells = new Array(countX * countY);
    const nodeCount = Math.ceil((maxY - minY) / GRID) + 1;
    const heights = new Float64Array(nodeCount);
    heights.fill(-Infinity);
    const correction = new Float64Array(nodeCount - 1);
    const corners = [];

    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const loX = Math.min(p[a], p[b], p[c]);
      const hiX = Math.max(p[a], p[b], p[c]);
      const loY = Math.min(p[a + 1], p[b + 1], p[c + 1]);
      const hiY = Math.max(p[a + 1], p[b + 1], p[c + 1]);
      if (loY > maxY || hiY < minY) continue;
      const x0 = Math.max(0, Math.floor((loX - minX) / BIN_X));
      const x1 = Math.min(countX - 1, Math.floor((hiX - minX) / BIN_X));
      const y0 = Math.max(0, Math.floor((loY - minY) / BIN_Y));
      const y1 = Math.min(countY - 1, Math.floor((hiY - minY) / BIN_Y));
      for (let iy = y0; iy <= y1; iy++) {
        for (let ix = x0; ix <= x1; ix++) {
          const cell = iy * countX + ix;
          if (!cells[cell]) cells[cell] = [];
          cells[cell].push(t);
        }
      }
      if (loX > CORRIDOR || hiX < -CORRIDOR) continue;
      let poly = [
        { x: p[a], y: p[a + 1], z: p[a + 2] },
        { x: p[b], y: p[b + 1], z: p[b + 2] },
        { x: p[c], y: p[c + 1], z: p[c + 2] },
      ];
      poly = clipX(clipX(poly, -CORRIDOR, true), CORRIDOR, false);
      for (let k = 0; k < poly.length; k++) {
        const u = poly[k], v = poly[(k + 1) % poly.length];
        corners.push(u.y, u.z);
        const low = Math.max(0, Math.ceil((Math.min(u.y, v.y) - minY) / GRID - 1e-8));
        const high = Math.min(nodeCount - 1, Math.floor((Math.max(u.y, v.y) - minY) / GRID + 1e-8));
        for (let n = low; n <= high; n++) {
          const dy = v.y - u.y;
          const f = Math.abs(dy) < 1e-12 ? 0 : Math.max(0, Math.min(1, (minY + n * GRID - u.y) / dy));
          const z = Math.abs(dy) < 1e-12 ? Math.max(u.z, v.z) : u.z + (v.z - u.z) * f;
          if (z > heights[n]) heights[n] = z;
        }
      }
    }

    // The final grid node can lie just beyond the mesh. Extend its value only
    // inside the table; queries outside the actual mesh still return -Infinity.
    let nearest = -Infinity;
    for (let i = 0; i < nodeCount; i++) {
      if (Number.isFinite(heights[i])) nearest = heights[i];
      else heights[i] = nearest;
    }
    nearest = -Infinity;
    for (let i = nodeCount - 1; i >= 0; i--) {
      if (Number.isFinite(heights[i])) nearest = heights[i];
      else heights[i] = nearest;
    }
    if (!Number.isFinite(heights[0])) throw new Error("Cliff misses the climbing corridor");

    // At a fixed Y an affine triangle reaches its largest Z on its clipped
    // boundary. Between consecutive grid nodes, every such edge is linear.
    // Its endpoints are either grid crossings or polygon corners. Raising the
    // interpolant by the greatest corner deficit therefore bounds EVERY point,
    // including a sharp hold peak located between grid nodes.
    let maxCorrection = 0;
    for (let k = 0; k < corners.length; k += 2) {
      const y = corners[k];
      if (y < minY || y > maxY) continue;
      const q = (y - minY) / GRID;
      const i = Math.min(nodeCount - 2, Math.max(0, Math.floor(q)));
      const z = heights[i] + (heights[i + 1] - heights[i]) * (q - i);
      correction[i] = Math.max(correction[i], corners[k + 1] - z);
      maxCorrection = Math.max(maxCorrection, correction[i]);
    }

    const offsets = new Uint32Array(cells.length + 1);
    for (let i = 0; i < cells.length; i++) offsets[i + 1] = offsets[i] + (cells[i] ? cells[i].length : 0);
    const triangles = new Uint32Array(offsets[cells.length]);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) triangles.set(cells[i], offsets[i]);
    }

    function surfaceZ(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX || y < minY || y > maxY) return -Infinity;
      const ix = Math.min(countX - 1, Math.floor((x - minX) / BIN_X));
      const iy = Math.min(countY - 1, Math.floor((y - minY) / BIN_Y));
      const cell = iy * countX + ix;
      let front = -Infinity;
      for (let k = offsets[cell]; k < offsets[cell + 1]; k++) {
        const t = triangles[k];
        const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
        const bx = p[b] - p[a], by = p[b + 1] - p[a + 1];
        const cx = p[c] - p[a], cy = p[c + 1] - p[a + 1];
        const det = bx * cy - by * cx;
        if (Math.abs(det) < 1e-12) continue;
        const dx = x - p[a], dy = y - p[a + 1];
        const u = (dx * cy - dy * cx) / det;
        const v = (bx * dy - by * dx) / det;
        if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
        front = Math.max(front, p[a + 2] + u * (p[b + 2] - p[a + 2]) + v * (p[c + 2] - p[a + 2]));
      }
      return front;
    }

    function envelopeZ(y) {
      if (!Number.isFinite(y) || y < minY || y > maxY) return -Infinity;
      const q = (y - minY) / GRID;
      const i = Math.min(nodeCount - 2, Math.floor(q));
      return heights[i] + (heights[i + 1] - heights[i]) * (q - i) + correction[i] + SKIN;
    }

    function slope(y) {
      if (!Number.isFinite(y) || y < minY || y > maxY) return 0;
      const lo = Math.max(minY, y - GRID * 2);
      const hi = Math.min(maxY, y + GRID * 2);
      return hi > lo ? (envelopeZ(hi) - envelopeZ(lo)) / (hi - lo) : 0;
    }

    return {
      surfaceZ: surfaceZ,
      envelopeZ: envelopeZ,
      slope: slope,
      stats: {
        minY: minY, maxY: maxY, minX: minX, maxX: maxX,
        corridor: CORRIDOR, grid: GRID, skin: SKIN, maxCorrection: maxCorrection,
        triangles: indices.length / 3,
        tableBytes: heights.byteLength + correction.byteLength,
        retainedBytes: p.byteLength + indices.byteLength + offsets.byteLength + triangles.byteLength + heights.byteLength + correction.byteLength,
      },
    };
  }

  return { create: create };
});
