import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {onRequestGet,onRequestPost} from '../functions/api/import.js';
import {onRequestGet as syncGet} from '../functions/api/sync.js';
import {sessionCookie} from '../server/auth.js';
import {validateBackup,digest,IMAGE_LIMIT} from '../server/backup.js';
import {pixel,fixture,environment} from './helpers.js';
test('53 garments plus linked looks/plans: exact hashes, images, idempotency, sync hydration',async()=>{
 const e=await environment(),backup=fixture(),original=JSON.stringify(backup);validateBackup(backup);
 for(const type of ['garments','looks','plans'])for(const record of backup[type]){
  assert.equal((await e.post(type,record)).status,200);
  const remote=await (await e.get(type,record.id)).json();assert.equal(remote.hash,await digest(record));
 }
 for(const r of backup.garments)assert.equal((await e.post('garments',r)).status,200);
 assert.equal(e.writes(),1,'same image stored only once');
 const end=await (await e.get('looks','look-1')).json();assert.deepEqual(end.counts,{garments:53,looks:1,plans:1});assert.equal(end.images.length,2);
 const cloud=await (await syncGet({env:e.env,request:e.req('sync')})).json();assert.equal(cloud.garments.length,53);assert.equal(cloud.looks[0].realPhoto,pixel);assert.equal(cloud.looks[0].preview,pixel);
 assert.equal(JSON.stringify(backup),original);
});
test('ID conflicts and tombstones never overwrite; no deletes',async()=>{
 const e=await environment(),r=fixture().garments[0];await e.post('garments',r);
 assert.equal((await e.post('garments',{...r,name:'Different',updated:999})).status,409);
 assert.equal((await (await e.get('garments',r.id)).json()).hash,await digest(r));
 e.db.prepare('INSERT INTO deleted_records VALUES(?,?,?)').run('garments','gone',10);
 assert.equal((await e.post('garments',{...r,id:'gone'})).status,409);
 assert.equal(e.db.prepare('SELECT COUNT(*) n FROM garments').get().n,1);
});
test('partial failure resumes safely with existing records',async()=>{
 const e=await environment(),backup=fixture();e.fail(1);
 assert.equal((await e.post('garments',backup.garments[0])).status,503);
 for(const r of backup.garments)assert.equal((await e.post('garments',r)).status,200);
 assert.equal((await (await e.get('garments','g-52')).json()).counts.garments,53);
 e.hide(true);assert.equal((await e.get('garments','g-0')).status,503,'KV propagation must never look like a content conflict');
 e.hide(false);assert.equal((await e.post('garments',backup.garments[0])).status,200);
});
test('invalid backups, records, references, authentication and origin rejected',async()=>{
 const e=await environment(),b=fixture();b.garments.push(b.garments[0]);assert.throws(()=>validateBackup(b),/Doppelte/);
 const dangling=fixture();dangling.looks[0].layers[0].gid='missing';assert.throws(()=>validateBackup(dangling),/Verknüpfungen/);
 assert.equal((await e.post('looks',fixture().looks[0])).status,409);
 assert.equal((await e.post('garments',{...fixture().garments[0],_cloudImages:{image:'other-key'}})).status,400);
 assert.equal((await e.post('garments',{...fixture().garments[0],id:'<script>'})).status,400);
 assert.equal((await e.post('garments',{...fixture().garments[0],image:'data:image/png;base64,'+'A'.repeat(IMAGE_LIMIT)})).status,400);
 assert.equal((await onRequestGet({env:e.env,request:new Request('https://atelier.test/api/import?type=garments&id=x')})).status,401);
 assert.equal((await onRequestPost({env:e.env,request:e.req('import',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'})})).status,403);
 assert.equal((await onRequestPost({env:e.env,request:e.req('import',{method:'POST',body:'x'.repeat(3301001)})})).status,413);
});
