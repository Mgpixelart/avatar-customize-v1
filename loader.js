// loader.js — same-origin 로더 + 폴백 UI (CSP 친화)
(async function(){
  const user = 'Mgpixelart';
  const repo = 'avatar-customize-v1';
  const ref  = 'main';
  const parts = ['face','skin','hair','clothes','glass'];
  const base = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${ref}/`;

  // 목록 API (jsDelivr Data API)
  const listURL = `https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${ref}/flat`;
  console.log('[loader] listURL =', listURL);
  const res = await fetch(listURL, { cache: 'no-store' });
  if (!res.ok) {
    console.error('[loader] list failed', res.status, res.statusText);
    return;
  }
  const { files } = await res.json();
  console.log('[loader] files =', files.length);

  // store 준비
  if (!window.store) window.store = {};
  store.assets = store.assets || {};
  store.pick   = store.pick   || {};
  parts.forEach(p => store.assets[p] = new Map());

  // 파일 분류
  let added = 0;
  for (const f of files) {
    let path = (f.name || '').replace(/^\/+/, '');   // "/assets/..." → "assets/..."
    if (!/\.webp$/i.test(path)) continue;

    const lower = path.toLowerCase();
    const part = parts.find(p => lower.includes(`/${p}/`));
    if (!part) continue;

    const file = path.split('/').pop() || '';
    const m = file.match(/-?\d+/);
    if (!m) continue;
    const shape = parseInt(m[0], 10);

    const url = base + path;
    const isPreview = /preview/i.test(file);

    const map = store.assets[part];
    let cell = map.get(shape);
    if (!cell) { cell = { url: null, previewUrl: null, name: file }; map.set(shape, cell); }
    if (isPreview) cell.previewUrl = url; else cell.url = url;
    if (!cell.previewUrl) cell.previewUrl = cell.url;

    added++;
  }
  console.log('[loader] grouped ->',
    Object.fromEntries(parts.map(p => [p, store.assets[p].size])),
    'added =', added
  );

  // 간단 폴백 UI 생성(그리드 + 캔버스)
  ensureFallbackUI(parts);
})();

function ensureFallbackUI(partsOrder){
  // 사용 가능 파트
  const available = partsOrder.filter(p => store.assets[p] && store.assets[p].size>0);
  if (!available.length) {
    console.warn('[fallback] no assets');
    return;
  }

  // 캔버스
  let c = document.getElementById('autoCanvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'autoCanvas';
    c.width = 64; c.height = 64;
    Object.assign(c.style, {
      imageRendering: 'pixelated',
      width: '256px', height: '256px',
      border: '1px solid #ddd', background: '#f8f8f8', display:'block', margin:'12px 0'
    });
    document.body.appendChild(c);
  }
  const ctx = c.getContext('2d', { willReadFrequently:true });
  ctx.imageSmoothingEnabled = false;

  // 패널
  let p = document.getElementById('autoPanel');
  if (!p) {
    p = document.createElement('div');
    p.id = 'autoPanel';
    p.innerHTML = `
      <div style="font:14px system-ui,sans-serif;padding:8px;border-top:1px solid #eee">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
          <strong>Auto Loader</strong>
          <span id="autoStatus" style="opacity:.7"></span>
        </div>
        <div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
          <div id="autoParts" style="display:flex;gap:6px"></div>
        </div>
        <div id="autoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:6px;max-height:220px;overflow:auto;border:1px solid #eee;padding:6px"></div>
      </div>
    `;
    document.body.appendChild(p);
  }
  const elParts = document.getElementById('autoParts');
  const elGrid  = document.getElementById('autoGrid');
  const elStatus= document.getElementById('autoStatus');

  // pick 초기화
  store.pick = store.pick || {};
  for (const part of available) {
    if (store.pick[part] == null) {
      const first = [...store.assets[part].keys()].sort((a,b)=>a-b)[0];
      store.pick[part] = first;
    }
  }

  // 상태
  (function updateStatus(){
    const counts = Object.fromEntries(partsOrder.map(p => [p, store.assets[p]?.size||0]));
    elStatus.textContent = ' — loaded: ' + JSON.stringify(counts);
    console.log('[fallback] counts', counts);
  })();

  // 렌더 합성
  async function renderCompose(){
    ctx.clearRect(0,0,c.width,c.height);
    for (const part of partsOrder) {
      const shape = store.pick[part];
      const map = store.assets[part];
      if (!map || shape==null) continue;
      const cell = map.get(shape);
      const url = cell?.url || cell?.previewUrl;
      if (!url) continue;
      const img = await loadImg(url);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
  }
  function loadImg(src){
    return new Promise((ok, err)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>ok(img);
      img.onerror = (e)=>{ console.error('[img error]', src, e); err(e); };
      img.src = src;
    });
  }

  // 탭
  let currentPart = available[0];
  function drawTabs(){
    elParts.innerHTML = '';
    for (const part of available) {
      const b = document.createElement('button');
      b.textContent = `${part} (${store.assets[part].size})`;
      b.style.cssText='padding:6px 10px;border:1px solid #ddd;background:#fafafa;cursor:pointer';
      if (part===currentPart){ b.style.background='#222'; b.style.color='#fff'; }
      b.onclick = ()=>{ currentPart = part; drawTabs(); drawGrid(); };
      elParts.appendChild(b);
    }
  }

  // 그리드
  function drawGrid(){
    elGrid.innerHTML = '';
    const entries = [...store.assets[currentPart].entries()].sort((a,b)=>a[0]-b[0]);
    for (const [shape, cell] of entries) {
      const div = document.createElement('div');
      div.style.cssText='border:1px solid #ddd;background:#fff;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;cursor:pointer';
      const img = document.createElement('img');
      img.alt = `${currentPart}:${shape}`;
      img.src = cell.previewUrl || cell.url;
      img.style.cssText='image-rendering:pixelated;width:100%;height:100%;object-fit:contain';
      div.title = `${currentPart}:${shape}`;
      div.onclick = async ()=>{ store.pick[currentPart]=shape; await renderCompose(); };
      div.appendChild(img);
      elGrid.appendChild(div);
    }
  }

  drawTabs();
  drawGrid();
  renderCompose().catch(console.error);
}
