// Real Chrome checks: motion composition, interruption, accessibility and authored beats.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const prologue = require('../src/data/story-prologue.json');
const events = require('../src/data/charevents.json');

async function mount(page, lines) {
  await page.evaluate(async lines => {
    window.effectsPlayer?.dispose();
    const { createStoryPlayer } = await import('/src/ui/storyPlayer.ts');
    window.effectsPlayer = createStoryPlayer({ id:'effects-check', title:'ストーリー演出検証', lines, playerName:'ユウト', onClose:()=>{} });
    document.body.replaceChildren(window.effectsPlayer.element);
    window.effectsRoot = window.effectsPlayer.element;
  }, lines);
  await page.waitForFunction(() => [...document.querySelectorAll('.vn-player img[src]')].every(img=>img.complete && img.naturalWidth>0));
}
async function step(page) {
  await page.evaluate(() => {
    const button = document.querySelector('[data-story-next]');
    if (button.textContent==='全文を表示') button.click();
    button.click();
    for (const animation of window.effectsRoot.getAnimations({subtree:true})) animation.pause();
  });
}
async function seek(page, fraction=.4) {
  return page.evaluate(fraction => {
    const animations = window.effectsRoot.getAnimations({subtree:true});
    for (const a of animations) { a.pause(); a.currentTime = Number(a.effect.getTiming().duration) * fraction; }
    return animations.length;
  }, fraction);
}
async function loaded(page) {
  await page.evaluate(async()=>{
    await Promise.all([...document.querySelectorAll('.vn-player img[src]')].map(img=>img.decode()));
  });
}
const active = page => page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).length);
const actor = (character, position, motion) => ({character, position, pose:'happy', ...(motion?{motion}:{})});
const line = (overrides={}) => ({text:'検証用の台詞です。', speaker:'アルド', background:'guild', cast:[actor('aldo','left'),actor('mina','right')], transition:'cut', ...overrides});

(async()=>{
  const {createServer} = await import('vite');
  const server = await createServer({server:{host:'127.0.0.1',port:4182,strictPort:true,watch:null},clearScreen:false});
  let browser;
  const errors=[], records=[];
  try {
    await server.listen();
    await fs.mkdir('artifacts/story-effects',{recursive:true});
    browser = await chromium.launch({channel:'chrome',headless:true});
    for (const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['small',320,568],['landscape',844,390]]) {
      const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:4182/story.html');
      for (const motion of ['enter-left','enter-right','jump','nod','shake','recoil']) {
        await mount(page,[line(),line({cast:[actor('aldo','left',motion),actor('mina','right','nod')]})]);
        await step(page);
        assert.ok(await seek(page)>=2,`${name}: both actors animate independently: ${motion}`);
        const state=await page.evaluate(()=>[...document.querySelectorAll('.vn-player-character-motion')].filter(el=>!el.closest('[hidden]')).map(el=>getComputedStyle(el).transform));
        assert.ok(state.filter(t=>t!=='none'&&t!=='matrix(1, 0, 0, 1, 0, 0)').length>=2,`${name}: visible motion transforms: ${motion}`);
        // Going back must restore a static stage, including listener emphasis.
        await page.locator('[data-story-back]').evaluate(el=>el.click());
        assert.equal(await active(page),0,`${name}: back cancels ${motion}`);
      }
      for (const transition of ['fade','wipe','blackout']) {
        await mount(page,[line({background:'office'}),line({background:'tavern',transition,cast:[actor('aldo','left','jump')],effect:'impact'})]);
        await step(page);
        assert.ok(await seek(page)>=3,`${name}: transition, actor and screen effect coexist`);
        assert.ok(await page.locator('.vn-player img').evaluateAll(imgs=>imgs.some(img=>img.src.includes('/office.webp'))),`${name}: old scene preserved during ${transition}`);
        await page.screenshot({path:`artifacts/story-effects/${name}-${transition}.png`});
        await page.locator('[data-story-back]').evaluate(el=>el.click());
        assert.equal(await active(page),0);
        assert.equal(await page.locator('[data-story-stage]').getAttribute('data-background'),'office');
      }
      for (const effect of ['shake','impact','flash']) {
        await mount(page,[line(),line({effect,cast:[actor('aldo','left','jump')]})]);
        await step(page);await seek(page);
        if(effect!=='flash') assert.notEqual(await page.locator('.vn-player-scene-content').evaluate(el=>getComputedStyle(el).transform),'none','background and cast move together');
        assert.equal(await page.locator('.vn-player-navigation').evaluate(el=>getComputedStyle(el).transform),'none');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
        const count=await active(page);
        await page.evaluate(()=>{
          window.beforeInteractionAnimations=window.effectsRoot.getAnimations({subtree:true});
          const button=document.querySelector('[data-story-next]');
          if(button.textContent==='全文を表示') button.click();
        });
        await page.locator('[data-story-history-toggle]').evaluate(el=>el.click());
        await page.locator('[data-story-history-toggle]').evaluate(el=>el.click());
        await page.locator('[data-story-stage-toggle]').evaluate(el=>el.click());
        await page.locator('[data-story-stage-toggle]').evaluate(el=>el.click());
        assert.equal(await active(page),count,'history and dialogue visibility do not restart effects');
        assert.equal(await page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).every(a=>window.beforeInteractionAnimations.includes(a))),true,'interaction preserves animation instances');
        await page.locator('[data-story-motion-toggle]').evaluate(el=>el.click());
        assert.equal(await active(page),0,'OFF cancels immediately');
        await page.locator('[data-story-back]').evaluate(el=>el.click());
        await step(page);
        assert.equal(await active(page),0,'OFF suppresses next line');
        await page.locator('[data-story-motion-toggle]').evaluate(el=>el.click());
        assert.equal(await active(page),0,'ON does not replay the current line');
      }
      await mount(page,[line({transition:'fade',effect:'impact',cast:[actor('aldo','left','jump')]})]);
      assert.ok(await seek(page)>=4,'initial fade, screen impact, flash and actor motion coexist');
      const initialTargets=await page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).map(a=>a.effect.target.className));
      assert.ok(initialTargets.some(c=>c.split(' ').includes('vn-player-scene')),'initial reveal animates independently');
      assert.ok(initialTargets.some(c=>c.split(' ').includes('vn-player-scene-content')),'initial impact animates independently');
      await mount(page,[line(),line({transition:'wipe',effect:'impact',cast:[actor('aldo','left','jump')]}),line({background:'night',cast:[]})]);
      await step(page);await step(page);
      assert.equal(await active(page),0,'rapid advance clears previous animations');
      assert.equal(await page.locator('[data-story-stage]').getAttribute('data-background'),'night');
      await page.locator('[data-story-back]').evaluate(el=>el.click());
      assert.equal(await active(page),0,'back onto an authored effect does not replay it');
      await mount(page,[line(),line({effect:'shake',still:'guild-dawn',cast:[]}),line({effect:'shake',still:'ruins-vow',cast:[]})]);
      await step(page);await seek(page);
      assert.notEqual(await page.locator('.vn-player-scene-content').evaluate(el=>getComputedStyle(el).transform),'none','stills share screen shake');
      await page.evaluate(()=>{window.previousAnimations=window.effectsRoot.getAnimations({subtree:true})});
      await step(page);await seek(page);
      assert.equal(await page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).every(a=>!window.previousAnimations.includes(a))),true,'same effect restarts on the next line');
      await page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).forEach(a=>a.play()));
      await page.waitForFunction(()=>window.effectsRoot.getAnimations({subtree:true}).length===0);
      assert.equal(await page.locator('.vn-player-scene-content').evaluate(el=>getComputedStyle(el).transform),'none','effects naturally return to rest');
      await mount(page,[line(),line({cast:[actor('aldo','left','jump')]}),line({cast:[actor('aldo','left','jump')]})]);
      await step(page);await seek(page);
      await page.evaluate(()=>{window.previousAnimations=window.effectsRoot.getAnimations({subtree:true})});
      await step(page);await seek(page);
      assert.equal(await page.evaluate(()=>window.effectsRoot.getAnimations({subtree:true}).every(a=>!window.previousAnimations.includes(a))),true,'same actor motion restarts on consecutive cut lines');
      await mount(page,[line(),line({transition:'fade',effect:'impact',cast:[actor('aldo','left','jump')]})]);
      await step(page);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>window.effectsRoot.getAnimations({subtree:true}).length===0);
      await page.locator('[data-story-back]').evaluate(el=>el.click());await step(page);
      assert.equal(await active(page),0,'OS reduced motion suppresses next line');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await mount(page,[line(),line({transition:'fade',effect:'impact',cast:[actor('aldo','left','jump')]})]);
      await step(page);
      await page.evaluate(()=>{window.effectsPlayer.dispose();window.effectsPlayer.dispose()});
      assert.equal(await active(page),0,'dispose clears animations idempotently');

      // Capture actual scenario directions, not only synthetic test lines.
      const jumpLine=prologue.findIndex(line=>line.speaker==='アルド' && line.cast?.some(actor=>actor.character==='aldo'&&actor.motion==='jump'));
      assert.ok(jumpLine>0,'authored bow-practice jump exists');
      await mount(page,prologue.slice(jumpLine-1,jumpLine+2));
      await step(page);await loaded(page);
      await page.locator('[data-story-next]').evaluate(el=>{if(el.textContent==='全文を表示')el.click()});
      await seek(page,.4);
      await page.screenshot({path:`artifacts/story-effects/${name}-aldo-jump.png`});
      await mount(page,events.find(e=>e.id==='lina_money').lines);
      await step(page);await step(page);await loaded(page);
      await page.locator('[data-story-next]').evaluate(el=>{if(el.textContent==='全文を表示')el.click()});
      await seek(page,.4);
      await page.screenshot({path:`artifacts/story-effects/${name}-lina-reaction.png`});
      await page.evaluate(()=>window.effectsPlayer.dispose());
      records.push({name,motions:6,transitions:3,effects:3,interruption:true,reducedMotion:true,dispose:true});
      await context.close();
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile('artifacts/story-effects/check.json',JSON.stringify({records,errors},null,2));
    console.log(JSON.stringify({records,errors},null,2));
  } finally { await browser?.close();await server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
