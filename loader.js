// loader.js — jsDelivr 자동 로더 + 고정 오버레이 폴백 + 전역 호환셋
(async function(){
  const USER='Mgpixelart', REPO='avatar-customize-v1', REF='main';
  const PARTS=['face','skin','hair','clothes','glass'];
  const BASE=`https://cdn.jsdelivr.net/gh/${USER}/${REPO}@${REF}/`;
  const LIST=`https://data.jsdelivr.net/v1/package/gh/${USER}/${REPO}@${REF}/flat`;

  const resp = await fetch(LIST, { cache:'no-store' });
  if(!resp.ok){ console.error('[loader] list failed', resp.status, resp.statusText); return; }
  const { files } = await resp.json();

  // store 준비
  const S = (window.store = window.store || {});
  S.assets = S.assets || {};
  S.pick   = S.pick   || {};
  PARTS.forEach(p => (S.assets[p] = S.assets[p] || new Map()));

  // 분류
  let added=0;
  for(const f of files){
    let path=(f.name||'').replace(/^\/+/, '');
    if(!/\.webp$/i.test(path)) continue;
    const lower=path.toLowerCase();
    const part = PARTS.find(p=>lower.includes(`/${p}/`));
    if(!part) continue;
    const file = path.split('/').pop()||'';
    const m = file.match(/-?\d+/); if(!m) continue;
    const shape = parseInt(m[0],10);
    const cell = S.assets[part].get(shape) || { url:null, previewUrl:null, name:file };
    ( /preview/i.test(file) ? (cell.previewUrl = BASE+path) : (cell.url = BASE+path) );
    if(!cell.previewUrl) cell.previewUrl = cell.url;
    S.assets[part].set(shape, cell);
    added++;
  }
  console.log('[loader] grouped =',
    Object.fromEntries(PARTS.map(p=>[p, S.assets[p].size])), 'added =', added);

  // ===== 전역 호환 셋 (무엇을 읽든 대응) =====
  // Map → Array
  S.assetsArray = Object.fromEntries(PARTS.map(p=>{
    const arr=[...(S.assets[p]||new Map()).entries()]
      .sort((a,b)=>a[0]-b[0])
      .map(([shape,cell])=>({shape, url:cell.url||null, previewUrl:cell.previewUrl||cell.url||null, name:cell.name||String(shape)}));
    return [p, arr];
  }));
  // Map → Plain Object
  S.assetsPlain = Object.fromEntries(PARTS.map(p=>{
    const obj={};
    for(const [shape,cell] of (S.assets[p]||new Map()).entries()){
      obj[shape]={ url:cell.url||null, previewUrl:cell.previewUrl||cell.url||null, name:cell.name||String(shape) };
    }
    return [p,obj];
  }));
  // 레거시 별칭(많이 쓰는 키들 전부 깔아줌)
  S.list  = S.list  || S.assetsArray;
  S.items = S.items || S.assetsArray;
  S.data  = S.data  || S.assetsPlain;
  S.manifest = S.manifest || Object.fromEntries(PARTS.map(p=>[p, S.assetsArray[p]]));

  // 선택값 기본
  for(const p of PARTS){
    if(S.pick[p]!=null) continue;
    const first=[...S.assets[p].keys()].sort((a,b)=>a-b)[0];
    if(first!=null) S.pick[p]=first;
  }

  // 기존 함수가 있다면 호출
  if(typeof window.selectPart==='function'){
    const first=PARTS.find(p=>S.assets[p]?.size>0) || 'face';
    window.selectPart(first);
  }
  if(typeof window.drawSheet==='function'){ try{ await window.drawSheet(); }catch{} }
  if(typeof window.buildGrid==='function'){ try{ window.buildGrid(); }catch{} }

  // 준비 이벤트
  window.dispatchEvent(new CustomEvent('assets-ready', { detail:{parts:PARTS} }));

  // ======== 고정 오버레이 폴백 UI (화면에 무조건 보이게) ========
  attachOverlayFallback(PARTS);
})();

// 고정 오버레이
function attachOverlayFallback(order){
  const S = window.store;
  const avail = order.filter(p=>S.assets[p] && S.assets[p].size>0);
  if(!avail.length) return;

  // 오버레이 컨테이너
  let wrap=document.getElementById('autoOverlay');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='autoOverlay';
    Object.assign(wrap.style,{
      position:'fixed', right:'12px', bottom:'12px', zIndex:999999,
      width:'360px', maxHeight:'70vh', background:'rgba(20,22,28,.98)',
      color:'#eee', border:'1px solid #333', borderRadius:'10px',
      boxShadow:'0 6px 24px rgba(0,0,0,.35)', overflow:'hidden', font:'12px system-ui,sans-serif'
    });
    wrap.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#14161c;border-bottom:1px solid #2a2d36">' +
      '<strong style="font-weight:600;">Assets</strong>' +
      '<span id="ovStatus" style="opacity:.7"></span>' +
      '<button id="ovClose" style="margin-left:auto;background:#222;color:#ddd;border:1px solid #444;border-radius:6px;padding:4px 8px;cursor:pointer">Hide</button>' +
      '</div>' +
      '<canvas id="ovCanvas" width="64" height="64" style="image-rendering:pixelated;width:128px;height:128px;border:1px solid #2a2d36;background:#0f1117;margin:10px"></canvas>' +
      '<div id="ovTabs" style="display:flex;gap:6px;flex-wrap:wrap;padding:0 10px 6px"></div>' +
      '<div id="ovGrid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px;overflow:auto;max-height:40vh"></div>';
    document.body.appendChild(wrap);
    document.getElementById('ovClose').onclick=()=>{ wrap.style.display='none'; };
  }

  const ctx=document.getElementById('ovCanvas').getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=false;
  const ovStatus=document.getElementById('ovStatus');
  const ovTabs=document.getElementById('ovTabs');
  const ovGrid=document.getElementById('ovGrid');

  ovStatus.textContent=' ' + JSON.stringify(Object.fromEntries(order.map(p=>[p,S.assets[p]?.size||0])));

  S.pick ||= {};
  for(const p of avail){
    if(S.pick[p]==null){
      const first=[...S.assets[p].keys()].sort((a,b)=>a-b)[0];
      S.pick[p]=first;
    }
  }

  function btn(label,active){
    const b=document.createElement('button');
    b.textContent=label;
    Object.assign(b.style,{
      padding:'4px 8px', border:'1px solid #3a3f4a', borderRadius:'6px',
      background: active ? '#3a6ff0' : '#1b1f2a', color: active ? '#fff' : '#cdd3e0',
      cursor:'pointer'
    });
    return b;
  }

  let cur=avail[0];
  function drawTabs(){
    ovTabs.innerHTML='';
    for(const p of avail){
      const b=btn(`${p} (${S.assets[p].size})`, p===cur);
      b.onclick=()=>{ cur=p; drawTabs(); drawGrid(); };
      ovTabs.appendChild(b);
    }
  }

  function drawGrid(){
    ovGrid.innerHTML='';
    const entries=[...S.assets[cur].entries()].sort((a,b)=>a[0]-b[0]);
    for(const [shape,cell] of entries){
      const box=document.createElement('div');
      Object.assign(box.style,{border:'1px solid #2a2d36',background:'#0f1117',aspectRatio:'1/1',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:'6px'});
      const img=document.createElement('img');
      img.src=cell.previewUrl||cell.url; img.alt=`${cur}:${shape}`;
      Object.assign(img.style,{imageRendering:'pixelated',width:'100%',height:'100%',objectFit:'contain'});
      box.title=`${cur}:${shape}`;
      box.onclick=async()=>{ S.pick[cur]=shape; await render(); };
      box.appendChild(img); ovGrid.appendChild(box);
    }
  }

  function loadImg(src){
    return new Promise((ok,err)=>{
      const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>ok(im); im.onerror=(e)=>{ console.error('[img error]',src,e); err(e); };
      im.src=src;
    });
  }

  async function render(){
    ctx.clearRect(0,0,64,64);
    for(const p of order){
      const map=S.assets[p]; const sh=S.pick[p];
      if(!map || sh==null) continue;
      const cell=map.get(sh); const url=cell?.url||cell?.previewUrl; if(!url) continue;
      try{ const im=await loadImg(url); ctx.drawImage(im,0,0,64,64); }catch{}
    }
  }

  drawTabs(); drawGrid(); render();
}
