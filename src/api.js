export function setupApi(app) {
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

  app.get('/api/news', async c => {
    const b = "site:bloomberg.co.jp OR site:jp.reuters.com OR site:nikkei.com";
    const queries = { top: `https://news.google.com/rss/search?q=${encodeURIComponent(b)}&hl=ja&gl=JP&ceid=JP:ja`, biz: `https://news.google.com/rss/search?q=${encodeURIComponent('政治 OR 経済 ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, market: `https://news.google.com/rss/search?q=${encodeURIComponent('株 OR 為替 OR マーケット ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, it: `https://news.google.com/rss/search?q=${encodeURIComponent('IT OR AI OR テクノロジー ' + b)}&hl=ja&gl=JP&ceid=JP:ja` };
    const res = {};
    for (const [k, u] of Object.entries(queries)) {
      try {
        const t = await (await fetch(u)).text(); const items = []; let m; const rx = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<source.*?>(.*?)<\/source>/g;
        while ((m = rx.exec(t)) !== null && items.length < 8) items.push({ title: m[1], link: m[2], imgUrl: m[3].match(/<img[^>]+src="([^">]+)"/)?.[1], source: m[4] });
        res[k] = items;
      } catch(e) { res[k] = []; }
    } return c.json(res);
  });

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

  app.get('/api/speedtest/ping', c => c.text('pong'));
  app.get('/api/speedtest/download', c => { c.header('Content-Type', 'application/octet-stream'); c.header('Cache-Control', 'no-store'); return c.body(new Uint8Array(5 * 1024 * 1024)); });
  app.post('/api/speedtest/upload', async c => { await c.req.arrayBuffer(); return c.json({ success: true }); });
  app.post('/api/speedtest/save', async c => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO speedtests (ping, download, upload, created_at) VALUES (?, ?, ?, ?)').bind(b.ping, b.dl, b.ul, Date.now()).run(); return c.json({ success: true }); });
}