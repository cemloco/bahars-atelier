// Shared validation and canonical hashes for preview, idempotency and verification.
export const TYPES = ['garments', 'looks', 'plans'];
export const IMAGE_FIELDS = {garments:['image'], looks:['preview','realPhoto','wornPhoto'], plans:[]};
export const IMAGE_LIMIT = 2500000; // Below the sync API's 2.6 MB cap and KV's 25 MiB value limit.
export const RECORD_LIMIT = 3300000;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
export function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateRecord(type, r, limits = false) {
  if (!TYPES.includes(type) || !r || Array.isArray(r) || typeof r !== 'object' || typeof r.id !== 'string' || !ID.test(r.id)) throw Error('Ungültige Datensatz-ID');
  if ('_cloudImages' in r) throw Error('Reserviertes Cloud-Feld: '+r.id);
  if (type !== 'plans' && (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 500)) throw Error('Ungültiger Name: '+r.id);
  for (const key of ['created','updated']) if (r[key] != null && (!Number.isFinite(r[key]) || r[key]<0)) throw Error('Ungültiger Zeitstempel: '+r.id);
  if (type === 'looks' && (!Array.isArray(r.layers) || r.layers.some(l=>!l || !ID.test(l.gid || '') || ['x','y','w','angle'].some(k=>l[k]!=null && !Number.isFinite(l[k]))))) throw Error('Ungültige Look-Ebenen: '+r.id);
  if (type === 'plans' && (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !ID.test(r.lookId || ''))) throw Error('Ungültiger Termin: '+r.id);
  for (const field of IMAGE_FIELDS[type]) {
    const value = r[field];
    if (value == null || value === '') {if(type==='garments') throw Error('Bild fehlt: '+r.id); continue;}
    if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.split(',')[1].length % 4) throw Error('Ungültiges eingebettetes Bild: '+r.id);
    if (limits && value.length > IMAGE_LIMIT) throw Error('Bild zu groß: '+r.id);
  }
  if (limits && new TextEncoder().encode(JSON.stringify(r)).length > RECORD_LIMIT) throw Error('Datensatz zu groß: '+r.id);
  // Do not allow imported HTML in fields rendered as DOM attributes by the existing app.
  function safe(v) {if(typeof v==='string' && /[<>"\u0000-\u0008]/.test(v)) throw Error('Unsicherer Text: '+r.id);if(v && typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Ungültiges Feld');safe(x);}}
  safe(r);
}
export function validateBackup(obj) {
  if (!obj || obj.app !== 'Bahars Atelier' || obj.version !== 1 || TYPES.some(t=>!Array.isArray(obj[t]))) throw Error('Keine gültige Bahars Atelier Sicherung');
  if(TYPES.reduce((n,t)=>n+obj[t].length,0)>5000)throw Error('Zu viele Datensätze');
  for(const t of TYPES){const ids=new Set();for(const r of obj[t]){validateRecord(t,r);if(ids.has(r.id))throw Error('Doppelte ID: '+r.id);ids.add(r.id);}}
  const garments=new Set(obj.garments.map(r=>r.id)), looks=new Set(obj.looks.map(r=>r.id));
  if(obj.looks.some(r=>r.layers.some(l=>!garments.has(l.gid))) || obj.plans.some(r=>!looks.has(r.lookId))) throw Error('Sicherung enthält fehlende Verknüpfungen');
  return obj;
}
