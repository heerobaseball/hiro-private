import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html, raw } from 'hono/html'; // ★ raw を追加しました

const app = new Hono();

// --- 1. PWA (ショートカット機能追加) ---
app.get('/manifest.json', c => c.json({
  name: "My Dashboard", short_name: "Dashboard", start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#3b82f6",
  icons: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }],
  shortcuts: [{ name: "現在地にチェックイン", short_name: "📍 チェックイン", url: "/checkin", icons: [{ src: "/icon.svg", sizes: "192x192" }] }]
}));
app.get('/sw.js', c => { c.header('Content-Type', 'application/javascript'); return c.body(`self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim()); self.addEventListener('fetch', e => {});`); });
app.get('/icon.svg', c => { c.header('Content-Type', 'image/svg+xml'); return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3b82f6" rx="112"/><text x="256" y="340" font-size="280" font-weight="bold" text-anchor="middle" fill="white" font-family="sans-serif">D</text></svg>`); });

// --- 専用アプリボタンから飛んでくるチェックイン画面 ---
app.get('/checkin', c => c.html(`
<!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>Check-in</title></head>
<body style="background:#f8fafc; color:#0f172a; text-align:center; padding-top:100px; font-family:sans-serif;">
  <h2 id="msg">📍 GPSで現在地を取得中...</h2>
  <script>
    if(!navigator.geolocation) { alert('GPS非対応です'); window.location.href='/'; }
    navigator.geolocation.getCurrentPosition(async pos => {
      document.getElementById('msg').textContent = '💾 データベースに記録中...';
      await fetch('/api/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat:pos.coords.latitude, lng:pos.coords.longitude})});
      window.location.href = '/';
    }, () => { alert('位置情報の取得に失敗しました。スマホの設定でブラウザのGPSを許可してください。'); window.location.href='/'; }, {enableHighAccuracy: true});
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
  const [news, dbNotes, dbTodos, dbChatsRaw, dbMemos, dbCheckinsRaw] = await Promise.all([
    fetchNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 6').all(),
    c.env.DB.prepare('SELECT * FROM todos ORDER BY is_completed ASC, created_at DESC').all(),
    c.env.DB.prepare('SELECT * FROM chats ORDER BY created_at DESC LIMIT 30').all(),
    c.env.DB.prepare('SELECT * FROM quick_memo ORDER BY id DESC').all(),
    c.env.DB.prepare('SELECT * FROM checkins ORDER BY created_at DESC LIMIT 50').all()
  ]);
  const chatHistory = dbChatsRaw.results.reverse();
  const checkins = dbCheckinsRaw.results.reverse();

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
  
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <style>
    :root { --bg: #f8fafc; --card-bg: #ffffff; --text-main: #0f172a; --text-muted: #64748b; --border: #e2e8f0; --primary: #3b82f6; --primary-light: #eff6ff; --button-dark: #1e293b; --radius: 16px; }
    body { margin: 0; background: var(--bg); color: var(--text-main); font-family: -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
    a { text-decoration: none; color: inherit; }
    .navbar { display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 0.8rem 1.5rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .nav-brand { font-size: 1.2rem; font-weight: 900; }
    .nav-links { display: flex; gap: 15px; } .nav-links a { font-weight: 600; color: var(--text-muted); }
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
    .diary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .diary-card { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 1/1; background: var(--border); }
    .diary-card img { width: 100%; height: 100%; object-fit: cover; }
    .diary-card .overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; padding: 8px; font-size: 12px; font-weight: bold; }
    .diary-card.no-image { background: var(--bg); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border); }
    
    /* 地図のスタイル補正 */
    .leaflet-control-attribution { font-size: 10px !important; }
  </style>
</head>
<body>
  <header class="navbar"><div class="nav-brand">My Dashboard</div><div class="nav-links"><a href="/" class="active">Home</a><a href="/diary">Diary</a></div></header>
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
        <div class="card-header"><span class="card-icon">⛅</span> 天気予報 (埼玉)</div>
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
                  { "name": "TVC:TOPIX", "displayName": "東証株価指数" },
                  { "name": "TSE:9432", "displayName": "NTT" },
                  { "name": "TSE:4755", "displayName": "楽天グループ" },
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
        <div class="diary-grid">
          ${dbNotes.results.map(note => {
            const dateStr = new Date(note.created_at).toISOString().split('T')[0];
            if (note.image_url) { return html`<a href="/diary" class="diary-card"><img src="${note.image_url}" loading="lazy"><div class="overlay"><div>${dateStr}</div></div></a>`; }
            else { return html`<a href="/diary" class="diary-card no-image"><div style="font-size:12px; color:var(--text-main);">${note.content.substring(0, 30)}...</div><div class="overlay">${dateStr}</div></a>`; }
          })}
        </div>
      </div>

      <div class="card col-span-3">
        <div class="card-header"><span class="card-icon">🗺️</span> 行動軌跡トラッカー</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:1rem; color:var(--text-muted); font-weight:bold;">総移動距離: <span id="total-distance" style="color:var(--primary); font-size:1.4rem;">0</span> km</div>
          <button onclick="manualCheckin()" style="padding:10px 20px; background:var(--button-dark); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px rgba(0,0,0,0.1);">📍 今ここを記録する</button>
        </div>
        <div id="map" style="height:400px; border-radius:12px; border:1px solid var(--border); z-index:1;"></div>
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

      async function loadWeather() {
        try {
          const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.8617&longitude=139.6455&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=4');
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
        } catch (e) { document.getElementById('weather-widget').innerHTML = '取得失敗'; }
      } loadWeather();

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

      // --- 地図 (Leaflet.js) ---
      // ★ ここが修正のメイン部分です (raw() を追加し安全に出力)
      const checkins = ${raw(JSON.stringify(checkins))};
      const map = L.map('map').setView([35.8617, 139.6455], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

      if(checkins && checkins.length > 0) {
        const latlngs = checkins.map(c => [c.lat, c.lng]);
        
        const polyline = L.polyline(latlngs, {color: '#ef4444', weight: 4, opacity: 0.8}).addTo(map);
        map.fitBounds(polyline.getBounds(), {padding: [30,30]});
        
        checkins.forEach((c) => {
          const d = new Date(c.created_at);
          const timeStr = (d.getMonth()+1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
          L.marker([c.lat, c.lng]).addTo(map).bindPopup("📍 " + timeStr);
        });
        
        let totalKm = 0;
        for(let i=1; i<latlngs.length; i++){
          totalKm += map.distance(latlngs[i-1], latlngs[i]) / 1000;
        }
        document.getElementById('total-distance').textContent = totalKm.toFixed(1);
      }

      window.manualCheckin = function() {
        if(!navigator.geolocation) return alert('GPS非対応です');
        const btn = event.target;
        btn.textContent = "⏳ 記録中..."; btn.disabled = true;
        navigator.geolocation.getCurrentPosition(async pos => {
          await fetch('/api/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat:pos.coords.latitude, lng:pos.coords.longitude})});
          location.reload(); 
        }, () => { alert('位置情報の取得に失敗しました'); btn.textContent="📍 今ここを記録する"; btn.disabled=false; }, {enableHighAccuracy: true});
      }
    </script>
  </main>
</body>
</html>
  `)});
});

// --- API ---
app.post('/api/checkin', async c => { const { lat, lng } = await c.req.json(); await c.env.DB.prepare('INSERT INTO checkins (lat, lng, created_at) VALUES (?, ?, ?)').bind(lat, lng, Date.now()).run(); return c.json({ success: true }); });

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
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:20px;">
      <a href="/" style="color:#3b82f6; text-decoration:none;">← ホームへ戻る</a><h2 style="color:#0f172a;">全ての記録</h2>
      <div style="max-width:600px; display:flex; flex-direction:column; gap:15px;">
        ${results.map(n => html`
          <div style="background:#fff; padding:15px; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
              <span style="color:#64748b; font-size:0.9rem;">${new Date(n.created_at).toLocaleString('ja-JP')}</span>
              <div style="display:flex; gap:10px;"><a href="/diary/edit/${n.id}" style="color:#3b82f6; font-size:0.9rem; text-decoration:none;">編集</a><form method="POST" action="/diary/delete" style="margin:0;" onsubmit="return confirm('削除しますか？');"><input type="hidden" name="id" value="${n.id}"><button type="submit" style="background:none; border:none; color:#ef4444; font-size:0.9rem; cursor:pointer; text-decoration:underline; padding:0;">削除</button></form></div>
            </div>
            <p style="margin:0; white-space:pre-wrap;">${n.content}</p>
            ${n.image_url ? html`<img src="${n.image_url}" style="margin-top:10px; border-radius:8px; max-width:100%;">` : ''}
          </div>
        `)}
      </div>
    </body></html>
  `);
});
app.post('/diary/delete', async c => { await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind((await c.req.parseBody())['id']).run(); return c.redirect('/diary'); });
app.get('/diary/edit/:id', async c => {
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(c.req.param('id')).first();
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>編集</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:20px;">
      <div style="max-width:600px; background:#fff; padding:20px; border-radius:12px;">
        <h2 style="margin-top:0;">記録を編集</h2>
        <form method="POST" action="/diary/edit/${note.id}" style="display:flex; flex-direction:column; gap:15px;">
          <textarea name="content" rows="6" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${note.content}</textarea>
          <div style="display:flex; gap:10px;"><button type="submit" style="flex:1; padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">更新する</button><a href="/diary" style="padding:12px 20px; background:#e2e8f0; color:#0f172a; border-radius:8px; text-decoration:none; font-weight:bold;">キャンセル</a></div>
        </form>
      </div>
    </body></html>
  `);
});
app.post('/diary/edit/:id', async c => { await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind((await c.req.parseBody())['content'], c.req.param('id')).run(); return c.redirect('/diary'); });
app.get('/diary/post', c => {
  return c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>新規投稿</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:20px;">
      <a href="/" style="color:#3b82f6; text-decoration:none;">← ホームへ戻る</a>
      <div style="max-width:600px; background:#fff; padding:20px; border-radius:12px; margin-top:15px;">
        <h2 style="margin-top:0;">新しい記録を追加</h2>
        <form method="POST" action="/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;"><textarea name="content" rows="6" placeholder="いまどうしてる？" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;"></textarea><input type="file" name="image" accept="image/*"><button type="submit" style="padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">保存する</button></form>
      </div>
    </body></html>
  `);
});
app.post('/diary/post', async c => {
  const b = await c.req.parseBody(); let img = null;
  if (b['image'] instanceof File && b['image'].size > 0) { const fn = `${Date.now()}-${b['image'].name}`; await c.env.BUCKET.put(fn, await b['image'].arrayBuffer(), { httpMetadata: { contentType: b['image'].type } }); img = `/images/${fn}`; }
  await c.env.DB.prepare('INSERT INTO notes (content, image_url, created_at) VALUES (?, ?, ?)').bind(b['content'], img, Date.now()).run(); return c.redirect('/');
});
app.get('/images/:key', async c => {
  const obj = await c.env.BUCKET.get(c.req.param('key'));
  if (!obj) return c.text('Not Found', 404);
  const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag); return new Response(obj.body, { headers: h });
});

export const onRequest = handle(app);