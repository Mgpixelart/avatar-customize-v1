// loader.js — 외부 로더 스크립트
(async function(){
  const user = 'Mgpixelart';
  const repo = 'avatar-customize-v1';
  const ref  = 'main';
  const parts = ['face','skin','hair','clothes','glass'];
  const base = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${ref}/`;

  console.log('[loader] start');
  const res = await fetch(`https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${ref}/flat`);
  const { files } = await res.json();
  console.log('[loader] total files:', files.length);

  const store = window.store = { assets:{}, pick:{} };
  parts.forEach(p => store.assets[p] = new Map());

  for(const f of files){
    let path = f.name.replace(/^\/+/, '');
    if(!path.endsWith('.webp')) continue;
    const part = parts.find(p => path.includes(`/${p}/`));
    if(!part) continue;
    const file = path.split('/').pop();
    const id = parseInt((file.match(/-?\d+/)||['0'])[0]);
    const isPreview = /preview/i.test(file);
    const cell = store.assets[part].get(id) || {};
    (isPreview ? cell.previewUrl = base+path : cell.url = base+path);
    store.assets[part].set(id, cell);
  }

  // 간단 테스트용 캔버스
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  c.style.cssText='image-rendering:pixelated;width:256px;height:256px;border:1px solid #ddd;';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled=false;

  // 첫 번째 파트 아무거나 그려보기
  const firstPart = parts.find(p => store.assets[p].size>0);
  if(!firstPart){console.warn('no parts');return;}
  const first = [...store.assets[firstPart].values()][0];
  const img = new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>ctx.drawImage(img,0,0,64,64);
  img.src = first.url || first.previewUrl;

  console.log('[loader] done', firstPart);
})();
