// loader.js — GitHub→jsDelivr 자동 로더 + 폴백 UI (CSP-safe, no eval)
(async function(){
  /* ── 설정 ─────────────────────────────────────────── */
  const USER = 'Mgpixelart';
  const REPO = 'avatar-customize-v1';
  const REF  = 'main';                  // 태그 쓰면 예: 'v1'
  const PARTS = ['face','skin','hair','clothes','glass'];
  const BASE  = `https://cdn.jsdelivr.net/gh/${USER}/${REPO}@${REF}/`;
  const LIST  = `https://data.jsdelivr.com/v1/package/gh/${USER}/${REPO}@${REF}/flat`;
  const ENABLE_FALLBACK_UI = true;      // 필요 없으면 false

  /* ── 목록 불러오기 ─────────────────────────────────── */
  console.log('[loader] list =', LIST);
  const r = await fetch(LIST, { cache:'no-store' });
  if (!r.ok) { console.error('[loader] list failed', r.status, r.statusText); return; }
  const { files } = await r.json();
  console.log('[loader] files:', files.length);

  /* ── store 준비 ───────────────────────────────────── */
  if (!window.store) window.store = {};
  const S = window.store;
  S.assets ??= {};
  S.pick   ??= {};
  PARTS.forEach(p => (S.assets[p] ??= new Map()));

  /* ── 파일 분류 (Map: shape → {url, previewUrl, name}) ─ */
  let added = 0;
  for (const f of files) {
    let path = (f.name || '').replace(/^\/+/, '');     // "/assets/..." → "assets/..."
    if (!/\.webp$/i.test(path)) continue;

    const p = PARTS.find(x => path.toLowerCase().includes(`/${x}/`));
    if (!p) continue;

    const file = path.split('/').pop() || '';
    const m = file.match(/-?\d+/);                      // -672, 15 등
    if (!m) continue;
    const shape = parseInt(m[0], 10);

    const url = BASE + path;
    const isPrev = /preview/i.test(file);

    let cell = S.assets[p].get(shape);
    if (!cell) { cell = { url:null, previewUrl:null, name:file }; S.assets[p].set(shape, cell); }
    if (isPrev) cell.previewUrl = url; else cell.url = url;
    if (!cell.previewUrl) cell.previewUrl = cell.url;

    added++;
  }

  console.log('[loader] grouped =',
    Object.fromEntries(PARTS.map(p => [p, S.assets[p].size])),
    'added =', added
  );

  /* ── 호환 계층 (배열/객체 별칭 제공) ────────────────── */
  __compatExpose(PARTS);

  /* ── 초기 선택값 ───────────────────────────────────── */
  for (const p of PARTS) {
    if (S.pick[p] != null) continue;
    const keys = [...S.assets[p].keys()].sort((a,b)=>a-b);
    if (keys.length) S.pick[p] = keys[0];
  }

  /* ── 색 버킷(있을 때만) ───────────────────────────── */
  if (typeof window.colorIdxFromShape === 'function') {
    if (S.pick.hair != null) S.color = window.colorIdxFromShape(S.pick.hair);
    else if (S.pick.clothes != null) S.color = window.colorIdxFromShape(S.pick.clothes);
  }

  /* ── 기존 렌더 플로우 지원(있을 때만) ─────────────── */
  if (typeof window.selectPart === 'function') {
    const firstPart = PARTS.find(p => S.assets[p]?.size > 0) || 'face';
    window.selectPart(firstPart);
  }
  if (typeof window.drawSheet === 'function') await window.drawSheet();
  if (typeof window.buildGrid === 'function') window.buildGrid();

  /* ── 준비 완료 이벤트 ─────────────────────────────── */
  window.dispatchEvent(new CustomEvent('assets-ready', { detail:{ parts: PARTS } }));

  /* ── 폴백 UI(선택) ─────────────────────────────────── */
  if (ENABLE_FALLBACK_UI) attachFallbackUI(PARTS);
})();

/* ===== 호환 계층: Map → Array/Object + 별칭 ===== */
function __compatExpose(parts){
  const S = window.store;
  S.assetsArray = Object.fromEntries(parts.map(p=>{
    const arr = [...(S.assets[p]||new Map()).entries()]
      .sort((a,b)=>a[0]-b[0])
      .map(([shape, cell])=>({ shape,
        url: cell?.url || null,
        previewUrl: cell?.previewUrl || cell?.url || null,
        name: cell?.name || String(shape)
      }));
    return [p, arr];
  }));
  S.assetsPlain = Object.fromEntries(parts.map(p=>{
    const obj = {};
    for (const [shape, cell] of (S.assets[p]||new Map()).entries()){
      obj[shape] = {
        url: cell?.url || null,
        previewUrl: cell?.previewUrl || cell?.url || null,
        name: cell?.name || String(shape)
      };
    }
    return [p, obj];
  }));
  S.list  = S.list  || S.assetsArray;
  S.items = S.items || S.assetsArray;
  S.data  = S.data  || S.assetsPlain;
}

/* ===== 폴백 UI: 캔버스 합성 + 썸네일 그리드 ===== */
function attachFallbackUI(order){
  const S = window.store;

  const available = order.filter(p => S.assets[p] && S.assets[p].size>0);
  if (!available.length) { console.warn('[fallback] no assets'); return; }

  // 캔버스
  let c = document.getElementById('autoCanvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'autoCanvas';
    c.width = 64; c.height = 64;
    Object.assign(c.style, {
      imageRendering:'pixelated', width:'256px', height:'256px',
      border:'1px solid #ddd', background:'#f8f8f8', display:'block', margin:'12px 0'
    });
    document.body.appendChild(c);
  }
  const ctx = c.getContext('2d', { willReadFrequently:true });
  ctx.imageSmoothingEnabled = false;

  // 패널
  let panel = document.getElementById('autoPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'autoPanel';
    panel.innerHTML = `
      <div style="font:14px system-ui,sans-serif;padding:8px;border-top:1px solid #eee">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
          <strong>Auto Loader</strong>
          <span id="autoStatus" style="opacity:.7"></span>
        </div>
        <div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
          <div id="autoParts" style="display:flex;gap:6px"></div>
        </div>
        <div id="autoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:6px;max-height:220px;overflow:auto;border:1px solid #eee;padding:6px"></div>
      </div>`;
    document.body.appendChild(panel);
  }
  const elParts  = document.getElementById('autoParts');
  const elGrid   = document.getElementById('autoGrid');
  const elStatus = document.getElementById('autoStatus');

  // pick 기본값
  S.pick ??= {};
  for (const p of available) {
    if (S.pick[p] == null) {
      const first = [...S.assets[p].keys()].sort((a,b)=>a-b)[0];
      S.pick[p] = first;
    }
  }

  // 상태
  (function(){
    const counts = Object.fromEntries(order.map(p => [p, S.assets[p]?.size||0]));
    elStatus.textContent = ' — loaded: ' + JSON.stringify(counts);
    console.log('[fallback] counts', counts);
  })();

  // 이미지 로더
  function loadImg(src){
    return new Promise((ok, err)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>ok(img);
      img.onerror = (e)=>{ console.error('[img error]', src, e); err(e); };
      img.src = src;
    });
  }

  async function renderCompose(){
    ctx.clearRect(0,0,c.width,c.height);
    for (const p of order) {
      const map = S.assets[p];
      const shape = S.pick[p];
      if (!map || shape==null) continue;
      const cell = map.get(shape);
      const url = cell?.url || cell?.previewUrl;
      if (!url) continue;
      try{
        const img = await loadImg(url);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      }catch(e){}
    }
  }

  // 탭
  let current = available[0];
  function drawTabs(){
    elParts.innerHTML = '';
    for (const p of available) {
      const b = document.createElement('button');
      b.textContent = `${p} (${S.assets[p].size})`;
      b.style.cssText='padding:6px 10px;border:1px solid #ddd;background:#fafafa;cursor:pointer';
      if (p===current){ b.style.background='#222'; b.style.color='#fff'; }
      b.onclick = ()=>{ current = p; drawTabs(); drawGrid(); };
      elParts.appendChild(b);
    }
  }

  // 그리드
  function drawGrid(){
    elGrid.innerHTML = '';
    const entries = [...S.assets[current].entries()].sort((a,b)=>a[0]-b[0]);
    for (const [shape, cell] of entries) {
      const box = document.createElement('div');
      box.style.cssText='border:1px solid #ddd;background:#fff;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;cursor:pointer';
      const img = document.createElement('img');
      img.src = cell.previewUrl || cell.url;
      img.alt = `${current}:${shape}`;
      img.style.cssText='image-rendering:pixelated;width:100%;height:100%;object-fit:contain';
      box.title = `${current}:${shape}`;
      box.onclick = async ()=>{ S.pick[current] = shape; await renderCompose(); };
      box.appendChild(img);
      elGrid.appendChild(box);
    }
  }

  drawTabs();
  drawGrid();
  renderCompose().catch(console.error);
}
