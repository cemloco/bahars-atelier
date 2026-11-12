/* Browser-only Editorial Beige. Pure geometry is also exercised by Node tests. */
(function (root) {
  'use strict';
  const HEIGHT = 120, BACKGROUND = '#f2ebdf';
  function role(g) {
    const sub = `${g.subcategory || ''} ${g.name || ''}`.toLocaleLowerCase('de');
    if (/kleid|jumpsuit|overall/.test(g.subcategory?.toLowerCase() || '') || g.category === 'Kleider') return 'dress';
    if (g.category === 'Hosen & Röcke') return /rock|röck/.test(sub) ? 'skirt' : 'pants';
    return ({Oberteile:'top',Jacken:'jacket',Schuhe:'shoes',Taschen:'bag',Accessoires:'accessory'})[g.category] || 'other';
  }
  // Inspect every source alpha pixel. Only empty margins are excluded, never photo backgrounds.
  function alphaBounds(data, width, height) {
    let left=width, top=height, right=-1, bottom=-1;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      if(data[(y*width+x)*4+3] > 0) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    if(right<0) throw Error('Ein Foto ist vollständig transparent. Bitte ein sichtbares Foto verwenden.');
    return {x:left/width,y:top/height,w:(right-left+1)/width,h:(bottom-top+1)/height,aspect:(right-left+1)/(bottom-top+1)};
  }
  const cache = new Map();
  async function measure(src) {
    if(cache.has(src)) return cache.get(src);
    const pending = (async()=>{
      const image = await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Ein Kleidungsfoto konnte nicht geladen werden.'));i.src=src;});
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      return alphaBounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
    })();
    cache.set(src,pending);
    // Bound metadata cache; no second wardrobe or modified image is persisted.
    if(cache.size>80) cache.delete(cache.keys().next().value);
    try{return await pending;}catch(e){cache.delete(src);throw e;}
  }
  function box(layer, aspect) {
    const a=(layer.angle||0)*Math.PI/180, w=layer.w, h=w/aspect;
    return {x:layer.x,y:layer.y*1.2,w:Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)),h:Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a))};
  }
  function intersects(a,b,gap=.6) {return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap && Math.abs(a.y-b.y)<(a.h+b.h)/2+gap;}
  function inside(b) {return b.x-b.w/2>=3 && b.x+b.w/2<=97 && b.y-b.h/2>=3 && b.y+b.h/2<=HEIGHT-3;}
  // Width/height caps are category-specific; shoes remain a strong visual anchor.
  const sizes={top:[58,57],pants:[40,81],skirt:[49,65],dress:[50,94],jacket:[49,68],shoes:[41,33],bag:[31,36],accessory:[16,19],other:[32,36]};
  const variantNames=['Editorial Left','Editorial Right','Compact','Magazine'];
  const left={top:[32,34],pants:[70,65],skirt:[68,68],dress:[43,54],jacket:[76,30],shoes:[29,94],bag:[79,27],accessory:[78,102],other:[26,70]};
  const anchors=[left,Object.fromEntries(Object.entries(left).map(([k,[x,y]])=>[k,[100-x,y]])),
    {top:[33,32],pants:[71,73],skirt:[66,68],dress:[50,55],jacket:[74,32],shoes:[31,100],bag:[77,24],accessory:[24,67],other:[25,72]},
    {top:[62,33],pants:[30,68],skirt:[32,69],dress:[56,55],jacket:[77,66],shoes:[73,98],bag:[20,23],accessory:[77,68],other:[23,101]}];
  function overlap(a,b) {
    const w=Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2));
    const h=Math.max(0,Math.min(a.y+a.h/2,b.y+b.h/2)-Math.max(a.y-a.h/2,b.y-b.h/2));
    return w*h/Math.min(a.w*a.h,b.w*b.h);
  }
  function compatible(a,b,variant) {
    // Locked pieces and small details always keep a clear gap. Main garments may
    // touch at their bounding-box corners; never conceal more than 4% of either.
    const pair=[a.kind,b.kind];
    const allowed=!a.locked&&!b.locked&&(pair.includes('top')&&pair.some(k=>['pants','skirt'].includes(k)) || variant===3&&pair.includes('bag')&&pair.some(k=>['top','pants','skirt','dress','jacket','shoes'].includes(k)));
    return allowed ? overlap(a,b)<=.04 : !intersects(a,b);
  }
  function placementScore(b,placed,anchor,kind,variant) {
    let score=(b.x-anchor[0])**2+(b.y-anchor[1])**2;
    if(!placed.length)return score;
    const main=placed.filter(p=>['top','pants','skirt','dress','jacket'].includes(p.kind));
    const group=main.length?main:placed;
    const cx=group.reduce((s,p)=>s+p.x,0)/group.length,cy=group.reduce((s,p)=>s+p.y,0)/group.length;
    score+=.15*((b.x-cx)**2+(b.y-cy)**2);
    const related=kind==='belt'?placed.filter(p=>['pants','skirt'].includes(p.kind)):group;
    if(related.length)score+= (kind==='belt'?2:.5)*Math.min(...related.map(p=>{
      const dx=Math.max(0,Math.abs(b.x-p.x)-(b.w+p.w)/2),dy=Math.max(0,Math.abs(b.y-p.y)-(b.h+p.h)/2);return dx*dx+dy*dy;
    }));
    const all=[...placed,b],area=all.reduce((s,p)=>s+p.w*p.h,0);
    const balanceX=all.reduce((s,p)=>s+p.x*p.w*p.h,0)/area,balanceY=all.reduce((s,p)=>s+p.y*p.w*p.h,0)/area;
    score+=.12*((balanceX-50)**2+(balanceY-60)**2);
    const hullW=Math.max(...all.map(p=>p.x+p.w/2))-Math.min(...all.map(p=>p.x-p.w/2));
    const hullH=Math.max(...all.map(p=>p.y+p.h/2))-Math.min(...all.map(p=>p.y-p.h/2));
    score+=(variant===2?.055:.025)*Math.max(0,hullW*hullH-area);
    for(const p of placed)score+=overlap(b,p)*1800;
    const edge=Math.min(b.x-b.w/2,100-b.x-b.w/2,b.y-b.h/2,120-b.y-b.h/2);
    return score+12/Math.max(1,edge);
  }
  function compose(entries, variant=0) {
    if(!entries.length) return [];
    const v=((variant%4)+4)%4, fixed=[], movable=[];
    for(const [index,e] of entries.entries()) {
      if(!Number.isFinite(e.crop?.aspect)||e.crop.aspect<=0) throw Error('Bildformat fehlt.');
      if(e.layer.locked) {const b=box(e.layer,e.crop.aspect);if(!inside(b)) throw Error('Ein gesperrtes Teil liegt am Bildrand. Bitte zuerst entsperren.');fixed.push({...b,locked:true,kind:role(e.garment)});}
      else movable.push({...e,index,kind:role(e.garment)});
    }
    movable.sort((a,b)=>{
      const priority={dress:0,top:1,pants:2,skirt:2,jacket:3,shoes:4,bag:5,other:6,accessory:7};return priority[a.kind]-priority[b.kind]||a.index-b.index;
    });
    const countScale=Math.min(1,Math.sqrt(6/entries.length));
    // Retry the entire composition at a smaller common scale, preserving relative sizes.
    for(let attempt=0;attempt<65;attempt++) {
      const placed=[...fixed], result=new Map(), scale=countScale*Math.pow(.94,attempt);
      for(const e of movable) {
        let limits=sizes[e.kind];
        const sub=`${e.garment.subcategory||''} ${e.garment.name||''}`.toLowerCase();
        if(e.kind==='accessory' && /gürtel|guertel|schal/.test(sub)) limits=[26,12];
        if(e.kind==='accessory' && /uhr|schmuck|ohrring|ring/.test(sub)) limits=[11,15];
        const width=Math.min(limits[0],limits[1]*e.crop.aspect)*scale;
        const turn=([[ -2,2,-3,3],[2,-2,3,-3],[0,1,-1,0],[ -8,7,-6,9]][v][e.index%4]);
        const dims=box({x:0,y:0,w:width,angle:turn},e.crop.aspect);
        let best=null, bestScore=Infinity;
        const belt=e.kind==='accessory' && /gürtel|guertel/.test(sub);
        const trousers=placed.find(p=>['pants','skirt'].includes(p.kind));
        const anchor=belt&&trousers?[trousers.x,trousers.y-trousers.h/2-4]:anchors[v][e.kind];
        // Continuous category targets plus free-space search; no fixed per-piece slots.
        const xs=[anchor[0]],ys=[anchor[1]];
        for(let x=3+dims.w/2;x<=97-dims.w/2;x+=2.5) xs.push(x);
        for(let y=3+dims.h/2;y<=117-dims.h/2;y+=2.5) ys.push(y);
        for(const x of xs) for(const y of ys) {
          const b={x,y,w:dims.w,h:dims.h,kind:e.kind};
          if(!inside(b)||placed.some(p=>!compatible(b,p,v))) continue;
          const score=placementScore(b,placed,anchor,belt?'belt':e.kind,v);
          if(score<bestScore){bestScore=score;best={...e.layer,x,y:y/1.2,w:width,angle:turn,crop:{...e.crop}};}
        }
        if(!best) break;
        placed.push({...box(best,e.crop.aspect),kind:e.kind});result.set(e.index,best);
      }
      if(result.size===movable.length) return entries.map((e,i)=>result.get(i)||{...e.layer});
    }
    throw Error('Kein freier Platz. Bitte gesperrte Teile entsperren und erneut anordnen.');
  }
  async function canvas(layers,garments,width=1800) {
    const c=document.createElement('canvas');c.width=width;c.height=width*1.2;
    const ctx=c.getContext('2d');ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,c.width,c.height);
    const unit=width/100;
    for(const l of layers) {
      const g=garments.find(g=>g.id===l.gid);if(!g) throw Error('Ein Kleidungsstück fehlt.');
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Ein Kleidungsfoto konnte nicht geladen werden.'));i.src=g.image;});
      const crop=l.crop||{x:0,y:0,w:1,h:1,aspect:img.naturalWidth/img.naturalHeight};
      const w=l.w*unit,h=w/crop.aspect;
      // Render a local matte first, so the soft shadow rotates with the garment, just like CSS.
      const matte=document.createElement('canvas'),pad=Math.ceil(3*unit);matte.width=Math.ceil(w+2*pad);matte.height=Math.ceil(h+2*pad);
      const m=matte.getContext('2d');m.shadowColor='rgba(74,53,32,0.12)';m.shadowBlur=.9*unit;m.shadowOffsetY=.45*unit;
      m.drawImage(img,crop.x*img.naturalWidth,crop.y*img.naturalHeight,crop.w*img.naturalWidth,crop.h*img.naturalHeight,pad,pad,w,h);
      ctx.save();ctx.translate(l.x*unit,l.y/100*c.height);ctx.rotate((l.angle||0)*Math.PI/180);ctx.drawImage(matte,-w/2-pad,-h/2-pad);ctx.restore();
    }
    return c;
  }
  root.AtelierEditorial={role,alphaBounds,measure,compose,box,intersects,inside,overlap,compatible,variantNames,canvas,BACKGROUND};
})(globalThis);
