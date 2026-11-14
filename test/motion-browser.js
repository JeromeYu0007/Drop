/* Visual inspection of a full muscle-up, release and catch. The initial hold
 * is an isolated fixture; every subsequent position comes from FX.step().
 * node test/motion-browser.js [http://127.0.0.1:8123] [--mask=0] [--hold=4]
 * Optional: --release=1.65 for a late release, --cycle to keep holding,
 * --down for descent, --quality=2 for the complete materials/post effects.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const base = process.argv.find(x => /^https?:/.test(x)) || 'http://127.0.0.1:8123';
  const out = process.env.DROP_CAPTURE_DIR || '/tmp/drop-motion';
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  const option = (name, fallback) => {const value=process.argv.find(x=>x.startsWith('--'+name+'=')); return value ? Number(value.split('=')[1]) : fallback;};
  const hold=option('hold',4), onlyMask=option('mask',null), releaseOverride=option('release',null), quality=option('quality',0), cycle=process.argv.includes('--cycle'), down=process.argv.includes('--down');
  assert.ok(Number.isInteger(hold)&&hold>=0&&hold<47,'hold must be 0–46');
  assert.ok(onlyMask===null||(Number.isInteger(onlyMask)&&onlyMask>=0&&onlyMask<=15),'mask must be 0–15');
  assert.ok(Number.isInteger(quality)&&quality>=0&&quality<=2,'quality must be 0–2');
  const results = [], errors = [];
  try {
    for (const mask of onlyMask===null?[0,15]:[onlyMask]) {
      const page = await browser.newPage({viewport:{width:600,height:600}});
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(base + '/index.html',{waitUntil:'networkidle'});
      // TextureLoader's Image objects are outside the DOM. Await the actual
      // local texture URLs and decoding, not a fixed screenshot delay.
      await page.evaluate(async()=>{
        const textures=performance.getEntriesByType('resource').filter(r=>/\/assets\/[^?]+\.(webp|png|jpe?g)(?:\?|$)/i.test(r.name)).map(r=>r.name);
        if(!textures.length)throw new Error('No local material images loaded');
        await Promise.all(textures.map(src=>new Promise((resolve,reject)=>{
          const image=new Image();image.onload=()=>image.decode().then(resolve,reject);image.onerror=()=>reject(new Error('Missing texture '+src));image.src=src;
        })));
      });
      await page.addScriptTag({path:path.join(__dirname,'pilot.js')});
      const plan = await page.evaluate(({mask,hold,down,quality}) => {
        document.querySelector('#ui').style.display = 'none';
        FXRender.setQuality(quality); FXRender.resize(600,600,1);
        window.motionState = DropPilot.fresh(mask,hold,0);
        motionState.descending=down;
        window.motionPlan = DropPilot.plan(motionState,down?-1:1);
        window.motionClock = 0; window.motionEvents = []; window.motionLast = null;
        FXRender.resetPoseHistory();
        return motionPlan;
      },{mask,hold,down,quality});
      assert.ok(plan, 'reachable motion fixture');
      if(releaseOverride!==null)plan.release=releaseOverride;
      const shots = cycle ? Array.from({length:19},(_,i)=>({time:i*.2,stage:'charge'})) : [0,.23,.47,.68,.84,1,1.04,1.13,1.28,1.65,2.15,2.8].map((x,i) => ({time:i<6 ? plan.release*x : plan.release+(x-1), stage:i<6?'charge':'flight'}));
      if(down&&!cycle)for(const delay of [2,2.2,2.5])shots.push({time:plan.release+delay,stage:'slip'});
      for(let i=0;i<shots.length;i++) {
        const meta = await page.evaluate(({target,release}) => {
          const s=motionState,F=Fangxia;
          while(motionClock + 1/120 <= target + 1e-7) {
            const holding = motionClock + 1e-7 < release;
            F.step(s,1/120,{holding,freezeIntro:true}); motionClock+=1/120;
            // Advance the production pose history at 60 Hz; render only sampled
            // frames so screenshots do not queue hundreds of GPU frames on software WebGL.
            if(Math.round(motionClock*120)%2===0) {
              const p=FXRender.updatePose(s), previous=motionLast;
              if(p&&previous&&s.attached!==previous.attached) {
                const movements={};
                for(const key of ['hip','head','handL','handR','footL','footR']) {
                  const a=p[key],b=previous.pose[key];movements[key]=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
                }
                motionEvents.push({time:motionClock,type:s.attached?'catch':'release',hold:s.holdIndex,movements});
              }
              motionLast={attached:s.attached,pose:p};
            }
          }
          FXRender.draw({state:s,dt:0,camY:F.HOLDS[s.holdIndex].y,focusZ:s.z,side:true,alt:.1});
          return {time:motionClock,holdT:s.holdT,attached:s.attached,hold:s.holdIndex,launches:s.launches,pose:FXRender.pose||null};
        },{target:shots[i].time,release:cycle?1000:plan.release});
        const file=`${mask===0?'empty':'full'}-${String(i).padStart(2,'0')}.png`;
        await page.screenshot({path:path.join(out,file)});
        results.push({mask,file,...meta});
        console.log(file, JSON.stringify({time:meta.time,hold:meta.hold,attached:meta.attached,launches:meta.launches}));
      }
      const transitions=await page.evaluate(()=>motionEvents);
      console.log(mask===0?'empty transitions':'full transitions',JSON.stringify(transitions));
      fs.writeFileSync(path.join(out,`transitions-${mask}.json`),JSON.stringify(transitions,null,2));
      await page.close();
    }
    assert.deepEqual(errors,[],'browser errors');
    fs.writeFileSync(path.join(out,'poses.json'),JSON.stringify(results,null,2));
    const cards=results.map(r=>`<figure><img src="${r.file}"><figcaption>${r.mask===0?'空包':'满包'} · ${r.time.toFixed(2)}s · ${r.attached?'抓点 '+r.hold:'腾空'}</figcaption></figure>`).join('');
    fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>Drop · 动作检查</title><style>body{margin:16px;background:#131b20;color:#dee2df;font:16px system-ui}main{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}figure{margin:0}img{width:100%}figcaption{padding:8px}</style><main>${cards}</main>`);
    console.log('PASS motion capture',out);
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
