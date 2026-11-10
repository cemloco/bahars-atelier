import {DatabaseSync} from 'node:sqlite';
import {onRequestGet,onRequestPost} from '../functions/api/import.js';
import {sessionCookie} from '../server/auth.js';
export const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
export function fixture(){return {app:'Bahars Atelier',version:1,garments:Array.from({length:53},(_,i)=>({id:'g-'+i,name:'Kleidung '+i,image:pixel,created:1,updated:2})),looks:[{id:'look-1',name:'Look',layers:[{id:'layer-1',gid:'g-0',x:1,y:2,w:20,angle:0}],preview:pixel,realPhoto:pixel}],plans:[{id:'plan-1',date:'2026-11-10',lookId:'look-1'}]};}
export async function environment(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE wardrobes(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE garments(id TEXT PRIMARY KEY,wardrobe_id TEXT,name TEXT,category TEXT,color TEXT,season TEXT,favorite INTEGER,image_key TEXT,data_json TEXT,updated_at TEXT);CREATE TABLE looks(id TEXT PRIMARY KEY,wardrobe_id TEXT,name TEXT,occasion TEXT,notes TEXT,layers_json TEXT,worn_photo_key TEXT,data_json TEXT,updated_at TEXT);CREATE TABLE plans(id TEXT PRIMARY KEY,wardrobe_id TEXT,look_id TEXT,planned_date TEXT,data_json TEXT,updated_at TEXT);`);
 const kv=new Map();let writes=0,failAt=0,hidden=false;
 const env={ATELIER_SESSION_SECRET:'test-only',ATELIER_DB:{prepare(sql){const statement=db.prepare(sql);function bound(args=[]){return {bind:(...a)=>bound(a),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>statement.run(...args)}}return bound();}},ATELIER_IMAGES:{get:async k=>hidden?null:kv.get(k)||null,put:async(k,v)=>{writes++;if(writes===failAt)throw Error('Injected network failure');kv.set(k,v)},delete:async k=>kv.delete(k)}};
 const cookie=(await sessionCookie(env.ATELIER_SESSION_SECRET)).split(';')[0];
 const req=(url,opts={})=>new Request('https://atelier.test/api/'+url,{...opts,headers:{Cookie:cookie,Origin:'https://atelier.test',...opts.headers}});
 const get=async(type,id)=>onRequestGet({env,request:req('import?'+new URLSearchParams({type,id}))});
 const post=async(type,record)=>onRequestPost({env,request:req('import',{method:'POST',body:JSON.stringify({type,record})})});
 return {env,db,kv,get,post,req,writes:()=>writes,fail:n=>{failAt=n},hide:b=>{hidden=b}};
}
