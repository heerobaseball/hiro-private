import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// --- 共通レイアウト ---
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title || 'My Dashboard'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script> <style>
    body { padding-top: 20px; max-width: 1100px; margin: 0 auto; background-color: #f4f4f9; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    nav { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
    .grid-dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .grid-dashboard { grid-template-columns: 1fr; } }
    
    .card { padding: 1rem; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem; background: #fff; }
    .news-item { font-size: 0.9rem; margin-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.5rem; }
    .news-item a { text-decoration: none; color: #333; }
    .source-tag { font-size: 0.7rem; color: #666; background: #eee; padding: 2px 5px; border-radius: 4px; }
    
    /* チャット風UI */
    .chat-box { max-height: 300px; overflow-y: auto; background: #f9f9f9; padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd; }
    .chat-message { margin-bottom: 10px; padding: 8px; border-radius: 8px; }
    .user-msg { background: #e3f2fd; text-align: right; }
    .ai-msg { background: #fff; border: 1px solid #eee; }
  </style>
</head>
<body>
  <main class="container">
    <nav>
      <ul><li><strong>My Dashboard</strong></li></ul>
      <ul>
        <li><a href="/">🏠 ホーム</a></li>
        <li><a href="/diary">📖 日記</a></li>
        <li><a role="button" href="/diary/post">✍️ 投稿</a></li>
      </ul>
    </nav>
    ${props.children}
  </main>
</body>
</html>
`;

// --- ニュース取得関数 ---
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
      if (items.length >= 6) break;
      items.push({ title: match[1], link: match[2], source: match[3] });
    }
    return items;
  } catch (e) { return []; }
}

// --- 【トップページ】すべてを表示 ---
app.get('/', async (c) => {
  // 並行してデータ取得 (ニュース、日記、資産データ)
  const [news, dbNotes, dbAssets] = await Promise.all([
    fetchGoogleNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 3').all(),
    c.env.DB.prepare('SELECT * FROM assets ORDER BY record_date ASC').all()
  ]);

  // グラフ用のデータを配列に変換
  const assetDates = JSON.stringify(dbAssets.results.map(a => a.record_date));
  const assetAmounts = JSON.stringify(dbAssets.results.map(a => a.amount));

  return c.html(Layout({
    title: 'ホーム - My Dashboard',
    children: html`
      <div class="grid-dashboard">
        
        <div>
          <h3>📈 マーケット</h3>
          <div class="tradingview-widget-container" style="height:350px;">
            <div class="tradingview-widget-container__widget"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>
            {
              "width": "100%", "height": 350,
              "symbolsGroups": [{ "name": "Watchlist", "symbols": [
                    { "name": "FOREXCOM:SPXUSD", "displayName": "S&P 500" },
                    { "name": "AMEX:VOO", "displayName": "VOO" },
                    { "name": "FX_IDC:USDJPY", "displayName": "USD/JPY" },
                    { "name": "BITSTAMP:BTCUSD", "displayName": "BTC/USD" },
                    { "name": "BITSTAMP:ETHUSD", "displayName": "ETH/USD" },
                    { "name": "BITSTAMP:XRPUSD", "displayName": "XRP/USD" },
                    { "name": "COINBASE:SHIBUSD", "displayName": "SHIB/USD" }
              ]}],
              "colorTheme": "light", "locale": "ja"
            }
            </script>
          </div>
          
          <h3 style="margin-top:20px;">📰 News</h3>
          <div class="card">
            ${news.map(item => html`
              <div class="news-item">
                <a href="${item.link}" target="_blank">${item.title.substring(0, 35)}... <span class="source-tag">${item.source}</span></a>
              </div>
            `)}
          </div>
        </div>

        <div>
          <h3>📅 スケジュール</h3>
          <div class="card" style="padding:0; overflow:hidden;">
            <div style="padding:20px; text-align:center; color:#888;">
              <iframe src="https://calendar.google.com/calendar/embed?src=heero.baseball%40gmail.com&ctz=Asia%2FTokyo" 
              style="border: 0" 
              width="100%" 
              height="300" 
              frameborder="0" 
              scrolling="no"
              style="border: 0" width="800" height="600" frameborder="0" scrolling="no"></iframe>
            </div>
            </div>

          <h3>🤖 Gemini Chat</h3>
          <div class="card">
            <div id="chat-history" class="chat-box">
              <div class="chat-message ai-msg">こんにちは！何かお手伝いしましょうか？</div>
            </div>
            <form id="gemini-form" style="display:flex; gap:10px;">
              <input type="text" id="gemini-input" name="prompt" placeholder="Geminiに質問..." required style="margin-bottom:0;">
              <button type="submit" style="width:auto;">送信</button>
            </form>
          </div>
        </div>

      </div>

      <hr />

      <h3>💰 資産推移</h3>
      <div class="grid-dashboard">
        <div class="card">
          <canvas id="assetChart"></canvas>
        </div>
        <div class="card">
          <h5>データ入力</h5>
          <form method="POST" action="/assets/add">
            <div class="grid">
              <label>日付<input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}"></label>
              <label>総資産額 (円)<input type="number" name="amount" required></label>
            </div>
            <button type="submit">記録する</button>
          </form>
        </div>
      </div>

      <hr />

      <h3>📝 最新の記録</h3>
      <div class="grid">
        ${dbNotes.results.map(note => html`
          <article class="card">
            <header><small>${new Date(note.created_at).toLocaleString('ja-JP')}</small></header>
            <p>${note.content.substring(0, 50)}...</p>
            <footer><a href="/diary">詳細</a></footer>
          </article>
        `)}
      </div>

      <script>
        // --- 資産グラフ描画 ---
        const ctx = document.getElementById('assetChart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${assetDates},
            datasets: [{
              label: '総資産推移',
              data: ${assetAmounts},
              borderColor: '#0070f3',
              backgroundColor: 'rgba(0, 112, 243, 0.1)',
              fill: true,
              tension: 0.1
            }]
          },
          options: { responsive: true }
        });

        // --- Geminiチャット処理 ---
        document.getElementById('gemini-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('gemini-input');
          const history = document.getElementById('chat-history');
          const prompt = input.value;

          // ユーザーのメッセージを表示
          history.innerHTML += \`<div class="chat-message user-msg">\${prompt}</div>\`;
          input.value = '';
          history.scrollTop = history.scrollHeight;

          // サーバーに送信
          try {
            const res = await fetch('/api/gemini', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            // AIの返答を表示
            history.innerHTML += \`<div class="chat-message ai-msg">\${data.response}</div>\`;
          } catch (err) {
            history.innerHTML += \`<div class="chat-message ai-msg" style="color:red;">エラーが発生しました</div>\`;
          }
          history.scrollTop = history.scrollHeight;
        });
      </script>
    `
  }));
});

// --- 資産データ保存処理 ---
app.post('/assets/add', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('INSERT INTO assets (record_date, amount, created_at) VALUES (?, ?, ?)')
    .bind(body['date'], body['amount'], Date.now()).run();
  return c.redirect('/');
});

// --- Gemini API処理 (サーバー側) ---
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
  } catch (e) {
    return c.json({ response: "エラー: " + e.message });
  }
});

// --- 他のページ (日記一覧など) は以前と同じ ---
app.get('/diary', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  return c.html(Layout({
    title: '日記一覧',
    children: html`
      <h2>📚 全ての記録</h2>
      ${results.map(n => html`<article class="card"><p>${n.content}</p></article>`)}
    `
  }));
});

// 投稿ページなどは省略せず、必要なら以前のコードを追加してください
// (長くなるため、日記投稿機能部分は以前のものをそのまま残すか、再利用してください)

export const onRequest = handle(app);