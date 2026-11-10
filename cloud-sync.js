/* Bahar's Atelier: opt-in cloud replication, existing local IndexedDB remains source of offline data. */
(()=>{'use strict';
const DB='BaharsAtelier_v1', TYPES=['garments','looks','plans'];
let importPaused=false;try{importPaused=localStorage.getItem('ba-cloud-import-paused')==='1'}catch{}
window.atelierCloud={pause:async()=>{importPaused=true;try{localStorage.setItem('ba-cloud-import-paused','1')}catch{}while(busy)await new Promise(r=>setTimeout(r,100));label('Verbunden · Abgleich für Backup-Import pausiert');},resume:()=>{lastSynced=null;importPaused=false;try{localStorage.removeItem('ba-cloud-import-paused')}catch{}},authenticated:()=>active};
window.addEventListener('storage',e=>{if(e.key==='ba-cloud-import-paused')importPaused=e.newValue==='1'});
let active=false, busy=false, timer=null, prev='', statusEl, lastSynced=null;
let syncChip=null, lastConfirmedFingerprint=null, monitoredFingerprint=null, monitoredOnce=false;
function chipState(kind,msg){if(!syncChip)return;syncChip.textContent=msg;syncChip.dataset.status=kind;syncChip.title=msg}
function currentState(){if(!active)return ['local','✓ Lokal gespeichert · Cloud nicht verbunden'];if(importPaused)return ['pending','◷ Cloud-Abgleich pausiert'];if(busy)return ['working','↻ Cloud wird synchronisiert …'];return ['pending','◷ Lokal gespeichert · Cloud ausstehend']}
async function observeLocalChanges(){if(document.hidden)return;try{const data=await localRead(),cur=fingerprint(data);if(!monitoredOnce){monitoredFingerprint=cur;monitoredOnce=true;if(!active)chipState('local','✓ Lokal gespeichert · Cloud nicht verbunden');return}if(cur!==monitoredFingerprint){monitoredFingerprint=cur;if(cur!==lastConfirmedFingerprint){const [k,m]=currentState();chipState(k,m)}}}catch{/* Storage may be temporarily unavailable */}}

function dbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function localRead(){const d=await dbOpen();try{return await new Promise((res,rej)=>{const tx=d.transaction(TYPES,'readonly'),out={};let remaining=TYPES.length;for(const k of TYPES){const r=tx.objectStore(k).getAll();r.onsuccess=()=>{out[k]=r.result;if(!--remaining)res(out)};r.onerror=()=>rej(r.error)}})}finally{d.close()}}
async function localPut(type,record){const d=await dbOpen();try{await new Promise((res,rej)=>{const tx=d.transaction(type,'readwrite');tx.objectStore(type).put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}finally{d.close()}}
async function localDelete(type,id){const d=await dbOpen();try{await new Promise((res,rej)=>{const tx=d.transaction(type,'readwrite');tx.objectStore(type).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}finally{d.close()}}
function stamp(x){return Number(x.updated||x.created||0)}
function fingerprint(data){return TYPES.map(t=>data[t].map(r=>`${r.id}/${stamp(r)}/${r.image?.length||0}/${r.wornPhoto?.length||0}`).sort().join(';')).join('|')}
function label(msg){if(statusEl)statusEl.textContent=msg}
async function api(path,options){const r=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...options});let v;try{v=await r.json()}catch{throw Error('Server antwortet nicht korrekt')}if(!r.ok)throw Error(v.error||`HTTP ${r.status}`);return v}
async function sync(){if(!active||busy||importPaused)return;busy=true;chipState('working','↻ Cloud wird synchronisiert …');try{
 const local=await localRead();let applied=0,uploaded=0;
 if(lastSynced){
  for(const type of TYPES){const known=lastSynced[type]||new Set();const present=new Set(local[type].map(x=>x.id));for(const id of known){if(!present.has(id))await api('sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,action:'delete',id})})}}
 }
 const cloud=await api('sync');
 const deletes=new Map((cloud.deleted||[]).map(x=>[x.type+'/'+x.id,Number(x.updated_at||0)]));
 for(const type of TYPES){const rem=new Map((cloud[type]||[]).map(x=>[x.id,x]));for(const item of local[type]){
  const deletion=deletes.get(type+'/'+item.id);
  if(deletion && deletion>=stamp(item)){await localDelete(type,item.id);applied++;continue}
  const r=rem.get(item.id);
  if(!r || stamp(item)>stamp(r)){
    await api('sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,action:'upsert',id:item.id,record:item})});uploaded++;
  }else if(stamp(r)>stamp(item)) {await localPut(type,r);applied++}
  rem.delete(item.id);
 }
 for(const item of rem.values()){await localPut(type,item);applied++}
 }
 const latest=await localRead();prev=fingerprint(latest);lastConfirmedFingerprint=prev;monitoredFingerprint=prev;monitoredOnce=true;chipState('synced','✓ Lokal gespeichert · Cloud synchronisiert');lastSynced=Object.fromEntries(TYPES.map(t=>[t,new Set(latest[t].map(x=>x.id))]));label(`Cloud verbunden · ${uploaded} hochgeladen · ${applied} übernommen`);
 if(applied)window.dispatchEvent(new Event('atelier-cloud-updated'));
 }catch(err){label('Cloud nicht erreichbar: '+err.message);chipState('error','! Cloud nicht synchronisiert · erneut versuchen')}finally{busy=false}}
async function start(){active=true;chipState('working','↻ Cloud wird synchronisiert …');document.getElementById('ba-cloud-login').hidden=true;document.getElementById('ba-cloud-logout').hidden=false;label(importPaused?'Verbunden · Abgleich für Backup-Import pausiert':'Verbunden · erster Abgleich läuft');await sync();if(!timer)timer=setInterval(async()=>{if(!active||busy||importPaused)return;const cur=fingerprint(await localRead());if(cur!==prev)await sync();else await sync()},45000)}
async function init(){syncChip=document.createElement('div');syncChip.id='ba-cloud-sync-indicator';syncChip.setAttribute('role','status');syncChip.setAttribute('aria-live','polite');syncChip.style.cssText='position:fixed;left:10px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:1999;max-width:calc(100vw - 145px);padding:9px 11px;border-radius:24px;border:1px solid #d7ddd2;background:#fbfaf4;color:#304736;box-shadow:0 3px 15px #0001;font:500 11px system-ui;line-height:1.3;pointer-events:none';document.body.append(syncChip);chipState('local','✓ Lokal gespeichert · Cloud nicht verbunden');setInterval(observeLocalChanges,1800);observeLocalChanges();const toggle=document.createElement('button');toggle.type='button';toggle.id='ba-cloud-toggle';toggle.textContent='☁ Cloud';toggle.style.cssText='position:fixed;right:12px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2000;padding:11px 15px;border-radius:30px;border:1px solid #c7c9c0;color:#304736;background:#fcfcf7;box-shadow:0 3px 15px #0002;font:600 14px system-ui';document.body.append(toggle);
 const sheet=document.createElement('div');sheet.id='ba-cloud-sheet';sheet.hidden=true;sheet.style.cssText='position:fixed;z-index:2100;inset:0;background:#0007;display:grid;place-items:center;padding:18px';sheet.innerHTML=`<section style="width:min(430px,100%);background:#fbfaf4;padding:26px;border-radius:22px;color:#29392c;font:16px system-ui;box-shadow:0 12px 40px #0003"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:23px">Bahar’s Atelier Cloud</strong><button id="ba-cloud-close" type="button" style="font-size:28px;background:none;border:0">×</button></div><p id="ba-cloud-status" style="margin:16px 0">Deine lokale Garderobe bleibt erhalten. Verbinde den gemeinsamen Kleiderschrank.</p><form id="ba-cloud-login"><label for="ba-cloud-pass">Gemeinsames Cloud-Passwort</label><input id="ba-cloud-pass" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;margin:10px 0;padding:13px;border:1px solid #bcc3b7;border-radius:10px;font-size:16px"><button type="submit" style="width:100%;padding:13px;background:#3e5644;color:white;border:0;border-radius:10px">Cloud verbinden</button></form><button id="ba-backup-open" type="button" style="margin-top:12px;padding:10px">Backup in Cloud importieren</button><button id="ba-cloud-now" type="button" style="margin-top:12px;padding:10px;background:#e7ece5;border:0;border-radius:8px">Jetzt synchronisieren</button><button id="ba-cloud-logout" type="button" hidden style="margin-top:12px;padding:10px;background:#e7ece5;border:0;border-radius:8px">Abmelden</button><p style="font-size:12px;opacity:.75">Vor dem ersten Abgleich unbedingt ein vollständiges Backup erstellen. Bei Konflikten gewinnt die zuletzt bearbeitete Version. Keine Zugangsdaten werden lokal gespeichert.</p></section>`;document.body.append(sheet);
 // Hidden attribute must override display:grid.
 const style=document.createElement('style');style.textContent='#ba-cloud-sheet[hidden],#ba-cloud-login[hidden],#ba-cloud-logout[hidden]{display:none!important}';document.head.append(style);
 document.getElementById('ba-backup-open').onclick=()=>window.atelierBackupOpen();
 statusEl=document.getElementById('ba-cloud-status');toggle.onclick=()=>sheet.hidden=false;document.getElementById('ba-cloud-close').onclick=()=>sheet.hidden=true;
 document.getElementById('ba-cloud-login').onsubmit=async e=>{e.preventDefault();label('Anmeldung läuft…');try{await api('session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('ba-cloud-pass').value})});document.getElementById('ba-cloud-pass').value='';await start()}catch(err){label(err.message)}};
 document.getElementById('ba-cloud-now').onclick=()=>{if(importPaused && !confirm('Automatischen Abgleich wieder starten? Cloud-Daten werden lokal übernommen; bei Konflikten gewinnt die neuere Version.'))return;window.atelierCloud.resume();sync()};document.getElementById('ba-cloud-logout').onclick=async()=>{await api('session',{method:'DELETE'});active=false;clearInterval(timer);timer=null;lastConfirmedFingerprint=null;chipState('local','✓ Lokal gespeichert · Cloud nicht verbunden');document.getElementById('ba-cloud-login').hidden=false;document.getElementById('ba-cloud-logout').hidden=true;label('Abgemeldet')};
 try{if((await api('session')).authenticated)await start()}catch{label('Cloud-Schnittstelle noch nicht veröffentlicht')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
