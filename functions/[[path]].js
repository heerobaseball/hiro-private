import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html, raw } from 'hono/html';

// 分割した外部ファイルを読み込む
import { setupApi } from '../src/api.js';
import { setupTools } from '../src/tools.js';
import { setupDiary } from '../src/diary.js';

const app = new Hono();

// 各機能のセットアップを実行
setupApi(app); 
setupTools(app); 
setupDiary(app);

// --- PWA設定・チェックイン画面 ---
app.get('/manifest.json', c => c.json({ name: "My Dashboard", short_name: "Dashboard", start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#3b82f6", icons: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }], shortcuts: [{ name: "📍 チェックイン", short_name: "チェックイン", url: "/checkin", icons: [{ src: "/icon.svg", sizes: "192x192" }] }] }));
app.get('/sw.js', c => { c.header('Content-Type', 'application/javascript'); return c.body(`self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim()); self.addEventListener('fetch', e => {});`); });
app.get('/icon.svg', c => { c.header('Content-Type', 'image/svg+xml'); return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3b82f6" rx="112"/><text x="256" y="340" font-size="280" font-weight="bold" text-anchor="middle" fill="white" font-family="sans-serif">D</text></svg>`); });

app.get('/checkin', c => c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><meta name="theme-color" content="#3b82f6"><title>Check-in</title></head><body style="background:#f8fafc; color:#0f172a; text-align:center; padding-top:100px; font-family:sans-serif;"><h2 id="msg">📍 GPSで現在地を取得中...</h2><script>if(!navigator.geolocation) { alert('GPS非対応です'); window.location.href='/'; } navigator.geolocation.getCurrentPosition(async pos => { document.getElementById('msg').textContent = '📍 場所を特定中...'; const lat = pos.coords.latitude, lng = pos.coords.longitude; let locName = null; try { const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng); const data = await res.json(); if(data.address) locName = (data.address.province || data.address.state || '') + (data.address.city || data.address.town || data.address.village || '') + (data.address.suburb || data.address.quarter || ''); } catch(e) {} document.getElementById('msg').textContent = '💾 データベースに記録中...'; await fetch('/api/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat: lat, lng: lng, location_name: locName})}); window.location.href = '/'; }, () => { alert('位置情報の取得に失敗しました。'); window.location.href='/'; }, {enableHighAccuracy: true});</script></body></html>`));

// --- ダッシュボード（トップページ） ---
app.get('/', async (c) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const tDate = c.req.query('date') || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const start = new Date(`${tDate}T00:00:00+09:00`).getTime(), end = new Date(`${tDate}T23:59:59+09:00`).getTime();
  
  // D1から取得（※ToDoとメモはFirebaseでリアルタイム取得するためここからは除外）
  const [notes, chats, checkins, mapNotes] = await Promise.all([ 
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 10').all(), 
    c.env.DB.prepare('SELECT * FROM chats ORDER BY created_at DESC LIMIT 30').all(), 
    c.env.DB.prepare('SELECT * FROM checkins WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(start, end).all(), 
    c.env.DB.prepare('SELECT * FROM notes WHERE lat IS NOT NULL AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(start, end).all() 
  ]);
  
  const chatHist = chats.results.reverse();
  const mapPts = [...checkins.results.map(x=>({type:'checkin',id:x.id,lat:x.lat,lng:x.lng,locName:x.location_name,time:x.created_at})), ...mapNotes.results.map(x=>({type:'diary',id:x.id,lat:x.lat,lng:x.lng,locName:x.location_name,time:x.created_at,content:x.content,image:x.image_url}))].sort((a,b)=>a.time-b.time);
  const gApiKey = c.env.GOOGLE_MAPS_API_KEY || '';

  return c.html(html`
<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#3b82f6"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon.svg"><title>My Dashboard</title>
${gApiKey ? html`<script src="https://maps.googleapis.com/maps/api/js?key=${gApiKey}&libraries=geometry&callback=initMap" async defer></script>` : ''}
<style>
  :root{--bg:#f8fafc;--card-bg:#fff;--txt:#0f172a;--mut:#64748b;--brd:#e2e8f0;--pri:#3b82f6;--pril:#eff6ff;--btn:#1e293b;--rad:16px;}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,sans-serif;-webkit-tap-highlight-color:transparent;} a{text-decoration:none;color:inherit;}
  .navbar{display:flex;justify-content:space-between;align-items:center;background:var(--card-bg);padding:0.8rem 1.5rem;border-bottom:1px solid var(--brd);position:sticky;top:0;z-index:100;box-shadow:0 2px 10px rgba(0,0,0,0.05);}
  .nav-brand{font-size:1.2rem;font-weight:900;} .nav-links{display:flex;gap:15px;} .nav-links a{font-weight:600;color:var(--mut);} .nav-links a.active{color:var(--pri);}
  .container{max-width:1400px;margin:1rem auto 3rem;padding:0 1rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;}
  .card{background:var(--card-bg);border-radius:var(--rad);padding:1.2rem;border:1px solid var(--brd);display:flex;flex-direction:column;overflow:hidden;}
  .card-header{font-size:1.1rem;font-weight:800;margin-bottom:1rem;display:flex;align-items:center;gap:8px;}
  .card-icon{background:var(--pril);color:var(--pri);width:28px;height:28px;display:inline-flex;justify-content:center;align-items:center;border-radius:8px;font-size:1rem;}
  .col-span-3{grid-column:span 3;} .col-span-2{grid-column:span 2;} .col-span-1{grid-column:span 1;}
  @media (max-width:1024px){.container{grid-template-columns:repeat(2,1fr);} .col-span-3{grid-column:span 2;}} @media (max-width:768px){.container{grid-template-columns:1fr;} .col-span-3,.col-span-2,.col-span-1{grid-column:span 1;}}
  .tabs{display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;} .tabs::-webkit-scrollbar{display:none;}
  .tab-btn{padding:8px 16px;background:#f1f5f9;border:1px solid var(--brd);border-radius:20px;font-size:0.9rem;font-weight:bold;color:var(--mut);cursor:pointer;white-space:nowrap;} .tab-btn.active{background:var(--btn);color:white;border-color:var(--btn);}
  .news-list{display:none;flex-direction:column;gap:8px;overflow-y:auto;max-height:280px;} .news-list.active-tab{display:flex;}
  .news-item{display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:8px;border-bottom:1px solid var(--brd);}
  .news-thumb{width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--brd);} .news-thumb.no-img{background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:var(--mut);}
  .news-text{flex-grow:1;display:flex;flex-direction:column;gap:4px;} .news-title{font-size:0.95rem;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;} .source-tag{font-size:0.7rem;color:#475569;background:#f1f5f9;padding:2px 6px;border-radius:4px;}
  .form-row{display:flex;gap:8px;margin-bottom:12px;} .form-row input{flex-grow:1;padding:10px;border:1px solid var(--brd);border-radius:8px;outline:none;} .form-row button{padding:0 16px;background:var(--btn);color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;}
  .list-area{display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:280px;}
  .chat-msg{padding:10px 14px;border-radius:12px;font-size:15px;max-width:90%;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;} .user-msg{background:var(--btn);color:white;align-self:flex-end;border-bottom-right-radius:4px;} .ai-msg{background:#fff;color:var(--txt);align-self:flex-start;border-bottom-left-radius:4px;border:1px solid var(--brd);}
  .diary-list-item{display:flex;gap:12px;align-items:center;padding:10px;background:#f8fafc;border:1px solid var(--brd);border-radius:8px;} .diary-list-thumb{width:56px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--brd);}
</style>
</head>
<body>
  <header class="navbar"><div class="nav-brand">My Dashboard</div><div class="nav-links"><a href="/" class="active">Home</a><a href="/diary">Diary</a><a href="/chat">Chat</a><a href="/call">Call</a><a href="/speedtest">Speed</a></div></header>
  <main><div class="container">
    <div class="card col-span-3" style="border-top: 4px solid var(--pri); justify-content:center; padding:1.2rem 2rem; align-items:center; gap:5px;">
      <div id="date-jp" style="font-size:1.1rem; font-weight:700;">--年--月--日</div><div id="time-display" style="font-size:3.5rem; font-weight:900; line-height:1; letter-spacing:-2px;">--:--</div><div id="koyomi-display" style="font-size:0.8rem; color:#0369a1; background:#e0f2fe; padding:4px 12px; border-radius:20px; font-weight:600;">読込中...</div>
    </div>
    
    <div class="card col-span-1"><div class="card-header"><span class="card-icon">⛅</span> <span id="weather-title">天気予報</span></div><div id="weather-widget" style="text-align:center; padding:20px; color:var(--mut);">読込中...</div></div>
    
    <div class="card col-span-2">
      <div class="card-header"><span class="card-icon">📰</span> ニュース</div>
      <div class="tabs" id="news-tabs"><button class="tab-btn active" data-target="tab-top">主要</button><button class="tab-btn" data-target="tab-biz">政治・経済</button><button class="tab-btn" data-target="tab-market">マーケット</button><button class="tab-btn" data-target="tab-it">IT</button></div>
      <div id="news-list-container"><div style="text-align:center; padding:30px; color:var(--mut);">📰 ニュースを取得中...</div></div>
    </div>

    <div class="card col-span-1">
      <div class="card-header"><span class="card-icon">📝</span> メモ</div>
      <form class="form-row" id="fb-memo-form"><input type="text" id="fb-memo-input" placeholder="新規メモ..." required autocomplete="off"><button type="submit">+</button></form>
      <div class="list-area" id="fb-memo-list" style="padding:4px;"><div style="color:#64748b; text-align:center; padding:10px;">読込中...</div></div>
    </div>
    
    <div class="card col-span-2">
      <div class="card-header"><span class="card-icon">✅</span> ToDoリスト</div>
      <div class="list-area" id="fb-todo-list" style="padding:4px;"><div style="color:#64748b; text-align:center; padding:10px;">読込中...</div></div>
      <form class="form-row" id="fb-todo-form" style="margin-top:12px;"><input type="text" id="fb-todo-input" placeholder="タスク追加..." required><button type="submit">追加</button></form>
    </div>
    
    <div class="card col-span-1"><div class="card-header"><span class="card-icon">📅</span> スケジュール</div><iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FTokyo&showPrint=0&src=aGVlcm8uYmFzZWJhbGxAZ21haWwuY29t&color=%233f51b5" style="border:0" width="100%" height="350" loading="lazy"></iframe></div>
    
    <div class="card col-span-2"><div class="card-header"><span class="card-icon">📈</span> マーケット</div><div class="tradingview-widget-container" style="height:350px;"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>{"width": "100%", "height": 350, "symbolsGroups": [{"name": "Watchlist", "symbols": [{"name": "FOREXCOM:SPXUSD", "displayName": "S&P 500"}, {"name": "AMEX:VOO", "displayName": "Vanguard S&P 500 ETF"}, {"name": "NYSE:KO", "displayName": "Coca-Cola"}, {"name": "FX_IDC:USDJPY", "displayName": "USD/JPY"}, {"name": "BITSTAMP:BTCUSD", "displayName": "BTC/USD"}, {"name": "BITSTAMP:ETHUSD", "displayName": "ETH/USD"}, {"name": "BITSTAMP:XRPUSD", "displayName": "XRP/USD"}, {"name": "COINBASE:SHIBUSD", "displayName": "SHIB/USD"}]}], "colorTheme": "light", "isTransparent": true, "locale": "ja"}</script></div></div>
    
    <div class="card col-span-1"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">✨</span> Gemini Chat</div><form method="POST" action="/api/gemini/clear" style="margin:0;" onsubmit="return confirm('消去しますか？');"><button type="submit" style="font-size:12px; border:none; background:none; color:var(--mut); text-decoration:underline; cursor:pointer;">クリア</button></form></div><div id="chat-history" class="list-area" style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--brd); margin-bottom:8px;">${chatHist.length===0?html`<div class="chat-msg ai-msg">こんにちは！画像を添付しての相談も可能です。</div>`:''}${chatHist.map(c => html`<div class="chat-msg ${c.role==='user'?'user-msg':'ai-msg'}">${c.message}</div>`)}</div><div id="image-preview-container" style="display:none; margin-bottom:8px; position:relative; width:fit-content;"><img id="image-preview" style="max-height:80px; border-radius:8px; border:1px solid var(--brd);"><div id="clear-image" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;">×</div></div><form id="gemini-form" class="form-row" style="align-items:center; margin:0;"><label for="chat-image-input" style="font-size:24px; cursor:pointer; margin-right:5px;">📷</label><input type="file" id="chat-image-input" accept="image/*" style="display:none;" capture="environment"><input type="text" id="gemini-input" placeholder="メッセージ..." required autocomplete="off"><button type="submit" id="gemini-submit">▶</button></form></div>
    
    <div class="card col-span-2"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">📸</span> Diary</div><a href="/diary/post" style="font-size:14px; color:var(--pri); font-weight:bold;">＋ 投稿</a></div><div class="list-area" style="max-height:350px;">${notes.results.map(n => { const d = new Date(n.created_at+9*3600000); return html`<a href="/diary" class="diary-list-item">${n.image_url?html`<img src="${n.image_url}" class="diary-list-thumb" loading="lazy">`:html`<div class="diary-list-thumb no-img" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">📝</div>`}<div style="flex-grow:1; overflow:hidden; display:flex; flex-direction:column; gap:4px;"><div style="font-size:0.75rem; color:var(--pri); font-weight:bold;">${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}</div><div style="font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n.content.replace(/\n/g, ' ')}</div></div></a>`; })}</div></div>
    
    <div class="card col-span-3"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">🗺️</span> トラッカー</div><input type="date" value="${tDate}" onchange="window.location.href='/?date='+this.value" style="padding:6px 12px; border:1px solid var(--brd); border-radius:8px; font-weight:bold; outline:none;"></div><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><div style="font-weight:bold; color:var(--mut);">総移動距離: <span id="total-distance" style="color:var(--pri); font-size:1.4rem;">0</span> km</div><button onclick="manualCheckin(event)" style="padding:10px 20px; background:var(--btn); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">📍 今ここを記録する</button></div><div id="map" style="height:400px; border-radius:12px; border:1px solid var(--brd); position:relative; overflow:hidden;">${!gApiKey?html`<div style="position:absolute;inset:0;background:rgba(255,255,255,0.9);z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;"><h3>⚠️ APIキー未設定</h3></div>`:''}</div><div style="margin-top:15px; max-height:250px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">${mapPts.map(p => { const d = new Date(p.time+9*3600000); return html`<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid var(--brd); font-size:0.9rem;"><div style="display:flex; align-items:flex-start; gap:8px; overflow:hidden; flex:1;"><span style="font-size:1.2rem;">${p.type==='checkin'?'📍':'📝'}</span><b style="min-width:40px; margin-top:2px;">${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}</b><div style="display:flex; flex-direction:column; overflow:hidden; flex:1;"><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.type==='diary'?p.content.replace(/\n/g,' '):'現在地'}</span>${p.locName?raw(`<div style="font-size:0.75rem; color:#3b82f6; font-weight:bold; margin-top:2px;">📍 ${p.locName}</div>`):''}</div></div><form method="POST" action="${p.type==='checkin'?'/api/checkin/delete':'/diary/delete'}" style="margin:0; flex-shrink:0; padding-left:10px;" onsubmit="return confirm('削除しますか？');"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="date" value="${tDate}"><button type="submit" style="background:none; border:none; color:#ef4444; font-size:1.4rem; cursor:pointer; font-weight:bold;">×</button></form></div>`; })}</div></div>
  </div></main>

  <script>
    // --- 既存のフロントエンド機能（時計、天気、ニュース非同期取得など） ---
    function updateClock(){const n=new Date();document.getElementById('time-display').textContent=n.toLocaleTimeString('ja-JP',{hour12:false});document.getElementById('date-jp').textContent=new Intl.DateTimeFormat('ja-JP-u-ca-japanese',{era:'long',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(n);const old=['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];document.getElementById('koyomi-display').textContent=\`西暦\${n.getFullYear()}年 / 旧暦: \${old[n.getMonth()]}\`;} setInterval(updateClock,1000); updateClock();
    async function fetchW(lat,lng,loc){try{const r=await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=4\`);const data=await r.json();const ic=c=>(c<=1?'☀️':c<=3?'⛅':c<=48?'☁️':c<=55?'🌧️':c<=65?'☔':c<=77?'❄️':c<=82?'🌦️':'⛈️');const d=data.daily;let h=\`<div style="font-size:0.9rem;"><div style="display:flex;align-items:center;justify-content:space-between;background:var(--pril);padding:12px;border-radius:8px;margin-bottom:12px;"><div style="font-size:2.5rem;line-height:1;">\${ic(d.weathercode[0])}</div><div style="text-align:right;"><div style="font-weight:bold;font-size:1.1rem;">今日</div><div style="margin:4px 0;"><span style="color:#ef4444;font-weight:bold;">\${Math.round(d.temperature_2m_max[0])}°</span> / <span style="color:#3b82f6;font-weight:bold;">\${Math.round(d.temperature_2m_min[0])}°</span></div><div style="font-size:0.8rem;color:var(--mut);font-weight:bold;">降水 \${d.precipitation_probability_max[0]}%</div></div></div><div style="display:flex;gap:8px;justify-content:space-between;">\`;for(let i=1;i<=3;i++){const dt=new Date(d.time[i]);h+=\`<div style="flex:1;background:#f8fafc;padding:8px 4px;border-radius:8px;text-align:center;border:1px solid var(--brd);"><div style="font-size:0.8rem;font-weight:bold;color:var(--mut);">\${dt.getMonth()+1}/\${dt.getDate()}</div><div style="font-size:1.5rem;margin:4px 0;">\${ic(d.weathercode[i])}</div><div style="font-size:0.8rem;font-weight:bold;"><span style="color:#ef4444;">\${Math.round(d.temperature_2m_max[i])}°</span> <span style="color:#3b82f6;">\${Math.round(d.temperature_2m_min[i])}°</span></div></div>\`;}document.getElementById('weather-widget').innerHTML=h+'</div></div>';document.getElementById('weather-title').textContent=\`天気予報 (\${loc})\`;}catch(e){}}
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(async p=>{let loc='現在地';try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+p.coords.latitude+'&lon='+p.coords.longitude);const d=await r.json();if(d.address)loc=d.address.city||d.address.town||d.address.village||d.address.suburb||'現在地';}catch(e){} fetchW(p.coords.latitude,p.coords.longitude,loc);}, ()=>fetchW(35.8617,139.6455,'埼玉')); else fetchW(35.8617,139.6455,'埼玉');
    document.getElementById('news-tabs').addEventListener('click', e => { if(e.target.classList.contains('tab-btn')){ document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active')); document.querySelectorAll('.news-list').forEach(x=>x.classList.remove('active-tab')); e.target.classList.add('active'); const t = document.getElementById(e.target.dataset.target); if(t) t.classList.add('active-tab'); } });
    async function loadNews() { try { const r = await fetch('/api/news'); const d = await r.json(); const rt = (items, id, act) => \`<div id="\${id}" class="news-list \${act?'active-tab':''}">\${items.map(i=>\`<a href="\${i.link}" target="_blank" class="news-item">\${i.imgUrl?\`<img src="\${i.imgUrl}" class="news-thumb" loading="lazy">\`:\`<div class="news-thumb no-img">No Img</div>\`}<div class="news-text"><div class="news-title">\${i.title.replace(' - '+i.source,'')}</div><div><span class="source-tag">\${i.source}</span></div></div></a>\`).join('')}</div>\`; document.getElementById('news-list-container').innerHTML = rt(d.top,'tab-top',true) + rt(d.biz,'tab-biz',false) + rt(d.market,'tab-market',false) + rt(d.it,'tab-it',false); } catch(e){ document.getElementById('news-list-container').innerHTML = '<div style="text-align:center; padding:20px; color:red;">取得失敗</div>'; } } loadNews();
    const hDiv=document.getElementById('chat-history'); hDiv.scrollTop=hDiv.scrollHeight; let imgD=null,imgM=null; document.getElementById('chat-image-input').addEventListener('change',e=>{if(e.target.files[0]){imgM=e.target.files[0].type;const r=new FileReader();r.onload=ev=>{document.getElementById('image-preview').src=ev.target.result;document.getElementById('image-preview-container').style.display='block';imgD=ev.target.result.split(',')[1];};r.readAsDataURL(e.target.files[0]);}}); document.getElementById('clear-image').addEventListener('click',()=>{document.getElementById('chat-image-input').value='';imgD=null;document.getElementById('image-preview-container').style.display='none';}); document.getElementById('gemini-form').addEventListener('submit',async e=>{e.preventDefault();const inp=document.getElementById('gemini-input'),btn=document.getElementById('gemini-submit'),p=inp.value;hDiv.innerHTML+=\`<div class="chat-msg user-msg">\${imgD?'📷[画像] '+p:p}</div>\`;inp.value='';btn.disabled=true;hDiv.scrollTop=hDiv.scrollHeight;const pay={prompt:p,imageBase64:imgD,imageMimeType:imgM};document.getElementById('clear-image').click();try{const r=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pay)});const d=await r.json();hDiv.innerHTML+=\`<div class="chat-msg ai-msg">\${d.response}</div>\`;}catch(err){hDiv.innerHTML+=\`<div class="chat-msg ai-msg" style="color:red;">エラー</div>\`;} btn.disabled=false;hDiv.scrollTop=hDiv.scrollHeight;});
    window.initMap = function() { const el = document.getElementById('map'); if(!el) return; const m = new google.maps.Map(el, {zoom:13, center:{lat:35.8617, lng:139.6455}, mapTypeId:'roadmap', disableDefaultUI:true, zoomControl:true}); const pts = ${raw(JSON.stringify(mapPts))}; if(pts.length>0){ const path = pts.map(p=>({lat:p.lat,lng:p.lng})); new google.maps.Polyline({path:path, geodesic:true, strokeColor:'#ef4444', strokeOpacity:0.8, strokeWeight:4}).setMap(m); const b = new google.maps.LatLngBounds(); let tKm=0; pts.forEach(p=>{ const d=new Date(p.time); const tStr=d.getHours()+':'+String(d.getMinutes()).padStart(2,'0'); let hHtml="", icL="📍"; if(p.type==='diary'){ icL="📝"; hHtml='<b>📝 ('+tStr+')</b><br>'+p.content.replace(/\\n/g,'<br>')+(p.locName?'<br><small>📍 '+p.locName+'</small>':'')+(p.image?'<br><img src="'+p.image+'" style="width:100%;margin-top:5px;border-radius:4px;">':''); } else { hHtml='<b>📍 ('+tStr+')</b>'+(p.locName?'<br><small>'+p.locName+'</small>':''); } const pos={lat:p.lat,lng:p.lng}; b.extend(pos); const w=new google.maps.InfoWindow({content:hHtml}); const mk=new google.maps.Marker({position:pos,map:m,label:{text:icL,fontSize:'20px'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:0}}); mk.addListener('click',()=>w.open(m,mk)); }); m.fitBounds(b); for(let i=1;i<path.length;i++) tKm += google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(path[i-1]), new google.maps.LatLng(path[i]))/1000; document.getElementById('total-distance').textContent=tKm.toFixed(1); } };
    window.manualCheckin = function(e) { const b=e.target; b.textContent="⏳ 特定中..."; b.disabled=true; navigator.geolocation.getCurrentPosition(async pos=>{ const lat=pos.coords.latitude, lng=pos.coords.longitude; let loc=null; try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);const d=await r.json();if(d.address)loc=(d.address.province||'')+(d.address.city||d.address.town||d.address.village||'')+(d.address.suburb||d.address.quarter||'');}catch(er){} b.textContent="💾 記録中..."; await fetch('/api/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lng,location_name:loc})}); location.reload(); }, ()=>{alert('失敗');b.textContent="📍 今ここを記録";b.disabled=false;},{enableHighAccuracy:true}); }
  </script>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getDatabase, ref, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
    
    const app = initializeApp({ apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0", authDomain: "private-chat-54723.firebaseapp.com", projectId: "private-chat-54723", databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app" });
    const db = getDatabase(app);
    const memoRef = ref(db, 'memos');
    const todoRef = ref(db, 'todos');

    // 1. メモ
    const memoList = document.getElementById('fb-memo-list');
    onValue(memoRef, (snapshot) => {
      memoList.innerHTML = '';
      const data = snapshot.val();
      if (!data) return memoList.innerHTML = '<div style="color:#64748b; padding:10px;">メモはありません</div>';
      Object.entries(data).reverse().forEach(([id, m]) => {
        const div = document.createElement('div');
        div.style.cssText = "background:#f8fafc; border:1px solid var(--brd); border-radius:8px; padding:10px; position:relative; margin-bottom:8px;";
        div.innerHTML = \`<textarea style="width:100%; border:none; background:transparent; resize:none; outline:none; font-family:inherit; overflow:hidden;" rows="1">\${m.content || ''}</textarea><button class="del-memo" style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer;">×</button>\`;
        
        memoList.appendChild(div); // 先に画面に追加して高さを確保
        const ta = div.querySelector('textarea');
        ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
        
        let to;
        ta.addEventListener('input', e => {
          e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
          clearTimeout(to); to = setTimeout(() => update(ref(db, 'memos/' + id), { content: e.target.value }), 800);
        });
        div.querySelector('.del-memo').onclick = () => remove(ref(db, 'memos/' + id));
      });
    });
    
    document.getElementById('fb-memo-form').onsubmit = (e) => {
      e.preventDefault(); const inp = document.getElementById('fb-memo-input');
      push(memoRef, { content: inp.value, created_at: Date.now() }); inp.value = '';
    };

    // 2. ToDo
    const todoList = document.getElementById('fb-todo-list');
    onValue(todoRef, (snapshot) => {
      todoList.innerHTML = '';
      const data = snapshot.val();
      if (!data) return todoList.innerHTML = '<div style="color:#64748b; padding:10px;">タスクはありません</div>';
      
      const arr = Object.entries(data).map(([id, t]) => ({id, ...t})).sort((a,b) => {
        if(a.is_completed === b.is_completed) return b.created_at - a.created_at;
        return a.is_completed ? 1 : -1;
      });

      arr.forEach(t => {
        const div = document.createElement('div');
        div.style.cssText = "background:#f8fafc; border:1px solid var(--brd); border-radius:8px; padding:10px; display:flex; align-items:center; gap:8px; margin-bottom:8px;";
        div.innerHTML = \`<button class="tgl-todo" style="width:24px; height:24px; border-radius:6px; border:2px solid \${t.is_completed?'var(--pri)':'#cbd5e1'}; background:\${t.is_completed?'var(--pri)':'white'}; color:white; cursor:pointer;">\${t.is_completed?'✓':''}</button><div style="flex-grow:1; font-weight:500; \${t.is_completed?'text-decoration:line-through; color:var(--mut); font-weight:400;':''} ">\${t.task}</div><button class="del-todo" style="background:transparent; border:none; color:#ef4444; font-size:1.4rem; padding:0; cursor:pointer;">×</button>\`;
        
        div.querySelector('.tgl-todo').onclick = () => update(ref(db, 'todos/' + t.id), { is_completed: !(t.is_completed) });
        div.querySelector('.del-todo').onclick = () => remove(ref(db, 'todos/' + t.id));
        todoList.appendChild(div);
      });
    });

    document.getElementById('fb-todo-form').onsubmit = (e) => {
      e.preventDefault(); const inp = document.getElementById('fb-todo-input');
      push(todoRef, { task: inp.value, is_completed: false, created_at: Date.now() }); inp.value = '';
    };
  </script>

  <script>
    (function() {
      // 1. アクセスログ
      fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'PAGE_ACCESS', target: window.location.pathname + window.location.search }) }).catch(()=>{});
      
      // 2. 操作ログ
      document.addEventListener('click', e => {
        const targetEl = e.target.closest('button, a, .tab-btn');
        if (targetEl) {
          let targetName = targetEl.textContent.trim().substring(0, 20) || targetEl.href || targetEl.tagName;
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CLICK', target: targetName }) }).catch(()=>{});
        }
      }, { passive: true });
      
      // 3. フォーム送信ログ
      document.addEventListener('submit', e => {
        const formId = e.target.id || e.target.action || 'unknown_form';
        fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'FORM_SUBMIT', target: formId }) }).catch(()=>{});
      });
    })();
  </script>

</body></html>
  `);
});

export const onRequest = handle(app);