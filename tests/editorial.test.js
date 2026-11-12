import test from 'node:test';
import assert from 'node:assert/strict';
import '../editorial-layout.js';
import {environment} from './helpers.js';
import {onRequestGet,onRequestPost} from '../functions/api/sync.js';
const E=globalThis.AtelierEditorial;
const definitions=[['Oberteile','Pullover',1.15],['Hosen & Röcke','Stoffhosen',.48],['Schuhe','Sneaker',1.5],['Taschen','Handtaschen',.8],['Accessoires','Gürtel',4],['Accessoires','Uhren',.5],['Kleider','Midikleider',.45],['Accessoires','Sonnenbrillen',2],['Accessoires','Schmuck',.7]];
export const combinations=[[0,1],[0,1,2],[0,1,2,3],[0,1,2,4,5],[6,2,3],[0,1,2,3,4,5,7,8]];
function entries(indices){return indices.map((k,i)=>({layer:{id:'l'+i,gid:'g'+k,x:50,y:50,w:30,angle:0},garment:{category:definitions[k][0],subcategory:definitions[k][1]},crop:{x:.1,y:.2,w:.7,h:.6,aspect:definitions[k][2]}}));}
function check(result,items,variant=2){assert.equal(result.length,items.length);const boxes=result.map((l,i)=>E.box(l,items[i].crop.aspect));for(const [i,b] of boxes.entries()){assert.ok(E.inside(b),`clipped ${i}`);for(let j=0;j<i;j++){const pair=[E.role(items[i].garment),E.role(items[j].garment)];const allowed=!items[i].layer.locked&&!items[j].layer.locked&&((pair.includes('top')&&pair.some(k=>['pants','skirt'].includes(k)))||(variant===3&&pair.includes('bag')&&pair.some(k=>['top','pants','skirt','dress','jacket','shoes'].includes(k))));assert.ok(allowed?E.overlap(b,boxes[j])<=(variant===2?.08:.06):!E.intersects(b,boxes[j]),`excessive overlap ${i}/${j}`)};assert.equal(result[i].id,items[i].layer.id);assert.equal(result[i].gid,items[i].layer.gid);}}
for(const [i,combo] of combinations.entries())test(`Editorial combination ${i+1}: four deterministic, distinct compositions without clipping/excessive overlap`,()=>{const items=entries(combo),original=JSON.stringify(items),variants=[];for(let v=0;v<4;v++){const result=E.compose(items,v);check(result,items,v);assert.deepEqual(result,E.compose(items,v));variants.push(JSON.stringify(result));}assert.equal(new Set(variants).size,4);assert.equal(JSON.stringify(items),original);});
test('alpha margins, opaque images and empty image handling',()=>{const pixels=new Uint8ClampedArray(20*30*4);for(let y=8;y<25;y++)for(let x=4;x<12;x++)pixels[(y*20+x)*4+3]=1;assert.deepEqual(E.alphaBounds(pixels,20,30),{x:.2,y:8/30,w:.4,h:17/30,aspect:8/17});pixels.fill(255);assert.deepEqual(E.alphaBounds(pixels,20,30),{x:0,y:0,w:1,h:1,aspect:2/3});assert.throws(()=>E.alphaBounds(new Uint8ClampedArray(4),1,1),/transparent/);});
test('subcategory role and mixed aspect ratios, duplicate categories, locked layer',()=>{assert.equal(E.role({category:'Hosen & Röcke',subcategory:'Röcke'}),'skirt');assert.equal(E.role({category:'Kleider'}),'dress');for(let n=1;n<=12;n++){const items=entries(Array.from({length:n},(_,i)=>i%9));items.forEach((e,i)=>e.crop.aspect=[.12,.3,.75,1.8,5][i%5]);check(E.compose(items,2),items);}const items=entries([0,1,2,3]);const first=E.compose(items);items[0].layer={...first[0],locked:true};const result=E.compose(items,1);assert.deepEqual(result[0],items[0].layer);check(result,items,1);});
test('existing sync round trip preserves editorial layout and legacy looks/photos/plans',async()=>{const e=await environment();try{const legacy={id:'legacy',name:'Alt',mode:'collage',layers:[],realPhoto:'data:image/png;base64,old',updated:1};const look={id:'editorial',name:'Neu',mode:'editorial',layoutVersion:1,layoutVariant:2,theme:'linen',layers:E.compose(entries(combinations[5]),2),updated:2};for(const record of [legacy,look]){const response=await onRequestPost({env:e.env,request:e.req('sync',{method:'POST',body:JSON.stringify({type:'looks',action:'upsert',id:record.id,record})})});assert.equal(response.status,200);}const response=await onRequestGet({env:e.env,request:e.req('sync')});const data=await response.json();assert.deepEqual(data.looks.find(l=>l.id==='editorial'),look);assert.deepEqual(data.looks.find(l=>l.id==='legacy'),legacy);assert.deepEqual(data.deleted,[]);}finally{e.db.close();}});
test('three-piece canvas use, hierarchy and mirrored editorial directions',()=>{
 const items=entries([0,1,2]);
 for(let v=0;v<4;v++){
  const layers=E.compose(items,v),bs=layers.map((l,i)=>E.box(l,items[i].crop.aspect));
  const w=Math.max(...bs.map(b=>b.x+b.w/2))-Math.min(...bs.map(b=>b.x-b.w/2));
  const h=Math.max(...bs.map(b=>b.y+b.h/2))-Math.min(...bs.map(b=>b.y-b.h/2));
  assert.ok(w*h/(94*114)>=.77 && w*h/(94*114)<=.91,'outfit envelope should fill approximately 80–90% of the usable area');
  assert.ok(layers[2].w>=34,'shoes must remain prominent');
  assert.ok(layers[0].w>layers[2].w,'top should dominate shoes');
 }
 assert.ok(E.compose(items,0)[0].x<40);assert.ok(E.compose(items,1)[0].x>60);
 const compact=E.compose(items,2),magazine=E.compose(items,3);
 assert.ok(compact.every(l=>Math.abs(l.angle)<=1));assert.ok(magazine.some(l=>Math.abs(l.angle)>=7));
});
test('overlap budget rejects hidden pieces and protects locked garments',()=>{
 const a={x:50,y:50,w:40,h:40,kind:'top'},b={...a,kind:'pants'};
 assert.equal(E.compatible(a,b,3),false);
 const corner={...b,x:89,y:89};assert.equal(E.compatible(a,corner,0),true);
 assert.equal(E.compatible({...a,locked:true},corner,0),false);
 assert.equal(E.compatible({...a,kind:'accessory'},corner,0),false);
});
test('controlled main-garment overlap accepts 6%, Compact 8%, and rejects excess',()=>{
 const top={x:30,y:30,w:40,h:40,kind:'top'};
 const bottom={x:67.2,y:30,w:40,h:40,kind:'pants'}; // 7% of the smaller envelope
 assert.equal(E.compatible(top,bottom,0),false);
 assert.equal(E.compatible(top,bottom,2),true);
 assert.equal(E.compatible(top,{...bottom,x:66.4},2),false);
 assert.equal(E.compatible({...top,locked:true},bottom,2),false);
});
