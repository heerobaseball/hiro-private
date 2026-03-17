import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html, raw } from 'hono/html';

const app = new Hono();

// --- 1. PWA ---
app.get('/manifest.json', c => c.json({
  name: "My Dashboard", short_name: "Dashboard", start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#3b82f6",
  icons: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }],
  shortcuts: [{ name: "現在地にチェックイン", short_name: "📍 チェックイン", url: "/checkin", icons: [{ src: "/icon.svg", sizes: "192x192" }] }]
}));
app.get('/sw.js', c => { c.header('Content-Type', 'application/javascript'); return c.body(`self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim()); self.addEventListener('fetch', e => {});`); });
app.get('/icon.svg', c => { c.header('Content-Type', 'image/svg+xml'); return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3b82f6" rx="112"/><text x="256" y="340" font-size="280" font-weight="bold" text-anchor="middle" fill="white" font-family="sans-serif">D</text></svg>`); });

// --- チェックイン画面 ---
app.get('/checkin', c => c.html(`
<!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>Check-in</title></head>
<body style="background:#f8fafc; color:#0f172a; text-align:center; padding-top:100px; font-family:sans-serif;">
  <h2 id="msg">📍 GPSで現在地を取得中...</h2>
  <script>
    if(!navigator.geolocation) { alert('GPS非対応です'); window.location.href='/'; }
    navigator.geolocation.getCurrentPosition(async pos => {
      document.getElementById('msg').textContent = '📍 場所を特定中...';
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let locName = null;
      try {
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);
        const data = await res.json();
        if(data.address) locName = (data.address.province || data.address.state || '') + (data.address.city || data.address.town || data.address.village || '') + (data.address.suburb || data.address.quarter || '');
      } catch(e) {}
      document.getElementById('msg').textContent = '💾 データベースに記録中...';
      await fetch('/api/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat: lat, lng: lng, location_name: locName})});
      window.location.href = '/';
    }, () => { alert('位置情報の取得に失敗しました。'); window.location.href='/'; }, {enableHighAccuracy: true});
  </script>
</body></html>
`));

// --- 2. ニュース取得 ---
async function fetchNews() {
  const baseQuery = "site:bloomberg.co.jp OR site:jp.reuters.com OR site:nikkei.com";
  const queries = {
    top: `https://news.google.com/rss/search?q=${encodeURIComponent(baseQuery)}&hl=ja&gl=JP&ceid=JP:ja`,
    biz: `https://news.google.com/rss/search?q=${encodeURIComponent('政治 OR 経済 ' + baseQuery)}&hl=ja&gl=JP&ceid=JP:ja`,
    market: `https://news.google.com/rss/search?q=${encodeURIComponent('株 OR 為替 OR マーケット ' + baseQuery)}&hl=ja&gl=JP&ceid=JP:ja`,
    it: `https://news.google.com/rss/search?q=${encodeURIComponent('IT OR AI OR テクノロジー ' + baseQuery)}&hl=ja&gl=JP&ceid=JP:ja`
  };
  const results = {};
  for (const [key, url] of Object.entries(queries)) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const items = [];
      const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<source.*?>(.*?)<\/source>/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (items.length >= 8) break;
        let imgUrl = null;
        const imgMatch = match[3].match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) imgUrl = imgMatch[1];
        items.push({ title: match[1], link: match[2], imgUrl: imgUrl, source: match[4] });
      }
      results[key] = items;
    } catch(e) { results[key] = []; }
  }
  return results;
}

const renderNewsTab = (items, tabId, isActive) => html`
  <div id="${tabId}" class="news-list ${isActive ? 'active-tab' : ''}">
    ${items.map(item => html`
      <a href="${item.link}" target="_blank" class="news-item">
        ${item.imgUrl ? html`<img src="${item.imgUrl}" class="news-thumb" loading="lazy">` : html`<div class="news-thumb no-img">No Img</div>`}
        <div class="news-text">
          <div class="news-title">${item.title.replace(` - ${item.source}`, '')}</div>
          <div><span class="source-tag">${item.source}</span></div>
        </div>
      </a>
    `)}
  </div>
`;

// --- 3. メインレイアウト ---
app.get('/', async (c) => {
  const tokyoDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const yyyy = tokyoDate.getFullYear();
  const mm = String(tokyoDate.getMonth() + 1).padStart(2, '0');
  const dd = String(tokyoDate.getDate()).padStart(2, '0');
  const defaultDate = `${yyyy}-${mm}-${dd}`;
  const targetDate = c.req.query('date') || defaultDate;
  const minDate = `${yyyy - 5}-${mm}-${dd}`;

  const startOfDay = new Date(`${targetDate}T00:00:00+09:00`).getTime();
  const endOfDay = new Date(`${targetDate}T23:59:59+09:00`).getTime();

  const [news, dbNotes, dbTodos, dbChatsRaw, dbMemos, dbCheckinsRaw, dbMapNotesRaw] = await Promise.all([
    fetchNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 10').all(),
    c.env.DB.prepare('SELECT * FROM todos ORDER BY is_completed ASC, created_at DESC').all(),
    c.env.DB.prepare('SELECT * FROM chats ORDER BY created_at DESC LIMIT 30').all(),
    c.env.DB.prepare('SELECT * FROM quick_memo ORDER BY id DESC').all(),
    c.env.DB.prepare('SELECT * FROM checkins WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(startOfDay, endOfDay).all(),
    c.env.DB.prepare('SELECT * FROM notes WHERE lat IS NOT NULL AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC').bind(startOfDay, endOfDay).all()
  ]);

  const chatHistory = dbChatsRaw.results.reverse();
  const mapPoints = [
    ...dbCheckinsRaw.results.map(c => ({ type: 'checkin', id: c.id, lat: c.lat, lng: c.lng, locName: c.location_name, time: c.created_at })),
    ...dbMapNotesRaw.results.map(n => ({ type: 'diary', id: n.id, lat: n.lat, lng: n.lng, locName: n.location_name, time: n.created_at, content: n.content, image: n.image_url }))
  ].sort((a, b) => a.time - b.time);

  const googleMapsApiKey = c.env.GOOGLE_MAPS_API_KEY || '';

  return c.html(html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#3b82f6">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icon.svg">
  <title>My Dashboard</title>
  
  ${googleMapsApiKey ? html`<script src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=geometry&callback=initMap" async defer></script>` : ''}

  <style>
    :root { --bg: #f8fafc; --card-bg: #ffffff; --text-main: #0f172a; --text-muted: #64748b; --border: #e2e8f0; --primary: #3b82f6; --primary-light: #eff6ff; --button-dark: #1e293b; --radius: 16px; }
    body { margin: 0; background: var(--bg); color: var(--text-main); font-family: -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
    a { text-decoration: none; color: inherit; }
    .navbar { display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 0.8rem 1.5rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .nav-brand { font-size: 1.2rem; font-weight: 900; }
    .nav-links { display: flex; gap: 15px; } .nav-links a { font-weight: 600; color: var(--text-muted); }
    .nav-links a.active { color: var(--primary); }
    .container { max-width: 1400px; margin: 1rem auto 3rem; padding: 0 1rem; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .card { background: var(--card-bg); border-radius: var(--radius); padding: 1.2rem; border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
    .card-header { font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px; }
    .card-icon { background: var(--primary-light); color: var(--primary); width: 28px; height: 28px; display: inline-flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 1rem; }
    .col-span-3 { grid-column: span 3; } .col-span-2 { grid-column: span 2; } .col-span-1 { grid-column: span 1; }
    @media (max-width: 1024px) { .container { grid-template-columns: repeat(2, 1fr); } .col-span-3 { grid-column: span 2; } }
    @media (max-width: 768px) { .container { grid-template-columns: 1fr; } .col-span-3, .col-span-2, .col-span-1 { grid-column: span 1; } }
    .clock-horizontal { display: flex; flex-direction: column; align-items: center; gap: 5px; }
    .date-jp { font-size: 1.1rem; font-weight: 700; }
    .time-display { font-size: 3.5rem; font-weight: 900; line-height: 1; margin: 0; letter-spacing: -2px; }
    .koyomi-display { font-size: 0.8rem; color: #0369a1; background: #e0f2fe; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 8px 16px; background: #f1f5f9; border: 1px solid var(--border); border-radius: 20px; font-size: 0.9rem; font-weight: bold; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
    .tab-btn.active { background: var(--button-dark); color: white; border-color: var(--button-dark); }
    .news-list { display: none; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 280px; padding-right: 4px; }
    .news-list.active-tab { display: flex; }
    .news-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 8px; border-bottom: 1px solid var(--border); }
    .news-thumb { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border); }
    .news-thumb.no-img { background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-muted); }
    .news-text { flex-grow: 1; display: flex; flex-direction: column; gap: 4px; }
    .news-title { font-size: 0.95rem; font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .source-tag { font-size: 0.7rem; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    .memo-add-form, .todo-form, .chat-input-area { display: flex; gap: 8px; margin-bottom: 12px; }
    .memo-add-form input, .todo-form input, .chat-input-area input { flex-grow: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; outline: none; }
    .memo-add-form button, .todo-form button, .chat-input-area button { padding: 0 16px; background: var(--button-dark); color: white; border: none; border-radius: 8px; font-weight: bold; }
    .memo-list, .todo-list, .chat-box { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 280px; padding-right: 4px; }
    .memo-item, .todo-item { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 10px; position: relative; }
    .memo-textarea { width: 100%; border: none; background: transparent; resize: none; min-height: 24px; font-family: inherit; font-size: 16px; color: var(--text-main); outline: none; line-height: 1.5; padding: 0; }
    .memo-delete { position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
    .todo-check { width: 24px; height: 24px; border-radius: 6px; border: 2px solid #cbd5e1; background: white; color: white; display:flex; align-items:center; justify-content:center; }
    .todo-check.done { background: var(--primary); border-color: var(--primary); }
    .todo-text { flex-grow: 1; font-size: 16px; font-weight: 500; }
    .todo-text.done { text-decoration: line-through; color: var(--text-muted); font-weight: 400; }
    .todo-delete { background: transparent; border: none; color: #ef4444; font-size: 1.4rem; padding: 0 5px; }
    .chat-box { background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border); }
    .chat-msg { padding: 10px 14px; border-radius: 12px; font-size: 15px; max-width: 90%; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
    .user-msg { background: var(--button-dark); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .ai-msg { background: #ffffff; color: #0f172a; align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid var(--border); }
    .chat-header-flex { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    #image-preview-container { display: none; margin-bottom: 8px; position: relative; width: fit-content; }
    #image-preview { max-height: 80px; border-radius: 8px; border: 1px solid var(--border); }
    #clear-image { position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; }
    
    .diary-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 350px; padding-right: 4px; }
    .diary-list-item { display: flex; gap: 12px; align-items: center; padding: 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; transition: 0.2s; }
    .diary-list-item:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .diary-list-thumb { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border); }
    .diary-list-thumb.no-img { background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
    .diary-list-info { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
    .diary-list-date { font-size: 0.75rem; color: #3b82f6; font-weight: bold; }
    .diary-list-text { font-size: 0.95rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .leaflet-control-attribution { font-size: 10px !important; }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="nav-brand">My Dashboard</div>
    <div class="nav-links">
      <a href="/" class="active">Home</a>
      <a href="/diary">Diary</a>
      <a href="/chat">Chat</a>
    </div>
  </header>
  <main>
    <div class="container">
      
      <div class="card col-span-3" style="border-top: 4px solid var(--primary); justify-content: center; padding: 1.2rem 2rem;">
        <div class="clock-horizontal">
          <div class="date-jp" id="date-jp">--年--月--日</div>
          <div class="time-display" id="time-display">--:--</div>
          <div class="koyomi-display" id="koyomi-display">読込中...</div>
        </div>
      </div>

      <div class="card col-span-1">
        <div class="card-header"><span class="card-icon">⛅</span> <span id="weather-title">天気予報 (現在地を特定中...)</span></div>
        <div id="weather-widget" style="display:flex; flex-direction:column; gap:10px;"><div style="text-align:center; padding: 20px; color:var(--text-muted);">読込中...</div></div>
      </div>

      <div class="card col-span-2">
        <div class="card-header"><span class="card-icon">📰</span> ニュース</div>
        <div class="tabs">
          <button class="tab-btn active" data-target="tab-top">主要</button>
          <button class="tab-btn" data-target="tab-biz">政治・経済</button>
          <button class="tab-btn" data-target="tab-market">マーケット</button>
          <button class="tab-btn" data-target="tab-it">IT</button>
        </div>
        <div class="news-list-container">
          ${renderNewsTab(news.top, 'tab-top', true)}
          ${renderNewsTab(news.biz, 'tab-biz', false)}
          ${renderNewsTab(news.market, 'tab-market', false)}
          ${renderNewsTab(news.it, 'tab-it', false)}
        </div>
      </div>

      <div class="card col-span-1">
        <div class="card-header"><span class="card-icon">📝</span> メモ</div>
        <form class="memo-add-form" method="POST" action="/memo/add"><input type="text" name="content" placeholder="新規メモ..." required autocomplete="off"><button type="submit">+</button></form>
        <div class="memo-list">
          ${dbMemos.results.map(memo => html`
            <div class="memo-item"><textarea class="memo-textarea" data-id="${memo.id}">${memo.content}</textarea><form method="POST" action="/memo/delete" style="margin:0;"><input type="hidden" name="id" value="${memo.id}"><button type="submit" class="memo-delete">×</button></form></div>
          `)}
        </div>
      </div>

      <div class="card col-span-2">
        <div class="card-header"><span class="card-icon">✅</span> 共有 ToDoリスト</div>
        <div class="todo-list">
          ${dbTodos.results.length === 0 ? html`<p style="color:var(--text-muted); font-size:14px;">タスクなし</p>` : ''}
          ${dbTodos.results.map(todo => html`
            <div class="todo-item">
              <form method="POST" action="/todos/toggle" style="margin:0;"><input type="hidden" name="id" value="${todo.id}"><input type="hidden" name="current" value="${todo.is_completed}"><button type="submit" class="todo-check ${todo.is_completed ? 'done' : ''}">${todo.is_completed ? '✓' : ''}</button></form>
              <div class="todo-text ${todo.is_completed ? 'done' : ''}">${todo.task}</div>
              <form method="POST" action="/todos/delete" style="margin:0;"><input type="hidden" name="id" value="${todo.id}"><button type="submit" class="todo-delete">×</button></form>
            </div>
          `)}
        </div>
        <form class="todo-form" method="POST" action="/todos/add"><input type="text" name="task" placeholder="タスク追加..." required><button type="submit">追加</button></form>
      </div>

      <div class="card col-span-1">
        <div class="card-header"><span class="card-icon">📅</span> スケジュール</div>
        <iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FTokyo&showPrint=0&src=aGVlcm8uYmFzZWJhbGxAZ21haWwuY29t&src=MTVrYTNuOXA0NGlwcjZrMDNtamRoMzk3MGNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=MG81bzExMWh1MmF1c2xwbW92bjRtZHR1bzRAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=amEuamFwYW5lc2UjaG9saWRheUBncm91cC52LmNhbGVuZGFyLmdvb2dsZS5jb20&src=aHQzamxmYWFjNWxmZDYyNjN1bGZoNHRxbDhAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%233f51b5&color=%23f6bf26&color=%23795548&color=%23009688&color=%23b39ddb" style="border: 0" width="100%" height="350" frameborder="0" scrolling="no"></iframe>
      </div>

      <div class="card col-span-2">
        <div class="card-header"><span class="card-icon">📈</span> マーケット</div>
        <div class="tradingview-widget-container" style="height:350px;">
          <div class="tradingview-widget-container__widget"></div>
          <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>
          {
            "width": "100%", "height": 350,
            "symbolsGroups": [
              {
                "name": "Watchlist",
                "symbols": [
                  { "name": "FOREXCOM:SPXUSD", "displayName": "S&P 500" },
                  { "name": "AMEX:VOO", "displayName": "Vanguard S&P 500 ETF" },
                  { "name": "NYSE:KO", "displayName": "Coca-Cola" },
                  { "name": "FX_IDC:USDJPY", "displayName": "USD/JPY" },
                  { "name": "BITSTAMP:BTCUSD", "displayName": "BTC/USD" },
                  { "name": "BITSTAMP:ETHUSD", "displayName": "ETH/USD" },
                  { "name": "BITSTAMP:XRPUSD", "displayName": "XRP/USD" },
                  { "name": "COINBASE:SHIBUSD", "displayName": "SHIB/USD" }
                ]
              }
            ],
            "colorTheme": "light", "isTransparent": true, "locale": "ja"
          }
          </script>
        </div>
      </div>

      <div class="card col-span-1">
        <div class="card-header chat-header-flex">
          <div><span class="card-icon">✨</span> Gemini Chat</div>
          <form method="POST" action="/api/gemini/clear" style="margin:0;" onsubmit="return confirm('消去しますか？');"><button type="submit" style="font-size:12px; border:none; background:none; color:var(--text-muted); text-decoration:underline;">クリア</button></form>
        </div>
        <div id="chat-history" class="chat-box">
          ${chatHistory.length === 0 ? html`<div class="chat-msg ai-msg">こんにちは！画像を添付しての相談も可能です。</div>` : ''}
          ${chatHistory.map(chat => html`<div class="chat-msg ${chat.role === 'user' ? 'user-msg' : 'ai-msg'}">${chat.message}</div>`)}
        </div>
        <div id="image-preview-container"><img id="image-preview" src=""><div id="clear-image">×</div></div>
        <form id="gemini-form" class="chat-input-area" style="align-items:center;">
          <label for="chat-image-input" style="font-size:24px; cursor:pointer; margin-right:5px;">📷</label><input type="file" id="chat-image-input" accept="image/*" style="display:none;" capture="environment">
          <input type="text" id="gemini-input" placeholder="メッセージ..." required autocomplete="off" style="width:100%;"><button type="submit" id="gemini-submit">▶</button>
        </form>
      </div>

      <div class="card col-span-2">
        <div class="card-header chat-header-flex">
          <div><span class="card-icon">📸</span> Diary</div><a href="/diary/post" style="font-size:14px; color:var(--primary); font-weight:bold;">＋ 投稿</a>
        </div>
        <div class="diary-list">
          ${dbNotes.results.length === 0 ? html`<div style="color:var(--text-muted); text-align:center; padding:20px;">まだ記録がありません</div>` : ''}
          ${dbNotes.results.map(note => {
            const dDate = new Date(note.created_at + 9 * 3600000);
            const dateStr = dDate.getUTCFullYear() + '-' + String(dDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dDate.getUTCDate()).padStart(2, '0') + ' ' + String(dDate.getUTCHours()).padStart(2, '0') + ':' + String(dDate.getUTCMinutes()).padStart(2, '0');
            const shortText = note.content.replace(/\n/g, ' ');
            return html`
              <a href="/diary" class="diary-list-item">
                ${note.image_url ? html`<img src="${note.image_url}" class="diary-list-thumb" loading="lazy">` : html`<div class="diary-list-thumb no-img">📝</div>`}
                <div class="diary-list-info">
                  <div class="diary-list-date">${dateStr}</div>
                  <div class="diary-list-text">${shortText}</div>
                </div>
              </a>
            `;
          })}
        </div>
      </div>

      <div class="card col-span-3">
        <div class="card-header chat-header-flex">
          <div><span class="card-icon">🗺️</span> 行動軌跡トラッカー (Google Maps)</div>
          <input type="date" value="${targetDate}" min="${minDate}" max="${defaultDate}" onchange="window.location.href='/?date='+this.value" style="padding:6px 12px; border:1px solid var(--border); border-radius:8px; font-weight:bold; color:var(--text-main); font-size:14px; outline:none;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:1rem; color:var(--text-muted); font-weight:bold;">総移動距離: <span id="total-distance" style="color:var(--primary); font-size:1.4rem;">0</span> km</div>
          <button onclick="manualCheckin()" style="padding:10px 20px; background:var(--button-dark); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px rgba(0,0,0,0.1);">📍 今ここを記録する</button>
        </div>
        
        <div id="map" style="height:400px; border-radius:12px; border:1px solid var(--border); z-index:1; position:relative; overflow:hidden;">
          ${!googleMapsApiKey ? html`
            <div style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(255,255,255,0.9); z-index:10; display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:20px;">
              <h3 style="color:#ef4444; margin-bottom:10px;">⚠️ Google Maps APIキーが未設定です</h3>
              <p style="font-size:0.9rem; color:var(--text-muted);">Cloudflareのダッシュボードで <b>GOOGLE_MAPS_API_KEY</b> を登録してください。</p>
            </div>
          ` : ''}
        </div>

        <div style="margin-top: 15px; max-height: 250px; overflow-y: auto; display:flex; flex-direction:column; gap:8px; padding-right:4px;">
          ${mapPoints.length === 0 ? html`<div style="font-size:0.9rem; color:var(--text-muted); text-align:center; padding:10px;">この日の記録はありません。</div>` : ''}
          ${mapPoints.map(p => {
            const d = new Date(p.time + 9 * 3600000);
            const timeStr = d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2,'0');
            const locText = p.locName ? `<div style="font-size:0.75rem; color:#3b82f6; margin-top:2px; font-weight:bold;">📍 ${p.locName}</div>` : '';
            return html`
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid var(--border); font-size:0.9rem;">
                <div style="display:flex; align-items:flex-start; gap:8px; overflow:hidden; flex:1;">
                  <span style="font-size:1.2rem;">${p.type === 'checkin' ? '📍' : '📝'}</span>
                  <b style="min-width:40px; margin-top:2px;">${timeStr}</b>
                  <div style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
                    <span style="color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                      ${p.type === 'diary' ? p.content.replace(/\n/g, ' ') : '現在地チェックイン'}
                    </span>
                    ${raw(locText)}
                  </div>
                </div>
                <form method="POST" action="${p.type === 'checkin' ? '/api/checkin/delete' : '/diary/delete'}" style="margin:0; flex-shrink:0; padding-left:10px;" onsubmit="return confirm('この履歴を削除しますか？');">
                  <input type="hidden" name="id" value="${p.id}">
                  <input type="hidden" name="date" value="${targetDate}">
                  <button type="submit" style="background:none; border:none; color:#ef4444; font-size:1.4rem; cursor:pointer; font-weight:bold; padding:0 5px;">×</button>
                </form>
              </div>
            `;
          })}
        </div>
      </div>

    </div>

    <script>
      function updateClock() {
        const now = new Date(); document.getElementById('time-display').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
        const dateOptions = { era: 'long', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        document.getElementById('date-jp').textContent = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', dateOptions).format(now);
        const oldMonths = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];
        document.getElementById('koyomi-display').textContent = \`西暦\${now.getFullYear()}年 / 旧暦: \${oldMonths[now.getMonth()]}\`;
      } setInterval(updateClock, 1000); updateClock();

      async function fetchWeatherData(lat, lng, locationName) {
        try {
          const res = await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=4\`);
          const data = await res.json();
          const getIcon = c => (c<=1?'☀️':c<=3?'⛅':c<=48?'☁️':c<=55?'🌧️':c<=65?'☔':c<=77?'❄️':c<=82?'🌦️':'⛈️');
          const d = data.daily;
          let html = \`<div style="font-size:0.9rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--primary-light); padding:12px; border-radius:8px; margin-bottom:12px;">
              <div style="font-size:2.5rem; line-height:1;">\${getIcon(d.weathercode[0])}</div>
              <div style="text-align:right;">
                <div style="font-weight:bold; font-size:1.1rem; color:var(--text-main);">今日</div>
                <div style="font-size:1rem; margin:4px 0;"><span style="color:#ef4444; font-weight:bold;">\${Math.round(d.temperature_2m_max[0])}°</span> / <span style="color:#3b82f6; font-weight:bold;">\${Math.round(d.temperature_2m_min[0])}°</span></div>
                <div style="font-size:0.8rem; color:var(--text-muted); font-weight:bold;">降水確率 \${d.precipitation_probability_max[0]}%</div>
              </div>
            </div><div style="display:flex; gap:8px; justify-content:space-between;">\`;
          for(let i=1; i<=3; i++) {
            const date = new Date(d.time[i]);
            html += \`<div style="flex:1; background:#f8fafc; padding:8px 4px; border-radius:8px; text-align:center; border:1px solid var(--border);">
              <div style="font-size:0.8rem; font-weight:bold; color:var(--text-muted);">\${date.getMonth()+1}/\${date.getDate()}</div>
              <div style="font-size:1.5rem; margin:4px 0;">\${getIcon(d.weathercode[i])}</div>
              <div style="font-size:0.8rem; font-weight:bold;"><span style="color:#ef4444;">\${Math.round(d.temperature_2m_max[i])}°</span> <span style="color:#3b82f6;">\${Math.round(d.temperature_2m_min[i])}°</span></div>
            </div>\`;
          }
          document.getElementById('weather-widget').innerHTML = html + '</div></div>';
          document.getElementById('weather-title').textContent = \`天気予報 (\${locationName})\`;
        } catch (e) { 
          document.getElementById('weather-widget').innerHTML = '取得失敗'; 
          document.getElementById('weather-title').textContent = '天気予報 (エラー)';
        }
      }

      async function fetchWeatherWithGeocode(lat, lng) {
        try {
          const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);
          const data = await res.json();
          let locName = '現在地';
          if(data.address) locName = data.address.city || data.address.town || data.address.village || data.address.suburb || '現在地';
          fetchWeatherData(lat, lng, locName);
        } catch(e) {
          fetchWeatherData(lat, lng, '現在地');
        }
      }

      function loadWeather() {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => { fetchWeatherWithGeocode(pos.coords.latitude, pos.coords.longitude); },
            err => { fetchWeatherData(35.8617, 139.6455, '埼玉'); },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
          );
        } else {
          fetchWeatherData(35.8617, 139.6455, '埼玉');
        }
      }
      loadWeather();

      const tabBtns = document.querySelectorAll('.tab-btn');
      const newsLists = document.querySelectorAll('.news-list');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active')); newsLists.forEach(l => l.classList.remove('active-tab'));
          btn.classList.add('active'); document.getElementById(btn.getAttribute('data-target')).classList.add('active-tab');
        });
      });

      document.querySelectorAll('.memo-textarea').forEach(t => {
        t.style.height = t.scrollHeight + 'px';
        let to;
        t.addEventListener('input', e => {
          e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
          clearTimeout(to);
          to = setTimeout(() => fetch('/api/memo/update', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:e.target.dataset.id, content:e.target.value})}), 800);
        });
      });

      const historyDiv = document.getElementById('chat-history'); historyDiv.scrollTop = historyDiv.scrollHeight;
      let imgData = null, imgMime = null;
      const fileInput = document.getElementById('chat-image-input'), prevContainer = document.getElementById('image-preview-container'), prevImg = document.getElementById('image-preview');
      fileInput.addEventListener('change', e => {
        if(e.target.files[0]) {
          imgMime = e.target.files[0].type;
          const r = new FileReader(); r.onload = ev => { prevImg.src = ev.target.result; prevContainer.style.display = 'block'; imgData = ev.target.result.split(',')[1]; }; r.readAsDataURL(e.target.files[0]);
        }
      });
      document.getElementById('clear-image').addEventListener('click', () => { fileInput.value=''; imgData=null; prevContainer.style.display='none'; });

      document.getElementById('gemini-form').addEventListener('submit', async e => {
        e.preventDefault();
        const input = document.getElementById('gemini-input'), btn = document.getElementById('gemini-submit'), prompt = input.value;
        historyDiv.innerHTML += \`<div class="chat-msg user-msg">\${imgData ? '📷[画像] '+prompt : prompt}</div>\`;
        input.value = ''; btn.disabled = true; historyDiv.scrollTop = historyDiv.scrollHeight;
        const payload = { prompt, imageBase64: imgData, imageMimeType: imgMime };
        fileInput.value=''; imgData=null; prevContainer.style.display='none';
        try {
          const res = await fetch('/api/gemini', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
          const data = await res.json(); historyDiv.innerHTML += \`<div class="chat-msg ai-msg">\${data.response}</div>\`;
        } catch (err) { historyDiv.innerHTML += \`<div class="chat-msg ai-msg" style="color:red;">エラー</div>\`; }
        btn.disabled = false; historyDiv.scrollTop = historyDiv.scrollHeight;
      });

      const mapPoints = ${raw(JSON.stringify(mapPoints))};
      
      window.initMap = function() {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;
        const defaultLocation = { lat: 35.8617, lng: 139.6455 };
        const map = new google.maps.Map(mapElement, {
          zoom: 13, center: defaultLocation, mapTypeId: 'roadmap', disableDefaultUI: true, zoomControl: true,
        });

        if(mapPoints && mapPoints.length > 0) {
          const pathCoordinates = mapPoints.map(p => ({ lat: p.lat, lng: p.lng }));
          const flightPath = new google.maps.Polyline({
            path: pathCoordinates, geodesic: true, strokeColor: '#ef4444', strokeOpacity: 0.8, strokeWeight: 4,
          });
          flightPath.setMap(map);
          const bounds = new google.maps.LatLngBounds();
          
          mapPoints.forEach(p => {
            const d = new Date(p.time);
            const timeStr = d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
            let popupHtml = "";
            let iconLabel = "📍";
            
            if(p.type === 'diary') {
              iconLabel = "📝";
              popupHtml = '<b>📝 日記 (' + timeStr + ')</b><br>' + p.content.replace(/\\n/g, '<br>');
              if(p.locName) popupHtml += '<br><small style="color:#64748b; font-weight:bold;">📍 ' + p.locName + '</small>';
              if(p.image) popupHtml += '<br><img src="' + p.image + '" style="width:100%; margin-top:5px; border-radius:4px;">';
            } else {
              popupHtml = '<b>📍 チェックイン</b><br>' + timeStr;
              if(p.locName) popupHtml += '<br><small style="color:#3b82f6; font-weight:bold;">' + p.locName + '</small>';
            }
            const position = { lat: p.lat, lng: p.lng };
            bounds.extend(position);
            const infowindow = new google.maps.InfoWindow({ content: popupHtml });
            const marker = new google.maps.Marker({
              position: position, map: map, label: { text: iconLabel, fontSize: '20px' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }
            });
            marker.addListener('click', () => { infowindow.open(map, marker); });
          });
          map.fitBounds(bounds);
          
          let totalKm = 0;
          for(let i=1; i<pathCoordinates.length; i++){
            totalKm += google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(pathCoordinates[i-1]),
              new google.maps.LatLng(pathCoordinates[i])
            ) / 1000;
          }
          document.getElementById('total-distance').textContent = totalKm.toFixed(1);
        }
      }

      window.manualCheckin = function() {
        if(!navigator.geolocation) return alert('GPS非対応です');
        const btn = event.target;
        btn.textContent = "⏳ 場所を特定中..."; btn.disabled = true;
        navigator.geolocation.getCurrentPosition(async pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          let locName = null;
          try {
            const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);
            const data = await res.json();
            if(data.address) locName = (data.address.province || data.address.state || '') + (data.address.city || data.address.town || data.address.village || '') + (data.address.suburb || data.address.quarter || '');
          } catch(e) {}
          
          btn.textContent = "💾 記録中...";
          await fetch('/api/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat: lat, lng: lng, location_name: locName})});
          location.reload(); 
        }, () => { alert('位置情報の取得に失敗しました'); btn.textContent="📍 今ここを記録する"; btn.disabled=false; }, {enableHighAccuracy: true});
      }
    </script>
  </main>
</body>
</html>
  `);
});

// --- プライベートチャット (Firebase Realtime DB + D1過去ログ自動アーカイブ) ---
app.get('/chat', async c => {
  // 1. まず、365日以上前の古い過去ログを D1 (Cloudflare) から自動で削除する
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  await c.env.DB.prepare('DELETE FROM private_chats WHERE timestamp < ?').bind(oneYearAgo).run();

  // 2. D1 (Cloudflare) に保存されている過去ログ(直近200件)を取得して画面に渡す
  const archived = await c.env.DB.prepare('SELECT * FROM private_chats ORDER BY timestamp ASC LIMIT 200').all();

  return c.html(html`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <meta name="theme-color" content="#8bb7ea">
      <title>Private Chat - My Dashboard</title>
      <style>
        :root { --bg: #8bb7ea; --text-main: #0f172a; --border: #e2e8f0; --primary: #3b82f6; }
        body { margin: 0; background: var(--bg); color: var(--text-main); font-family: -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        a { text-decoration: none; color: inherit; }
        .navbar { display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 0.8rem 1.5rem; border-bottom: 1px solid var(--border); box-shadow: 0 2px 10px rgba(0,0,0,0.05); flex-shrink: 0; }
        .nav-brand { font-size: 1.2rem; font-weight: 900; }
        .nav-links { display: flex; gap: 15px; } .nav-links a { font-weight: 600; color: #64748b; }
        .nav-links a.active { color: var(--primary); }
        
        .chat-container { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; max-width: 800px; margin: 0 auto; width: 100%; background: #8bb7ea; }
        .messages-area { flex-grow: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; }
        
        /* LINE風デザイン */
        .msg-wrapper { display: flex; align-items: flex-end; margin-bottom: 5px; width: 100%; }
        .msg-wrapper.me { flex-direction: row-reverse; }
        .msg-wrapper.other { flex-direction: row; }
        
        .msg-content { max-width: 75%; display: flex; flex-direction: column; }
        .msg-wrapper.me .msg-content { align-items: flex-end; }
        .msg-wrapper.other .msg-content { align-items: flex-start; }
        
        .sender-name { font-size: 11px; color: #4b5563; margin-bottom: 2px; margin-left: 5px; }
        .chat-bubble { padding: 10px 14px; font-size: 15px; line-height: 1.4; word-break: break-word; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .bg-me { background: #8ce245; color: #000; border-radius: 16px 16px 0 16px; }
        .bg-other { background: #ffffff; color: #000; border-radius: 16px 16px 16px 0; }
        
        .chat-time { font-size: 10px; color: #4b5563; margin: 0 5px; margin-bottom: 2px; }

        /* 入力エリア */
        .input-area { display: flex; padding: 10px 15px; background: #ffffff; border-top: 1px solid var(--border); flex-shrink: 0; align-items: flex-end; gap: 8px; }
        .chat-input { flex-grow: 1; padding: 12px; border: 1px solid #cbd5e1; border-radius: 20px; font-size: 16px; outline: none; background: #f8fafc; resize: none; max-height: 100px; font-family: inherit; }
        .send-btn { background: var(--primary); color: white; border: none; border-radius: 20px; padding: 0 20px; font-weight: bold; font-size: 15px; height: 44px; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
        .send-btn:active { transform: scale(0.95); }
      </style>
    </head>
    <body>
      <header class="navbar">
        <div class="nav-brand">My Dashboard</div>
        <div class="nav-links">
          <a href="/">Home</a>
          <a href="/diary">Diary</a>
          <a href="/chat" class="active">Chat</a>
        </div>
      </header>
      
      <div class="chat-container">
        <div id="messages" class="messages-area">
          <div style="text-align:center; color:#4b5563; font-size:12px; margin-top:20px; margin-bottom:10px;">🔒 暗号化されたプライベートチャットです</div>
        </div>
        
        <form id="chat-form" class="input-area">
          <textarea id="chat-input" class="chat-input" placeholder="メッセージを入力..." rows="1"></textarea>
          <button type="submit" class="send-btn" id="send-btn">送信</button>
        </form>
      </div>

      <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, push, onChildAdded, serverTimestamp, get, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const firebaseConfig = {
          apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0",
          authDomain: "private-chat-54723.firebaseapp.com",
          projectId: "private-chat-54723",
          storageBucket: "private-chat-54723.firebasestorage.app",
          messagingSenderId: "683142642820",
          appId: "1:683142642820:web:b59761f61548ad321d96d1",
          measurementId: "G-J1036BX3BR",
          databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);
        const messagesRef = ref(db, 'messages');

        let myName = localStorage.getItem('chat_name');
        if(!myName) {
          myName = prompt("あなたの名前（表示名）を入力してください") || "ゲスト";
          localStorage.setItem('chat_name', myName);
        }

        const messagesDiv = document.getElementById('messages');
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');

        chatInput.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight < 100 ? this.scrollHeight : 100) + 'px';
        });

        // 吹き出しを画面に作る関数
        function renderMessage(data) {
          const isMe = data.sender === myName;
          let timeStr = "";
          if(data.timestamp) {
            const d = new Date(data.timestamp);
            timeStr = (d.getMonth()+1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
          }

          const msgWrapper = document.createElement('div');
          msgWrapper.className = 'msg-wrapper ' + (isMe ? 'me' : 'other');
          msgWrapper.innerHTML = \`
            <div class="msg-content">
              \${!isMe ? \`<div class="sender-name">\${data.sender}</div>\` : ''}
              <div class="chat-bubble \${isMe ? 'bg-me' : 'bg-other'}">\${data.text.replace(/\\n/g, '<br>')}</div>
            </div>
            <div class="chat-time">\${timeStr}</div>
          \`;
          messagesDiv.appendChild(msgWrapper);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // 1. まず Cloudflare (D1) から送られてきた「過去ログ」をすべて表示する
        const archivedMessages = ${raw(JSON.stringify(archived.results))};
        archivedMessages.forEach(msg => renderMessage(msg));

        // 2. 次に Firebase をチェックし「3日以上前のメッセージ」があれば自動で D1 に引っ越す
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        
        get(messagesRef).then(async (snapshot) => {
           const data = snapshot.val();
           if(data) {
             const toArchive = [];
             for(const key in data) {
               if(data[key].timestamp < threeDaysAgo) {
                 toArchive.push({ id: key, sender: data[key].sender, text: data[key].text, timestamp: data[key].timestamp });
               }
             }
             
             // 3日前のメッセージが見つかったら、CloudflareのAPIに投げて保存し、Firebaseから消す
             if(toArchive.length > 0) {
               try {
                 await fetch('/api/chat/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: toArchive }) });
                 for(const msg of toArchive) {
                   remove(ref(db, 'messages/' + msg.id));
                 }
               } catch(e) {}
             }
           }
        });

        // 3. 最新のメッセージをリアルタイムで受信して表示する
        onChildAdded(messagesRef, (snapshot) => {
          const data = snapshot.val();
          // すでにお引っ越し処理対象になった古いデータは重複表示を避ける
          if (data.timestamp < threeDaysAgo) return; 
          renderMessage(data);
        });

        // メッセージ送信処理
        chatForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const text = chatInput.value.trim();
          if(!text) return;
          
          chatInput.value = '';
          chatInput.style.height = 'auto';
          sendBtn.disabled = true;
          
          try {
            await push(messagesRef, {
              sender: myName,
              text: text,
              timestamp: serverTimestamp()
            });
          } catch(e) {
            alert("送信に失敗しました");
          }
          sendBtn.disabled = false;
          chatInput.focus();
        });

        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
          }
        });
      </script>
    </body>
    </html>
  `);
});

// --- API (これまで通り) ---
const getMeta = (htmlText, prop) => {
  const reg = new RegExp(`<meta(?:\\s+[^>]*?)?(?:property|name)=["']${prop}["']\\s+content=["']([^"']*)["']`, 'i');
  const reg2 = new RegExp(`<meta(?:\\s+[^>]*?)?content=["']([^"']*)["']\\s+(?:property|name)=["']${prop}["']`, 'i');
  const m = htmlText.match(reg) || htmlText.match(reg2);
  return m ? m[1] : null;
};
app.get('/api/ogp', async c => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'no url' }, 400);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const htmlText = await res.text();
    let title = getMeta(htmlText, 'og:title') || getMeta(htmlText, 'twitter:title') || (htmlText.match(/<title>([^<]+)<\/title>/i)?.[1]) || url;
    let image = getMeta(htmlText, 'og:image') || getMeta(htmlText, 'twitter:image');
    let description = getMeta(htmlText, 'og:description') || getMeta(htmlText, 'description');
    return c.json({ title, image, description });
  } catch (e) {
    return c.json({ error: 'failed' });
  }
});

// ★ 追加: FirebaseからD1へのお引っ越しを受け取る専用API
app.post('/api/chat/archive', async c => {
  const { messages } = await c.req.json();
  if (!messages || messages.length === 0) return c.json({ success: true });
  
  // 送られてきた古いメッセージをD1にまとめて保存
  const stmt = c.env.DB.prepare('INSERT OR IGNORE INTO private_chats (id, sender, text, timestamp) VALUES (?, ?, ?, ?)');
  const batch = messages.map(m => stmt.bind(m.id, m.sender, m.text, m.timestamp));
  await c.env.DB.batch(batch);
  
  return c.json({ success: true });
});

app.post('/api/checkin', async c => { 
  const b = await c.req.json(); 
  const locName = b.location_name || null;
  await c.env.DB.prepare('INSERT INTO checkins (lat, lng, location_name, created_at) VALUES (?, ?, ?, ?)').bind(b.lat, b.lng, locName, Date.now()).run(); 
  return c.json({ success: true }); 
});
app.post('/api/checkin/delete', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('DELETE FROM checkins WHERE id = ?').bind(b['id']).run(); return c.redirect('/?date=' + b['date']); });

app.post('/memo/add', async c => { await c.env.DB.prepare('INSERT INTO quick_memo (content) VALUES (?)').bind((await c.req.parseBody())['content']).run(); return c.redirect('/'); });
app.post('/memo/delete', async c => { await c.env.DB.prepare('DELETE FROM quick_memo WHERE id = ?').bind((await c.req.parseBody())['id']).run(); return c.redirect('/'); });
app.post('/api/memo/update', async c => { const { id, content } = await c.req.json(); await c.env.DB.prepare('UPDATE quick_memo SET content = ? WHERE id = ?').bind(content, id).run(); return c.json({ success: true }); });
app.post('/todos/add', async c => { await c.env.DB.prepare('INSERT INTO todos (task, created_at) VALUES (?, ?)').bind((await c.req.parseBody())['task'], Date.now()).run(); return c.redirect('/'); });
app.post('/todos/toggle', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('UPDATE todos SET is_completed = ? WHERE id = ?').bind(b['current']==='1'?0:1, b['id']).run(); return c.redirect('/'); });
app.post('/todos/delete', async c => { await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind((await c.req.parseBody())['id']).run(); return c.redirect('/'); });

// --- Gemini API ---
app.post('/api/gemini', async (c) => {
  const { prompt, imageBase64, imageMimeType } = await c.req.json();
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) return c.json({ response: "APIキー未設定" });
  await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)').bind('user', imageBase64 ? `[📷画像] ${prompt}` : prompt, Date.now()).run();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const system_instruction = { parts: [{ text: "ユーザーが「今日のニュース」と聞いた場合、政治・経済、国内、国際、マーケット、IT、天気予報のジャンルに分け、簡単な説明と参照元URLを含めて回答してください。FXのPOGはPerfect Orderのことです。" }] };
    const requestParts = [{ text: prompt }];
    if (imageBase64 && imageMimeType) requestParts.push({ inline_data: { mime_type: imageMimeType, data: imageBase64 } });
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction, contents: [{ parts: requestParts }] }) });
    const data = await response.json();
    if (!response.ok) return c.json({ response: `APIエラー: ${data.error?.message}` });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return c.json({ response: `ブロックされました: ${data.candidates?.[0]?.finishReason}` });
    await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)').bind('ai', text, Date.now()).run();
    return c.json({ response: text });
  } catch (e) { return c.json({ response: "エラー: " + e.message }); }
});
app.post('/api/gemini/clear', async c => { await c.env.DB.prepare('DELETE FROM chats').run(); return c.redirect('/'); });

// --- Diary ---
app.get('/diary', async c => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>日記一覧</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:0;">
      <header class="navbar" style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 0.8rem 1.5rem; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <div class="nav-brand" style="font-size: 1.2rem; font-weight: 900;">My Dashboard</div>
        <div class="nav-links" style="display: flex; gap: 15px;">
          <a href="/" style="font-weight: 600; color: #64748b; text-decoration: none;">Home</a>
          <a href="/diary" style="font-weight: 600; color: #3b82f6; text-decoration: none;">Diary</a>
          <a href="/chat" style="font-weight: 600; color: #64748b; text-decoration: none;">Chat</a>
        </div>
      </header>

      <div style="max-width:600px; margin: 20px auto; padding: 0 15px; display:flex; flex-direction:column; gap:15px;">
        <h2 style="color:#0f172a; margin-top:0;">全ての記録</h2>
        ${results.map(n => html`
          <div style="background:#fff; padding:15px; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
              <span style="color:#64748b; font-size:0.9rem;">
                ${new Date(n.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                ${n.location_name ? html`<span style="color:#3b82f6; margin-left:8px; font-weight:bold;">📍 ${n.location_name}</span>` : ''}
              </span>
              <div style="display:flex; gap:10px;"><a href="/diary/edit/${n.id}" style="color:#3b82f6; font-size:0.9rem; text-decoration:none;">編集</a><form method="POST" action="/diary/delete" style="margin:0;" onsubmit="return confirm('削除しますか？');"><input type="hidden" name="id" value="${n.id}"><button type="submit" style="background:none; border:none; color:#ef4444; font-size:0.9rem; cursor:pointer; text-decoration:underline; padding:0;">削除</button></form></div>
            </div>
            <p class="diary-text" style="margin:0; white-space:pre-wrap; line-height:1.5;">${n.content}</p>
            ${n.image_url ? html`<img src="${n.image_url}" style="margin-top:10px; border-radius:8px; max-width:100%;">` : ''}
          </div>
        `)}
      </div>

      <script>
        document.querySelectorAll('.diary-text').forEach(el => {
          const text = el.textContent;
          const urlRegex = /(https?:\\/\\/[^\\s]+)/g;
          if (urlRegex.test(text)) {
            el.innerHTML = text.replace(urlRegex, '<a href="$1" class="auto-link" target="_blank" style="color:#3b82f6; word-break:break-all;">$1</a>');
            el.querySelectorAll('.auto-link').forEach(async a => {
              const url = a.href;
              const card = document.createElement('a');
              card.href = url; card.target = "_blank";
              card.style.cssText = "display:flex; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-top:10px; text-decoration:none; color:#0f172a; background:#f8fafc; height:80px; box-shadow:0 1px 3px rgba(0,0,0,0.05); transition:0.2s;";
              card.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:#64748b;">🔗 リンク情報を読み込み中...</div>';
              a.parentNode.insertBefore(card, a.nextSibling);
              try {
                const res = await fetch('/api/ogp?url=' + encodeURIComponent(url));
                const ogp = await res.json();
                if (ogp.title) {
                  card.innerHTML = (ogp.image ? '<img src="' + ogp.image + '" style="width:80px; height:100%; object-fit:cover; border-right:1px solid #e2e8f0;">' : '<div style="width:80px; height:100%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:24px;">🔗</div>') + 
                    '<div style="padding:8px 10px; display:flex; flex-direction:column; justify-content:center; flex:1; overflow:hidden;">' +
                      '<div style="font-weight:bold; font-size:0.85rem; line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">' + ogp.title + '</div>' +
                      '<div style="font-size:0.75rem; color:#64748b; margin-top:4px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">' + (ogp.description || new URL(url).hostname) + '</div>' +
                    '</div>';
                } else { card.remove(); }
              } catch(e) { card.remove(); }
            });
          }
        });
      </script>
    </body></html>
  `);
});

app.post('/diary/delete', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(b['id']).run(); if(b['date']) return c.redirect('/?date=' + b['date']); return c.redirect('/diary'); });

app.get('/diary/edit/:id', async c => {
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(c.req.param('id')).first();
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>編集</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:20px;">
      <div style="max-width:600px; background:#fff; padding:20px; border-radius:12px;">
        <h2 style="margin-top:0;">記録を編集</h2>
        <form method="POST" action="/diary/edit/${note.id}" style="display:flex; flex-direction:column; gap:15px;"><textarea name="content" rows="6" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${note.content}</textarea><div style="display:flex; gap:10px;"><button type="submit" style="flex:1; padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">更新する</button><a href="/diary" style="padding:12px 20px; background:#e2e8f0; color:#0f172a; border-radius:8px; text-decoration:none; font-weight:bold;">キャンセル</a></div></form>
      </div>
    </body></html>
  `);
});
app.post('/diary/edit/:id', async c => { await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind((await c.req.parseBody())['content'], c.req.param('id')).run(); return c.redirect('/diary'); });

app.get('/diary/post', c => {
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>新規投稿</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:20px;">
      <a href="/" style="color:#3b82f6; text-decoration:none; font-weight:bold;">← ホームへ戻る</a>
      <div style="max-width:600px; background:#fff; padding:20px; border-radius:12px; margin-top:15px;">
        <h2 style="margin-top:0;">新しい記録を追加</h2>
        <form method="POST" action="/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;">
          <textarea name="content" rows="6" placeholder="いまどうしてる？（URLを貼るとリンクカードになります）" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0; font-size:16px;"></textarea>
          <input type="file" name="image" accept="image/*">
          <input type="hidden" name="lat" id="lat"><input type="hidden" name="lng" id="lng">
          <input type="hidden" name="location_name" id="location_name">
          <button type="submit" id="submit-btn" style="padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:16px;">保存する</button>
        </form>
        <div id="gps-status" style="font-size:0.8rem; color:#64748b; margin-top:15px; font-weight:bold;">📍 位置情報を取得中...</div>
      </div>
      <script>
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(async pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            document.getElementById('lat').value = lat;
            document.getElementById('lng').value = lng;
            document.getElementById('gps-status').textContent = '📍 場所の名前を特定中...';
            try {
              const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);
              const data = await res.json();
              if(data.address) {
                const locName = (data.address.province || data.address.state || '') + (data.address.city || data.address.town || data.address.village || '') + (data.address.suburb || data.address.quarter || '');
                if(locName) {
                   document.getElementById('location_name').value = locName;
                   document.getElementById('gps-status').innerHTML = '📍 <b>' + locName + '</b> の位置情報を記録します';
                   document.getElementById('gps-status').style.color = '#3b82f6';
                   return;
                }
              }
            } catch(e) {}
            document.getElementById('gps-status').textContent = '📍 現在の位置情報を記録します';
            document.getElementById('gps-status').style.color = '#3b82f6';
          }, () => { document.getElementById('gps-status').textContent = '⚠️ 位置情報が取得できませんでした'; }, {enableHighAccuracy: true});
        }
      </script>
    </body></html>
  `);
});

app.post('/diary/post', async c => {
  const b = await c.req.parseBody(); let img = null;
  if (b['image'] instanceof File && b['image'].size > 0) { const fn = `${Date.now()}-${b['image'].name}`; await c.env.BUCKET.put(fn, await b['image'].arrayBuffer(), { httpMetadata: { contentType: b['image'].type } }); img = `/images/${fn}`; }
  const lat = b['lat'] ? parseFloat(b['lat']) : null; 
  const lng = b['lng'] ? parseFloat(b['lng']) : null;
  const locName = b['location_name'] || null;
  await c.env.DB.prepare('INSERT INTO notes (content, image_url, lat, lng, location_name, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(b['content'], img, lat, lng, locName, Date.now()).run(); 
  return c.redirect('/');
});

app.get('/images/:key', async c => {
  const obj = await c.env.BUCKET.get(c.req.param('key'));
  if (!obj) return c.text('Not Found', 404);
  const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag); return new Response(obj.body, { headers: h });
});

export const onRequest = handle(app);