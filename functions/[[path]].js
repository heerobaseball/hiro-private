import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// --- 1. 共通レイアウト (ナビゲーション付き) ---
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title || 'My Dashboard'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
  <style>
    body { padding-top: 20px; max-width: 1000px; margin: 0 auto; background-color: #f4f4f9; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    nav { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
    .card { padding: 1rem; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem; background: #fff; }
    .news-item { font-size: 0.9rem; margin-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.5rem; }
    .news-item a { text-decoration: none; color: #333; }
    .news-item a:hover { color: #0070f3; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
  </style>
</head>
<body>
  <main class="container">
    <nav>
      <ul>
        <li><strong>My Dashboard</strong></li>
      </ul>
      <ul>
        <li><a href="/">🏠 ホーム</a></li>
        <li><a href="/diary">📖 日記一覧</a></li>
        <li><a role="button" href="/diary/post">✍️ 投稿する</a></li>
      </ul>
    </nav>
    ${props.children}
  </main>
</body>
</html>
`;

// --- 2. ニュースを取得する便利関数 ---
async function fetchGoogleNews() {
  try {
    const rssUrl = "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja";
    const response = await fetch(rssUrl);
    const text = await response.text();
    
    // 簡易的なXML解析
    const items = [];
    const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (items.length >= 8) break; // 8件まで
      items.push({ title: match[1], link: match[2] });
    }
    return items;
  } catch (e) {
    return [{ title: "ニュースの取得に失敗しました", link: "#" }];
  }
}

// --- 3. ルート定義 ---

// 【トップページ】ダッシュボード
app.get('/', async (c) => {
  // 並行してデータ取得
  const [news, dbResult] = await Promise.all([
    fetchGoogleNews(),
    c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT 3').all()
  ]);

  return c.html(Layout({
    title: 'ホーム - My Dashboard',
    children: html`
      <div class="grid">
        <div>
          <h3>📈 マーケット情報</h3>
          <div class="tradingview-widget-container">
            <div class="tradingview-widget-container__widget"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>
            {
              "width": "100%",
              "height": 400,
              "symbolsGroups": [
                {
                  "name": "Indices",
                  "symbols": [
                    { "name": "FOREXCOM:SPXUSD", "displayName": "S&P 500" },
                    { "name": "TVC:TOPIX", "displayName": "TOPIX" },
                    { "name": "FX_IDC:USDJPY", "displayName": "USD/JPY" }
                  ]
                }
              ],
              "colorTheme": "light",
              "isTransparent": false,
              "locale": "ja"
            }
            </script>
          </div>
        </div>

        <div>
          <h3>📰 今日のニュース</h3>
          <div class="card">
            ${news.map(item => html`
              <div class="news-item">
                <a href="${item.link}" target="_blank">${item.title}</a>
              </div>
            `)}
          </div>
        </div>
      </div>

      <hr />

      <h3>📝 最新の記録 (3件)</h3>
      <div class="grid">
        ${dbResult.results.map(note => html`
          <article class="card">
            <header><small>${new Date(note.created_at).toLocaleString('ja-JP')}</small></header>
            <p>${note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content}</p>
            ${note.image_url ? html`<img src="${note.image_url}" style="max-height: 150px; object-fit: cover;" />` : ''}
            <footer><a href="/diary">詳細を見る</a></footer>
          </article>
        `)}
      </div>
    `
  }));
});

// 【日記一覧ページ】
app.get('/diary', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  
  return c.html(Layout({
    title: '日記一覧',
    children: html`
      <h2>📚 全ての記録</h2>
      ${results.map(note => html`
        <article class="card">
          <header>
            <strong>${new Date(note.created_at).toLocaleString('ja-JP')}</strong>
          </header>
          <p style="white-space: pre-wrap;">${note.content}</p>
          ${note.image_url ? html`<img src="${note.image_url}" loading="lazy" />` : ''}
        </article>
      `)}
    `
  }));
});

// 【投稿ページ】
app.get('/diary/post', (c) => {
  return c.html(Layout({
    title: '新規投稿',
    children: html`
      <article>
        <header>✍️ 新しい記録を追加</header>
        <form method="POST" action="/diary/post" enctype="multipart/form-data">
          <label>
            内容
            <textarea name="content" rows="5" required placeholder="いまどうしてる？"></textarea>
          </label>
          <label>
            写真 (任意)
            <input type="file" name="image" accept="image/*">
          </label>
          <button type="submit">保存する</button>
        </form>
      </article>
    `
  }));
});

// 【投稿処理】
app.post('/diary/post', async (c) => {
  const body = await c.req.parseBody();
  const content = body['content'];
  const imageFile = body['image'];
  let imageUrl = null;

  if (imageFile instanceof File && imageFile.size > 0) {
    const fileName = `${Date.now()}-${imageFile.name}`;
    await c.env.BUCKET.put(fileName, await imageFile.arrayBuffer(), {
      httpMetadata: { contentType: imageFile.type }
    });
    imageUrl = `/images/${fileName}`;
  }

  await c.env.DB.prepare(
    'INSERT INTO notes (content, image_url, created_at) VALUES (?, ?, ?)'
  ).bind(content, imageUrl, Date.now()).run();

  return c.redirect('/diary');
});

// 【画像表示用】
app.get('/images/:key', async (c) => {
  const object = await c.env.BUCKET.get(c.req.param('key'));
  if (!object) return c.text('Not Found', 404);
  
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});

export const onRequest = handle(app);