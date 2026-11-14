/* Everything in this scene is geometry, light, or procedural shader code. No image assets. */
(function () {
  "use strict";
  const FX = window.Fangxia, THREE = window.THREE;
  let renderer, scene, camera, world, character;
  let weather, weatherData, aim, aimArray, lostObjects, fallingObject;
  let chalkDust, dustData, lastCatches=0, dustTime=-1, reducedMotion=false;
  let sceneRT, bloomRT, bloomRT2, postCamera, quad, brightMaterial, blurMaterial, postMaterial;
  let quality = 2, pixelRatio = 1, width = 2, height = 2, cssWidth = 2, cssHeight = 2;
  let fps = 60, frames = 0, elapsed = 0, lastFrameTime = 0;
  const topY = FX.HOLDS[FX.HOLDS.length - 1].y;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const P = (x, y, z) => ({ x, y, z });
  const RIG = { torso: .53, upperArm: .36, forearm: .34, thigh: .42, shin: .41 };
  let lastPose = null, poseHistory = null, mantleHistory = null, returnHistory = null, catchHistory = null;
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
  function isStanding(state) {
    // Ordinary rock lips cannot support a pair of boots. Rest and drop choices
    // keep the same secure hanging pose; only the summit has a real platform.
    return state.attached&&(state.mode==="ending"||(state.crown&&!state.descending));
  }
  function computePose(state,release) {
    const h=FX.HOLDS[state.holdIndex]||FX.HOLDS[0],w=FX.weight01(state.mask);
    const charging=state.attached&&state.holding&&state.mode==="play"&&(state.holdT||0)>.0001;
    const stand=isStanding(state);
    let phase=0;
    const grip=P(0,h.y+.035,h.z+.035);
    let shoulder,hip,theta,hipFlex,kneeFlex,handL,handR,contact=null,flyingArms=null;
    const mantle=stand&&release&&release.mantle;
    const rising=mantle&&mantle.pose;
    const mantleDuration=(rising?.78:1.05)+w*.18;
    const mantleT=mantle?clamp((state.time-mantle.time)/mantleDuration,0,1):1;
    if(stand){
      // The summit threshold is at h.y + .125; a boot sole sits .09 below
      // its ankle. These anchors support the feet instead of burying the boots.
      theta=.055;hip=P(0,h.y+1.04,h.z+.27);hipFlex=-.04;kneeFlex=.13;
      if(rising&&mantleT<1){
        const p=smooth(mantleT);
        hip=blendPoint(rising.hip,hip,p);theta=mix(rising.theta,theta,p);hipFlex=mix(rising.hipFlex,hipFlex,p);kneeFlex=mix(rising.kneeFlex,kneeFlex,p);
      }else if(mantleT<1){
        const p=mantleT;
        const initialY=mantle.sy==null?-.43:mantle.sy,dipY=initialY-.08;
        const sy=p<.16?mix(initialY,dipY,smooth(p/.16)):p<.54?mix(dipY,.36,smooth((p-.16)/.38)):mix(.36,1.5342,smooth((p-.54)/.46));
        const sz=mix(.33,.2059,smooth(p));theta=mix(.20,.055,smooth(p));
        shoulder=P(0,grip.y+sy,grip.z+sz);hip=sub(shoulder,mul(P(0,Math.cos(theta),-Math.sin(theta)),RIG.torso));
        hipFlex=0;kneeFlex=mix(.65,.13,smooth(p));
      }
    }else if(state.attached){
      const frame=FX.chargeFrame(state.mask,charging?(state.holdT||0):0,state.time,h.y,!!state.descending);
      let {sy,sz}=frame;
      phase=frame.phase;theta=frame.theta;hipFlex=frame.hipFlex;kneeFlex=frame.kneeFlex;
      if(!charging){
        const absorb=1-smooth(clamp(((state.settle==null?1:state.settle)-.15)/.85,0,1));
        const catchY=release&&release.caught?release.caught.sy:-.43;
        sy=mix(sy,catchY,absorb);sz=mix(sz,.33,absorb);theta=mix(theta,.20,absorb);kneeFlex=mix(kneeFlex,.65,absorb);
      }
      // The hands stay on the rock. Bound the shoulder root, never scale an arm.
      const d=Math.hypot(sy,sz),max=.697;
      if(d>max){sy*=max/d;sz*=max/d;}
      shoulder=P(0,grip.y+sy,grip.z+sz);
      const up=P(0,Math.cos(theta),-Math.sin(theta));
      hip=sub(shoulder,mul(up,RIG.torso));
      handL=P(-.17,grip.y,grip.z);handR=P(.17,grip.y,grip.z);
    }else{
      // Gameplay collision and the dressed skeleton share this root, including
      // the catch preparation. A second visual hip correction would let limbs
      // pass through terrain that the physical capsules had already cleared.
      const frame=FX.bodyFrame(state);
      hip=P(frame.hip.x||0,frame.hip.y,frame.hip.z);theta=frame.theta;
      hipFlex=frame.hipFlex;kneeFlex=frame.kneeFlex;contact=frame.contact||null;
      flyingArms=FX.flightArms(state,frame);
    }
    // Climb around the summit lip before planting the soles. A straight hip
    // interpolation drives the bent thigh through the outer edge halfway up.
    const mantleClearance=stand?.20*Math.sin(Math.PI*mantleT)**2:0;
    if(mantleClearance){hip.z+=mantleClearance;shoulder=null;}
    const returning=state.attached&&!stand&&release&&release.returning;
    const returnDuration=.58+w*.20;
    const returnT=returning?smooth(clamp((state.time-returning.time)/returnDuration,0,1)):1;
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
      const free=smooth((mantleT-.78)/.22);
      handL=blendPoint(P(-.17,grip.y,grip.z),localPoint(shL,up,back,-.56,-.08,-.025),free);
      handR=blendPoint(P(.17,grip.y,grip.z),localPoint(shR,up,back,-.56,-.08,.025),free);
      if(rising){
        const p=smooth(mantleT);
        handL=blendPoint(add(hip,sub(rising.handL,rising.hip)),localPoint(shL,up,back,-.56,-.08,-.025),p);
        handR=blendPoint(add(hip,sub(rising.handR,rising.hip)),localPoint(shR,up,back,-.56,-.08,.025),p);
      }
      for(const side of ["L","R"]){const a=side==="L"?shL:shR,b=side==="L"?handL:handR,d=sub(b,a),len=length(d);if(len>.697){const target=add(a,mul(d,.697/len));if(side==="L")handL=target;else handR=target;}}
    }else if(!state.attached){
      // The collision solver and renderer use the same immutable release pose
      // and arm sweep, independent of the display's previous frame rate.
      handL=flyingArms.handL;handR=flyingArms.handR;
    }
    if(returning&&returnT<1){
      const gripBlend=smooth(clamp((returnT-.12)/.60,0,1));
      handL=blendPoint(add(hip,sub(returning.pose.handL,returning.pose.hip)),handL,gripBlend);
      handR=blendPoint(add(hip,sub(returning.pose.handR,returning.pose.hip)),handR,gripBlend);
      for(const side of ["L","R"]){const a=side==="L"?shL:shR,b=side==="L"?handL:handR,d=sub(b,a),len=length(d);if(len>.697){const target=add(a,mul(d,.697/len));if(side==="L")handL=target;else handR=target;}}
    }
    const elbowL=flyingArms?flyingArms.elbowL:joint(shL,handL,RIG.upperArm,RIG.forearm,poles.elbowL),elbowR=flyingArms?flyingArms.elbowR:joint(shR,handR,RIG.upperArm,RIG.forearm,poles.elbowR);
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
        const step=smooth((mantleT-.55)/.45),target=P(origin.x,h.y+.22,h.z+(side==="L"?.21:.32)+mantleClearance);
        foot=rising?blendPoint(add(hip,sub(rising["foot"+side],rising.hip)),target,smooth(mantleT)):blendPoint(foot,target,step);const v=sub(foot,origin),d=length(v);
        if(d>.828)foot=add(origin,mul(v,.828/d));
        knee=joint(origin,foot,RIG.thigh,RIG.shin,add(origin,P(side==="L"?-.08:.08,0,-.7)));
      }else if(returning&&returnT<1){
        foot=blendPoint(add(hip,sub(returning.pose["foot"+side],returning.pose.hip)),foot,returnT);
        const v=sub(foot,origin),d=length(v);if(d>.828)foot=add(origin,mul(v,.828/d));
        knee=joint(origin,foot,RIG.thigh,RIG.shin,add(origin,P((side==="L"?-.08:.08)*(1-returnT),0,-.7)));
      }
      legs["knee"+side]=knee;legs["foot"+side]=foot;
      const actualShin=Math.atan2(foot.z-knee.z,knee.y-foot.y);
      legs["shinAngle"+side]=actualShin;
      // The ankle levels the sole on the summit. Rotating the boot with the
      // shin would bury its toe even when the ankle is above the platform.
      legs["bootAngle"+side]=stand?actualShin*(1-smooth(mantleT)):returning&&returnT<1?mix(returning.pose["bootAngle"+side]||0,actualShin,returnT):actualShin;
    }
    const chest=localPoint(shoulder,up,back,-.12,-.095),neck=localPoint(shoulder,up,back,.09,-.012),head=localPoint(shoulder,up,back,.23,-.02);
    return {hip,shoulder,shL,shR,handL,handR,pelvisL,pelvisR,elbowL,elbowR,...legs,chest,neck,head,up,back,theta,hipFlex,kneeFlex,phase,grip,poles,w,standing:stand,contact,mantleT};
  }
  // Collision regressions inspect the volume occupied by the dressed skeleton,
  // not only zero-radius joints. Fingers may wrap the grip; sleeves stop before
  // that contact so every other part has an unambiguous outside-of-rock test.
  function visualCapsules(r) {
    const capsules=[];
    const put=(name,a,b,radius,endRadius=radius)=>capsules.push({name,a,b,radius,endRadius});
    put("torso",r.hip,r.shoulder,.15);
    put("head",localPoint(r.head,r.up,r.back,-.01,0),localPoint(r.head,r.up,r.back,.02,0),.145);
    const packCenter=localPoint(r.shoulder,r.up,r.back,-.215,.207);
    put("pack",add(packCenter,mul(r.up,-.11)),add(packCenter,mul(r.up,.11)),mix(.16,.195,r.w));
    for(const side of ["L","R"]){
      const sh=r["sh"+side],elbow=r["elbow"+side],hand=r["hand"+side],pelvis=r["pelvis"+side],knee=r["knee"+side],foot=r["foot"+side];
      const cuff=sub(hand,mul(unit(sub(hand,elbow)),.04));
      put("upperArm"+side,sh,elbow,.094,.080);
      put("forearm"+side,elbow,cuff,.080,.046);
      put("thigh"+side,pelvis,knee,.120,.094);
      put("shin"+side,knee,foot,.091,.064);
      const a=r["bootAngle"+side],c=Math.cos(a),s=Math.sin(a);
      const bootPoint=(y,z)=>P(foot.x,foot.y+c*y+s*z,foot.z-s*y+c*z);
      put("boot"+side,bootPoint(-.012,-.095),bootPoint(0,.045),.078);
    }
    return capsules;
  }
  function visualCapsuleSamples(r,maxStep=.065) {
    const points=[];
    for(const capsule of visualCapsules(r)){
      const count=Math.max(1,Math.ceil(length(sub(capsule.b,capsule.a))/Math.max(.015,maxStep)));
      for(let i=0;i<=count;i++){
        const t=i/count,p=blendPoint(capsule.a,capsule.b,t);
        points.push({...p,name:capsule.name,radius:mix(capsule.radius,capsule.endRadius,t)});
      }
    }
    return points;
  }
  function pose(state) {
    if(poseHistory&&state.time<poseHistory.time-.0001)resetPoseHistory();
    const standing=isStanding(state);
    if(standing&&poseHistory&&!poseHistory.standing)mantleHistory={time:state.time,pose:poseHistory.attached?lastPose:null,sy:lastPose&&lastPose.contact?lastPose.contact.sy:null};
    if(!standing&&state.attached&&poseHistory&&poseHistory.standing&&poseHistory.holdIndex===state.holdIndex) returnHistory={time:state.time,pose:lastPose};
    if(!state.attached||standing||(returnHistory&&state.time-returnHistory.time>.80))returnHistory=null;
    if(!standing)mantleHistory=null;
    if(state.attached&&poseHistory&&!poseHistory.attached)catchHistory=lastPose&&lastPose.contact?{sy:lastPose.contact.sy}:null;
    if(!state.attached)catchHistory=null;
    const context=state.attached?{mantle:mantleHistory,returning:returnHistory,caught:catchHistory}:null;
    const r=computePose(state,context);
    lastPose=r;poseHistory={attached:state.attached,standing,descending:!!state.descending,holdIndex:state.holdIndex,holdT:state.holdT||0,mask:state.mask,launches:state.launches||0,time:state.time};return r;
  }
  function resetPoseHistory(){lastPose=null;poseHistory=null;mantleHistory=null;returnHistory=null;catchHistory=null;}
  function drawClimber(state,dt,forecast) {
    const r=pose(state);character.draw(r,state,dt,forecast);return r;
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
    dustData=Array.from({length:36},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0}));
    const dustGeo=new THREE.BufferGeometry();
    dustGeo.setAttribute("position",new THREE.BufferAttribute(new Float32Array(dustData.length*3),3));
    dustGeo.setAttribute("aFade",new THREE.BufferAttribute(new Float32Array(dustData.length),1));
    const dustMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:"attribute float aFade;varying float vFade;void main(){vFade=aFade;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(24./max(1.,-p.z),1.,4.);}",
      fragmentShader:"varying float vFade;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.16,.5,d))*vFade;if(a<.005)discard;gl_FragColor=vec4(.36,.34,.29,a*.65);}"});
    chalkDust=new THREE.Points(dustGeo,dustMat);chalkDust.frustumCulled=false;scene.add(chalkDust);
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
    postMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{uScene:{value:null},uBloom:{value:null},uBloomAmount:{value:.10},uTime:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uQuality:{value:quality}},vertexShader:vs,
      fragmentShader:`uniform sampler2D uScene,uBloom;uniform float uBloomAmount,uTime,uQuality;uniform vec2 uResolution;varying vec2 vUv;
        vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
        vec3 antialias(vec2 uv){
          vec2 px=1./uResolution;vec3 mid=texture2D(uScene,uv).rgb;
          vec3 nw=texture2D(uScene,uv+vec2(-1.,-1.)*px).rgb,ne=texture2D(uScene,uv+vec2(1.,-1.)*px).rgb;
          vec3 sw=texture2D(uScene,uv+vec2(-1.,1.)*px).rgb,se=texture2D(uScene,uv+vec2(1.,1.)*px).rgb;
          vec3 luma=vec3(.299,.587,.114);float m=dot(mid,luma),a=dot(nw,luma),b=dot(ne,luma),c=dot(sw,luma),d=dot(se,luma);
          float lo=min(m,min(min(a,b),min(c,d))),hi=max(m,max(max(a,b),max(c,d)));
          if(hi-lo<max(.016,hi*.11))return mid;
          vec2 dir=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
          float reduce=max((a+b+c+d)*.03125,.0078125);
          dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-6.),vec2(6.))*px;
          vec3 one=.5*(texture2D(uScene,uv-dir/6.).rgb+texture2D(uScene,uv+dir/6.).rgb);
          vec3 two=one*.5+.25*(texture2D(uScene,uv-dir*.5).rgb+texture2D(uScene,uv+dir*.5).rgb);
          float check=dot(two,luma);return check<lo||check>hi?one:two;
        }
        void main(){
          vec3 c=uQuality<.5?texture2D(uScene,vUv).rgb:antialias(vUv);
          if(uBloomAmount>0.)c+=texture2D(uBloom,vUv).rgb*uBloomAmount;
          c=aces(c*1.04);float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(c,c*vec3(.96,.99,1.025),.2*(1.-l));
          vec2 q=vUv-.5;float vignette=1.-smoothstep(.16,.69,dot(q,q));c*=mix(.86,1.,vignette);
          c=pow(max(c,vec3(0.)),vec3(1./2.2));
          float grain=fract(sin(dot(gl_FragCoord.xy+fract(uTime)*17.,vec2(12.9898,78.233)))*43758.5453);
          c+=(grain-.5)*.002;
          gl_FragColor=vec4(c,1.);
        }`});
    quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial);quad.frustumCulled=false;
  }

  function init(canvas) {
    reducedMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:"high-performance"});
    renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x071018,1);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x243e50,.007);
    camera=new THREE.PerspectiveCamera(40,1,.1,700);
    world=window.FXWorld.create({THREE,FX,scene,renderer,quality});
    character=window.FXCharacter.create({THREE,scene,quality});
    makeWeather();makePost();
  }
  function setQuality(q) {
    quality=clamp(Math.round(q),0,2);
    renderer.shadowMap.enabled=quality>0;
    world.setQuality(quality);character.setQuality(quality);
    if(postMaterial)postMaterial.uniforms.uQuality.value=quality;
  }

  function resize(w,h,ratio) {
    cssWidth=w;cssHeight=h;pixelRatio=ratio;width=Math.max(2,Math.floor(w*ratio));height=Math.max(2,Math.floor(h*ratio));
    // Render targets use physical pixels; the default framebuffer viewport uses CSS pixels.
    renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);
    sceneRT.setSize(width,height);bloomRT.setSize(Math.max(2,width>>2),Math.max(2,height>>2));bloomRT2.setSize(Math.max(2,width>>2),Math.max(2,height>>2));
    postMaterial.uniforms.uResolution.value.set(width,height);
  }
  function restoreContext() {
    // Render targets lose their contents with the context. Scene/post targets
    // are redrawn each frame; the generated environment must be baked again.
    world.restoreContext();
    lastFrameTime=0;frames=0;elapsed=0;
  }
  function draw(o) {
    const state=o.state,dt=clamp(Number.isFinite(o.dt)?o.dt:1/60,0,.05),now=performance.now();
    if(lastFrameTime){elapsed+=(now-lastFrameTime)/1000;frames++;if(elapsed>.6){fps=frames/elapsed;frames=0;elapsed=0;}}lastFrameTime=now;
    const camY=o.camY,focusZ=o.focusZ,alt=o.alt||0,storm=o.storm||0,gale=o.gale||0,flash=o.flash||0;
    const forecast=FX.gustForecast(state.time,state.y,state.mask,!!(state.returning||state.descending)),rig=drawClimber(state,dt,forecast);
    world.update({...o,state,dt,camY,focusZ,alt,storm,gale,flash,forecast,rig});
    const arr=weather.geometry.attributes.position.array,count=quality===0?65:quality===1?160:320;
    const snow=alt>.6;
    for(let i=0;i<weatherData.length;i++){
      const p=weatherData[i],use=i<count;
      if(use){p.y-=dt*(snow?1.3+p.v:5+p.v*4);p.z+=forecast.soon*dt*(2+p.v*3);
        if(p.y<camY-12||p.y>camY+18||Math.abs(p.z-focusZ)>18){p.y=camY+10+hash(i+state.time)*8;p.x=mix(-6,12,hash(i+9));p.z=focusZ+mix(-8,12,hash(i+state.time*.2));}}
      const k=i*6,len=use?(snow?.055:.18):0;arr[k]=p.x;arr[k+1]=p.y;arr[k+2]=p.z;arr[k+3]=p.x;arr[k+4]=p.y-len;arr[k+5]=p.z+forecast.soon*(snow?.10:.06);
    }
    weather.geometry.setDrawRange(0,count*2);weather.geometry.attributes.position.needsUpdate=true;weather.material.opacity=.10+gale*.25;
    if(state.time<dustTime||state.catches<lastCatches)dustData.forEach(p=>p.life=0);
    if(state.catches>lastCatches&&dt>0){
      const h=FX.HOLDS[state.holdIndex],count=quality===0?6:12;
      for(let j=0;j<count;j++){
        const p=dustData.find(p=>p.life<=0)||dustData[j];
        p.x=(hash(j+state.catches*3)-.5)*.30;p.y=h.y+.03;p.z=h.z+.06;
        p.vx=(hash(j+13)-.5)*.24;p.vy=.05+hash(j+16)*.45;p.vz=.15+hash(j+37)*.55;p.life=.25+hash(j+41)*.5;
      }
    }
    lastCatches=state.catches;dustTime=state.time;
    const dustPos=chalkDust.geometry.attributes.position.array,dustFade=chalkDust.geometry.attributes.aFade.array;
    dustData.forEach((p,i)=>{
      if(dt>0&&p.life>0){p.life=Math.max(0,p.life-dt);p.vy-=dt*2.1;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=(p.vz+forecast.soon*.3)*dt;}
      dustPos[i*3]=p.x;dustPos[i*3+1]=p.y;dustPos[i*3+2]=p.z;dustFade[i]=Math.min(1,p.life*5);
    });
    chalkDust.geometry.attributes.position.needsUpdate=true;chalkDust.geometry.attributes.aFade.needsUpdate=true;
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
    lostObjects.forEach((g,i)=>{
      const item=(state.lost||[])[i];
      g.visible=!!item&&state.mode!=="ending"&&!(state.mode==="drop"&&state.dropKind===item.kind);
      if(item){showMemory(g,item.kind);g.position.set(-.12,item.y+.04,item.z);g.userData.spark.scale.setScalar(.7+Math.sin(state.time*2+i)*.3);}
    });
    fallingObject.visible=state.mode==="drop"&&state.dropT>=0;
    if(fallingObject.visible){showMemory(fallingObject,state.dropKind);fallingObject.position.set(-.15,state.dropY,state.dropZ);fallingObject.rotation.x=state.dropT*1.8;}

    const portrait=!!o.portrait,close=!!o.close||!!o.side;
    camera.aspect=width/height;camera.fov=close?34:portrait?44:39;
    camera.updateProjectionMatrix();
    if(close){camera.position.set(-5.3,rig.hip.y+.4,rig.hip.z+1.2);camera.lookAt(0,rig.hip.y+.1,rig.hip.z);}
    else{
      const dist=portrait?15.2:16.2,centerZ=focusZ+(portrait?.35:1.45);
      camera.position.set(-dist,camY+.6,centerZ+dist*.20);camera.lookAt(0,camY,centerZ);
    }
    camera.up.set(0,1,0);
    if(!close&&!reducedMotion){
      const impulse=Math.min(.55,state.shake||0);
      camera.position.y+=Math.sin(state.time*78)*impulse*.10;
      camera.position.z+=Math.sin(state.time*93+1.2)*impulse*.065;
    }
    renderer.info.reset();
    renderer.setRenderTarget(sceneRT);renderer.clear();renderer.render(scene,camera);
    if(quality>0){
      brightMaterial.uniforms.uScene.value=sceneRT.texture;quad.material=brightMaterial;renderer.setRenderTarget(bloomRT);renderer.render(quad,postCamera);
      blurMaterial.uniforms.uTex.value=bloomRT.texture;blurMaterial.uniforms.uDir.value.set(1.5/bloomRT.width,0);quad.material=blurMaterial;renderer.setRenderTarget(bloomRT2);renderer.render(quad,postCamera);
      blurMaterial.uniforms.uTex.value=bloomRT2.texture;blurMaterial.uniforms.uDir.value.set(0,1.5/bloomRT.height);renderer.setRenderTarget(bloomRT);renderer.render(quad,postCamera);
    }
    renderer.setRenderTarget(null);renderer.setViewport(0,0,cssWidth,cssHeight);
    postMaterial.uniforms.uScene.value=sceneRT.texture;postMaterial.uniforms.uBloom.value=quality>0?bloomRT.texture:sceneRT.texture;postMaterial.uniforms.uBloomAmount.value=quality>0?.12:0;postMaterial.uniforms.uTime.value=state.time;
    quad.material=postMaterial;renderer.render(quad,postCamera);
  }
  window.FXRender={init,resize,setQuality,restoreContext,draw,computePose,updatePose:pose,resetPoseHistory,visualCapsules,visualCapsuleSamples,RIG,poseDimensions:RIG,get pose(){return lastPose;},get fps(){return fps;},get quality(){return quality;},get diagnostics(){
    if(!renderer)return null;
    const targets=[sceneRT,bloomRT,bloomRT2].map(t=>({width:t.width,height:t.height,bytesPerColorPixel:t.texture.type===THREE.HalfFloatType?8:4,depth:t.depthBuffer}));
    return {quality,canvas:{width,height,cssWidth,cssHeight,ratio:pixelRatio},memory:{...renderer.info.memory},render:{...renderer.info.render},programs:renderer.info.programs.length,targets,estimatedTargetBytes:targets.reduce((sum,t)=>sum+t.width*t.height*(t.bytesPerColorPixel+(t.depth?4:0)),0),world:world.stats,character:character.stats};
  }};
})();
