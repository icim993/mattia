// V2 behavioral tests with isolated synthetic media; no real photos or writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {server,mock}=require('./pages_smoke.cjs');
const preview=path.resolve(__dirname,'../test-results/v2');
fs.mkdirSync(preview,{recursive:true});
let browser,base;
async function open(route,width,role='owner',motion='reduce') {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion});
  await context.route('https://**/*',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await context.route('**/libro/assets/config.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await context.addInitScript({content:`(${mock.toString()})(${JSON.stringify({role,signedIn:!!role,v2:true})});window.MATTIA_CONFIG={url:'https://example.supabase.co',anonKey:'test'};`});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+route);
  return {page,context,errors};
}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'horizontal overflow');}
async function next(page){const old=await page.locator('#page-count').innerText();await page.locator('#next-page').click();await page.waitForFunction(previous=>document.querySelector('#page-count').textContent!==previous,old);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/mattia/`;
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    for(const width of [1366,768,390,320]){
      const {page,context,errors}=await open('libro/',width,'viewer');
      await page.locator('.chapter-card').first().click();
      assert.equal(await page.locator('.book-leaf').count(),width>760?2:1);
      if(width<=760)await next(page); // story
      assert.match(await page.locator('.book-leaf').allInnerTexts().then(x=>x.join(' ')),/Ricordo di prova/);
      await next(page); // photograph
      await page.locator('.book-photo-image').first().waitFor();
      await page.waitForFunction(()=>document.querySelector('.book-photo-image')?.naturalWidth>0);
      assert.equal(await page.locator('.book-photo-image').first().evaluate(img=>img.style.objectFit),'contain');
      const bounds=await page.locator('.book-photo-window').first().boundingBox();
      assert.ok(bounds.height>100 && bounds.width>100,JSON.stringify(bounds));
      await noOverflow(page);
      await page.screenshot({path:path.join(preview,`book-${width}.png`),fullPage:true});
      if(width<=760){
        const count=await page.locator('#page-count').innerText();
        await page.locator('#memories-list').evaluate(el=>{
          el.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:el,clientX:250,clientY:200})]}));
          el.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:el,clientX:100,clientY:208})]}));
        });
        await page.waitForFunction(old=>document.querySelector('#page-count').textContent!==old,count);
        assert.match(await page.locator('.book-photo-caption').innerText(),/Seconda foto/);
      }
      await page.locator('#back-chapters').click();assert.equal(await page.locator('#memory-section').isVisible(),false);
      assert.equal((await page.evaluate(()=>window.testCalls)).includes('guestbook_private'),false);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS V2 book ${width}px: spread, photo bounds, swipe, chapters`);
    }
    for(const width of [1366,390]){
      const {page,context,errors}=await open('libro/admin/',width);
      await page.waitForFunction(()=>document.querySelector('#studio-frame img')?.naturalWidth>0);
      await page.locator('#studio-caption').fill('Didascalia <b>sicura</b>');
      await page.locator('#studio-layout').selectOption('gallery');
      await page.locator('#studio-fit').selectOption('cover');
      for(const [key,value] of Object.entries({x:30,y:70,zoom:140,rotate:5,brightness:120,contrast:115,saturation:80,sepia:20,grayscale:10}))
        await page.locator('#studio-'+key).fill(String(value));
      assert.equal(await page.locator('#studio-preview-caption').innerText(),'Didascalia <b>sicura</b>');
      assert.equal(await page.locator('#studio-preview-caption b').count(),0);
      assert.match(await page.locator('#studio-frame img').getAttribute('style'),/scale\(1.4\)/);
      await page.locator('#studio-save').click();
      await page.waitForFunction(()=>document.querySelector('#studio-message').textContent.includes('salvata'));
      const saved=await page.evaluate(()=>structuredClone(window.testRows.album_media.find(x=>x.id==='photo1')));
      assert.equal(saved.photo_settings.brightness,120);assert.equal(saved.photo_settings.fit,'cover');
      assert.equal(saved.storage_path,'test/photo-one.png');
      await page.locator('#studio-media').selectOption('photo2');
      assert.equal(await page.locator('#studio-brightness').inputValue(),'110');
      await page.locator('#studio-media').selectOption('photo1');
      assert.equal(await page.locator('#studio-caption').inputValue(),saved.caption);
      assert.equal(await page.locator('#studio-brightness').inputValue(),'120');
      await page.locator('#studio-reload').click();
      await page.waitForFunction(()=>document.querySelector('#studio-frame img')?.naturalWidth>0);
      assert.equal(await page.locator('#studio-caption').inputValue(),saved.caption);
      await page.locator('#studio-page-order').fill('7');await page.locator('#studio-save-order').click();
      await page.waitForFunction(()=>document.querySelector('#studio-message').textContent.includes('Posizione'));
      assert.equal(await page.evaluate(()=>window.testRows.album_memories[0].page_order),7);
      await noOverflow(page);await page.screenshot({path:path.join(preview,`studio-${width}.png`),fullPage:true});
      await page.locator('#studio-media').selectOption('video1');
      assert.equal(await page.locator('#studio-brightness').isDisabled(),true);
      await page.locator('#studio-caption').fill('Video aggiornato');await page.locator('#studio-save').click();
      await page.waitForFunction(()=>document.querySelector('#studio-message').textContent.includes('salvata'));
      const writes=await page.evaluate(()=>window.testWrites);
      assert.equal(writes.some(w=>w.bucket),false,'studio must never upload, replace or remove originals');
      assert.equal(writes.filter(w=>w.table==='album_media').length,2);
      assert.equal(writes.filter(w=>w.table==='album_media')[1].row.photo_settings,undefined);
      await page.evaluate(()=>{window.testQueryError='album_media'});await page.locator('#studio-reload').click();
      await page.waitForFunction(()=>document.querySelector('#studio-message').classList.contains('error'));
      assert.equal(await page.locator('#studio-save').isDisabled(),true);
      await page.locator('#logout-button').click();
      assert.equal(await page.locator('#photo-studio').isVisible(),false);
      assert.equal(await page.locator('#studio-caption').inputValue(),'');
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS V2 studio ${width}px: individual metadata, presets, preview/save/reload, videos and original preservation`);
    }
    for(const role of ['viewer','contributor',null]){
      const {page,context,errors}=await open('libro/admin/',390,role);
      await page.waitForFunction(()=>window.Mattia && (document.querySelector('#private-content').hidden===false || document.querySelector('#gate').hidden===false || document.querySelector('#denied').hidden===false));
      assert.equal(await page.locator('#photo-studio').isVisible(),false);
      assert.equal(await page.locator('#studio-memory option').count(),0);
      assert.equal((await page.evaluate(()=>window.testCalls)).includes('guestbook_private'),false);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS V2 studio denied for ${role||'anonymous'}`);
    }
    // In-flight studio/media requests must never restore private UI after logout.
    {
      const {page,context,errors}=await open('libro/admin/',1366);
      await page.locator('#studio-memory option').first().waitFor({state:'attached'});
      await page.evaluate(()=>{window.testQueryDelay=180;window.testDownloadDelay=180});
      await page.locator('#studio-reload').click();await page.locator('#logout-button').click();
      await page.waitForTimeout(240);
      assert.equal(await page.locator('#studio-memory option').count(),0);
      assert.equal(await page.locator('#studio-frame img').count(),0);
      assert.equal(await page.locator('#photo-studio').isVisible(),false);
      assert.deepEqual(errors,[]);await context.close();console.log('PASS V2 logout during studio queries');
    }
    {
      const {page,context,errors}=await open('libro/',1366,'owner');
      const requests=await page.evaluate(async()=>{
        const recorded=[];const original=window.fetch;
        window.fetch=async(input,init)=>{recorded.push({url:typeof input==='string'?input:input.url,cache:init.cache});return new Response('fixture')};
        try{
          const fetcher=window.testClientOptions.global.fetch;
          const url='https://example.supabase.co/storage/v1/object/authenticated/mattia-album/fixture.png';
          await fetcher(url);await fetcher(new Request(url));
        }finally{window.fetch=original}
        return recorded;
      });
      assert.equal(requests.length,2);assert.ok(requests.every(r=>r.cache==='no-store' && new URL(r.url).searchParams.has('cacheNonce')));
      assert.notEqual(requests[0].url,requests[1].url);
      assert.deepEqual(errors,[]);await context.close();console.log('PASS V2 authenticated fetch bypasses reused cache');
    }
    {
      const {page,context,errors}=await open('libro/',1366,'owner','no-preference');
      await page.locator('.chapter-card').first().click();await page.locator('#next-page').click();
      await page.locator('#back-chapters').click();await page.locator('.chapter-card').nth(1).click();
      await page.waitForTimeout(600);
      assert.match(await page.locator('.book-spread').innerText(),/Benvenuto al mondo/);
      assert.equal(await page.locator('#page-count').innerText(),'Pagine 1–2 di 2');
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>document.querySelectorAll('.book-leaf').length===1);
      assert.deepEqual(errors,[]);await context.close();console.log('PASS V2 animation cancellation, chapter switch, responsive resize');
    }
    console.log('PASS V2 suite: 12 behavioral scenarios. Fixtures only; authenticated RLS is a separate live test.');
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
