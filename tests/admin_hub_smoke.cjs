// Management hub regression checks — anonymous/mock roles only, no private data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {server,mock}=require('./pages_smoke.cjs');
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/mattia/';
  let browser;
  async function open(role,width){
    const context=await browser.newContext({viewport:{width,height:840},reducedMotion:'reduce'});
    await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await context.route('**/libro/assets/config.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await context.addInitScript({content:`(${mock.toString()})(${JSON.stringify({role,signedIn:!!role,v2:true})});window.MATTIA_CONFIG={url:'https://example.supabase.co',anonKey:'test'};`});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'libro/admin/');
    return {page,context,errors};
  }
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    for(const width of [1366,390,320]){
      const {page,context,errors}=await open('owner',width);
      await page.locator('#approved-panel').waitFor({state:'visible'});
      await page.locator('#admin-hub').waitFor({state:'visible'});
      assert.equal(await page.locator('#admin-hub-tab-does-not-exist').count(),0);
      assert.equal(await page.locator('.admin-hub-tab:visible').count(),5);
      assert.equal(await page.locator('.admin-hub-tab--selected').count(),1);
      assert.equal(await page.locator('#admin-tab-pagine').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#photo-studio').isVisible(),false);
      assert.equal(await page.locator('#private-board').isVisible(),false);
      await page.locator('#admin-tab-ricordi').click();
      assert.equal(await page.locator('#memory-form').isVisible(),true);
      assert.equal(await page.locator('#admin-memory-list').isVisible(),true);
      assert.equal(await page.locator('#approved-panel').isVisible(),false);
      await page.locator('#admin-tab-foto').click();
      await page.locator('#photo-studio').waitFor({state:'visible'});
      assert.equal(await page.locator('#memory-form').isVisible(),false);
      await page.locator('#admin-tab-famiglia').click();
      assert.equal(await page.locator('#invite-form').isVisible(),true);
      assert.equal(await page.locator('#chapter-visibility-list').isVisible(),true);
      assert.equal(await page.locator('#private-board').isVisible(),false);
      await page.locator('#admin-tab-dediche').click();
      assert.equal(await page.locator('#private-board').isVisible(),true);
      assert.equal(await page.locator('#invite-form').isVisible(),false);
      assert.equal(await page.locator('#admin-hub-title').innerText(),'Dediche private');
      await page.locator('#admin-tab-pagine').click();
      assert.equal(await page.locator('#approved-panel').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
      await page.locator('#logout-button').click();
      assert.equal(await page.locator('#admin-hub').isVisible(),false);
      assert.equal(await page.locator('#approved-panel').isVisible(),false);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('PASS admin hub '+width+'px: distinct sections, owner-only, logout, no overflow');
    }
    for(const role of ['contributor',null,'viewer']){
      const {page,context,errors}=await open(role,390);
      if(role==='contributor'){
        await page.locator('#admin-hub').waitFor({state:'visible'});
        assert.equal(await page.locator('.admin-hub-tab:visible').count(),1);
        assert.equal(await page.locator('#admin-tab-ricordi').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('#memory-form').isVisible(),true);
        assert.equal(await page.locator('#admin-tab-pagine').isVisible(),false);
        assert.equal(await page.locator('#approved-panel').isVisible(),false);
        assert.equal(await page.locator('#private-board').isVisible(),false);
      }else{
        await page.locator('#gate').waitFor({state:role===null?'visible':'hidden'}).catch(()=>{});
        assert.equal(await page.locator('#admin-hub').isVisible(),false);
        assert.equal(await page.locator('#private-content').isVisible(),false);
      }
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('PASS admin role '+(role||'anonymous'));
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
