import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// --- 1. PWA用ファイルの動的生成 ---
app.get('/manifest.json', (c) => {
  return c.json({
    name: "My Dashboard",
    short_name: "Dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#3b82f6",
    icons: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }]
  });
});
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  return c.body(`
    self.addEventListener('install', (e) => self.skipWaiting());
    self.addEventListener('activate', (e) => self.clients.claim());
    self.addEventListener('fetch', (e) => {}); // ネットワーク優先のシンプルなSW
  `);
});
app.get('/icon.svg', (c) => {
  c.header('Content-Type', 'image/svg+xml');
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3b82f6" rx="112"/><text x="256" y="340" font-size="280" font-weight="bold" text-anchor="middle" fill="white" font-family="sans-serif">D</text></svg>`);
});

// --- 2. モダンな共通レイアウト (スマホ・PWA最適化) ---
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#3b82f6">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icon.svg">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>${props.title || 'My Dashboard'}</title>
  <style>
    :root {
      --bg: #f8fafc; --card-bg: #ffffff; --text-main: #0f172a; --text-muted: #64748b;
      --border: #e2e8f0; --primary: #3b82f6; --primary-light: #eff6ff; --button-dark: #1e293b;
      --radius: 16px;
    }
    body {
      margin: 0; padding: 0; background-color: var(--bg); color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-tap-highlight-color: transparent; /* スマホタップ時の青い影を消す */
    }
    a { text-decoration: none; color: inherit; }
    
    .navbar {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--card-bg); padding: 0.8rem 1.5rem; border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      padding-top: env(safe-area-inset-top, 0.8rem); /* iPhoneのノッチ対応 */
    }
    .nav-brand { font-size: 1.2rem; font-weight: 900; color: var(--text-main); }
    .nav-links { display: flex; gap: 15px; }
    .nav-links a { font-weight: 600; color: var(--text-muted); font-size: 0.95rem; }
    .nav-links a.active { color: var(--primary); }
    
    .container {
      max-width: 1400px; margin: 1rem auto 3rem; padding: 0 1rem;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;
      padding-bottom: env(safe-area-inset-bottom, 1rem);
    }
    
    .card {
      background: var(--card-bg); border-radius: var(--radius); padding: 1.2rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .card-header { font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px; }
    .card-icon { background: var(--primary-light); color: var(--primary); width: 28px; height: 28px; display: inline-flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 1rem; }
    
    .col-span-3 { grid-column: span 3; } .col-span-2 { grid-column: span 2; } .col-span-1 { grid-column: span 1; }
    @media (max-width: 1024px) { .container { grid-template-columns: repeat(2, 1fr); } .col-span-3 { grid-column: span 2; } }
    @media (max-width: 768px) { .container { grid-template-columns: 1fr; } .col-span-3, .col-span-2, .col-span-1 { grid-column: span 1; } .time-display { font-size: 3rem !important; } }

    /* 時計 */
    .clock-horizontal { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 5px; }
    .date-jp { font-size: 1.1rem; color: var(--text-main); font-weight: 700; }
    .time-display { font-size: 3.5rem; font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1; margin: 0; letter-spacing: -2px; }
    .koyomi-display { font-size: 0.8rem; color: #0369a1; background: #e0f2fe; padding: 4px 12px; border-radius: 20px; font-weight: 600; border: 1px solid #bae6fd; margin-top: 5px; }

    /* 各種UI調整 (iOSズーム防止のため input/textarea は font-size: 16px 以上) */
    .memo-add-form { display: flex; gap: 8px; margin-bottom: 12px; }
    .memo-add-form input, .todo-form input, .chat-input-area input { flex-grow: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; outline: none; }
    .memo-add-form button, .todo-form button, .chat-input-area button { padding: 0 16px; background: var(--button-dark); color: white; border: none; border-radius: 8px; font-weight: bold; }
    
    .memo-list, .todo-list, .chat-box, .news-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 280px; padding-right: 4px; }
    .memo-item, .todo-item { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 10px; position: relative; }
    .memo-textarea { width: 100%; border: none; background: transparent; resize: none; min-height: 24px; font-family: inherit; font-size: 16px; color: var(--text-main); outline: none; line-height: 1.5; padding: 0; overflow: hidden; }
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
    
    /* 添付画像プレビュー用 */
    #image-preview-container { display: none; margin-bottom: 8px; position: relative; width: fit-content; }
    #image-preview { max-height: 80px; border-radius: 8px; border: 1px solid var(--border); }
    #clear-image { position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; }

    .news-item { font-size: 15px; border-radius: 8px; padding: 8px; border-bottom: 1px solid var(--bg); }
    .source-tag { font-size: 11px; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
    
    .diary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .diary-card { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 1/1; background: var(--border); }
    .diary-card img { width: 100%; height: 100%; object-fit: cover; }
    .diary-card .overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; padding: 8px; font-size: 12px; font-weight: bold; }
    .diary-card.no-image { background: var(--bg); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="nav-brand">My Dashboard</div>
    <div class="nav-links">
      <a href="/" class="active">Home</a>
      <a href="/diary">Diary</a>
    </div>
  </header>
  <main>${props.children}</main>
  
  <script>
    // PWA Service Worker 登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW ref:', err));
    }
  </script>
</body>
</html>
`;

// --- 2. ニュース取得 ---
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
  const [news, dbNotes, dbTodos, dbChatsRaw, dbMemos] = await Promise.all([
    fetchGoogleNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 6').all(),
    c.env.DB.prepare('SELECT * FROM todos ORDER BY is_completed ASC, created_at DESC').all(),
    c.env.DB.prepare('SELECT * FROM chats ORDER BY created_at DESC LIMIT 30').all(),
    c.env.DB.prepare('SELECT * FROM quick_memo ORDER BY id DESC').all()
  ]);
  const chatHistory = dbChatsRaw.results.reverse();

  return c.html(Layout({
    title: 'ホーム - My Dashboard',
    children: html`
      <div class="container">
        
        <div class="card col-span-1" style="border-top: 4px solid var(--primary); justify-content: center;">
          <div class="clock-horizontal">
            <div class="date-jp" id="date-jp">--年--月--日</div>
            <div class="time-display" id="time-display">--:--</div>
            <div class="koyomi-display" id="koyomi-display">読込中...</div>
          </div>
        </div>

        <div class="card col-span-2" style="padding:0; border:none; height: 180px; position:relative;">
          <iframe width="100%" height="100%" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km%2Fh&zoom=10&overlay=rain&product=ecmwf&level=surface&lat=35.84&lon=139.65&detailLat=35.84&detailLon=139.65&message=true" frameborder="0" style="border-radius:var(--radius);"></iframe>
          <div style="position:absolute; top:10px; left:10px; background:rgba(255,255,255,0.9); padding:4px 10px; border-radius:12px; font-size:12px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">☔ 雨雲レーダー</div>
        </div>

        <div class="card col-span-2">
          <div class="card-header"><span class="card-icon">✅</span> 共有 ToDoリスト</div>
          <div class="todo-list">
            ${dbTodos.results.length === 0 ? html`<p style="color:var(--text-muted); font-size:14px;">タスクはありません。</p>` : ''}
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
                  <button type="submit" class="todo-delete">×</button>
                </form>
              </div>
            `)}
          </div>
          <form class="todo-form" method="POST" action="/todos/add">
            <input type="text" name="task" placeholder="タスクや買い物を追加..." required>
            <button type="submit">追加</button>
          </form>
        </div>

        <div class="card col-span-1">
          <div class="card-header"><span class="card-icon">📝</span> メモ</div>
          <form class="memo-add-form" method="POST" action="/memo/add">
            <input type="text" name="content" placeholder="新規メモ..." required autocomplete="off">
            <button type="submit">+</button>
          </form>
          <div class="memo-list">
            ${dbMemos.results.map(memo => html`
              <div class="memo-item">
                <textarea class="memo-textarea" data-id="${memo.id}">${memo.content}</textarea>
                <form method="POST" action="/memo/delete" style="margin:0;">
                  <input type="hidden" name="id" value="${memo.id}">
                  <button type="submit" class="memo-delete">×</button>
                </form>
              </div>
            `)}
          </div>
        </div>

        <div class="card col-span-1">
          <div class="card-header chat-header-flex">
            <div><span class="card-icon">✨</span> Gemini Chat</div>
            <form method="POST" action="/api/gemini/clear" style="margin:0;" onsubmit="return confirm('履歴を消去しますか？');">
              <button type="submit" style="font-size:12px; border:none; background:none; color:var(--text-muted); text-decoration:underline;">クリア</button>
            </form>
          </div>
          
          <div id="chat-history" class="chat-box">
            ${chatHistory.length === 0 ? html`<div class="chat-msg ai-msg">こんにちは！画像を添付しての相談も可能です。</div>` : ''}
            ${chatHistory.map(chat => html`
              <div class="chat-msg ${chat.role === 'user' ? 'user-msg' : 'ai-msg'}">
                ${chat.message}
              </div>
            `)}
          </div>

          <div id="image-preview-container">
            <img id="image-preview" src="">
            <div id="clear-image">×</div>
          </div>

          <form id="gemini-form" class="chat-input-area" style="align-items:center;">
            <label for="chat-image-input" style="font-size:24px; cursor:pointer; margin-right:5px;">📷</label>
            <input type="file" id="chat-image-input" accept="image/*" style="display:none;" capture="environment">
            
            <input type="text" id="gemini-input" placeholder="メッセージ..." required autocomplete="off" style="width:100%;">
            <button type="submit" id="gemini-submit">▶</button>
          </form>
        </div>

        <div class="card col-span-2">
          <div class="card-header"><span class="card-icon">📈</span> Advanced Market</div>
          <div class="tradingview-widget-container" style="height:350px;">
            <div id="tradingview_chart" style="height:100%;"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
            <script type="text/javascript">
            new TradingView.widget({
              "autosize": true,
              "symbol": "FX_IDC:USDJPY",
              "interval": "D",
              "timezone": "Asia/Tokyo",
              "theme": "light",
              "style": "1",
              "locale": "ja",
              "enable_publishing": false,
              "allow_symbol_change": true,
              "watchlist": ["FOREXCOM:SPXUSD", "AMEX:VOO", "TVC:TOPIX", "TSE:9432", "BITSTAMP:BTCUSD", "BITSTAMP:ETHUSD"],
              "container_id": "tradingview_chart"
            });
            </script>
          </div>
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
          <div class="card-header chat-header-flex">
            <div><span class="card-icon">📸</span> Diary</div>
            <a href="/diary/post" style="font-size:14px; color:var(--primary); font-weight:bold;">＋ 投稿</a>
          </div>
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
                    <div style="font-size:12px; color:var(--text-main);">${note.content.substring(0, 30)}...</div>
                    <div class="overlay">${dateStr}</div>
                  </a>
                `;
              }
            })}
          </div>
        </div>
      </div>

      <script>
        // --- 1. 時計 ---
        function updateClock() {
          const now = new Date();
          document.getElementById('time-display').textContent = now.toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit' });
          const dateOptions = { era: 'long', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
          document.getElementById('date-jp').textContent = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', dateOptions).format(now);
          const oldMonths = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];
          document.getElementById('koyomi-display').textContent = \`西暦\${now.getFullYear()}年 / 旧暦: \${oldMonths[now.getMonth()]}\`;
        }
        setInterval(updateClock, 1000); updateClock();

        // --- 2. メモの自動保存 ---
        const memoTextareas = document.querySelectorAll('.memo-textarea');
        let memoTimeouts = {};
        memoTextareas.forEach(textarea => {
          textarea.style.height = textarea.scrollHeight + 'px';
          textarea.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            const id = e.target.getAttribute('data-id');
            clearTimeout(memoTimeouts[id]);
            memoTimeouts[id] = setTimeout(async () => {
              await fetch('/api/memo/update', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id, content: e.target.value })
              });
            }, 800);
          });
        });

        // --- 3. Gemini Chat (画像添付対応) ---
        const historyDiv = document.getElementById('chat-history');
        historyDiv.scrollTop = historyDiv.scrollHeight;
        
        let selectedImageData = null;
        let selectedImageMimeType = null;
        
        const fileInput = document.getElementById('chat-image-input');
        const previewContainer = document.getElementById('image-preview-container');
        const previewImg = document.getElementById('image-preview');
        
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if(file) {
            selectedImageMimeType = file.type;
            const reader = new FileReader();
            reader.onload = (event) => {
              previewImg.src = event.target.result;
              previewContainer.style.display = 'block';
              selectedImageData = event.target.result.split(',')[1]; // Base64部分のみ抽出
            };
            reader.readAsDataURL(file);
          }
        });

        document.getElementById('clear-image').addEventListener('click', () => {
          fileInput.value = '';
          selectedImageData = null;
          previewContainer.style.display = 'none';
        });

        document.getElementById('gemini-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('gemini-input');
          const submitBtn = document.getElementById('gemini-submit');
          const prompt = input.value;
          
          let displayMsg = prompt;
          if(selectedImageData) displayMsg = '📷[画像添付] ' + prompt;

          historyDiv.innerHTML += \`<div class="chat-msg user-msg">\${displayMsg}</div>\`;
          input.value = '';
          submitBtn.disabled = true;
          historyDiv.scrollTop = historyDiv.scrollHeight;

          const payload = { 
            prompt: prompt,
            imageBase64: selectedImageData,
            imageMimeType: selectedImageMimeType
          };

          // 送信後は画像をクリア
          fileInput.value = '';
          selectedImageData = null;
          previewContainer.style.display = 'none';

          try {
            const res = await fetch('/api/gemini', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            historyDiv.innerHTML += \`<div class="chat-msg ai-msg">\${data.response}</div>\`;
          } catch (err) {
            historyDiv.innerHTML += \`<div class="chat-msg ai-msg" style="color:red;">エラーが発生しました</div>\`;
          }
          submitBtn.disabled = false;
          historyDiv.scrollTop = historyDiv.scrollHeight;
        });
      </script>
    `
  }));
});

// --- 各種APIエンドポイント (メモ, ToDo, 削除など) ---
app.post('/memo/add', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('INSERT INTO quick_memo (content) VALUES (?)').bind(body['content']).run();
  return c.redirect('/');
});
app.post('/memo/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM quick_memo WHERE id = ?').bind(body['id']).run();
  return c.redirect('/');
});
app.post('/api/memo/update', async (c) => {
  const { id, content } = await c.req.json();
  await c.env.DB.prepare('UPDATE quick_memo SET content = ? WHERE id = ?').bind(content, id).run();
  return c.json({ success: true });
});

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

// --- Gemini API処理 (画像・システムプロンプト対応) ---
app.post('/api/gemini', async (c) => {
  const { prompt, imageBase64, imageMimeType } = await c.req.json();
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) return c.json({ response: "APIキーが設定されていません" });

  // 履歴保存用にプレフィックスをつける
  const dbMsg = imageBase64 ? `[📷画像添付] ${prompt}` : prompt;
  await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)')
    .bind('user', dbMsg, Date.now()).run();
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // システム命令: ニュースフォーマットやFXのPOGについてのルールを付与
    const system_instruction = {
      parts: [{ text: "ユーザーが「今日のニュース」と聞いた場合、政治・経済、国内、国際、マーケット、IT、天気予報のジャンルに分け、簡単な説明と参照元URLを含めて回答してください。FXのPOGはPerfect Orderのことです。" }]
    };

    // リクエストの中身を構築 (画像があればパーツに追加)
    const requestParts = [{ text: prompt }];
    if (imageBase64 && imageMimeType) {
      requestParts.push({ inline_data: { mime_type: imageMimeType, data: imageBase64 } });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        system_instruction: system_instruction,
        contents: [{ parts: requestParts }] 
      })
    });
    
    const data = await response.json();
    if (!response.ok) return c.json({ response: `Google APIエラー: ${data.error?.message || '詳細不明'}` });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return c.json({ response: `回答がブロックされました。理由: ${data.candidates?.[0]?.finishReason || '不明'}` });
    
    await c.env.DB.prepare('INSERT INTO chats (role, message, created_at) VALUES (?, ?, ?)')
      .bind('ai', text, Date.now()).run();
    return c.json({ response: text });
  } catch (e) { 
    return c.json({ response: "プログラムエラー: " + e.message }); 
  }
});
app.post('/api/gemini/clear', async (c) => {
  await c.env.DB.prepare('DELETE FROM chats').run();
  return c.redirect('/');
});

// --- 日記関連処理 (省略せず全て記載) ---
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
                <form method="POST" action="/diary/delete" style="margin:0;" onsubmit="return confirm('本当に削除しますか？');">
                  <input type="hidden" name="id" value="${note.id}">
                  <button type="submit" style="background:none; border:none; color:#ef4444; font-size:0.9rem; cursor:pointer; padding:0; text-decoration:underline;">削除</button>
                </form>
              </div>
            </div>
            <p style="white-space: pre-wrap; margin:0; line-height: 1.5;">${note.content}</p>
            ${note.image_url ? html`<img src="${note.image_url}" style="margin-top:10px; border-radius:8px; max-width:100%; height:auto;" />` : ''}
          </div>
        `)}
      </div>
    `
  }));
});
app.post('/diary/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(body['id']).run();
  return c.redirect('/diary');
});
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
            <textarea name="content" rows="6" required style="padding:10px; border:1px solid var(--border); border-radius:8px; font-size:16px;">${note.content}</textarea>
            <div style="display:flex; gap:10px;">
              <button type="submit" style="flex-grow:1; padding:12px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">更新する</button>
              <a href="/diary" style="padding:12px 20px; background:var(--bg); color:var(--text-main); border-radius:8px; text-align:center; font-weight:bold;">キャンセル</a>
            </div>
          </form>
        </div>
      </div>
    `
  }));
});
app.post('/diary/edit/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind(body['content'], id).run();
  return c.redirect('/diary');
});
app.get('/diary/post', (c) => {
  return c.html(Layout({
    title: '新規投稿',
    children: html`
      <div class="container" style="display:block; max-width:600px;">
        <div class="card">
          <div class="card-header">新しい記録を追加</div>
          <form method="POST" action="/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;">
            <textarea name="content" rows="6" required placeholder="いまどうしてる？" style="padding:10px; border:1px solid var(--border); border-radius:8px; font-size:16px;"></textarea>
            <input type="file" name="image" accept="image/*" style="font-size:16px;">
            <button type="submit" style="padding:12px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">保存する</button>
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