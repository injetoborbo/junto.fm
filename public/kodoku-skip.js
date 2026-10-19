(()=>{"use strict";
  const socket=window.jfSocialSocket;
  if(!socket)return;
  const host=document.querySelector(".jf-track-info");
  if(!host)return;
  const bar=document.createElement("div");
  bar.className="jf-kodoku-skip-bar";
  bar.innerHTML='<button id="jfSkipVote" type="button" class="btn secondary" disabled aria-label="Pedir para pular esta música">⏭️ Pedir skip</button><span id="jfSkipProgress" class="small" role="status">Disponível durante a música</span>';
  (host.querySelector(".track-times")||host).after(bar);
  const button=bar.querySelector("#jfSkipVote");
  const progress=bar.querySelector("#jfSkipProgress");
  const style=document.createElement("style");
  style.textContent=".jf-kodoku-skip-bar{display:flex;align-items:center;justify-content:flex-start;gap:9px;flex-wrap:wrap;margin:9px 0 0;padding:0;max-width:100%;min-width:0}.jf-kodoku-skip-bar .btn{font:inherit;font-size:12px;font-weight:700;padding:6px 12px;min-height:34px;flex:0 0 auto;white-space:nowrap}.jf-kodoku-skip-bar .small{font-size:11px;flex:1 1 70px;min-width:0;color:var(--muted,#b9bee9)}@media(max-width:520px){.jf-kodoku-skip-bar{gap:6px}.jf-kodoku-skip-bar .btn{min-height:31px;padding:5px 9px;font-size:11px}}";
  document.head.appendChild(style);
  let joined=false,approved=false,voted=false,room="";
  button.addEventListener("click",()=>{if(!joined||voted||approved)return;voted=true;button.disabled=true;socket.emit("skip-vote");});
  socket.on("joined-room",data=>{joined=true;room=data.room;voted=false;approved=false;button.disabled=false;progress.textContent="Votação disponível";});
  socket.on("skip-state",data=>{
    approved=Boolean(data.approved);
    progress.textContent=approved?"Votação aprovada":(data.votes+" / "+data.required+" votos");
    button.disabled=!joined||voted||approved;
  });
  socket.on("skip-error",data=>{progress.textContent=data?.message||"Votação indisponível";voted=false;button.disabled=!joined;});
  socket.on("skip-approved",async data=>{
    if(!window.jfSocialTransmitting?.()||!data?.ticket||data.room!==room)return;
    try{
      const response=await fetch("/api/spotify/skip",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket:data.ticket,room:data.room})});
      if(!response.ok)throw Error("Spotify não autorizou pular a faixa.");
      progress.textContent="Música pulada!";
    }catch(error){progress.textContent=error.message;}
  });
  socket.on("track-update",()=>{voted=false;approved=false;button.disabled=!joined;});
  function leave(){joined=false;room="";voted=false;approved=false;button.disabled=true;progress.textContent="Entre em uma sala para votar";}
  socket.on("left-room",leave);socket.on("disconnect",leave);
  leave();
})();
