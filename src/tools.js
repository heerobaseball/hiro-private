import { html, raw } from 'hono/html';

export function setupTools(app) {
  // --- プライベートチャット ---
  app.get('/chat', async c => {
    await c.env.DB.prepare('DELETE FROM private_chats WHERE timestamp < ?').bind(Date.now() - (365*24*60*60*1000)).run();
    const arc = await c.env.DB.prepare('SELECT * FROM private_chats ORDER BY timestamp ASC LIMIT 200').all();
    return c.html(html`
  <!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Chat</title>
  <style>
    :root{--bg:#8bb7ea;--txt:#0f172a;--pri:#3b82f6;} body{margin:0;background:var(--bg);color:var(--txt);font-family:sans-serif;display:flex;flex-direction:column;height:100vh;}
    .navbar{display:flex;justify-content:space-between;align-items:center;background:#fff;padding:0.8rem 1.5rem;border-bottom:1px solid #e2e8f0;flex-shrink:0;} .nav-brand{font-size:1.2rem;font-weight:900;} .nav-links{display:flex;gap:15px;} .nav-links a{text-decoration:none;font-weight:600;color:#64748b;} .nav-links a.active{color:var(--pri);}
    .msgs{flex-grow:1;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:12px;max-width:800px;margin:0 auto;width:100%;}
    .wrap{display:flex;align-items:flex-end;width:100%;} .wrap.me{flex-direction:row-reverse;} .wrap.other{flex-direction:row;}
    .cnt{max-width:75%;display:flex;flex-direction:column;} .wrap.me .cnt{align-items:flex-end;} .wrap.other .cnt{align-items:flex-start;}
    .nm{font-size:11px;color:#4b5563;margin-bottom:2px;margin-left:5px;} .bub{padding:10px 14px;font-size:15px;line-height:1.4;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,0.1);} .bg-me{background:#8ce245;border-radius:16px 16px 0 16px;} .bg-other{background:#fff;border-radius:16px 16px 16px 0;}
    .tm{font-size:10px;color:#4b5563;margin:0 5px 2px;} .inp-area{display:flex;padding:10px 15px;background:#fff;border-top:1px solid #e2e8f0;gap:8px;max-width:800px;margin:0 auto;width:100%;box-sizing:border-box;}
    .inp{flex-grow:1;padding:12px;border:1px solid #cbd5e1;border-radius:20px;font-size:16px;outline:none;background:#f8fafc;resize:none;max-height:100px;font-family:inherit;} .btn{background:var(--pri);color:white;border:none;border-radius:20px;padding:0 20px;font-weight:bold;height:44px;}
  </style></head><body>
    <header class="navbar"><div class="nav-brand">Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/chat" class="active">Chat</a><a href="/call">Call</a><a href="/speedtest">Speed</a></div></header>
    <div id="msgs" class="msgs"><div style="text-align:center;color:#4b5563;font-size:12px;margin:20px 0 10px;">🔒 暗号化チャット</div></div>
    <form id="frm" class="inp-area"><textarea id="inp" class="inp" placeholder="メッセージ..."></textarea><button type="submit" class="btn" id="btn">送信</button></form>
    <script type="module">
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
      import { getDatabase, ref, push, onChildAdded, serverTimestamp, get, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
      const app = initializeApp({ apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0", authDomain: "private-chat-54723.firebaseapp.com", projectId: "private-chat-54723", storageBucket: "private-chat-54723.firebasestorage.app", messagingSenderId: "683142642820", appId: "1:683142642820:web:b59761f61548ad321d96d1", databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app" });
      const db = getDatabase(app), mRef = ref(db, 'messages'); let myN = localStorage.getItem('chat_name') || prompt("名前を入力") || "ゲスト"; localStorage.setItem('chat_name', myN);
      const mDiv = document.getElementById('msgs'), inp = document.getElementById('inp'), frm = document.getElementById('frm');
      inp.addEventListener('input', function(){ this.style.height='auto'; this.style.height=(this.scrollHeight<100?this.scrollHeight:100)+'px'; });
      function render(d) { const isM = d.sender===myN; let t=""; if(d.timestamp){ const dt=new Date(d.timestamp); t=(dt.getMonth()+1)+'/'+dt.getDate()+' '+dt.getHours()+':'+String(dt.getMinutes()).padStart(2,'0'); } const w=document.createElement('div'); w.className='wrap '+(isM?'me':'other'); w.innerHTML=\`<div class="cnt">\${!isM?\`<div class="nm">\${d.sender}</div>\`:-''}<div class="bub \${isM?'bg-me':'bg-other'}">\${d.text.replace(/\\n/g,'<br>')}</div></div><div class="tm">\${t}</div>\`; mDiv.appendChild(w); mDiv.scrollTop=mDiv.scrollHeight; }
      ${raw(JSON.stringify(arc.results))}.forEach(render);
      const tDA = Date.now() - (3*24*60*60*1000);
      get(mRef).then(async s=>{ const d=s.val(); if(d){ const arr=[]; for(const k in d) if(d[k].timestamp < tDA) arr.push({id:k,...d[k]}); if(arr.length>0){ try{await fetch('/api/chat/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:arr})}); arr.forEach(m=>remove(ref(db,'messages/'+m.id)));}catch(e){} } } });
      onChildAdded(mRef, s=>{ const d=s.val(); if(d.timestamp>=tDA) render(d); });
      frm.addEventListener('submit', async e=>{ e.preventDefault(); const t=inp.value.trim(); if(!t)return; inp.value=''; inp.style.height='auto'; document.getElementById('btn').disabled=true; try{await push(mRef,{sender:myN,text:t,timestamp:serverTimestamp()});}catch(er){} document.getElementById('btn').disabled=false; inp.focus(); });
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();frm.dispatchEvent(new Event('submit'));} });
    </script>
  </body></html>
    `);
  });

  // --- 音声通話 ---
  app.get('/call', c => {
    return c.html(html`
      <!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><meta name="theme-color" content="#1e293b"><title>Voice Call</title>
      <style>
        :root{--bg:#1e293b;--txt:#f8fafc;--pri:#3b82f6;--dng:#ef4444;--suc:#10b981;} body{margin:0;background:var(--bg);color:var(--txt);font-family:sans-serif;display:flex;flex-direction:column;height:100vh;}
        .navbar{display:flex;justify-content:space-between;align-items:center;background:#0f172a;padding:0.8rem 1.5rem;border-bottom:1px solid #334155;flex-shrink:0;} .nav-brand{font-size:1.2rem;font-weight:900;} .nav-links{display:flex;gap:15px;} .nav-links a{text-decoration:none;font-weight:600;color:#94a3b8;} .nav-links a.active{color:var(--pri);}
        .c-cnt{flex-grow:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:20px;text-align:center;}
        .avt{width:120px;height:120px;background:#334155;border-radius:50%;display:flex;justify-content:center;align-items:center;font-size:3rem;margin-bottom:20px;box-shadow:0 4px 15px rgba(0,0,0,0.3);transition:transform 0.2s;} .avt.act{background:var(--suc);transform:scale(1.1);animation:pls 2s infinite;}
        @keyframes pls{0%{box-shadow:0 0 0 0 rgba(16,185,129,0.7);}70%{box-shadow:0 0 0 20px rgba(16,185,129,0);}100%{box-shadow:0 0 0 0 rgba(16,185,129,0);}}
        .ctrls{display:flex;gap:15px;justify-content:center;flex-wrap:wrap;margin-top:40px;} .btn{padding:15px 30px;border:none;border-radius:30px;font-weight:bold;font-size:18px;cursor:pointer;color:white;transition:0.2s;box-shadow:0 4px 6px rgba(0,0,0,0.2);} .btn:active{transform:scale(0.95);} .btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;box-shadow:none;} .b-call{background:var(--suc);} .b-ans{background:var(--pri);} .b-hang{background:var(--dng);} .b-rec{background:#f59e0b;} #st{font-size:18px;color:#cbd5e1;font-weight:bold;margin-bottom:10px;height:24px;}
      </style></head><body>
        <header class="navbar"><div class="nav-brand">Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/chat">Chat</a><a href="/call" class="active">Call</a><a href="/speedtest">Speed</a></div></header>
        <div class="c-cnt"><div id="avt" class="avt">📞</div><div id="st">待機中... マイクを許可してください</div><audio id="rAud" autoplay playsinline></audio><div class="ctrls"><button id="b-call" class="btn b-call" disabled>発信</button><button id="b-ans" class="btn b-ans" style="display:none;">応答する</button><button id="b-hang" class="btn b-hang" disabled>切断</button><button id="b-rec" class="btn b-rec" disabled>録音開始</button></div></div>
        <script type="module">
          import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"; import { getDatabase, ref, set, get, onValue, push, remove, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
          const db = getDatabase(initializeApp({ apiKey: "AIzaSyBy5eQzR6Uufiy-aD8KEBOt8hO59UmWVP0", authDomain: "private-chat-54723.firebaseapp.com", projectId: "private-chat-54723", databaseURL: "https://private-chat-54723-default-rtdb.asia-southeast1.firebasedatabase.app" }));
          const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] }); let lStr=null, rStr=null, mRec, recCh=[];
          const rAud=document.getElementById('rAud'), avt=document.getElementById('avt'), bC=document.getElementById('b-call'), bA=document.getElementById('b-ans'), bH=document.getElementById('b-hang'), bR=document.getElementById('b-rec'), st=document.getElementById('st'), cDoc=ref(db,'calls/private_room'), oRef=ref(db,'calls/private_room/offerCandidates'), aRef=ref(db,'calls/private_room/answerCandidates');
          async function setup(){ try{ lStr=await navigator.mediaDevices.getUserMedia({video:false,audio:true}); lStr.getTracks().forEach(t=>pc.addTrack(t,lStr)); st.textContent='準備完了: 発信してください'; bC.disabled=false; onValue(cDoc, s=>{ const d=s.val(); if(d&&d.offer&&!pc.currentRemoteDescription){bC.style.display='none'; bA.style.display='block'; st.textContent='📞 着信があります！'; avt.style.background='var(--pri)';} }); }catch(e){st.textContent='マイクの許可が必要です';} }
          pc.ontrack=e=>{ rStr=e.streams[0]; if(rAud.srcObject!==rStr) rAud.srcObject=rStr; rAud.play().catch(()=>st.textContent='音声再生エラー: 画面をタップ'); bR.disabled=false; };
          function actUI(){ st.textContent='通話中 🟢'; avt.classList.add('act'); avt.textContent='🗣️'; }
          bC.onclick=async()=>{ st.textContent='発信中...'; bC.disabled=true; bH.disabled=false; await remove(cDoc); pc.onicecandidate=e=>{if(e.candidate)push(oRef,e.candidate.toJSON());}; const o=await pc.createOffer(); await pc.setLocalDescription(o); await set(ref(db,'calls/private_room/offer'),{sdp:o.sdp,type:o.type}); onValue(ref(db,'calls/private_room/answer'),s=>{ const a=s.val(); if(a&&!pc.currentRemoteDescription){pc.setRemoteDescription(new RTCSessionDescription(a)); actUI();} }); onChildAdded(aRef, d=>pc.addIceCandidate(new RTCIceCandidate(d.val()))); };
          bA.onclick=async()=>{ st.textContent='接続中...'; bA.disabled=true; bH.disabled=false; pc.onicecandidate=e=>{if(e.candidate)push(aRef,e.candidate.toJSON());}; const cD=(await get(cDoc)).val(); await pc.setRemoteDescription(new RTCSessionDescription(cD.offer)); const a=await pc.createAnswer(); await pc.setLocalDescription(a); await set(ref(db,'calls/private_room/answer'),{type:a.type,sdp:a.sdp}); onChildAdded(oRef, d=>pc.addIceCandidate(new RTCIceCandidate(d.val()))); actUI(); };
          bH.onclick=async()=>{ pc.close(); await remove(cDoc); location.reload(); };
          bR.onclick=()=>{ if(mRec&&mRec.state==='recording'){ mRec.stop(); bR.textContent='録音開始'; bR.style.background='#f59e0b'; st.textContent='録音を保存しました'; }else{ recCh=[]; mRec=new MediaRecorder(rStr,{mimeType:'audio/webm'}); mRec.ondataavailable=e=>{if(e.data.size>0)recCh.push(e.data);}; mRec.onstop=()=>{ const b=new Blob(recCh,{type:'audio/webm'}), u=URL.createObjectURL(b), a=document.createElement('a'); a.style.display='none'; a.href=u; a.download='voice_'+Date.now()+'.webm'; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(u); }; mRec.start(); bR.textContent='⏹️ 録音停止＆保存'; bR.style.background='var(--dng)'; st.textContent='🔴 通話を録音中...'; } };
          setup();
        </script>
      </body></html>
    `);
  });

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
        <header class="navbar"><div class="nav-brand">Dashboard</div><div class="nav-links"><a href="/">Home</a><a href="/diary">Diary</a><a href="/chat">Chat</a><a href="/call">Call</a><a href="/speedtest" class="active">Speed</a></div></header>
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