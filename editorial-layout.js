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
  function intersects(a,b,gap=2.4) {return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap && Math.abs(a.y-b.y)<(a.h+b.h)/2+gap;}
  function inside(b) {return b.x-b.w/2>=3 && b.x+b.w/2<=97 && b.y-b.h/2>=3 && b.y+b.h/2<=HEIGHT-3;}
  const sizes={top:[48,47],pants:[34,70],skirt:[43,57],dress:[44,86],jacket:[43,60],shoes:[30,24],bag:[26,31],accessory:[16,19],other:[28,32]};
  const anchors=[
    {top:[32,30],pants:[69,68],skirt:[53,65],dress:[44,53],jacket:[76,31],shoes:[25,99],bag:[80,27],accessory:[80,98],other:[25,71]},
    {top:[42,26],pants:[60,81],skirt:[48,68],dress:[51,52],jacket:[76,29],shoes:[24,96],bag:[78,26],accessory:[19,66],other:[78,96]},
    {top:[37,29],pants:[68,73],skirt:[48,66],dress:[43,56],jacket:[77,33],shoes:[24,99],bag:[80,57],accessory:[76,18],other:[22,68]},
    {top:[60,27],pants:[31,76],skirt:[47,65],dress:[53,55],jacket:[80,65],shoes:[75,102],bag:[21,22],accessory:[78,65],other:[22,98]}
  ];
  function compose(entries, variant=0) {
    if(!entries.length) return [];
    const v=((variant%4)+4)%4, fixed=[], movable=[];
    for(const [index,e] of entries.entries()) {
      if(!Number.isFinite(e.crop?.aspect)||e.crop.aspect<=0) throw Error('Bildformat fehlt.');
      if(e.layer.locked) {const b=box(e.layer,e.crop.aspect);if(!inside(b)) throw Error('Ein gesperrtes Teil liegt am Bildrand. Bitte zuerst entsperren.');fixed.push(b);}
      else movable.push({...e,index,kind:role(e.garment)});
    }
    movable.sort((a,b)=>{
      const priority={dress:0,top:1,pants:2,skirt:2,jacket:3,shoes:4,bag:5,other:6,accessory:7};return priority[a.kind]-priority[b.kind]||a.index-b.index;
    });
    const countScale=Math.min(1,Math.sqrt(5/entries.length));
    // Retry the entire composition at a smaller common scale, preserving relative sizes.
    for(let attempt=0;attempt<65;attempt++) {
      const placed=[...fixed], result=new Map(), scale=countScale*Math.pow(.94,attempt);
      for(const e of movable) {
        let limits=sizes[e.kind];
        const sub=`${e.garment.subcategory||''} ${e.garment.name||''}`.toLowerCase();
        if(e.kind==='accessory' && /gürtel|guertel|schal/.test(sub)) limits=[26,12];
        if(e.kind==='accessory' && /uhr|schmuck|ohrring|ring/.test(sub)) limits=[11,15];
        const width=Math.min(limits[0],limits[1]*e.crop.aspect)*scale;
        const turn=([[-4,3,-3,4],[3,-4,4,-3],[-3,4,3,-4],[4,-3,-4,3]][v][e.index%4]);
        const dims=box({x:0,y:0,w:width,angle:turn},e.crop.aspect);
        let best=null, bestScore=Infinity;
        const anchor=anchors[v][e.kind];
        // Continuous category targets plus free-space search; no fixed per-piece slots.
        const xs=[anchor[0]],ys=[anchor[1]];
        for(let x=3+dims.w/2;x<=97-dims.w/2;x+=2.5) xs.push(x);
        for(let y=3+dims.h/2;y<=117-dims.h/2;y+=2.5) ys.push(y);
        for(const x of xs) for(const y of ys) {
          const b={x,y,w:dims.w,h:dims.h};
          if(!inside(b)||placed.some(p=>intersects(b,p))) continue;
          const score=(x-anchor[0])**2+(y-anchor[1])**2;
          if(score<bestScore){bestScore=score;best={...e.layer,x,y:y/1.2,w:width,angle:turn,crop:{...e.crop}};}
        }
        if(!best) break;
        placed.push(box(best,e.crop.aspect));result.set(e.index,best);
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
      const m=matte.getContext('2d');m.shadowColor='rgba(74,53,32,0.16)';m.shadowBlur=.65*unit;m.shadowOffsetY=.5*unit;
      m.drawImage(img,crop.x*img.naturalWidth,crop.y*img.naturalHeight,crop.w*img.naturalWidth,crop.h*img.naturalHeight,pad,pad,w,h);
      ctx.save();ctx.translate(l.x*unit,l.y/100*c.height);ctx.rotate((l.angle||0)*Math.PI/180);ctx.drawImage(matte,-w/2-pad,-h/2-pad);ctx.restore();
    }
    return c;
  }
  root.AtelierEditorial={role,alphaBounds,measure,compose,box,intersects,inside,canvas,BACKGROUND};
})(globalThis);
