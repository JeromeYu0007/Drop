/* Procedural mountain world. Textures are baked from deterministic noise at boot;
 * no downloaded images, fonts, models or environment maps. */
(function () {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const hash=(x,y=0)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  function noise(x,y,period=0){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const h=(a,b)=>hash(period?((a%period)+period)%period:a,period?((b%period)+period)%period:b);return mix(mix(h(ix,iy),h(ix+1,iy),u),mix(h(ix,iy+1),h(ix+1,iy+1),u),v);}
  function fbm(x,y,octaves=5){let sum=0,weight=.5;for(let i=0;i<octaves;i++){sum+=noise(x,y)*weight;x=x*2.03+13.1;y=y*2.03+7.7;weight*=.5;}return sum;}

  function create({THREE,FX,scene,renderer,quality=2}) {
    let q=quality;
    const top=FX.HOLDS[FX.HOLDS.length-1].y, root=new THREE.Group();root.name='procedural mountain world';scene.add(root);
    const resources={geometries:new Set(),materials:new Set(),textures:new Set()}, cliffBands=[],ranges=[],mistLayers=[],holdLights=[];
    const geo=g=>{resources.geometries.add(g);return g;}, mat=m=>{resources.materials.add(m);return m;};
    const add=(geometry,material,parent=root)=>{const m=new THREE.Mesh(geo(geometry),material);parent.add(m);return m;};
    const uniforms={uRock:{value:null},uRockNormal:{value:null},uWet:{value:0},uTop:{value:top},uQuality:{value:q},uFlash:{value:0}};

    function bakeRock(){
      const size=512, heights=new Float32Array(size*size),cracks=new Float32Array(size*size),field=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=x/size,v=y/size,broad=noise(u*4,v*4,4),warpX=noise(u*4+1.7,v*4+2.3,4)*2,warpY=noise(u*4+3.1,v*4+.7,4)*2;let grain=0,amp=.5;
        // Domain warping breaks the lattice of value-noise derivatives; the old
        // aligned high octaves read as a woven grid on grazing-angle rock.
        for(let i=0;i<4;i++){const f=8<<i;grain+=noise(u*f+warpX*(1+i*.6),v*f+warpY*(1+i*.6),f)*amp;amp*=.5;}
        heights[y*size+x]=.26+grain*.24+broad*.10+(hash(x,y)-.5)*.002;
      }
      // Fractures are open, branching fault traces. Noise isolines make closed
      // contour rings and look like patterned cloth rather than broken stone.
      const stroke=(ax,ay,bx,by,width,depth)=>{
        const left=Math.floor(Math.min(ax,bx)-width*2),right=Math.ceil(Math.max(ax,bx)+width*2),low=Math.floor(Math.min(ay,by)-width*2),high=Math.ceil(Math.max(ay,by)+width*2);
        const dx=bx-ax,dy=by-ay,d2=dx*dx+dy*dy;
        for(let y=low;y<=high;y++)for(let x=left;x<=right;x++){
          const t=clamp(((x-ax)*dx+(y-ay)*dy)/Math.max(1,d2),0,1),d=Math.hypot(x-ax-t*dx,y-ay-t*dy);
          if(d>width*2)continue;const k=1-smooth(d/(width*2)),index=((y%size+size)%size)*size+((x%size+size)%size);
          cracks[index]=Math.max(cracks[index],k*depth);heights[index]-=k*depth*.095;
        }
      };
      for(let chain=0;chain<15;chain++){
        let x=hash(chain,17)*size,y=hash(chain,91)*size,angle=hash(chain,38)*Math.PI*2;
        const count=3+Math.floor(hash(chain,13)*7),width=.45+hash(chain,76)*.95;
        for(let j=0;j<count;j++){
          const a=angle+(hash(chain*23+j,5)-.5)*.75,len=18+hash(chain*31+j,77)*48,nx=x+Math.cos(a)*len,ny=y+Math.sin(a)*len;
          stroke(x,y,nx,ny,width,.45+hash(j,chain)*.5);
          if(j%3===1){const ba=a+.6+hash(j,chain)*.5;stroke(nx,ny,nx+Math.cos(ba)*len*.65,ny+Math.sin(ba)*len*.65,width*.5,.35);}
          x=nx;y=ny;angle=a;
        }
      }
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const i=y*size+x,o=i*4,u=x/size,v=y/size,h=heights[i];
        field[o]=clamp(h*255*1.6,0,255);field[o+1]=clamp((.55+noise(u*128,v*128,128)*.3)*255,0,255);
        field[o+2]=clamp(cracks[i]*255,0,255);field[o+3]=clamp((noise(u*32+3,v*32+7,32)*.7+noise(u*4,v*4,4)*.3)*255,0,255);
        const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*4,dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*4;
        const inv=1/Math.hypot(dx,dy,1);normal[o]=(-dx*inv*.5+.5)*255;normal[o+1]=(-dy*inv*.5+.5)*255;normal[o+2]=(inv*.5+.5)*255;normal[o+3]=255;
      }
      const make=(data,n)=>{const t=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;resources.textures.add(t);return t;};
      uniforms.uRock.value=make(field,size);uniforms.uRockNormal.value=make(normal,size);
      const cloud=new Uint8Array(256*256*4);
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=x/256,v=y/256;let n=0,w=.5;for(let i=0;i<5;i++){const f=4<<i;n+=noise(u*f,v*f,f)*w;w*=.5;}const o=(y*256+x)*4;cloud[o]=cloud[o+1]=cloud[o+2]=n*255;cloud[o+3]=255;}
      return make(cloud,256);
    }
    const atmosphereTexture=bakeRock();
    const rock=mat(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.91,metalness:.035,vertexColors:true,side:THREE.DoubleSide}));
    rock.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockWorld;varying vec3 vRockN;')
        .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvRockN=normalize(mat3(modelMatrix)*objectNormal);')
        .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRockWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vRockWorld;varying vec3 vRockN;uniform sampler2D uRock,uRockNormal;uniform float uWet,uTop,uQuality,uFlash;
        vec3 rBlend; vec3 rPosition; float wetness; float rockSnow;
        vec4 rockSample(sampler2D tex,vec3 p,vec3 w){if(uQuality<.5){if(w.x>w.y&&w.x>w.z)return texture2D(tex,p.zy);if(w.y>w.z)return texture2D(tex,p.xz);return texture2D(tex,p.xy);}return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
      `).replace('#include <color_fragment>',`#include <color_fragment>
        vec3 wn=normalize(vRockN);rBlend=pow(abs(wn),vec3(6.));rBlend/=max(.001,dot(rBlend,vec3(1.)));
        rPosition=vRockWorld*.19;rPosition.y+=vRockWorld.z*.027;
        vec3 rotated=vec3(rPosition.x*.73+rPosition.z*.44,rPosition.y*.71-rPosition.z*.19,rPosition.z*.73-rPosition.x*.44);
        vec4 stone=rockSample(uRock,rPosition,rBlend);if(uQuality>.5)stone=mix(stone,rockSample(uRock,rotated+vec3(.17,.51,.32),rBlend),.32);
        vec4 macro=rockSample(uRock,rPosition*.113+vec3(.27,.41,.18),rBlend);
        vec3 slate=mix(vec3(.105,.112,.112),vec3(.205,.201,.181),smoothstep(.17,.82,stone.r));
        slate=mix(slate,vec3(.155,.128,.098),smoothstep(.60,.82,macro.a)*.36);
        slate*=1.-stone.b*.30;
        slate*=.79+macro.r*.50;
        float quartz=smoothstep(.75,.91,stone.a)*smoothstep(.50,.77,stone.r);slate+=vec3(.085,.09,.085)*quartz;
        wetness=uWet*smoothstep(.40,.69,texture2D(uRock,vRockWorld.zy*vec2(.11,.018)).r)*.78;
        slate*=1.-wetness*.48;
        rockSnow=smoothstep(uTop*.54,uTop*.9,vRockWorld.y)*smoothstep(.18,.66,wn.y)*smoothstep(.16,.62,macro.r);
        slate=mix(slate,vec3(.53,.59,.61),rockSnow*.94);
        diffuseColor.rgb*=slate*(1.+uFlash*.13);
      `).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
        vec3 nx=vec3(0.),ny=vec3(0.),nz=vec3(0.);
        if(uQuality<.5){if(rBlend.x>rBlend.y&&rBlend.x>rBlend.z)nx=texture2D(uRockNormal,rPosition.zy).xyz*2.-1.;else if(rBlend.y>rBlend.z)ny=texture2D(uRockNormal,rPosition.xz).xyz*2.-1.;else nz=texture2D(uRockNormal,rPosition.xy).xyz*2.-1.;}
        else{nx=texture2D(uRockNormal,rPosition.zy).xyz*2.-1.;ny=texture2D(uRockNormal,rPosition.xz).xyz*2.-1.;nz=texture2D(uRockNormal,rPosition.xy).xyz*2.-1.;}
        vec3 detail=vec3(0.,nx.y,nx.x)*rBlend.x+vec3(ny.x,0.,ny.y)*rBlend.y+vec3(nz.x,nz.y,0.)*rBlend.z;
        normal=normalize(normal+mat3(viewMatrix)*detail*(.12-rockSnow*.08));
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.89-wetness*.56+rockSnow*.06,.25,1.);');
    };
    rock.customProgramCacheKey=()=> 'drop-geology-v5';
    const rockLow=mat(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}));rockLow.onBeforeCompile=rock.onBeforeCompile;rockLow.customProgramCacheKey=()=> 'drop-geology-low-v5';

    function indexedBands(positions,indices,colors,bandHeight=24){
      const full=geo(new THREE.BufferGeometry());full.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));full.setIndex(indices);full.computeVertexNormals();
      const normals=full.attributes.normal.array,bands=new Map();
      for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],y=(positions[a*3+1]+positions[b*3+1]+positions[c*3+1])/3,key=Math.floor(y/bandHeight);if(!bands.has(key))bands.set(key,[]);bands.get(key).push(a,b,c);}
      for(const [key,ids] of bands){
        const map=new Map(),p=[],n=[],co=[],ix=[];
        for(const id of ids){let index=map.get(id);if(index===undefined){index=map.size;map.set(id,index);for(let j=0;j<3;j++){p.push(positions[id*3+j]);n.push(normals[id*3+j]);co.push(colors?colors[id*3+j]:1);}}ix.push(index);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(co,3));g.setIndex(ix);g.computeBoundingSphere();
        const m=add(g,rock);m.castShadow=m.receiveShadow=true;m.userData.bandY=(key+.5)*bandHeight;cliffBands.push(m);
      }
      full.dispose();resources.geometries.delete(full);
    }
    function makeCliff(){
      const data=FX.buildCliffMesh(.20,.26),p=data.positions,rows=[];let width=1;
      while(width<p.length/3&&Math.abs(p[width*3+1]-p[1])<.0001)width++;
      // Keep every play surface vertex exactly as authored; only truncate above the door.
      const allRows=p.length/(width*3),crest=[];
      for(let x=0;x<width;x++){
        const px=p[x*3],ceiling=top+2.75+Math.sin(px*2.1)*.16+Math.sin(px*5.2)*.055;let row=1;
        while(row<allRows&&p[(row*width+x)*3+1]<ceiling)row++;
        const a=((row-1)*width+x)*3,b=(row*width+x)*3,t=(ceiling-p[a+1])/(p[b+1]-p[a+1]),z=mix(p[a+2],p[b+2],t);crest.push([px,ceiling,z]);
        for(let r=row;r<allRows;r++){const o=(r*width+x)*3;p[o+1]=ceiling;p[o+2]=z;}
      }
      const ind=[];
      for(let i=0;i<data.indices.length;i+=3){const a=data.indices[i]*3,b=data.indices[i+1]*3,c=data.indices[i+2]*3;
        const ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2],ax=p[b]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2],bx=p[c]-p[a];
        if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>.000001)ind.push(data.indices[i],data.indices[i+1],data.indices[i+2]);}
      indexedBands(p,ind,data.colors);
      let prev=-Infinity;for(let r=0;r<allRows;r++){const i=r*width*3;if(p[i+1]>prev+.0001){rows.push([p[i],p[i+1],p[i+2]]);prev=p[i+1];}}
      const side=[],si=[],depth=34;
      // The playable front stays fixed. Behind it the ridge drops away into
      // an irregular shoulder, with one shared boundary for wall and summit.
      const sidePoint=(a,t,crestWeight)=>{
        const [x,y,z]=a,fade=smooth(t/.15),fault=(noise(y*.18,t*9)-.5)*.34+(noise(y*.62,t*20)-.5)*.08;
        const edge=mix(Math.exp(-t*14),1,smooth((y-top-1.5)/1.1)),backProfile=.65+(noise(y*.065,t*7)-.5)*.85;
        const relief=(1-Math.abs(noise(y*.14+t*.3,t*13)*2-1))*.76;
        const shoulder=(-t*5.2+Math.sin(t*7+x*.62)*.65*fade)*crestWeight;
        return [x-t*1.45-fault*fade-relief*fade,y+Math.sin(t*18+y*.04)*.045*fade+shoulder,mix(backProfile,z,edge)-t*17];
      };
      for(let r=0;r<rows.length;r++)for(let c=0;c<=depth;c++){
        const weight=smooth((rows[r][1]-(top-5))/(crest[0][1]-(top-5)));
        side.push(...sidePoint(rows[r],c/depth,weight));
        if(r&&c){const a=(r-1)*(depth+1)+c-1,b=a+depth+1;si.push(a,b,a+1,a+1,b,b+1);}}
      indexedBands(side,si,null);
      const cap=[],ci=[];
      for(let c=0;c<=depth;c++)for(let x=0;x<crest.length;x++){
        cap.push(...sidePoint(crest[x],c/depth,1));
        if(c&&x){const i=(c-1)*width+x-1,b=i+width;ci.push(i,i+1,b,i+1,b+1,b);}}
      indexedBands(cap,ci,null);
      // Sparse natural wear on the lip, not bright circles floating over the rock.
      const marks=[],markNormals=[];
      FX.HOLDS.forEach((h,i)=>{
        for(let j=0;j<5;j++){
          const x=(hash(i*13+j)-.5)*.29,z=h.z+.026+(hash(i*37+j)-.5)*.025,y=h.y+.012;
          const w=.018+hash(i*5+j)*.014;marks.push(x-w,y,z,x+w,y+.005,z-.008);}
        const g=add(new THREE.SphereGeometry(.023,7,5),mat(new THREE.MeshBasicMaterial({color:0xe9c995,transparent:true,opacity:0,depthWrite:false})));g.position.set(-.11,h.y+.025,h.z+.03);holdLights.push(g);
      });
      const mg=geo(new THREE.BufferGeometry());mg.setAttribute('position',new THREE.Float32BufferAttribute(marks,3));const chalk=new THREE.LineSegments(mg,mat(new THREE.LineBasicMaterial({color:0xb3b7a8,transparent:true,opacity:.45})));root.add(chalk);
    }
    makeCliff();

    const hemi=new THREE.HemisphereLight(0x8fa5b1,0x27231e,.36);root.add(hemi);
    const moon=new THREE.DirectionalLight(0xc8dce8,2.15);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);Object.assign(moon.shadow.camera,{near:1,far:64,left:-11,right:11,top:13,bottom:-13});moon.shadow.bias=-.0008;moon.shadow.normalBias=.075;moon.shadow.radius=2;root.add(moon,moon.target);
    const rim=new THREE.DirectionalLight(0xe5c59c,.72);root.add(rim,rim.target);
    const fill=new THREE.DirectionalLight(0x9ab0bb,.17);root.add(fill,fill.target);
    scene.fog=new THREE.FogExp2(0x1c3547,.006);
    // A tiny, generated sky reflection gives metal and wet cloth a real environment.
    const envPixels=new Uint8Array(128*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<128;x++){
      const altitude=Math.cos((y+.5)/64*Math.PI),horizon=Math.exp(-Math.abs(altitude)*5);
      const o=(y*128+x)*4,sky=altitude>0?1:.28;
      envPixels[o]=(0.055*sky+horizon*.08)*255;envPixels[o+1]=(0.078*sky+horizon*.10)*255;envPixels[o+2]=(0.105*sky+horizon*.12)*255;envPixels[o+3]=255;
      const key=Math.exp(-Math.pow((x-59)/8,2)-Math.pow((y-20)/7,2));
      envPixels[o]+=key*105;envPixels[o+1]+=key*115;envPixels[o+2]+=key*120;
    }
    const canRenderHalf=renderer.capabilities.isWebGL2?renderer.extensions.has('EXT_color_buffer_float'):(renderer.extensions.has('OES_texture_half_float')&&renderer.extensions.has('OES_texture_half_float_linear')&&renderer.extensions.has('EXT_color_buffer_half_float'));
    let envTarget=null,stats,disposed=false;
    function rebuildEnvironment(){
      if(disposed)return;
      const previous=envTarget;envTarget=null;
      if(previous&&scene.environment===previous.texture)scene.environment=null;
      if(canRenderHalf){
        const source=new THREE.DataTexture(envPixels,128,64,THREE.RGBAFormat);source.needsUpdate=true;source.mapping=THREE.EquirectangularReflectionMapping;
        const pmrem=new THREE.PMREMGenerator(renderer);
        try{envTarget=pmrem.fromEquirectangular(source);scene.environment=envTarget.texture;}
        finally{pmrem.dispose();source.dispose();}
      }
      if(previous)previous.dispose();
      if(stats){stats.textureCount=envTarget?4:3;stats.environmentTextureBytes=envTarget?envTarget.width*envTarget.height*8:0;}
    }
    rebuildEnvironment();

    const skyU={uDetail:{value:atmosphereTexture},uTime:{value:0},uStorm:{value:0},uAlt:{value:0},uFlash:{value:0}};
    const skyMat=mat(new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:'varying vec3 vD;void main(){vD=(modelMatrix*vec4(position,1.)).xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*vec4(vD+cameraPosition,1.);}',fragmentShader:`
      varying vec3 vD;uniform sampler2D uDetail;uniform float uTime,uStorm,uAlt,uFlash;
      float h(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      void main(){vec3 d=normalize(vD);float v=smoothstep(-.1,.7,d.y);
        vec3 horizon=mix(vec3(.05,.085,.112),vec3(.038,.062,.092),uAlt),zenith=vec3(.008,.018,.038);vec3 c=mix(horizon,zenith,v);
        vec3 md=normalize(vec3(1.,.23,-.10));float m=dot(d,md);float halo=pow(max(0.,m),60.);c+=vec3(.17,.22,.25)*halo*.16;
        float disc=smoothstep(.99993,.99995,m);float maria=texture2D(uDetail,mat2(.8,.6,-.6,.8)*(d.zy-md.zy)*24.+vec2(.37,.59)).r;c+=vec3(.64,.73,.78)*disc*(.64+maria*.36);
        float stars=pow(h(floor(d.xz/(d.y+.8)*1300.)),360.);c+=stars*.13*smoothstep(.12,.55,d.y)*(1.-uStorm);
        vec2 uv=d.xz/(abs(d.y)+.32)*.21+vec2(uTime*.00065,uTime*.00019);
        float clouds=texture2D(uDetail,uv).r*.65+texture2D(uDetail,uv*2.1+.2).r*.35;
        clouds=smoothstep(.37,.69,clouds)*smoothstep(-.13,.2,d.y);
        c=mix(c,vec3(.032,.055,.075)+halo*.035,clouds*(.38+uStorm*.45));c+=vec3(.13,.19,.24)*uFlash;
        gl_FragColor=vec4(c,1.);}` }));
    const sky=add(new THREE.SphereGeometry(500,20,10),skyMat);sky.frustumCulled=false;

    function terrainHeight(z,x,seed){
      const warpedZ=z+(noise(x*.07+seed*13,z*.014)-.5)*17,warpedX=x+(noise(z*.04,x*.03+seed*2)-.5)*7;
      let mountain=0;
      for(let i=0;i<8;i++){
        const cz=-210+i*61+(hash(i,seed*9)-.5)*28,cx=22+hash(i*3,seed*7)*26,wz=26+hash(i*5,seed*31)*27,wx=22+hash(i*11,seed)*12;
        const dz=(warpedZ-cz)/wz,dx=(warpedX-cx)/wx,distance=Math.hypot(dz,dx),height=34+hash(i*7,seed*17)*37;
        const angle=Math.atan2(dz,dx),branches=3+i%2,spine=Math.pow(.5+.5*Math.cos(angle*branches+hash(i,seed)*6.28+distance*.6),2);
        const ridge=1-.29*smooth(distance/.18)*(1-spine);
        mountain=Math.max(mountain,height*Math.pow(Math.max(0,1-distance),1.02+hash(i,seed+2)*.3)*ridge);
      }
      const ridge=1-Math.abs(2*noise(z*.055+x*.018,x*.085+seed*13)-1);
      const gullies=Math.pow(1-ridge,2);
      return mountain*(1.-gullies*.15)+(fbm(z*.13+seed*21,x*.17,3)-.35)*Math.min(3,mountain*.08);
    }
    const mountainRoot=new THREE.Group();root.add(mountainRoot);
    const rangeMat=mat(new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,vertexColors:true,side:THREE.DoubleSide}));
    rangeMat.onBeforeCompile=shader=>{
      shader.uniforms.uRock={value:atmosphereTexture};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRange;varying vec3 vRangeN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRange=position;vRangeN=normal;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uRock;varying vec3 vRange;varying vec3 vRangeN;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec4 erosion=texture2D(uRock,vRange.zy*vec2(.035,.028)+vRange.x*.002);
          diffuseColor.rgb*=.7+erosion.r*.5;
          float snow=smoothstep(29.,48.,vRange.y+erosion.r*8.)*smoothstep(.18,.58,vRangeN.y);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.45,.51,.54),snow*.9);
        `);
    };
    const rangeLow=mat(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}));rangeLow.onBeforeCompile=rangeMat.onBeforeCompile;
    for(let layer=0;layer<4;layer++){
      const nx=36,nz=260,pos=[],colors=[],ix=[];
      for(let x=0;x<=nx;x++)for(let z=0;z<=nz;z++){
        const px=x/nx*70,pz=(z/nz-.5)*370,py=terrainHeight(pz,px,layer+1);
        pos.push(px,py,pz);const variation=.81+noise(pz*.13,px*.13)*.19;
        const base=new THREE.Color().setRGB(.095+layer*.012,.12+layer*.015,.13+layer*.019);colors.push(base.r*variation,base.g*variation,base.b*variation);
        if(x<nx&&z<nz){const a=x*(nz+1)+z;ix.push(a,a+1,a+nz+1,a+1,a+nz+2,a+nz+1);}}
      // Extend the finite terrain perimeter below the camera's entire view.
      // Shared top vertices keep the foot continuous; the original peaks stay
      // untouched and the skirt remains in this mesh/material/draw call.
      const perimeter=[];
      for(let z=0;z<=nz;z++)perimeter.push(z);
      for(let x=1;x<=nx;x++)perimeter.push(x*(nz+1)+nz);
      for(let z=nz-1;z>=0;z--)perimeter.push(nx*(nz+1)+z);
      for(let x=nx-1;x>0;x--)perimeter.push(x*(nz+1));
      const skirtStart=pos.length/3;
      for(const index of perimeter){const o=index*3;pos.push(pos[o],-220,pos[o+2]);colors.push(colors[o],colors[o+1],colors[o+2]);}
      for(let i=0;i<perimeter.length;i++){const next=(i+1)%perimeter.length,a=perimeter[i],b=skirtStart+i,c=perimeter[next],d=skirtStart+next;ix.push(a,b,c,c,b,d);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();
      const m=add(g,rangeMat,mountainRoot);m.position.set(36+layer*49,-44-layer*5,30+layer*24);m.rotation.y=-.14-layer*.12;ranges.push(m);
    }
    const mistMat=mat(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uMap:{value:atmosphereTexture},uTime:{value:0},uStorm:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D uMap;uniform float uTime,uStorm;varying vec2 vUv;
      void main(){vec2 uv=vec2(vUv.x*.75+uTime*.00055,vUv.y*.23);float n=texture2D(uMap,uv).r;float band=pow(max(0.,sin(vUv.y*3.14159)),2.);float alpha=band*(.012+n*.045+uStorm*.023);gl_FragColor=vec4(.10,.155,.185,alpha);}` }));
    for(let i=0;i<3;i++){const m=add(new THREE.PlaneGeometry(360,23+i*9),mistMat);m.rotation.y=-Math.PI/2;m.position.set(25+i*47,-12-i*5,50);m.userData.offset=-12-i*5;mistLayers.push(m);}

    const h=FX.HOLDS[FX.HOLDS.length-1],gate=new THREE.Group();gate.position.set(.10,h.y+.035,h.z-.12);root.add(gate);
    const gateStone=mat(new THREE.MeshStandardMaterial({color:0x424844,roughness:.94})),gateEdge=mat(new THREE.MeshStandardMaterial({color:0x605c4c,roughness:.82}));
    const gateDoor=mat(new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.65,.76),side:THREE.DoubleSide}));
    const doorway=add(new THREE.PlaneGeometry(.73,2.04),gateDoor,gate);doorway.rotation.y=Math.PI/2;doorway.position.set(.055,1.04,0);
    for(let side of [-1,1])for(let j=0;j<5;j++){
      const stone=add(new THREE.BoxGeometry(.26,.43,.18),gateStone,gate);stone.position.set(0,.22+j*.43,side*.46);stone.rotation.x=(hash(j+side*8)-.5)*.06;stone.castShadow=stone.receiveShadow=true;
      const worn=add(new THREE.BoxGeometry(.045,.41,.025),gateEdge,gate);worn.position.set(-.144,.22+j*.43,side*.37);
    }
    const lintel=add(new THREE.BoxGeometry(.29,.20,1.12),gateStone,gate);lintel.position.y=2.2;lintel.castShadow=true;
    const threshold=add(new THREE.BoxGeometry(.75,.10,1.12),gateStone,gate);threshold.position.set(-.2,.04,0);threshold.receiveShadow=true;
    const warm=new THREE.PointLight(0xffbe72,2.1,7,2);warm.position.set(-.55,h.y+1.12,h.z+.16);root.add(warm);

    function setQuality(next){q=clamp(Math.round(next),0,2);uniforms.uQuality.value=q;moon.castShadow=q>0;renderer.shadowMap.enabled=q>0;
      const size=q===2?1024:512;if(moon.shadow.mapSize.x!==size){moon.shadow.mapSize.set(size,size);if(moon.shadow.map){moon.shadow.map.dispose();moon.shadow.map=null;}}
      cliffBands.forEach(m=>m.material=q===0?rockLow:rock);ranges.forEach((m,i)=>{m.visible=q>0||i===0||i===2;m.material=q===0?rangeLow:rangeMat;});mistLayers.forEach((m,i)=>m.visible=q>0||i===1);
    }
    function update(o){
      const {state,camY,focusZ}=o,alt=o.alt||0,gale=o.gale||0,flash=o.flash||0;
      uniforms.uWet.value=o.wet||0;uniforms.uFlash.value=flash;
      sky.position.set(0,camY,focusZ);skyU.uTime.value=state.time;skyU.uStorm.value=gale;skyU.uAlt.value=alt;skyU.uFlash.value=flash;
      mountainRoot.position.set(0,camY-alt*19,focusZ*.12);
      mistMat.uniforms.uTime.value=state.time;mistMat.uniforms.uStorm.value=gale;mistLayers.forEach((m,i)=>{m.position.y=camY+m.userData.offset-alt*10+Math.sin(state.time*.035+i)*1.2;m.position.z=focusZ*.15+50;});
      scene.fog.color.setRGB(.035+flash*.06,.064+flash*.08,.086+flash*.10);scene.fog.density=.0035+gale*.0012;
      moon.position.set(-13,camY+17,focusZ+11);moon.target.position.set(0,camY,focusZ-1);moon.intensity=1.8+flash*2.6;
      rim.position.set(7,camY+9,focusZ+8);rim.target.position.set(0,camY,focusZ);rim.intensity=.65+flash*.5;
      fill.position.set(-12,camY+3,focusZ-3);fill.target.position.set(0,camY,focusZ);
      cliffBands.forEach(m=>m.visible=Math.abs(m.userData.bandY-camY)<42||m.userData.bandY>top);
      holdLights.forEach((m,i)=>{m.material.opacity=state.armed&&i===state.holdIndex+(state.descending?-1:1)?.6:0;});
      warm.intensity=2.1+Math.sin(state.time*.8)*.09;
    }
    function dispose(){disposed=true;if(envTarget){if(scene.environment===envTarget.texture)scene.environment=null;envTarget.dispose();}root.traverse(o=>{if(o.isLight&&o.shadow&&o.shadow.map)o.shadow.map.dispose();});for(const g of resources.geometries)g.dispose();for(const m of resources.materials)m.dispose();for(const t of resources.textures)t.dispose();scene.remove(root);}
    stats={proceduralTextureBytes:(512*512*4*2+256*256*4)*4/3,textureCount:envTarget?4:3,environmentTextureBytes:envTarget?envTarget.width*envTarget.height*8:0,geometries:resources.geometries.size,materials:resources.materials.size,vertices:0,triangles:0,lineSegments:0};
    for(const g of resources.geometries)if(g.attributes.position)stats.vertices+=g.attributes.position.count;
    root.traverse(o=>{if(!o.geometry)return;const g=o.geometry,count=g.index?g.index.count:g.attributes.position?g.attributes.position.count:0;if(o.isMesh)stats.triangles+=count/3;else if(o.isLineSegments)stats.lineSegments+=count/2;});
    setQuality(q);
    return {update,setQuality,restoreContext:rebuildEnvironment,dispose,stats};
  }
  window.FXWorld={create};
})();
