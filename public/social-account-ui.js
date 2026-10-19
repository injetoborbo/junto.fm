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
 .jf-medal{width:54px;height:64px;display:grid;place-items:center;font-size:28px;background:radial-gradient(circle,#ffefa8,#dba83b 68%,#68441c 70%);border:3px ridge #a4741b;clip-path:polygon(15% 0,85% 0,85% 25%,100% 43%,84% 57%,79% 94%,50% 100%,21% 94%,16% 57%,0 43%,15% 25%);filter:drop-shadow(0 2px 2px #0005);flex:none}
 .jf-achievement-row{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid color-mix(in srgb,var(--jf-secondary,#999) 30%,transparent)}
 .jf-achievement-row.locked{opacity:.65}
 .jf-achievement-row strong{display:block;margin-bottom:4px}
 .jf-achievement-row p{margin:0 0 4px;font-size:12px;line-height:1.5}
 .jf-social-toast{position:fixed;right:14px;bottom:84px;z-index:19001;background:#52341f;color:#ffebbb;border:2px ridge #dca753;border-radius:10px;padding:10px 15px;max-width:310px;box-shadow:0 5px 22px #0008}
 .jf-social-account-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}
 .jf-community-top-dock{position:fixed;top:16px;left:20px;z-index:10016;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 40px)}
 .jf-community-top-dock .btn{margin:0!important;padding:8px 10px;font-size:12px;min-height:36px;box-shadow:0 3px 10px #0003;white-space:nowrap}
 @media(max-width:600px){.jf-community-top-dock{top:10px;left:10px;gap:5px}.jf-community-top-dock .btn{font-size:11px;padding:7px 8px}}
 `;
 document.head.appendChild(style);
 const entry=document.getElementById("jfEntryAccount");
 const actions=document.createElement("div");actions.className="jf-social-account-actions";
 actions.innerHTML='<button class="btn secondary" type="button" id="jfLocalRegisterOpen">Criar conta Junto.fm</button><button class="btn secondary" type="button" id="jfLocalLoginOpen">Entrar com e-mail</button><button class="btn secondary" type="button" id="jfAchievementsOpen">🏅 Conquistas</button>';
 if(entry)entry.appendChild(actions);
 else document.querySelector("main")?.appendChild(actions);
 const dock=document.createElement("nav");dock.className="jf-community-top-dock";dock.setAttribute("aria-label","Ranking e conquistas");
 const rankButton=document.getElementById("jfOpenRank");
 const achievementsButton=document.getElementById("jfAchievementsOpen");
 if(rankButton)dock.append(rankButton);
 if(achievementsButton)dock.append(achievementsButton);
 document.body.appendChild(dock);
 fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"}).then(r=>r.json()).then(data=>{
  const registered=Boolean(data.loggedIn);
  document.getElementById("jfLocalRegisterOpen").hidden=registered;
  document.getElementById("jfLocalLoginOpen").hidden=registered;
 }).catch(()=>{});
 const $=id=>document.getElementById(id);
 const overlay=document.createElement("div");overlay.id="jfSocialDialog";overlay.className="jf-social-overlay";overlay.hidden=true;
 overlay.innerHTML='<section class="jf-social-dialog" role="dialog" aria-modal="true" aria-labelledby="jfLocalTitle"><header><h2 id="jfLocalTitle">Criar conta</h2><button type="button" class="btn secondary" id="jfLocalClose">✕</button></header><form id="jfLocalForm"><label for="jfLocalUsername" id="jfLocalUsernameLabel">Nome de usuário único (@)</label><input id="jfLocalUsername" type="text" autocomplete="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]{3,20}" placeholder="seu_usuario" required><label for="jfLocalEmail">E-mail</label><input id="jfLocalEmail" type="email" autocomplete="email" required maxlength="254"><label for="jfLocalPassword">Senha (mínimo de 8 caracteres)</label><input id="jfLocalPassword" type="password" autocomplete="new-password" minlength="8" maxlength="256" required><button class="btn" type="submit" id="jfLocalSubmit">Criar conta</button><p id="jfLocalMessage" role="status"></p></form></section>';
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
    const medal=document.createElement("div");medal.className="jf-medal";medal.textContent="🍌";
    const details=document.createElement("div"),title=document.createElement("strong"),description=document.createElement("p"),percent=document.createElement("small");
    title.textContent=item.title+(item.unlocked?" ✓":" 🔒");
    description.textContent=item.description;percent.textContent=item.percent+"% dos usuários cadastrados desbloquearam";
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
 socket?.on("achievement-unlocked",data=>{
  const names={welcome:"Bem-vindo a bordo",jorge:"Jorge, ô curioso"};
  const toast=document.createElement("div");toast.className="jf-social-toast";toast.textContent="🏅 Conquista desbloqueada: "+(names[data.id]||data.id);
  document.body.appendChild(toast);setTimeout(()=>toast.remove(),6000);
 });
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){overlay.hidden=true;achievements.hidden=true}});
})();
