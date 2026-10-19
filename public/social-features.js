(() => {
  const socket=window.jfSocialSocket;
  if(!socket)return;
  const style=document.createElement("style");
  style.textContent=`
  .jf-social-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px;margin:10px 0;border:1px solid var(--jf-secondary,#8a8de6);border-radius:10px;background:color-mix(in srgb,var(--jf-primary,#6966b6) 13%,transparent)}
  .jf-social-actions .btn{padding:8px 12px;font-size:12px}
  .jf-barrel-box{display:flex;align-items:center;gap:9px}
  .jf-barrel-visual{width:66px;height:64px;object-fit:contain;display:block}
  .jf-barrel-fallback{font-size:42px;line-height:1}
  .jf-barrel-meter{width:105px;height:8px;appearance:none;accent-color:#eacb61}
  .jf-banana-drop{position:fixed;z-index:15000;pointer-events:none;font-size:36px;filter:drop-shadow(0 3px 2px #0005)}
  .jf-social-count{font-size:11px;font-weight:bold;color:var(--ink);display:block}
  .jf-social-actions button:disabled{opacity:.48;cursor:not-allowed}
  `;
  document.head.appendChild(style);
  const player=document.querySelector(".jf-player-panel .track-card");
  if(!player)return;
  const wrap=document.createElement("div");
  wrap.className="jf-social-actions";
  wrap.innerHTML='<button class="btn secondary" type="button" id="jfSkipVote">⏭ Pular música</button><span class="jf-social-count" id="jfSkipProgress">0/2 votos</span><div class="jf-barrel-box"><button type="button" class="btn secondary" id="jfThrowBanana" aria-label="Gostei da música: jogar banana">🍌</button><div id="jfBananaTarget" style="text-align:center"><img id="jfBananaBarrelArt" class="jf-barrel-visual" alt="Barril de bananas" hidden><span id="jfBananaFallback" class="jf-barrel-fallback">🛢️</span><progress id="jfBananaProgress" class="jf-barrel-meter" max="20" value="0"></progress><span id="jfBananaTotal" class="jf-social-count">0 / 20 🍌</span></div></div><span id="jfBananaCelebrate" class="jf-social-count" hidden>🐒 Barril cheio! Um macaquinho está a caminho.</span>';
  player.insertAdjacentElement("afterend",wrap);
  const $=id=>document.getElementById(id);
  let joined=false,room="",count=0,approved=false,skipKey="";
  function setBananas(n){
    count=Math.min(20,Math.max(0,Number(n)||0));
    $("jfBananaProgress").value=count;
    $("jfBananaTotal").textContent=count+" / 20 🍌";
    $("jfThrowBanana").disabled=!joined||count>=20;
    $("jfBananaCelebrate").hidden=count<20;
    const filename=count>=20?"barrel-full.png":count>=10?"barrel-half.png":"barrel-empty.png";
    const img=$("jfBananaBarrelArt");
    img.hidden=true;$("jfBananaFallback").hidden=false;
    img.onload=()=>{img.hidden=false;$("jfBananaFallback").hidden=true};
    img.onerror=()=>{img.hidden=true;$("jfBananaFallback").hidden=false};
    img.src="/banana/"+filename;
  }
  function fallingBanana(){
    const rect=$("jfBananaTarget").getBoundingClientRect();
    const el=document.createElement("span");el.className="jf-banana-drop";el.textContent="🍌";
    const x=rect.left+rect.width/2-18,y=rect.top-95;
    el.style.left=x+"px";el.style.top=y+"px";
    document.body.appendChild(el);
    const dest=rect.top+rect.height*.18-y;
    el.animate([{transform:"translateY(0) scale(1)",opacity:1},{transform:"translateY("+dest*.7+"px) scale(.9)",opacity:1,offset:.7},{transform:"translateY("+dest+"px) scale(.5)",opacity:0}],{duration:820,easing:"ease-in",fill:"forwards"}).finished.catch(()=>{}).finally(()=>el.remove());
  }
  $("jfThrowBanana").addEventListener("click",()=>{if(joined&&count<20)socket.emit("banana-throw")});
  $("jfSkipVote").addEventListener("click",()=>{if(joined&&!approved)socket.emit("skip-vote")});
  socket.on("joined-room",data=>{joined=true;room=data.room;setBananas(data.bananaCount||0);$("jfSkipVote").disabled=false;});
  socket.on("banana-thrown",data=>{if(!joined||data.room!==room)return;fallingBanana();setBananas(data.count)});
  socket.on("skip-state",data=>{
    const votes=Number(data.votes)||0,required=Number(data.required)||2;
    approved=Boolean(data.approved);
    $("jfSkipProgress").textContent=approved?"✓ Skip aprovado":votes+"/"+required+" votos";
    $("jfSkipVote").disabled=!joined||approved;
  });
  socket.on("skip-approved",async({ticket,room:approvedRoom})=>{
    // Apenas o transmissor possui a sessão Spotify utilizada neste pedido.
    const transmitting=window.jfSocialTransmitting?.();
    if(!transmitting)return;
    try{
      const r=await fetch("/api/spotify/skip",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket,room:approvedRoom})});
      if(!r.ok)throw Error("Não foi possível pular a música pelo Spotify.");
    }catch(e){console.warn("Junto.fm skip:",e)}
  });
  socket.on("skip-error",data=>{$("jfSkipProgress").textContent=data.message||"Skip indisponível"});
  function left(){joined=false;room="";approved=false;setBananas(0);$("jfSkipVote").disabled=true;$("jfSkipProgress").textContent="0/2 votos"}
  socket.on("left-room",left);socket.on("disconnect",left);
  left();
})();
