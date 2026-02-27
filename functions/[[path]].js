import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// --- 1. モダンな共通レイアウト (Bento UI + カラフル調整) ---
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title || 'My Dashboard'}</title>
  <style>
    /* 全体の基本設定 (少し明るく、メリハリのある色に) */
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text-main: #0f172a; /* より濃いネイビー/黒 */
      --text-muted: #64748b;
      --border: #e2e8f0;
      --primary: #3b82f6;
      --primary-light: #eff6ff; /* 淡いブルー */
      --button-dark: #1e293b; /* ボタン用のダークカラー */
      --radius: 16px;
    }
    body {
      margin: 0; padding: 0;
      background-color: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
    .nav-brand { font-size: 1.2rem; font-weight: 900; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
    .nav-links { display: flex; gap: 20px; }
    .nav-links a { font-weight: 600; color: var(--text-muted); transition: color 0.2s; }
    .nav-links a:hover, .nav-links a.active { color: var(--primary); }
    
    /* ダッシュボードのグリッド */
    .container {
      max-width: 1400px; margin: 2rem auto; padding: 0 1rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    
    /* カード共通 */
    .card {
      background: var(--card-bg); border-radius: var(--radius); padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(226, 232, 240, 0.8);
      display: flex; flex-direction: column; overflow: hidden;
    }
    /* ヘッダーにアイコン用のスタイルを追加 */
    .card-header { 
      font-size: 1.15rem; font-weight: 800; margin-bottom: 1.2rem; color: var(--text-main); 
      display: flex; align-items: center; gap: 10px; 
    }
    .card-icon {
      background: var(--primary-light); color: var(--primary);
      width: 32px; height: 32px;
      display: inline-flex; justify-content: center; align-items: center;
      border-radius: 8px; font-size: 1.1rem;
    }
    
    .col-span-3 { grid-column: span 3; }
    .col-span-2 { grid-column: span 2; }
    .col-span-1 { grid-column: span 1; }

    @media (max-width: 1024px) { .container { grid-template-columns: repeat(2, 1fr); } .col-span-3 { grid-column: span 2; } }
    @media (max-width: 768px) { .container { grid-template-columns: 1fr; } .col-span-3, .col-span-2, .col-span-1 { grid-column: span 1; } }

    /* 時計ウィジェット (色とサイズを強調) */
    .clock-widget { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; }
    .date-jp { font-size: 1.2rem; color: var(--text-main); font-weight: 700; }
    .time-display { font-size: 4.2rem; font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.1; margin: 5px 0; letter-spacing: -2px; }
    .koyomi-display { font-size: 0.85rem; color: #0369a1; background: #e0f2fe; padding: 6px 16px; border-radius: 20px; margin-top: 8px; font-weight: 600; border: 1px solid #bae6fd; }

    /* ToDoリスト */
    .todo-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 200px; margin-bottom: 15px; }
    .todo-item { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; background: #f8fafc; transition: 0.2s; border: 1px solid transparent; }
    .todo-item:hover { background: #f1f5f9; border-color: var(--border); }
    .todo-check { width: 22px; height: 22px; border-radius: 6px; border: 2px solid #cbd5e1; background: white; cursor: pointer; display:flex; align-items:center; justify-content:center; color: white; padding:0; transition: 0.2s; }
    .todo-check.done { background: var(--primary); border-color: var(--primary); }
    .todo-text { flex-grow: 1; font-size: 0.95rem; font-weight: 500; }
    .todo-text.done { text-decoration: line-through; color: var(--text-muted); font-weight: 400; }
    .todo-delete { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 1.2rem; font-weight: bold; padding: 0 5px; opacity: 0.5; }
    .todo-delete:hover { opacity: 1; }
    .todo-form { display: flex; gap: 10px; }
    .todo-form input { flex-grow: 1; padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; }
    .todo-form button { padding: 10px 20px; background: var(--button-dark); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .todo-form button:hover { background: #334155; }

    /* ニュース */
    .news-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 350px; }
    .news-item { font-size: 0.9rem; border-radius: 8px; padding: 10px; transition: background 0.2s; }
    .news-item:hover { background: #f8fafc; }
    .news-item a { display: block; color: var(--text-main); line-height: 1.4; }
    .news-item a:hover { color: var(--primary); }
    .source-tag { font-size: 0.7rem; color: #475569; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; margin-left: 8px; border: 1px solid #e2e8f0; font-weight: 500; }
    
    /* Gemini Chat (色分け) */
    .chat-box { flex-grow: 1; overflow-y: auto; max-height: 250px; background: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border); }
    .chat-msg { padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; max-width: 85%; line-height: 1.4; }
    .user-msg { background: var(--button-dark); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .ai-msg { background: #f0f9ff; color: #0f172a; align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid #bae6fd; }
    .chat-input-area { display: flex; gap: 8px; }
    .chat-input-area input { flex-grow: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
    .chat-input-area button { padding: 10px 16px; background: var(--button-dark); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .chat-input-area button:hover { background: #334155; }

    /* 日記ギャラリー */
    .diary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .diary-card { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; background: var(--border); border: 1px solid var(--border); }
    .diary-card img { width: 100%; height: 100%; object-fit: cover; }
    .diary-card .overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; padding: 10px; font-size: 0.8rem; font-weight: bold; }
    .diary-card.no-image { background: var(--bg); padding: 12px; display: flex; flex-direction: column; justify-content: space-between; }
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

// --- 2. ニュース取得 (指定ソース限定) ---
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
        
        <div class="card col-span-1" style="border-top: 4px solid var(--primary);">
          <div class="clock-widget">
            <div class="date-jp" id="date-jp">--年--月--日</div>
            <div class="time-display" id="time-display">--:--:--</div>
            <div class="koyomi-display" id="koyomi-display">読込中...</div>
          </div>
        </div>

        <div class="card col-span-2">
          <div class="card-header"><span class="card-icon">✅</span> 共有 ToDoリスト</div>
          <div class="todo-list">
            ${dbTodos.results.length === 0 ? html`<p style="color:var(--text-muted); font-size:0.9rem; padding-left:5px;">タスクはありません。今日も良い一日を！</p>` : ''}
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
                    { "name": "AMEX:VOO", "displayName": "VOO" },
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
          <div class="card-header"><span class="card-icon">📅</span> スケジュール</div>
          <iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FTokyo&showPrint=0&src=aGVlcm8uYmFzZWJhbGxAZ21haWwuY29t&src=MTVrYTNuOXA0NGlwcjZrMDNtamRoMzk3MGNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=MG81bzExMWh1MmF1c2xwbW92bjRtZHR1bzRAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=amEuamFwYW5lc2UjaG9saWRheUBncm91cC52LmNhbGVuZGFyLmdvb2dsZS5jb20&src=aHQzamxmYWFjNWxmZDYyNjN1bGZoNHRxbDhAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%233f51b5&color=%23f6bf26&color=%23795548&color=%23009688&color=%23b39ddb" 
            style="border: 0" width="100%" height="350" frameborder="0" scrolling="no">
          </iframe>
        </div>

        <div class="card col-span-1">
          <div class="card-header"><span class="card-icon">✨</span> Gemini Chat</div>
          <div id="chat-history" class="chat-box">
            <div class="chat-msg ai-msg">こんにちは！何かお手伝いしましょうか？</div>
          </div>
          <form id="gemini-form" class="chat-input-area">
            <input type="text" id="gemini-input" placeholder="メッセージを入力..." required>
            <button type="submit">送信</button>
          </form>
        </div>

        <div class="card col-span-1">
          <div class="card-header"><span class="card-icon">📰</span> Latest News</div>
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
          <div class="card-header"><span class="card-icon">📸</span> 最新の記録</div>
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
                    <div style="font-size:0.85rem; color:var(--text-main); line-height:1.4;">${note.content.substring(0, 40)}...</div>
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
          document.getElementById('time-display').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
          const dateOptions = { era: 'long', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
          document.getElementById('date-jp').textContent = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', dateOptions).format(now);
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
  const newStatus = body['current'] === '1' ? 0 : 1;
  await c.env.DB.prepare('UPDATE todos SET is_completed = ? WHERE id = ?').bind(newStatus, body['id']).run();
  return c.redirect('/');
});

app.post('/todos/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(body['id']).run();
  return c.redirect('/');
});

// --- Gemini API処理 (2.5-flash適用・エラー解析付き) ---
app.post('/api/gemini', async (c) => {
  const { prompt } = await c.req.json();
  const apiKey = c.env.GEMINI_API_KEY;
  
  if (!apiKey) return c.json({ response: "APIキーが設定されていません" });
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    
    const data = await response.json();
    if (!response.ok) return c.json({ response: `Google APIエラー: ${data.error?.message || '詳細不明'}` });
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return c.json({ response: `回答がブロックされました。理由: ${data.candidates?.[0]?.finishReason || '不明'}` });
    
    return c.json({ response: text });
    
  } catch (e) { 
    return c.json({ response: "プログラムエラー: " + e.message }); 
  }
});

// --- 日記一覧ページ (編集・削除ボタン付き) ---
app.get('/diary', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  return c.html(Layout({
    title: '日記一覧',
    children: html`
      <div class="container" style="display:block;">
        <h2 style="margin-bottom: 20px;">全ての記録</h2>
        ${results.map(note => html`
          <div class="card" style="margin-bottom: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <div style="font-weight:bold; color:var(--text-muted); font-size:0.9rem;">
                ${new Date(note.created_at).toLocaleString('ja-JP')}
              </div>
              <div style="display:flex; gap:15px;">
                <a href="/diary/edit/${note.id}" style="color:var(--primary); font-size:0.9rem;">編集</a>
                <form method="POST" action="/diary/delete" style="margin:0;" onsubmit="return confirm('本当に削除しますか？この操作は取り消せません。');">
                  <input type="hidden" name="id" value="${note.id}">
                  <button type="submit" style="background:none; border:none; color:#ef4444; font-size:0.9rem; cursor:pointer; padding:0; text-decoration:underline;">削除</button>
                </form>
              </div>
            </div>
            <p style="white-space: pre-wrap; margin:0;">${note.content}</p>
            ${note.image_url ? html`<img src="${note.image_url}" style="margin-top:10px; border-radius:8px; max-width:300px;" />` : ''}
          </div>
        `)}
      </div>
    `
  }));
});

// --- 日記の削除処理 ---
app.post('/diary/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(body['id']).run();
  return c.redirect('/diary');
});

// --- 日記の編集画面 ---
app.get('/diary/edit/:id', async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
  if (!note) return c.text('見つかりません', 404);

  return c.html(Layout({
    title: '記録の編集',
    children: html`
      <div class="container" style="display:block; max-width:600px;">
        <div class="card">
          <div class="card-header">記録を編集</div>
          <form method="POST" action="/diary/edit/${note.id}" style="display:flex; flex-direction:column; gap:15px;">
            <textarea name="content" rows="6" required style="padding:10px; border:1px solid var(--border); border-radius:8px;">${note.content}</textarea>
            <div style="font-size:0.8rem; color:var(--text-muted);">※現在はテキストのみ編集可能です。</div>
            <div style="display:flex; gap:10px;">
              <button type="submit" style="flex-grow:1; padding:10px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer;">更新する</button>
              <a href="/diary" style="padding:10px 20px; background:var(--bg); color:var(--text-main); border-radius:8px; text-align:center;">キャンセル</a>
            </div>
          </form>
        </div>
      </div>
    `
  }));
});

// --- 日記の編集処理 ---
app.post('/diary/edit/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind(body['content'], id).run();
  return c.redirect('/diary');
});

// --- 日記の投稿ページ ---
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

// --- 日記の投稿処理 ---
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

// --- 画像表示用 ---
app.get('/images/:key', async (c) => {
  const object = await c.env.BUCKET.get(c.req.param('key'));
  if (!object) return c.text('Not Found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});

export const onRequest = handle(app);