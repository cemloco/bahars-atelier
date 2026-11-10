import {TYPES,IMAGE_FIELDS,IMAGE_LIMIT,validateBackup,validateRecord,digest} from './server/backup.js';
let rows=[],running=false,prepared=false;
const panel=document.createElement('dialog');
panel.id='ba-cloud-import';panel.setAttribute('aria-label','Backup in Cloud importieren');
const style=document.createElement('style');style.textContent='#ba-cloud-import .preview{max-height:24dvh;overflow:auto;overflow-wrap:anywhere}#ba-cloud-import .preview p{display:flex;gap:10px;align-items:center;margin:8px 0}#ba-cloud-import button{min-height:44px;padding:8px 12px;margin:6px 0;cursor:pointer}#ba-cloud-import input{max-width:100%}#ba-cloud-import::backdrop{background:#0007}';document.head.append(style);
panel.style.cssText='width:min(540px,90vw);max-height:85dvh;overflow:auto;border:1px solid #bcc3b7;border-radius:18px;padding:22px;background:#fbfaf4;color:#29392c';
panel.innerHTML=`<h2>Backup in Cloud importieren</h2><p>Die Datei und deine lokale Garderobe bleiben unverändert. Neue IDs werden ergänzt. Vorhandene, abweichende oder gelöschte IDs bleiben als Konflikte erhalten.</p><p>Während des Imports pausiert der automatische Abgleich. Danach kannst du ihn über „Jetzt synchronisieren“ wieder starten.</p><input type="file" accept=".json,application/json" aria-label="JSON-Sicherung auswählen"><p role="status" aria-live="polite"></p><progress value="0" max="1" style="width:100%"></progress><div class="preview"></div><button class="upload" disabled>Vorschau bestätigen und hochladen</button> <button class="close">Schließen</button>`;
document.body.append(panel);
const fileInput=panel.querySelector('input'),status=panel.querySelector('[role=status]'),bar=panel.querySelector('progress'),preview=panel.querySelector('.preview'),upload=panel.querySelector('.upload');
function say(s){status.textContent=s;}
async function api(type,id,record){const r=await fetch('/api/import'+(record?'':'?'+new URLSearchParams({type,id})),{method:record?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:record?{'Content-Type':'application/json'}:{},body:record?JSON.stringify({type,record}):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;}
async function decode(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Bild kann nicht dekodiert werden'));img.src=src;});}
async function prepareImage(src){
 const img=await decode(src);
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('Bildauflösung zu groß oder ungültig');
 if(src.length<=IMAGE_LIMIT)return src;
 // WebP preserves transparency. Never flatten PNGs onto a black background on iPhone.
 const canvas=document.createElement('canvas');let best=src;
 for(const max of [2048,1600,1280]){
  const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  for(const q of [.94,.90,.86]){const value=canvas.toDataURL('image/webp',q);if(value.length<best.length)best=value;if(best.length<=IMAGE_LIMIT){canvas.width=canvas.height=1;return best;}}
 }
 canvas.width=canvas.height=1;throw Error('Bild bleibt zu groß. Import gestoppt; Original bleibt erhalten.');
}
window.atelierBackupOpen=async()=>{
 if(!window.atelierCloud?.authenticated()){alert('Bitte zuerst mit der Cloud verbinden.');return;}
 await window.atelierCloud.pause();panel.showModal();
};
panel.querySelector('.close').onclick=()=>{if(!running)panel.close()};panel.addEventListener('cancel',e=>{if(running)e.preventDefault()});
fileInput.onchange=async()=>{
 const file=fileInput.files[0];if(!file||running)return;
 rows=[];prepared=false;upload.disabled=true;preview.replaceChildren();bar.value=0;
 try{
  if(file.size>90*1024*1024)throw Error('Sicherung ist größer als 90 MiB');
  const backup=validateBackup(JSON.parse(await file.text()));
  const total=TYPES.reduce((n,t)=>n+backup[t].length,0);if(!total)throw Error('Sicherung ist leer');bar.max=total;
  for(const type of TYPES)for(const original of backup[type]){
   say(`Validieren und Server prüfen: ${rows.length+1}/${total}`);
   const record=structuredClone(original);let compressed=0;
   for(const f of IMAGE_FIELDS[type])if(record[f]){const source=record[f];record[f]=await prepareImage(source);if(source!==record[f])compressed++;}
   validateRecord(type,record,true);
   const hash=await digest(record),remote=await api(type,record.id);
   const state=remote.deleted?'Konflikt: gelöschte ID':remote.exists?(remote.hash===hash?'Bereits vorhanden':'Konflikt: abweichende ID'):'Neu';
   const row={type,record,hash,state,compressed};rows.push(row);
   const line=document.createElement('p');line.textContent=`${type}: ${record.name||record.date} — ${state}${compressed?' · Bild komprimiert':''}`;const source=record.image||record.preview;if(source){const image=new Image();image.src=source;image.alt='';image.width=44;image.height=44;image.style.objectFit='contain';line.prepend(image);}preview.append(line);row.line=line;bar.value=rows.length;
  }
  prepared=true;upload.disabled=false;
  say(`Vorschau: ${backup.garments.length} Kleidungsstücke, ${backup.looks.length} Looks, ${backup.plans.length} Termine. ${rows.filter(r=>r.state.startsWith('Konflikt')).length} Konflikte werden übersprungen. ${rows.reduce((n,r)=>n+r.compressed,0)} Bilder komprimiert. Noch nichts hochgeladen.`);
 }catch(e){say(e.message+' — keine Daten ersetzt.');}
};
upload.onclick=async()=>{
 if(running||!prepared)return;running=true;upload.disabled=true;fileInput.disabled=true;bar.value=0;
 let done=0,conflicts=0;const verified=[];
 try{
  for(const row of rows){
   say(`Upload/Prüfung ${done+1}/${rows.length}: ${row.record.name||row.record.date}`);
   let remote=await api(row.type,row.record.id);
   if(remote.deleted || (remote.exists && remote.hash!==row.hash)){row.line.textContent=`${row.record.id}: Konflikt — unverändert`;conflicts++;}
   else{
    if(!remote.exists){await api(row.type,row.record.id,row.record);remote=await api(row.type,row.record.id);}
    if(remote.hash!==row.hash)throw Error('Serverdaten oder Bilder noch nicht vollständig sichtbar. Bitte erneut fortsetzen.');
    for(const field of IMAGE_FIELDS[row.type])if(row.record[field]){if(!remote.images.some(i=>i.field===field))throw Error('Serverbild fehlt');}
    row.line.textContent=`${row.record.id}: hochgeladen und geprüft`;verified.push(row);
   }
   done++;bar.value=done;
  }
  // A fresh final pass detects concurrent edits and KV eventual visibility. Never claim success from POST alone.
  let counts;
  for(const row of verified){const remote=await api(row.type,row.record.id);if(!remote.exists||remote.deleted||remote.hash!==row.hash)throw Error('Abschlussprüfung fehlgeschlagen: '+row.record.id);counts=remote.counts;}
  say(`Abgeschlossen: ${verified.filter(r=>r.type==='garments').length} Kleidungsstücke und insgesamt ${verified.length} Datensätze einschließlich Bilder auf dem Server geprüft. ${conflicts} Konflikte unverändert.${counts?' Serverbestand: '+TYPES.map(t=>counts[t]+' '+t).join(', ')+'.':''} Lokale Originaldaten bleiben erhalten. Automatischen Abgleich bei Bedarf wieder starten.`);
 }catch(e){say(`${e.message} Fortschritt ${done}/${rows.length}. „Fortsetzen“ prüft vorhandene IDs erneut. Nach Neuladen dieselbe Datei erneut auswählen. Bereits gespeicherte Datensätze werden nicht doppelt angelegt.`);}
 finally{running=false;upload.disabled=false;fileInput.disabled=false;upload.textContent='Fortsetzen / erneut prüfen';}
};
