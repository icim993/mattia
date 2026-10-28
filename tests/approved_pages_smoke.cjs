// Approved page behavior and private upload contract tests; synthetic pixels only.
(async function approvedPagesSmoke() {
  const assert=require('node:assert/strict');
  const {chromium}=require('playwright');
  const {server,mock}=require('./pages_smoke.cjs');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFUlEQVR4nGP8+uH5fwYkwMSABjAEALi3A9FMXDS3AAAAAElFTkSuQmCC','base64');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/mattia/';
  let browser;
  async function open(route,width,role='owner',approved=false){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await context.route('**/libro/assets/config.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    const init=`
      (${mock.toString()})(${JSON.stringify({role,signedIn:!!role,v2:true})});
      window.MATTIA_CONFIG={url:'https://example.supabase.co',anonKey:'test'};
      ${approved ? `
        window.testRows.album_memories=[
          {id:'a1',chapter_id:1,title:'Il primo segno',memory_date:'2026-03-09',page_order:1},
          {id:'a2',chapter_id:1,title:'La scelta del nome',memory_date:'2026-03-20',page_order:2},
          {id:'a3',chapter_id:1,title:'La prima volta che ti abbiamo visto',memory_date:'2026-03-26',page_order:3}
        ];
        window.testRows.album_media=window.testRows.album_memories.map((m,i)=>({
          id:'approved'+(i+1),memory_id:m.id,media_kind:'image',storage_path:'u1/'+m.id+'/approved.png',
          layout:'full',caption:'',sort_order:0,photo_settings:{approved_spread:true,spread_width:1408,spread_height:1024}
        }));
      ` : ''}
    `;
    await context.addInitScript({content:init});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+route);
    return {page,context,errors};
  }
  try {
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    for(const width of [1366,390,320]) {
      const {page,context,errors}=await open('libro/',width,'viewer',true);
      await page.locator('.chapter-card').first().click();
      await page.locator('.book-approved-image').first().waitFor();
      await page.waitForFunction(()=>document.querySelector('.book-approved-image')?.naturalWidth>0);
      assert.equal(await page.locator('.book-leaf--approved').count(),2);
      assert.match(await page.locator('#page-count').innerText(),/Tavola 1 di 3/);
      const actualAspect=await page.locator('.book-spread').evaluate(e=>{const r=e.getBoundingClientRect();return r.width/r.height;});
      assert.ok(Math.abs(actualAspect-1408/1024)<0.09,`aspect ${actualAspect}`);
      const firstHalf=await page.locator('.book-approved-image').first().evaluate(img=>img.getBoundingClientRect().width/img.parentElement.getBoundingClientRect().width);
      assert.ok(firstHalf>1.9&&firstHalf<2.1);
      await page.locator('#next-page').click();
      await page.waitForFunction(()=>document.querySelector('#page-count')?.textContent==='Tavola 2 di 3');
      assert.equal(await page.locator('.book-leaf--approved-left').count(),1);
      assert.equal(await page.locator('.book-leaf--approved-right').count(),1);
      const rightOffset=await page.locator('.book-leaf--approved-right .book-approved-image').evaluate(img=>img.getBoundingClientRect().left-img.parentElement.getBoundingClientRect().left);
      assert.ok(rightOffset < -20,'second leaf must display the right half');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
      assert.deepEqual(errors,[]);await context.close();
      console.log('PASS approved book '+width+'px');
    }
    const {page,context,errors}=await open('libro/admin/',390,'owner',false);
    await page.locator('#approved-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#admin-tab-pagine').getAttribute('aria-pressed'),'true');
    await page.locator('#approved-chapter option').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#approved-chapter').inputValue(),'1');
    const uploads=['01_Il_primo_segno.png','02_La_scelta_del_nome.png','03_La_prima_volta_che_ti_abbiamo_visto.png'].map(name=>({name,mimeType:'image/png',buffer:png}));
    await page.locator('#approved-files').setInputFiles(uploads);
    assert.equal(await page.locator('.approved-draft-item').count(),3);
    assert.deepEqual(await page.locator('[data-approved-order]').evaluateAll(inputs=>inputs.map(x=>x.value)),['1','2','3']);
    await page.locator('#approved-submit').click();
    await page.waitForFunction(()=>{const e=document.querySelector('#approved-status');return e&&(e.textContent.includes('3 tavole pubblicate')||e.classList.contains('error'));},null,{timeout:12000});
    const uploadStatus=await page.locator('#approved-status').innerText();
    assert.match(uploadStatus,/3 tavole pubblicate/,JSON.stringify({status:uploadStatus,writes:await page.evaluate(()=>window.testWrites)}));
    const writes=await page.evaluate(()=>window.testWrites);
    assert.equal(writes.filter(w=>w.bucket==='mattia-album').length,3);
    assert.equal(writes.filter(w=>w.table==='album_memories').length,1);
    assert.equal(writes.filter(w=>w.table==='album_media').length,1);
    const memories=writes.find(w=>w.table==='album_memories').row;
    const media=writes.find(w=>w.table==='album_media').row;
    assert.deepEqual(memories.map(x=>x.page_order),[1,2,3]);
    assert.ok(media.every(x=>x.photo_settings.approved_spread && x.mime_type==='image/png'));
    assert.ok(media.every(x=>x.storage_path.startsWith('u1/')));
    assert.ok(media.every(x=>x.photo_settings.spread_width===4));
    await page.locator('#logout-button').click();
    assert.equal(await page.locator('#approved-panel').isVisible(),false);
    assert.equal(await page.locator('.approved-draft-item').count(),0);
    assert.deepEqual(errors,[]);await context.close();
    for(const role of ['viewer','contributor',null]){
      const {page:p,context:c,errors:ee}=await open('libro/admin/',390,role);
      await p.waitForFunction(()=>window.Mattia && document.getElementById('owner-only'));
      assert.equal(await p.locator('#approved-panel').isVisible(),false);
      assert.deepEqual(ee,[]);await c.close();
    }
    console.log('PASS approved uploader original PNG, order, private Storage, logout, roles');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
