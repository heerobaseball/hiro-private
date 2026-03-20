import { html } from 'hono/html';

export function setupDiary(app) {
  app.get('/diary', async c => {
    const { results } = await c.env.DB.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
    return c.html(html`
      <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>Diary</title></head>
      <body style="font-family:sans-serif; background:#f8fafc; margin:0; padding:0;">
        <header style="display:flex; justify-content:space-between; padding:0.8rem 1.5rem; background:#fff; border-bottom:1px solid #e2e8f0;"><div style="font-size:1.2rem; font-weight:900;">Dashboard</div><div style="display:flex; gap:15px;"><a href="/" style="text-decoration:none; font-weight:600; color:#64748b;">Home</a><a href="/diary" style="text-decoration:none; font-weight:600; color:#3b82f6;">Diary</a><a href="/speedtest" style="text-decoration:none; font-weight:600; color:#64748b;">Speed</a><a href="#" target="_blank" style="text-decoration:none; font-weight:600; color:#10b981;">Chat App ↗</a></div></header>
        <div style="max-width:600px; margin:20px auto; padding:0 15px; display:flex; flex-direction:column; gap:15px;">
          <h2 style="margin-top:0;">全ての記録</h2>
          ${results.map(n => html`<div style="background:#fff; padding:15px; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span style="color:#64748b; font-size:0.9rem;">${new Date(n.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} ${n.location_name ? html`<span style="color:#3b82f6; font-weight:bold;">📍 ${n.location_name}</span>` : ''}</span><div style="display:flex; gap:10px;"><a href="/diary/edit/${n.id}" style="color:#3b82f6; text-decoration:none;">編集</a><form method="POST" action="/diary/delete" style="margin:0;"><input type="hidden" name="id" value="${n.id}"><button type="submit" style="background:none; border:none; color:#ef4444; text-decoration:underline; cursor:pointer; padding:0;">削除</button></form></div></div><p class="diary-text" style="margin:0; white-space:pre-wrap; line-height:1.5;">${n.content}</p>${n.image_url ? html`<img src="${n.image_url}" style="margin-top:10px; border-radius:8px; max-width:100%;">` : ''}</div>`)}
        </div>
        <script>
          document.querySelectorAll('.diary-text').forEach(el => {
            const t = el.textContent, r = /(https?:\\/\\/[^\\s]+)/g;
            if (r.test(t)) { el.innerHTML = t.replace(r, '<a href="$1" class="auto-link" target="_blank" style="color:#3b82f6;">$1</a>'); el.querySelectorAll('.auto-link').forEach(async a => { const u=a.href, c=document.createElement('a'); c.href=u; c.target="_blank"; c.style.cssText="display:flex;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:10px;text-decoration:none;color:#0f172a;background:#f8fafc;height:80px;"; c.innerHTML='<div style="padding:10px;font-size:0.8rem;color:#64748b;">🔗 読込中...</div>'; a.parentNode.insertBefore(c, a.nextSibling); try{ const res=await fetch('/api/ogp?url='+encodeURIComponent(u)), o=await res.json(); if(o.title) c.innerHTML=(o.image?'<img src="'+o.image+'" style="width:80px;height:100%;object-fit:cover;border-right:1px solid #e2e8f0;">':'<div style="width:80px;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:24px;">🔗</div>')+'<div style="padding:8px 10px;display:flex;flex-direction:column;justify-content:center;flex:1;overflow:hidden;"><div style="font-weight:bold;font-size:0.85rem;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+o.title+'</div><div style="font-size:0.75rem;color:#64748b;margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">'+(o.description||new URL(u).hostname)+'</div></div>'; else c.remove(); }catch(e){c.remove();} }); }
          });
        </script>
      </body></html>
    `);
  });
  
  app.post('/diary/delete', async c => { const b = await c.req.parseBody(); await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(b['id']).run(); return c.redirect(b['date'] ? '/?date=' + b['date'] : '/diary'); });
  app.get('/diary/edit/:id', async c => { const n = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(c.req.param('id')).first(); return c.html(html`<!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>編集</title></head><body style="font-family:sans-serif; background:#f8fafc; padding:20px;"><div style="max-width:600px; background:#fff; padding:20px; border-radius:12px;"><h2 style="margin-top:0;">編集</h2><form method="POST" action="/diary/edit/${n.id}" style="display:flex; flex-direction:column; gap:15px;"><textarea name="content" rows="6" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${n.content}</textarea><div style="display:flex; gap:10px;"><button type="submit" style="flex:1; padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold;">更新する</button><a href="/diary" style="padding:12px 20px; background:#e2e8f0; color:#0f172a; border-radius:8px; text-decoration:none; font-weight:bold;">キャンセル</a></div></form></div></body></html>`); });
  app.post('/diary/edit/:id', async c => { await c.env.DB.prepare('UPDATE notes SET content = ? WHERE id = ?').bind((await c.req.parseBody())['content'], c.req.param('id')).run(); return c.redirect('/diary'); });

  app.get('/diary/post', c => c.html(html`
    <!DOCTYPE html><html lang="ja"><head><meta name="viewport" content="width=device-width"><title>新規投稿</title></head>
    <body style="font-family:sans-serif; background:#f8fafc; padding:20px;">
      <a href="/" style="color:#3b82f6; text-decoration:none; font-weight:bold;">← ホーム</a>
      <div style="max-width:600px; background:#fff; padding:20px; border-radius:12px; margin-top:15px;">
        <h2 style="margin-top:0;">新規追加</h2>
        <form method="POST" action="/api/diary/post" enctype="multipart/form-data" style="display:flex; flex-direction:column; gap:15px;">
          <textarea name="content" rows="6" placeholder="いまどうしてる？" style="padding:10px; border-radius:8px; border:1px solid #e2e8f0; font-family:inherit;"></textarea>
          <input type="file" name="image" accept="image/*">
          <input type="hidden" name="lat" id="lat"><input type="hidden" name="lng" id="lng">
          <input type="hidden" name="location_name" id="location_name">
          <button type="submit" id="submit-btn" style="padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">保存する</button>
        </form>
        <div id="gs" style="font-size:0.8rem; color:#64748b; margin-top:15px; font-weight:bold;">📍 位置情報を取得中...</div>
      </div>
      
      <script>
        if(navigator.geolocation){
          navigator.geolocation.getCurrentPosition(async p=>{
            document.getElementById('lat').value=p.coords.latitude; document.getElementById('lng').value=p.coords.longitude;
            try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+p.coords.latitude+'&lon='+p.coords.longitude);const d=await r.json();
            if(d.address){const l=(d.address.province||'')+(d.address.city||d.address.town||d.address.village||'')+(d.address.suburb||d.address.quarter||'');if(l){document.getElementById('location_name').value=l;document.getElementById('gs').innerHTML='📍 <b>'+l+'</b> の位置情報を記録します';document.getElementById('gs').style.color='#3b82f6';return;}}}catch(e){}
            document.getElementById('gs').textContent='📍 現在地を記録します';document.getElementById('gs').style.color='#3b82f6';
          },()=>{document.getElementById('gs').textContent='⚠️ 位置情報取得失敗';},{enableHighAccuracy:true});
        }
        document.querySelector('form').addEventListener('submit', function() {
          document.getElementById('submit-btn').textContent = '保存中...';
          document.getElementById('submit-btn').disabled = true;
        });
      </script>
    </body></html>
  `));
}