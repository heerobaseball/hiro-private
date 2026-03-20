import { html, raw } from 'hono/html';

export function setupTools(app) {
  // --- ネットワークスピードテスト ---
  app.get('/speedtest', async c => {
    const { results } = await c.env.DB.prepare('SELECT * FROM speedtests ORDER BY created_at DESC LIMIT 10').all();
    return c.html(html`
      <!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><meta name="theme-color" content="#3b82f6"><title>Speed Test</title>
        <style>
          :root { --bg: #f8fafc; --card-bg: #ffffff; --text-main: #0f172a; --border: #e2e8f0; --primary: #3b82f6; --success: #10b981; }
          body { margin: 0; background: var(--bg); color: var(--text-main); font-family: -apple-system, sans-serif; } a { text-decoration: none; color: inherit; }
          .navbar { display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 0.8rem 1.5rem; border-bottom: 1px solid var(--border); box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
          .nav-brand { font-size: 1.2rem; font-weight: 900; } .nav-links { display: flex; gap: 15px; } .nav-links a { font-weight: 600; color: #64748b; } .nav-links a.active { color: var(--primary); }
          .container { max-width: 800px; margin: 2rem auto; padding: 0 1rem; text-align: center; }
          .meter-container { background: var(--card-bg); padding: 40px 20px; border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; }
          .speed-display { display: flex; justify-content: space-around; margin-bottom: 30px; } .speed-box { flex: 1; }
          .speed-label { font-size: 0.9rem; color: #64748b; font-weight: bold; margin-bottom: 5px; } .speed-value { font-size: 2.5rem; font-weight: 900; color: var(--text-main); } .speed-unit { font-size: 1rem; color: #64748b; font-weight: normal; }
          .btn-start { background: var(--primary); color: white; border: none; padding: 15px 40px; font-size: 1.2rem; font-weight: bold; border-radius: 30px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.4); }
          .btn-start:active { transform: scale(0.95); } .btn-start:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; transform: none; }
          .history-list { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; text-align: left; }
          .h-item { display: flex; justify-content: space-between; padding: 12px 15px; border-bottom: 1px solid var(--border); font-size: 0.9rem; } .h-item:last-child { border-bottom: none; } .h-date { color: #64748b; width: 120px; }
        </style>
      </head>
      <body>
        <header class="navbar"><div class="nav-brand">Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/speedtest" class="active">Speed</a><a href="#" target="_blank" style="color:#10b981;">Chat App ↗</a></div></header>
        <div class="container">
          <h2 style="margin-top:0;">🚀 Network Speed Test</h2><p style="color:#64748b; font-size:0.9rem; margin-bottom:20px;">ダッシュボードサーバーとの純粋な通信速度を計測します。</p>
          <div class="meter-container">
            <div class="speed-display"><div class="speed-box"><div class="speed-label">Ping</div><div class="speed-value" id="val-ping">-- <span class="speed-unit">ms</span></div></div><div class="speed-box"><div class="speed-label">Download</div><div class="speed-value" id="val-dl" style="color:var(--primary);">-- <span class="speed-unit">Mbps</span></div></div><div class="speed-box"><div class="speed-label">Upload</div><div class="speed-value" id="val-ul" style="color:var(--success);">-- <span class="speed-unit">Mbps</span></div></div></div>
            <button id="btn-start" class="btn-start">計測スタート</button><div id="status-msg" style="margin-top:15px; font-size:0.9rem; color:#64748b; font-weight:bold; height:20px;"></div>
          </div>
          <h3 style="text-align:left; margin-bottom:10px;">過去の計測履歴</h3>
          <div class="history-list">
            ${results.length === 0 ? html`<div style="padding:20px; text-align:center; color:#64748b;">まだ履歴がありません</div>` : ''}
            ${results.map(r => { const d = new Date(r.created_at + 9*3600000); const dStr = `${d.getUTCMonth()+1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}`; return html`<div class="h-item"><div class="h-date">${dStr}</div><div style="flex:1; display:flex; justify-content:space-around;"><span>Ping: ${r.ping} ms</span><span style="color:var(--primary); font-weight:bold;">DL: ${r.download} Mbps</span><span style="color:var(--success); font-weight:bold;">UL: ${r.upload} Mbps</span></div></div>`; })}
          </div>
        </div>
        <script>
          const btn = document.getElementById('btn-start'), msg = document.getElementById('status-msg'), vPing = document.getElementById('val-ping'), vDl = document.getElementById('val-dl'), vUl = document.getElementById('val-ul');
          btn.onclick = async () => {
            btn.disabled = true; btn.textContent = '計測中...'; vPing.innerHTML = '-- <span class="speed-unit">ms</span>'; vDl.innerHTML = '-- <span class="speed-unit">Mbps</span>'; vUl.innerHTML = '-- <span class="speed-unit">Mbps</span>';
            try {
              msg.textContent = 'Ping を計測中...'; let pings = []; for(let i=0; i<3; i++) { const st = performance.now(); await fetch('/api/speedtest/ping?t=' + st); pings.push(performance.now() - st); }
              const pingMs = Math.round(pings.reduce((a,b)=>a+b)/pings.length); vPing.innerHTML = pingMs + ' <span class="speed-unit">ms</span>';
              msg.textContent = 'Download を計測中...'; const dlStart = performance.now(); await (await fetch('/api/speedtest/download?t=' + dlStart)).arrayBuffer();
              const dlMbps = (40 / ((performance.now() - dlStart) / 1000)).toFixed(1); vDl.innerHTML = dlMbps + ' <span class="speed-unit">Mbps</span>';
              msg.textContent = 'Upload を計測中...'; const ulStart = performance.now(); await fetch('/api/speedtest/upload?t=' + ulStart, { method: 'POST', body: new Uint8Array(5 * 1024 * 1024) });
              const ulMbps = (40 / ((performance.now() - ulStart) / 1000)).toFixed(1); vUl.innerHTML = ulMbps + ' <span class="speed-unit">Mbps</span>';
              msg.textContent = '結果を保存中...'; await fetch('/api/speedtest/save', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ping: pingMs, dl: parseFloat(dlMbps), ul: parseFloat(ulMbps)}) });
              msg.textContent = '計測完了！'; setTimeout(() => location.reload(), 1500);
            } catch(e) { msg.textContent = 'エラーが発生しました'; }
            btn.disabled = false; btn.textContent = '計測スタート';
          };
        </script>
      </body></html>
    `);
  });
}