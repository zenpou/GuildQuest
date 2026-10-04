// Verify story words and gestures together, including cues late in real dialogue.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const prologue=require('../src/data/story-prologue.json');
const chapters=require('../src/data/campaign-story.json');
const events=require('../src/data/charevents.json');
const opening={text:'確認',background:'guild',cast:[],transition:'cut'};
async function mount(page,lines){
  await page.evaluate(async lines=>{
    window.player?.dispose();
    const {createStoryPlayer}=await import('/src/ui/storyPlayer.ts');
    window.player=createStoryPlayer({id:'alignment',title:'台詞に合わせた演出',lines,playerName:'ユウト',onClose:()=>{}});
    document.body.replaceChildren(window.player.element);
  },lines);
  await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.vn-player img[src]')].map(i=>i.decode())));
}
async function next(page){await page.evaluate(()=>{const b=document.querySelector('[data-story-next]');if(b.textContent==='全文を表示')b.click();b.click()});}
async function reveal(page){await page.evaluate(()=>{const b=document.querySelector('[data-story-next]');if(b.textContent==='全文を表示')b.click()});}
const motion=async(page,id)=>page.locator(`[data-character="${id}"] .vn-player-character-motion`).evaluate(el=>[...el.classList].find(c=>c.startsWith('is-motion-'))??null);
const sounds=page=>page.evaluate(()=>window.tones);
const beforeAnchor=(text,anchor)=>(text.indexOf(anchor)+anchor.length-2)*24;

(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({server:{host:'127.0.0.1',port:4184,strictPort:true,watch:null},clearScreen:false});
  let browser;
  const errors=[],records=[];
  try{
    await server.listen();await fs.mkdir('artifacts/story-alignment',{recursive:true});
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
      const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install({time:new Date('2026-10-03T10:00:00Z')});
      await page.clock.pauseAt(new Date('2026-10-03T10:00:01Z'));
      await page.goto('http://127.0.0.1:4184/story.html');
      await page.evaluate(()=>{window.tones=0;const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){window.tones++;return original.call(this)}});
      const greeting=prologue.find(l=>l.text.includes('先生は、やっぱり落ち着かないな'));
      await mount(page,[opening,greeting,opening]);await next(page);
      assert.equal(await motion(page,'yuto'),null,'no bow while complaining about the title');
      await page.clock.runFor(beforeAnchor(greeting.text,'よろしくお願いします'));
      assert.equal(await motion(page,'yuto'),null,'no bow before the greeting');
      await page.screenshot({path:`artifacts/story-alignment/${name}-before-greeting.png`});
      await page.clock.runFor(24);
      assert.equal(await motion(page,'yuto'),'is-motion-nod','bow at greeting after fade ended');
      const transform=await page.locator('[data-character=yuto] .vn-player-character-motion').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=220;return getComputedStyle(el).transform});
      const matrix=transform.match(/matrix\((.*)\)/)[1].split(',').map(Number);
      assert.equal(matrix[1],0,'nod does not tilt sideways');assert.equal(matrix[2],0);assert.ok(matrix[5]>0);
      await page.screenshot({path:`artifacts/story-alignment/${name}-greeting-bow.png`});
      await reveal(page);await page.clock.runFor(200);
      assert.equal(await motion(page,'yuto'),'is-motion-nod','full text preserves the bow');
      await page.clock.runFor(600);assert.equal(await motion(page,'yuto'),null);

      const magic=prologue.find(l=>l.effectAt==='薄い文字が浮かんだ');assert.ok(magic);
      await mount(page,[opening,magic,opening]);
      await page.locator('input[type=checkbox]').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))});
      const base=await sounds(page);await next(page);
      await page.clock.runFor(beforeAnchor(magic.text,magic.effectAt));
      assert.equal(await page.locator('.vn-player-flash').evaluate(el=>el.getAnimations().length),0);
      assert.equal(await sounds(page),base,'magic sound waits for the phrase');
      await page.clock.runFor(24);
      assert.ok(await page.locator('.vn-player-flash').evaluate(el=>el.getAnimations().length)>0);
      assert.ok(await sounds(page)>base,'sound and glow match the same phrase');
      const played=await sounds(page);await reveal(page);assert.equal(await sounds(page),played);
      await page.locator('[data-story-back]').evaluate(el=>el.click());await next(page);await reveal(page);
      assert.equal(await sounds(page),played,'rereading does not duplicate sound');

      const shot=prologue.find(l=>l.text.includes('アルドは借りた弓を引いた'));
      await mount(page,[opening,shot]);await next(page);const bowBase=await sounds(page);
      await page.clock.runFor(beforeAnchor(shot.text,shot.sfxAt));assert.equal(await sounds(page),bowBase);
      assert.equal(await motion(page,'aldo'),null,'shooter is not knocked back');
      await page.clock.runFor(24);assert.ok(await sounds(page)>bowBase);
      assert.equal(await page.locator('.vn-player-scene-content').evaluate(el=>el.getAnimations().length),0,'no explosion from a practice arrow');

      const apology=chapters.find(c=>c.id==='facilities').lines[0];
      await mount(page,[opening,apology,opening]);await next(page);await page.clock.runFor(300);await reveal(page);
      assert.equal(await motion(page,'mina'),'is-motion-nod');
      await page.clock.runFor(350);assert.equal(await motion(page,'mina'),'is-motion-nod','transition cleanup cannot truncate a later cue');
      await page.clock.runFor(400);assert.equal(await motion(page,'mina'),null);
      await page.locator('[data-story-back]').evaluate(el=>el.click());await next(page);
      await page.locator('[data-story-motion-toggle]').evaluate(el=>el.click());
      await page.locator('[data-story-motion-toggle]').evaluate(el=>el.click());
      await reveal(page);assert.equal(await motion(page,'mina'),null,'OFF consumes pending visuals for this visit');
      await page.locator('[data-story-back]').evaluate(el=>el.click());await next(page);
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
      await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(50);
      await reveal(page);assert.equal(await motion(page,'mina'),null,'OS suppression consumes pending visuals');
      await next(page);await page.clock.runFor(3000);
      assert.equal(await page.locator('.vn-player').evaluate(el=>el.getAnimations({subtree:true}).length),0,'no delayed cue leaks to next line');

      const missing={...apology,cast:apology.cast.map(a=>({...a,motionAt:'本文には存在しない語句'}))};
      await mount(page,[opening,missing]);await next(page);await reveal(page);
      assert.equal(await motion(page,'mina'),null,'invalid anchor fails closed');
      await page.evaluate(()=>window.player.dispose());await context.close();
      records.push({name,greetingTiming:true,magicTiming:true,bowSoundTiming:true,nodVertical:true,interruption:true});
    }
    // Unpaused sample for reviewing dialogue and gestures together.
    const demo=await browser.newContext({viewport:{width:960,height:800},recordVideo:{dir:'artifacts/story-alignment/video',size:{width:960,height:800}}});
    const page=await demo.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4184/story.html');
    const greeting=prologue.find(l=>l.text.includes('先生は、やっぱり落ち着かないな'));
    await mount(page,[opening,greeting]);await next(page);await page.waitForTimeout(greeting.text.length*24+1000);
    const lina=events.find(e=>e.id==='lina_lost').lines;
    await mount(page,lina);await page.waitForTimeout(lina[0].text.length*24+600);await next(page);await page.waitForTimeout(lina[1].text.length*24+1200);
    const video=page.video();await demo.close();await video.saveAs('artifacts/story-alignment/dialogue-motion.webm');
    assert.deepEqual(errors,[]);
    await fs.writeFile('artifacts/story-alignment/check.json',JSON.stringify({records,errors},null,2));
    console.log(JSON.stringify({records,errors},null,2));
  }finally{await browser?.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
