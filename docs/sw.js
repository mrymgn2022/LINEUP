// Squad XI service worker
// 目的: (1) オフラインでも起動できる (2) 2回目以降はキャッシュから即時起動
// 方針: 本番 = stale-while-revalidate（キャッシュを即返し、裏で最新を取得→次回反映）
//       開発(localhost) = network-first（編集が常に反映。落ちた時だけキャッシュ）
// 注意: 外部オリジン（人気度APIのCloudflare Worker、Web Analyticsビーコン等）には一切触らない
const CACHE='squadxi-v131'; // v131: 自分で貼った写真が盤面に出ない不具合を修正。photoOfが「通常(normal)」でも端末ローカル写真を隠していたため、版数長押しで一度でもモードを切り替えた端末(主にスマホ)は以後どれだけ写真を設定しても反映されなかった(成功トーストだけ出る)。隠すのは「ユーザー視点(user)」のみに変更＝未設定の一般ユーザーと同じ挙動に統一。あわせて(a)canvasのtoDataURL失敗(iOSのメモリ不足/汚染)を握り潰さず「画像を読み込めませんでした」を表示 (b)userモードで設定した時は盤面に出ない理由をトーストで明示。 v130: ベンチ外どうしの入れ替えを実装(ドラッグ&「この選手を入れ替える」)。従来はベンチ外が市場価値の自動並びで順序を持てず、ドラッグは無反応・メニューは「交代を取り消し」になっていた。state.reserveOrderに順序を保存し保存/共有でも維持。 v129: ベンチ外どうしの入れ替えを実装(ドラッグ&「この選手を入れ替える」)。従来はベンチ外が市場価値の自動並びで順序を持てず、ドラッグは無反応・メニューは「交代を取り消し」になっていた。state.reserveOrderに順序を保存し保存/共有でも維持。 v129: プレミアム未実装のため関連UIを撤去=ドロワーの「プレミアム(近日公開)」/案内ページ/保存上限の「プレミアムにする」ボタン、および負傷・カード(駒メニュー/盤面/共有画像/共有トグル)。データ層(state.marks・保存・深リンク)とMARKS_ENABLEDフラグは温存し再開時に戻せる形。 v128: 表示切替(ポジション名/国旗/第2候補/メモ/ベンチ/マーカー)では「未保存の変更」ランプを点けないよう isDirty から除外。保存内容は従来どおり(次回も同じ見え方で復元)。 v127: 保存スカッドの削除確認をドロワーの下でなく盤面上に表示(closeDrawer後にopenSheet)。ドロワーの暗幕z:72が確認シートz:60を覆い確認ボタンが画面外に押し出されていた問題を解消。 v126: アトレティコ更新(AiScore突合)＝イ・ガンインPSG→アトレティコ移籍(DB)・バエナ25歳・サイトにガンイン/ソラ追加＋ナヘラ削除(日英)。 v125: ショーケースのポジション名を初期非表示に統一(深リンク流入と同じ初見画面・表示切替でON可)。管理者同期(浦和/ガンバ)＝差分39枚のみFACE化＋CLUB_XI(浦和subs付与・ガンバ新規4-2-3-1)＋CLUB_BENCH各15人＋第2候補subs9/11＋盤面2枚＋深リンク17本(日英+特集記事)。ガンバのピッチ図SVG→実盤面画像化・フォメ表記4-2-3-1へ。 v124: 管理者同期(鹿島/横浜FM)＝写真58枚を差分だけFACE化(240px)＋CLUB_XI(鹿島更新・横浜FM新規4-2-3-1)＋CLUB_BENCH各15人＋第2候補subs11/11＋CLUB_NAMES＋盤面2枚(1440x2320)＋深リンク9本(日英)。横浜FMのピッチ図をSVG→実盤面画像に置換。 v123: 初回ショーケースのクラブをユベントス/ミラン→チェルシー/バイエルンに差し替え(SHOWCASE_CLUBS)。 v122: 第2候補(第2候補)を自動配置＋深リンク両方に反映。CLUB_XIにsubs追加＋placeClubSquad/hydrateSiteSquadが明示subを尊重(初期非表示・2ndで表示)。7クラブ深リンク56本にsub埋込。盤面画像はスタメンのみ据置。 v121: 7クラブ写真同期(Chelsea/Arsenal/Real/City/Liverpool/Barca/Bayern)＝FACE160枚再生成＋新規19＋盤面7枚＋CLUB_BENCH(Chelsea/Bayern新規・Liverpool並替)＋深リンク24本ベンチ埋込。 v120: 管理者メニューの写真並びを 編集→貼付→検索 に／長押しを3秒に／連打後のPIN画面を6秒ロック(スクリム/スワイプで即閉じしない)。 v119: 3段モード(通常/ユーザー/管理者)。長押しで通常⇄ユーザー、ユーザーで5連打+PIN(7324)→管理者。管理者のみローカル写真表示＋編集特化メニュー。統計は通常のみ集計。 v118: 管理者モード(旧「収集オフ」)ON時、ベンチ/ベンチ外メニューの写真グループを最上部に。端末ローカル・切替で元に戻る。 v117: 貼付済み写真の再編集(写真を編集/詳細の顔写真タップ)＋「この選手を入れ替える」に文言変更。 v116: 写真の位置調整をズーム(ピンチ/ホイール/スライダー)＋2D移動対応に拡張。全画像で調整シートを表示。 v115: 古い版を掴んだ端末の一掃（t is not a function 残党対策）＋JSエラービーコンに発生箇所(関数名/行番号)を追加。 v86: X(4:5)ベンチ非表示の共有画像を横幅いっぱいレイアウトに(左右デッドスペース廃止)。v65: メンバーサイトから装飾絵文字(🏆バッジ)撤去。国旗のみ残す方針
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
