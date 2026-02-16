import { Hono } from 'hono';
import { html } from 'hono/html';

const app = new Hono();

// デザインテンプレート (Pico.cssを使用)
const Layout = (props) => html`
  <!DOCTYPE html>
  <html lang="ja">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dynamic My Page</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
    <style>
      body { padding: 20px; max-width: 800px; margin: 0 auto; }
      .photo-card { margin-bottom: 20px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
      img { max-width: 100%; border-radius: 4px; }
    </style>
  </head>
  <body>
    <nav>
      <ul>
        <li><strong>Hiro's Private</strong></li>
      </ul>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/post">投稿する</a></li>
      </ul>
    </nav>
    <main>
      ${props.children}
    </main>
  </body>
  </html>
`;

// トップページ: D1からデータを取得して表示
app.get('/', async (c) => {
  // D1データベースから記事一覧を取得 (新しい順)
  const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();

  return c.html(Layout({
    children: html`
      <h1>最近の記録</h1>
      ${results.length === 0 ? html`<p>まだ投稿がありません。</p>` : ''}
      
      ${results.map(post => html`
        <article>
          <header>
            <small>${new Date(post.created_at).toLocaleString('ja-JP')}</small>
          </header>
          <p>${post.content}</p>
          ${post.image_url ? html`<img src="${post.image_url}" alt="写真" />` : ''}
        </article>
      `)}
    `
  }));
});

// 投稿ページを表示
app.get('/post', (c) => {
  return c.html(Layout({
    children: html`
      <h2>新しい記録を追加</h2>
      <form method="POST" action="/post" enctype="multipart/form-data">
        <label>
          メモ
          <textarea name="content" required rows="3"></textarea>
        </label>
        <label>
          写真 (任意)
          <input type="file" name="image" accept="image/*">
        </label>
        <button type="submit">保存する</button>
      </form>
    `
  }));
});

// 投稿を受け取って保存する処理
app.post('/post', async (c) => {
  const body = await c.req.parseBody();
  const content = body['content'];
  const imageFile = body['image'];
  let imageUrl = null;

  // 画像がある場合、R2に保存
  if (imageFile && imageFile instanceof File && imageFile.size > 0) {
    const fileName = `${Date.now()}_${imageFile.name}`;
    // R2にアップロード
    await c.env.BUCKET.put(fileName, await imageFile.arrayBuffer(), {
      httpMetadata: { contentType: imageFile.type }
    });
    // 公開URLを作成 (この部分は後でR2の公開設定が必要ですが一旦仮置き)
    imageUrl = `/images/${fileName}`; 
  }

  // D1データベースに保存
  await c.env.DB.prepare(
    'INSERT INTO notes (content, image_url, created_at) VALUES (?, ?, ?)'
  ).bind(content, imageUrl, Date.now()).run();

  // トップページに戻る
  return c.redirect('/');
});

// 画像を表示するためのルート (R2から読み出し)
app.get('/images/:key', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.BUCKET.get(key);

  if (!object) return c.text('Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});

export default app;