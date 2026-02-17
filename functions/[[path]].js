import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { html } from 'hono/html';

const app = new Hono();

// 共通デザイン (Pico.css)
const Layout = (props) => html`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Private Diary</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
  <style>
    body { padding-top: 20px; max-width: 800px; margin: 0 auto; }
    .card { margin-bottom: 2rem; padding: 1.5rem; border: 1px solid #ddd; border-radius: 8px; }
    img { max-width: 100%; border-radius: 4px; margin-top: 10px; }
    nav { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
  </style>
</head>
<body>
  <main class="container">
    <nav>
      <ul><li><strong>Hiro's Diary</strong></li></ul>
      <ul>
        <li><a href="/">一覧</a></li>
        <li><a role="button" href="/post">投稿</a></li>
      </ul>
    </nav>
    ${props.children}
  </main>
</body>
</html>
`;

// 1. トップページ (一覧表示)
app.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
    return c.html(Layout({
      children: html`
        ${results.length === 0 ? html`<p>投稿がありません。</p>` : ''}
        ${results.map(note => html`
          <article class="card">
            <header><small>${new Date(note.created_at).toLocaleString('ja-JP')}</small></header>
            <p style="white-space: pre-wrap;">${note.content}</p>
            ${note.image_url ? html`<img src="${note.image_url}" loading="lazy" />` : ''}
          </article>
        `)}
      `
    }));
  } catch (e) { return c.text(`Error: ${e.message}`); }
});

// 2. 投稿ページ
app.get('/post', (c) => c.html(Layout({
  children: html`
    <article>
      <header>新規投稿</header>
      <form method="POST" action="/post" enctype="multipart/form-data">
        <label>内容<textarea name="content" rows="5" required></textarea></label>
        <label>写真<input type="file" name="image" accept="image/*"></label>
        <button type="submit">保存</button>
      </form>
    </article>
  `
})));

// 3. 投稿処理 (R2保存 + D1保存)
app.post('/post', async (c) => {
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

  await c.env.DB.prepare('INSERT INTO notes (content, image_url, created_at) VALUES (?, ?, ?)')
    .bind(content, imageUrl, Date.now()).run();

  return c.redirect('/');
});

// 4. 画像表示 (R2から取得)
app.get('/images/:key', async (c) => {
  const object = await c.env.BUCKET.get(c.req.param('key'));
  if (!object) return c.text('Not Found', 404);
  
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});

export const onRequest = handle(app);