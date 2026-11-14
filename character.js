/* The climber is sewn from procedural surfaces. The renderer supplies the
 * authoritative joint positions; this module only dresses that skeleton. */
(function () {
  "use strict";
  function create({ THREE: T, scene, quality = 2 }) {
    const root = new T.Group(); root.name = "Climber / weathered expedition clothing"; scene.add(root);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const up = new T.Vector3(0, 1, 0), axis = new T.Vector3(), side = new T.Vector3(), depth = new T.Vector3();
    const bodyQ = new T.Quaternion(), workQ = new T.Quaternion();
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const hash = (x, y) => { let a = Math.imul(x + 719, 374761393) ^ Math.imul(y + 431, 668265263); a = Math.imul(a ^ a >>> 13, 1274126177); return ((a ^ a >>> 16) >>> 0) / 4294967295; };
    const rgb = value => new T.Color(value);
    const colors = {
      coat: rgb(0xb98149), coatDark: rgb(0x76542f), coatLight: rgb(0xc29862),
      pants: rgb(0x38444a), pantsDark: rgb(0x283136), pantsLight: rgb(0x526067),
      pack: rgb(0x696145), packDark: rgb(0x454735), packLight: rgb(0x8b8060),
      web: rgb(0x32382e), stitch: rgb(0xaaa085), rubber: rgb(0x202725),
      glove: rgb(0x5c5647), skin: rgb(0xb69a7d), red: rgb(0x883e32), metal: rgb(0x9e9b88)
    };
    function texture(kind) {
      const size = 256, data = new Uint8Array(size * size * 4);
      const tileNoise = (x, y, cells) => {
        const px=x/size*cells,py=y/size*cells,ix=Math.floor(px),iy=Math.floor(py),tx=smooth(px-ix),ty=smooth(py-iy);
        const sample=(a,b)=>hash((a+cells)%cells,(b+cells)%cells);
        return mix(mix(sample(ix,iy),sample(ix+1,iy),tx),mix(sample(ix,iy+1),sample(ix+1,iy+1),tx),ty);
      };
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const n = hash(x, y), thread = ((x & 3) < 2 ? 1 : -1) * ((y & 3) < 2 ? 1 : -1);
        const weave = thread * 3 + Math.sin((x + y) * Math.PI * .5) * 2;
        const worn = tileNoise(x,y,4)*.55 + tileNoise(x,y,8)*.30 + tileNoise(x,y,16)*.15;
        const value = kind === "color" ? 231 + weave*.7 + n*7 + worn*22 : kind === "cloth" ? 113 + worn*28 + weave*3 + (n-.5)*12 : 116 + worn*22 + (n-.5)*40;
        const o = (y * size + x) * 4; data[o] = data[o + 1] = data[o + 2] = clamp(Math.round(value), 0, 255); data[o + 3] = 255;
      }
      const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearMipmapLinearFilter;
      tex.generateMipmaps = true; tex.anisotropy = 4;
      if (kind === "color") tex.colorSpace = T.SRGBColorSpace;
      tex.needsUpdate = true; textures.add(tex); return tex;
    }
    const clothColor = texture("color"), clothBump = texture("cloth"), leatherBump = texture("leather");
    const material = settings => { const m = new T.MeshStandardMaterial(settings); materials.add(m); return m; };
    const cloth = material({ color: 0xffffff, vertexColors: true, map: clothColor, bumpMap: clothBump, bumpScale: .0010, roughness: .94, metalness: 0 });
    const leather = material({ color: 0xffffff, vertexColors: true, bumpMap: leatherBump, bumpScale: .0013, roughness: .86, metalness: 0 });
    const skin = material({ color: 0xffffff, vertexColors: true, roughness: .83 });
    const metal = material({ color: 0xffffff, vertexColors: true, roughness: .48, metalness: .65 });
    const scarfMat = material({ color: 0x873b2e, map: clothColor, bumpMap: clothBump, bumpScale: .0008, roughness: .95, side: T.DoubleSide });
    const sphere = (w, h, d, ws = 16, hs = 12) => new T.SphereGeometry(1, ws, hs).scale(w, h, d);
    function roundBox(w, h, d, radius = .025) {
      const g = new T.BoxGeometry(w, h, d, 6, 8, 6), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const cx = clamp(x, -w / 2 + radius, w / 2 - radius), cy = clamp(y, -h / 2 + radius, h / 2 - radius), cz = clamp(z, -d / 2 + radius, d / 2 - radius);
        const dx = x - cx, dy = y - cy, dz = z - cz, len = Math.hypot(dx, dy, dz) || 1;
        p.setXYZ(i, cx + dx / len * radius, cy + dy / len * radius, cz + dz / len * radius);
        n.setXYZ(i, dx / len, dy / len, dz / len);
      }
      return g;
    }
    const part = (geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => ({ geo, color: typeof color === "number" ? rgb(color) : color, pos, rot, scale });
    function merge(parts) {
      const position = [], normal = [], uv = [], color = [], index = [];
      const matrix = new T.Matrix4(), normalMatrix = new T.Matrix3(), q = new T.Quaternion(), v = new T.Vector3(), n = new T.Vector3();
      for (const p of parts) {
        const g = p.geo, base = position.length / 3;
        matrix.compose(new T.Vector3(...p.pos), q.setFromEuler(new T.Euler(...p.rot)), new T.Vector3(...p.scale)); normalMatrix.getNormalMatrix(matrix);
        const a = g.attributes.position, b = g.attributes.normal, u = g.attributes.uv;
        for (let i = 0; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(matrix); n.fromBufferAttribute(b, i).applyMatrix3(normalMatrix).normalize();
          position.push(v.x, v.y, v.z); normal.push(n.x, n.y, n.z); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
          color.push(p.color.r, p.color.g, p.color.b);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.array[i]);
        else for (let i = 0; i < a.count; i++) index.push(base + i);
        p.geo.dispose();
      }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(position, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(normal, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setAttribute("color", new T.Float32BufferAttribute(color, 3)); g.setIndex(index); g.computeBoundingSphere(); return g;
    }
    function mesh(geometry, mat, parent = root, cast = true) {
      geometries.add(geometry); const m = new T.Mesh(geometry, mat); m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; parent.add(m); return m;
    }
    function curve(points, radius = .003, segments = 16, radial = 5) { return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments, radius, radial, false); }
    function stripe(points, color, radius = .003) { return part(curve(points, radius), color); }
    function ring(y, width, thickness, color, frontOnly = false) {
      const points = [], count = frontOnly ? 18 : 32;
      for (let i = 0; i <= count; i++) { const a = frontOnly ? Math.PI * .5 + i / count * Math.PI : i / count * Math.PI * 2; points.push([Math.sin(a) * width, y, Math.cos(a) * thickness]); }
      return stripe(points, color, .0025);
    }

    // One deforming surface for the coat, trousers and pelvis. Rounded elbow
    // and knee folds are cloth, not exposed spherical mechanical joints.
    const RADIAL = 20, circular = Array.from({length:21}, (_,i) => ({a:i/20*Math.PI*2,sin:Math.sin(i/20*Math.PI*2),cos:Math.cos(i/20*Math.PI*2)})), tubeSpecs = [
      { name: "torso", rings: 17 }, { name: "pelvis", rings: 9 },
      { name: "armL", rings: 25 }, { name: "armR", rings: 25 },
      { name: "legL", rings: 27 }, { name: "legR", rings: 27 }
    ];
    let vertexCount = 0;
    for (const spec of tubeSpecs) { spec.offset = vertexCount; vertexCount += spec.rings * (RADIAL + 1); }
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2), dyes = new Float32Array(vertexCount * 3), indices = [];
    for (const spec of tubeSpecs) for (let j = 0; j < spec.rings; j++) for (let k = 0; k <= RADIAL; k++) {
      const i = spec.offset + j * (RADIAL + 1) + k, t = j / (spec.rings - 1), a = k / RADIAL * Math.PI * 2;
      let c = (spec.name === "torso" || spec.name.startsWith("arm") ? colors.coat : colors.pants).clone();
      let wear = .94 + .08 * Math.sin(t * 22 + Math.cos(a) * 3) + .035 * Math.cos(a * 5);
      if (spec.name.startsWith("arm") && t > .88) c.lerp(colors.coatDark, smooth((t - .88) / .12) * .75);
      if (spec.name.startsWith("leg") && t > .38 && t < .66) c.lerp(colors.pantsDark, Math.sin((t - .38) / .28 * Math.PI) * .40);
      if (spec.name === "torso" && t < .13) c.lerp(colors.coatDark, (1 - t / .13) * .28);
      c.multiplyScalar(wear); dyes.set([c.r, c.g, c.b], i * 3); uvs.set([k / RADIAL * 3, t * 5], i * 2);
      if (j < spec.rings - 1 && k < RADIAL) { const b = i + RADIAL + 1; if (spec.name === "torso" || spec.name === "pelvis") indices.push(i, i + 1, b, i + 1, b + 1, b); else indices.push(i, b, i + 1, i + 1, b, b + 1); }
    }
    const garmentGeometry = new T.BufferGeometry(); garmentGeometry.setAttribute("position", new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    garmentGeometry.setAttribute("normal", new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage)); garmentGeometry.setAttribute("uv", new T.BufferAttribute(uvs, 2)); garmentGeometry.setAttribute("color", new T.BufferAttribute(dyes, 3)); garmentGeometry.setIndex(indices);
    const garment = mesh(garmentGeometry, cloth);
    const torsoTrimParts = [];
    // The stitched hem is part of the deforming garment, without intersecting wire rings.
    torsoTrimParts.push(stripe([[0, .025, -.130], [0, .22, -.137], [0, .42, -.135], [0, .53, -.085]], colors.web, .004));
    torsoTrimParts.push(part(roundBox(.014, .027, .007, .003), colors.metal, [0, .43, -.142]));
    torsoTrimParts.push(part(roundBox(.085, .105, .009, .004), colors.coatDark, [-.102, .29, -.120], [0, -.33, 0]));
    torsoTrimParts.push(stripe([[-.145, .337, -.111], [-.108, .345, -.139], [-.065, .341, -.138]], colors.coatLight, .002));
    // Sewn hip belt, front clasp, shoulder straps and a close-fitting storm collar.
    torsoTrimParts.push(ring(.047, .176, .137, colors.web));
    torsoTrimParts.push(part(roundBox(.043, .026, .009, .004), colors.web, [0, .047, -.140]));
    for (const sign of [-1, 1]) {
      torsoTrimParts.push(stripe([[sign * .13, .12, -.115], [sign * .153, .31, -.137], [sign * .152, .48, -.096], [sign * .148, .55, .03], [sign * .14, .48, .245]], colors.web, .014));
      torsoTrimParts.push(stripe([[sign * .132, .14, -.128], [sign * .156, .32, -.148], [sign * .157, .45, -.112]], colors.packLight, .002));
      torsoTrimParts.push(part(roundBox(.035, .038, .013, .005), colors.packDark, [sign * .147, .18, -.135]));
    }
    torsoTrimParts.push(part(new T.TorusGeometry(.087, .027, 8, 28), colors.coatDark, [0, .552, .014], [Math.PI / 2, 0, 0], [1.24, 1, .68]));
    torsoTrimParts.push(part(new T.TorusGeometry(.074, .021, 8, 24), colors.red, [0, .585, .003], [Math.PI / 2, 0, 0], [1.11, 1, .80]));
    // Collapsed hood folds stay close to the shoulder, below the head.
    torsoTrimParts.push(part(sphere(.118, .050, .058), colors.coat, [0, .530, .099]));
    torsoTrimParts.push(stripe([[-.105, .535, .080], [0, .551, .145], [.105, .535, .080]], colors.coatLight, .003));
    const torsoTrim = mesh(merge(torsoTrimParts), cloth);

    // The head is a small sculpted profile, with an actual jaw and brow. The
    // knit cap and tiny eyes avoid a blank shiny mannequin at close range.
    const faceGeo = sphere(.102, .139, .101, 24, 18), fp = faceGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      let x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
      const jaw = smooth((-y - .018) / .12); x *= 1 - jaw * .24; z *= 1 - jaw * .10;
      if (z < 0) z -= jaw * .009; fp.setXYZ(i, x, y, z);
    }
    faceGeo.computeVertexNormals();
    const faceParts = [part(faceGeo, colors.skin), part(sphere(.052, .065, .047, 14, 10), colors.skin, [0, -.148, .008]), part(sphere(.025, .032, .025, 14, 10), 0xaf8b6b, [0, -.008, -.103]),
      part(sphere(.028, .013, .017, 12, 8), 0xb79579, [0, -.028, -.116]), part(sphere(.041, .017, .015, 16, 8), 0x9a785d, [0, -.069, -.088])];
    for (const sign of [-1, 1]) faceParts.push(part(sphere(.014, .030, .020, 12, 8), 0xa58469, [sign * .098, -.003, .004]));
    const head = mesh(merge(faceParts), skin);
    const capGeo = new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * .47); capGeo.scale(.108, .145, .108); capGeo.translate(0, .014, .010);
    const capParts = [part(capGeo, 0x343a36), part(new T.TorusGeometry(.105, .010, 6, 32), 0x424940, [0, .035, .011], [Math.PI / 2, 0, 0], [1, 1, .96])];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; capParts.push(stripe([[Math.sin(a) * .100, .040, Math.cos(a) * .101 + .01], [Math.sin(a) * .077, .112, Math.cos(a) * .077 + .01], [Math.sin(a) * .014, .155, Math.cos(a) * .014 + .01]], 0x454b41, .0015)); }
    const cap = mesh(merge(capParts), cloth, root, false);
    const eyeParts = [];
    for (const sign of [-1, 1]) {
      eyeParts.push(part(sphere(.010, .004, .004, 8, 6), 0x272823, [sign * .058, .008, -.083]));
      eyeParts.push(stripe([[sign * .044, .025, -.093], [sign * .059, .029, -.085], [sign * .074, .023, -.073]], 0x514333, .0025));
    }
    const eyes = mesh(merge(eyeParts), skin, root, false);

    const packRoot = new T.Group(); root.add(packRoot);
    const packGeo = roundBox(.335, .405, .245, .067), pp = packGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setXYZ(i, pp.getX(i) * (1 + .035 * Math.cos(y * 13)), y, pp.getZ(i) * (1 + .07 * Math.cos(y * 11))); } packGeo.computeVertexNormals();
    mesh(merge([part(packGeo, colors.pack)]), cloth, packRoot);
    const packTrimParts = [part(roundBox(.265, .275, .021, .010), colors.packDark, [0, -.025, .128]),
      part(roundBox(.26, .16, .017, .008), colors.pack, [0, -.065, .143]),
      part(roundBox(.30, .057, .070, .025), colors.packLight, [0, .213, .007]),
      part(roundBox(.29, .043, .045, .018), colors.packDark, [0, .224, -.025])];
    // Side bellows and compression webbing are visible in the side-view camera.
    for (const sign of [-1, 1]) {
      packTrimParts.push(part(roundBox(.044, .205, .126, .020), colors.packDark, [sign * .166, -.045, .005]));
      packTrimParts.push(stripe([[sign * .17, .125, -.09], [sign * .184, .09, .002], [sign * .174, .065, .105]], colors.web, .010));
      packTrimParts.push(stripe([[sign * .17, -.095, -.09], [sign * .188, -.12, .002], [sign * .17, -.145, .105]], colors.web, .010));
      packTrimParts.push(stripe([[sign * .128, -.177, .147], [sign * .132, -.02, .153], [sign * .125, .11, .143]], colors.packLight, .002));
    }
    packTrimParts.push(stripe([[0, .235, -.032], [0, .213, .077], [0, .12, .148], [0, -.13, .160]], colors.web, .012));
    for (let y = -.15; y < .10; y += .018) for (const sign of [-1, 1]) packTrimParts.push(part(new T.BoxGeometry(.008, .002, .002), colors.stitch, [sign * .12, y, .155]));
    packTrimParts.push(part(roundBox(.046, .073, .009, .003), colors.coatDark, [-.167, -.015, .063], [0, Math.PI / 2, 0]));
    mesh(merge(packTrimParts), cloth, packRoot, false);
    const hardware = [part(roundBox(.041, .032, .010, .004), colors.metal, [0, .125, .158]), part(roundBox(.025, .022, .013, .003), colors.web, [0, .125, .166])];
    hardware.push(part(new T.TorusGeometry(.028, .004, 6, 16), 0x8b9186, [-.178, -.12, .067], [0, Math.PI / 2, .20], [1, 1.5, 1]));
    mesh(merge(hardware), metal, packRoot, false);

    const hands = {}, boots = {};
    for (const name of ["L", "R"]) {
      const sign = name === "L" ? 1 : -1;
      const handParts = [part(roundBox(.063, .073, .035, .014), colors.glove, [0, 0, .004]),
        part(roundBox(.055, .020, .041, .008), colors.web, [0, -.033, .006])];
      for (let f = 0; f < 4; f++) {
        const x = (f - 1.5) * .014, length = f === 0 || f === 3 ? .037 : .043;
        handParts.push(stripe([[x, .025, -.004], [x, .035, -.019], [x, .026, -length], [x, .010, -length - .005]], colors.glove, .0074));
      }
      handParts.push(stripe([[sign * .026, -.017, .002], [sign * .043, -.005, -.012], [sign * .036, .013, -.026]], colors.glove, .010));
      handParts.push(stripe([[-.022, .008, .024], [0, .015, .026], [.022, .008, .024]], colors.packLight, .0017));
      hands[name] = mesh(merge(handParts), leather);
      const bootParts = [part(roundBox(.139, .125, .245, .037), 0x39413c, [0, -.012, -.043]),
        part(roundBox(.146, .032, .252, .014), colors.rubber, [0, -.065, -.043]),
        part(roundBox(.139, .025, .247, .011), 0x5a5f50, [0, -.046, -.043]),
        part(roundBox(.132, .068, .086, .025), 0x252e2c, [0, -.015, -.133]),
        part(roundBox(.107, .118, .105, .029), 0x303933, [0, .040, .012])];
      for (let i = 0; i < 4; i++) bootParts.push(stripe([[-.032, .047 - i * .013, -.050 - i * .015], [.031, .045 - i * .013, -.064 - i * .015]], 0x959480, .0023));
      for (let i = 0; i < 5; i++) bootParts.push(part(new T.BoxGeometry(.137, .013, .012), colors.rubber, [0, -.081, -.132 + i * .045]));
      boots[name] = mesh(merge(bootParts), leather);
    }

    const scarfCount = 13, scarfPoints = Array.from({ length: scarfCount }, () => ({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 }));
    const scarfGeo = new T.BufferGeometry(), scarfPos = new Float32Array(scarfCount * 6), scarfUV = [], scarfIndices = [];
    for (let i = 0; i < scarfCount; i++) { scarfUV.push(0, i / 3, 1, i / 3); if (i < scarfCount - 1) { const a = i * 2; scarfIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    scarfGeo.setAttribute("position", new T.BufferAttribute(scarfPos, 3).setUsage(T.DynamicDrawUsage)); scarfGeo.setAttribute("uv", new T.Float32BufferAttribute(scarfUV, 2)); scarfGeo.setIndex(scarfIndices);
    mesh(scarfGeo, scarfMat, root, false); let scarfReady = false, scarfPhaseTime = 0;
    function point(origin, rig, y, z, x = 0) { return { x: origin.x + x, y: origin.y + rig.up.y * y + rig.back.y * z, z: origin.z + rig.up.z * y + rig.back.z * z }; }
    function place(mesh, p, q = bodyQ) { mesh.position.set(p.x, p.y, p.z); mesh.quaternion.copy(q); }
    function profile(values, t) { const n = t * (values.length - 1), i = Math.min(values.length - 2, Math.floor(n)); return mix(values[i], values[i + 1], smooth(n - i)); }
    function clothSurface(r) {
      for (const spec of tubeSpecs) {
        const limb = spec.name.startsWith("arm") || spec.name.startsWith("leg"), arm = spec.name.startsWith("arm"), limbSide = spec.name.slice(-1);
        const A = limb ? r[(arm ? "sh" : "pelvis") + limbSide] : r.hip;
        const B = limb ? r[(arm ? "elbow" : "knee") + limbSide] : null;
        const C = limb ? r[(arm ? "hand" : "foot") + limbSide] : null;
        const upper = limb ? new T.Vector3(B.x - A.x, B.y - A.y, B.z - A.z).normalize() : null;
        const lower = limb ? new T.Vector3(C.x - B.x, C.y - B.y, C.z - B.z).normalize() : null;
        const bend = limb ? Math.acos(clamp(upper.dot(lower), -1, 1)) : 0;
        const inside = limb ? lower.clone().sub(upper).normalize() : null;
        for (let j = 0; j < spec.rings; j++) {
          const t = j / (spec.rings - 1); let cx, cy, cz, radiusX, radiusZ;
          if (limb) {
            const first = t <= .5, a = first ? A : B, b = first ? B : C, u = first ? t * 2 : (t - .5) * 2;
            cx = mix(a.x, b.x, u); cy = mix(a.y, b.y, u); cz = mix(a.z, b.z, u);
            // The rig endpoint is the palm contact, not the coat cuff.
            // Stop the sleeve before it so the glove can wrap the rock visibly.
            if (arm && !first) { const cuff = .040 * smooth(u); cx -= lower.x * cuff; cy -= lower.y * cuff; cz -= lower.z * cuff; }
            // A smooth frame around the actual hinge gives cloth a round outside
            // and a compressed crease inside, without moving the joint itself.
            axis.copy(upper).lerp(lower, smooth((t - .37) / .26)).normalize();
            side.set(1, 0, 0).addScaledVector(axis, -axis.x).normalize(); depth.crossVectors(axis, side).normalize();
            const radii = arm ? [.078, .088, .077, .066, .068, .058, .044] : [.103, .111, .101, .083, .080, .071, .060];
            radiusX = profile(radii, t); radiusZ = radiusX * (arm ? .90 : .94);
          } else {
            axis.set(r.up.x || 0, r.up.y, r.up.z); side.set(1, 0, 0); depth.set(r.back.x || 0, r.back.y, r.back.z);
            const pelvis = spec.name === "pelvis", y = pelvis ? mix(-.13, .045, t) : mix(-.035, .545, t);
            const c = point(r.hip, r, y, 0); cx = c.x; cy = c.y; cz = c.z;
            radiusX = pelvis ? profile([.105, .155, .173, .167, .155], t) : profile([.166, .173, .159, .157, .176, .198, .195, .122], t);
            radiusZ = pelvis ? profile([.071, .116, .125, .124, .116], t) : profile([.120, .126, .108, .110, .133, .145, .112, .074], t);
          }
          const jointFold = limb ? Math.exp(-Math.pow((t - .5) / .17, 2)) : .25;
          const sideBend = limb ? inside.dot(side) : 0, depthBend = limb ? inside.dot(depth) : 0;
          for (let k = 0; k <= RADIAL; k++) {
            const {a,sin:sine,cos:cosine}=circular[k], i = spec.offset + j * (RADIAL + 1) + k, o = i * 3;
            const compression = limb ? Math.max(0, sideBend * sine + depthBend * cosine) * Math.sin(bend * .5) : 0;
            const hem = !limb && spec.name === "torso" ? 1 - smooth(t / .22) : 0;
            const foldAmplitude = limb ? .014 + jointFold * (.025 + Math.sin(bend * .5) * .065 + compression * .105) : .014 + .012 * hem;
            const folds = 1 + foldAmplitude * Math.sin(t * Math.PI * (arm ? 13 : 11) + cosine * 2.5 + sine * 1.7) + .012 * Math.sin(a * 5 + t * 11);
            const x = sine * radiusX * folds, z = cosine * radiusZ * folds;
            positions[o] = cx + side.x * x + depth.x * z; positions[o + 1] = cy + side.y * x + depth.y * z; positions[o + 2] = cz + side.z * x + depth.z * z;
          }
        }
      }
      garmentGeometry.attributes.position.needsUpdate = true;
      // Light follows the actual cloth folds and shoulder slope, rather than
      // using cylinder normals that erase the fabric into a smooth tube.
      garmentGeometry.computeVertexNormals();
    }
    function updateScarf(r, state, dt, forecast) {
      const anchor = point(r.neck, r, -.015, .050, -.035), first = scarfPoints[0];
      dt = Math.max(0, Math.min(.035, dt || 0));
      if (!scarfReady || (dt > 0 && Math.hypot(first.y - anchor.y, first.z - anchor.z) > 1.5)) {
        if (!scarfReady) scarfPhaseTime = state.time || 0;
        scarfPoints.forEach((p, i) => { p.x = p.px = anchor.x; p.y = p.py = anchor.y - i * .026; p.z = p.pz = anchor.z + i * .037; }); scarfReady = true;
      }
      if (dt === 0) {
        // A paused pose can still change (cancel charge, resize or inspection).
        // Move both Verlet samples together, keeping shape and stored velocity.
        const dx = anchor.x - first.x, dy = anchor.y - first.y, dz = anchor.z - first.z;
        for (const p of scarfPoints) { p.x += dx; p.px += dx; p.y += dy; p.py += dy; p.z += dz; p.pz += dz; }
      }
      first.x = anchor.x; first.y = anchor.y; first.z = anchor.z;
      if (dt > 0) {
        scarfPhaseTime = state.time || 0;
        const damp = Math.pow(.92, dt * 60), wind = (forecast && forecast.soon) || 0;
        for (let i = 1; i < scarfCount; i++) {
          const p = scarfPoints[i], vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp, vz = (p.z - p.pz) * damp;
          p.px = p.x; p.py = p.y; p.pz = p.z;
          p.x += vx + Math.sin((state.time || 0) * 5 + i * .7) * dt * .005;
          p.y += vy - 4.5 * dt * dt; p.z += vz + (.08 + wind * .65) * dt * dt * 14;
        }
        for (let k = 0; k < 6; k++) for (let i = 1; i < scarfCount; i++) {
          const a = scarfPoints[i - 1], b = scarfPoints[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
          const q = (d - .046) / d; b.x -= dx * q; b.y -= dy * q; b.z -= dz * q;
        }
      }
      for (let i = 0; i < scarfCount; i++) { const p = scarfPoints[i], w = .027 * (1 - i / scarfCount * .35), o = i * 6; scarfPos[o] = p.x - w; scarfPos[o + 1] = p.y; scarfPos[o + 2] = p.z; scarfPos[o + 3] = p.x + w; scarfPos[o + 4] = p.y + Math.sin(i * .8 + scarfPhaseTime * 3) * .005; scarfPos[o + 5] = p.z; }
      scarfGeo.attributes.position.needsUpdate = true; scarfGeo.computeVertexNormals();
    }
    function draw(r, state, dt, forecast) {
      bodyQ.setFromUnitVectors(up, axis.set(r.up.x || 0, r.up.y, r.up.z).normalize());
      clothSurface(r); place(torsoTrim, r.hip); place(head, r.head); place(cap, r.head); place(eyes, r.head);
      const sway = Math.sin((state.time || 0) * 3.1) * .004 * r.w;
      place(packRoot, point(r.shoulder, r, -.215, .207 + sway));
      packRoot.scale.set(mix(.94, 1.13, r.w), mix(.94, 1.12, r.w), mix(.88, 1.14, r.w));
      for (const name of ["L", "R"]) {
        const gripping = (state.attached && !r.standing) || (r.contact && r.contact.weight > .82);
        if (gripping) workQ.identity();
        else workQ.setFromUnitVectors(up, axis.set(r["hand" + name].x - r["elbow" + name].x, r["hand" + name].y - r["elbow" + name].y, r["hand" + name].z - r["elbow" + name].z).normalize());
        place(hands[name], r["hand" + name], workQ);
        workQ.setFromAxisAngle(new T.Vector3(1, 0, 0), -r["bootAngle" + name]); place(boots[name], r["foot" + name], workQ);
      }
      updateScarf(r, state, dt, forecast);
    }
    function setQuality(q) { quality = clamp(q, 0, 2); cloth.bumpScale = quality === 0 ? .00065 : .0010; leather.bumpScale = quality === 0 ? .0008 : .0013; }
    function dispose() { scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }
    let triangles = 0, draws = 0; root.traverse(o => { if (o.isMesh) { draws++; triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    let geometryBytes = 0; geometries.forEach(g => { for (const a of Object.values(g.attributes)) geometryBytes += a.array.byteLength; if (g.index) geometryBytes += g.index.array.byteLength; });
    const stats = { drawCalls: draws, triangles, dynamicVertices: vertexCount + scarfCount * 2, geometryBytes, textureCount: 3, textureBytes: 3 * 256 * 256 * 4, proceduralTextureBytes: 3 * 256 * 256 * 4, textureGpuBytes: 3 * 87381 * 4, procedural: true };
    setQuality(quality);
    return { draw, setQuality, dispose, stats };
  }
  window.FXCharacter = { create };
})();
