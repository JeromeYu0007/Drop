/* Three.js scene. The cliff mesh, including every hold, comes from Fangxia.buildCliffMesh. */
(function () {
  "use strict";
  const FX = window.Fangxia;
  const THREE = window.THREE;

  let renderer, scene, camera, rock, rockMat, uniforms;
  let sky, skyUniforms, ridges;
  let moon, rim, hemi;
  let climber, bones, scarfPts, packMesh;
  let rain, rainPos, drops;
  let aimLine, aimPos;
  let lostMeshes, door;
  let sceneRT, bloomRT, bloomRT2, quad, quadCamera, brightMat, blurMat, postMat;
  let quality = 2;
  let bloomOn = true;
  let pixelRatio = 1;
  let viewW = 2, viewH = 2;
  let fps = 60;
  let fpsN = 0, fpsT = 0;
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function limbGeo(radii) {
    const pts = [];
    for (let i = 0; i < radii.length; i++) {
      pts.push(new THREE.Vector2(radii[i], -0.5 + i / (radii.length - 1)));
    }
    return new THREE.LatheGeometry(pts, 8);
  }

  function rockShader(shader) {
    shader.uniforms.uWet = uniforms.uWet;
    shader.uniforms.uFlash = uniforms.uFlash;
    shader.uniforms.uDetail = uniforms.uDetail;
    shader.uniforms.uCamY = uniforms.uCamY;
    shader.uniforms.uTop = uniforms.uTop;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW;\nvarying vec3 vWN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n  vWN = normalize(mat3(modelMatrix) * objectNormal);")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", [
        "#include <common>",
        "varying vec3 vW;",
        "varying vec3 vWN;",
        "uniform float uWet;",
        "uniform float uFlash;",
        "uniform float uDetail;",
        "uniform float uCamY;",
        "uniform float uTop;",
        "float hash3(vec3 p){",
        "  p = fract(p * 0.1031);",
        "  p += dot(p, p.yzx + 33.33);",
        "  return fract((p.x + p.y) * p.z);",
        "}",
        "float vnoise3(vec3 p){",
        "  vec3 i = floor(p); vec3 f = fract(p);",
        "  f = f * f * (3.0 - 2.0 * f);",
        "  float n000 = hash3(i);",
        "  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));",
        "  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));",
        "  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));",
        "  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));",
        "  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));",
        "  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));",
        "  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));",
        "  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),",
        "             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);",
        "}",
        "float fbm(vec3 p){",
        "  float a = 0.5; float s = 0.0;",
        "  s += a * vnoise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.4); a *= 0.5;",
        "  s += a * vnoise3(p); p = p * 2.03 + vec3(8.3, 2.8, 4.1); a *= 0.5;",
        "  s += a * vnoise3(p);",
        "  return s;",
        "}",
        "float tri; float streak;",
      ].join("\n"))
      .replace("#include <color_fragment>", [
        "#include <color_fragment>",
        "tri = fbm(vW * 0.72);",
        "float fine = fbm(vW.yzx * 1.85);",
        "float strata = smoothstep(0.4, 0.6, fract(vW.y * 0.31 + tri * 0.12));",
        "vec3 rock = mix(vec3(0.34, 0.31, 0.28), vec3(0.62, 0.54, 0.46), tri);",
        "rock = mix(rock, rock * vec3(0.62, 0.56, 0.48), strata * 0.85);",
        "float lichen = smoothstep(0.58, 0.8, fbm(vW * 2.1 + 4.0)) * smoothstep(0.1, 0.65, vWN.y);",
        "rock = mix(rock, vec3(0.32, 0.38, 0.24), lichen * 0.55);",
        "streak = smoothstep(0.68, 0.9, fbm(vec3(vW.x * 5.0, vW.y * 0.28, vW.z * 5.0)));",
        "rock = mix(rock, rock * vec3(0.45, 0.50, 0.56), streak * uWet);",
        "float snow = smoothstep(0.5, 0.86, vWN.y) * smoothstep(uTop * 0.72, uTop * 0.94, vW.y);",
        "rock = mix(rock, vec3(0.78, 0.81, 0.86), snow * 0.82);",
        "float cavity = smoothstep(0.2, -0.45, vWN.y) * 0.45 + (1.0 - fine) * 0.08;",
        "rock *= 1.0 - cavity;",
        "diffuseColor.rgb = rock * diffuseColor.rgb * (1.0 + uFlash * 0.85);",
      ].join("\n"))
      .replace("#include <normal_fragment_begin>", [
        "#include <normal_fragment_begin>",
        "{",
        "  vec3 wN = normalize(vWN);",
        "  float e = 0.14;",
        "  vec3 sp = vW * 4.6;",
        "  float hx = fbm(sp + vec3(e, 0.0, 0.0)) - fbm(sp - vec3(e, 0.0, 0.0));",
        "  float hy = fbm(sp + vec3(0.0, e, 0.0)) - fbm(sp - vec3(0.0, e, 0.0));",
        "  float hz = fbm(sp + vec3(0.0, 0.0, e)) - fbm(sp - vec3(0.0, 0.0, e));",
        "  wN = normalize(wN + vec3(hx, hy, hz) * uDetail);",
        "  normal = normalize(mat3(viewMatrix) * wN);",
        "}",
      ].join("\n"))
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor *= mix(1.0, 0.4, streak * uWet);")
      .replace("#include <fog_fragment>", [
        "#ifdef USE_FOG",
        "  float hDen = fogDensity * exp((uCamY - vW.y) * 0.02);",
        "  float fogFactor = 1.0 - exp(-hDen * hDen * vFogDepth * vFogDepth);",
        "  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));",
        "#endif",
      ].join("\n"));
  }

  function makeCliff() {
    const step = quality > 0 ? 0.32 : 0.5;
    const data = FX.buildCliffMesh(step, quality > 0 ? 0.36 : 0.55);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(data.indices);
    rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.03,
      color: 0xffffff,
    });
    rockMat.onBeforeCompile = rockShader;
    rock = new THREE.Mesh(geo, rockMat);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.frustumCulled = false;
    scene.add(rock);
  }

  function makeSky() {
    skyUniforms = {
      uAlt: { value: 0 },
      uStorm: { value: 0 },
      uGale: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: [
        "varying vec3 vDir;",
        "void main(){",
        "  vec4 w = modelMatrix * vec4(position, 1.0);",
        "  vDir = normalize(w.xyz - cameraPosition);",
        "  gl_Position = projectionMatrix * viewMatrix * w;",
        "}",
      ].join("\n"),
      fragmentShader: [
        "varying vec3 vDir;",
        "uniform float uAlt; uniform float uStorm; uniform float uGale; uniform float uFlash; uniform float uTime;",
        "float hash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }",
        "void main(){",
        "  vec3 dir = normalize(vDir);",
        "  float h = dir.y * 0.5 + 0.5;",
        "  vec3 zenith = mix(vec3(0.05, 0.07, 0.12), vec3(0.02, 0.025, 0.05), uAlt);",
        "  vec3 horizon = mix(vec3(0.16, 0.18, 0.22), vec3(0.20, 0.22, 0.26), uStorm);",
        "  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));",
        "  col = mix(col, vec3(0.18, 0.19, 0.21), uStorm * 0.65);",
        "  vec3 moonDir = normalize(vec3(-0.42, 0.74, 0.28));",
        "  float moon = smoothstep(0.9982, 0.9994, dot(dir, moonDir));",
        "  col += vec3(0.85, 0.88, 0.95) * moon * (1.0 - uStorm * 0.85);",
        "  float halo = pow(max(dot(dir, moonDir), 0.0), 48.0) * 0.18;",
        "  col += vec3(0.45, 0.5, 0.62) * halo * (1.0 - uStorm);",
        "  float stars = step(0.997, hash(floor(dir * 420.0)));",
        "  stars *= smoothstep(0.35, 0.7, h) * uAlt * (1.0 - uStorm);",
        "  col += stars * 0.55;",
        "  col += vec3(0.55, 0.62, 0.8) * uFlash;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}",
      ].join("\n"),
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(220, 28, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -2;
    scene.add(sky);
  }

  function makeRidges() {
    ridges = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x1b2432, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(-26, 0);
      for (let p = 0; p <= 14; p++) {
        const x = -26 + p * (52 / 14);
        const h = 4 + Math.pow(Math.abs(Math.sin(p * 0.9 + i * 1.7)), 1.35) * (18 + (i % 3) * 6);
        shape.lineTo(x, p === 0 || p === 14 ? 0 : h);
      }
      shape.lineTo(26, 0);
      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geo, mat);
      const ang = i / 8 * Math.PI * 2 + 0.3;
      const rad = 70 + (i % 3) * 12;
      mesh.position.set(Math.sin(ang) * rad, -8, Math.cos(ang) * rad * 0.65);
      mesh.lookAt(0, 4, 0);
      ridges.add(mesh);
    }
    scene.add(ridges);
  }

  function makeClimber() {
    climber = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.84, metalness: 0.02 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8b89a, roughness: 0.58, metalness: 0 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.72, metalness: 0.04 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xb4332a, roughness: 0.6, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 });
    function part(geo, mat) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      climber.add(m);
      return m;
    }
    const arm = limbGeo([0.55, 1, 0.92, 0.7, 0.42]);
    const leg = limbGeo([0.7, 1, 0.86, 0.62, 0.4]);
    const torso = limbGeo([0.72, 1, 1.05, 0.78]);
    bones = {
      torso: part(torso, cloth),
      head: part(new THREE.SphereGeometry(0.105, 12, 10), skin),
      nose: part(new THREE.SphereGeometry(0.028, 8, 6), skin),
      eyeL: part(new THREE.SphereGeometry(0.012, 6, 5), dark),
      eyeR: part(new THREE.SphereGeometry(0.012, 6, 5), dark),
      chest: part(new THREE.SphereGeometry(0.09, 10, 8), cloth),
      uarmL: part(arm, cloth),
      larmL: part(arm, cloth),
      uarmR: part(arm, cloth),
      larmR: part(arm, cloth),
      handL: part(new THREE.SphereGeometry(0.034, 8, 6), skin),
      handR: part(new THREE.SphereGeometry(0.034, 8, 6), skin),
      thighL: part(leg, cloth),
      shinL: part(leg, cloth),
      thighR: part(leg, cloth),
      shinR: part(leg, cloth),
      footL: part(new THREE.SphereGeometry(0.04, 7, 6), dark),
      footR: part(new THREE.SphereGeometry(0.04, 7, 6), dark),
    };
    packMesh = part(limbGeo([0.7, 1, 0.96, 0.75]), packMat);
    const n = 8;
    scarfPts = [];
    for (let i = 0; i < n; i++) scarfPts.push({ x: 0, y: 10, z: 0, px: 0, py: 10, pz: 0 });
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(n * 2 * 3);
    const sn = new Float32Array(n * 2 * 3);
    for (let i = 0; i < sn.length; i += 3) { sn[i] = -1; sn[i + 1] = 0; sn[i + 2] = 0.2; }
    const si = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      si.push(a, c, b, b, c, d);
    }
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("normal", new THREE.BufferAttribute(sn, 3));
    sg.setIndex(si);
    bones.scarf = new THREE.Mesh(sg, scarfMat);
    bones.scarf.castShadow = true;
    bones.scarf.frustumCulled = false;
    climber.add(bones.scarf);
    scene.add(climber);
  }

  function makeWeather() {
    const n = 480;
    drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({
        x: (Math.random() - 0.5) * 18,
        y: Math.random() * 30,
        z: (Math.random() - 0.5) * 14,
        k: i % 11 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
      });
    }
    rainPos = new Float32Array(n * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xd5dde8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }));
    rain.frustumCulled = false;
    scene.add(rain);
    aimPos = new Float32Array(48 * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.BufferAttribute(aimPos, 3));
    aimLine = new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0xf0e6d2, transparent: true, opacity: 0.7 }));
    aimLine.frustumCulled = false;
    scene.add(aimLine);
    lostMeshes = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshStandardMaterial({ color: 0xe7c9a2, emissive: 0x6a4a2a, emissiveIntensity: 0.6, roughness: 0.4 })
      );
      m.visible = false;
      scene.add(m);
      lostMeshes.push(m);
    }
    door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 1, emissive: 0x3a2a22, emissiveIntensity: 0.35 })
    );
    const gate = FX.GATE;
    const top = FX.HOLDS[FX.HOLDS.length - 1];
    door.position.set(0.02, top.y + 1.15, top.z - 0.05);
    door.rotation.y = Math.PI / 2;
    scene.add(door);
    void gate;
  }

  function makePost() {
    sceneRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true });
    bloomRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    bloomRT2 = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    brightMat = new THREE.ShaderMaterial({
      uniforms: { uScene: { value: null } },
      depthTest: false,
      toneMapped: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "uniform sampler2D uScene; varying vec2 vUv;",
        "void main(){",
        "  vec3 c = texture2D(uScene, vUv).rgb;",
        "  float l = max(c.r, max(c.g, c.b));",
        "  gl_FragColor = vec4(c * smoothstep(0.45, 0.95, l), 1.0);",
        "}",
      ].join("\n"),
    });
    blurMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
      depthTest: false,
      toneMapped: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "uniform sampler2D uTex; uniform vec2 uDir; varying vec2 vUv;",
        "void main(){",
        "  vec3 c = texture2D(uTex, vUv).rgb * 0.227;",
        "  c += texture2D(uTex, vUv + uDir * 1.4).rgb * 0.194;",
        "  c += texture2D(uTex, vUv - uDir * 1.4).rgb * 0.194;",
        "  c += texture2D(uTex, vUv + uDir * 3.2).rgb * 0.122;",
        "  c += texture2D(uTex, vUv - uDir * 3.2).rgb * 0.122;",
        "  c += texture2D(uTex, vUv + uDir * 5.4).rgb * 0.07;",
        "  c += texture2D(uTex, vUv - uDir * 5.4).rgb * 0.07;",
        "  gl_FragColor = vec4(c, 1.0);",
        "}",
      ].join("\n"),
    });
    postMat = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: null },
        uBloom: { value: null },
        uBloomAmt: { value: 0.18 },
        uGrain: { value: 0.035 },
        uTime: { value: 0 },
      },
      depthTest: false,
      toneMapped: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "uniform sampler2D uScene; uniform sampler2D uBloom;",
        "uniform float uBloomAmt; uniform float uGrain; uniform float uTime;",
        "varying vec2 vUv;",
        "vec3 aces(vec3 x){",
        "  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
        "}",
        "void main(){",
        "  vec3 c = texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uBloomAmt;",
        "  c = aces(c * 1.12);",
        "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
        "  vec3 grade = mix(c * vec3(0.76, 0.86, 1.06), c * vec3(1.08, 1.02, 0.92), smoothstep(0.08, 0.7, l));",
        "  c = mix(c, grade, 0.62);",
        "  vec2 q = vUv - 0.5;",
        "  float vig = smoothstep(0.78, 0.22, dot(q, q));",
        "  c *= mix(0.55, 1.0, vig);",
        "  float g = fract(sin(dot(vUv * vec2(1.0, uTime), vec2(12.9898, 78.233))) * 43758.5453);",
        "  c += (g - 0.5) * uGrain;",
        "  c = pow(max(c, 0.0), vec3(0.4545));",
        "  gl_FragColor = vec4(c, 1.0);",
        "}",
      ].join("\n"),
    });
    quad = new THREE.Mesh(quadGeo, postMat);
    quad.frustumCulled = false;
  }

  function allocTargets() {
    const w = Math.max(2, viewW);
    const h = Math.max(2, viewH);
    sceneRT.setSize(w, h);
    const bw = Math.max(2, w >> 1);
    const bh = Math.max(2, h >> 1);
    bloomRT.setSize(bw, bh);
    bloomRT2.setSize(bw, bh);
    renderer.setSize(w / pixelRatio, h / pixelRatio, false);
    renderer.setPixelRatio(pixelRatio);
  }

  function placeBone(mesh, a, b, thick) {
    dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length() || 0.001;
    mesh.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    mesh.scale.set(thick, len, thick);
    dir.multiplyScalar(1 / len);
    if (dir.y < -0.999) mesh.quaternion.set(1, 0, 0, 0);
    else mesh.quaternion.setFromUnitVectors(UP, dir);
  }

  function P(x, y, z) { return { x: x, y: y, z: z }; }
  function ik2(ax, ay, tx, ty, l1, l2, bend) {
    let dx = tx - ax, dy = ty - ay;
    const d = Math.max(0.001, Math.min(l1 + l2 - 0.001, Math.hypot(dx, dy)));
    const h = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const lift = Math.sqrt(Math.max(0, l1 * l1 - h * h)) * bend;
    const ux = dx / d, uy = dy / d;
    return { x: ax + ux * h - uy * lift, y: ay + uy * h + ux * lift };
  }

  function poseOf(state) {
    const hold = FX.HOLDS[state.holdIndex] || FX.HOLDS[0];
    const w01 = FX.weight01(state.mask);
    const st = FX.sampleRelease(state.mask, state.holdT || 0);
    const charging = state.attached && state.holding && state.mode === "play" && !(state.crown && state.holdT === 0);
    const charge = charging ? st.charge : 0;
    const wall = -1;
    const hip = P(0, state.y, state.z);
    const flying = !state.attached && state.mode === "play";
    let shoulder, head, handL, handR, footL, footR;
    if (state.attached && (state.mode === "play" || state.mode === "ledge" || state.mode === "drop" || state.mode === "ending")) {
      const standing = (state.crown || state.mode === "ledge" || state.mode === "drop" || state.mode === "ending") && !charging;
      if (standing) {
        const footY = hold.y + 0.2;
        hip.y = footY + 0.92;
        hip.z = hold.z + 0.16;
        shoulder = P(0, hip.y + 0.48, hip.z + wall * 0.04);
        head = P(0, shoulder.y + 0.26, shoulder.z + wall * 0.1);
        handL = P(0.04, hold.y + 1.05, hold.z + wall * 0.02);
        handR = P(-0.04, hold.y + 0.96, hold.z + wall * 0.01);
        footL = P(0.06, footY, hold.z + wall * 0.02);
        footR = P(-0.05, footY, hold.z);
      } else {
        const pull = charge;
        hip.y += pull * 0.16;
        hip.z += wall * pull * 0.1;
        shoulder = P(0, hip.y + 0.42 + pull * 0.28, hip.z + wall * (0.06 + pull * 0.14));
        head = P(0, shoulder.y + 0.22, shoulder.z + wall * 0.1);
        handL = P(0.05, hold.y + 0.02, hold.z + wall * 0.02);
        handR = P(-0.05, hold.y - 0.02, hold.z + wall * 0.015);
        const tuck = pull;
        footL = P(0.05, hip.y - 0.16 - (1 - tuck) * 0.62, hip.z + wall * (0.14 + tuck * 0.2));
        footR = P(-0.04, hip.y - 0.24 - (1 - tuck) * 0.5, hip.z + wall * (0.05 + tuck * 0.14));
      }
    } else {
      const sp = Math.hypot(state.vy, state.vz) || 1;
      const uy = state.vy / sp, uz = state.vz / sp;
      shoulder = P(0, hip.y + uy * 0.46, hip.z + uz * 0.46);
      head = P(0, hip.y + uy * 0.7, hip.z + uz * 0.7 + wall * 0.1);
      handL = P(0.05, hip.y + uy * 0.98, hip.z + uz * 0.98 + wall * 0.14);
      handR = P(-0.05, hip.y + uy * 0.9, hip.z + uz * 0.9 + wall * 0.12);
      footL = P(0.04, hip.y - uy * 0.74, hip.z - uz * 0.74 + wall * 0.04);
      footR = P(-0.04, hip.y - uy * 0.66, hip.z - uz * 0.66 + wall * 0.02);
    }
    const eL = ik2(shoulder.z, shoulder.y, handL.z, handL.y, 0.34, 0.32, 1);
    const eR = ik2(shoulder.z, shoulder.y, handR.z, handR.y, 0.34, 0.32, 1);
    const kL = ik2(hip.z, hip.y, footL.z, footL.y, 0.42, 0.4, 1);
    const kR = ik2(hip.z, hip.y, footR.z, footR.y, 0.42, 0.4, 1);
    function lift(e, x) { return P(x, e.y, e.x); }
    return {
      hip: hip, shoulder: shoulder, head: head,
      handL: handL, handR: handR, footL: footL, footR: footR,
      elbowL: lift(eL, 0.08), elbowR: lift(eR, -0.08),
      kneeL: lift(kL, 0.05), kneeR: lift(kR, -0.04),
      charge: charge, w01: w01, flying: flying,
    };
  }

  function stepScarf(neck, soon, time, dt) {
    const p0 = scarfPts[0];
    p0.x = 0.02; p0.y = neck.y - 0.04; p0.z = neck.z + 0.12;
    p0.px = p0.x; p0.py = p0.y; p0.pz = p0.z;
    const gust = Math.max(-0.35, Math.min(0.55, soon * 0.08));
    const damp = 0.9;
    for (let i = 1; i < scarfPts.length; i++) {
      const p = scarfPts[i];
      const vx = (p.x - p.px) * damp;
      const vy = (p.y - p.py) * damp;
      const vz = (p.z - p.pz) * damp;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx;
      p.y += vy - 4.2 * dt * dt;
      p.z += vz + gust * dt;
      p.x += Math.sin(time * 3.0 + i) * 0.002;
    }
    for (let n = 0; n < 4; n++) {
      for (let i = 1; i < scarfPts.length; i++) {
        const a = scarfPts[i - 1], b = scarfPts[i];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz) || 0.001;
        const rest = 0.075;
        const diff = (len - rest) / len;
        const k = i === 1 ? 1 : 0.55;
        b.x -= dx * diff * k;
        b.y -= dy * diff * k;
        b.z -= dz * diff * k;
      }
    }
    const anchor = scarfPts[0];
    for (let i = 1; i < scarfPts.length; i++) {
      const p = scarfPts[i];
      const dx = p.x - anchor.x, dy = p.y - anchor.y, dz = p.z - anchor.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 0.62) {
        const s = 0.62 / d;
        p.x = anchor.x + dx * s;
        p.y = anchor.y + dy * s;
        p.z = anchor.z + dz * s;
      }
    }
  }

  function writeScarf() {
    const attr = bones.scarf.geometry.attributes.position;
    const arr = attr.array;
    for (let i = 0; i < scarfPts.length; i++) {
      const p = scarfPts[i];
      const w = 0.045 * (1 - i / scarfPts.length * 0.7);
      const o = i * 6;
      arr[o] = p.x - 0.02;
      arr[o + 1] = p.y;
      arr[o + 2] = p.z - w;
      arr[o + 3] = p.x + 0.03;
      arr[o + 4] = p.y + 0.01;
      arr[o + 5] = p.z + w;
    }
    attr.needsUpdate = true;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor(0x07080c, 1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1a2028, 0.018);
    camera = new THREE.PerspectiveCamera(38, 1, 0.12, 520);
    uniforms = {
      uWet: { value: 0 },
      uFlash: { value: 0 },
      uDetail: { value: 0.55 },
      uCamY: { value: 12 },
      uTop: { value: FX.HOLDS[FX.HOLDS.length - 1].y },
    };
    hemi = new THREE.HemisphereLight(0x4a5c78, 0x1a1612, 0.72);
    scene.add(hemi);
    moon = new THREE.DirectionalLight(0xd5e2f8, 2.35);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.near = 0.5;
    moon.shadow.camera.far = 48;
    moon.shadow.camera.left = -8;
    moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 8;
    moon.shadow.camera.bottom = -8;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    scene.add(moon);
    scene.add(moon.target);
    rim = new THREE.DirectionalLight(0x8ea4c4, 0.55);
    scene.add(rim);
    scene.add(rim.target);
    makeSky();
    makeRidges();
    makeCliff();
    makeClimber();
    makeWeather();
    makePost();
  }

  function setQuality(q) {
    quality = q;
    bloomOn = q > 0;
    uniforms.uDetail.value = q === 0 ? 0.2 : 0.55;
    renderer.shadowMap.enabled = q > 0;
    moon.castShadow = q > 0;
    moon.shadow.mapSize.set(q > 1 ? 1024 : 512, q > 1 ? 1024 : 512);
    if (rain) rain.material.opacity = q === 0 ? 0.28 : 0.45;
  }

  function resize(cssW, cssH, ratio) {
    pixelRatio = ratio;
    viewW = Math.max(2, Math.floor(cssW * ratio));
    viewH = Math.max(2, Math.floor(cssH * ratio));
    allocTargets();
  }

  function draw(o) {
    const state = o.state;
    const dt = o.dt || 0.016;
    fpsT += dt;
    fpsN++;
    if (fpsT >= 0.5) {
      fps = fpsN / fpsT;
      fpsN = 0;
      fpsT = 0;
    }
    const camY = o.camY;
    const focusZ = o.focusZ;
    const close = !!o.close;
    sky.position.set(0, camY, focusZ);
    ridges.position.y = camY - 18;
    const alt = o.alt || 0;
    const storm = o.storm || 0;
    const gale = o.gale || 0;
    const flash = o.flash || 0;
    skyUniforms.uAlt.value = alt;
    skyUniforms.uStorm.value = storm;
    skyUniforms.uGale.value = gale;
    skyUniforms.uFlash.value = flash;
    skyUniforms.uTime.value = state.time || 0;
    uniforms.uWet.value = o.wet || 0;
    uniforms.uFlash.value = flash;
    uniforms.uCamY.value = camY;
    const fogCol = new THREE.Color().setRGB(
      0.16 + storm * 0.06 + flash * 0.2,
      0.18 + storm * 0.04 + flash * 0.22,
      0.22 + flash * 0.28
    );
    scene.fog.color.copy(fogCol);
    scene.fog.density = 0.012 + gale * 0.02 + storm * 0.008 + (1 - Math.min(1, camY / 80)) * 0.008;
    moon.intensity = 2.2 + flash * 2.6;
    moon.position.set(camY * 0 - 9, camY + 14, focusZ + 6);
    moon.target.position.set(0, camY, focusZ - 0.4);
    rim.position.set(-2, camY + 2, focusZ + 6);
    rim.target.position.set(0, camY, focusZ);

    const rig = poseOf(state);
    const b = bones;
    placeBone(b.torso, rig.hip, rig.shoulder, 0.16 + rig.w01 * 0.02);
    b.head.position.set(rig.head.x, rig.head.y, rig.head.z);
    b.head.scale.setScalar(1);
    b.nose.position.set(rig.head.x, rig.head.y - 0.02, rig.head.z - 0.1);
    b.eyeL.position.set(rig.head.x + 0.035, rig.head.y + 0.02, rig.head.z - 0.09);
    b.eyeR.position.set(rig.head.x - 0.035, rig.head.y + 0.02, rig.head.z - 0.09);
    b.chest.position.set(
      (rig.hip.x + rig.shoulder.x) * 0.5,
      (rig.hip.y + rig.shoulder.y) * 0.55,
      (rig.hip.z + rig.shoulder.z) * 0.5 - 0.07
    );
    placeBone(b.uarmL, rig.shoulder, rig.elbowL, 0.055);
    placeBone(b.larmL, rig.elbowL, rig.handL, 0.04);
    placeBone(b.uarmR, rig.shoulder, rig.elbowR, 0.052);
    placeBone(b.larmR, rig.elbowR, rig.handR, 0.038);
    b.handL.position.set(rig.handL.x, rig.handL.y, rig.handL.z);
    b.handR.position.set(rig.handR.x, rig.handR.y, rig.handR.z);
    placeBone(b.thighL, rig.hip, rig.kneeL, 0.07);
    placeBone(b.shinL, rig.kneeL, rig.footL, 0.05);
    placeBone(b.thighR, rig.hip, rig.kneeR, 0.066);
    placeBone(b.shinR, rig.kneeR, rig.footR, 0.048);
    b.footL.position.set(rig.footL.x, rig.footL.y, rig.footL.z);
    b.footR.position.set(rig.footR.x, rig.footR.y, rig.footR.z);
    const packZ = rig.shoulder.z + 0.14 + rig.w01 * 0.04;
    const packY = rig.shoulder.y - 0.16;
    packMesh.position.set(rig.shoulder.x + 0.01, packY, packZ);
    const ps = 0.09 + rig.w01 * 0.045;
    packMesh.scale.set(ps, 0.2 + rig.w01 * 0.08, ps * 0.72);
    packMesh.quaternion.identity();
    const soon = FX.gustForecast(state.time, state.y, state.mask, state.descending).soon;
    stepScarf(rig.shoulder, soon, state.time, dt);
    writeScarf();

    const forecast = FX.gustForecast(state.time, camY, state.mask, state.descending);
    const count = quality === 0 ? 70 : quality === 1 ? 200 : 420;
    const arr = rain.geometry.attributes.position.array;
    for (let i = 0; i < drops.length; i++) {
      const p = drops[i];
      const snow = gale > 0.45 || camY > (FX.HOLDS[FX.HOLDS.length - 1].y * 0.72);
      const use = i < count;
      if (use) {
        const fall = p.k === 1 || snow ? 1.6 : 7.5;
        p.y -= fall * dt * 3;
        p.z += forecast.soon * dt * (p.k === 2 ? 2.2 : 0.8);
        if (p.y < camY - 16) {
          p.y = camY + 12 + Math.random() * 8;
          p.x = (Math.random() - 0.5) * 16;
          p.z = focusZ + (Math.random() - 0.4) * 10;
        }
      }
      const len = !use ? 0 : p.k === 2 ? 0.55 : snow ? 0.06 : 0.28;
      const o = i * 6;
      const hide = !use ? -400 : 0;
      arr[o] = p.x;
      arr[o + 1] = p.y + hide;
      arr[o + 2] = p.z;
      arr[o + 3] = p.x + (p.k === 2 ? Math.sign(forecast.soon || 1) * len : 0);
      arr[o + 4] = p.y - (p.k === 2 ? 0.02 : len) + hide;
      arr[o + 5] = p.z + (p.k === 2 ? len : Math.sign(forecast.soon || 1) * 0.04);
    }
    rain.geometry.attributes.position.needsUpdate = true;
    rain.material.color.set(gale > 0.45 ? 0xe7eef6 : 0xb7c3d1);

    const dots = state.dots || [];
    const aa = aimLine.geometry.attributes.position.array;
    const nDots = Math.min(dots.length, 48);
    for (let i = 0; i < 48; i++) {
      const d = dots[Math.min(i, Math.max(0, nDots - 1))] || { y: state.y, z: state.z };
      aa[i * 3] = 0.05;
      aa[i * 3 + 1] = nDots ? d.y : state.y;
      aa[i * 3 + 2] = nDots ? d.z : state.z;
    }
    aimLine.geometry.setDrawRange(0, nDots);
    aimLine.geometry.attributes.position.needsUpdate = true;
    aimLine.visible = nDots > 1;

    const lost = state.lost || [];
    for (let i = 0; i < lostMeshes.length; i++) {
      const item = lost[i];
      lostMeshes[i].visible = !!item && state.mode !== "ending";
      if (item) lostMeshes[i].position.set(0.1, item.y, item.z);
    }

    const portrait = !!o.portrait;
    camera.fov = close ? 32 : portrait ? 50 : 36;
    camera.aspect = viewW / Math.max(1, viewH);
    camera.updateProjectionMatrix();
    if (close) {
      camera.position.set(rig.hip.x - 2.5, rig.hip.y + 0.35, rig.hip.z + 1.25);
      camera.lookAt(rig.hip.x, rig.hip.y + 0.15, rig.hip.z - 0.15);
    } else {
      camera.position.set(-6.2, camY + 0.95, focusZ + 1.45);
      camera.lookAt(0.05, camY + 0.15, focusZ - 0.2);
    }
    camera.up.set(0, 1, 0);

    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    if (bloomOn) {
      const bw = Math.max(2, viewW >> 1);
      const bh = Math.max(2, viewH >> 1);
      brightMat.uniforms.uScene.value = sceneRT.texture;
      quad.material = brightMat;
      renderer.setRenderTarget(bloomRT);
      renderer.setViewport(0, 0, bw, bh);
      renderer.render(quad, quadCamera);
      blurMat.uniforms.uTex.value = bloomRT.texture;
      blurMat.uniforms.uDir.value.set(1.2 / bw, 0);
      quad.material = blurMat;
      renderer.setRenderTarget(bloomRT2);
      renderer.render(quad, quadCamera);
      blurMat.uniforms.uTex.value = bloomRT2.texture;
      blurMat.uniforms.uDir.value.set(0, 1.2 / bh);
      renderer.setRenderTarget(bloomRT);
      renderer.render(quad, quadCamera);
    }
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, viewW, viewH);
    postMat.uniforms.uScene.value = sceneRT.texture;
    postMat.uniforms.uBloom.value = bloomOn ? bloomRT.texture : sceneRT.texture;
    postMat.uniforms.uBloomAmt.value = bloomOn ? 0.22 : 0;
    postMat.uniforms.uGrain.value = quality === 0 ? 0.012 : 0.022;
    postMat.uniforms.uTime.value = (state.time || 0) + 1;
    quad.material = postMat;
    renderer.render(quad, quadCamera);
  }

  window.FXRender = {
    init: init,
    resize: resize,
    setQuality: setQuality,
    draw: draw,
    get fps() { return fps; },
    get quality() { return quality; },
  };
})();
