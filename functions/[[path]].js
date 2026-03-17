import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html, raw } from 'hono/html';

const app = new Hono();

// --- 1. PWA & ユーティリティ ---
app.get('/manifest.json', c => c.json({ name: "My Dashboard", short_name: "Dashboard", start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#3b82f6", icons: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }] }));
app.get('/sw.js', c => { c.header('Content-Type', 'application/javascript'); return c.body(`self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim()); self.addEventListener('fetch', e => {});`); });
app.get('/icon.svg', c => { c.header('Content-Type', 'image/svg+xml'); return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3b82f6" rx="112"/><text x="256" y="340" font-size="280" font-weight="bold" text-anchor="middle" fill="white" font-family="sans-serif">D</text></svg>`); });

const getMeta = (htmlText, prop) => {
  const m = htmlText.match(new RegExp(`<meta(?:\\s+[^>]*?)?(?:property|name)=["']${prop}["']\\s+content=["']([^"']*)["']`, 'i')) || htmlText.match(new RegExp(`<meta(?:\\s+[^>]*?)?content=["']([^"']*)["']\\s+(?:property|name)=["']${prop}["']`, 'i'));
  return m ? m[1] : null;
};
app.get('/api/ogp', async c => {
  const url = c.req.query('url'); if (!url) return c.json({ error: 'no url' }, 400);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }); const htmlText = await res.text();
    return c.json({ title: getMeta(htmlText, 'og:title') || getMeta(htmlText, 'twitter:title') || (htmlText.match(/<title>([^<]+)<\/title>/i)?.[1]) || url, image: getMeta(htmlText, 'og:image') || getMeta(htmlText, 'twitter:image'), description: getMeta(htmlText, 'og:description') || getMeta(htmlText, 'description') });
  } catch (e) { return c.json({ error: 'failed' }); }
});

// --- 2. ニュース取得 ---
async function fetchNews() {
  const b = "site:bloomberg.co.jp OR site:jp.reuters.com OR site:nikkei.com";
  const queries = { top: `https://news.google.com/rss/search?q=${encodeURIComponent(b)}&hl=ja&gl=JP&ceid=JP:ja`, biz: `https://news.google.com/rss/search?q=${encodeURIComponent('政治 OR 経済 ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, market: `https://news.google.com/rss/search?q=${encodeURIComponent('株 OR 為替 OR マーケット ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, it: `https://news.google.com/rss/search?q=${encodeURIComponent('IT OR AI OR テクノロジー ' + b)}&hl=ja&gl=JP&ceid=JP:ja` };
  const res = {};
  for (const [k, u] of Object.entries(queries)) {
    try {
      const t = await (await fetch(u)).text(); const items = []; let m; const rx = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<source.*?>(.*?)<\/source>/g;
      while ((m = rx.exec(t)) !== null && items.length < 8) items.push({ title: m[1], link: m[2], imgUrl: m[3].match(/<img[^>]+src="([^">]+)"/)?.[1], source: m[4] });
      res[k] = items;
    } catch(e) { res[k] = []; }
  } return res;
}
const renderNewsTab = (items, tabId, isActive) => html`<div id="${tabId}" class="news-list ${isActive ? 'active-tab' : ''}">${items.map(i => html`<a href="${i.link}" target="_blank" class="news-item">${i.imgUrl ? html`<img src="${i.imgUrl}" class="news-thumb" loading="lazy">` : html`<div class="news-thumb no-img">No Img</div>`}<div class="news-text"><div class="news-title">${i.title.replace(` - ${i.source}`, '')}</div><div><span class="source-tag">${i.source}</span></div></div></a>`)}</div>`;

// --- 3. メインレイアウト ---
app.get('/', async (c) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const tDate = c.req.query('date') || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const start = new Date(`${tDate}T00:00:00+09:00`).getTime(), end = new Date(`${tDate}T23:59:59+09:00`).getTime();
  const [news, notes, todos, chats, memos, checkins, mapNotes] = await Promise.all([ fetchNews(), c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 10').all(), c.env.DB.prepare('SELECT * FROM todos ORDER BY is_completed ASC, created_at DESC').all(), c.env.DB.prepare('SELECT * FROM chats ORDER BY created_at DESC LIMIT 30').all(), c.env.DB.prepare('SELECT * FROM quick_memo ORDER BY id DESC').all(), c.env.DB.prepare('SELECT * FROM checkins WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(start, end).all(), c.env.DB.prepare('SELECT * FROM notes WHERE lat IS NOT NULL AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(start, end).all() ]);
  const chatHist = chats.results.reverse();
  const mapPts = [...checkins.results.map(x=>({type:'checkin',id:x.id,lat:x.lat,lng:x.lng,locName:x.location_name,time:x.created_at})), ...mapNotes.results.map(x=>({type:'diary',id:x.id,lat:x.lat,lng:x.lng,locName:x.location_name,time:x.created_at,content:x.content,image:x.image_url}))].sort((a,b)=>a.time-b.time);
  const gApiKey = c.env.GOOGLE_MAPS_API_KEY || '';

  return c.html(html`
<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#3b82f6"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon.svg"><title>My Dashboard</title>
${gApiKey ? html`<script src="https://maps.googleapis.com/maps/api/js?key=${gApiKey}&libraries=geometry&callback=initMap" async defer></script>` : ''}
<style>
  :root{--bg:#f8fafc;--card-bg:#fff;--txt:#0f172a;--mut:#64748b;--brd:#e2e8f0;--pri:#3b82f6;--pril:#eff6ff;--btn:#1e293b;--rad:16px;}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,sans-serif;-webkit-tap-highlight-color:transparent;}
  a{text-decoration:none;color:inherit;}
  .navbar{display:flex;justify-content:space-between;align-items:center;background:var(--card-bg);padding:0.8rem 1.5rem;border-bottom:1px solid var(--brd);position:sticky;top:0;z-index:100;box-shadow:0 2px 10px rgba(0,0,0,0.05);}
  .nav-brand{font-size:1.2rem;font-weight:900;} .nav-links{display:flex;gap:15px;} .nav-links a{font-weight:600;color:var(--mut);} .nav-links a.active{color:var(--pri);}
  .container{max-width:1400px;margin:1rem auto 3rem;padding:0 1rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;}
  .card{background:var(--card-bg);border-radius:var(--rad);padding:1.2rem;border:1px solid var(--brd);display:flex;flex-direction:column;overflow:hidden;}
  .card-header{font-size:1.1rem;font-weight:800;margin-bottom:1rem;display:flex;align-items:center;gap:8px;}
  .card-icon{background:var(--pril);color:var(--pri);width:28px;height:28px;display:inline-flex;justify-content:center;align-items:center;border-radius:8px;}
  .col-span-3{grid-column:span 3;} .col-span-2{grid-column:span 2;} .col-span-1{grid-column:span 1;}
  @media (max-width:1024px){.container{grid-template-columns:repeat(2,1fr);} .col-span-3{grid-column:span 2;}}
  @media (max-width:768px){.container{grid-template-columns:1fr;} .col-span-3,.col-span-2,.col-span-1{grid-column:span 1;}}
  .tabs{display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;} .tabs::-webkit-scrollbar{display:none;}
  .tab-btn{padding:8px 16px;background:#f1f5f9;border:1px solid var(--brd);border-radius:20px;font-size:0.9rem;font-weight:bold;color:var(--mut);cursor:pointer;white-space:nowrap;} .tab-btn.active{background:var(--btn);color:white;border-color:var(--btn);}
  .news-list{display:none;flex-direction:column;gap:8px;overflow-y:auto;max-height:280px;} .news-list.active-tab{display:flex;}
  .news-item{display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:8px;border-bottom:1px solid var(--brd);}
  .news-thumb{width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--brd);} .news-thumb.no-img{background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:var(--mut);}
  .news-text{flex-grow:1;display:flex;flex-direction:column;gap:4px;} .news-title{font-size:0.95rem;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .source-tag{font-size:0.7rem;color:#475569;background:#f1f5f9;padding:2px 6px;border-radius:4px;}
  .form-row{display:flex;gap:8px;margin-bottom:12px;} .form-row input{flex-grow:1;padding:10px;border:1px solid var(--brd);border-radius:8px;outline:none;} .form-row button{padding:0 16px;background:var(--btn);color:white;border:none;border-radius:8px;font-weight:bold;}
  .list-area{display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:280px;}
  .chat-msg{padding:10px 14px;border-radius:12px;font-size:15px;max-width:90%;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;} .user-msg{background:var(--btn);color:white;align-self:flex-end;border-bottom-right-radius:4px;} .ai-msg{background:#fff;color:var(--txt);align-self:flex-start;border-bottom-left-radius:4px;border:1px solid var(--brd);}
  .diary-list-item{display:flex;gap:12px;align-items:center;padding:10px;background:#f8fafc;border:1px solid var(--brd);border-radius:8px;} .diary-list-thumb{width:56px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--brd);}
</style>
</head>
<body>
  <header class="navbar"><div class="nav-brand">My Dashboard</div><div class="nav-links"><a href="/" class="active">Home</a><a href="/diary">Diary</a><a href="/chat">Chat</a><a href="/call">Call</a></div></header>
  <main><div class="container">
    <div class="card col-span-3" style="border-top: 4px solid var(--pri); justify-content:center; padding:1.2rem 2rem; align-items:center; gap:5px;">
      <div id="date-jp" style="font-size:1.1rem; font-weight:700;">--年--月--日</div><div id="time-display" style="font-size:3.5rem; font-weight:900; line-height:1; letter-spacing:-2px;">--:--</div><div id="koyomi-display" style="font-size:0.8rem; color:#0369a1; background:#e0f2fe; padding:4px 12px; border-radius:20px; font-weight:600;">読込中...</div>
    </div>
    <div class="card col-span-1"><div class="card-header"><span class="card-icon">⛅</span> <span id="weather-title">天気予報</span></div><div id="weather-widget" style="text-align:center; padding:20px; color:var(--mut);">読込中...</div></div>
    <div class="card col-span-2"><div class="card-header"><span class="card-icon">📰</span> ニュース</div><div class="tabs"><button class="tab-btn active" data-target="tab-top">主要</button><button class="tab-btn" data-target="tab-biz">政治・経済</button><button class="tab-btn" data-target="tab-market">マーケット</button><button class="tab-btn" data-target="tab-it">IT</button></div><div class="news-list-container">${renderNewsTab(news.top, 'tab-top', true)} ${renderNewsTab(news.biz, 'tab-biz', false)} ${renderNewsTab(news.market, 'tab-market', false)} ${renderNewsTab(news.it, 'tab-it', false)}</div></div>
    <div class="card col-span-1"><div class="card-header"><span class="card-icon">📝</span> メモ</div><form class="form-row" method="POST" action="/memo/add"><input type="text" name="content" placeholder="新規メモ..." required autocomplete="off"><button type="submit">+</button></form><div class="list-area">${memos.results.map(m => html`<div style="background:#f8fafc; border:1px solid var(--brd); border-radius:8px; padding:10px; position:relative;"><textarea data-id="${m.id}" class="memo-textarea" style="width:100%; border:none; background:transparent; resize:none; outline:none; font-family:inherit;">${m.content}</textarea><form method="POST" action="/memo/delete" style="margin:0;"><input type="hidden" name="id" value="${m.id}"><button type="submit" style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px;">×</button></form></div>`)}</div></div>
    <div class="card col-span-2"><div class="card-header"><span class="card-icon">✅</span> ToDoリスト</div><div class="list-area">${todos.results.map(t => html`<div style="background:#f8fafc; border:1px solid var(--brd); border-radius:8px; padding:10px; display:flex; align-items:center; gap:8px;"><form method="POST" action="/todos/toggle" style="margin:0;"><input type="hidden" name="id" value="${t.id}"><input type="hidden" name="current" value="${t.is_completed}"><button type="submit" style="width:24px; height:24px; border-radius:6px; border:2px solid ${t.is_completed?'var(--pri)':'#cbd5e1'}; background:${t.is_completed?'var(--pri)':'white'}; color:white;">${t.is_completed?'✓':''}</button></form><div style="flex-grow:1; font-weight:500; ${t.is_completed?'text-decoration:line-through; color:var(--mut); font-weight:400;':''}">${t.task}</div><form method="POST" action="/todos/delete" style="margin:0;"><input type="hidden" name="id" value="${t.id}"><button type="submit" style="background:transparent; border:none; color:#ef4444; font-size:1.4rem; padding:0;">×</button></form></div>`)}</div><form class="form-row" method="POST" action="/todos/add" style="margin-top:12px;"><input type="text" name="task" placeholder="タスク追加..." required><button type="submit">追加</button></form></div>
    <div class="card col-span-1"><div class="card-header"><span class="card-icon">📅</span> スケジュール</div><iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FTokyo&showPrint=0&src=aGVlcm8uYmFzZWJhbGxAZ21haWwuY29t&color=%233f51b5" style="border:0" width="100%" height="350"></iframe></div>
    <div class="card col-span-2"><div class="card-header"><span class="card-icon">📈</span> マーケット</div><div class="tradingview-widget-container" style="height:350px;"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>{"width": "100%", "height": 350, "symbolsGroups": [{"name": "Watchlist", "symbols": [{"name": "FOREXCOM:SPXUSD", "displayName": "S&P 500"}, {"name": "AMEX:VOO", "displayName": "Vanguard S&P 500 ETF"}, {"name": "NYSE:KO", "displayName": "Coca-Cola"}, {"name": "FX_IDC:USDJPY", "displayName": "USD/JPY"}, {"name": "BITSTAMP:BTCUSD", "displayName": "BTC/USD"}, {"name": "BITSTAMP:ETHUSD", "displayName": "ETH/USD"}, {"name": "BITSTAMP:XRPUSD", "displayName": "XRP/USD"}, {"name": "COINBASE:SHIBUSD", "displayName": "SHIB/USD"}]}], "colorTheme": "light", "isTransparent": true, "locale": "ja"}</script></div></div>
    <div class="card col-span-1"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">✨</span> Gemini Chat</div><form method="POST" action="/api/gemini/clear" style="margin:0;" onsubmit="return confirm('消去しますか？');"><button type="submit" style="font-size:12px; border:none; background:none; color:var(--mut); text-decoration:underline;">クリア</button></form></div><div id="chat-history" class="list-area" style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--brd); margin-bottom:8px;">${chatHist.length===0?html`<div class="chat-msg ai-msg">こんにちは！画像を添付しての相談も可能です。</div>`:''}${chatHist.map(c => html`<div class="chat-msg ${c.role==='user'?'user-msg':'ai-msg'}">${c.message}</div>`)}</div><div id="image-preview-container" style="display:none; margin-bottom:8px; position:relative; width:fit-content;"><img id="image-preview" style="max-height:80px; border-radius:8px; border:1px solid var(--brd);"><div id="clear-image" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;">×</div></div><form id="gemini-form" class="form-row" style="align-items:center; margin:0;"><label for="chat-image-input" style="font-size:24px; cursor:pointer; margin-right:5px;">📷</label><input type="file" id="chat-image-input" accept="image/*" style="display:none;" capture="environment"><input type="text" id="gemini-input" placeholder="メッセージ..." required autocomplete="off"><button type="submit" id="gemini-submit">▶</button></form></div>
    <div class="card col-span-2"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">📸</span> Diary</div><a href="/diary/post" style="font-size:14px; color:var(--pri); font-weight:bold;">＋ 投稿</a></div><div class="list-area" style="max-height:350px;">${notes.results.map(n => { const d = new Date(n.created_at+9*3600000); return html`<a href="/diary" class="diary-list-item">${n.image_url?html`<img src="${n.image_url}" class="diary-list-thumb" loading="lazy">`:html`<div class="diary-list-thumb no-img" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">📝</div>`}<div style="flex-grow:1; overflow:hidden; display:flex; flex-direction:column; gap:4px;"><div style="font-size:0.75rem; color:var(--pri); font-weight:bold;">${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}</div><div style="font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n.content.replace(/\n/g, ' ')}</div></div></a>`; })}</div></div>
    <div class="card col-span-3"><div class="card-header" style="justify-content:space-between; width:100%;"><div><span class="card-icon">🗺️</span> トラッカー</div><input type="date" value="${tDate}" onchange="window.location.href='/?date='+this.value" style="padding:6px 12px; border:1px solid var(--brd); border-radius:8px; font-weight:bold; outline:none;"></div><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><div style="font-weight:bold; color:var(--mut);">総移動距離: <span id="total-distance" style="color:var(--pri); font-size:1.4rem;">0</span> km</div><button onclick="manualCheckin(event)" style="padding:10px 20px; background:var(--btn); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">📍 今ここを記録する</button></div><div id="map" style="height:400px; border-radius:12px; border:1px solid var(--brd); position:relative; overflow:hidden;">${!gApiKey?html`<div style="position:absolute;inset:0;background:rgba(255,255,255,0.9);z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;"><h3>⚠️ APIキー未設定</h3></div>`:''}</div><div style="margin-top:15px; max-height:250px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">${mapPts.map(p => { const d = new Date(p.time+9*3600000); return html`<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid var(--brd); font-size:0.9rem;"><div style="display:flex; align-items:flex-start; gap:8px; overflow:hidden; flex:1;"><span style="font-size:1.2rem;">${p.type==='checkin'?'📍':'📝'}</span><b style="min-width:40px; margin-top:2px;">${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}</b><div style="display:flex; flex-direction:column; overflow:hidden; flex:1;"><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.type==='diary'?p.content.replace(/\n/g,' '):'現在地'}</span>${p.locName?raw(`<div style="font-size:0.75rem; color:#3b82f6; font-weight:bold; margin-top:2px;">📍 ${p.locName}</div>`):''}</div></div><form method="POST" action="${p.type==='checkin'?'/api/checkin/delete':'/diary/delete'}" style="margin:0; flex-shrink:0; padding-left:10px;" onsubmit="return confirm('削除しますか？');"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="date" value="${tDate}"><button type="submit" style="background:none; border:none; color:#ef4444; font-size:1.4rem; cursor:pointer; font-weight:bold;">×</button></form></div>`; })}</div></div>
  </div></main>
  <script>
    function updateClock(){const n=new Date();document.getElementById('time-display').textContent=n.toLocaleTimeString('ja-JP',{hour12:false});document.getElementById('date-jp').textContent=new Intl.DateTimeFormat('ja-JP-u-ca-japanese',{era:'long',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(n);const old=['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];document.getElementById('koyomi-display').textContent=\`西暦\${n.getFullYear()}年 / 旧暦: \${old[n.getMonth()]}\`;} setInterval(updateClock,1000); updateClock();
    async function fetchW(lat,lng,loc){try{const r=await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=4\`);const data=await r.json();const ic=c=>(c<=1?'☀️':c<=3?'⛅':c<=48?'☁️':c<=55?'🌧️':c<=65?'☔':c<=77?'❄️':c<=82?'🌦️':'⛈️');const d=data.daily;let h=\`<div style="font-size:0.9rem;"><div style="display:flex;align-items:center;justify-content:space-between;background:var(--pril);padding:12px;border-radius:8px;margin-bottom:12px;"><div style="font-size:2.5rem;line-height:1;">\${ic(d.weathercode[0])}</div><div style="text-align:right;"><div style="font-weight:bold;font-size:1.1rem;">今日</div><div style="margin:4px 0;"><span style="color:#ef4444;font-weight:bold;">\${Math.round(d.temperature_2m_max[0])}°</span> / <span style="color:#3b82f6;font-weight:bold;">\${Math.round(d.temperature_2m_min[0])}°</span></div><div style="font-size:0.8rem;color:var(--mut);font-weight:bold;">降水 \${d.precipitation_probability_max[0]}%</div></div></div><div style="display:flex;gap:8px;justify-content:space-between;">\`;for(let i=1;i<=3;i++){const dt=new Date(d.time[i]);h+=\`<div style="flex:1;background:#f8fafc;padding:8px 4px;border-radius:8px;text-align:center;border:1px solid var(--brd);"><div style="font-size:0.8rem;font-weight:bold;color:var(--mut);">\${dt.getMonth()+1}/\${dt.getDate()}</div><div style="font-size:1.5rem;margin:4px 0;">\${ic(d.weathercode[i])}</div><div style="font-size:0.8rem;font-weight:bold;"><span style="color:#ef4444;">\${Math.round(d.temperature_2m_max[i])}°</span> <span style="color:#3b82f6;">\${Math.round(d.temperature_2m_min[i])}°</span></div></div>\`;}document.getElementById('weather-widget').innerHTML=h+'</div></div>';document.getElementById('weather-title').textContent=\`天気予報 (\${loc})\`;}catch(e){}}
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(async p=>{let loc='現在地';try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+p.coords.latitude+'&lon='+p.coords.longitude);const d=await r.json();if(d.address)loc=d.address.city||d.address.town||d.address.village||d.address.suburb||'現在地';}catch(e){} fetchW(p.coords.latitude,p.coords.longitude,loc);}, ()=>fetchW(35.8617,139.6455,'埼玉')); else fetchW(35.8617,139.6455,'埼玉');
    document.querySelectorAll('.tab-btn').forEach(b=>{b.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.news-list').forEach(x=>x.classList.remove('active-tab'));b.classList.add('active');document.getElementById(b.dataset.target).classList.add('active-tab');});});
    document.querySelectorAll('.memo-textarea').forEach(t=>{t.style.height=t.scrollHeight+'px';let to;t.addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';clearTimeout(to);to=setTimeout(()=>fetch('/api/memo/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:e.target.dataset.id,content:e.target.value})}),800);});});
    const hDiv=document.getElementById('chat-history'); hDiv.scrollTop=hDiv.scrollHeight; let imgD=null,imgM=null;
    document.getElementById('chat-image-input').addEventListener('change',e=>{if(e.target.files[0]){imgM=e.target.files[0].type;const r=new FileReader();r.onload=ev=>{document.getElementById('image-preview').src=ev.target.result;document.getElementById('image-preview-container').style.display='block';imgD=ev.target.result.split(',')[1];};r.readAsDataURL(e.target.files[0]);}});
    document.getElementById('clear-image').addEventListener('click',()=>{document.getElementById('chat-image-input').value='';imgD=null;document.getElementById('image-preview-container').style.display='none';});
    document.getElementById('gemini-form').addEventListener('submit',async e=>{e.preventDefault();const inp=document.getElementById('gemini-input'),btn=document.getElementById('gemini-submit'),p=inp.value;hDiv.innerHTML+=\`<div class="chat-msg user-msg">\${imgD?'📷[画像] '+p:p}</div>\`;inp.value='';btn.disabled=true;hDiv.scrollTop=hDiv.scrollHeight;const pay={prompt:p,imageBase64:imgD,imageMimeType:imgM};document.getElementById('clear-image').click();try{const r=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pay)});const d=await r.json();hDiv.innerHTML+=\`<div class="chat-msg ai-msg">\${d.response}</div>\`;}catch(err){hDiv.innerHTML+=\`<div class="chat-msg ai-msg" style="color:red;">エラー</div>\`;} btn.disabled=false;hDiv.scrollTop=hDiv.scrollHeight;});
    window.initMap = function() {
      const el = document.getElementById('map'); if(!el) return; const m = new google.maps.Map(el, {zoom:13, center:{lat:35.8617, lng:139.6455}, mapTypeId:'roadmap', disableDefaultUI:true, zoomControl:true});
      const pts = ${raw(JSON.stringify(mapPts))}; if(pts.length>0){
        const path = pts.map(p=>({lat:p.lat,lng:p.lng})); new google.maps.Polyline({path:path, geodesic:true, strokeColor:'#ef4444', strokeOpacity:0.8, strokeWeight:4}).setMap(m);
        const b = new google.maps.LatLngBounds(); let tKm=0;
        pts.forEach(p=>{
          const d=new Date(p.time); const tStr=d.getHours()+':'+String(d.getMinutes()).padStart(2,'0'); let hHtml="", icL="📍";
          if(p.type==='diary'){ icL="📝"; hHtml='<b>📝 ('+tStr+')</b><br>'+p.content.replace(/\\n/g,'<br>')+(p.locName?'<br><small>📍 '+p.locName+'</small>':'')+(p.image?'<br><img src="'+p.image+'" style="width:100%;margin-top:5px;border-radius:4px;">':''); }
          else { hHtml='<b>📍 ('+tStr+')</b>'+(p.locName?'<br><small>'+p.locName+'</small>':''); }
          const pos={lat:p.lat,lng:p.lng}; b.extend(pos); const w=new google.maps.InfoWindow({content:hHtml}); const mk=new google.maps.Marker({position:pos,map:m,label:{text:icL,fontSize:'20px'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:0}}); mk.addListener('click',()=>w.open(m,mk));
        }); m.fitBounds(b); for(let i=1;i<path.length;i++) tKm += google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(path[i-1]), new google.maps.LatLng(path[i]))/1000; document.getElementById('total-distance').textContent=tKm.toFixed(1);
      }
    };
    window.manualCheckin = function(e) { const b=e.target; b.textContent="⏳ 特定中..."; b.disabled=true; navigator.geolocation.getCurrentPosition(async pos=>{ const lat=pos.coords.latitude, lng=pos.coords.longitude; let loc=null; try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);const d=await r.json();if(d.address)loc=(d.address.province||'')+(d.address.city||d.address.town||d.address.village||'')+(d.address.suburb||d.address.quarter||'');}catch(er){} b.textContent="💾 記録中..."; await fetch('/api/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lng,location_name:loc})}); location.reload(); }, ()=>{alert('失敗');b.textContent="📍 今ここを記録";b.disabled=false;},{enableHighAccuracy:true}); }
  </script>
</body></html>
  `);
});

// --- プライベートチャット (Firebase D1同期) ---
app.get('/chat', async c => {
  await c.env.DB.prepare('DELETE FROM private_chats WHERE timestamp < ?').bind(Date.now() - (365*24*60*60*1000)).run();
  const arc = await c.env.DB.prepare('SELECT * FROM private_chats ORDER BY timestamp ASC LIMIT 200').all();
  return c.html(html`
<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Chat</title>
<style>
  :root{--bg:#8bb7ea;--txt:#0f172a;--pri:#3b82f6;} body{margin:0;background:var(--bg);color:var(--txt);font-family:sans-serif;display:flex;flex-direction:column;height:100vh;}
  .navbar{display:flex;justify-content:space-between;align-items:center;background:#fff;padding:0.8rem 1.5rem;border-bottom:1px solid #e2e8f0;flex-shrink:0;} .nav-brand{font-size:1.2rem;font-weight:900;} .nav-links{display:flex;gap:15px;} .nav-links a{text-decoration:none;font-weight:600;color:#64748b;} .nav-links a.active{color:var(--pri);}
  .msgs{flex-grow:1;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:12px;max-width:800px;margin:0 auto;width:100%;}
  .wrap{display:flex;align-items:flex-end;width:100%;} .wrap.me{flex-direction:row-reverse;} .wrap.other{flex-direction:row;}
  .cnt{max-width:75%;display:flex;flex-direction:column;} .wrap.me .cnt{align-items:flex-end;} .wrap.other .cnt{align-items:flex-start;}
  .nm{font-size:11px;color:#4b5563;margin-bottom:2px;margin-left:5px;} .bub{padding:10px 14px;font-size:15px;line-height:1.4;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,0.1);} .bg-me{background:#8ce245;border-radius:16px 16px 0 16px;} .bg-other{background:#fff;border-radius:16px 16px 16px 0;}
  .tm{font-size:10px;color:#4b5563;margin:0 5px 2px;} .inp-area{display:flex;padding:10px 15px;background:#fff;border-top:1px solid #e2e8f0;gap:8px;max-width:800px;margin:0 auto;width:100%;box-sizing:border-box;}
  .inp{flex-grow:1;padding:12px;border:1px solid #cbd5e1;border-radius:20px;font-size:16px;outline:none;background:#f8fafc;resize:none;max-height:100px;font-family:inherit;} .btn{background:var(--pri);color:white;border:none;border-radius:20px;padding:0 20px;font-weight:bold;height:44px;}
</style></head><body>
  <header class="navbar"><div class="nav-brand">Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/chat" class="active">Chat</a><a href="/call">Call</a></div></header>
  <div id="msgs" class="msgs"><div style="text-align:center;color:#4b5563;font-size:12px;margin:20px 0 10px;">🔒 暗号化チャット</div></div>
  <form id="frm" class="inp-area"><textarea id="inp" class="inp" placeholder="メッセージ..."></textarea><button type="submit" class="btn" id="btn">送信</button></form>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getDatabase, ref, push, onChildAdded, serverTimestamp, get, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
    const app = initializeApp({ apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0", authDomain: "private-chat-54723.firebaseapp.com", projectId: "private-chat-54723", storageBucket: "private-chat-54723.firebasestorage.app", messagingSenderId: "683142642820", appId: "1:683142642820:web:b59761f61548ad321d96d1", databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app" });
    const db = getDatabase(app), mRef = ref(db, 'messages'); let myN = localStorage.getItem('chat_name') || prompt("名前を入力") || "ゲスト"; localStorage.setItem('chat_name', myN);
    const mDiv = document.getElementById('msgs'), inp = document.getElementById('inp'), frm = document.getElementById('frm');
    inp.addEventListener('input', function(){ this.style.height='auto'; this.style.height=(this.scrollHeight<100?this.scrollHeight:100)+'px'; });
    function render(d) { const isM = d.sender===myN; let t=""; if(d.timestamp){ const dt=new Date(d.timestamp); t=(dt.getMonth()+1)+'/'+dt.getDate()+' '+dt.getHours()+':'+String(dt.getMinutes()).padStart(2,'0'); } const w=document.createElement('div'); w.className='wrap '+(isM?'me':'other'); w.innerHTML=\`<div class="cnt">\${!isM?\`<div class="nm">\${d.sender}</div>\`:-''}<div class="bub \${isM?'bg-me':'bg-other'}">\${d.text.replace(/\\n/g,'<br>')}</div></div><div class="tm">\${t}</div>\`; mDiv.appendChild(w); mDiv.scrollTop=mDiv.scrollHeight; }
    ${raw(JSON.stringify(arc.results))}.forEach(render);
    const tDA = Date.now() - (3*24*60*60*1000);
    get(mRef).then(async s=>{ const d=s.val(); if(d){ const arr=[]; for(const k in d) if(d[k].timestamp < tDA) arr.push({id:k,...d[k]}); if(arr.length>0){ try{await fetch('/api/chat/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:arr})}); arr.forEach(m=>remove(ref(db,'messages/'+m.id)));}catch(e){} } } });
    onChildAdded(mRef, s=>{ const d=s.val(); if(d.timestamp>=tDA) render(d); });
    frm.addEventListener('submit', async e=>{ e.preventDefault(); const t=inp.value.trim(); if(!t)return; inp.value=''; inp.style.height='auto'; document.getElementById('btn').disabled=true; try{await push(mRef,{sender:myN,text:t,timestamp:serverTimestamp()});}catch(er){} document.getElementById('btn').disabled=false; inp.focus(); });
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();frm.dispatchEvent(new Event('submit'));} });
  </script>
</body></html>
  `);
});

// --- ★ 修正: 音声通話（ブラウザの自動再生ブロックを突破する強制再生仕様） ---
app.get('/call', c => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <meta name="theme-color" content="#1e293b">
      <title>Voice Call - My Dashboard</title>
      <style>
        :root { --bg: #1e293b; --text-main: #f8fafc; --primary: #3b82f6; --danger: #ef4444; --success: #10b981; }
        body { margin: 0; background: var(--bg); color: var(--text-main); font-family: -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        a { text-decoration: none; color: inherit; }
        .navbar { display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 0.8rem 1.5rem; border-bottom: 1px solid #334155; flex-shrink: 0; }
        .nav-brand { font-size: 1.2rem; font-weight: 900; }
        .nav-links { display: flex; gap: 15px; } .nav-links a { font-weight: 600; color: #94a3b8; } .nav-links a.active { color: var(--primary); }
        .call-container { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; text-align: center; }
        
        .avatar-circle { width: 120px; height: 120px; background: #334155; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 3rem; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: transform 0.2s; }
        .avatar-circle.active { background: var(--success); transform: scale(1.1); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
        
        .controls { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-top: 40px; }
        .btn { padding: 15px 30px; border: none; border-radius: 30px; font-weight: bold; font-size: 18px; cursor: pointer; color: white; display: flex; align-items: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.2); }
        .btn:active { transform: scale(0.95); } .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-call { background: var(--success); } .btn-answer { background: var(--primary); } .btn-hangup { background: var(--danger); } .btn-record { background: #f59e0b; }
        #status-text { font-size: 18px; color: #cbd5e1; font-weight: bold; margin-bottom: 10px; height: 24px; }
      </style>
    </head>
    <body>
      <header class="navbar"><div class="nav-brand">My Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/chat">Chat</a><a href="/call" class="active">Call</a></div></header>
      
      <div class="call-container">
        <div id="avatar" class="avatar-circle">📞</div>
        <div id="status-text">待機中... マイクを許可してください</div>
        
        <audio id="remoteAudio" autoplay playsinline></audio>

        <div class="controls">
          <button id="btn-call" class="btn btn-call" disabled>発信</button>
          <button id="btn-answer" class="btn btn-answer" style="display:none;">応答する</button>
          <button id="btn-hangup" class="btn btn-hangup" disabled>切断</button>
          <button id="btn-record" class="btn btn-record" disabled>録音開始</button>
        </div>
      </div>

      <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, set, get, onValue, push, remove, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const app = initializeApp({ apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0", authDomain: "private-chat-54723.firebaseapp.com", projectId: "private-chat-54723", storageBucket: "private-chat-54723.firebasestorage.app", messagingSenderId: "683142642820", appId: "1:683142642820:web:b59761f61548ad321d96d1", databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app" });
        const db = getDatabase(app);

        const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] });
        let localStream = null, remoteStream = null;
        let mediaRecorder, recordedChunks = [];

        const remoteAudio = document.getElementById('remoteAudio');
        const avatar = document.getElementById('avatar');
        const btnCall = document.getElementById('btn-call');
        const btnAnswer = document.getElementById('btn-answer');
        const btnHangup = document.getElementById('btn-hangup');
        const btnRecord = document.getElementById('btn-record');
        const statusText = document.getElementById('status-text');

        const callDoc = ref(db, 'calls/private_room');
        const offerRef = ref(db, 'calls/private_room/offerCandidates');
        const answerRef = ref(db, 'calls/private_room/answerCandidates');

        async function setupMedia() {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            
            statusText.textContent = '準備完了: 発信してください';
            btnCall.disabled = false;
            
            onValue(callDoc, s => {
              const d = s.val();
              if (d && d.offer && !pc.currentRemoteDescription) {
                btnCall.style.display = 'none';
                btnAnswer.style.display = 'flex';
                statusText.textContent = '📞 着信があります！';
                avatar.style.background = 'var(--primary)';
              }
            });
          } catch (e) { 
            statusText.textContent = 'マイクの許可が必要です（OSの設定も確認してください）'; 
          }
        }

        // ★修正: 空の箱に継ぎ足すのではなく、スピーカー(audioタグ)に直結して強制的にPlayさせる
        pc.ontrack = e => {
          remoteStream = e.streams[0];
          if (remoteAudio.srcObject !== remoteStream) {
            remoteAudio.srcObject = remoteStream;
          }
          // ブラウザの自動再生ブロックを突破するために明示的にPlayを呼ぶ
          remoteAudio.play().catch(err => {
            console.error('音声の自動再生がブラウザにブロックされました:', err);
            statusText.textContent = '音声再生エラー: 画面を一度タップしてください';
          });
          btnRecord.disabled = false;
        };

        function setCallActiveUI() {
          statusText.textContent = '通話中 🟢';
          avatar.classList.add('active');
          avatar.textContent = '🗣️';
        }

        btnCall.onclick = async () => {
          statusText.textContent = '発信中...';
          btnCall.disabled = true; btnHangup.disabled = false;
          await remove(callDoc);
          
          pc.onicecandidate = e => { if(e.candidate) push(offerRef, e.candidate.toJSON()); };
          const offerDesc = await pc.createOffer(); await pc.setLocalDescription(offerDesc);
          await set(ref(db, 'calls/private_room/offer'), { sdp: offerDesc.sdp, type: offerDesc.type });
          
          onValue(ref(db, 'calls/private_room/answer'), s => {
            const a = s.val(); if(a && !pc.currentRemoteDescription){ pc.setRemoteDescription(new RTCSessionDescription(a)); setCallActiveUI(); }
          });
          onChildAdded(answerRef, d => pc.addIceCandidate(new RTCIceCandidate(d.val())));
        };

        btnAnswer.onclick = async () => {
          statusText.textContent = '接続中...';
          btnAnswer.disabled = true; btnHangup.disabled = false;
          
          pc.onicecandidate = e => { if(e.candidate) push(answerRef, e.candidate.toJSON()); };
          const callData = (await get(callDoc)).val();
          await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
          const answerDesc = await pc.createAnswer(); await pc.setLocalDescription(answerDesc);
          await set(ref(db, 'calls/private_room/answer'), { type: answerDesc.type, sdp: answerDesc.sdp });
          
          onChildAdded(offerRef, d => pc.addIceCandidate(new RTCIceCandidate(d.val())));
          setCallActiveUI();
        };

        btnHangup.onclick = async () => { pc.close(); await remove(callDoc); location.reload(); };

        btnRecord.onclick = () => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            btnRecord.textContent = '録音開始';
            btnRecord.style.background = '#f59e0b';
            statusText.textContent = '録音を保存しました';
          } else {
            recordedChunks = [];
            // リモートストリーム（相手の音声）を録音の対象にする
            mediaRecorder = new MediaRecorder(remoteStream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
              const b = new Blob(recordedChunks, { type: 'audio/webm' });
              const url = URL.createObjectURL(b);
              const a = document.createElement('a'); a.style.display = 'none'; a.href = url;
              a.download = 'voice_record_' + Date.now() + '.webm';
              document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url);
            };
            mediaRecorder.start();
            btnRecord.textContent = '⏹️ 録音停止＆保存';
            btnRecord.style.background = 'var(--danger)';
            statusText.textContent = '🔴 通話を録音中...';
          }
        };

        setupMedia();
      </script>
    </body>
    </html>
  `);
});

// --- API群 ---
app.post('/api/chat/archive', async c => { const { messages } = await c.req.json(); if (!messages || messages.length === 0) return c.json({ success: true }); const stmt = c.env.DB.prepare('INSERT OR IGNORE INTO private_chats (id, sender, text, timestamp) VALUES (?, ?, ?, ?)'); await c.env.DB.batch(messages.map(m => stmt.bind(m.id, m.sender, m.text, m.timestamp))); return c.json({ success: true }); });
app.post('/api/checkin', async c => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO checkins (lat, lng, location_name, created_at) VALUES (?, ?, ?, ?)').bind(b.lat, b.lng, b.location_name || null, Date.now()).run(); return c.json({ success: true }); });
app.post('/api/checkin/delete', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('DELETE FROM checkins WHERE id = ?').bind(b['id']).run(); return c.redirect('/?date=' + b['date']); });
app.post('/memo/add', async c => { await c.env.DB.prepare('INSERT INTO quick_memo (content) VALUES (?)').bind((await c.req.parseBody())['content']).run(); return c.redirect('/'); });
app.post('/memo/delete', async c => { await c.env.DB.prepare('DELETE FROM quick_memo WHERE id = ?').bind((await c.req.parseBody())['id']).run(); return c.redirect('/'); });
app.post('/api/memo/update', async c => { const { id, content } = await c.req.json(); await c.env.DB.prepare('UPDATE quick_memo SET content = ? WHERE id = ?').bind(content, id).run(); return c.json({ success: true }); });
app.post('/todos/add', async c => { await c.env.DB.prepare('INSERT INTO todos (task, created_at) VALUES (?, ?)').bind((await c.req.parseBody())['task'], Date.now()).run(); return c.redirect('/'); });
app.post('/todos/toggle', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('UPDATE todos SET is_completed = ? WHERE id = ?').bind(b['current']==='1'?0:1, b['id']).run(); return c.redirect('/'); });
app.post('/todos/delete', async c => { await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind((await c.req.parseBody())['id']).run(); return c.redirect('/'); });
app.post('/api/gemini', async c => { const { prompt, imageBase64, imageMimeType } = await c.req.json(); const k = c.env.GEMINI_API_KEY; if (!k) return c.json({ response: "APIキー未設定" }); await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)').bind('user', imageBase64 ? `[📷] ${prompt}` : prompt, Date.now()).run(); try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${k}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: "ユーザーが「今日のニュース」と聞いた場合、政治・経済、国内、国際、マーケット、IT、天気予報のジャンルに分け、簡単な説明と参照元URLを含めて回答してください。FXのPOGはPerfect Orderのことです。" }] }, contents: [{ parts: imageBase64 && imageMimeType ? [{ text: prompt }, { inline_data: { mime_type: imageMimeType, data: imageBase64 } }] : [{ text: prompt }] }] }) }); const d = await r.json(); const t = d.candidates?.[0]?.content?.parts?.[0]?.text; if (!t) return c.json({ response: "ブロックされました" }); await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)').bind('ai', t, Date.now()).run(); return c.json({ response: t }); } catch (e) { return c.json({ response: "エラー" }); } });
app.post('/api/gemini/clear', async c => { await c.env.DB.prepare('DELETE FROM chats').run(); return c.redirect('/'); });

// --- Diary ---
app.get('/diary', async c => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>Diary</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:0;">
      <header style="display:flex; justify-content:space-between; padding:0.8rem 1.5rem; background:#fff; border-bottom:1px solid #e2e8f0;"><div style="font-size:1.2rem; font-weight:900;">Dashboard</div><div style="display:flex; gap:15px;"><a href="/" style="text-decoration:none; font-weight:600; color:#64748b;">Home</a><a href="/diary" style="text-decoration:none; font-weight:600; color:#3b82f6;">Diary</a><a href="/chat" style="text-decoration:none; font-weight:600; color:#64748b;">Chat</a><a href="/call" style="text-decoration:none; font-weight:600; color:#64748b;">Call</a></div></header>
      <div style="max-width:600px; margin:20px auto; padding:0 15px; display:flex; flex-direction:column; gap:15px;">
        <h2 style="margin-top:0;">全ての記録</h2>
        ${results.map(n => html`<div style="background:#fff; padding:15px; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span style="color:#64748b; font-size:0.9rem;">${new Date(n.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} ${n.location_name ? html`<span style="color:#3b82f6; font-weight:bold;">📍 ${n.location_name}</span>` : ''}</span><div style="display:flex; gap:10px;"><a href="/diary/edit/${n.id}" style="color:#3b82f6; text-decoration:none;">編集</a><form method="POST" action="/diary/delete" style="margin:0;"><input type="hidden" name="id" value="${n.id}"><button type="submit" style="background:none; border:none; color:#ef4444; text-decoration:underline; cursor:pointer; padding:0;">削除</button></form></div></div><p class="diary-text" style="margin:0; white-space:pre-wrap; line-height:1.5;">${n.content}</p>${n.image_url ? html`<img src="${n.image_url}" style="margin-top:10px; border-radius:8px; max-width:100%;">` : ''}</div>`)}
      </div>
      <script>
        document.querySelectorAll('.diary-text').forEach(el => {
          const t = el.textContent, r = /(https?:\\/\\/[^\\s]+)/g;
          if (r.test(t)) { el.innerHTML = t.replace(r, '<a href="$1" class="auto-link" target="_blank" style="color:#3b82f6;">$1</a>'); el.querySelectorAll('.auto-link').forEach(async a => { const u=a.href, c=document.createElement('a'); c.href=u; c.target="_blank"; c.style.cssText="display:flex;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:10px;text-decoration:none;color:#0f172a;background:#f8fafc;height:80px;"; c.innerHTML='<div style="padding:10px;font-size:0.8rem;color:#64748b;">🔗 読込中...</div>'; a.parentNode.insertBefore(c, a.nextSibling); try{ const res=await fetch('/api/ogp?url='+encodeURIComponent(u)), o=await res.json(); if(o.title) c.innerHTML=(o.image?'<img src="'+o.image+'" style="width:80px;height:100%;object-fit:cover;border-right:1px solid #e2e8f0;">':'<div style="width:80px;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:24px;">🔗</div>')+'<div style="padding:8px 10px;display:flex;flex-direction:column;justify-content:center;flex:1;overflow:hidden;"><div style="font-weight:bold;font-size:0.85rem;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+o.title+'</div><div style="font-size:0.75rem;color:#64748b;margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">'+(o.description||new URL(u).hostname)+'</div></div>'; else c.remove(); }catch(e){c.remove();} }); }
        });
      </script>
    </body></html>
  `);
});
app.post('/diary/delete', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(b['id']).run(); return c.redirect(b['date'] ? '/?date=' + b['date'] : '/diary'); });
app.get('/diary/edit/:id', async c => { const n = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(c.req.param('id')).first(); return c.html(html`<!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>編集</title></head><body style="font-family:sans-serif; background:#f8fafc; padding:20px;"><div style="max-width:600px; background:#fff; padding:20px; border-radius:12px;"><h2 style="margin-top:0;">編集</h2><form method="POST" action="/diary/edit/${n.id}" style="display:flex; flex-direction:column; gap:15px;"><textarea name="content" rows="6" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${n.content}</textarea><div style="display:flex; gap:10px;"><button type="submit" style="flex:1; padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">更新する</button><a href="/diary" style="padding:12px 20px; background:#e2e8f0; color:#0f172a; border-radius:8px; text-decoration:none; font-weight:bold;">キャンセル</a></div></form></div></body></html>`); });
app.post('/diary/edit/:id', async c => { await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind((await c.req.parseBody())['content'], c.req.param('id')).run(); return c.redirect('/diary'); });
app.get('/diary/post', c => c.html(html`<!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>新規投稿</title></head><body style="font-family:sans-serif; background:#f8fafc; padding:20px;"><a href="/" style="color:#3b82f6; text-decoration:none; font-weight:bold;">← ホーム</a><div style="max-width:600px; background:#fff; padding:20px; border-radius:12px; margin-top:15px;"><h2 style="margin-top:0;">新規追加</h2><form method="POST" action="/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;"><textarea name="content" rows="6" placeholder="いまどうしてる？" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;"></textarea><input type="file" name="image" accept="image/*"><input type="hidden" name="lat" id="lat"><input type="hidden" name="lng" id="lng"><input type="hidden" name="location_name" id="location_name"><button type="submit" style="padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">保存する</button></form><div id="gs" style="font-size:0.8rem; color:#64748b; margin-top:15px; font-weight:bold;">📍 位置情報を取得中...</div></div><script>if(navigator.geolocation){navigator.geolocation.getCurrentPosition(async p=>{const lat=p.coords.latitude,lng=p.coords.longitude;document.getElementById('lat').value=lat;document.getElementById('lng').value=lng;try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);const d=await r.json();if(d.address){const l=(d.address.province||'')+(d.address.city||d.address.town||d.address.village||'')+(d.address.suburb||d.address.quarter||'');if(l){document.getElementById('location_name').value=l;document.getElementById('gs').innerHTML='📍 <b>'+l+'</b> の位置情報を記録します';document.getElementById('gs').style.color='#3b82f6';return;}}}catch(e){}document.getElementById('gs').textContent='📍 現在地を記録します';document.getElementById('gs').style.color='#3b82f6';},()=>{document.getElementById('gs').textContent='⚠️ 位置情報取得失敗';},{enableHighAccuracy:true});}</script></body></html>`));
app.post('/diary/post', async c => { const b = await c.req.parseBody(); let img = null; if (b['image'] instanceof File && b['image'].size > 0) { const fn = `${Date.now()}-${b['image'].name}`; await c.env.BUCKET.put(fn, await b['image'].arrayBuffer(), { httpMetadata: { contentType: b['image'].type } }); img = `/images/${fn}`; } await c.env.DB.prepare('INSERT INTO notes (content, image_url, lat, lng, location_name, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(b['content'], img, b['lat']?parseFloat(b['lat']):null, b['lng']?parseFloat(b['lng']):null, b['location_name']||null, Date.now()).run(); return c.redirect('/'); });
app.get('/images/:key', async c => { const o = await c.env.BUCKET.get(c.req.param('key')); if (!o) return c.text('Not Found', 404); const h = new Headers(); o.writeHttpMetadata(h); h.set('etag', o.httpEtag); return new Response(o.body, { headers: h }); });

export const onRequest = handle(app);