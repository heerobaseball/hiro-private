// ★ 暗号化ライブラリ（SHA-256計算用）
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ★ 完全性を担保した監査ログ記録API (ブロックチェーン・ハッシュチェーン仕様)
  app.post('/api/log', async c => {
    try {
      const b = await c.req.json();
      const ip = c.req.header('CF-Connecting-IP') || 'unknown';
      const ua = c.req.header('User-Agent') || 'unknown';
      const timestamp = Date.now();
      
      // 1. 直前のログのハッシュ値を取得（なければ 'GENESIS' を設定）
      const lastLog = await c.env.DB.prepare('SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1').first();
      const previousHash = lastLog ? lastLog.current_hash : 'GENESIS_BLOCK';
      
      // 2. 今回のデータと直前のハッシュを混ぜて、今回のハッシュ値を計算
      const rawData = `${previousHash}|${timestamp}|${ip}|${b.action}|${b.target}`;
      const currentHash = await sha256(rawData);
      
      // 3. ハッシュ値と一緒にデータベースへ保存（追記のみ）
      await c.env.DB.prepare('INSERT INTO audit_logs (timestamp, ip_address, user_agent, action, target, previous_hash, current_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(timestamp, ip, ua, b.action, b.target, previousHash, currentHash).run();
      
      return c.json({ success: true });
    } catch(e) {
      return c.json({ success: false }, 500);
    }
  });