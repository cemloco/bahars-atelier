const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const combos=[[0,1],[0,1,2],[0,1,2,3],[0,1,2,4,5],[6,2,3],[0,1,2,3,4,5,7,8]];
(async()=>{
 const {environment}=await import('./helpers.js');const cloud=await environment();
 const sync=await import('../functions/api/sync.js');const {sessionCookie}=await import('../server/auth.js');const cookie=(await sessionCookie(cloud.env.ATELIER_SESSION_SECRET)).split(';')[0];
 let lastSaved;
 const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/')&&req.headers['x-test-cloud']==='1'){
  if(req.url==='/api/session'){res.setHeader('Content-Type','application/json');res.end('{"authenticated":true}');return;}
  if(req.url==='/api/sync'){const chunks=[];for await(const c of req)chunks.push(c);const request=new Request('http://localhost:8124/api/sync',{method:req.method,headers:{Cookie:cookie,Origin:'http://localhost:8124'},body:req.method==='POST'?Buffer.concat(chunks):undefined});const response=await (req.method==='POST'?sync.onRequestPost:sync.onRequestGet)({request,env:cloud.env});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 }if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"authenticated":false}');return;}const file=path.resolve('.',req.url==='/'?'index.html':req.url.split('?')[0].slice(1));if(!file.startsWith(process.cwd()+'/'))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'image/png');res.end(await fs.readFile(file));}catch(e){res.writeHead(404);res.end(e.message)}});await new Promise(r=>server.listen(8124,r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const [index,combo] of combos.entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8124');await page.waitForFunction(()=>window.atelierCloud);
  if(await page.locator('#daily-hello').isVisible())await page.locator('#daily-hello-accept').click();
  const original=await page.evaluate(async()=>{
   const defs=[['Oberteile','Pullover',1.15],['Hosen & Röcke','Stoffhosen',.48],['Schuhe','Sneaker',1.5],['Taschen','Handtaschen',.8],['Accessoires','Gürtel',4],['Accessoires','Uhren',.5],['Kleider','Midikleider',.45],['Accessoires','Sonnenbrillen',2],['Accessoires','Schmuck',.7]];
   const garments=defs.map(([category,subcategory,aspect],i)=>{const c=document.createElement('canvas');c.width=500;c.height=600;const ctx=c.getContext('2d');const w=Math.min(300,350*aspect),h=w/aspect;ctx.fillStyle=['#a48e76','#444d5c','#d6bca2','#715442','#785b37','#b1a17d','#657561','#383e40','#c6ab61'][i];const x=100,y=100;
    // Small synthetic alpha fixtures are test-only, never part of the real wardrobe.
    if(i===0){ctx.beginPath();for(const [a,b] of [[.25,0],[.4,.08],[.6,.08],[.75,0],[1,.28],[.8,.5],[.75,.35],[.75,1],[.25,1],[.25,.35],[.2,.5],[0,.28]])ctx.lineTo(x+a*w,y+b*h);ctx.closePath();ctx.fill();}
    else if(i===1){ctx.beginPath();for(const [a,b] of [[0,0],[1,0],[.95,1],[.55,1],[.5,.35],[.45,1],[.05,1]])ctx.lineTo(x+a*w,y+b*h);ctx.closePath();ctx.fill();}
    else if(i===6){ctx.beginPath();for(const [a,b] of [[.3,0],[.7,0],[.6,.45],[1,1],[0,1],[.4,.45]])ctx.lineTo(x+a*w,y+b*h);ctx.closePath();ctx.fill();}
    else {ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();}
    return {id:'g'+i,name:subcategory,category,subcategory,image:c.toDataURL(),created:1,updated:1};});
   const db=await new Promise(r=>{const q=indexedDB.open('BaharsAtelier_v1',1);q.onsuccess=()=>r(q.result)});const legacy={id:'legacy',name:'Original-Look',mode:'collage',theme:'rose',layers:[{id:'old-layer',gid:'g0',x:30,y:35,w:40,angle:5}],realPhoto:garments[0].image,preview:garments[0].image,created:1,updated:1};const plan={id:'plan',lookId:'legacy',date:'2026-11-12'};
   await new Promise((r,j)=>{const tx=db.transaction(['garments','looks','plans'],'readwrite');garments.forEach(g=>tx.objectStore('garments').put(g));tx.objectStore('looks').put(legacy);tx.objectStore('plans').put(plan);tx.oncomplete=r;tx.onerror=j});db.close();window.dispatchEvent(new Event('atelier-cloud-updated'));return {garments,legacy,plan};
  });
  await page.waitForFunction(()=>document.querySelectorAll('#piece-strip .piece').length===9);
  for(const k of combo){if(await page.locator('#focus-editor').isVisible())await page.locator('#focus-open-picker').click();else await page.locator('#open-piece-picker').click();await page.locator(`[data-picker-add="g${k}"]`).click();}
  assert.equal(await page.locator('.outfit-layer').count(),combo.length);
  await page.locator('#mode-editorial').click();await page.waitForFunction(()=>document.querySelector('#layout-status').textContent.includes('Variante'));
  const first=await page.locator('.outfit-layer').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('style')));
  await page.locator('#auto-arrange').click();await page.waitForFunction(()=>document.querySelector('#layout-status').textContent.includes('Variante 2'));
  assert.notDeepEqual(await page.locator('.outfit-layer').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('style'))),first);
  const boxes=await page.locator('.outfit-layer').evaluateAll(nodes=>{const board=document.querySelector('#studio-board').getBoundingClientRect();return nodes.map(n=>{const b=n.getBoundingClientRect();if(b.left<board.left||b.top<board.top||b.right>board.right||b.bottom>board.bottom)throw Error('clipped');return {width:b.width,height:b.height};});});assert.equal(boxes.length,combo.length);
  // Finger drag through Chromium's native input path (same Touch Event handlers used on Safari).
  const layer=page.locator('.outfit-layer').first();let bounds=await layer.boundingBox();const cdp=await context.newCDPSession(page),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  const before=await layer.getAttribute('style');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+9,y:y+8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);assert.notEqual(await layer.getAttribute('style'),before);
  if(index===0){const b=await layer.boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;const old=await layer.evaluate(n=>n.style.width);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-10,y:cy},{x:cx+10,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-15,y:cy-3},{x:cx+15,y:cy+3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await layer.evaluate(n=>n.style.width),old);}
  const sizeBefore=await layer.evaluate(n=>n.style.width);await page.locator('#focus-bigger').click();assert.notEqual(await layer.evaluate(n=>n.style.width),sizeBefore);const rotationBefore=await layer.evaluate(n=>n.style.transform);await page.locator('#focus-right').click();assert.notEqual(await layer.evaluate(n=>n.style.transform),rotationBefore);
  // Reapply removes the manual overlap and makes a clean export again.
  await page.locator('#auto-arrange').click();await page.waitForFunction(()=>document.querySelector('#layout-status').textContent.includes('Variante 3'));
  assert.equal(await page.locator('.outfit-layer').count(),combo.length);
  await page.screenshot({path:`work/editorial-${index+1}-mobile.png`});
  const downloadPromise=page.waitForEvent('download');await page.locator('#focus-export').click();const download=await downloadPromise;await download.saveAs(`work/editorial-${index+1}.png`);
  const exported=await page.evaluate(async()=>{const layers=[...document.querySelectorAll('.outfit-layer')];return layers.length;});assert.equal(exported,combo.length);
  const imageDimensions=await page.evaluate(async(data)=>{const i=new Image();await new Promise(r=>{i.onload=r;i.src=data});const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return {w:i.width,h:i.height,pixel:[...ctx.getImageData(5,5,1,1).data]};},'data:image/png;base64,'+(await fs.readFile(`work/editorial-${index+1}.png`)).toString('base64'));assert.deepEqual(imageDimensions,{w:1800,h:2160,pixel:[242,235,223,255]});
  await page.locator('#focus-save').click();await page.locator('#look-name').fill('Editorial '+index);await page.locator('#look-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#look-modal').hidden);
  const saved=await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('BaharsAtelier_v1',1);q.onsuccess=()=>r(q.result)});const all=await Promise.all(['garments','looks','plans'].map(k=>new Promise(r=>{const q=db.transaction(k).objectStore(k).getAll();q.onsuccess=()=>r(q.result)})));db.close();return {garments:all[0],looks:all[1],plans:all[2]};});
  assert.deepEqual(saved.garments,original.garments);assert.deepEqual(saved.looks.find(l=>l.id==='legacy'),original.legacy);assert.deepEqual(saved.plans,[original.plan]);lastSaved=saved;const look=saved.looks.find(l=>l.mode==='editorial');assert.equal(look.layers.length,combo.length);assert.ok(look.layers.every(l=>l.crop));
  await page.reload();await page.locator('[data-view="looks"]').click();await page.locator(`[data-open-look="${look.id}"]`).click();assert.equal(await page.locator('#mode-editorial').getAttribute('aria-pressed'),'true');const restored=await page.locator('.outfit-layer').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.layer,x:parseFloat(n.style.left),y:parseFloat(n.style.top),w:parseFloat(n.style.width)})));for(const [i,l] of restored.entries()){assert.ok(Math.abs(l.x-look.layers[i].x)<.001);assert.ok(Math.abs(l.y-look.layers[i].y)<.001);assert.ok(Math.abs(l.w-look.layers[i].w)<.001);}
  await page.locator('#mode-collage').click();assert.equal(await page.locator('.outfit-layer').count(),combo.length);await page.locator('#mode-figure').click();assert.equal(await page.locator('.outfit-layer').count(),combo.length);assert.ok(await page.locator('#silhouette').isVisible());
  await page.locator('#mode-editorial').click();await page.waitForFunction(()=>!document.querySelector('#auto-arrange').disabled);await page.locator('#launch-editor').click();await page.locator('.outfit-layer').first().tap();await page.locator('.outfit-layer.selected .layer-delete-handle').click();assert.equal(await page.locator('.outfit-layer').count(),combo.length-1);await page.locator('#focus-open-picker').click();await page.locator(`[data-picker-add="g${combo[0]}"]`).click();await page.waitForFunction(()=>!document.querySelector('#auto-arrange').disabled);assert.equal(await page.locator('.outfit-layer').count(),combo.length);
  await page.locator('#focus-save').click();await page.locator('#look-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#look-modal').hidden);
  const copyCheck=await page.evaluate(async()=>{const d=await new Promise(r=>{const q=indexedDB.open('BaharsAtelier_v1',1);q.onsuccess=()=>r(q.result)});const data=await new Promise(r=>{const q=d.transaction('looks').objectStore('looks').getAll();q.onsuccess=()=>r(q.result)});d.close();return data});assert.equal(copyCheck.length,3);assert.deepEqual(copyCheck.find(l=>l.id===look.id),look);

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(`Combination ${index+1}: mobile, touch drag, resize, rotation, variants, save/reopen, legacy data and 1800×2160 export passed`);await context.close();
 }
 // Exercise the unchanged browser sync client and endpoint on two fresh devices, with an isolated SQLite/KV fixture.
 for(const type of ['garments','looks','plans'])for(const record of lastSaved[type]){const response=await sync.onRequestPost({env:cloud.env,request:cloud.req('sync',{method:'POST',body:JSON.stringify({type,action:'upsert',id:record.id,record})})});assert.equal(response.status,200);}
 const expected=lastSaved.looks.find(l=>l.mode==='editorial');
 for(let device=1;device<=2;device++){
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Test-Cloud':'1'}});const page=await context.newPage();await page.goto('http://localhost:8124');await page.waitForFunction(()=>document.querySelector('#ba-cloud-status')?.textContent.includes('Cloud verbunden'));
  if(await page.locator('#daily-hello').isVisible())await page.locator('#daily-hello-accept').click();await page.locator('[data-view="looks"]').click();await page.locator(`[data-open-look="${expected.id}"]`).click();assert.equal(await page.locator('.outfit-layer').count(),8);assert.equal(await page.locator('#mode-editorial').getAttribute('aria-pressed'),'true');
  const widths=await page.locator('.outfit-layer').evaluateAll(nodes=>nodes.map(n=>parseFloat(n.style.width)));widths.forEach((w,i)=>assert.ok(Math.abs(w-expected.layers[i].w)<.001));await context.close();
 }
 console.log('Two isolated mobile devices: cloud hydration restores the exact editorial composition');
 }finally{await browser.close();await new Promise(r=>server.close(r));cloud.db.close();}
})().catch(e=>{console.error(e);process.exit(1)});
