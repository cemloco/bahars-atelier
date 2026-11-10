import {json,authorized,sameOrigin} from '../../server/auth.js';
const validTypes=new Set(['garments','looks','plans']);
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
async function ensure(env){await env.ATELIER_DB.prepare("INSERT OR IGNORE INTO wardrobes(id,name) VALUES('family','Bahar’s Atelier')").run();await env.ATELIER_DB.prepare('CREATE TABLE IF NOT EXISTS deleted_records (type TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(type,id))').run()}
function imageKey(type,id){return `${type}/${id}`}
async function records(env,type){
 const fields={garments:'id,data_json,image_key',looks:'id,data_json,worn_photo_key',plans:'id,data_json'};
 const q=await env.ATELIER_DB.prepare(`SELECT ${fields[type]} FROM ${type} WHERE wardrobe_id='family'`).all();
 const result=[];
 for(const row of q.results||[]){
  try{const d=JSON.parse(row.data_json);
   if(type==='garments'&&row.image_key)d.image=await env.ATELIER_IMAGES.get(row.image_key)||'';
   if(type==='looks'&&row.worn_photo_key)d.wornPhoto=await env.ATELIER_IMAGES.get(row.worn_photo_key)||'';
   result.push(d);
  }catch{}
 }
 return result;
}
export async function onRequestGet({request,env}){
 if(!await authorized(request,env))return json({error:'Unauthorized'},401);
 try{await ensure(env);const data={};for(const type of validTypes)data[type]=await records(env,type);const deleted=await env.ATELIER_DB.prepare('SELECT type,id,updated_at FROM deleted_records').all();return json({...data,deleted:deleted.results||[]})}catch(e){return json({error:'Sync unavailable'},503)}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:'Origin rejected'},403);
 if(!await authorized(request,env))return json({error:'Unauthorized'},401);
 const len=Number(request.headers.get('Content-Length')||0);if(len>3500000)return json({error:'Image too large'},413);
 let body;try{body=await request.json()}catch{return json({error:'Bad JSON'},400)}
 const {type,action}=body;if(!validTypes.has(type)||!['upsert','delete'].includes(action)||!ID.test(body.id||''))return json({error:'Bad request'},400);
 try{
  await ensure(env);const id=body.id;
  if(action==='delete'){
   await env.ATELIER_DB.prepare(`DELETE FROM ${type} WHERE id=? AND wardrobe_id='family'`).bind(id).run();
   await env.ATELIER_DB.prepare('INSERT OR REPLACE INTO deleted_records(type,id,updated_at) VALUES(?,?,?)').bind(type,id,Date.now()).run();
   if(type==='garments')await env.ATELIER_IMAGES.delete(imageKey(type,id));
   return json({ok:true});
  }
  const record=body.record;if(!record||record.id!==id||typeof record!=='object')return json({error:'Invalid record'},400);
  let copy={...record},imgKey=null,photoKey=null;
  if(type==='garments'&&typeof copy.image==='string'&&copy.image.startsWith('data:image/')){
   if(copy.image.length>2600000)return json({error:'Please compress image'},413);
   imgKey=imageKey(type,id);await env.ATELIER_IMAGES.put(imgKey,copy.image);delete copy.image;
  }else if(type==='garments'){const row=await env.ATELIER_DB.prepare('SELECT image_key FROM garments WHERE id=?').bind(id).first();imgKey=row?.image_key||null}
  if(type==='looks'&&typeof copy.wornPhoto==='string'&&copy.wornPhoto.startsWith('data:image/')){
   if(copy.wornPhoto.length>2600000)return json({error:'Please compress photo'},413);
   photoKey=`worn/${id}`;await env.ATELIER_IMAGES.put(photoKey,copy.wornPhoto);delete copy.wornPhoto;
  }else if(type==='looks'){const row=await env.ATELIER_DB.prepare('SELECT worn_photo_key FROM looks WHERE id=?').bind(id).first();photoKey=row?.worn_photo_key||null}
  const updated=Number(copy.updated)||Date.now();
  if(type==='garments')await env.ATELIER_DB.prepare('INSERT INTO garments(id,wardrobe_id,name,category,color,season,favorite,image_key,data_json,updated_at) VALUES(?,\'family\',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,color=excluded.color,season=excluded.season,favorite=excluded.favorite,image_key=excluded.image_key,data_json=excluded.data_json,updated_at=excluded.updated_at').bind(id,String(copy.name||'Kleidung'),copy.category||null,copy.color||null,copy.season||null,copy.favorite?1:0,imgKey,JSON.stringify(copy),String(updated)).run();
  if(type==='looks')await env.ATELIER_DB.prepare('INSERT INTO looks(id,wardrobe_id,name,occasion,notes,layers_json,worn_photo_key,data_json,updated_at) VALUES(?,\'family\',?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,occasion=excluded.occasion,notes=excluded.notes,layers_json=excluded.layers_json,worn_photo_key=excluded.worn_photo_key,data_json=excluded.data_json,updated_at=excluded.updated_at').bind(id,String(copy.name||'Look'),copy.occasion||null,copy.notes||null,JSON.stringify(copy.layers||[]),photoKey,JSON.stringify(copy),String(updated)).run();
  if(type==='plans')await env.ATELIER_DB.prepare('INSERT INTO plans(id,wardrobe_id,look_id,planned_date,data_json,updated_at) VALUES(?,\'family\',?,?,?,?) ON CONFLICT(id) DO UPDATE SET look_id=excluded.look_id,planned_date=excluded.planned_date,data_json=excluded.data_json,updated_at=excluded.updated_at').bind(id,copy.lookId||null,String(copy.date||''),JSON.stringify(copy),String(updated)).run();
  await env.ATELIER_DB.prepare('DELETE FROM deleted_records WHERE type=? AND id=?').bind(type,id).run();return json({ok:true});
 }catch(err){return json({error:'Save failed',detail:String(err).slice(0,200)},500)}
}
