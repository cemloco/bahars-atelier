import {json, authorized, sameOrigin} from '../../server/auth.js';
import {TYPES, IMAGE_FIELDS, RECORD_LIMIT, validateRecord, digest, canonical} from '../../server/backup.js';
async function setup(env){
 await env.ATELIER_DB.prepare("INSERT OR IGNORE INTO wardrobes(id,name) VALUES('family','Bahar’s Atelier')").run();
 await env.ATELIER_DB.prepare('CREATE TABLE IF NOT EXISTS deleted_records (type TEXT NOT NULL,id TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(type,id))').run();
}
async function read(env,type,id){
 const row=await env.ATELIER_DB.prepare(`SELECT * FROM ${type} WHERE id=? AND wardrobe_id='family'`).bind(id).first();
 if(!row)return null;
 const record=JSON.parse(row.data_json);
 if(record._cloudImages){for(const [field,key] of Object.entries(record._cloudImages)){const image=await env.ATELIER_IMAGES.get(key);if(!image)throw Error('Bild noch nicht sichtbar');record[field]=image;}delete record._cloudImages;}
 if(type==='garments' && row.image_key){const image=await env.ATELIER_IMAGES.get(row.image_key);if(!image)throw Error('Bild noch nicht sichtbar');record.image=image;}
 if(type==='looks' && row.worn_photo_key){const image=await env.ATELIER_IMAGES.get(row.worn_photo_key);if(!image)throw Error('Bild noch nicht sichtbar');record.wornPhoto=image;}
 return record;
}
export async function onRequestGet({request,env}){
 if(!await authorized(request,env))return json({error:'Unauthorized'},401);
 const url=new URL(request.url),type=url.searchParams.get('type'),id=url.searchParams.get('id');
 if(!TYPES.includes(type)|| !/^[\w-]{1,100}$/.test(id||''))return json({error:'Bad request'},400);
 try{await setup(env);const record=await read(env,type,id);const deleted=await env.ATELIER_DB.prepare('SELECT id FROM deleted_records WHERE type=? AND id=?').bind(type,id).first();
 const counts={};for(const t of TYPES)counts[t]=(await env.ATELIER_DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE wardrobe_id='family'`).first()).n;
 return json({exists:!!record,deleted:!!deleted,hash:record?await digest(record):null,images:record?await Promise.all(IMAGE_FIELDS[type].filter(f=>record[f]).map(async field=>({field,hash:await digest(record[field])}))):[],counts});
 }catch{return json({error:'Serverprüfung fehlgeschlagen'},503)}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:'Origin rejected'},403);
 if(!await authorized(request,env))return json({error:'Unauthorized'},401);
 // Count actual bytes as well as Content-Length (chunked requests included).
 const reader=request.body?.getReader();if(!reader)return json({error:'Body fehlt'},400);
 let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>RECORD_LIMIT+1000){await reader.cancel();return json({error:'Datensatz zu groß'},413)}chunks.push(value);}
 let body;try{body=JSON.parse(await new Blob(chunks).text());validateRecord(body.type,body.record,true)}catch(e){return json({error:e.message},400)}
 const {type,record}=body,id=record.id;
 try{
 await setup(env);
 const existing=await read(env,type,id);
 if(existing)return canonical(existing)===canonical(record)?json({ok:true,existing:true}):json({error:'ID-Konflikt; vorhandener Datensatz bleibt erhalten'},409);
 if(await env.ATELIER_DB.prepare('SELECT id FROM deleted_records WHERE type=? AND id=?').bind(type,id).first())return json({error:'ID wurde bereits gelöscht; kein automatisches Wiederherstellen'},409);
 // Immutable content-addressed keys avoid KV's one-write-per-second limit per key.
 for(const [table,ref] of (type==='looks'?record.layers.map(l=>['garments',l.gid]):type==='plans'?[['looks',record.lookId]]:[])){if(!await env.ATELIER_DB.prepare(`SELECT id FROM ${table} WHERE id=? AND wardrobe_id='family'`).bind(ref).first())return json({error:'Verknüpfter Datensatz fehlt: '+ref},409);}
 const copy={...record},images={};
 for(const field of IMAGE_FIELDS[type])if(copy[field]){const key='backup/'+await digest(copy[field]);if(!await env.ATELIER_IMAGES.get(key))await env.ATELIER_IMAGES.put(key,copy[field]);images[field]=key;delete copy[field];}
 if(Object.keys(images).length)copy._cloudImages=images;
 const data=JSON.stringify(copy),updated=String(record.updated||record.created||0);
 if(new TextEncoder().encode(data).length>90000)return json({error:'Metadaten zu groß'},413);
 // INSERT only. Unique IDs and tombstone check are enforced again in the same SQL statement.
 const cols={garments:['name','category','color','season','favorite','image_key','data_json','updated_at'],looks:['name','occasion','notes','layers_json','data_json','updated_at'],plans:['look_id','planned_date','data_json','updated_at']}[type];
 const vals={garments:[record.name,record.category||null,record.color||null,record.season||null,record.favorite?1:0,images.image||null,data,updated],looks:[record.name,record.occasion||null,record.notes||null,JSON.stringify(record.layers),data,updated],plans:[record.lookId,record.date,data,updated]}[type];
 await env.ATELIER_DB.prepare(`INSERT OR IGNORE INTO ${type}(id,wardrobe_id,${cols.join(',')}) SELECT ?,'family',${cols.map(()=>'?').join(',')} WHERE NOT EXISTS (SELECT 1 FROM deleted_records WHERE type=? AND id=?)`).bind(id,...vals,type,id).run();
 const saved=await read(env,type,id);
 if(!saved)return json({error:'Datensatz wurde zwischenzeitlich gelöscht'},409);
 if(canonical(saved)!==canonical(record))return json({error:'Konflikt oder Bilder noch nicht sichtbar; erneut prüfen'},409);
 return json({ok:true});
 }catch{return json({error:'Upload fehlgeschlagen; Datei erneut wählen und fortsetzen'},503)}
}
