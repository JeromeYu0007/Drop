/* Alpine environment: measured play surfaces, photographic CC0 rock / sky,
 * an original alpine panorama and weather. See assets/CREDITS.txt. */
(function () {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const hash=(x,y=0)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  function noise(x,y,period=0){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const h=(a,b)=>hash(period?((a%period)+period)%period:a,period?((b%period)+period)%period:b);return mix(mix(h(ix,iy),h(ix+1,iy),u),mix(h(ix,iy+1),h(ix+1,iy+1),u),v);}

  function create({THREE,FX,scene,renderer,quality=2}) {
    let q=quality;
    const top=FX.HOLDS[FX.HOLDS.length-1].y, root=new THREE.Group();root.name='alpine mountain world';scene.add(root);
    const resources={geometries:new Set(),materials:new Set(),textures:new Set()}, cliffBands=[],mistLayers=[],holdLights=[];
    const geo=g=>{resources.geometries.add(g);return g;}, mat=m=>{resources.materials.add(m);return m;};
    const add=(geometry,material,parent=root)=>{const m=new THREE.Mesh(geo(geometry),material);parent.add(m);return m;};
    const uniforms={uRock:{value:null},uRockAlbedo:{value:null},uRockNormal:{value:null},uRockRoughness:{value:null},uPhoto:{value:0},uWet:{value:0},uTop:{value:top},uQuality:{value:q},uFlash:{value:0}};

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
    // Keep deterministic fallbacks while local images stream; the play surface
    // and all collision vertices are independent of material loading.
    uniforms.uRockAlbedo.value=uniforms.uRock.value;uniforms.uRockRoughness.value=uniforms.uRock.value;
    let envTarget=null,stats,disposed=false,skySource=null,envSource=null,envReady=false;
    const loader=new THREE.TextureLoader();
    const trackTexture=(texture,srgb=false,repeat=true)=>{texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resources.textures.add(texture);return texture;};
    const imageLoaded=()=>{if(stats){stats.textureCount=resources.textures.size+(envTarget?1:0);stats.imageTextureBytes=0;for(const texture of resources.textures){const image=texture.image;if(image&&!image.data&&image.width&&image.height)stats.imageTextureBytes+=image.width*image.height*4*(texture.generateMipmaps?4/3:1);}}};
    trackTexture(loader.load('assets/rock-albedo.webp',texture=>{if(disposed){texture.dispose();return;}uniforms.uRockAlbedo.value=texture;uniforms.uPhoto.value=1;imageLoaded();}),true);
    trackTexture(loader.load('assets/rock-normal.webp',texture=>{if(disposed){texture.dispose();return;}uniforms.uRockNormal.value=texture;imageLoaded();}));
    trackTexture(loader.load('assets/rock-roughness.webp',texture=>{if(disposed){texture.dispose();return;}uniforms.uRockRoughness.value=texture;imageLoaded();}));
    const rock=mat(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.018,vertexColors:true,side:THREE.DoubleSide,envMapIntensity:.5}));
    rock.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockWorld;varying vec3 vRockN;')
        .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvRockN=normalize(mat3(modelMatrix)*objectNormal);')
        .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRockWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vRockWorld;varying vec3 vRockN;
        uniform sampler2D uRock,uRockAlbedo,uRockNormal,uRockRoughness;uniform float uPhoto,uWet,uTop,uQuality,uFlash;
        vec3 rBlend;vec3 rPosition;float wetness;float rockSnow;float stoneRoughness;
        vec4 rockSample(sampler2D tex,vec3 p,vec3 w){if(uQuality<.5){if(w.x>w.y&&w.x>w.z)return texture2D(tex,p.zy);if(w.y>w.z)return texture2D(tex,p.xz);return texture2D(tex,p.xy);}return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
      `).replace('#include <color_fragment>',`#include <color_fragment>
        vec3 wn=normalize(vRockN);rBlend=pow(abs(wn),vec3(5.));rBlend/=max(.001,dot(rBlend,vec3(1.)));
        // A tile is 2.6 metres: hairline fractures stay small enough to read as
        // stone grain beside a hand, rather than a painted repeating cliff.
        rPosition=vRockWorld*.38;rPosition.y+=vRockWorld.z*.031;
        vec4 macro=rockSample(uRock,vRockWorld*.033+vec3(.27,.41,.18),rBlend);
        vec3 stone=rockSample(uRockAlbedo,rPosition,rBlend).rgb;
        float luminance=dot(stone,vec3(.2126,.7152,.0722));stone=mix(stone,vec3(luminance),.39)*vec3(.85,.92,.98);
        vec3 fallback=mix(vec3(.11,.125,.13),vec3(.22,.23,.23),macro.r);
        vec3 slate=mix(fallback,stone,uPhoto);
        // Broad veins and seepage are independent of the photographic tile.
        slate*=.78+macro.a*.4;
        float runoff=texture2D(uRock,vRockWorld.zy*vec2(.16,.014)+vec2(.19,.31)).a;
        wetness=uWet*smoothstep(.29,.68,runoff)*.92;
        slate*=1.-wetness*.38;
        rockSnow=smoothstep(uTop*.44,uTop*.89,vRockWorld.y)*smoothstep(.10,.62,wn.y)*smoothstep(.15,.53,macro.r);
        slate=mix(slate,vec3(.57,.64,.68),rockSnow*.96);
        stoneRoughness=rockSample(uRockRoughness,rPosition,rBlend).r;
        diffuseColor.rgb*=slate*(1.+uFlash*.1);
      `).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
        vec3 nx=vec3(0.),ny=vec3(0.),nz=vec3(0.);
        if(uQuality<.5){if(rBlend.x>rBlend.y&&rBlend.x>rBlend.z)nx=texture2D(uRockNormal,rPosition.zy).xyz*2.-1.;else if(rBlend.y>rBlend.z)ny=texture2D(uRockNormal,rPosition.xz).xyz*2.-1.;else nz=texture2D(uRockNormal,rPosition.xy).xyz*2.-1.;}
        else{nx=texture2D(uRockNormal,rPosition.zy).xyz*2.-1.;ny=texture2D(uRockNormal,rPosition.xz).xyz*2.-1.;nz=texture2D(uRockNormal,rPosition.xy).xyz*2.-1.;}
        vec3 detail=vec3(0.,nx.y,nx.x)*rBlend.x+vec3(ny.x,0.,ny.y)*rBlend.y+vec3(nz.x,nz.y,0.)*rBlend.z;
        normal=normalize(normal+mat3(viewMatrix)*detail*(.48-rockSnow*.36));
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(mix(.88,stoneRoughness,uPhoto)-wetness*.42+rockSnow*.14,.24,.98);');
    };
    rock.customProgramCacheKey=()=> 'drop-photo-geology-v6';
    const rockLow=mat(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}));rockLow.onBeforeCompile=rock.onBeforeCompile;rockLow.customProgramCacheKey=()=> 'drop-photo-geology-low-v6';

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
      const side=[],si=[],depth=48;
      // The playable front stays fixed. Behind it the ridge drops away into
      // an irregular shoulder, with one shared boundary for wall and summit.
      const sidePoint=(a,t,crestWeight)=>{
        const [x,y,z]=a,fade=smooth(t/.15),fault=(noise(y*.18,t*9)-.5)*.34+(noise(y*.62,t*20)-.5)*.08;
        const edge=mix(Math.exp(-t*14),1,smooth((y-top-1.5)/1.1)),backProfile=.65+(noise(y*.065,t*7)-.5)*.85;
        const relief=(1-Math.abs(noise(y*.14+t*.3,t*13)*2-1))*.76+(noise(y*.38+t*2,t*29)-.5)*.19;
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

    const hemi=new THREE.HemisphereLight(0x9eafbf,0x292821,.40);root.add(hemi);
    const moon=new THREE.DirectionalLight(0xc8dce8,2.15);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{near:1,far:64,left:-11,right:11,top:13,bottom:-13});moon.shadow.bias=-.0008;moon.shadow.normalBias=.035;moon.shadow.radius=2;root.add(moon,moon.target);
    const rim=new THREE.DirectionalLight(0xe5c59c,.72);root.add(rim,rim.target);
    const fill=new THREE.DirectionalLight(0x9ab0bb,.17);root.add(fill,fill.target);
    scene.fog=new THREE.FogExp2(0x1c3547,.006);
    // The photograph supplies broad cloud highlights in wet stone, metal and
    // cloth. A tiny deterministic reflection works while it is loading.
    const envPixels=new Uint8Array(128*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<128;x++){
      const altitude=Math.cos((y+.5)/64*Math.PI),horizon=Math.exp(-Math.abs(altitude)*5);
      const o=(y*128+x)*4,sky=altitude>0?1:.28;
      envPixels[o]=(0.055*sky+horizon*.08)*255;envPixels[o+1]=(0.078*sky+horizon*.10)*255;envPixels[o+2]=(0.105*sky+horizon*.12)*255;envPixels[o+3]=255;
      const key=Math.exp(-Math.pow((x-59)/8,2)-Math.pow((y-20)/7,2));
      envPixels[o]+=key*105;envPixels[o+1]+=key*115;envPixels[o+2]+=key*120;
    }
    const canRenderHalf=renderer.capabilities.isWebGL2?renderer.extensions.has('EXT_color_buffer_float'):(renderer.extensions.has('OES_texture_half_float')&&renderer.extensions.has('OES_texture_half_float_linear')&&renderer.extensions.has('EXT_color_buffer_half_float'));
    function rebuildEnvironment(){
      if(disposed)return;
      const previous=envTarget;envTarget=null;
      if(previous&&scene.environment===previous.texture)scene.environment=null;
      if(canRenderHalf){
        const source=envReady?envSource:new THREE.DataTexture(envPixels,128,64,THREE.RGBAFormat);source.needsUpdate=true;source.mapping=THREE.EquirectangularReflectionMapping;
        const pmrem=new THREE.PMREMGenerator(renderer);
        try{envTarget=pmrem.fromEquirectangular(source);scene.environment=envTarget.texture;}
        finally{pmrem.dispose();if(source!==envSource)source.dispose();}
      }
      if(previous)previous.dispose();
      if(stats){stats.textureCount=resources.textures.size+(envTarget?1:0);stats.environmentTextureBytes=envTarget?envTarget.width*envTarget.height*8:0;}
    }
    rebuildEnvironment();

    const skyU={uDetail:{value:atmosphereTexture},uSky:{value:atmosphereTexture},uAlpine:{value:atmosphereTexture},uAlpinePhoto:{value:0},uPhoto:{value:0},uTime:{value:0},uStorm:{value:0},uAlt:{value:0},uFlash:{value:0}};
    const skyMat=mat(new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:'varying vec3 vD;void main(){vD=(modelMatrix*vec4(position,1.)).xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*vec4(vD+cameraPosition,1.);}',fragmentShader:`
      varying vec3 vD;uniform sampler2D uDetail,uSky,uAlpine;uniform float uPhoto,uAlpinePhoto,uTime,uStorm,uAlt,uFlash;
      void main(){vec3 d=normalize(vD);float altitude=smoothstep(-.12,.75,d.y);
        vec3 clear=mix(vec3(.18,.24,.29),vec3(.028,.072,.13),altitude);
        vec2 sphere=vec2(atan(d.z,d.x)*.15915494+.68,asin(clamp(d.y,-1.,1.))*.31830989+.5);
        vec3 photograph=texture2D(uSky,sphere).rgb;
        photograph=mix(photograph,vec3(dot(photograph,vec3(.2126,.7152,.0722))),.16)*vec3(.58,.69,.79);
        vec3 c=mix(clear,photograph,uPhoto*(.56+uStorm*.42));
        // A finite, original 3:1 matte uses a perspective projection with the
        // same 3:1 UV ratio. It is not stretched into an equirectangular sky.
        vec3 forward=normalize(vec3(1.,0.,-.2)),right=normalize(vec3(.2,0.,1.));
        float depth=max(.15,dot(d,forward));
        vec2 plateUV=vec2(dot(d,right)/depth*.45+.61,d.y/depth*1.35+.566+uAlt*.025);
        vec3 alpine=texture2D(uAlpine,clamp(plateUV,vec2(0.),vec2(1.))).rgb*vec3(.70,.77,.84);
        float border=smoothstep(0.,.025,plateUV.x)*(1.-smoothstep(.975,1.,plateUV.x));
        border*=1.-smoothstep(.96,1.02,plateUV.y);
        float valleyVeil=(1.-smoothstep(.03,.19,plateUV.y))*.16+uStorm*.58;
        alpine=mix(alpine,vec3(.12,.16,.195),valleyVeil);
        c=mix(c,alpine,uAlpinePhoto*border);
        // A low, moving cloud deck has a separate horizon from the high sky.
        vec2 uv=d.xz/(abs(d.y)+.24)*.23+vec2(uTime*(.0005+uStorm*.0012),uTime*.00012);
        float clouds=texture2D(uDetail,uv).r*.68+texture2D(uDetail,uv*2.3+.17).r*.32;
        float cloudMask=smoothstep(.52-uStorm*.19,.70-uStorm*.12,clouds)*smoothstep(-.15,.18,d.y);
        vec3 stormCloud=mix(vec3(.055,.075,.095),vec3(.095,.12,.145),clouds);
        c=mix(c,stormCloud,cloudMask*(.1+uStorm*.84));
        float horizon=exp(-abs(d.y+.025)*10.);c=mix(c,vec3(.14,.18,.21),horizon*uStorm*.46);
        c*=1.-uStorm*.31;c+=vec3(.18,.23,.28)*uFlash;
        gl_FragColor=vec4(c,1.);}` }));
    const sky=add(new THREE.SphereGeometry(500,28,16),skyMat);sky.frustumCulled=false;
    skySource=trackTexture(loader.load('assets/sky-clouds.webp',texture=>{
      if(disposed){texture.dispose();return;}skyU.uSky.value=texture;skyU.uPhoto.value=1;imageLoaded();
    }),true,false);skySource.wrapS=THREE.RepeatWrapping;
    trackTexture(loader.load('assets/alpine-panorama.webp',texture=>{
      if(disposed){texture.dispose();return;}skyU.uAlpine.value=texture;skyU.uAlpinePhoto.value=1;imageLoaded();
    }),true,false);
    envSource=trackTexture(loader.load('assets/sky-environment.webp',texture=>{
      if(disposed){texture.dispose();return;}envReady=true;rebuildEnvironment();imageLoaded();
    }),true,false);

    // The alpine matte supplies all distant landforms. Nearby procedural
    // shoulders flatten its valleys, so depth here comes from moving cloud
    // layers rather than additional silhouette geometry.
    const mistMat=mat(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uMap:{value:atmosphereTexture},uTime:{value:0},uStorm:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D uMap;uniform float uTime,uStorm;varying vec2 vUv;
      void main(){vec2 uv=vec2(vUv.x*1.5+uTime*(.0007+uStorm*.0014),vUv.y*.45);float n=texture2D(uMap,uv).r;float wisps=texture2D(uMap,uv*3.1+vec2(uTime*.0002,0.)).r;float band=pow(max(0.,sin(vUv.y*3.14159)),2.);float cloud=smoothstep(.28,.64,n*.72+wisps*.28);float alpha=band*cloud*(.065+uStorm*.20);vec3 c=mix(vec3(.145,.185,.215),vec3(.10,.14,.18),uStorm);gl_FragColor=vec4(c,alpha);}` }));
    for(let i=0;i<4;i++){const m=add(new THREE.PlaneGeometry(460,15+i*4),mistMat);m.rotation.y=-Math.PI/2;m.position.set(30+i*49,-36+i*3,50);m.userData.offset=-36+i*3;mistLayers.push(m);}

    const h=FX.HOLDS[FX.HOLDS.length-1],gate=new THREE.Group();gate.position.set(.10,h.y+.035,h.z-.12);root.add(gate);
    const gateStone=mat(rock.clone());gateStone.vertexColors=false;gateStone.onBeforeCompile=rock.onBeforeCompile;gateStone.customProgramCacheKey=()=> 'drop-photo-gateway-v6';
    const gateEdge=mat(new THREE.MeshStandardMaterial({color:0x5b6059,roughness:.84}));
    const dressedStone=(w,h,d)=>{
      const cut=.018,shape=new THREE.Shape();shape.moveTo(-w/2+cut,-h/2);shape.lineTo(w/2-cut,-h/2);shape.lineTo(w/2,-h/2+cut);shape.lineTo(w/2,h/2-cut);shape.lineTo(w/2-cut,h/2);shape.lineTo(-w/2+cut,h/2);shape.lineTo(-w/2,h/2-cut);shape.lineTo(-w/2,-h/2+cut);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-.026,steps:1,bevelEnabled:true,bevelThickness:.013,bevelSize:.008,bevelSegments:1,curveSegments:1});geometry.translate(0,0,-d/2+.013);return geometry;
    };
    const gateDoor=mat(new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.65,.76),side:THREE.DoubleSide}));
    const doorway=add(new THREE.PlaneGeometry(.73,2.04),gateDoor,gate);doorway.rotation.y=Math.PI/2;doorway.position.set(.055,1.04,0);
    for(let side of [-1,1])for(let j=0;j<5;j++){
      const stone=add(dressedStone(.26,.43,.18),gateStone,gate);stone.position.set(0,.22+j*.43,side*.46);stone.rotation.x=(hash(j+side*8)-.5)*.06;stone.castShadow=stone.receiveShadow=true;
      const worn=add(new THREE.BoxGeometry(.045,.41,.025),gateEdge,gate);worn.position.set(-.144,.22+j*.43,side*.37);
    }
    const lintel=add(dressedStone(.29,.20,1.12),gateStone,gate);lintel.position.y=2.2;lintel.castShadow=true;
    const threshold=add(new THREE.BoxGeometry(.75,.10,1.12),gateStone,gate);threshold.position.set(-.2,.04,0);threshold.receiveShadow=true;
    const warm=new THREE.PointLight(0xffbe72,2.1,7,2);warm.position.set(-.55,h.y+1.12,h.z+.16);root.add(warm);

    function setQuality(next){q=clamp(Math.round(next),0,2);uniforms.uQuality.value=q;moon.castShadow=q>0;renderer.shadowMap.enabled=q>0;
      const size=q===2?2048:1024;if(moon.shadow.mapSize.x!==size){moon.shadow.mapSize.set(size,size);if(moon.shadow.map){moon.shadow.map.dispose();moon.shadow.map=null;}}
      cliffBands.forEach(m=>m.material=q===0?rockLow:rock);mistLayers.forEach((m,i)=>m.visible=q>0||i===1||i===2);
    }
    function update(o){
      const {state,camY,focusZ}=o,alt=o.alt||0,gale=clamp(o.gale||0,0,1),flash=o.flash||0;
      uniforms.uWet.value=o.wet||0;uniforms.uFlash.value=flash;
      sky.position.set(0,camY,focusZ);skyU.uTime.value=state.time;skyU.uStorm.value=gale;skyU.uAlt.value=alt;skyU.uFlash.value=flash;
      mistMat.uniforms.uTime.value=state.time;mistMat.uniforms.uStorm.value=gale;mistLayers.forEach((m,i)=>{m.position.y=camY+m.userData.offset-alt*8+gale*8+Math.sin(state.time*.035+i)*1.2;m.position.z=focusZ*.15+50;});
      // Four ascent stages visibly close the sky and soften the directional key.
      // Local holds retain contrast while distant valleys disappear into spindrift.
      scene.fog.color.setRGB(.12-gale*.037+flash*.09,.16-gale*.042+flash*.11,.195-gale*.044+flash*.13);scene.fog.density=.0026+gale*.0075;
      moon.position.set(-13,camY+17,focusZ+11);moon.target.position.set(0,camY,focusZ-1);moon.intensity=2.25-gale*1.25+flash*3.2;
      moon.color.setRGB(1-gale*.24,.94-gale*.11,.86+gale*.11);
      rim.position.set(7,camY+9,focusZ+8);rim.target.position.set(0,camY,focusZ);rim.intensity=.84-gale*.57+flash*.5;
      hemi.intensity=.40+gale*.10;
      fill.position.set(-12,camY+3,focusZ-3);fill.target.position.set(0,camY,focusZ);fill.intensity=.17+gale*.16;
      cliffBands.forEach(m=>m.visible=Math.abs(m.userData.bandY-camY)<42||m.userData.bandY>top);
      holdLights.forEach((m,i)=>{m.material.opacity=state.armed&&i===state.holdIndex+(state.descending?-1:1)?.6:0;});
      warm.intensity=2.1+Math.sin(state.time*.8)*.09;
    }
    function dispose(){disposed=true;if(envTarget){if(scene.environment===envTarget.texture)scene.environment=null;envTarget.dispose();}root.traverse(o=>{if(o.isLight&&o.shadow&&o.shadow.map)o.shadow.map.dispose();});for(const g of resources.geometries)g.dispose();for(const m of resources.materials)m.dispose();for(const t of resources.textures)t.dispose();scene.remove(root);}
    stats={imageTextureBytes:0,proceduralTextureBytes:(512*512*4*2+256*256*4)*4/3,textureCount:resources.textures.size+(envTarget?1:0),environmentTextureBytes:envTarget?envTarget.width*envTarget.height*8:0,geometries:resources.geometries.size,materials:resources.materials.size,vertices:0,triangles:0,lineSegments:0};
    for(const g of resources.geometries)if(g.attributes.position)stats.vertices+=g.attributes.position.count;
    root.traverse(o=>{if(!o.geometry)return;const g=o.geometry,count=g.index?g.index.count:g.attributes.position?g.attributes.position.count:0;if(o.isMesh)stats.triangles+=count/3;else if(o.isLineSegments)stats.lineSegments+=count/2;});
    setQuality(q);
    return {update,setQuality,restoreContext:rebuildEnvironment,dispose,stats};
  }
  window.FXWorld={create};
})();
