import { html } from 'hono/html';

export function setupAdmin(app) {
  app.get('/admin/logs', async c => {
    // 🔒 究極の封印：Cloudflareの環境変数から鍵を取得する
    const envSecretKey = c.env.ADMIN_LOG_KEY; // ★ 環境変数
    const queryKey = c.req.query('key');

    // 環境変数が設定されていない（封印状態）、またはURLの鍵が間違っている場合は絶対にアクセス拒否
    if (!envSecretKey || queryKey !== envSecretKey) {
      // ※閲覧を試みたこと自体も不正アクセスとして監査ログに残す
      const ip = c.req.header('CF-Connecting-IP') || 'unknown';
      try {
        const lastLog = await c.env.DB.prepare('SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1').first();
        const prevH = lastLog ? lastLog.current_hash : 'GENESIS';
        const msg = new TextEncoder().encode(`${prevH}|${Date.now()}|${ip}|UNAUTHORIZED_ACCESS|/admin/logs`);
        const curH = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', msg))).map(b=>b.toString(16).padStart(2,'0')).join('');
        await c.env.DB.prepare('INSERT INTO audit_logs (timestamp, ip_address, user_agent, action, target, previous_hash, current_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(Date.now(), ip, c.req.header('User-Agent')||'unknown', 'UNAUTHORIZED_ACCESS', '/admin/logs', prevH, curH).run();
      } catch(e){}
      
      return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>System Locked</title></head><body style="background:#0f172a; color:#ef4444; text-align:center; padding-top:100px; font-family:monospace;"><h2>🔒 System Sealed.</h2><p>Admin access is currently disabled at the server level.</p></body></html>`, 401);
    }

    // データベースから最新のログを取得
    const { results } = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 300').all();

    return c.html(html`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin - Audit Logs</title>
        <style>
          body { background: #0f172a; color: #f8fafc; font-family: 'Courier New', Consolas, monospace; padding: 20px; margin: 0; }
          h1 { color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-top: 0; display:flex; justify-content:space-between; }
          .table-wrapper { overflow-x: auto; background: #1e293b; border-radius: 8px; border: 1px solid #334155; }
          table { width: 100%; border-collapse: collapse; min-width: 1000px; }
          th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #334155; font-size: 13px; }
          th { background: #020617; color: #94a3b8; font-weight: bold; position: sticky; top: 0; }
          tr:hover { background: #334155; }
          .hash-text { font-size: 10px; color: #64748b; font-family: monospace; letter-spacing: -0.5px; }
          .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .bg-PAGE_ACCESS { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid #3b82f6; }
          .bg-CLICK { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
          .bg-FORM_SUBMIT { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
          .bg-UNAUTHORIZED_ACCESS { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
        </style>
      </head>
      <body>
        <h1><span>🛡️ Immutable Audit Trail</span> <span style="font-size:14px; color:#10b981;">✅ ハッシュチェーン検証有効</span></h1>
        <p style="color:#94a3b8; margin-bottom:20px;">各ログは直前のログのハッシュ値を継承しており、データベースの直接改ざんをシステム的に無効化しています。</p>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Time (JST)</th>
                <th>IP Address</th>
                <th>Action</th>
                <th>Target</th>
                <th>Current Hash (SHA-256)</th>
              </tr>
            </thead>
            <tbody>
              ${results.length === 0 ? html`<tr><td colspan="5" style="text-align:center; padding:30px; color:#64748b;">No logs recorded yet.</td></tr>` : ''}
              ${results.map(r => {
                const d = new Date(r.timestamp + 9 * 3600000);
                const dStr = \`\${String(d.getUTCMonth()+1).padStart(2,'0')}-\${String(d.getUTCDate()).padStart(2,'0')} \${String(d.getUTCHours()).padStart(2,'0')}:\${String(d.getUTCMinutes()).padStart(2,'0')}:\${String(d.getUTCSeconds()).padStart(2,'0')}\`;
                return html\`
                <tr>
                  <td style="color:#94a3b8; white-space:nowrap;">\${dStr}</td>
                  <td style="color:#38bdf8; font-weight:bold;">\${r.ip_address}</td>
                  <td><span class="badge bg-\${r.action}">\${r.action}</span></td>
                  <td style="color:#f8fafc;">\${r.target}</td>
                  <td class="hash-text" title="Prev: \${r.previous_hash}">...\${r.current_hash ? r.current_hash.slice(-16) : 'N/A'}</td>
                </tr>
                \`;
              })}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
  });
}