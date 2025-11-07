// test.js — no inline JS, same-origin load (CSP-safe)
(async function(){
  const log = (m)=>{ const el=document.getElementById('log'); el.textContent += '\n'+m; console.log(m); };
  document.getElementById('log').textContent = 'JS running…';

  const user='Mgpixelart', repo='avatar-customize-v1', ref='main';
  const parts=['face','skin','hair','clothes','glass'];
  const listURL=`https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${ref}/flat`;
  const base=`https://cdn.jsdelivr.net/gh/${user}/${repo}@${ref}/`;

  try{
    log('fetch list: '+listURL);
    const res = await fetch(listURL, {cache:'no-store'});
    if(!res.ok){ throw new Error('List API '+res.status+' '+res.statusText); }
    const { files } = await res.json();
    log('files count: '+files.length);

    // 분류
    const maps = Object.fromEntries(parts.map(p=>[p,new Map()]));
    let added=0;
    for(const f of files){
      let path = (f.name||'').replace(/^\/+/, '');
      if(!/\.webp$/i.test(path)) continue;
      const p = parts.find(x => path.toLowerCase().includes(`/${x}/`));
      if(!p) continue;
      const file = path.split('/').pop()||'';
      const m = file.match(/-?\d+/); if(!m) continue;
      const shape = parseInt(m[0],10);
      const isPrev = /preview/i.test(file);
      const cell = maps[p].get(shape) || {};
      (isPrev ? cell.previewUrl = base+path : cell.url = base+path);
      maps[p].set(shape, cell);
      added++;
    }
    log('grouped counts: '+JSON.stringify(Object.fromEntries(parts.map(p=>[p, maps[p].size]))));
    log('added entries: '+added);
    if(added===0){ log('❌ no assets detected.'); return; }

    // 첫 이미지 그리기
    const firstPart = parts.find(p=>maps[p].size>0);
    const firstCell = maps[firstPart].values().next().value;
    const firstUrl = firstCell.url || firstCell.previewUrl;
    log('draw first: '+firstPart+' -> '+firstUrl);

    const c = document.getElementById('canvas');
    const ctx = c.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled=false;

    const loadImg = (src)=>new Promise((ok,err)=>{
      const img=new Image(); img.crossOrigin='anonymous';
      img.onload=()=>ok(img); img.onerror=()=>{log('❌ img error: '+src); err(new Error('img'));};
      img.src=src;
    });
    try{
      const img = await loadImg(firstUrl);
      ctx.clearRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      log('✅ first image drawn on canvas');
    }catch(e){ log('❌ draw failed'); }

    // 썸네일 24개
    const grid = document.getElementById('grid');
    let shown=0;
    for(const p of parts){
      for(const cell of maps[p].values()){
        const u = cell.previewUrl || cell.url; if(!u) continue;
        const im = document.createElement('img');
        im.loading='lazy'; im.alt=p; im.src=u; grid.appendChild(im);
        if(++shown>=24) break;
      }
      if(shown>=24) break;
    }
    log('preview shown: '+shown);
  }catch(err){
    log('❌ fatal: '+(err&&err.message||err));
  }
})();
