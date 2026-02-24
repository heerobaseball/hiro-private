import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// --- 1. モダンな共通レイアウト (Bento UI) ---
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title || 'My Dashboard'}</title>
  <style>
    /* 全体の基本設定 */
    :root {
      --bg: #f3f4f6;
      --card-bg: #ffffff;
      --text-main: #1f2937;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --primary: #3b82f6;
      --radius: 16px;
    }
    body {
      margin: 0; padding: 0;
      background-color: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    a { text-decoration: none; color: inherit; }
    
    /* 上部ナビゲーションバー */
    .navbar {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--card-bg);
      padding: 0.8rem 2rem;
      border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 100;
    }
    .nav-brand { font-size: 1.2rem; font-weight: bold; display: flex; align-items: center; gap: 8px; }
    .nav-links { display: flex; gap: 20px; }
    .nav-links a { font-weight: 500; color: var(--text-muted); transition: color 0.2s; }
    .nav-links a:hover, .nav-links a.active { color: var(--primary); }
    
    /* ダッシュボードのグリッド (Bento UI) */
    .container {
      max-width: 1400px; margin: 2rem auto; padding: 0 1rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    
    /* カード共通 */
    .card {
      background: var(--card-bg); border-radius: var(--radius); padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .card-header { font-size: 1.1rem; font-weight: bold; margin-bottom: 1rem; color: var(--text-main); }
    
    .col-span-3 { grid-column: span 3; }
    .col-span-2 { grid-column: span 2; }
    .col-span-1 { grid-column: span 1; }

    @media (max-width: 1024px) { .container { grid-template-columns: repeat(2, 1fr); } .col-span-3 { grid-column: span 2; } }
    @media (max-width: 768px) { .container { grid-template-columns: 1fr; } .col-span-3, .col-span-2, .col-span-1 { grid-column: span 1; } }

    /* 時計ウィジェット */
    .clock-widget { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; }
    .time-display { font-size: 3.5rem; font-weight: 800; color: var(--text-main); font-variant-numeric: tabular-nums; line-height: 1; margin: 10px 0; letter-spacing: -2px; }
    .date-jp { font-size: 1.2rem; color: var(--text-muted); font-weight: 600; }
    .koyomi-display { font-size: 0.9rem; color: var(--primary); background: #eff6ff; padding: 4px 12px; border-radius: 12px; margin-top: 8px; font-weight: 500; }

    /* ToDoリスト */
    .todo-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 200px; margin-bottom: 15px; }
    .todo-item { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; background: var(--bg); transition: 0.2s; }
    .todo-item:hover { background: #e5e7eb; }
    .todo-check { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border); background: white; cursor: pointer; display:flex; align-items:center; justify-content:center; color: white; padding:0; }
    .todo-check.done { background: var(--primary); border-color: var(--primary); }
    .todo-text { flex-grow: 1; font-size: 0.95rem; }
    .todo-text.done { text-decoration: line-through; color: var(--text-muted); }
    .todo-delete { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 1.2rem; font-weight: bold; padding: 0 5px; opacity: 0.5; }
    .todo-delete:hover { opacity: 1; }
    .todo-form { display: flex; gap: 10px; }
    .todo-form input { flex-grow: 1; padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; }
    .todo-form button { padding: 10px 20px; background: var(--text-main); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }

    /* ニュース、Gemini、日記 (前回と同じスタイル) */
    .news-list { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 350px; }
    .news-item { font-size: 0.9rem; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .news-item a:hover { color: var(--primary); }
    .source-tag { font-size: 0.7rem; color: var(--text-muted); background: var(--bg); padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
    .chat-box { flex-grow: 1; overflow-y: auto; max-height: 250px; background: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px; }
    .chat-msg { padding: 8px 12px; border-radius: 12px; font-size: 0.9rem; max-width: 85%; }
    .user-msg { background: var(--primary); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .ai-msg { background: white; color: var(--text-main); align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid var(--border); }
    .chat-input-area { display: flex; gap: 8px; }
    .chat-input-area input { flex-grow: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
    .chat-input-area button { padding: 10px 16px; background: var(--text-main); color: white; border: none; border-radius: 8px; cursor: pointer; }
    .diary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .diary-card { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; background: var(--border); }
    .diary-card img { width: 100%; height: 100%; object-fit: cover; }
    .diary-card .overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: white; padding: 10px; font-size: 0.8rem; }
    .diary-card.no-image { background: var(--bg); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; }
    .diary-card.no-image .overlay { position: static; background: none; color: var(--text-muted); padding: 0; }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="nav-brand">My Dashboard</div>
    <div class="nav-links">
      <a href="/" class="active">ホーム</a>
      <a href="/diary">日記</a>
      <a href="/diary/post">投稿</a>
    </div>
  </header>
  <main>${props.children}</main>
</body>
</html>
`;

// --- 2. ニュース取得 (日経, Reuters, Bloomberg, tenki.jp) ---
async function fetchGoogleNews() {
  try {
    const query = "site:nikkei.com OR site:jp.reuters.com OR site:bloomberg.co.jp OR site:tenki.jp";
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
    const response = await fetch(rssUrl);
    const text = await response.text();
    const items = [];
    const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<source.*?>(.*?)<\/source>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (items.length >= 8) break;
      items.push({ title: match[1], link: match[2], source: match[3] });
    }
    return items;
  } catch (e) { return []; }
}

// --- 3. ルート定義 ---

// 【トップページ】
app.get('/', async (c) => {
  const [news, dbNotes, dbTodos] = await Promise.all([
    fetchGoogleNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 8').all(),
    c.env.DB.prepare('SELECT * FROM todos ORDER BY is_completed ASC, created_at DESC').all()
  ]);

  return c.html(Layout({
    title: 'ホーム - My Dashboard',
    children: html`
      <div class="container">
        
        <div class="card col-span-1">
          <div class="clock-widget">
            <div class="date-jp" id="date-jp">--年--月--日</div>
            <div class="time-display" id="time-display">--:--:--</div>
            <div class="koyomi-display" id="koyomi-display">読込中...</div>
          </div>
        </div>

        <div class="card col-span-2">
          <div class="card-header">共有 ToDoリスト</div>
          <div class="todo-list">
            ${dbTodos.results.length === 0 ? html`<p style="color:var(--text-muted); font-size:0.9rem;">タスクはありません。今日も良い一日を！</p>` : ''}
            ${dbTodos.results.map(todo => html`
              <div class="todo-item">
                <form method="POST" action="/todos/toggle" style="margin:0;">
                  <input type="hidden" name="id" value="${todo.id}">
                  <input type="hidden" name="current" value="${todo.is_completed}">
                  <button type="submit" class="todo-check ${todo.is_completed ? 'done' : ''}">
                    ${todo.is_completed ? '✓' : ''}
                  </button>
                </form>
                <div class="todo-text ${todo.is_completed ? 'done' : ''}">${todo.task}</div>
                <form method="POST" action="/todos/delete" style="margin:0;">
                  <input type="hidden" name="id" value="${todo.id}">
                  <button type="submit" class="todo-delete" title="削除">×</button>
                </form>
              </div>
            `)}
          </div>
          <form class="todo-form" method="POST" action="/todos/add">
            <input type="text" name="task" placeholder="新しいタスクや買い物メモを追加..." required>
            <button type="submit">追加</button>
          </form>
        </div>

        <div class="card col-span-1">
          <div class="card-header">マーケット</div>
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
                    { "name": "AMEX:VOO", "displayName": "VOO" },
                    { "name": "TVC:TOPIX", "displayName": "東証株価指数" },
                    { "name": "FX_IDC:USDJPY", "displayName": "USD/JPY" },
                    { "name": "TSE:4755", "displayName": "楽天グループ" },
                    { "name": "TSE:9432", "displayName": "NTT" },
                    { "name": "BITSTAMP:BTCUSD", "displayName": "BTC/USD" },
                    { "name": "BITSTAMP:ETHUSD", "displayName": "ETH/USD" },
                    { "name": "BITSTAMP:XRPUSD", "displayName": "XRP/USD" },
                    { "name": "COINBASE:SHIBUSD", "displayName": "SHIB/USD" }
                  ]
                }
              ],
              "colorTheme": "dark", "isTransparent": true, "locale": "ja"
            }
            </script>
          </div>
        </div>

        <div class="card col-span-1">
          <div class="card-header">スケジュール</div>
          <iframe 
            src="https://calendar.google.com/calendar/embed?src=あなたのカレンダーID&mode=AGENDA" 
            style="border: 0" width="100%" height="350" frameborder="0" scrolling="no">
          </iframe>
          </div>

        <div class="card col-span-1">
          <div class="card-header">Gemini Chat</div>
          <div id="chat-history" class="chat-box">
            <div class="chat-msg ai-msg">こんにちは！何かお手伝いしましょうか？</div>
          </div>
          <form id="gemini-form" class="chat-input-area">
            <input type="text" id="gemini-input" placeholder="メッセージを入力..." required>
            <button type="submit">送信</button>
          </form>
        </div>

        <div class="card col-span-1">
          <div class="card-header">Latest News</div>
          <div class="news-list">
            ${news.map(item => html`
              <div class="news-item">
                <a href="${item.link}" target="_blank">
                  ${item.title.replace(` - ${item.source}`, '')}
                  ${item.source ? html`<span class="source-tag">${item.source}</span>` : ''}
                </a>
              </div>
            `)}
          </div>
        </div>

        <div class="card col-span-2">
          <div class="card-header">最新の記録</div>
          <div class="diary-grid">
            ${dbNotes.results.map(note => {
              const dateStr = new Date(note.created_at).toISOString().split('T')[0];
              if (note.image_url) {
                return html`
                  <a href="/diary" class="diary-card">
                    <img src="${note.image_url}" loading="lazy">
                    <div class="overlay"><div>${dateStr}</div></div>
                  </a>
                `;
              } else {
                return html`
                  <a href="/diary" class="diary-card no-image">
                    <div style="font-size:0.85rem; color:var(--text-main);">${note.content.substring(0, 40)}...</div>
                    <div class="overlay">${dateStr}</div>
                  </a>
                `;
              }
            })}
          </div>
        </div>
      </div>

      <script>
        // --- 1. 時計と暦のリアルタイム更新 ---
        function updateClock() {
          const now = new Date();
          
          // 時刻表示 (例: 14:30:05)
          document.getElementById('time-display').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
          
          // 和暦表示 (例: 令和8年2月24日 (火))
          const dateOptions = { era: 'long', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
          document.getElementById('date-jp').textContent = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', dateOptions).format(now);
          
          // 暦の表示 (西暦と旧暦の月名)
          const oldMonths = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];
          document.getElementById('koyomi-display').textContent = \`西暦\${now.getFullYear()}年 / 旧暦: \${oldMonths[now.getMonth()]}\`;
        }
        setInterval(updateClock, 1000);
        updateClock(); // 初回実行

        // --- 2. Geminiチャット処理 ---
        document.getElementById('gemini-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('gemini-input');
          const history = document.getElementById('chat-history');
          const prompt = input.value;

          history.innerHTML += \`<div class="chat-msg user-msg">\${prompt}</div>\`;
          input.value = '';
          history.scrollTop = history.scrollHeight;

          try {
            const res = await fetch('/api/gemini', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            history.innerHTML += \`<div class="chat-msg ai-msg">\${data.response}</div>\`;
          } catch (err) {
            history.innerHTML += \`<div class="chat-msg ai-msg" style="color:red;">エラーが発生しました</div>\`;
          }
          history.scrollTop = history.scrollHeight;
        });
      </script>
    `
  }));
});

// --- ToDoリスト処理 ---
app.post('/todos/add', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('INSERT INTO todos (task, created_at) VALUES (?, ?)').bind(body['task'], Date.now()).run();
  return c.redirect('/');
});

app.post('/todos/toggle', async (c) => {
  const body = await c.req.parseBody();
  const newStatus = body['current'] === '1' ? 0 : 1; // 1なら0に、0なら1に反転
  await c.env.DB.prepare('UPDATE todos SET is_completed = ? WHERE id = ?').bind(newStatus, body['id']).run();
  return c.redirect('/');
});

app.post('/todos/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(body['id']).run();
  return c.redirect('/');
});

// --- GeminiAPI、日記関連処理 (前と同じ機能) ---
app.post('/api/gemini', async (c) => {
  const { prompt } = await c.req.json();
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) return c.json({ response: "APIキーが設定されていません" });
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "すみません、答えられません。";
    return c.json({ response: text });
  } catch (e) { return c.json({ response: "エラー: " + e.message }); }
});

app.get('/diary', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  return c.html(Layout({
    title: '日記一覧',
    children: html`
      <div class="container" style="display:block;">
        <h2 style="margin-bottom: 20px;">全ての記録</h2>
        ${results.map(note => html`
          <div class="card" style="margin-bottom: 15px;">
            <div style="font-weight:bold; color:var(--text-muted); font-size:0.9rem; margin-bottom:8px;">
              ${new Date(note.created_at).toLocaleString('ja-JP')}
            </div>
            <p style="white-space: pre-wrap; margin:0;">${note.content}</p>
            ${note.image_url ? html`<img src="${note.image_url}" style="margin-top:10px; border-radius:8px; max-width:300px;" />` : ''}
          </div>
        `)}
      </div>
    `
  }));
});

app.get('/diary/post', (c) => {
  return c.html(Layout({
    title: '新規投稿',
    children: html`
      <div class="container" style="display:block; max-width:600px;">
        <div class="card">
          <div class="card-header">新しい記録を追加</div>
          <form method="POST" action="/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;">
            <textarea name="content" rows="6" required placeholder="いまどうしてる？" style="padding:10px; border:1px solid var(--border); border-radius:8px;"></textarea>
            <input type="file" name="image" accept="image/*">
            <button type="submit" style="padding:10px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer;">保存する</button>
          </form>
        </div>
      </div>
    `
  }));
});

app.post('/diary/post', async (c) => {
  const body = await c.req.parseBody();
  const content = body['content'];
  const imageFile = body['image'];
  let imageUrl = null;
  if (imageFile instanceof File && imageFile.size > 0) {
    const fileName = `${Date.now()}-${imageFile.name}`;
    await c.env.BUCKET.put(fileName, await imageFile.arrayBuffer(), { httpMetadata: { contentType: imageFile.type } });
    imageUrl = `/images/${fileName}`;
  }
  await c.env.DB.prepare('INSERT INTO notes (content, image_url, created_at) VALUES (?, ?, ?)')
    .bind(content, imageUrl, Date.now()).run();
  return c.redirect('/');
});

app.get('/images/:key', async (c) => {
  const object = await c.env.BUCKET.get(c.req.param('key'));
  if (!object) return c.text('Not Found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});

export const onRequest = handle(app);