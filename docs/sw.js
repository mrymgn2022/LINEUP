// Squad XI service worker
// 目的: (1) オフラインでも起動できる (2) 2回目以降はキャッシュから即時起動
// 方針: 本番 = stale-while-revalidate（キャッシュを即返し、裏で最新を取得→次回反映）
//       開発(localhost) = network-first（編集が常に反映。落ちた時だけキャッシュ）
// 注意: 外部オリジン（人気度APIのCloudflare Worker、Web Analyticsビーコン等）には一切触らない
const CACHE='squadxi-v122'; // v122: 第2候補(第2候補)を自動配置＋深リンク両方に反映。CLUB_XIにsubs追加＋placeClubSquad/hydrateSiteSquadが明示subを尊重(初期非表示・2ndで表示)。7クラブ深リンク56本にsub埋込。盤面画像はスタメンのみ据置。 v121: 7クラブ写真同期(Chelsea/Arsenal/Real/City/Liverpool/Barca/Bayern)＝FACE160枚再生成＋新規19＋盤面7枚＋CLUB_BENCH(Chelsea/Bayern新規・Liverpool並替)＋深リンク24本ベンチ埋込。 v120: 管理者メニューの写真並びを 編集→貼付→検索 に／長押しを3秒に／連打後のPIN画面を6秒ロック(スクリム/スワイプで即閉じしない)。 v119: 3段モード(通常/ユーザー/管理者)。長押しで通常⇄ユーザー、ユーザーで5連打+PIN(7324)→管理者。管理者のみローカル写真表示＋編集特化メニュー。統計は通常のみ集計。 v118: 管理者モード(旧「収集オフ」)ON時、ベンチ/ベンチ外メニューの写真グループを最上部に。端末ローカル・切替で元に戻る。 v117: 貼付済み写真の再編集(写真を編集/詳細の顔写真タップ)＋「この選手を入れ替える」に文言変更。 v116: 写真の位置調整をズーム(ピンチ/ホイール/スライダー)＋2D移動対応に拡張。全画像で調整シートを表示。 v115: 古い版を掴んだ端末の一掃（t is not a function 残党対策）＋JSエラービーコンに発生箇所(関数名/行番号)を追加。 v86: X(4:5)ベンチ非表示の共有画像を横幅いっぱいレイアウトに(左右デッドスペース廃止)。v65: メンバーサイトから装飾絵文字(🏆バッジ)撤去。国旗のみ残す方針
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
