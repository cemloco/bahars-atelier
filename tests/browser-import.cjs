const {chromium}=require('playwright');
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const {environment,fixture}=await import('./helpers.js');const e=await environment();
 const {onRequestGet,onRequestPost}=await import('../functions/api/import.js');
 const {sessionCookie}=await import('../server/auth.js');const cookie=(await sessionCookie(e.env.ATELIER_SESSION_SECRET)).split(';')[0];
 let fail=false,posts=0,syncCalls=0;
 const server=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/import')){
   let chunks=[];for await(const c of req)chunks.push(c);const method=req.method;
   if(method==='POST'){posts++;if(fail){fail=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Test-Unterbrechung'}));return;}}
   const request=new Request('http://localhost:8123'+req.url,{method,headers:{Cookie:cookie,Origin:'http://localhost:8123'},body:method==='POST'?Buffer.concat(chunks):undefined});
   const result=await(method==='POST'?onRequestPost:onRequestGet)({request,env:e.env});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
  }
  if(req.url==='/api/session'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"authenticated":true}');return;}
  if(req.url==='/api/sync'){syncCalls++;res.writeHead(200,{'Content-Type':'application/json'});res.end('{"garments":[],"looks":[],"plans":[],"deleted":[]}');return;}
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(await fs.readFile('index.html'));return;}
  const file=path.resolve('.',req.url.split('?')[0].slice(1));if(!file.startsWith(process.cwd()+'/'))throw Error('path');const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':'text/plain'});res.end(content);
 }catch(err){res.writeHead(500);res.end(err.message)}});await new Promise(r=>server.listen(8123,r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8123');await page.waitForFunction(()=>window.atelierBackupOpen && window.atelierCloud?.authenticated());
 await page.waitForFunction(()=>document.getElementById('ba-cloud-status').textContent.includes('Cloud verbunden'));
 await page.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('BaharsAtelier_v1',1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});await new Promise((r,j)=>{const tx=db.transaction('garments','readwrite');tx.objectStore('garments').put({id:'local-original',name:'Original',image:'original-unchanged'});tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()});
 if(await page.locator('#daily-hello').isVisible())await page.locator('#daily-hello-accept').click();
 await page.locator('#ba-cloud-toggle').click();await page.locator('#ba-backup-open').click();
 const fixtureData=fixture();fixtureData.garments[0].image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=1100;const ctx=c.getContext('2d'),d=ctx.createImageData(1100,1100);for(let i=0;i<d.data.length;i+=4){d.data[i]=(i*13)%255;d.data[i+1]=Math.random()*255;d.data[i+2]=Math.random()*255;d.data[i+3]=180;}ctx.putImageData(d,0,0);return c.toDataURL('image/png')});
 await page.locator('dialog input[type=file]').setInputFiles({name:'backup-53.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixtureData))});
 await page.waitForFunction(()=>document.querySelector('.upload').disabled===false);
 const preview=await page.locator('dialog [role=status]').innerText();if(!preview.includes('53 Kleidungsstücke')||!preview.includes('1 Bilder komprimiert'))throw Error(preview);if(posts)throw Error('Wrote before preview confirmation');
 fail=true;await page.locator('.upload').click();await page.waitForFunction(()=>document.querySelector('dialog [role=status]').textContent.includes('Test-Unterbrechung'));
 await page.locator('.upload').click();await page.waitForFunction(()=>document.querySelector('dialog [role=status]').textContent.includes('Abgeschlossen'),{timeout:30000});
 const result=await page.locator('dialog [role=status]').innerText();if(!result.includes('53 Kleidungsstücke'))throw Error(result);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await page.screenshot({path:'work/import-mobile.png',fullPage:true});
 const original=await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('BaharsAtelier_v1',1);q.onsuccess=()=>r(q.result)});const data=await new Promise(r=>{const q=db.transaction('garments').objectStore('garments').getAll();q.onsuccess=()=>r(q.result)});db.close();return data});
 if(original.length!==1||original[0].image!=='original-unchanged')throw Error('Local original changed');
 const beforeReload=syncCalls;await page.reload();await page.waitForFunction(()=>document.getElementById('ba-cloud-status')?.textContent.includes('pausiert'));
 if(syncCalls!==beforeReload)throw Error('Auto sync resumed during interrupted import');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({preview,result,posts,errors}));await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
