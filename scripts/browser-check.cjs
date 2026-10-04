// Run after npm run build. Set PLAYWRIGHT_MODULE when using a bundled installation.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('dist');
let release = 0;
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer(async(req,res)=>{
  try {
    let url = new URL(req.url,'http://localhost').pathname.replace(/^\/guildquest\//,'/');
    if (url.endsWith('/')) url += 'index.html';
    const file = path.resolve(root, '.'+decodeURIComponent(url));
    if (!file.startsWith(root+path.sep)) { res.writeHead(403); res.end(); return; }
    let body = await fs.readFile(file);
    if (release && file.endsWith('sw.js')) body = Buffer.from(body.toString().replace(/const CACHE = PREFIX \+ '([^']+)';/, `const CACHE = PREFIX + '$1-test${release}';`));
    res.writeHead(200, {'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
async function chapters(page) {
  for(let n=0;n<20 && await page.getByRole('button',{name:'スキップ・記録へ'}).count();n++) await page.getByRole('button',{name:'スキップ・記録へ'}).click();
}
async function start(page) {
  await page.getByRole('button',{name:'この名前で始める'}).click();
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  await page.screenshot({path:'artifacts/story-'+(page.viewportSize().width<700?'mobile':'desktop')+'.png'});
  await chapters(page);
}
async function gameState(page) { return page.evaluate(()=>JSON.parse(localStorage.getItem('guildquest_save_v1'))); }
(async()=>{
  await fs.mkdir('artifacts',{recursive:true});
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors=[]; const records=[];
  try {
    for (const mobile of [false,true]) {
      const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
      const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
      const url = baseUrl+(mobile?'/guildquest/':'/');
      await page.goto(url); await start(page);
      const nav = page.locator('.tabs');
      assert.equal(await nav.getByText('募集',{exact:true}).count(),0);
      await page.getByRole('button',{name:/次の日へ/}).click();
      assert.equal((await gameState(page)).day,1);
      await page.getByRole('button',{name:'アルドの適性を見る →'}).click();
      await page.locator('.row.between').filter({hasText:/狩人.*適性92/}).getByRole('button',{name:'転職',exact:true}).click();
      assert.equal((await gameState(page)).adventurers.find(a=>a.id==='c_aldo').job,'ranger');
      await page.getByRole('button',{name:/次の日へ/}).click();
      assert.equal((await gameState(page)).day,1);
      await nav.getByRole('button',{name:/派遣/}).click();
      assert.equal(await page.getByText('ゴブリン退治',{exact:true}).count(),0);
      await page.locator('.card').filter({has:page.locator('b',{hasText:'薬草採取'})}).first().click();
      const list = page.locator('.dispatch-adventurers');
      await list.locator('.card').filter({has:page.locator('b',{hasText:'アルド'})}).first().click();
      await list.locator('.card').filter({has:page.locator('b',{hasText:'ミナ'})}).first().click();
      await page.getByRole('button',{name:'派遣する',exact:true}).click();
      assert.equal((await gameState(page)).expeditions.length,1);
      await page.screenshot({path:`artifacts/dispatch-${mobile?'mobile':'desktop'}.png`});
      for(let day=2;day<=6;day++) {
        await page.getByRole('button',{name:/次の日へ/}).click();
        await page.getByRole('button',{name:'OK',exact:true}).click(); await chapters(page);
        assert.equal((await gameState(page)).day,day);
      }
      await nav.getByRole('button',{name:/ホーム/}).click();
      await page.getByRole('button',{name:'物語の記録',exact:true}).click();
      await page.locator('.overlay').getByRole('button',{name:'プロローグを再読する'}).click();
      assert.equal(await page.locator('.overlay .vn-player').count(),1);
      await page.getByRole('button',{name:'スキップ',exact:true}).click();
      await page.locator('.overlay').getByRole('button',{name:'閉じる',exact:true}).click();
      if(await page.locator('.toast').count()) await page.locator('.toast').waitFor({state:'hidden'});
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`artifacts/home-${mobile?'mobile':'desktop'}.png`});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(overflow,false,'horizontal overflow');
      await page.evaluate(()=>navigator.serviceWorker.ready);
      await page.reload(); await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      assert.equal(await page.getByRole('button',{name:'この名前で始める'}).count(),0);
      assert.equal((await gameState(page)).day,6);
      const manifest=await page.evaluate(async()=>{
        const m=await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
        return {display:m.display,icons:m.icons.length};
      });
      assert.equal(manifest.display,'standalone'); assert.equal(manifest.icons,3);
      await context.setOffline(true); await page.reload();
      await page.waitForSelector('.campaign-hero');
      assert.equal((await gameState(page)).day,6);
      assert.equal(await page.locator('.campaign-art').evaluate(img=>img.complete&&img.naturalWidth>0),true);
      await page.getByRole('button',{name:'第一章 · 向いている場所 読了 · 再読する'}).click();
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('.vn-player img[src]')).every(img=>img.complete&&img.naturalWidth>0));
      assert.equal(await page.locator('[data-story-stage]').getAttribute('data-mode'),'compose');
      await page.screenshot({path:`artifacts/offline-${mobile?'mobile':'desktop'}.png`});
      await chapters(page);
      await page.reload(); assert.equal((await gameState(page)).day,6);
      await context.setOffline(false); release++;
      await page.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); await r.update(); });
      await page.getByRole('button',{name:'更新して再起動'}).waitFor();
      await page.getByRole('button',{name:'更新して再起動'}).click();
      await page.waitForFunction(()=>!document.body.innerText.includes('更新して再起動'));
      assert.equal((await gameState(page)).day,6);
      records.push({mode:mobile?'mobile/subdirectory':'desktop/root',day:6,jobChange:true,dispatch:true,stageUnlocks:true,reload:true,offline:true,updateRetainsSave:true,overflow:false});
      await context.close();
    }
    for(const name of ['clear','legacy','extension']) {
      const raw = await fs.readFile(`artifacts/fixtures/${name}.json`,'utf8');
      const context = await browser.newContext({viewport:{width:1280,height:900}});
      await context.addInitScript(raw=>localStorage.setItem('guildquest_save_v1',raw),raw);
      const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
      await page.goto(baseUrl+'/');
      if(name==='legacy') {
        assert.equal(await page.locator('.tabs').getByRole('button',{name:/募集/}).count(),1);
        assert.equal(await page.locator('.overlay').count(),0);
        await page.goto(baseUrl+'/?ui=hall');
        await page.getByText('依頼掲示板',{exact:true}).click();
        assert.equal(await page.getByText('派遣する',{exact:true}).count(),1);
        await page.screenshot({path:'artifacts/hall-legacy.png'});
      } else {
        const title = name==='clear'?'終章 · 帰ってくる人たち':'終章 · 三十一枚目の依頼書';
        assert.equal(await page.locator('.vn-player-title').innerText(),title);
        if(name==='clear') {
          for(let i=0;i<5;i++) {
            const next=page.locator('[data-story-next]');
            if(await next.innerText()==='全文を表示') await next.click();
            await next.click();
          }
          assert.match(await page.locator('.vn-player-still').getAttribute('src'),/ruins-vow/);
          await page.waitForFunction(()=>document.querySelector('.vn-player-still').naturalWidth>0);
        }
        await page.screenshot({path:`artifacts/ending-${name}.png`});
        await chapters(page);
        assert.equal(await page.locator('.overlay').count(),0);
      }
      records.push({fixture:name,passed:true}); await context.close();
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile('artifacts/browser-check.json',JSON.stringify({records,errors},null,2));
    console.log(JSON.stringify({records,errors},null,2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
