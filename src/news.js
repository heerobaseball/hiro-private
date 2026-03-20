// ニュース取得専用のAPIエンドポイント

export function setupNews(app) {
  app.get('/api/news', async c => {
    const b = "site:bloomberg.co.jp OR site:jp.reuters.com OR site:nikkei.com";
    const queries = { 
      top: `https://news.google.com/rss/search?q=${encodeURIComponent(b)}&hl=ja&gl=JP&ceid=JP:ja`, 
      biz: `https://news.google.com/rss/search?q=${encodeURIComponent('政治 OR 経済 ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, 
      market: `https://news.google.com/rss/search?q=${encodeURIComponent('株 OR 為替 OR マーケット ' + b)}&hl=ja&gl=JP&ceid=JP:ja`, 
      it: `https://news.google.com/rss/search?q=${encodeURIComponent('IT OR AI OR テクノロジー ' + b)}&hl=ja&gl=JP&ceid=JP:ja` 
    };
    const res = {};
    for (const [k, u] of Object.entries(queries)) {
      try {
        const t = await (await fetch(u)).text(); 
        const items = []; let m; 
        const rx = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<source.*?>(.*?)<\/source>/g;
        while ((m = rx.exec(t)) !== null && items.length < 8) {
          items.push({ title: m[1], link: m[2], imgUrl: m[3].match(/<img[^>]+src="([^">]+)"/)?.[1], source: m[4] });
        }
        res[k] = items;
      } catch(e) { res[k] = []; }
    } 
    return c.json(res);
  });
}