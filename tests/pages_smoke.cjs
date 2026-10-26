// Run with Node.js and Playwright on NODE_PATH. All Supabase calls use fixtures.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const missing = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/mattia/')) {res.writeHead(404).end(); return;}
  let file = path.resolve(root, '.' + url.pathname.slice('/mattia'.length));
  if (file !== root && !file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {missing.push(url.pathname); res.writeHead(404).end(); return;}
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
function mock({role=null, signedIn=false, born=false, unavailable=false, boardError=false}) {
  window.testCalls = [];
  window.testWrites = [];
  window.testDownloads = [];
  const chapters = [{id:1,title:'Prima di te',slug:'prima-di-te',subtitle:'Attesa',introduction:'Una storia',visible:true},
    ...(role==='owner' ? [{id:2,title:'Benvenuto al mondo',slug:'benvenuto',visible:false}] : [])];
  const rows = {
    info: born ? {id:1,nascita_data:'2026-10-26',nascita_ora:'10:00',peso:3250,lunghezza:50} : {id:1},
    bets:[{id:1,nome:'Test previsione',data:'2026-10-26',ora:'10:00',peso:3250,lunghezza:50,created_at:'2026-10-26'}],
    messages:[{nome:'Test nonna',testo:null,foto:null,canzone:'Canzone di prova',created_at:'2026-10-26'}],
    guestbook_private:[
      {nome:'Test nonna',testo:'Dedica privata <script>non eseguire</script>',canzone:'Canzone di prova',created_at:'2026-10-26',foto:'https://example.supabase.co/storage/v1/object/public/foto/folder/prova%20foto.jpg'},
      {nome:'Foto non valida',testo:'Testo sempre leggibile',created_at:'2026-10-26',foto:'https://foreign.example/storage/v1/object/public/foto/secret.jpg'}
    ],
    album_chapters:chapters,
    album_memories:[{id:'m1',chapter_id:1,title:'Ricordo di prova',body:'Testo di prova',memory_date:'2026-10-26',created_by:'u1'}],
    album_media:[], album_access:[{email:'owner@example.test',role:'owner',display_name:'Test',active:true}]
  };
  window.supabase = {createClient:()=>({
    auth:{getSession:async()=>({data:{session:signedIn?{}:null}}),
      getUser:async()=>({data:{user:signedIn?{id:'u1',email:'owner@example.test'}:null}}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>{signedIn=false;return {error:null}}},
    rpc:async()=>({data:role,error:unavailable?{message:'Missing migration'}:null}),
    from:table=>{
      window.testCalls.push(table);
      let result = {data:rows[table]??[],error:table==='guestbook_private' && boardError ? {message:'Unavailable'} : null};
      const q = {select(){return q},eq(){return q},order(){return q},
        insert(row){window.testWrites.push({table,row});result={data:{id:'m2',...row},error:null};return q},
        maybeSingle(){return Promise.resolve(result)},
        single(){return Promise.resolve({...result,data:Array.isArray(result.data)?result.data[0]:result.data})},
        then(a,b){return Promise.resolve(result).then(a,b)}};
      return q;
    },storage:{from:bucket=>({
      download:async path=>{window.testDownloads.push({bucket,path});return {data:new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'})}},
      upload:async(path,blob)=>{window.testWrites.push({bucket,path,size:blob.size});return {error:null}},
      getPublicUrl:path=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/foto/'+path}})
    })}
  })};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/mattia/`;
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
    for (const width of [1366,390]) {
      for (const scenario of [
        {name:'public-before',route:'',born:false},
        {name:'public-after',route:'',born:true},
        {name:'anonymous',route:'libro/'},
        {name:'uninvited',route:'libro/',signedIn:true},
        {name:'viewer',route:'libro/',signedIn:true,role:'viewer'},
        {name:'owner',route:'libro/',signedIn:true,role:'owner'},
        {name:'viewer-admin',route:'libro/admin/',signedIn:true,role:'viewer'},
        {name:'contributor-admin',route:'libro/admin/',signedIn:true,role:'contributor'},
        {name:'owner-admin',route:'libro/admin/',signedIn:true,role:'owner'},
        {name:'owner-board-error',route:'libro/admin/',signedIn:true,role:'owner',boardError:true},
        {name:'anonymous-admin',route:'libro/admin/'},
        {name:'missing-migration',route:'libro/',signedIn:true,unavailable:true}
      ]) {
        const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
        await context.route('https://**/*', route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
        await context.addInitScript(mock,scenario);
        await context.addInitScript(()=>{window.MATTIA_CONFIG={url:'https://example.supabase.co',anonKey:'test'};});
        await context.route('**/libro/assets/config.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
        const page = await context.newPage(); const errors=[];
        page.on('pageerror', e=>errors.push(e.message));
        await page.goto(base+scenario.route);
        if (!scenario.route) {
          await page.locator('#songs a').waitFor();
          assert.equal(await page.locator('#notes').count(),1);
          assert.equal(await page.locator('#notes').isVisible(),false);
          assert.match(await page.locator('#cl-body').innerText(),/Test previsione/);
          assert.match(await page.locator('#songs').innerText(),/Canzone di prova/);
          assert.equal(await page.locator('#toto').isVisible(),!scenario.born);
          if (scenario.born) assert.equal(await page.locator('#hero-title').innerText(),'Benvenuto, Mattia');
          else {
            await page.locator('#bet-btn').click();
            assert.equal(await page.locator('#bet-err').innerText(),'Scrivi il tuo nome.');
            await page.locator('#bet-name').fill('Prova scommessa');
            await page.locator('#bet-date').fill('2026-10-28');
            await page.locator('#bet-time').fill('10:00');
            await page.locator('#bet-weight').fill('3250');
            await page.locator('#bet-length').fill('50');
            await page.locator('#bet-btn').click();
            await page.waitForFunction(()=>document.querySelector('#bet-ok').textContent.includes('Scommessa registrata'));
            assert.equal((await page.evaluate(()=>window.testWrites)).some(x=>x.table==='bets' && x.row.nome==='Prova scommessa'),true);
          }
          await page.locator('#msg-btn').click();
          assert.equal(await page.locator('#msg-err').innerText(),'Scrivi il tuo nome.');
          await page.locator('#msg-name').fill('Prova invio');
          await page.locator('#msg-text').fill('Dedica privata di prova');
          await page.locator('#msg-song').fill('Canzone nuova');
          await page.locator('#msg-photo').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=','base64')});
          await page.locator('#msg-prev').waitFor();
          await page.locator('#msg-btn').click();
          await page.waitForFunction(()=>document.querySelector('#msg-ok').textContent.includes('Messaggio lasciato'));
          const writes=await page.evaluate(()=>window.testWrites);
          assert.equal(writes.some(x=>x.bucket==='foto' && x.size>0),true);
          assert.equal(writes.some(x=>x.table==='messages' && x.row.testo==='Dedica privata di prova' && x.row.foto.includes('/foto/')),true);
          assert.match(await page.locator('#songs a').getAttribute('href'),/^https:\/\/open.spotify.com\/search\//);
          await page.getByRole('link',{name:'Apri il libro privato'}).click();
          assert.equal(page.url(),base+'libro/');
        } else if (!scenario.signedIn || scenario.unavailable) {
          await page.locator('#gate').waitFor();
          assert.equal(await page.locator('#private-content').isVisible(),false);
          assert.deepEqual(await page.evaluate(()=>window.testCalls),[]);
          if (scenario.unavailable) assert.match(await page.locator('#auth-message').innerText(),/Impossibile verificare/);
        } else if (!scenario.role || scenario.name==='viewer-admin') {
          await page.locator('#denied').waitFor();
          assert.equal(await page.locator('#private-content').isVisible(),false);
          assert.deepEqual(await page.evaluate(()=>window.testCalls),[]);
        } else if (scenario.route==='libro/') {
          await page.locator('.chapter-card').first().waitFor();
          assert.equal(await page.locator('#admin-link').isVisible(),scenario.role==='owner');
          await page.locator('.chapter-card').first().click();
          assert.match(await page.locator('#memories-list').innerText(),/Ricordo di prova/);
          if (scenario.role==='owner') {
            await page.locator('#admin-link').click();
            assert.equal(page.url(),base+'libro/admin/');
            await page.locator('.manage-item').first().waitFor();
            assert.equal(await page.evaluate(()=>window.Mattia.bookBase.href),base+'libro/');
          }
        } else {
          await page.locator('.manage-item').first().waitFor();
          assert.equal(await page.locator('#owner-only').isVisible(),scenario.role==='owner');
          assert.equal((await page.evaluate(()=>window.testCalls)).includes('album_access'),scenario.role==='owner');
          if (scenario.role==='owner') {
            if (scenario.boardError) await page.waitForFunction(()=>document.querySelector('#private-board-status').classList.contains('error'));
            else {
              await page.locator('#private-board-list img').waitFor();
              assert.match(await page.locator('#private-board-list').innerText(),/Dedica privata <script>non eseguire<\/script>/);
              assert.equal(await page.locator('#private-board-list script').count(),0);
              assert.match(await page.locator('#private-board-list img').getAttribute('src'),/^blob:/);
              assert.deepEqual(await page.evaluate(()=>window.testDownloads),[{bucket:'foto',path:'folder/prova foto.jpg'}]);
            }
            assert.equal(await page.locator('#private-board').isVisible(),true);
          } else assert.equal(await page.locator('#private-board').isVisible(),false);
          await page.locator('#memory-title').fill('Nuovo ricordo');
          await page.locator('#memory-body').fill('Test album');
          await page.locator('#memory-submit').click();
          await page.waitForFunction(()=>document.querySelector('#memory-status').textContent.includes('Ricordo salvato'));
          assert.equal((await page.evaluate(()=>window.testWrites)).some(x=>x.table==='album_memories'),true);
        }
        const canReadBoard = scenario.role==='owner' && page.url().endsWith('/libro/admin/');
        assert.equal((await page.evaluate(()=>window.testCalls)).includes('guestbook_private'),canReadBoard);
        if (!canReadBoard) assert.deepEqual(await page.evaluate(()=>window.testDownloads),[]);
        if (canReadBoard) {
          await page.locator('#logout-button').click();
          assert.equal(await page.locator('#private-board').isVisible(),false);
          assert.equal(await page.locator('#private-board-list').textContent(),'');
        }
        const overflowing = await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2 && getComputedStyle(el).position!=='fixed').map(el=>({tag:el.tagName,id:el.id,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,12));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'overflow '+scenario.name+' '+JSON.stringify(overflowing));
        // Resolve all local anchors/assets against the /mattia/ project prefix.
        const links=await page.locator('[href],[src]').evaluateAll(els=>els.flatMap(el=>{
          const raw=el.getAttribute('href')||el.getAttribute('src');
          return raw && !raw.startsWith('#') ? [new URL(raw,location.href).href] : [];
        }));
        for (const url of new Set(links.filter(u=>u.startsWith(base)))) {
          const response=await context.request.get(url);
          assert.equal(response.status(),200,url);
        }
        assert.deepEqual(errors,[],scenario.name);
        console.log(`PASS ${width}px ${scenario.name}`);
        await context.close();
      }
    }
    assert.deepEqual(missing,[]);
    console.log('PASS: 24 browser scenarios, private board/download/logout, public submissions, album writes and Pages paths; no real database requests.');
  } finally {if(browser) await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
