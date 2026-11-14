/* Everything in this scene is geometry, light, or procedural shader code. No image assets. */
(function () {
  "use strict";
  const FX = window.Fangxia, THREE = window.THREE;
  let renderer, scene, camera, moon, rim, fill, sky, skyU, mountains, cliff, rockMaterial, crestSnowMaterial;
  let climber, bones, pack, straps, scarf, scarfPoints, weather, weatherData, aim, aimArray;
  let lostObjects, fallingObject, gate, gateLight, gripLights, rockChunks = [], mountainMeshes = [];
  let sceneRT, bloomRT, bloomRT2, postCamera, quad, brightMaterial, blurMaterial, postMaterial;
  let quality = 2, pixelRatio = 1, width = 2, height = 2, cssWidth = 2, cssHeight = 2;
  let fps = 60, frames = 0, elapsed = 0, lastFrameTime = 0;
  const UP = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const topY = FX.HOLDS[FX.HOLDS.length - 1].y;
  const rockU = { uWet: { value: 0 }, uFlash: { value: 0 }, uTop: { value: topY }, uQuality: { value: 2 } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const P = (x, y, z) => ({ x, y, z });
  const noiseGLSL = `
    float hash2(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
    float noise2(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+1.),f.x),f.y);}
    float fbm2(vec2 p){return noise2(p)*.57+noise2(p*2.03+13.1)*.28+noise2(p*4.07+3.7)*.15;}
  `;

  function rockShader(shader) {
    Object.assign(shader.uniforms, rockU);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRock; varying vec3 vRockNormal;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvRockNormal = normalize(mat3(modelMatrix)*objectNormal);")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRock=(modelMatrix*vec4(transformed,1.)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vRock; varying vec3 vRockNormal;
        uniform float uWet,uFlash,uTop,uQuality;
        ${noiseGLSL}
        float rockStreak;
      `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 uv=vec2(vRock.x*.72+vRock.z*.64,vRock.y);
        float broad=uQuality<.5?noise2(uv*.65):fbm2(uv*.65);
        float layers=uv.y*5.3+uv.x*1.1+(uQuality<.5?broad:noise2(uv*1.8))*1.25;
        float seam=pow(1.-abs(sin(layers)),20.);
        float fissure=uQuality<.5?0.:1.-smoothstep(.018,.055,abs(noise2(vec2(uv.x*3.,uv.y*.26))-.49));
        float grain=uQuality<.5?.5:noise2(uv*31.);
        vec3 slate=mix(vec3(.075,.093,.105),vec3(.24,.25,.25),broad);
        slate=mix(slate,vec3(.24,.175,.12),smoothstep(.60,.82,uQuality<.5?broad:noise2(uv*.42+8.))* .5);
        slate*=1.-seam*.32-fissure*.35;
        slate*=.88+grain*.22;
        rockStreak=uQuality<.5?0.:smoothstep(.58,.8,noise2(uv*vec2(4.,.16)));
        slate*=1.-rockStreak*uWet*.48;
        float snow=smoothstep(.18,.66,vRockNormal.y)*smoothstep(uTop*.56,uTop*.92,vRock.y);
        snow*=smoothstep(.28,.67,broad+vRockNormal.y*.28);
        slate=mix(slate,vec3(.60,.68,.73),snow*.92);
        diffuseColor.rgb*=slate*(1.+uFlash*.2);
      `)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        if(uQuality>.5){
          vec2 nuv=vec2(vRock.x*.72+vRock.z*.64,vRock.y)*9.;
          float a=noise2(nuv),bx=noise2(nuv+vec2(.07,0)),by=noise2(nuv+vec2(0,.07));
          vec3 bump=vec3((a-bx)*.65,(a-by)*.42,(a-bx)*.4);
          normal=normalize(normal+mat3(viewMatrix)*bump);
        }
      `)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor*=1.-rockStreak*uWet*.52;");
  }

  function makeRockMaterial() {
    const mat=quality===0
      ?new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide})
      :new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.04,vertexColors:true,side:THREE.DoubleSide});
    mat.onBeforeCompile=rockShader;return mat;
  }
  function makeCliff() {
    cliff = new THREE.Group();
    rockMaterial = makeRockMaterial();
    rebuildCliff();
    scene.add(cliff);
    gripLights = [];
    // Chalk and worn edges identify actual reachable holds without floating UI markers.
    const chalkMat = new THREE.MeshStandardMaterial({color:0xb8bdba,roughness:.94,emissive:0x778b88,emissiveIntensity:.08});
    const snowMat = new THREE.MeshStandardMaterial({color:0xaabec6,roughness:.7,emissive:0x557c86,emissiveIntensity:.12});
    FX.HOLDS.forEach((h,i)=>{
      const chalk = new THREE.Mesh(new THREE.SphereGeometry(1,10,6),h.k==="ice"?snowMat:chalkMat);
      chalk.position.set(-.035,h.y+.018,h.z+.015);
      chalk.scale.set(.17+hash(i)*.07,.025,.075);
      cliff.add(chalk);
      const g = new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),new THREE.MeshBasicMaterial({color:0xe2c795,transparent:true,opacity:0}));
      g.position.set(-.12,h.y+.07,h.z+.05); cliff.add(g); gripLights.push(g);
    });
  }

  function rebuildCliff() {
    rockChunks.forEach(mesh=>{cliff.remove(mesh);mesh.geometry.dispose();});rockChunks=[];
    const data=FX.buildCliffMesh(quality===0?.4:.20,quality===0?.5:.26);
    // The last hold ends the climb. The visible mountain ends just above its doorway,
    // with an irregular snowy crest; the shared collision mesh remains untouched.
    let rowWidth=1;
    while(rowWidth<data.positions.length/3&&Math.abs(data.positions[rowWidth*3+1]-data.positions[1])<.0001)rowWidth++;
    const rowCount=data.positions.length/(3*rowWidth),crest=[];
    for(let col=0;col<rowWidth;col++){
      const x=data.positions[col*3];
      const ceiling=topY+2.82+Math.sin(x*1.9)*.17+Math.sin(x*4.7+.5)*.08;
      let row=1;
      while(row<rowCount&&data.positions[(row*rowWidth+col)*3+1]<ceiling)row++;
      const a=((row-1)*rowWidth+col)*3,b=(row*rowWidth+col)*3;
      const t=(ceiling-data.positions[a+1])/(data.positions[b+1]-data.positions[a+1]);
      const z=mix(data.positions[a+2],data.positions[b+2],t);
      const normal=[0,1,2].map(j=>mix(data.normals[a+j],data.normals[b+j],t));
      crest.push({x,y:ceiling,z});
      for(let r=row;r<rowCount;r++){
        const o=(r*rowWidth+col)*3;
        data.positions[o+1]=ceiling;data.positions[o+2]=z;
        for(let j=0;j<3;j++){data.normals[o+j]=normal[j];data.colors[o+j]=1.18;}
      }
    }
    // The geometry is cut into height bands; offscreen sections do not consume draw work.
    const bands=new Map();
    for(let i=0;i<data.indices.length;i+=3){
      const a=data.indices[i],b=data.indices[i+1],c=data.indices[i+2];
      const ax=data.positions[b*3]-data.positions[a*3],ay=data.positions[b*3+1]-data.positions[a*3+1],az=data.positions[b*3+2]-data.positions[a*3+2];
      const bx=data.positions[c*3]-data.positions[a*3],by=data.positions[c*3+1]-data.positions[a*3+1],bz=data.positions[c*3+2]-data.positions[a*3+2];
      if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)<.000001)continue;
      const band=Math.floor((data.positions[a*3+1]+data.positions[b*3+1]+data.positions[c*3+1])/36);
      if(!bands.has(band))bands.set(band,[]);bands.get(band).push(a,b,c);
    }
    for(const ids of bands.values()){
      const geo=new THREE.BufferGeometry();
      const pos=[],normal=[],colors=[];
      ids.forEach(i=>{for(let j=0;j<3;j++){pos.push(data.positions[i*3+j]);normal.push(data.normals[i*3+j]);colors.push(data.colors[i*3+j]);}});
      geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
      geo.setAttribute("normal",new THREE.Float32BufferAttribute(normal,3));
      geo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,rockMaterial);mesh.castShadow=true;mesh.receiveShadow=true;
      cliff.add(mesh);rockChunks.push(mesh);
    }
    // Stitch the visible side exactly to the generated surface's boundary.
    // Sampling faceZ alone would leave a bright crack along the entire cliff.
    const skirt=[],skirtIndices=[],depthRows=14;
    const crestRise=(x,t)=>Math.sin(t*7.4)*.36+Math.sin(t*21.0+x*.2)*.14*smooth(t/.12);
    let rows=0,previousY=-Infinity;
    for(let i=0;i<data.positions.length/3;i+=rowWidth){
      const x=data.positions[i*3],y=data.positions[i*3+1],z=data.positions[i*3+2];
      if(y<=previousY+.0001)continue;previousY=y;
      const blend=smooth((y-topY-.7)/(crest[0].y-topY-.7));
      for(let j=0;j<=depthRows;j++){
        const t=j/depthRows;skirt.push(x-1.2*t,y+crestRise(x,t)*blend,z-13*t);
        if(rows&&j){const a=(rows-1)*(depthRows+1)+j-1,b=a+depthRows+1;skirtIndices.push(a,a+1,b,a+1,b+1,b);}
      }
      rows++;
    }
    const sideGeo=new THREE.BufferGeometry();
    sideGeo.setAttribute("position",new THREE.Float32BufferAttribute(skirt,3));
    sideGeo.setAttribute("color",new THREE.Float32BufferAttribute(skirt.map(()=>1),3));
    sideGeo.setIndex(skirtIndices);sideGeo.computeVertexNormals();
    const side=new THREE.Mesh(sideGeo,rockMaterial);side.castShadow=true;side.receiveShadow=true;cliff.add(side);rockChunks.push(side);
    const capPositions=[],capIndices=[];
    for(let j=0;j<=depthRows;j++){
      const t=j/depthRows;
      crest.forEach(p=>capPositions.push(p.x-1.2*t,p.y+crestRise(p.x,t),p.z-13*t));
      if(j)for(let i=0;i<rowWidth-1;i++){
        const a=(j-1)*rowWidth+i,b=a+rowWidth;
        capIndices.push(a,a+1,b,a+1,b+1,b);
      }
    }
    const capGeo=new THREE.BufferGeometry();capGeo.setAttribute("position",new THREE.Float32BufferAttribute(capPositions,3));
    capGeo.setAttribute("color",new THREE.Float32BufferAttribute(capPositions.map(()=>1.3),3));
    capGeo.setIndex(capIndices);capGeo.computeVertexNormals();
    const cap=new THREE.Mesh(capGeo,rockMaterial);cap.castShadow=true;cap.receiveShadow=true;cliff.add(cap);rockChunks.push(cap);
    if(!crestSnowMaterial)crestSnowMaterial=new THREE.MeshStandardMaterial({color:0xc1d0d5,roughness:.94});
    const lip=[];
    for(let j=depthRows;j>=0;j--){const t=j/depthRows,p=crest[0];lip.push(new THREE.Vector3(p.x-1.2*t,p.y+crestRise(p.x,t),p.z-13*t));}
    for(let i=1;i<crest.length;i++){const p=crest[i];lip.push(new THREE.Vector3(p.x,p.y,p.z));}
    const cornice=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lip),80,.045,6,false),crestSnowMaterial);
    cornice.castShadow=true;cornice.receiveShadow=true;cliff.add(cornice);rockChunks.push(cornice);
  }

  function makeSky() {
    skyU={uAlt:{value:0},uStorm:{value:0},uTime:{value:0},uFlash:{value:0}};
    const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,
      vertexShader:"varying vec3 vDir;void main(){vec4 w=modelMatrix*vec4(position,1.);vDir=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader:`varying vec3 vDir;uniform float uAlt,uStorm,uTime,uFlash;${noiseGLSL}
      void main(){
        vec3 d=normalize(vDir);float h=smoothstep(-.25,.65,d.y);
        vec3 low=mix(vec3(.07,.105,.135),vec3(.025,.047,.075),uAlt);
        vec3 col=mix(low,vec3(.006,.013,.030),h);
        vec3 md=normalize(vec3(.96,.20,.14));float m=dot(d,md);
        float halo=pow(max(m,0.),35.);col+=vec3(.14,.20,.26)*halo*.3;
        float disc=smoothstep(.99978,.99985,m);float maria=fbm2(vec2(dot(d,normalize(vec3(-.14,0.,.96))),d.y)*320.);col+=vec3(1.1,1.25,1.35)*disc*(.78+maria*.22);
        float stars=pow(hash2(floor(d.xz/max(.1,d.y+.6)*900.)),420.);
        col+=stars*.18*smoothstep(.08,.45,d.y)*(1.-uStorm*.8);
        vec2 cuv=d.xz/(abs(d.y)+.38)*1.8+vec2(uTime*.006,uTime*.002);
        float cloud=fbm2(cuv*2.2);cloud=smoothstep(.40,.76,cloud)*smoothstep(-.22,.32,d.y);
        col=mix(col,mix(vec3(.025,.043,.062),vec3(.07,.09,.115),halo),cloud*(.65+uStorm*.25));
        col+=vec3(.18,.24,.32)*uFlash;
        gl_FragColor=vec4(col,1.);
      }`});
    sky=new THREE.Mesh(new THREE.SphereGeometry(400,24,12),mat);sky.frustumCulled=false;scene.add(sky);
  }

  function mountainHeight(z, r) {
    let peak=0;
    const centers=[-100,-42,18,74,124], heights=[28,45,25,38,24], widths=[22,32,19,28,18];
    for(let i=0;i<centers.length;i++){
      const d=Math.abs(z-centers[i]-Math.sin(r*2+i)*10)/widths[i];
      peak=Math.max(peak,heights[(i+r)%heights.length]*Math.pow(Math.max(0,1-d),1.25));
    }
    return 9+peak+Math.abs(Math.sin(z*.28+r))*2.8+Math.abs(Math.sin(z*.73+r*2))*.8;
  }
  function makeMountains() {
    mountains=new THREE.Group();
    for(let r=0;r<5;r++){
      const nx=22,nz=180,pos=[],col=[],ind=[];
      for(let j=0;j<=nx;j++)for(let i=0;i<=nz;i++){
        const z=(i/nz-.5)*240, x=j/nx*34;
        const crest=mountainHeight(z,r);
        const ridgeCenter=.44+Math.sin(z*.071+r)*.11+Math.sin(z*.19+r)*.035;
        const cross=Math.pow(Math.max(0,1-Math.abs(j/nx-ridgeCenter)/(j/nx<ridgeCenter?ridgeCenter:1-ridgeCenter)),1.35);
        const detail=(hash(i*1.17+j*8.3+r*5)-.5)*2.0*cross-Math.abs(Math.sin(z*.24+x*.19+r))*3.5*cross;
        const y=crest*cross+detail;
        pos.push(x,y,z);
        const snow=smooth((y-27-r*.8)/8)*smooth((cross-.5)*2.4);
        const base=new THREE.Color().setRGB(.018+r*.005,.031+r*.007,.045+r*.010);
        base.lerp(new THREE.Color(.27,.33,.36),snow*.74);
        const v=.78+hash(i+j*20)*.22;col.push(base.r*v,base.g*v,base.b*v);
        if(i<nz&&j<nx){const a=j*(nz+1)+i;ind.push(a,a+1,a+nz+1,a+1,a+nz+2,a+nz+1);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.setAttribute("color",new THREE.Float32BufferAttribute(col,3));geo.setIndex(ind);geo.computeVertexNormals();
      const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
      mat.onBeforeCompile=function(shader){
        shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vMountain;varying vec3 vMountainNormal;").replace("#include <begin_vertex>","#include <begin_vertex>\nvMountain=position;vMountainNormal=normal;");
        shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec3 vMountain;varying vec3 vMountainNormal;\n"+noiseGLSL).replace("#include <color_fragment>",`#include <color_fragment>
          float erosion=noise2(vec2(vMountain.z*.35+vMountain.x*.12,vMountain.y*.18));
          float crag=abs(sin(vMountain.z*.67+vMountain.x*.21+erosion*5.));
          diffuseColor.rgb*=.6+crag*.4;
          float frost=smoothstep(25.,42.,vMountain.y+erosion*10.)*smoothstep(.04,.42,vMountainNormal.y);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.45,.48),frost*.85);
        `).replace("#include <normal_fragment_begin>",`#include <normal_fragment_begin>
          vec3 facetNormal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
          normal=normalize(mix(normal,facetNormal,.45));
        `);
      };
      const lowMat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});lowMat.onBeforeCompile=mat.onBeforeCompile;
      const mesh=new THREE.Mesh(geo,mat);mesh.userData={highMat:mat,lowMat};mesh.position.set(45+r*36,-36-r*4,18+r*12);mesh.rotation.y=-.22-r*.08;mountains.add(mesh);mountainMeshes.push(mesh);
    }
    scene.add(mountains);
  }

  function tapered(radii,segments=12) {
    return new THREE.LatheGeometry(radii.map((r,i)=>new THREE.Vector2(r,-.5+i/(radii.length-1))),segments);
  }
  function makeClimber() {
    climber=new THREE.Group();
    const jacket=new THREE.MeshStandardMaterial({color:0x9e7048,roughness:.83});
    const pants=new THREE.MeshStandardMaterial({color:0x29343a,roughness:.92});
    const skin=new THREE.MeshStandardMaterial({color:0xba9b7e,roughness:.7});
    const boot=new THREE.MeshStandardMaterial({color:0x171e22,roughness:.72});
    const leather=new THREE.MeshStandardMaterial({color:0x594539,roughness:.87});
    const webbing=new THREE.MeshStandardMaterial({color:0x292b29,roughness:.9});
    const red=new THREE.MeshStandardMaterial({color:0xa94c37,roughness:.9,side:THREE.DoubleSide});
    const add=(geo,mat)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;climber.add(m);return m;};
    const limb=tapered([.64,.85,1,.98,.89,.74,.55]);
    const sphere=new THREE.SphereGeometry(1,12,8);
    bones={
      torso:add(tapered([.65,.83,.9,1,1,.94,.72]),jacket),pelvis:add(sphere,pants),
      head:add(sphere,skin),hair:add(sphere,boot),neck:add(limb,skin),collar:add(sphere,red),nose:add(sphere,skin),
      shoulderL:add(sphere,jacket),shoulderR:add(sphere,jacket),
      upperL:add(limb,jacket),lowerL:add(limb,jacket),upperR:add(limb,jacket),lowerR:add(limb,jacket),
      handL:add(sphere,skin),handR:add(sphere,skin),elbowL:add(sphere,jacket),elbowR:add(sphere,jacket),
      thighL:add(limb,pants),shinL:add(limb,pants),thighR:add(limb,pants),shinR:add(limb,pants),
      kneeL:add(sphere,pants),kneeR:add(sphere,pants),bootL:add(sphere,boot),bootR:add(sphere,boot)
    };
    pack=add(tapered([.2,.75,1,1,.93,.72,.15],16),leather);
    bones.packFlap=add(sphere,leather);
    straps=[];for(let i=0;i<4;i++)straps.push(add(limb,webbing));
    bones.belt=add(sphere,webbing);
    scarfPoints=Array.from({length:10},()=>({x:0,y:8,z:0,px:0,py:8,pz:0}));
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(60),3));
    const ind=[];for(let i=0;i<9;i++){const a=i*2;ind.push(a,a+1,a+2,a+1,a+3,a+2);}g.setIndex(ind);
    scarf=new THREE.Mesh(g,red);scarf.frustumCulled=false;climber.add(scarf);scene.add(climber);
  }
  function bone(mesh,a,b,r) {
    direction.set(b.x-a.x,b.y-a.y,b.z-a.z);const len=direction.length()||.001;
    mesh.position.set((a.x+b.x)*.5,(a.y+b.y)*.5,(a.z+b.z)*.5);mesh.scale.set(r,len,r);
    mesh.quaternion.setFromUnitVectors(UP,direction.multiplyScalar(1/len));
  }
  function ball(mesh,p,x,y,z) {mesh.position.set(p.x,p.y,p.z);mesh.scale.set(x,y,z);}
  const RIG = { torso: .53, upperArm: .36, forearm: .34, thigh: .42, shin: .41 };
  const KIP = [
    // phase, shoulder relative to hands (y,z), trunk pitch, hip flexion, knee flexion.
    // The opening kip then repeating pull beats track the physical release phase.
    [0,    -.675,.17, .05, .00,.07],
    [.24,  -.630,.29, .33, .02,.08],
    [.49,  -.510,.47, .72, .02,.10],
    [.65,  -.405,.40, .36,-.95,1.20],
    [.79,  -.150,.40, .07,-.60,.95],
    [.97,   .290,.34, .32,-.20,.70],
    [1.12,  .470,.28, .27,-.17,.58],
    [1.27, -.120,.37, .23, .20,.38],
    [1.39, -.470,.45, .50, .15,.16],
    [1.49, -.110,.37, .15,-.60,.95],
    [1.62,  .330,.29, .30,-.18,.68],
    [1.82,  .430,.26, .28,-.18,.58],
    [2.12,  .470,.28, .27,-.17,.58],
  ];
  let lastPose = null, poseHistory = null, releaseHistory = null, mantleHistory = null, returnHistory = null, catchHistory = null;
  const add = (a,b) => P(a.x+b.x,a.y+b.y,a.z+b.z);
  const sub = (a,b) => P(a.x-b.x,a.y-b.y,a.z-b.z);
  const mul = (a,s) => P(a.x*s,a.y*s,a.z*s);
  const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
  const length = (a) => Math.hypot(a.x,a.y,a.z);
  const unit = (a) => mul(a,1/(length(a)||1));
  const blendPoint = (a,b,t) => P(mix(a.x,b.x,t),mix(a.y,b.y,t),mix(a.z,b.z,t));
  function localPoint(origin,up,back,y,z,x=0) {
    return P(origin.x+up.x*y+back.x*z+x,origin.y+up.y*y+back.y*z,origin.z+up.z*y+back.z*z);
  }
  // A pole in 3D fixes the anatomical bend plane even as the wrists pass below
  // the shoulders during turnover. No sign switch based on world-space dy.
  function joint(a,b,l1,l2,pole) {
    const ab=sub(b,a),distance=length(ab),axis=unit(ab);
    if(distance>l1+l2+.00001||distance<Math.abs(l1-l2)-.00001) throw new Error("Unreachable visual joint");
    const d=clamp(distance,Math.abs(l1-l2)+.000001,l1+l2-.000001);
    const along=(l1*l1-l2*l2+d*d)/(2*d);
    const lift=Math.sqrt(Math.max(0,l1*l1-along*along));
    let tangent=sub(sub(pole,a),mul(axis,dot(sub(pole,a),axis)));
    if(length(tangent)<.00001)tangent=P(axis.y,-axis.x,.1);
    return add(add(a,mul(axis,along)),mul(unit(tangent),lift));
  }
  function sampleKip(phase) {
    let i=0;while(i<KIP.length-2&&phase>KIP[i+1][0])i++;
    const a=KIP[i],b=KIP[i+1],p=KIP[Math.max(0,i-1)],n=KIP[Math.min(KIP.length-1,i+2)];
    const span=b[0]-a[0],t=clamp((phase-a[0])/span,0,1),t2=t*t,t3=t2*t;
    return a.slice(1).map((v,j)=>{
      const k=j+1,m0=i===0?0:(b[k]-p[k])/(b[0]-p[0]),m1=i===KIP.length-2?0:(n[k]-a[k])/(n[0]-a[0]);
      return (2*t3-3*t2+1)*v+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[k]+(t3-t2)*span*m1;
    });
  }
  function arcHand(root,from,target,t) {
    const a=sub(from,root),b=sub(target,root),distance=length(b);
    if(distance>.697){b.x*=.697/distance;b.y*=.697/distance;b.z*=.697/distance;}
    let angle0=Math.atan2(a.y,-a.z),angle1=Math.atan2(b.y,-b.z);
    while(angle1-angle0>Math.PI)angle1-=Math.PI*2;while(angle1-angle0<-Math.PI)angle1+=Math.PI*2;
    const angle=mix(angle0,angle1,t),radius=mix(Math.hypot(a.y,a.z),Math.hypot(b.y,b.z),t)*(1-.45*Math.sin(Math.PI*t)**2);
    return add(root,P(mix(a.x,b.x,t),Math.sin(angle)*radius,-Math.cos(angle)*radius));
  }
  function forecastCatch(state) {
    const ghost={...state,lost:(state.lost||[]).map(item=>({...item})),dots:[],sfx:[]},dt=1/120;
    for(let n=1;n<=30;n++){
      const before=P(0,ghost.y,ghost.z);
      FX.step(ghost,dt,{holding:!!state.holding,freezeIntro:true});
      if(ghost.attached)return {hold:FX.HOLDS[ghost.holdIndex],eta:n*dt,before};
      if(ghost.mode!=="play")return null;
    }
    return null;
  }
  function isStanding(state) {
    return state.attached&&(["ledge","drop","ending"].includes(state.mode)||(state.crown&&(state.holdT||0)<=1.28));
  }
  function computePose(state,release) {
    const h=FX.HOLDS[state.holdIndex]||FX.HOLDS[0],w=FX.weight01(state.mask);
    const flightAge=Math.max(0,(state.flightT||0)-(release&&release.flightStart||0));
    const lowering=!!state.downLaunch||!!(release&&release.slip);
    const charging=state.attached&&state.holding&&state.mode==="play"&&(state.holdT||0)>.0001;
    const stand=isStanding(state);
    const rawPhase=charging?FX.params(state.mask).omega*(state.holdT||0)/Math.PI:0;
    const phase=rawPhase<=1.12?rawPhase:1.12+(rawPhase-1.12)%1;
    const grip=P(0,h.y+.035,h.z+.035);
    let shoulder,hip,theta,hipFlex,kneeFlex,handL,handR,contact=null;
    const mantle=stand&&release&&release.mantle;
    const rising=mantle&&mantle.pose;
    const mantleT=mantle?clamp((state.time-mantle.time)/(rising?.55:.85),0,1):1;
    if(stand){
      theta=.055;hip=P(0,h.y+.855,h.z+.27);hipFlex=-.04;kneeFlex=.13;
      if(rising&&mantleT<1){
        const p=smooth(mantleT);
        hip=blendPoint(rising.hip,hip,p);theta=mix(rising.theta,theta,p);hipFlex=mix(rising.hipFlex,hipFlex,p);kneeFlex=mix(rising.kneeFlex,kneeFlex,p);
      }else if(mantleT<1){
        const p=mantleT;
        const initialY=mantle.sy==null?-.43:mantle.sy,dipY=initialY-.08;
        const sy=p<.16?mix(initialY,dipY,smooth(p/.16)):p<.54?mix(dipY,.36,smooth((p-.16)/.38)):mix(.36,1.3492,smooth((p-.54)/.46));
        const sz=mix(.33,.2059,smooth(p));theta=mix(.20,.055,smooth(p));
        shoulder=P(0,grip.y+sy,grip.z+sz);hip=sub(shoulder,mul(P(0,Math.cos(theta),-Math.sin(theta)),RIG.torso));
        hipFlex=0;kneeFlex=mix(.65,.13,smooth(p));
      }
    }else if(state.attached){
      let [sy,sz,pitch,flex,knee]=sampleKip(phase);
      const st=FX.sampleRelease(state.mask,state.holdT||0);
      const amplitude=mix(1,.84,w)*(.65+.35*st.charge);
      const swayFade=1-smooth((phase-.6)/.2);
      const armAngle=Math.atan2(sz,-sy),radius=Math.hypot(sy,sz);
      const scaledAngle=mix(armAngle,.247+(armAngle-.247)*amplitude,swayFade);
      sy=-Math.cos(scaledAngle)*radius;sz=Math.sin(scaledAngle)*radius;
      theta=pitch*mix(1,amplitude,swayFade);hipFlex=flex;kneeFlex=knee;
      if(!charging){
        const absorb=1-smooth(clamp(((state.settle==null?1:state.settle)-.15)/.85,0,1));
        const catchY=release&&release.caught?release.caught.sy:-.43;
        sy=mix(sy,catchY,absorb);sz=mix(sz,.33,absorb);theta=mix(theta,.20,absorb);kneeFlex=mix(kneeFlex,.65,absorb);
      }
      if(charging&&(state.descending||state.crown)){
        const lower=smooth(clamp(((state.holdT||0)-.88)/.40,0,1));
        sy=mix(sy,-.60,lower);sz=mix(sz,.27,lower);theta=mix(theta,.12,lower);hipFlex=mix(hipFlex,0,lower);kneeFlex=mix(kneeFlex,.22,lower);
      }
      // The hands stay on the rock. Bound the shoulder root, never scale an arm.
      const d=Math.hypot(sy,sz),max=.697;
      if(d>max){sy*=max/d;sz*=max/d;}
      shoulder=P(0,grip.y+sy,grip.z+sz);
      const up=P(0,Math.cos(theta),-Math.sin(theta));
      hip=sub(shoulder,mul(up,RIG.torso));
      handL=P(-.17,grip.y,grip.z);handR=P(.17,grip.y,grip.z);
    }else{
      const t=flightAge,fade=1-smooth((t-(lowering?.35:0))/.32),extend=smooth(t/.28);
      const start=release&&release.pose;
      const dy=start?start.hip.y-release.physicsY:0,dz=start?start.hip.z-release.physicsZ:0;
      const ascending=smooth(clamp(((state.vy||0)+1)/2,0,1));
      const travelPitch=mix(.12,clamp((state.vz||0)*.022,-.12,.26),ascending);
      theta=start?mix(start.theta,travelPitch,extend):travelPitch;
      // The flight collision marker is the future hand-contact point, not a hip.
      // Carry the authored launch offset into a consistent hanging reach frame.
      const targetY=lowering?-.90:-.43-Math.cos(theta)*RIG.torso+.78*clamp((state.vy||0)/5,-1,1),targetZ=.33+Math.sin(theta)*RIG.torso;
      hip=P(0,state.y+mix(targetY,dy,fade),state.z+mix(targetZ,dz,fade));
      hipFlex=start?mix(start.hipFlex,.07,extend):.07;
      kneeFlex=start?mix(start.kneeFlex,mix(.42,.22,ascending),extend):mix(.42,.22,ascending);
      // Only a real future collision may influence the reach pose. Nearby rocks
      // on a failed trajectory do not pull the body off its flight path.
      const predicted=forecastCatch(state);
      if(predicted){
        const reachWeight=eta=>1-smooth(clamp((eta-.012)/(.250-.012),0,1));
        const elapsed=Math.max(0,Math.min(t,.25-predicted.eta)),progress=clamp(elapsed/(elapsed+predicted.eta-1/120||1),0,1);
        // A deliberate down-reach has a nearly uniform speed: the next hold
        // can arrive in a quarter second, so a strong ease-in/out would whip the arms.
        const r=.10,downWeight=progress<r?progress*progress/(2*r*(1-r)):progress>1-r?1-(1-progress)**2/(2*r*(1-r)):(progress-r*.5)/(1-r);
        const a=lowering?downWeight:reachWeight(predicted.eta)*smooth(t/.08);
        const cg=P(0,predicted.hold.y+.035,predicted.hold.z+.035),cu=P(0,Math.cos(.20),-Math.sin(.20));
        const catchY=lowering?.30:-.43;
        const targetHip=sub(P(0,cg.y+catchY,cg.z+.33),mul(cu,RIG.torso));
        // Anticipate the contact OFFSET, not its future world position. This
        // preserves physical travel even when a deep fall covers metres before contact.
        const incoming=add(targetHip,P(0,state.y-predicted.before.y,state.z-predicted.before.z));
        hip=blendPoint(hip,incoming,a);theta=mix(theta,.20,a);hipFlex=mix(hipFlex,0,a);kneeFlex=mix(kneeFlex,.65,a);
        contact={weight:a,grip:cg,index:predicted.hold.i,eta:predicted.eta,sy:catchY};
      }
    }
    const returning=state.attached&&!stand&&release&&release.returning;
    const returnT=returning?smooth(clamp((state.time-returning.time)/(state.crown?.34:.55),0,1)):1;
    if(returning&&returnT<1){
      hip=blendPoint(returning.pose.hip,hip,returnT);theta=mix(returning.pose.theta,theta,returnT);
      hipFlex=mix(returning.pose.hipFlex,hipFlex,returnT);kneeFlex=mix(returning.pose.kneeFlex,kneeFlex,returnT);shoulder=null;
    }
    const up=P(0,Math.cos(theta),-Math.sin(theta)),back=P(0,Math.sin(theta),Math.cos(theta));
    if(!shoulder)shoulder=add(hip,mul(up,RIG.torso));
    const shL=localPoint(shoulder,up,back,0,0,-.17),shR=localPoint(shoulder,up,back,0,0,.17);
    const pelvisL=P(-.105,hip.y,hip.z),pelvisR=P(.105,hip.y,hip.z);
    const poles={};
    for(const side of ["L","R"]){
      const sign=side==="L"?-1:1,a=side==="L"?shL:shR;
      // A lateral component lets the elbows flare around the grip at turnover.
      // Keeping the pole outward prevents a down-pole crossing the arm chord.
      poles["elbow"+side]=add(a,P(sign*.55,0,.42));
    }
    if(stand){
      const free=smooth((mantleT-.50)/.32);
      handL=blendPoint(P(-.17,grip.y,grip.z),localPoint(shL,up,back,-.56,-.08,-.025),free);
      handR=blendPoint(P(.17,grip.y,grip.z),localPoint(shR,up,back,-.56,-.08,.025),free);
      if(rising){
        const p=smooth(mantleT);
        handL=blendPoint(add(hip,sub(rising.handL,rising.hip)),localPoint(shL,up,back,-.56,-.08,-.025),p);
        handR=blendPoint(add(hip,sub(rising.handR,rising.hip)),localPoint(shR,up,back,-.56,-.08,.025),p);
      }
      for(const side of ["L","R"]){const a=side==="L"?shL:shR,b=side==="L"?handL:handR,d=sub(b,a),len=length(d);if(len>.697){const target=add(a,mul(d,.697/len));if(side==="L")handL=target;else handR=target;}}
    }else if(!state.attached){
      const extend=smooth(flightAge/.32),start=release&&release.pose;
      const reach=.43;
      const targets={L:localPoint(shL,up,back,reach,-.33,-.025),R:localPoint(shR,up,back,reach-.025,-.32,.025)};
      if(start&&lowering){
        // Downward release goes directly from the old grip toward the lower
        // ledge; it must not also play the upward flight extension.
        handL=add(shL,sub(start.handL,start.shL));handR=add(shR,sub(start.handR,start.shR));
      }else if(start){
        // Sweep the free hand around its shoulder instead of through the joint.
        const sweep=(side,a,target)=>{
          const from=sub(start["hand"+side],start["sh"+side]),to=sub(target,a);
          let a0=Math.atan2(from.y,-from.z),a1=Math.atan2(to.y,-to.z);
          while(a1-a0>Math.PI)a1-=Math.PI*2;while(a1-a0<-Math.PI)a1+=Math.PI*2;
          const angle=mix(a0,a1,extend),radius=mix(Math.hypot(from.y,from.z),Math.hypot(to.y,to.z),extend);
          return add(a,P(mix(from.x,to.x,extend),Math.sin(angle)*radius,-Math.cos(angle)*radius));
        };
        handL=sweep("L",shL,targets.L);handR=sweep("R",shR,targets.R);
      }else{handL=targets.L;handR=targets.R;}
      if(contact){
        // Prepare the final reach relative to the travelling shoulder. A distant
        // ledge must not rotate the wrist down and back up as it approaches.
        const reaching=lowering?((root,from,target,t)=>blendPoint(from,target,t)):arcHand;
        handL=reaching(shL,handL,add(shL,P(0,-contact.sy,-.33)),contact.weight);
        handR=reaching(shR,handR,add(shR,P(0,-contact.sy,-.33)),contact.weight);
      }
      // Flying hands are free to reach, so clamp their targets to the true arm length.
      for(const side of ["L","R"]){const a=side==="L"?shL:shR,b=side==="L"?handL:handR,d=sub(b,a),len=length(d);if(len>.697){const target=add(a,mul(d,.697/len));if(side==="L")handL=target;else handR=target;}}
    }
    if(returning&&returnT<1){
      const gripBlend=smooth(clamp((returnT-.12)/.60,0,1));
      handL=blendPoint(add(hip,sub(returning.pose.handL,returning.pose.hip)),handL,gripBlend);
      handR=blendPoint(add(hip,sub(returning.pose.handR,returning.pose.hip)),handR,gripBlend);
      for(const side of ["L","R"]){const a=side==="L"?shL:shR,b=side==="L"?handL:handR,d=sub(b,a),len=length(d);if(len>.697){const target=add(a,mul(d,.697/len));if(side==="L")handL=target;else handR=target;}}
    }
    const elbowL=joint(shL,handL,RIG.upperArm,RIG.forearm,poles.elbowL),elbowR=joint(shR,handR,RIG.upperArm,RIG.forearm,poles.elbowR);
    // Forward kinematics gives a one-way knee hinge: flexion puts heels behind
    // the knees. The entire leg follows trunk rotation plus deliberate hip drive.
    const legs={};
    for(const side of ["L","R"]){
      const origin=side==="L"?pelvisL:pelvisR;
      const thighAngle=theta+hipFlex+(side==="R"?-.035:0);
      const shinAngle=thighAngle+Math.max(.04,kneeFlex);
      let knee=add(origin,P(0,-Math.cos(thighAngle)*RIG.thigh,Math.sin(thighAngle)*RIG.thigh));
      let foot=add(knee,P(0,-Math.cos(shinAngle)*RIG.shin,Math.sin(shinAngle)*RIG.shin));
      if(stand){
        const step=smooth((mantleT-.28)/.47),target=P(origin.x,h.y+.035,h.z+(side==="L"?.21:.32));
        foot=rising?blendPoint(add(hip,sub(rising["foot"+side],rising.hip)),target,smooth(mantleT)):blendPoint(foot,target,step);const v=sub(foot,origin),d=length(v);
        if(d>.828)foot=add(origin,mul(v,.828/d));
        knee=joint(origin,foot,RIG.thigh,RIG.shin,add(origin,P(side==="L"?-.08:.08,0,-.7)));
      }else if(returning&&returnT<1){
        foot=blendPoint(add(hip,sub(returning.pose["foot"+side],returning.pose.hip)),foot,returnT);
        const v=sub(foot,origin),d=length(v);if(d>.828)foot=add(origin,mul(v,.828/d));
        knee=joint(origin,foot,RIG.thigh,RIG.shin,add(origin,P((side==="L"?-.08:.08)*(1-returnT),0,-.7)));
      }
      legs["knee"+side]=knee;legs["foot"+side]=foot;legs["shinAngle"+side]=Math.atan2(foot.z-knee.z,knee.y-foot.y);
    }
    const chest=localPoint(shoulder,up,back,-.12,-.095),neck=localPoint(shoulder,up,back,.09,-.012),head=localPoint(shoulder,up,back,.23,-.02);
    return {hip,shoulder,shL,shR,handL,handR,pelvisL,pelvisR,elbowL,elbowR,...legs,chest,neck,head,up,back,theta,hipFlex,kneeFlex,phase,grip,poles,w,standing:stand,contact,mantleT};
  }
  function pose(state) {
    if(poseHistory&&state.time<poseHistory.time-.0001)resetPoseHistory();
    const standing=isStanding(state);
    if(!state.attached&&poseHistory&&poseHistory.attached&&lastPose){
      if(state.launches>poseHistory.launches){
        const h=FX.HOLDS[poseHistory.holdIndex],launchTime=state.time-(state.flightT||0);
        const angle=FX.sampleRelease(poseHistory.mask,poseHistory.holdT).angle+FX.wind(launchTime,h.y,poseHistory.mask)*.04;
        releaseHistory={pose:lastPose,physicsY:h.y-Math.cos(angle)*FX.L,physicsZ:h.z+Math.sin(angle)*FX.L};
      }else{
        // Slip flightT includes a gameplay catch cooldown. Its visual motion
        // starts here, from the actual body, without replaying a charged launch.
        releaseHistory={pose:lastPose,physicsY:state.y,physicsZ:state.z,flightStart:state.flightT||0,slip:true};
      }
    }
    if(standing&&poseHistory&&!poseHistory.standing)mantleHistory={time:state.time,pose:poseHistory.attached?lastPose:null,sy:lastPose&&lastPose.contact?lastPose.contact.sy:null};
    if(!standing&&state.attached&&poseHistory&&poseHistory.standing&&poseHistory.holdIndex===state.holdIndex) returnHistory={time:state.time,pose:lastPose};
    if(!state.attached||standing||(returnHistory&&state.time-returnHistory.time>.55))returnHistory=null;
    if(!standing)mantleHistory=null;
    if(state.attached&&poseHistory&&!poseHistory.attached)catchHistory=lastPose&&lastPose.contact?{sy:lastPose.contact.sy}:null;
    if(!state.attached)catchHistory=null;
    if(state.attached)releaseHistory=null;
    const context=state.attached?{mantle:mantleHistory,returning:returnHistory,caught:catchHistory}:releaseHistory;
    const r=computePose(state,context);
    lastPose=r;poseHistory={attached:state.attached,standing,holdIndex:state.holdIndex,holdT:state.holdT||0,mask:state.mask,launches:state.launches||0,time:state.time};return r;
  }
  function resetPoseHistory(){lastPose=null;poseHistory=null;releaseHistory=null;mantleHistory=null;returnHistory=null;catchHistory=null;}
  function drawClimber(state,dt,forecast) {
    const r=pose(state),b=bones,up=r.up,back=r.back;
    const point=(origin,y,z,x=0)=>localPoint(origin,up,back,y,z,x);
    bone(b.torso,r.hip,r.shoulder,.22);b.torso.scale.z*=.70;
    const orient=(mesh)=>mesh.quaternion.copy(b.torso.quaternion);
    ball(b.pelvis,r.hip,.18,.15,.13);orient(b.pelvis);
    bone(b.neck,r.shoulder,r.head,.065);ball(b.head,r.head,.105,.137,.108);orient(b.head);
    ball(b.hair,point(r.head,.06,.028),.111,.09,.10);orient(b.hair);
    ball(b.nose,point(r.head,-.015,-.106),.025,.025,.03);orient(b.nose);
    ball(b.collar,r.neck,.10,.045,.092);orient(b.collar);
    ball(b.shoulderL,r.shL,.083,.085,.080);ball(b.shoulderR,r.shR,.083,.085,.080);
    for(const side of ["L","R"]){
      bone(b["upper"+side],r["sh"+side],r["elbow"+side],.082);
      bone(b["lower"+side],r["elbow"+side],r["hand"+side],.063);
      ball(b["hand"+side],r["hand"+side],.043,.056,.039);
      ball(b["elbow"+side],r["elbow"+side],.060,.065,.060);
      bone(b["thigh"+side],r["pelvis"+side],r["knee"+side],.095);
      bone(b["shin"+side],r["knee"+side],r["foot"+side],.073);
      ball(b["knee"+side],r["knee"+side],.070,.075,.070);
      const shinAngle=r["shinAngle"+side],footForward=P(0,-Math.sin(shinAngle),-Math.cos(shinAngle));
      ball(b["boot"+side],add(r["foot"+side],mul(footForward,.05)),.070,.075,.13);
      b["boot"+side].rotation.set(-shinAngle,0,0);
    }
    const sway=Math.sin(state.time*2.7)*.008*r.w;
    const pc=point(r.shoulder,-.18,.18+sway);
    ball(pack,pc,.17+r.w*.045,.43+r.w*.08,.12+r.w*.045);orient(pack);
    ball(b.packFlap,point(pc,.18,.055),.18+r.w*.04,.065,.13);orient(b.packFlap);
    ball(b.belt,point(r.hip,.055,0),.19,.035,.145);orient(b.belt);
    for(let i=0;i<2;i++){
      const x=i===0?-.125:.125;
      bone(straps[i*2],point(r.shoulder,.015,-.075,x),point(r.hip,.10,-.125,x),.017);
      bone(straps[i*2+1],point(r.shoulder,.015,-.075,x),point(pc,.19,.06,x),.018);
    }
    stepScarf(r.neck,forecast.soon,state.time,dt);return r;
  }
  function stepScarf(anchor,wind,time,dt) {
    dt=Math.min(.035,dt);const first=scarfPoints[0];
    const jump=Math.hypot(first.y-anchor.y,first.z-anchor.z)>1.8;
    if(jump)scarfPoints.forEach((p,i)=>{p.x=anchor.x;p.y=anchor.y-i*.035;p.z=anchor.z+i*.055;p.px=p.x;p.py=p.y;p.pz=p.z;});
    first.x=-.04;first.y=anchor.y;first.z=anchor.z+.07;
    const damp=Math.pow(.91,dt*60);
    for(let i=1;i<scarfPoints.length;i++){
      const p=scarfPoints[i],vx=(p.x-p.px)*damp,vy=(p.y-p.py)*damp,vz=(p.z-p.pz)*damp;p.px=p.x;p.py=p.y;p.pz=p.z;
      p.x+=vx+Math.sin(time*5+i*.7)*dt*.008;p.y+=vy-5*dt*dt;p.z+=vz+(.15+wind*.75)*dt*dt*14;
    }
    for(let k=0;k<5;k++)for(let i=1;i<scarfPoints.length;i++){
      const a=scarfPoints[i-1],b=scarfPoints[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz)||.001;
      const m=(d-.068)/d;b.x-=dx*m*.85;b.y-=dy*m*.85;b.z-=dz*m*.85;
    }
    const arr=scarf.geometry.attributes.position.array;
    scarfPoints.forEach((p,i)=>{const w=.039*(1-i/scarfPoints.length*.45),o=i*6;arr[o]=p.x-w;arr[o+1]=p.y;arr[o+2]=p.z;arr[o+3]=p.x+w;arr[o+4]=p.y+.006;arr[o+5]=p.z;});
    scarf.geometry.attributes.position.needsUpdate=true;scarf.geometry.computeVertexNormals();
  }

  function makeMemory() {
    const group=new THREE.Group(),variants={};
    const gold=new THREE.MeshStandardMaterial({color:0xbc9459,metalness:.66,roughness:.34,emissive:0x7f5024,emissiveIntensity:.14});
    const paper=new THREE.MeshStandardMaterial({color:0xc8bea2,roughness:.95});
    const sepia=new THREE.MeshStandardMaterial({color:0x6d5b47,roughness:1});
    const add=(g,geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);g.add(m);return m;};
    let g=new THREE.Group();
    add(g,new THREE.LatheGeometry([new THREE.Vector2(.013,0),new THREE.Vector2(.03,.03),new THREE.Vector2(.055,.09),new THREE.Vector2(.058,.105)],10),gold,0,.025,0);
    add(g,new THREE.CylinderGeometry(.012,.012,.065,7),gold,0,.01,0);
    add(g,new THREE.BoxGeometry(.08,.018,.08),gold,0,-.03,0);
    for(const z of [-.06,.06]){const m=add(g,new THREE.TorusGeometry(.032,.007,5,12),gold,0,.09,z);m.rotation.y=Math.PI/2;}
    variants.trophy=g;group.add(g);
    g=new THREE.Group();add(g,new THREE.BoxGeometry(.014,.10,.17),paper,0,.035,0);
    const line=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.01,.082,-.078),new THREE.Vector3(-.01,.025,0),new THREE.Vector3(-.01,.082,.078)]);
    g.add(new THREE.Line(line,new THREE.LineBasicMaterial({color:0x776e5c})));variants.letter=g;group.add(g);
    g=new THREE.Group();const r=add(g,new THREE.TorusGeometry(.049,.011,7,20),gold,0,.045,0);r.rotation.y=Math.PI/2;variants.ring=g;group.add(g);
    g=new THREE.Group();add(g,new THREE.BoxGeometry(.014,.14,.11),paper,0,.055,0);add(g,new THREE.BoxGeometry(.016,.10,.086),sepia,-.004,.062,0);
    const face=add(g,new THREE.SphereGeometry(.018,7,6),paper,-.015,.083,0);face.scale.x=.15;
    variants.photo=g;group.add(g);
    const spark=add(group,new THREE.SphereGeometry(.017,6,4),new THREE.MeshBasicMaterial({color:0xffdba2}),-.035,.08,0);
    group.userData={variants,spark};group.visible=false;return group;
  }
  function showMemory(group,kind) {
    Object.keys(group.userData.variants).forEach(k=>group.userData.variants[k].visible=k===kind);
  }

  function makeWeather() {
    weatherData=Array.from({length:420},(_,i)=>({x:mix(-6,12,hash(i+7)),y:hash(i+51)*24,z:mix(-5,14,hash(i+21)),v:hash(i+87)}));
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(420*6),3));
    weather=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xb9d5df,transparent:true,opacity:.22,depthWrite:false}));weather.frustumCulled=false;scene.add(weather);
    aimArray=new Float32Array(96*3);const a=new THREE.BufferGeometry();a.setAttribute("position",new THREE.BufferAttribute(aimArray,3));
    aim=new THREE.Line(a,new THREE.LineBasicMaterial({color:0xa8b3b1,transparent:true,opacity:.42,depthTest:true}));aim.frustumCulled=false;scene.add(aim);
    lostObjects=[];
    for(let i=0;i<4;i++){const group=makeMemory();scene.add(group);lostObjects.push(group);}
    fallingObject=makeMemory();scene.add(fallingObject);
    gate=new THREE.Group();const h=FX.HOLDS[FX.HOLDS.length-1];
    const frameMat=new THREE.MeshStandardMaterial({color:0x272d2d,roughness:.9});
    for(const z of [-.38,.38]){const m=new THREE.Mesh(new THREE.BoxGeometry(.14,2.05,.12),frameMat);m.position.set(0,1,z);gate.add(m);}
    const lintel=new THREE.Mesh(new THREE.BoxGeometry(.16,.13,.90),frameMat);lintel.position.y=2.06;gate.add(lintel);
    const light=new THREE.Mesh(new THREE.PlaneGeometry(.67,1.95),new THREE.MeshBasicMaterial({color:0xffe6b4,transparent:true,opacity:.95,side:THREE.DoubleSide}));light.rotation.y=Math.PI/2;light.position.set(.025,1.02,0);gate.add(light);
    for(let i=0;i<9;i++){
      const left=i<4, j=i%4;
      const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x505955,roughness:1,flatShading:true}));
      stone.position.set(.07,i===8?2.15:.25+j*.52,i===8?0:(left?-.46:.46));
      stone.scale.set(.22,i===8?.18:.32,i===8?.65:.21);stone.rotation.x=hash(i)*.3;stone.castShadow=true;stone.receiveShadow=true;gate.add(stone);
    }
    gate.position.set(0,h.y+.03,h.z-.16);scene.add(gate);
    gateLight=new THREE.PointLight(0xffcf8e,1.6,7,2);gateLight.position.set(-.7,h.y+1.2,h.z+.7);scene.add(gateLight);
  }

  function makePost() {
    const type=renderer.capabilities.isWebGL2&&renderer.extensions.has("EXT_color_buffer_float")?THREE.HalfFloatType:THREE.UnsignedByteType;
    sceneRT=new THREE.WebGLRenderTarget(2,2,{type,depthBuffer:true});
    bloomRT=new THREE.WebGLRenderTarget(2,2,{type,depthBuffer:false});bloomRT2=new THREE.WebGLRenderTarget(2,2,{type,depthBuffer:false});
    postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const vs="varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
    brightMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{uScene:{value:null}},vertexShader:vs,
      fragmentShader:"uniform sampler2D uScene;varying vec2 vUv;void main(){vec3 c=texture2D(uScene,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.65,1.3,l),1.);}"});
    blurMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{uTex:{value:null},uDir:{value:new THREE.Vector2()}},vertexShader:vs,
      fragmentShader:"uniform sampler2D uTex;uniform vec2 uDir;varying vec2 vUv;void main(){vec3 c=texture2D(uTex,vUv).rgb*.227027;c+=(texture2D(uTex,vUv+uDir*1.384615).rgb+texture2D(uTex,vUv-uDir*1.384615).rgb)*.316216;c+=(texture2D(uTex,vUv+uDir*3.230769).rgb+texture2D(uTex,vUv-uDir*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}"});
    postMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{uScene:{value:null},uBloom:{value:null},uBloomAmount:{value:.14},uTime:{value:0},uResolution:{value:new THREE.Vector2(1,1)}},vertexShader:vs,
      fragmentShader:`uniform sampler2D uScene,uBloom;uniform float uBloomAmount,uTime;uniform vec2 uResolution;varying vec2 vUv;
        vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
        void main(){
          vec3 c=texture2D(uScene,vUv).rgb+texture2D(uBloom,vUv).rgb*uBloomAmount;
          c=aces(c*1.05);float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(c,c*vec3(.89,.98,1.06),.32*(1.-l));
          vec2 q=vUv-.5;float vignette=1.-smoothstep(.12,.64,dot(q,q));c*=mix(.70,1.,vignette);
          c=pow(max(c,vec3(0.)),vec3(1./2.2));
          float grain=fract(sin(dot(gl_FragCoord.xy+fract(uTime)*17.,vec2(12.9898,78.233)))*43758.5453);
          c+=(grain-.5)*.003;
          gl_FragColor=vec4(c,1.);
        }`});
    quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial);quad.frustumCulled=false;
  }

  function init(canvas) {
    renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:"high-performance"});
    renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x071018,1);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x243e50,.007);
    camera=new THREE.PerspectiveCamera(40,1,.1,700);
    scene.add(new THREE.HemisphereLight(0x8fbed4,0x1b1512,.65));
    moon=new THREE.DirectionalLight(0xb9d8eb,2.6);moon.castShadow=true;
    moon.shadow.mapSize.set(1024,1024);Object.assign(moon.shadow.camera,{near:.5,far:65,left:-10,right:10,top:12,bottom:-12});moon.shadow.bias=-.00012;moon.shadow.normalBias=.025;
    scene.add(moon,moon.target);
    rim=new THREE.DirectionalLight(0xe3caa0,.8);scene.add(rim,rim.target);
    fill=new THREE.DirectionalLight(0x67849a,.4);scene.add(fill,fill.target);
    makeSky();makeMountains();makeCliff();makeClimber();makeWeather();makePost();
  }
  function setQuality(q) {
    q=clamp(Math.round(q),0,2);const old=quality;quality=q;rockU.uQuality.value=q;
    renderer.shadowMap.enabled=q>0;moon.castShadow=q>0;
    const size=q===2?1024:512;
    if(moon.shadow.mapSize.x!==size){moon.shadow.mapSize.set(size,size);if(moon.shadow.map){moon.shadow.map.dispose();moon.shadow.map=null;}}
    if(old!==q&&cliff){const oldMaterial=rockMaterial;rockMaterial=makeRockMaterial();rebuildCliff();oldMaterial.dispose();}
    mountainMeshes.forEach((m,i)=>{m.visible=q>0||i%2===0;m.material=q===0?m.userData.lowMat:m.userData.highMat;});
  }
  function resize(w,h,ratio) {
    cssWidth=w;cssHeight=h;pixelRatio=ratio;width=Math.max(2,Math.floor(w*ratio));height=Math.max(2,Math.floor(h*ratio));
    // Render targets use physical pixels; the default framebuffer viewport uses CSS pixels.
    renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);
    sceneRT.setSize(width,height);bloomRT.setSize(Math.max(2,width>>2),Math.max(2,height>>2));bloomRT2.setSize(Math.max(2,width>>2),Math.max(2,height>>2));
    postMaterial.uniforms.uResolution.value.set(width,height);
  }
  function draw(o) {
    const state=o.state,dt=clamp(Number.isFinite(o.dt)?o.dt:1/60,0,.05),now=performance.now();
    if(lastFrameTime){elapsed+=(now-lastFrameTime)/1000;frames++;if(elapsed>.6){fps=frames/elapsed;frames=0;elapsed=0;}}lastFrameTime=now;
    const camY=o.camY,focusZ=o.focusZ,alt=o.alt||0,storm=o.storm||0,gale=o.gale||0,flash=o.flash||0;
    sky.position.set(0,camY,focusZ);skyU.uAlt.value=alt;skyU.uStorm.value=gale*.6;skyU.uTime.value=state.time;skyU.uFlash.value=flash;
    mountains.position.set(0,camY-alt*13,focusZ*.15);
    rockU.uWet.value=o.wet||0;rockU.uFlash.value=flash;
    scene.fog.color.setRGB(.030+flash*.07,.055+flash*.10,.077+flash*.15);
    scene.fog.density=.0055+gale*.0025;
    moon.position.set(-6,camY+15,focusZ+10);moon.target.position.set(0,camY,focusZ-2);moon.intensity=2.25+flash*3;
    rim.position.set(4,camY+4,focusZ+7);rim.target.position.set(0,camY,focusZ);rim.intensity=.85+flash;
    fill.position.set(-9,camY+2,focusZ+3);fill.target.position.set(0,camY,focusZ);
    const forecast=FX.gustForecast(state.time,state.y,state.mask,state.descending),rig=drawClimber(state,dt,forecast);
    const arr=weather.geometry.attributes.position.array,count=quality===0?65:quality===1?160:320;
    const snow=alt>.6;
    for(let i=0;i<weatherData.length;i++){
      const p=weatherData[i],use=i<count;
      if(use){p.y-=dt*(snow?1.3+p.v:5+p.v*4);p.z+=forecast.soon*dt*(2+p.v*3);
        if(p.y<camY-12||p.y>camY+18||Math.abs(p.z-focusZ)>18){p.y=camY+10+hash(i+state.time)*8;p.x=mix(-6,12,hash(i+9));p.z=focusZ+mix(-8,12,hash(i+state.time*.2));}}
      const k=i*6,len=use?(snow?.055:.18):0;arr[k]=p.x;arr[k+1]=p.y;arr[k+2]=p.z;arr[k+3]=p.x;arr[k+4]=p.y-len;arr[k+5]=p.z+forecast.soon*(snow?.10:.06);
    }
    weather.geometry.setDrawRange(0,count*2);weather.geometry.attributes.position.needsUpdate=true;weather.material.opacity=.10+gale*.25;
    const dots=state.dots||[];let n=0;
    if(dots.length>1){
      for(let i=0;i<dots.length-1&&n<95;i++){
        const a=dots[Math.max(0,i-1)],b=dots[i],c=dots[i+1],d=dots[Math.min(dots.length-1,i+2)];
        for(let j=0;j<4&&n<95;j++){
          const t=j/4,t2=t*t,t3=t2*t;
          const cat=(key)=>(2*b[key]+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t2+(-a[key]+3*b[key]-3*c[key]+d[key])*t3)*.5;
          aimArray[n*3]=-.08;aimArray[n*3+1]=cat("y");aimArray[n*3+2]=cat("z");n++;
        }
      }
      const last=dots[dots.length-1];aimArray[n*3]=-.08;aimArray[n*3+1]=last.y;aimArray[n*3+2]=last.z;n++;
    }
    aim.geometry.setDrawRange(0,n);aim.geometry.attributes.position.needsUpdate=true;aim.visible=n>1;
    aim.material.color.set(state.armed?0xf1d5a2:0x9baeb5);aim.material.opacity=state.armed?.76:.37;
    gripLights.forEach((m,i)=>{const h=FX.HOLDS[i],d=Math.abs(h.y-state.y);m.material.opacity=d<8?(state.armed&&i===state.holdIndex+1?.85:.12):0;});
    lostObjects.forEach((g,i)=>{
      const item=(state.lost||[])[i];
      g.visible=!!item&&state.mode!=="ending"&&!(state.mode==="drop"&&state.dropKind===item.kind);
      if(item){showMemory(g,item.kind);g.position.set(-.12,item.y+.04,item.z);g.userData.spark.scale.setScalar(.7+Math.sin(state.time*2+i)*.3);}
    });
    fallingObject.visible=state.mode==="drop"&&state.dropT>=0;
    if(fallingObject.visible){showMemory(fallingObject,state.dropKind);fallingObject.position.set(-.15,state.dropY,state.dropZ);fallingObject.rotation.x=state.dropT*1.8;}

    gateLight.intensity=1.8+Math.sin(state.time*.8)*.15;
    const portrait=!!o.portrait,close=!!o.close||!!o.side;
    camera.aspect=width/height;camera.fov=close?34:portrait?44:39;
    camera.updateProjectionMatrix();
    if(close){camera.position.set(-5.3,rig.hip.y+.4,rig.hip.z+1.2);camera.lookAt(0,rig.hip.y+.1,rig.hip.z);}
    else{
      const dist=portrait?15.2:16.2,centerZ=focusZ+(portrait?.35:1.45);
      camera.position.set(-dist,camY+.6,centerZ+dist*.20);camera.lookAt(0,camY,centerZ);
    }
    camera.up.set(0,1,0);
    renderer.setRenderTarget(sceneRT);renderer.clear();renderer.render(scene,camera);
    if(quality>0){
      brightMaterial.uniforms.uScene.value=sceneRT.texture;quad.material=brightMaterial;renderer.setRenderTarget(bloomRT);renderer.render(quad,postCamera);
      blurMaterial.uniforms.uTex.value=bloomRT.texture;blurMaterial.uniforms.uDir.value.set(1.5/bloomRT.width,0);quad.material=blurMaterial;renderer.setRenderTarget(bloomRT2);renderer.render(quad,postCamera);
      blurMaterial.uniforms.uTex.value=bloomRT2.texture;blurMaterial.uniforms.uDir.value.set(0,1.5/bloomRT.height);renderer.setRenderTarget(bloomRT);renderer.render(quad,postCamera);
    }
    renderer.setRenderTarget(null);renderer.setViewport(0,0,cssWidth,cssHeight);
    postMaterial.uniforms.uScene.value=sceneRT.texture;postMaterial.uniforms.uBloom.value=quality>0?bloomRT.texture:sceneRT.texture;postMaterial.uniforms.uBloomAmount.value=quality>0?.18:0;postMaterial.uniforms.uTime.value=state.time;
    quad.material=postMaterial;renderer.render(quad,postCamera);
  }
  window.FXRender={init,resize,setQuality,draw,computePose,updatePose:pose,resetPoseHistory,RIG,poseDimensions:RIG,get pose(){return lastPose;},get fps(){return fps;},get quality(){return quality;}};
})();
