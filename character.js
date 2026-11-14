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
    const rgb = value => new T.Color(value);
    const colors = {
      coat: rgb(0xb98149), coatDark: rgb(0x76542f), coatLight: rgb(0xc29862),
      pants: rgb(0x38444a), pantsDark: rgb(0x283136), pantsLight: rgb(0x526067),
      pack: rgb(0x696145), packDark: rgb(0x454735), packLight: rgb(0x8b8060),
      web: rgb(0x32382e), stitch: rgb(0xaaa085), rubber: rgb(0x202725),
      glove: rgb(0x5c5647), skin: rgb(0xb69a7d), red: rgb(0x883e32), metal: rgb(0x9e9b88)
    };
    // The woven surface comes from measured CC0 material maps. Geometry supplies
    // the tailoring and compression; normal maps only supply the fabric grain.
    const loader = new T.TextureLoader(), pending = [], weather = { wet: { value: 0 }, frost: { value: 0 } };
    function track(tex, color = false) {
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.anisotropy = 8;
      if (color) tex.colorSpace = T.SRGBColorSpace;
      textures.add(tex); return tex;
    }
    function loaded(resolve) { return tex => { resolve(tex); }; }
    let clothColor, clothNormal, clothRough, leatherColor, leatherNormal, leatherRough;
    pending.push(new Promise(resolve => { clothColor = track(loader.load("assets/cloth-albedo.webp", loaded(resolve), undefined, () => resolve(null)), true); }));
    pending.push(new Promise(resolve => { clothNormal = track(loader.load("assets/cloth-normal.webp", loaded(resolve), undefined, () => resolve(null))); }));
    pending.push(new Promise(resolve => { clothRough = track(loader.load("assets/cloth-roughness.webp", loaded(resolve), undefined, () => resolve(null))); }));
    pending.push(new Promise(resolve => { leatherColor = track(loader.load("assets/leather-albedo.webp", loaded(resolve), undefined, () => resolve(null)), true); }));
    pending.push(new Promise(resolve => { leatherNormal = track(loader.load("assets/leather-normal.webp", loaded(resolve), undefined, () => resolve(null))); }));
    pending.push(new Promise(resolve => { leatherRough = track(loader.load("assets/leather-roughness.webp", loaded(resolve), undefined, () => resolve(null))); }));
    const ready = Promise.all(pending);
    const material = settings => { const m = new T.MeshPhysicalMaterial(settings); materials.add(m); return m; };
    function weathered(m, gain = 1, frostAmount = 1) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uClothWet = weather.wet; shader.uniforms.uClothFrost = weather.frost;
        shader.uniforms.uFabricGain = { value: gain }; shader.uniforms.uFrostAmount = { value: frostAmount };
        shader.vertexShader = "varying vec3 vClothNormal;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvClothNormal = normalize(mat3(modelMatrix) * normal);");
        shader.fragmentShader = "uniform float uClothWet, uClothFrost, uFabricGain, uFrostAmount;\nvarying vec3 vClothNormal;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
          #ifdef USE_MAP
            // Preserve broad scanned fibre variation after minification. A
            // neutral gain alone made every midtone collapse into flat colour.
            vec3 fabricSample = texture2D(map, vMapUv).rgb;
            float fabricLuma = dot(fabricSample, vec3(.2126, .7152, .0722));
            float fabricContrast = uFabricGain > 2.5 ? clamp((fabricLuma - .132) * 2.4 + .132, .045, .38) / max(.02, fabricLuma) : 1.0;
            diffuseColor.rgb *= fabricContrast;
          #endif
          diffuseColor.rgb *= uFabricGain * (1.0 - uClothWet * .23);
          float fibre = 0.6;
          #ifdef USE_ROUGHNESSMAP
            fibre = texture2D(roughnessMap, vRoughnessMapUv).g;
          #endif
          float frostCoverage = uClothFrost * uFrostAmount * smoothstep(.13, .86, normalize(vClothNormal).y + fibre * .34);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.57, .65, .69), frostCoverage * .72);
        `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (1.0 - uClothWet * .20), .92, frostCoverage);");
      };
      m.customProgramCacheKey = () => "expedition-fabric-v4-" + gain + "-" + frostAmount;
      return m;
    }
    const woven = { color: 0xffffff, vertexColors: true, map: clothColor, normalMap: clothNormal, roughnessMap: clothRough, metalness: 0 };
    const cloth = weathered(material({ ...woven, normalScale: new T.Vector2(.95, .95), roughness: .80, sheen: .15, sheenRoughness: .8, sheenColor: 0xbcbcb2 }), 3.0);
    const trousers = weathered(material({ ...woven, normalScale: new T.Vector2(.90, .90), roughness: .89, sheen: .16, sheenRoughness: .9 }), 3.0, .82);
    const canvas = weathered(material({ ...woven, normalScale: new T.Vector2(1.1, 1.1), roughness: .87, sheen: .20, sheenRoughness: .86 }), 3.0);
    const leather = weathered(material({ color: 0xffffff, vertexColors: true, map: leatherColor, normalMap: leatherNormal, roughnessMap: leatherRough, normalScale: new T.Vector2(.30, .30), roughness: .87, clearcoat: .10, clearcoatRoughness: .65 }), 2.2, .55);
    const rubber = weathered(material({ color: 0xffffff, vertexColors: true, roughness: .92 }), 1, .35);
    const skin = material({ color: 0xffffff, vertexColors: true, roughness: .67, specularIntensity: .42, sheen: .07, sheenColor: 0xb67d64, sheenRoughness: .9 });
    const metal = material({ color: 0xffffff, vertexColors: true, roughness: .34, metalness: .80 });
    const scarfMat = weathered(material({ color: 0x873b2e, map: clothColor, normalMap: clothNormal, roughnessMap: clothRough, normalScale: new T.Vector2(.40, .40), roughness: 1, sheen: .30, sheenRoughness: .9, side: T.DoubleSide }), 3.0, .65);
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
        const a = g.attributes.position, b = g.attributes.normal, u = g.attributes.uv, tint = g.attributes.color;
        for (let i = 0; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(matrix); n.fromBufferAttribute(b, i).applyMatrix3(normalMatrix).normalize();
          position.push(v.x, v.y, v.z); normal.push(n.x, n.y, n.z); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
          color.push(p.color.r * (tint ? tint.getX(i) : 1), p.color.g * (tint ? tint.getY(i) : 1), p.color.b * (tint ? tint.getZ(i) : 1));
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


    // A strap is a flattened woven ribbon, not a round hose. The wide axis is
    // projected across the route so it lies flat over the shoulder or pack.
    function ribbon(points, width, color, across = [1, 0, 0], thickness = .003) {
      const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), pos = [], uv = [], idx = [];
      const tangent = new T.Vector3(), lateral = new T.Vector3(), normal = new T.Vector3(), p = new T.Vector3();
      const steps = 24;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps; path.getPointAt(t, p); path.getTangentAt(t, tangent);
        lateral.set(...across).addScaledVector(tangent, -tangent.dot(new T.Vector3(...across))).normalize();
        normal.crossVectors(tangent, lateral).normalize();
        for (let k = 0; k < 4; k++) {
          const edge = k === 0 || k === 3 ? -1 : 1, face = k < 2 ? -1 : 1;
          pos.push(p.x + lateral.x * width * edge / 2 + normal.x * thickness * face / 2, p.y + lateral.y * width * edge / 2 + normal.y * thickness * face / 2, p.z + lateral.z * width * edge / 2 + normal.z * thickness * face / 2);
          uv.push(k % 2, t * 4);
          if (j < steps) { const a = j * 4 + k, b = j * 4 + (k + 1) % 4; idx.push(a, b, a + 4, b, b + 4, a + 4); }
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return part(g, color);
    }
    // Tailored coat and trousers share one dynamic buffer but retain separate
    // surface responses. Extra rings describe a few real compression creases.
    const RADIAL = 28, circular = Array.from({ length: RADIAL + 1 }, (_, i) => ({ a: i / RADIAL * Math.PI * 2, sin: Math.sin(i / RADIAL * Math.PI * 2), cos: Math.cos(i / RADIAL * Math.PI * 2) })), tubeSpecs = [
      { name: "torso", rings: 29 }, { name: "armL", rings: 45 }, { name: "armR", rings: 45 },
      { name: "pelvis", rings: 15 }, { name: "legL", rings: 47 }, { name: "legR", rings: 47 }
    ];
    let vertexCount = 0, coatIndexCount = 0;
    for (const spec of tubeSpecs) { spec.offset = vertexCount; vertexCount += spec.rings * (RADIAL + 1); }
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2), dyes = new Float32Array(vertexCount * 3), indices = [];
    const creaseRest = new Float32Array(vertexCount), creaseFlex = new Float32Array(vertexCount), creaseCuff = new Float32Array(vertexCount);
    for (const spec of tubeSpecs) {
      const arm = spec.name.startsWith("arm"), leg = spec.name.startsWith("leg"), shell = spec.name === "torso" || arm;
      for (let j = 0; j < spec.rings; j++) for (let k = 0; k <= RADIAL; k++) {
        const i = spec.offset + j * (RADIAL + 1) + k, t = j / (spec.rings - 1), a = k / RADIAL * Math.PI * 2;
        const sine = Math.sin(a), cosine = Math.cos(a);
        // Bake the cut pattern once. Only hinge compression changes each frame.
        if (arm || leg) {
          const diagonal = .022 * sine + .016 * cosine;
          const fold = (center, width) => Math.exp(-Math.pow((t - center - diagonal) / width, 2));
          creaseFlex[i] = .0030 * fold(.397, .033) - .0115 * fold(.449, .026) + .0045 * fold(.492, .030) - .0100 * fold(.543, .025) + .0030 * fold(.588, .034);
          creaseCuff[i] = -.0038 * Math.exp(-Math.pow((t - .892 - sine * .020) / .026, 2)) + .0016 * Math.exp(-Math.pow((t - .925 - sine * .020) / .022, 2));
          creaseRest[i] = -.0045 * Math.exp(-Math.pow((t - .14 - cosine * .045) / .024, 2)) * (.35 + .65 * Math.max(0, cosine));
          creaseRest[i] += -.0030 * Math.exp(-Math.pow((t - .255 + sine * .035) / .028, 2)) * Math.max(0, sine);
          creaseRest[i] += -.0018 * Math.exp(-Math.pow(cosine / .12, 2));
        } else if (spec.name === "torso") {
          const front = smooth((-cosine - .10) / .75), flank = Math.pow(Math.abs(sine), 3), diagonal = .09 * Math.abs(sine);
          const fold = (center, width) => Math.exp(-Math.pow((t - center) / width, 2));
          creaseRest[i] = front * (.0030 * fold(.27 + diagonal, .035) - .0068 * fold(.32 + diagonal, .028)) + .0022 * fold(.09 + .018 * sine, .024) - .0050 * fold(.14 + .018 * sine, .025);
          creaseFlex[i] = flank * (.0027 * fold(.67 - diagonal, .039) - .0082 * fold(.73 - diagonal, .030) + .0022 * fold(.79 - diagonal, .030));
        } else creaseRest[i] = .0024 * Math.exp(-Math.pow((t - .74 - sine * .08) / .085, 2)) * Math.max(0, -cosine);
        const c = (shell ? colors.coat : colors.pants).clone();
        // Dark gussets, articulated knee panels and sun-abraded outer edges are
        // cut into the garment, rather than painted as repeating noisy stripes.
        const sidePanel = Math.pow(Math.abs(Math.sin(a)), 8);
        if (spec.name === "torso") {
          c.lerp(colors.coatDark, sidePanel * (.20 + .22 * smooth(t)));
          c.lerp(colors.coatDark, (1 - smooth(t / .12)) * .22);
        }
        if (arm) {
          c.lerp(colors.coatDark, smooth((t - .88) / .10) * .85);
          const shoulderSeam = Math.exp(-Math.pow((t - .15 - .045 * cosine) / .012, 2));
          const elbowPanel = Math.exp(-Math.pow((t - .53 - .015 * sine) / .16, 6)) * Math.max(0, cosine) * .15;
          c.lerp(colors.coatDark, shoulderSeam * .45 + elbowPanel);
          const underarm = Math.exp(-Math.pow(cosine / .15, 2));
          c.lerp(colors.coatDark, underarm * .20);
        }
        if (leg) {
          c.lerp(colors.pantsDark, Math.exp(-Math.pow((t - .49) / .14, 6)) * Math.max(0, cosine) * .65);
          const kneeSeam = Math.exp(-Math.pow((t - .33 - .023 * cosine) / .012, 2)) + Math.exp(-Math.pow((t - .67 + .025 * cosine) / .012, 2));
          c.lerp(colors.pantsLight, kneeSeam * .19 * Math.max(0, cosine));
        }
        const seam = Math.exp(-Math.pow(Math.sin(a) / .09, 2));
        const wear = .97 + sidePanel * .065 + seam * .018;
        c.multiplyScalar(wear); dyes.set([c.r, c.g, c.b], i * 3);
        uvs.set([k / RADIAL * (arm ? .85 : leg ? 1.0 : 1.6), t * (arm ? 1.3 : leg ? 1.5 : spec.name === "torso" ? 1.05 : .35)], i * 2);
        if (j < spec.rings - 1 && k < RADIAL) {
          const b = i + RADIAL + 1;
          if (spec.name === "torso" || spec.name === "pelvis") indices.push(i, i + 1, b, i + 1, b + 1, b);
          else indices.push(i, b, i + 1, i + 1, b, b + 1);
        }
      }
      if (shell) coatIndexCount = indices.length;
    }
    const garmentGeometry = new T.BufferGeometry(); garmentGeometry.setAttribute("position", new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    garmentGeometry.setAttribute("normal", new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage)); garmentGeometry.setAttribute("uv", new T.BufferAttribute(uvs, 2)); garmentGeometry.setAttribute("color", new T.BufferAttribute(dyes, 3)); garmentGeometry.setIndex(indices);
    garmentGeometry.addGroup(0, coatIndexCount, 0); garmentGeometry.addGroup(coatIndexCount, indices.length - coatIndexCount, 1);
    mesh(garmentGeometry, [cloth, trousers]);
    const torsoTrimParts = [];
    // The stitched hem is part of the deforming garment, without intersecting wire rings.
    torsoTrimParts.push(stripe([[0, .025, -.128], [0, .22, -.114], [0, .42, -.132], [0, .53, -.084]], colors.web, .004));
    torsoTrimParts.push(part(roundBox(.014, .027, .007, .003), colors.metal, [0, .43, -.129]));
    torsoTrimParts.push(part(roundBox(.085, .105, .009, .004), colors.coatDark, [-.102, .29, -.120], [0, -.33, 0]));
    torsoTrimParts.push(stripe([[-.145, .337, -.111], [-.108, .345, -.139], [-.065, .341, -.138]], colors.coatLight, .002));
    // Sewn hip belt, front clasp, shoulder straps and a close-fitting storm collar.
    torsoTrimParts.push(ribbon(Array.from({ length: 33 }, (_, i) => { const a = i / 32 * Math.PI * 2; return [Math.sin(a) * .174, .047, Math.cos(a) * .136]; }), .030, colors.web, [0, 1, 0]));
    torsoTrimParts.push(part(roundBox(.043, .026, .009, .004), colors.web, [0, .047, -.140]));
    for (const sign of [-1, 1]) {
      torsoTrimParts.push(ribbon([[sign * .105, .12, -.090], [sign * .120, .31, -.106], [sign * .140, .48, -.071], [sign * .148, .55, .03], [sign * .14, .48, .245]], .036, colors.web, [1, 0, 0], .006));
      torsoTrimParts.push(stripe([[sign * .108, .14, -.096], [sign * .124, .32, -.111], [sign * .144, .45, -.086]], colors.packLight, .002));
      torsoTrimParts.push(part(roundBox(.035, .038, .013, .005), colors.packDark, [sign * .112, .18, -.087]));
    }
    torsoTrimParts.push(part(new T.TorusGeometry(.087, .027, 8, 28), colors.coatDark, [0, .552, .014], [Math.PI / 2, 0, 0], [1.24, 1, .68]));
    torsoTrimParts.push(part(new T.TorusGeometry(.074, .021, 8, 24), colors.red, [0, .585, .003], [Math.PI / 2, 0, 0], [1.11, 1, .80]));
    // Collapsed hood folds stay close to the shoulder, below the head.
    torsoTrimParts.push(part(sphere(.118, .050, .058), colors.coat, [0, .530, .099]));
    torsoTrimParts.push(stripe([[-.105, .535, .080], [0, .551, .145], [.105, .535, .080]], colors.coatLight, .003));
    const torsoTrim = mesh(merge(torsoTrimParts), cloth);

    // A continuous face mesh gives the nose, cheek planes, sockets and jaw a
    // shared surface. Narrow eyelids remain readable without oversized eyes.
    const faceGeo = sphere(.099, .137, .101, 64, 48), fp = faceGeo.attributes.position, faceTint = [];
    const gaussian = (x, y, cx, cy, sx, sy) => Math.exp(-Math.pow((x - cx) / sx, 2) - Math.pow((y - cy) / sy, 2));
    for (let i = 0; i < fp.count; i++) {
      let x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
      const jaw = smooth((-y - .022) / .105); x *= 1 - jaw * .19; z *= 1 - jaw * .08;
      const front = smooth((-z - .025) / .055);
      const noseBridge = gaussian(x, y, 0, .008, .014, .054), noseTip = gaussian(x, y, 0, -.023, .022, .020);
      const sockets = gaussian(x, y, -.048, .010, .028, .018) + gaussian(x, y, .048, .010, .028, .018);
      const brow = gaussian(x, y, -.042, .037, .028, .011) + gaussian(x, y, .042, .037, .028, .011);
      const cheeks = gaussian(x, y, -.057, -.022, .027, .032) + gaussian(x, y, .057, -.022, .027, .032);
      const mouth = gaussian(x, y, 0, -.056, .033, .008), chin = gaussian(x, y, 0, -.088, .037, .023);
      z += front * (-noseBridge * .018 - noseTip * .031 + sockets * .009 - brow * .007 - cheeks * .006 - mouth * .004 - chin * .010);
      fp.setXYZ(i, x, y, z);
      const beard = front * smooth((-y - .040) / .048) * (1 - gaussian(x, y, 0, -.063, .030, .013) * .65);
      const coldCheek = cheeks * front, socketShade = sockets * front * .28;
      const temple = smooth((Math.abs(x) - .065) / .025) * smooth((y - .003) / .025);
      const hair = Math.max(temple, smooth((z - .012) / .050) * smooth((y - .020) / .022)) * .64;
      const noseFlush = noseTip * front;
      faceTint.push(1 - beard * .34 - socketShade - hair + coldCheek * .025, 1 - beard * .35 - coldCheek * .12 - socketShade - hair - noseFlush * .11, 1 - beard * .32 - coldCheek * .13 - socketShade - hair - noseFlush * .13);
    }
    faceGeo.setAttribute("color", new T.Float32BufferAttribute(faceTint, 3)); faceGeo.computeVertexNormals();
    const faceParts = [part(faceGeo, colors.skin), part(sphere(.050, .066, .047, 18, 12), colors.skin, [0, -.145, .010])];
    for (const sign of [-1, 1]) {
      faceParts.push(part(sphere(.012, .026, .017, 16, 12), 0xb68a70, [sign * .096, -.006, .008], [0, 0, -sign * .12]));
      faceParts.push(part(sphere(.003, .014, .008, 10, 8), 0x906c55, [sign * .106, -.006, .004]));
    }
    const head = mesh(merge(faceParts), skin);
    const capGeo = new T.SphereGeometry(1, 96, 30, 0, Math.PI * 2, 0, Math.PI * .46); capGeo.scale(.105, .139, .106); capGeo.translate(0, .014, .010);
    const cp = capGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i) - .010, a = Math.atan2(x, z);
      const rib = -.0019 * (1 - Math.cos(a * 24 + Math.sin(y * 110) * .21)) * (1 - smooth((y - .12) / .03));
      const radius = Math.hypot(x, z) || 1, scale = (radius + rib) / radius;
      cp.setXYZ(i, x * scale + .006 * smooth((y - .07) / .08), y, z * scale + .010);
    }
    capGeo.computeVertexNormals();
    const capParts = [part(capGeo, 0x646959), part(new T.TorusGeometry(.102, .009, 10, 96), 0x7a7b66, [0, .035, .011], [Math.PI / 2, 0, 0], [1, 1, .98])];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; capParts.push(stripe([[Math.sin(a) * .102, .042, Math.cos(a) * .103 + .01], [Math.sin(a) * .078 + .002, .110, Math.cos(a) * .078 + .01], [.006, .153, .01]], 0x626659, .0013)); }
    capParts.push(part(roundBox(.024, .017, .002, .001), 0x9a8d6f, [-.092, .044, .044], [0, -1.05, 0]));
    const cap = mesh(merge(capParts), canvas, root, false);
    const eyeParts = [];
    for (const sign of [-1, 1]) {
      eyeParts.push(part(sphere(.010, .0025, .0025, 12, 8), 0x362f27, [sign * .050, .009, -.083]));
      eyeParts.push(stripe([[sign * .034, .013, -.091], [sign * .051, .017, -.086], [sign * .065, .011, -.075]], 0x866e58, .0017));
      eyeParts.push(stripe([[sign * .027, .032, -.094], [sign * .044, .035, -.088], [sign * .063, .028, -.075]], 0x504333, .0020));
      eyeParts.push(part(sphere(.004, .002, .002, 8, 6), 0x665141, [sign * .014, -.032, -.122]));
    }
    eyeParts.push(stripe([[-.025, -.056, -.096], [0, -.058, -.102], [.025, -.056, -.096]], 0x76574b, .0012));
    const eyes = mesh(merge(eyeParts), skin, root, false);

    const packRoot = new T.Group(); root.add(packRoot);
    // Elliptical, compressed canvas panels follow the packed load. The shaped
    // bottom and shoulder taper replace the previous rigid rounded brick.
    const packPos = [], packUV = [], packIndex = [], packDye = [], packRings = 25, packSides = 36;
    for (let j = 0; j <= packRings; j++) {
      const t = j / packRings, y = mix(-.212, .215, t), taper = profile([.08, .84, 1, 1, .96, .90, .68, .08], t);
      for (let k = 0; k <= packSides; k++) {
        const a = k / packSides * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
        const edge = Math.pow(Math.abs(sn), .78), back = Math.pow(Math.abs(cs), .72);
        const compression = .008 * (Math.exp(-Math.pow((t - .27) / .045, 2)) + Math.exp(-Math.pow((t - .73) / .045, 2))) * edge ** 4;
        const x = Math.sign(sn) * edge * (.168 * taper - compression);
        const z = Math.sign(cs) * back * (.124 * taper - compression * .6);
        packPos.push(x, y, z); packUV.push(k / packSides * 1.6, t * .8);
        const worn = .95 + .09 * edge ** 6 + .05 * smooth((t - .65) / .3);
        packDye.push(colors.pack.r * worn, colors.pack.g * worn, colors.pack.b * worn);
        if (j < packRings && k < packSides) { const i = j * (packSides + 1) + k, b = i + packSides + 1; packIndex.push(i, i + 1, b, i + 1, b + 1, b); }
      }
    }
    const packGeo = new T.BufferGeometry(); packGeo.setAttribute("position", new T.Float32BufferAttribute(packPos, 3)); packGeo.setAttribute("uv", new T.Float32BufferAttribute(packUV, 2)); packGeo.setAttribute("color", new T.Float32BufferAttribute(packDye, 3)); packGeo.setIndex(packIndex); packGeo.computeVertexNormals();
    mesh(packGeo, canvas, packRoot);
    const packTrimParts = [part(roundBox(.253, .256, .017, .008), colors.packDark, [0, -.021, .124]),
      part(roundBox(.235, .147, .019, .009), colors.pack, [0, -.064, .137]),
      part(roundBox(.294, .050, .105, .024), colors.packLight, [0, .207, .014]),
      part(roundBox(.274, .025, .058, .012), colors.packDark, [0, .225, -.015])];
    for (const sign of [-1, 1]) {
      packTrimParts.push(part(roundBox(.039, .188, .115, .018), colors.packDark, [sign * .163, -.043, .002]));
      packTrimParts.push(ribbon([[sign * .160, .118, -.09], [sign * .183, .089, .002], [sign * .166, .064, .105]], .022, colors.web, [0, 1, 0]));
      packTrimParts.push(ribbon([[sign * .160, -.096, -.09], [sign * .184, -.12, .002], [sign * .163, -.145, .105]], .022, colors.web, [0, 1, 0]));
      packTrimParts.push(stripe([[sign * .122, -.166, .140], [sign * .125, -.02, .148], [sign * .120, .102, .138]], colors.packLight, .0018));
      packTrimParts.push(stripe([[sign * .178, -.128, -.031], [sign * .182, -.05, -.035], [sign * .177, .043, -.033]], colors.stitch, .0014));
    }
    packTrimParts.push(ribbon([[0, .233, -.030], [0, .213, .079], [0, .12, .145], [0, -.13, .153]], .026, colors.web));
    packTrimParts.push(ribbon([[-.047, .215, -.042], [-.044, .250, -.042], [.044, .250, -.042], [.047, .215, -.042]], .018, colors.web, [0, 0, 1], .004));
    // The bartacks and double-stitched pocket edge sit on the actual panel.
    for (let y = -.145; y < .10; y += .014) for (const sign of [-1, 1]) packTrimParts.push(part(new T.BoxGeometry(.0045, .0013, .0014), colors.stitch, [sign * .117, y, .148]));
    packTrimParts.push(part(roundBox(.039, .060, .005, .002), colors.coatDark, [-.181, -.013, .044], [0, Math.PI / 2, 0]));
    mesh(merge(packTrimParts), canvas, packRoot, false);
    const hardware = [part(roundBox(.036, .030, .010, .003), colors.metal, [0, .125, .151]), part(roundBox(.021, .019, .011, .003), colors.web, [0, .125, .158])];
    hardware.push(part(new T.TorusGeometry(.024, .0035, 8, 24), 0xa8ad9b, [-.178, -.12, .066], [0, Math.PI / 2, .20], [1, 1.5, 1]));
    hardware.push(part(new T.CylinderGeometry(.0022, .0022, .034, 8), 0xd2d3bb, [-.179, -.120, .087], [0, 0, .25]));
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
      const boot = new T.Group(); root.add(boot); boots[name] = boot;
      const upperGeo = roundBox(.136, .120, .239, .034), bootPosition = upperGeo.attributes.position;
      for (let i = 0; i < bootPosition.count; i++) {
        const x = bootPosition.getX(i), y = bootPosition.getY(i), z = bootPosition.getZ(i);
        // Anatomical toe taper and a raised instep read as footwear in profile.
        const toe = smooth((-z - .025) / .09), instep = Math.exp(-Math.pow((z + .010) / .065, 2));
        bootPosition.setXYZ(i, x * (1 - toe * .075), y + (y > 0 ? instep * .008 - toe * .013 : 0), z);
      }
      upperGeo.computeVertexNormals();
      const bootParts = [part(upperGeo, 0x677064, [0, -.012, -.043]),
        part(roundBox(.103, .116, .104, .027), 0x5b6557, [0, .039, .012]),
        part(roundBox(.052, .078, .012, .006), 0x767b65, [0, .046, -.040], [-.25, 0, 0])];
      for (let i = 0; i < 4; i++) {
        const y = .055 - i * .016, z = -.043 - i * .020;
        bootParts.push(stripe([[-.032, y, z], [0, y - .004, z - .006], [.031, y - .003, z - .014]], 0xb0a58b, .0020));
        bootParts.push(stripe([[.032, y, z], [0, y - .003, z - .006], [-.031, y - .003, z - .014]], 0xa39982, .0017));
      }
      for (const sign of [-1, 1]) bootParts.push(stripe([[sign * .054, .054, .032], [sign * .061, -.010, .005], [sign * .061, -.024, -.070], [sign * .045, -.021, -.140]], 0xa0987c, .0014));
      mesh(merge(bootParts), leather, boot);
      const soleParts = [part(roundBox(.146, .031, .252, .013), colors.rubber, [0, -.065, -.043]),
        part(roundBox(.140, .020, .247, .010), 0x555c50, [0, -.046, -.043]),
        part(roundBox(.128, .058, .084, .024), 0x29322e, [0, -.019, -.133]),
        part(roundBox(.108, .060, .038, .014), 0x2f3830, [0, -.017, .067])];
      for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) soleParts.push(part(new T.BoxGeometry(.055, .012, .015), colors.rubber, [sign * .039, -.081, -.131 + i * .045], [0, sign * .22, 0]));
      mesh(merge(soleParts), rubber, boot);

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
            const radii = arm ? [.076, .086, .080, .066, .069, .058, .043] : [.105, .112, .103, .084, .081, .072, .058];
            radiusX = profile(radii, t); radiusZ = radiusX * (arm ? .90 : .94);
          } else {
            axis.set(r.up.x || 0, r.up.y, r.up.z); side.set(1, 0, 0); depth.set(r.back.x || 0, r.back.y, r.back.z);
            const pelvis = spec.name === "pelvis", y = pelvis ? mix(-.13, .045, t) : mix(-.035, .545, t);
            const c = point(r.hip, r, y, 0); cx = c.x; cy = c.y; cz = c.z;
            radiusX = pelvis ? profile([.105, .155, .173, .167, .155], t) : profile([.165, .171, .159, .158, .178, .195, .191, .117], t);
            radiusZ = pelvis ? profile([.071, .116, .125, .124, .116], t) : profile([.120, .126, .108, .110, .133, .145, .112, .074], t);
          }
          const sideBend = limb ? inside.dot(side) : 0, depthBend = limb ? inside.dot(depth) : 0;
          const flex = Math.sin(bend * .5);
          for (let k = 0; k <= RADIAL; k++) {
            const { sin: sine, cos: cosine } = circular[k], i = spec.offset + j * (RADIAL + 1) + k, o = i * 3;
            let crease = creaseRest[i];
            if (limb) {
              // Inner fabric compresses while the outer hinge is pulled smooth.
              const compression = Math.max(0, sideBend * sine + depthBend * cosine) * flex;
              crease += compression * creaseFlex[i] + creaseCuff[i] * (1 - .45 * flex);
            } else if (spec.name === "torso") crease += creaseFlex[i] * smooth(Math.max(0, Math.cos(r.theta || 0)));
            // Creases carve into the cloth; the outer envelope remains the
            // authoritative tapered limb capsule, including the narrow cuff.
            const envelope = limb ? arm ? (t <= .5 ? mix(.094, .080, t * 2) : mix(.080, .046, (t - .5) * 2)) : (t <= .5 ? mix(.120, .094, t * 2) : mix(.091, .064, (t - .5) * 2)) : Math.max(radiusX, radiusZ) + .003;
            crease = Math.min(crease, envelope - Math.max(radiusX, radiusZ) - .0005);
            const x = sine * (radiusX + crease), z = cosine * (radiusZ + crease);
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
      const game = window.Fangxia;
      const altitude = game ? clamp(state.y / Math.max(1, game.SUMMIT_Y), 0, 1) : 0;
      const storm = game ? game.stormOf(state.mask, state.y, !!(state.returning || state.descending)) : 0;
      weather.wet.value = smooth((storm - .18) / .58) * (1 - smooth((altitude - .76) / .22) * .5);
      weather.frost.value = smooth((altitude - .53) / .38) * smooth((storm - .36) / .58);
      bodyQ.setFromUnitVectors(up, axis.set(r.up.x || 0, r.up.y, r.up.z).normalize());
      clothSurface(r); place(torsoTrim, r.hip);
      const lookPitch = clamp(Math.atan2((r.handL.y + r.handR.y) * .5 - r.head.y, .70) * .20, -.18, .22);
      workQ.setFromEuler(new T.Euler(lookPitch, .20, 0)); workQ.premultiply(bodyQ);
      place(head, r.head, workQ); place(cap, r.head, workQ); place(eyes, r.head, workQ);
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
    function setQuality(q) {
      quality = clamp(q, 0, 2);
      const level = quality === 0 ? .65 : 1;
      cloth.normalScale.setScalar(.95 * level); trousers.normalScale.setScalar(.90 * level); canvas.normalScale.setScalar(1.1 * level); leather.normalScale.setScalar(.30 * level);
      const anisotropy = quality === 0 ? 2 : quality === 1 ? 4 : 8;
      for (const tex of textures) if (tex.anisotropy !== anisotropy) { tex.anisotropy = anisotropy; tex.needsUpdate = true; }
    }
    function dispose() { scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }
    let triangles = 0, draws = 0;
    root.traverse(o => { if (o.isMesh) { draws += Array.isArray(o.material) ? o.geometry.groups.length : 1; triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    let geometryBytes = 0; geometries.forEach(g => { for (const a of Object.values(g.attributes)) geometryBytes += a.array.byteLength; if (g.index) geometryBytes += g.index.array.byteLength; });
    function textureBytes(mipmaps) {
      let bytes = 0;
      textures.forEach(t => { const image = t.image; if (image) bytes += image.width * image.height * 4 * (mipmaps ? 4 / 3 : 1); });
      return Math.ceil(bytes);
    }
    const stats = { drawCalls: draws, triangles, dynamicVertices: vertexCount + scarfCount * 2, geometryBytes, textureCount: textures.size,
      get textureBytes() { return textureBytes(false); }, proceduralTextureBytes: 0, get textureGpuBytes() { return textureBytes(true); }, procedural: false, scannedPBR: true };
    setQuality(quality);
    return { draw, setQuality, dispose, stats, ready };

  }
  window.FXCharacter = { create };
})();
