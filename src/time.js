// 自作の時刻同期用APIモジュール
export function setupTime(app) {
  app.get('/api/time', c => {
    // 古い時間を記憶（キャッシュ）しないようにヘッダーを設定
    c.header('Cache-Control', 'no-store'); 
    return c.json({ timestamp: Date.now() });
  });
}