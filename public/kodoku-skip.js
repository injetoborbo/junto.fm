(()=>{"use strict";
  const socket=window.jfSocialSocket;
  if(!socket)return;
  const host=document.querySelector(".jf-player-panel");
  if(!host)return;
  const bar=document.createElement("div");
  bar.className="jf-kodoku-skip-bar";
  bar.innerHTML='<button id="jfSkipVote" type="button" class="btn secondary" disabled>⏭ Votar para pular</button><span id="jfSkipProgress" class="small" role="status">Disponível durante a música</span>';
  host.appendChild(bar);
  const button=bar.querySelector("#jfSkipVote");
  const progress=bar.querySelector("#jfSkipProgress");
  const style=document.createElement("style");
  style.textContent=".jf-kodoku-skip-bar{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:9px auto;padding:6px}.jf-kodoku-skip-bar .btn{font-size:12px;padding:7px 10px}";
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
