(() => {
 const socket=window.jfSocialSocket;
 const style=document.createElement("style");
 style.textContent=`
 #jfSocialDialog[hidden],#jfAchievementsDialog[hidden]{display:none!important}
 .jf-social-overlay{position:fixed;inset:0;z-index:19000;background:#070a22bc;display:grid;place-items:center;padding:16px}
 .jf-social-dialog{background:var(--jf-panel,#202043);color:var(--ink,#fff);width:min(450px,100%);max-height:85dvh;overflow:auto;padding:20px;border:2px solid var(--jf-secondary,#777be9);border-radius:12px;box-shadow:0 12px 46px #0008}
 .jf-social-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}
 .jf-social-dialog header h2{margin:0;font-size:21px;color:var(--ink)}
 .jf-social-dialog form{display:grid;gap:9px}
 .jf-social-dialog input{width:100%;color:#172b4f;background:#f8fbff;padding:10px;border:1px solid var(--jf-secondary,#a3a8ff)}
 .jf-social-dialog label{margin:0;color:var(--ink);font-size:12px}
 .jf-social-dialog .jf-auth-feedback{color:var(--ink);font-family:inherit;font-size:14px;line-height:1.55;padding:10px 12px;border:1px solid var(--jf-secondary,currentColor);border-radius:8px;background:color-mix(in srgb,var(--jf-secondary,#777be9) 13%,transparent);overflow-wrap:anywhere}
 .jf-social-dialog .jf-auth-feedback:empty{display:none}
 .jf-social-dialog .jf-verified-copy{color:var(--ink);font-family:inherit;line-height:1.55}
 .jf-social-dialog .jf-verified-copy strong{color:inherit}
 .jf-social-dialog .jf-verified-title{color:var(--ink);font-family:inherit}
 .jf-social-dialog .jf-verified-headphones{font-size:50px;margin:0 0 10px}
 .jf-medal{width:54px;height:64px;display:grid;place-items:center;font-size:28px;background:radial-gradient(circle,#ffefa8,#dba83b 68%,#68441c 70%);border:3px ridge #a4741b;clip-path:polygon(15% 0,85% 0,85% 25%,100% 43%,84% 57%,79% 94%,50% 100%,21% 94%,16% 57%,0 43%,15% 25%);filter:drop-shadow(0 2px 2px #0005);flex:none}
 .jf-achievement-row{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid color-mix(in srgb,var(--jf-secondary,#999) 30%,transparent)}
 .jf-achievement-row.locked{opacity:.65}
 .jf-achievement-row strong{display:block;margin-bottom:4px}
 .jf-achievement-row p{margin:0 0 4px;font-size:12px;line-height:1.5}
 .jf-social-toast-stack{position:fixed;right:14px;bottom:84px;z-index:19001;display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:min(310px,calc(100vw - 28px));max-height:calc(100dvh - 100px);pointer-events:none}
 .jf-social-toast{box-sizing:border-box;width:100%;background:#52341f;color:#ffebbb;border:2px ridge #dca753;border-radius:10px;padding:10px 15px;box-shadow:0 5px 22px #0008;pointer-events:none;animation:jf-achievement-appear .28s ease-out both}
 @keyframes jf-achievement-appear{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
 @media(prefers-reduced-motion:reduce){.jf-social-toast{animation:none}}
 .jf-social-account-actions{display:flex;flex-direction:column;align-items:center;gap:10px;width:min(420px,100%);margin:0 auto}
 .jf-social-account-actions .jf-have-account{width:100%;text-align:center}
 .jf-have-account-link{border:0;background:transparent;color:var(--ink,#24466e);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;padding:8px}
 .jf-login-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;margin-top:8px}
 .jf-login-choice[hidden],.jf-have-account-link[hidden]{display:none!important}
 .jf-login-choice .btn{min-width:0!important;min-height:40px;width:100%}
 body:not(.jf-in-room) #jfGoogleLogin{width:min(420px,100%);max-width:420px}
 @media(max-width:520px){.jf-login-choice{grid-template-columns:1fr}}
 .jf-social-account-actions>.btn{min-width:0!important;width:100%;min-height:43px}
 .jf-wooden-ship{width:58px;height:64px;display:grid;place-items:center;flex:none;background:transparent;border:0;clip-path:none;filter:drop-shadow(0 3px 3px #0005)}
 .jf-wooden-ship svg{width:58px;height:58px;display:block}
 body:not(.jf-in-room) #jfRoomEntryPanel{max-width:680px;padding:24px 26px}
 body:not(.jf-in-room) .jf-entry-account{margin-top:18px;padding-top:19px;gap:12px}
 body:not(.jf-in-room) #jfEntryAccountHint{max-width:420px;line-height:1.5;font-size:13px;opacity:.9}
 body:not(.jf-in-room) #jfGoogleLogin{min-width:220px}
 body:not(.jf-in-room) #jfRoomEntryPanel>.status{margin-top:20px;padding:11px 13px;border-radius:9px;background:color-mix(in srgb,var(--jf-secondary,#73b8ff) 13%,transparent);border:1px solid color-mix(in srgb,var(--jf-secondary,#73b8ff) 32%,transparent)}
 body:not(.jf-in-room) #jfRoomEntryPanel>#roomCount,body:not(.jf-in-room) #jfRoomEntryPanel>#help{font-size:12px;line-height:1.5;margin:10px 0 0;opacity:.85}
 body:not(.jf-in-room) #jfRoomEntryPanel>#help{border-top:1px solid color-mix(in srgb,var(--jf-secondary,#73b8ff) 28%,transparent);padding-top:11px}
 html[data-jf-theme="classic"] body:not(.jf-in-room) #jfRoomEntryPanel #jfEntryAccountHint,
 html[data-jf-theme="classic"] body:not(.jf-in-room) #jfRoomEntryPanel #roomCount,
 html[data-jf-theme="classic"] body:not(.jf-in-room) #jfRoomEntryPanel #help{color:#24466e!important;text-shadow:none!important}
 @media(max-width:520px){body:not(.jf-in-room) #jfRoomEntryPanel{padding:18px 14px}.jf-social-account-actions{gap:7px}.jf-social-account-actions .btn{font-size:12px;padding:8px 4px}}

 .jf-community-top-dock{position:fixed;top:16px;left:20px;z-index:10016;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 40px)}
 .jf-community-top-dock .btn{margin:0!important;padding:8px 10px;font-size:12px;min-height:36px;box-shadow:0 3px 10px #0003;white-space:nowrap}
 @media(max-width:600px){.jf-community-top-dock{top:10px;left:10px;gap:5px}.jf-community-top-dock .btn{font-size:11px;padding:7px 8px}}
 `;
 document.head.appendChild(style);
 const entry=document.getElementById("jfEntryAccount");
 const actions=document.createElement("div");actions.className="jf-social-account-actions";
 actions.innerHTML='<button class="btn secondary" type="button" id="jfLocalRegisterOpen">Criar conta Junto.fm</button><div class="jf-have-account"><button class="jf-have-account-link" type="button" id="jfHaveAccountToggle" aria-expanded="false" aria-controls="jfLoginChoice">Já tem uma conta? Aperte aqui.</button><div class="jf-login-choice" id="jfLoginChoice" hidden><a class="btn secondary" href="/auth/google">Entrar com Google</a><button class="btn secondary" type="button" id="jfLocalLoginOpen">Entrar com e-mail</button></div></div><button class="btn secondary" type="button" id="jfAchievementsOpen">🏅 Conquistas</button>';
 if(entry)entry.appendChild(actions);
 else document.querySelector("main")?.appendChild(actions);
 const loginToggle=document.getElementById("jfHaveAccountToggle");
 const loginChoice=document.getElementById("jfLoginChoice");
 loginToggle.addEventListener("click",()=>{
  loginChoice.hidden=!loginChoice.hidden;
  loginToggle.setAttribute("aria-expanded",String(!loginChoice.hidden));
 });
 const dock=document.createElement("nav");dock.className="jf-community-top-dock";dock.setAttribute("aria-label","Ranking e conquistas");
 const rankButton=document.getElementById("jfOpenRank");
 const achievementsButton=document.getElementById("jfAchievementsOpen");
 if(rankButton)dock.append(rankButton);
 if(achievementsButton)dock.append(achievementsButton);
 // Mantém o dock fixo no desktop; em celular ele aparece abaixo da marca.
 (document.querySelector(".jf-topbar")||document.body).appendChild(dock);
 fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"}).then(r=>r.json()).then(data=>{
  const registered=Boolean(data.loggedIn);
  document.getElementById("jfLocalRegisterOpen").hidden=registered;
  loginToggle.hidden=registered;
  loginChoice.hidden=true;
  loginToggle.setAttribute("aria-expanded","false");
  if(new URLSearchParams(location.search).get("email_verified")==="1" && registered){
   const clean=new URL(location.href);clean.searchParams.delete("email_verified");
   history.replaceState(history.state,"",clean.pathname+clean.search+clean.hash);
   const popup=document.createElement("div");
   popup.className="jf-social-overlay";
   popup.innerHTML='<section class="jf-social-dialog" role="dialog" aria-modal="true" aria-labelledby="jfVerifiedTitle" style="text-align:center"><div class="jf-verified-headphones">🎧</div><h2 class="jf-verified-title" id="jfVerifiedTitle">E-mail confirmado!</h2><p class="jf-verified-copy">Sua conta está pronta e você já está conectado.</p><p class="jf-verified-copy"><strong>Agora coloque os fones e aproveite!</strong> 🎶</p><button class="btn" type="button" id="jfVerifiedContinue">Bora ouvir música!</button></section>';
   document.body.appendChild(popup);
   popup.querySelector("#jfVerifiedContinue").onclick=()=>popup.remove();
  }
 }).catch(()=>{});
 const $=id=>document.getElementById(id);
 const overlay=document.createElement("div");overlay.id="jfSocialDialog";overlay.className="jf-social-overlay";overlay.hidden=true;
 overlay.innerHTML='<section class="jf-social-dialog" role="dialog" aria-modal="true" aria-labelledby="jfLocalTitle"><header><h2 id="jfLocalTitle">Criar conta</h2><button type="button" class="btn secondary" id="jfLocalClose">✕</button></header><form id="jfLocalForm"><label for="jfLocalUsername" id="jfLocalUsernameLabel">Nome de usuário único (@)</label><input id="jfLocalUsername" type="text" autocomplete="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]{3,20}" placeholder="seu_usuario" required><label for="jfLocalEmail">E-mail</label><input id="jfLocalEmail" type="email" autocomplete="email" required maxlength="254"><label for="jfLocalPassword">Senha (mínimo de 8 caracteres)</label><input id="jfLocalPassword" type="password" autocomplete="new-password" minlength="8" maxlength="256" required><button class="btn" type="submit" id="jfLocalSubmit">Criar conta</button><p id="jfLocalMessage" class="jf-auth-feedback" role="status" aria-live="polite"></p></form></section>';
 document.body.appendChild(overlay);
 const achievements=document.createElement("div");achievements.id="jfAchievementsDialog";achievements.className="jf-social-overlay";achievements.hidden=true;
 achievements.innerHTML='<section class="jf-social-dialog" role="dialog" aria-modal="true" aria-labelledby="jfAchievementsTitle"><header><h2 id="jfAchievementsTitle">🏅 Conquistas</h2><button type="button" class="btn secondary" id="jfAchievementsClose">✕</button></header><p class="small">Conquistas desbloqueadas ficam salvas na sua conta. As porcentagens mostram quantos usuários cadastrados conseguiram cada medalha.</p><div id="jfAchievementsList">Carregando...</div></section>';
 document.body.appendChild(achievements);
 let register=true;
 function showAuth(create){register=create;$("jfLocalUsername").hidden=!create;$("jfLocalUsername").required=create;$("jfLocalUsernameLabel").hidden=!create;$("jfLocalTitle").textContent=create?"Criar conta Junto.fm":"Entrar na Junto.fm";$("jfLocalSubmit").textContent=create?"Criar conta":"Entrar";$("jfLocalPassword").setAttribute("autocomplete",create?"new-password":"current-password");$("jfLocalMessage").textContent="";overlay.hidden=false;$("jfLocalEmail").focus()}
 $("jfLocalRegisterOpen").onclick=()=>showAuth(true);
 $("jfLocalLoginOpen").onclick=()=>showAuth(false);
 $("jfLocalClose").onclick=()=>overlay.hidden=true;
 overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};
 $("jfLocalForm").onsubmit=async e=>{
  e.preventDefault();
  const button=$("jfLocalSubmit");button.disabled=true;$("jfLocalMessage").textContent="Verificando...";
  try{
   const response=await fetch(register?"/api/account/register":"/api/account/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("jfLocalUsername").value,email:$("jfLocalEmail").value,password:$("jfLocalPassword").value})});
   const body=await response.json();if(!response.ok)throw Error(body.error||"Falha ao autenticar.");
   if(body.verificationPending){$("jfLocalMessage").textContent=body.message||"Confira seu e-mail para confirmar a conta.";button.disabled=false;return;}
   location.reload();
  }catch(err){$("jfLocalMessage").textContent=err.message;}finally{button.disabled=false}
 };
 async function openAchievements(){
  achievements.hidden=false;const list=$("jfAchievementsList");list.textContent="Carregando...";
  try{
   const response=await fetch("/api/achievements",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw Error("Conquistas indisponíveis.");
   const data=await response.json();list.replaceChildren();
   if(!data.configured){list.textContent="Conquistas indisponíveis sem banco de dados.";return;}
   for(const item of data.achievements){
    const row=document.createElement("div");row.className="jf-achievement-row"+(item.unlocked?"":" locked");
    const medal=document.createElement("div");
    if(item.id==="welcome"){
      medal.className="jf-wooden-ship";
      const ship=document.querySelector("#jfWelcomeToast svg");
      if(ship)medal.appendChild(ship.cloneNode(true));
      else medal.textContent="⛵";
    }else{medal.className="jf-medal";medal.textContent=item.symbol||"🏅";}

    const details=document.createElement("div"),title=document.createElement("strong"),description=document.createElement("p"),percent=document.createElement("small");
    title.textContent=item.title+(item.unlocked?" ✓":" 🔒");
    description.textContent=item.description;
     if(typeof item.target==="number"&&!item.unlocked){
       const isTime=["listen1","listen10","listen50","listen100","dj10","dance_hour"].includes(item.id);
       const display=n=>isTime?(Math.round(n/36)/100).toLocaleString("pt-BR",{maximumFractionDigits:2})+" h":String(n);
       description.textContent+=" • Progresso: "+display(item.progress||0)+" / "+display(item.target);
     }
     percent.textContent=item.percent+"% dos usuários cadastrados desbloquearam";
    details.append(title,description,percent);row.append(medal,details);list.appendChild(row);
   }
  }catch(err){list.textContent=err.message}
 }
 $("jfAchievementsOpen").onclick=openAchievements;

 $("jfAchievementsClose").onclick=()=>achievements.hidden=true;
 achievements.onclick=e=>{if(e.target===achievements)achievements.hidden=true};
 // O visitante pode ver a lista, mas somente contas autenticadas desbloqueiam.
 const visited=new Set();
 document.addEventListener("click",event=>{
  const button=event.target.closest("button");
  if(!button)return;
  const id=button.id;
  let kind=null;
  if(id==="jfClubTomato")kind="tomato";
  else if(id==="jfChatLauncher")kind="chat";
  else if(id==="jfChatEmojiToggle"||button.classList.contains("jf-chat-emoji"))kind="emojis";
  else if(id==="jfFriendsLauncher")kind="friends";
  else if(id==="jfSkipVote")kind="skip";
  if(kind&&!visited.has(kind)){visited.add(kind);socket?.emit("achievement-interaction",{button:kind})}
 },true);
 socket?.on("joined-room",()=>visited.clear());
 // Som de conquista; ignora bloqueios de autoplay sem quebrar o aviso.
  const achievementSound=new Audio("/achievement-unlock.mp3");
  achievementSound.preload="auto";
  achievementSound.volume=0.55;
  // Somente conquistas desbloqueadas recentemente ficam na pilha.
  // Anima o deslocamento dos avisos existentes quando chega um novo.
  const achievementToastStack=document.createElement("div");
  achievementToastStack.className="jf-social-toast-stack";
  achievementToastStack.setAttribute("aria-live","polite");
  achievementToastStack.setAttribute("aria-relevant","additions");
  document.body.appendChild(achievementToastStack);
  function stackAchievementToast(toast){
   const previous=[...achievementToastStack.children];
   const positions=new Map(previous.map(el=>[el,el.getBoundingClientRect().top]));
   achievementToastStack.appendChild(toast);
   for(const el of previous){
    const offset=positions.get(el)-el.getBoundingClientRect().top;
    if(Math.abs(offset)>1&&typeof el.animate==="function"&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
     el.animate([{transform:"translateY("+offset+"px)"},{transform:"translateY(0)"}],{duration:260,easing:"ease-out"});
    }
   }
   setTimeout(()=>toast.remove(),6000);
  }
  socket?.on("achievement-unlocked",data=>{
   try{
    achievementSound.pause();
    achievementSound.currentTime=0;
    const playing=achievementSound.play();
    if(playing&&typeof playing.catch==="function")playing.catch(()=>{});
   }catch(_){}
  const names={"welcome":"Bem-vindo a bordo","listen1":"Só mais uma música","listen10":"Uno mas...","listen50":"To fritando","listen100":"AYYY!","firstdj":"Solta o som","dj10":"Respeita o DJ","firstroom":"Cada macaco no seu galho","planet":"Planeta Macaco","nomad":"Nomade","friend1":"Macaco amigo","friend10":"Bando formado","firstchat":"Sinais de evolucao","days7":"Emocionado","streak7":"Ponto marcado","banana1":"Agindo como tal","banana_mvp":"MVP","banana100":"Fornecedor da feira","tomato1":"Na cara nao","tomato50":"Desperdicio...","dance1":"Dança gatinhe...","dance_hour":"Nao ta puro","dance_all":"Molejo","outfit1":"Feio arrumado","outfit_all":"Exagerado"};
  const toast=document.createElement("div");toast.className="jf-social-toast";
  if(data.id==="welcome"){
   toast.style.display="flex";toast.style.alignItems="center";toast.style.gap="10px";
   const ship=document.querySelector("#jfWelcomeToast svg");
   if(ship){const icon=ship.cloneNode(true);icon.style.width="42px";icon.style.height="42px";toast.appendChild(icon);}
  }
  const label=document.createElement("span");label.textContent="🏆 Conquista desbloqueada: "+(names[data.id]||data.id);toast.appendChild(label);
  stackAchievementToast(toast);
 });
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){overlay.hidden=true;achievements.hidden=true}});
})();
