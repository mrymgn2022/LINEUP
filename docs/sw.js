// Squad XI service worker
// 目的: (1) オフラインでも起動できる (2) 2回目以降はキャッシュから即時起動
// 方針: 本番 = stale-while-revalidate（キャッシュを即返し、裏で最新を取得→次回反映）
//       開発(localhost) = network-first（編集が常に反映。落ちた時だけキャッシュ）
// 注意: 外部オリジン（人気度APIのCloudflare Worker、Web Analyticsビーコン等）には一切触らない
const CACHE='squadxi-v103'; // v86: X(4:5)ベンチ非表示の共有画像を横幅いっぱいレイアウトに(左右デッドスペース廃止)。v65: メンバーサイトから装飾絵文字(🏆バッジ)撤去。国旗のみ残す方針
const CORE=['./index.html','./data/players.js','./favicon.png','./privacy.html','./privacy.en.html','./terms.html','./terms.en.html',
  './fonts/manrope-latin.woff2','./fonts/manrope-latin-ext.woff2','./fonts/bebas-latin.woff2','./fonts/bebas-latin-ext.woff2',
  './vendor/flag-icons/css/flag-icons.min.css']; // 国旗SVG本体(270枚)は事前キャッシュせず、表示したものから実行時キャッシュ（SWRのput）で貯める
const DEV=(self.location.hostname==='localhost'||self.location.hostname==='127.0.0.1');

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{})); // 一部失敗しても起動は妨げない
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return; // 外部リクエストは素通し（キャッシュしない）
  // ルートへのナビゲーションはアプリ本体(index.html)として1キーに集約（"/"と"/index.html"の二重キャッシュ防止）
  let key=req;
  if(req.mode==='navigate'){ const p=url.pathname; if(p==='/'||p==='/index.html') key='./index.html'; }
  if(DEV){
    e.respondWith(
      fetch(req).then(r=>{ if(r&&r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(key,cp)).catch(()=>{}); } return r; })
        .catch(()=>caches.match(key))
    );
    return;
  }
  e.respondWith(
    caches.match(key).then(hit=>{
      const refresh=fetch(req).then(r=>{ if(r&&r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(key,cp)).catch(()=>{}); } return r; }).catch(()=>null);
      return hit || refresh.then(r=>r||new Response('offline',{status:503,statusText:'offline'}));
    })
  );
});
