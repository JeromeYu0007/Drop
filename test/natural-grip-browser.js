/* Regression for ordinary one-gesture play: fixed press lengths and genuine
 * keyboard/touch events, no trajectory oracle and no state injection. */
"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = process.argv.find(x => /^https?:/.test(x)) || "http://127.0.0.1:8123";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: touch ? { width:390,height:844 } : { width:640,height:480 }, hasTouch:touch, isMobile:touch });
      const page = await context.newPage(), errors = [], client = await context.newCDPSession(page);
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(base, { waitUntil:"networkidle" });
      await page.evaluate(() => {
        // Only throttle expensive software-GPU drawing. Input, DOM and the
        // production physics loop run normally; visual tests render all frames.
        quality=0; FXRender.setQuality(0); resize();
        const draw=FXRender.draw; let last=-Infinity;
        FXRender.draw=o=>{ const now=performance.now(); if(now-last>1000){last=now;draw(o);} };
      });
      const press = () => touch ? client.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:290,y:400}]}) : page.keyboard.down("Space");
      const release = () => touch ? client.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]}) : page.keyboard.up("Space");
      const read = () => page.evaluate(() => {const s=__fx.state;return {index:s.holdIndex,attached:s.attached,mode:s.mode,launches:s.launches,catches:s.catches,falls:s.falls,holding:s.holding,grabT:s.grabT};});
      const ready = () => page.waitForFunction(() => {const s=__fx.state;return s.mode==="play"&&s.attached&&!s.needUp&&!s.lock&&s.settle>.9&&s.holdT===0;});
      async function move(direction, duration) {
        await ready(); const before=await read();
        await press(); await page.waitForFunction(t=>__fx.state.holdT>=t,duration); await release();
        await page.waitForFunction(n=>__fx.state.launches>n,before.launches);
        // No press, reach schedule, or geometric observation follows release.
        await page.waitForFunction(n=>__fx.state.catches>n||__fx.state.mode==="impact",before.catches);
        const after=await read();
        assert.equal(after.index,before.index+direction,"one release reaches its intended adjacent grip");
        assert.equal(after.falls,0); assert.equal(after.holding,false); assert.equal(after.grabT,-1);
      }
      for(let i=0;i<3;i++) await move(1,1.7);
      await page.locator("#directionDown").click(); await page.waitForFunction(()=>__fx.state.descending);
      await move(-1,.65);
      await page.locator("#directionUp").click(); await page.waitForFunction(()=>!__fx.state.descending);
      await move(1,1.7);
      await ready(); const before=await read();
      await press(); await page.waitForFunction(()=>__fx.state.holdT>=.30); await release();
      await page.waitForFunction(n=>__fx.state.falls>n,before.falls);
      const missed=await read();
      assert.equal(missed.catches,before.catches,"a bad launch gets no automatic lower-grip rescue");
      assert.deepEqual(errors,[]);
      console.log("PASS natural "+(touch?"touch":"keyboard")+": fixed-duration 3 up / 1 down / 1 up, no second press; bad launch falls without magnetic rescue");
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
