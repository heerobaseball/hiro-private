export async function onRequest(context) {
  // 日本時間を取得
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  
  // JSON形式で返す
  return new Response(JSON.stringify({ message: `現在の時刻は ${now} です` }), {
    headers: { "content-type": "application/json" },
  });
}