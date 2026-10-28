/* Simulated phone browser tests: private approved spreads without real photos. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {server,mock}=require('./pages_smoke.cjs');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/mattia/';
 let browser;
 async function open(kind='fallback'){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
   await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
   await context.route('**/libro/assets/config.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
   const fakeNative=kind==='native'?\`
     window.testOrientation={requests:0,locks:[],unlocks:0};
     Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
     Object.defineProperty(document,'fullscreenElement',{configurable:true,get(){return window.testFullscreenElement||null;}});
     Element.prototype.requestFullscreen=async function(){
       window.testOrientation.requests++;
       window.testFullscreenElement=this;
       document.dispatchEvent(new Event('fullscreenchange'));
     };
     document.exitFullscreen=async function(){
       window.testFullscreenElement=null;
       document.dispatchEvent(new Event('fullscreenchange'));
     };
     if(screen.orientation){
       Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async (kind)=>{window.testOrientation.locks.push(kind);}});
       Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>{window.testOrientation.unlocks++;}});
     }
   \`: \`Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});\`;
   const setup=\`(${mock.toString()})({role:'viewer',signedIn:true,v2:true});
     window.MATTIA_CONFIG={url:'https://example.supabase.co',anonKey:'test'};
     window.testRows.album_memories=[
       {id:'a1',chapter_id:1,title:'Il primo segno',page_order:1,memory_date:'2026-03-09'},
       {id:'a2',chapter_id:1,title:'La scelta del nome',page_order:2,memory_date:'2026-03-15'}
     ];
     window.testRows.album_media=window.testRows.album_memories.map(m=>({
       id:'photo'+m.id,memory_id:m.id,storage_path:'u1/'+m.id+'/page.png',
       media_kind:'image',sort_order:0,photo_settings:{approved_spread:true,spread_width:1448,spread_height:1086}
     }));
     ${fakeNative}\`;
   await context.addInitScript({content:setup});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'libro/');
   await page.locator('.chapter-card').first().click();
   await page.locator('#memory-section.reader-immersive').waitFor({state:'visible'});
   return {page,context,errors};
 }
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  {
   const {page,context,errors}=await open('fallback');
   assert.equal(await page.locator('#immersive-toolbar').isVisible(),true);
   assert.equal(await page.locator('#immersive-rotate').isVisible(),true);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#memory-section')).position),'fixed');
   await page.locator('#immersive-read-portrait').click();
   assert.equal(await page.locator('#immersive-rotate').isVisible(),false);
   await page.locator('.book-approved-image').first().waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('.book-approved-image')?.naturalWidth>0);
   assert.equal(await page.locator('.book-leaf--approved').count(),2);
   await page.locator('.book-approved-action').first().click();
   assert.equal(await page.locator('#immersive-media').isVisible(),true);
   await page.locator('#immersive-media-content img').waitFor({state:'visible'});
   assert.match(await page.locator('#immersive-media-content img').getAttribute('src'),/^blob:/);
   await page.locator('#immersive-media-close').click();
   assert.equal(await page.locator('#immersive-media').isVisible(),false);
   await page.setViewportSize({width:844,height:390});
   await page.waitForFunction(()=>{const el=document.querySelector('.book-spread');return el&&el.style.width&&el.style.height;});
   const bounds=await page.locator('.book-spread').boundingBox();
   assert.ok(bounds.width>180&&bounds.height>140);
   assert.ok(bounds.width<844&&bounds.height<390);
   assert.ok(Math.abs(bounds.width/bounds.height-1448/1086)<.06,'preserve original two-page aspect');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
   const old=await page.locator('#page-count').innerText();
   await page.locator('#next-page').click();
   await page.waitForFunction(value=>document.querySelector('#page-count')?.textContent!==value,old);
   assert.match(await page.locator('#page-count').innerText(),/Tavola 2/);
   await page.locator('#immersive-close').click();
   assert.equal(await page.locator('#memory-section.reader-immersive').count(),0);
   assert.equal(await page.locator('#memory-section').isVisible(),false);
   assert.equal(await page.locator('#chapters').isVisible(),true);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('PASS iPhone-style fallback: rotate prompt, 2-page fit, private zoom, exit');
  }
  {
   const {page,context,errors}=await open('native');
   await page.waitForFunction(()=>window.testOrientation?.locks?.length===1);
   const calls=await page.evaluate(()=>structuredClone(window.testOrientation));
   assert.equal(calls.requests,1);
   assert.deepEqual(calls.locks,['landscape']);
   assert.equal(await page.locator('#memory-section.reader-immersive').count(),1);
   await page.locator('#immersive-rotate-exit').click();
   assert.equal(await page.evaluate(()=>window.testOrientation.unlocks),1);
   assert.equal(await page.locator('#memory-section.reader-immersive').count(),0);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('PASS Android-style fullscreen + orientation lock, unlock on close');
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
