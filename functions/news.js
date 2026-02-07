export async function onRequest(context) {
  // Googleニュース (日本:トップニュース) のRSS URL
  const rssUrl = "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja";

  // サーバー側でRSSを取得 (Googleに拒否されないようUser-Agentを設定)
  const response = await fetch(rssUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
  });
  
  const xmlText = await response.text();

  // 取得したXMLをそのままブラウザに返す
  return new Response(xmlText, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}