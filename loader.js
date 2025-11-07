// loader.js — GitHub Trees API + raw.githubusercontent.com (CSP-safe, no eval)
// 요구사항: 자동 오버레이 팝업/토글 전부 제거. 자산만 불러와 UI 훅(selectPart/drawSheet/buildGrid) 호출.

(async function () {
  /* ── 설정 ─────────────────────────────────────────── */
  const USER  = 'Mgpixelart';
  const REPO  = 'avatar-customize-v1';
  const REF   = 'main';                 // 태그/브랜치 가능
  const PARTS = ['face','skin','hair','clothes','glass'];

  // 목록: GitHub Trees API / 이미지: raw.githubusercontent.com
  const LIST = `https://api.github.com/repos/${USER}/${REPO}/git/trees/${REF}?recursive=1`;
  const BASE = `https://raw.githubusercontent.com/${USER}/${REPO}/${REF}/`;

  /* ── 목록 로드 ─────────────────────────────────────── */
  console.log('[loader] list =', LIST);
  const resp = await fetch(LIST, { cache: 'no-store' });
  if (!resp.ok) {
    console.error('[loader] list failed', resp.status, resp.statusText);
    return;
  }
  const data = await resp.json();
  const files = (data.tree || [])
    .filter(n => n.type === 'blob')
    .map(n => ({ name: n.path }));
  console.log('[loader] files:', files.length);

  /* ── store 준비 ───────────────────────────────────── */
  const S = (window.store = window.store || {});
  S.assets ??= {};
  S.pick   ??= {};
  PARTS.forEach(p => (S.assets[p] ??= new Map()));

  /* ── 분류 (Map: shape → {url, previewUrl, name}) ──── */
  let added = 0;
  for (const f of files) {
    const path = (f.name || '').replace(/^\/+/, '');      // "assets/..."
    if (!/\.webp$/i.test(path)) continue;

    const lower = path.toLowerCase();
    const part = PARTS.find(p => lower.includes(`/${p}/`));
    if (!part) continue;

    const file = path.split('/').pop() || '';
    const m = file.match(/-?\d+/);
    if (!m) continue;

    const shape = parseInt(m[0], 10);
    const url   = BASE + path;
    const isPrev = /preview/i.test(file);

    let cell = S.assets[part].get(shape);
    if (!cell) {
      cell = { url: null, previewUrl: null, name: file };
      S.assets[part].set(shape, cell);
    }
    if (isPrev) cell.previewUrl = url; else cell.url = url;
    if (!cell.previewUrl) cell.previewUrl = cell.url;

    added++;
  }

  console.log(
    '[loader] grouped =',
    Object.fromEntries(PARTS.map(p => [p, S.assets[p].size])),
    'added =', added
  );

  /* ── 호환 계층(배열/객체/별칭) ────────────────────── */
  exposeCompat(PARTS);

  /* ── 초기 선택값 ───────────────────────────────────── */
  for (const p of PARTS) {
    if (S.pick[p] != null) continue;
    const keys = [...S.assets[p].keys()].sort((a,b)=>a-b);
    if (!keys.length) continue;
    // 선호: -1 존재 시 우선, 없으면 첫 키
    S.pick[p] = S.assets[p].has(-1) ? -1 : keys[0];
  }

  /* ── 기존 UI 훅(있을 때만) ───────────────────────── */
  const firstPart = PARTS.find(p => S.assets[p]?.size > 0) || 'face';
  try { typeof window.selectPart === 'function' && window.selectPart(firstPart); } catch {}
  try { typeof window.drawSheet  === 'function' && await window.drawSheet(); } catch {}
  try { typeof window.buildGrid  === 'function' && window.buildGrid(); } catch {}

  /* ── 준비 이벤트 ──────────────────────────────────── */
  window.dispatchEvent(new CustomEvent('assets-ready', { detail: { parts: PARTS } }));

  // NOTE:
  // 자동 오버레이/토글(attachOverlayFallback, openAssetsOverlay 등) 의도적으로 제거.
  // 필요 시 별도 파일에서 명시적으로 import/호출할 것.
})();

/* ===== 호환 계층: Map → Array/Object + 별칭 ===== */
function exposeCompat(parts){
  const S = window.store;

  S.assetsArray = Object.fromEntries(parts.map(p=>{
    const arr = [...(S.assets[p] || new Map()).entries()]
      .sort((a,b)=>a[0]-b[0])
      .map(([shape, cell])=>({
        shape,
        url:        cell?.url || null,
        previewUrl: cell?.previewUrl || cell?.url || null,
        name:       cell?.name || String(shape)
      }));
    return [p, arr];
  }));

  S.assetsPlain = Object.fromEntries(parts.map(p=>{
    const obj = {};
    for (const [shape, cell] of (S.assets[p] || new Map()).entries()){
      obj[shape] = {
        url:        cell?.url || null,
        previewUrl: cell?.previewUrl || cell?.url || null,
        name:       cell?.name || String(shape)
      };
    }
    return [p, obj];
  }));

  // 레거시 별칭(무엇을 읽든 한쪽은 맞게)
  S.list     = S.list     || S.assetsArray;
  S.items    = S.items    || S.assetsArray;
  S.data     = S.data     || S.assetsPlain;
  S.manifest = S.manifest || Object.fromEntries(parts.map(p=>[p, S.assetsArray[p]]));
}
