// Production build integration checks. Uses a private Chrome profile and local HTTP server.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict');
const root=path.resolve('dist');
const prologue=require('../src/data/story-prologue.json');
const wardrobeLine=prologue.findIndex(line=>line.text.includes('シャツとベストに着替え'));
const garoEntrance=prologue.findIndex(line=>line.speaker==='ガロ');
const garoHappy=prologue.findIndex((line,i)=>i>garoEntrance && line.speaker==='ガロ' && line.cast?.some(actor=>actor.character==='garo' && actor.pose==='happy'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{
 let url=new URL(req.url,'http://localhost').pathname;if(url.endsWith('/'))url+='index.html';
 const file=path.resolve(root,'.'+decodeURIComponent(url));if(!file.startsWith(root+path.sep))throw Error('path');
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404);res.end();}});
const next=async(page)=>{
 const button=page.locator('[data-story-next], [data-prologue-next]');
 if(await button.innerText()==='全文を表示')await button.click();
 await button.click();
};
const loaded=async page=>page.waitForFunction(()=>Array.from(document.querySelectorAll('.vn-player img[src],.character-guide img')).every(img=>img.complete&&img.naturalWidth>0));
const soundCount=page=>page.evaluate(()=>window.audioAudit.tones);
(async()=>{
 await new Promise(r=>server.listen(4181,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[],records=[];
 try{
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['small',320,568],['landscape',844,390]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:name==='small'?'reduce':'no-preference'});
   await context.addInitScript(()=>{
    window.audioAudit={tones:0,closed:0};
    const original=AudioContext.prototype.createOscillator,close=AudioContext.prototype.close;
    AudioContext.prototype.createOscillator=function(){window.audioAudit.tones++;return original.call(this)};
    AudioContext.prototype.close=function(){window.audioAudit.closed++;return close.call(this)};
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:4181/');
   await page.getByRole('button',{name:'この名前で始める'}).click();
   assert.equal(await page.locator('[data-prologue-next]').evaluate(el=>el===document.activeElement),true,'keyboard starts on progression');
   assert.equal(await soundCount(page),0);
   assert.equal(await page.locator('.vn-player input[type=checkbox]').isChecked(),true);
   await page.locator('.vn-player input[type=checkbox]').uncheck();
   await next(page);await loaded(page);
   assert.equal(await page.locator('[data-character=yuto]').count(),0);
   assert.equal(await page.locator('[data-story-portrait]').isVisible(),true);
   assert.equal(await page.locator('[data-story-portrait]').getAttribute('data-portrait-character'),'yuto');
   await page.screenshot({path:`artifacts/dialogue-office-${name}.png`});
   assert.ok(await soundCount(page)>0,'first line sound follows gesture');
   for(let i=1;i<garoEntrance;i++) await next(page);
   await loaded(page);
   assert.equal(await page.locator('[data-story-stage]').getAttribute('data-background'),'tavern');
   assert.equal(await page.locator('[data-character=garo]').getAttribute('data-position'),'center');
   assert.equal(await page.locator('[data-character=yuto]').count(),0);
   assert.equal(await page.locator('[data-story-portrait]').isVisible(),false);
   assert.equal(await page.locator('[data-character=garo]').evaluate(el=>el.classList.contains('is-speaker')),true);
   const count=await soundCount(page);
   await page.locator('[data-story-history-toggle]').click();
   assert.equal(await page.locator('.vn-player-history-row:visible').count(),garoEntrance+1);
   assert.equal(await soundCount(page),count);
   await page.locator('[data-story-history-toggle]').click();
   await page.locator('[data-story-back]').click();
   assert.equal(await soundCount(page),count,'back does not replay sound');
   await next(page);
   await page.locator('.vn-player input[type=range]').evaluate(el=>{el.value='0.35';el.dispatchEvent(new Event('input',{bubbles:true}))});
   await next(page);await loaded(page);
   assert.equal(await page.locator('[data-story-portrait]').isVisible(),true);
   for(let i=garoEntrance+1;i<garoHappy;i++) await next(page);
   await loaded(page);
   assert.equal(await page.locator('[data-character=garo]').getAttribute('data-pose'),'happy');
   await page.waitForTimeout(800);
   await page.screenshot({path:`artifacts/dialogue-tavern-${name}.png`});
   await page.locator('[data-story-stage-toggle]').click();
   assert.equal(await page.locator('.vn-player-dialogue').isVisible(),false);
   assert.equal(await page.locator('[data-story-stage]').isVisible(),true);
   await page.locator('[data-story-stage-toggle]').click();
   assert.equal(await page.locator('.vn-player-dialogue').isVisible(),true);
   await page.locator('.vn-player input[type=checkbox]').check();
   const mutedCount=await soundCount(page);
   for(let i=garoHappy;i<prologue.length-1;i++) {
    await next(page);
    if(i+1<=wardrobeLine) assert.equal(await page.locator('[data-character=yuto]').count(),0);
    if(i+1===wardrobeLine+1) {
      assert.equal(await page.locator('[data-character=yuto]').getAttribute('data-position'),'right');
      assert.equal(await page.locator('[data-story-portrait]').isVisible(),false);
      await page.locator('[data-story-back]').click();
      assert.equal(await page.locator('[data-character=yuto]').count(),0);
      await next(page);
    }
   }
   await loaded(page);
   assert.equal(await page.locator('[data-story-stage]').getAttribute('data-mode'),'still');
   assert.equal(await soundCount(page),mutedCount);
   await page.screenshot({path:`artifacts/dialogue-still-${name}.png`});
   await next(page);await loaded(page);
   assert.equal(await page.locator('.vn-player input[type=checkbox]').isChecked(),true);
   assert.equal(await page.locator('.vn-player input[type=range]').inputValue(),'0.35');
   assert.ok(await page.evaluate(()=>window.audioAudit.closed)>0);
   await next(page);await loaded(page);await page.waitForTimeout(800);
   assert.equal(await page.locator('.vn-player-character:visible').count(),3);
   assert.equal(await page.locator('[data-character=aldo]').evaluate(el=>getComputedStyle(el).opacity),'1');
   assert.equal(await page.locator('.vn-player').evaluate(el=>el.scrollWidth>el.clientWidth),false);
   assert.equal(await page.evaluate(()=>document.querySelector('.vn-player-toolbar').getBoundingClientRect().bottom<=document.querySelector('[data-story-stage]').getBoundingClientRect().top+1),true,'toolbar must not overlap stage');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`artifacts/dialogue-guild-${name}.png`});
   await page.getByRole('button',{name:'スキップ・記録へ'}).click();
   await page.getByRole('button',{name:'物語の記録',exact:true}).click();
   await page.locator('.overlay').getByRole('button',{name:'キャラクター設定資料',exact:true}).click();
   for(const label of ['ユウト','アルド','ミナ','リナ','ブルーノ','ミレイ','ガロ']){
    await page.locator('.character-tabs').getByRole('button',{name:label,exact:true}).click();await loaded(page);
    assert.ok(await page.locator('.character-guide-image').evaluate(el=>el.naturalWidth)>=1024);
   }
   await page.locator('.character-tabs').getByRole('button',{name:'アルド',exact:true}).click();await loaded(page);
   await page.screenshot({path:`artifacts/character-guide-${name}.png`});
   for(const label of ['通常','考える・困る','笑顔・安堵']){
    await page.locator('.character-guide').getByRole('button',{name:label,exact:true}).click();await loaded(page);
   }
   await page.evaluate(()=>navigator.serviceWorker.ready);
   await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await context.setOffline(true);await page.reload();
   const artPaths=[];
   for(const id of ['yuto','aldo','mina','lina','bruno','mirei','garo'])for(const pose of ['reference','neutral','thoughtful','happy'])artPaths.push(`art/characters/${id}/${pose}.webp`);
   for(const bg of ['guild','town','night','office','tavern'])artPaths.push(`art/backgrounds/${bg}.webp`);
   const offline=await page.evaluate(async paths=>Promise.all(paths.map(async p=>{const r=await fetch(p);return r.ok&&(await r.blob()).size>1000})),artPaths);
   assert.equal(offline.every(Boolean),true);
   records.push({name,viewport:[width,height],pose:true,positions:true,history:true,artView:true,sound:true,settings:true,guide:7,offlineAssets:offline.length,overflow:false});
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const raw=await fs.readFile('artifacts/fixtures/conversation.json','utf8');
  await context.addInitScript(raw=>localStorage.setItem('guildquest_save_v1',raw),raw);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4181/');
  const before=await page.evaluate(()=>localStorage.getItem('guildquest_save_v1'));
  await page.getByRole('button',{name:'物語の記録',exact:true}).click();
  const events=JSON.parse(await fs.readFile('src/data/charevents.json','utf8'));
  await page.locator('.overlay').getByRole('button',{name:events[0].title,exact:true}).click();await loaded(page);
  assert.equal(await page.locator('.vn-player-title').innerText(),events[0].title);
  assert.equal(await page.locator('[data-character=yuto] figcaption').innerText(),'検証');
  await page.screenshot({path:'artifacts/dialogue-character-event.png'});
  await page.getByRole('button',{name:'スキップ・記録へ'}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('guildquest_save_v1')),before,'replay does not award effects');
  await page.goto('http://127.0.0.1:4181/story.html');
  await page.getByRole('button',{name:'▶ 最初から紙芝居で再生',exact:true}).click();await loaded(page);
  assert.equal(await page.locator('.vn-player').count(),1);
  assert.equal(await page.locator('[data-story-stage]').getAttribute('data-background'),'office');
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('guildquest_save_v1')),before);
  await context.close();
  assert.deepEqual(errors,[]);
  await fs.writeFile('artifacts/story-browser-check.json',JSON.stringify({records,individualReplay:true,errors},null,2));
  console.log(JSON.stringify({records,individualReplay:true,errors},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
