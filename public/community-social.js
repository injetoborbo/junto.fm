(()=>{
  const socket=window.jfSocialSocket;
  if(!socket)return;
  const style=document.createElement("link");style.rel="stylesheet";style.href="/community-social.css?v=2";document.head.appendChild(style);
  const dock=document.createElement("div");dock.className="jf-msn-dock";
  dock.innerHTML='<button type="button" class="jf-msn-launcher" id="jfMsnOpen" aria-expanded="false"><span>✉</span><b>Mensagens</b><i id="jfMsnUnread" hidden>0</i></button>';
  const panel=document.createElement("section");panel.className="jf-msn-window";panel.id="jfMsnWindow";panel.hidden=true;
  panel.innerHTML='<header class="jf-msn-titlebar"><span>🟢 Junto Messenger <small>online</small></span><button type="button" id="jfMsnClose" aria-label="Fechar">×</button></header><div class="jf-msn-body"><aside class="jf-msn-sidebar"><div class="jf-msn-section-title">MEUS CONTATOS</div><div id="jfMsnContacts" class="jf-msn-contacts"><p>Carregando...</p></div></aside><section class="jf-msn-chat"><div class="jf-msn-chat-head" id="jfMsnChatHead">Selecione um amigo para conversar</div><div class="jf-msn-messages" id="jfMsnMessages"><div class="jf-msn-empty">💬<br>Escolha alguém da sua lista de amigos.</div></div><form id="jfMsnForm" class="jf-msn-compose"><input id="jfMsnInput" maxlength="2000" autocomplete="off" placeholder="Escreva uma mensagem..." disabled><button type="submit" disabled>Enviar ➤</button></form><p class="jf-msn-status" id="jfMsnStatus" aria-live="polite">Mensagens privadas entre amigos.</p></section></div>';
  document.body.append(dock,panel);
  const $=id=>document.getElementById(id);
  let account=null,contacts=[],active=null,history=[];
  function renderPublicProfilePage(){
    const match=location.pathname.match(/^\/u\/([^/]+)\/?$/);
    if(!match)return;
    document.body.classList.add("jf-public-profile-page");
    let username="";try{username=decodeURIComponent(match[1]);}catch(_){username=match[1];}
    const main=document.querySelector("main");if(!main)return;
    const section=document.createElement("section");section.id="jfPublicProfile";section.className="jf-public-profile";
    const heading=document.createElement("div");heading.className="jf-public-profile-head";
    const avatar=document.createElement("div");avatar.className="jf-public-profile-avatar";avatar.textContent="🐒";
    const identity=document.createElement("div");const name=document.createElement("h2");name.textContent="Carregando perfil...";
    const handle=document.createElement("div");handle.className="jf-public-handle";handle.textContent="@"+username;
    const motto=document.createElement("p");motto.className="jf-public-motto";identity.append(name,handle,motto);heading.append(avatar,identity);
    const meta=document.createElement("div");meta.className="jf-public-profile-meta";
    const badgesTitle=document.createElement("h3");badgesTitle.textContent="🏅 Medalhas conquistadas";badgesTitle.style.cssText="font:900 13px Tahoma;margin:14px 0 8px";
    const badges=document.createElement("div");badges.className="jf-public-badges";badges.textContent="Carregando coleção...";
    const actions=document.createElement("div");actions.className="jf-public-profile-actions";
    const back=document.createElement("a");back.className="jf-home-action";back.href="/";back.textContent="← Voltar ao Junto.fm";actions.append(back);
    section.append(heading,meta,badgesTitle,badges,actions);main.append(section);
    const labels={welcome:"Bem-vindo a bordo",listen1:"Só mais uma música",listen10:"Uno mas...",listen50:"Tô fritando",listen100:"AYYY!",firstdj:"Solta o som",dj10:"Respeita o DJ",firstroom:"Cada macaco no seu galho",planet:"Planeta Macaco",nomad:"Nômade",friend1:"Macaco amigo",friend10:"Bando formado",firstchat:"Sinais de evolução",days7:"Emocionado",streak7:"Ponto marcado",banana1:"Agindo como tal",banana_mvp:"MVP",banana100:"Fornecedor da feira",tomato1:"Na cara não",tomato50:"Desperdício...",dance1:"Dança gatinhe...",dance_hour:"Não tá puro",dance_all:"Molejo",outfit1:"Feio arrumado",outfit_all:"Exagerado"};
    fetch("/api/community/profile/"+encodeURIComponent(username),{credentials:"same-origin",cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"Perfil indisponível.");return data;}).then(data=>{
      const profile=data.profile||{};name.textContent=profile.name||"Macaco";handle.textContent="@"+(profile.username||username);
      motto.textContent=profile.motto||"Esse macaco ainda não deixou uma frase por aqui.";
      avatar.replaceChildren();if(profile.avatar&&/^data:image\/(png|jpeg|webp);base64,/i.test(profile.avatar)){const img=document.createElement("img");img.src=profile.avatar;img.alt="";avatar.append(img);}else avatar.textContent=(profile.name||"M").slice(0,1).toUpperCase();
      const created=profile.createdAt?new Date(profile.createdAt):null;
      meta.textContent="🐒 Na comunidade desde "+(created&&!Number.isNaN(created.getTime())?created.toLocaleDateString("pt-BR"):"recentemente")+" · 🏅 "+(data.achievements?.length||0)+" medalhas";
      badges.replaceChildren();const unlocked=Array.isArray(data.achievements)?data.achievements:[];
      if(!unlocked.length){badges.textContent="Ainda não conquistou medalhas. A aventura está só começando!";}
      else for(const badge of unlocked){const chip=document.createElement("span");chip.className="jf-public-badge";chip.textContent="🏅 "+(labels[badge.achievement_id]||badge.achievement_id);badges.append(chip);}
      if(data.isSelf){const edit=document.createElement("button");edit.className="jf-home-action";edit.type="button";edit.textContent="✎ Editar meu perfil";edit.addEventListener("click",()=>document.getElementById("jfOpenProfile")?.click());actions.append(edit);}
    }).catch(error=>{name.textContent="Perfil não encontrado";motto.textContent=error.message;meta.textContent="";badges.textContent="Confira o endereço e tente novamente.";});
  }
  const unread=new Map();
  function setStatus(message){$("jfMsnStatus").textContent=message||"";}
  function setOpen(open){panel.hidden=!open;$("jfMsnOpen").setAttribute("aria-expanded",String(open));if(open){$("jfFriendsDrawer")?.setAttribute("hidden","");socket.emit("dm-list");}}
  function time(value){const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}
  function updateUnread(){const total=[...unread.values()].reduce((a,b)=>a+b,0),badge=$("jfMsnUnread");badge.hidden=!total;badge.textContent=total>99?"99+":String(total);}
  function renderContacts(){
    const list=$("jfMsnContacts");list.replaceChildren();
    if(!account){const p=document.createElement("p");p.className="jf-msn-empty-contact";p.textContent="Entre na sua conta para conversar com seus amigos.";list.append(p);return;}
    if(!contacts.length){const p=document.createElement("p");p.className="jf-msn-empty-contact";p.textContent="Sua lista está vazia. Adicione amigos pelo botão Amigos.";list.append(p);return;}
    for(const person of contacts){
      const button=document.createElement("button");button.type="button";button.className="jf-msn-contact"+(active?.id===person.id?" active":"");
      const avatar=document.createElement("span");avatar.className="jf-msn-avatar";
      if(person.avatar&&/^data:image\/(png|jpeg|webp);base64,/i.test(person.avatar)){const img=document.createElement("img");img.src=person.avatar;img.alt="";avatar.append(img);}else avatar.textContent=(person.name||"?").slice(0,1).toUpperCase();
      const details=document.createElement("span");details.className="jf-msn-contact-details";
      const name=document.createElement("b");name.textContent=person.name||"Macaco";
      const last=document.createElement("small");last.textContent=person.last_message||"Clique para iniciar uma conversa";
      details.append(name,last);button.append(avatar,details);
      const count=unread.has(person.id)?unread.get(person.id):(person.unread||0);if(count){const badge=document.createElement("i");badge.className="jf-msn-contact-unread";badge.textContent=count>9?"9+":String(count);button.append(badge);}
      button.addEventListener("click",()=>openConversation(person));list.append(button);
    }
  }
  function renderMessages(){
    const list=$("jfMsnMessages");list.replaceChildren();
    if(!history.length){const empty=document.createElement("div");empty.className="jf-msn-empty";empty.textContent="Ainda não há mensagens. Mande um oi! 👋";list.append(empty);return;}
    for(const message of history){
      const own=message.sender_id===account.id;
      const row=document.createElement("div");row.className="jf-msn-message "+(own?"own":"theirs");
      const bubble=document.createElement("div");bubble.className="jf-msn-bubble";bubble.textContent=message.body;
      const stamp=document.createElement("time");stamp.textContent=time(message.created_at);
      row.append(bubble,stamp);list.append(row);
    }
    list.scrollTop=list.scrollHeight;
  }
  function openConversation(person){
    active=person;history=[];unread.delete(person.id);updateUnread();renderContacts();
    const head=$("jfMsnChatHead");head.replaceChildren();head.append(document.createTextNode("🐒 "+(person.name||"Macaco")+" "));
    if(person.username){const profileLink=document.createElement("a");profileLink.href="/u/"+encodeURIComponent(person.username);profileLink.textContent="Ver perfil ↗";profileLink.className="jf-msn-profile-link";head.append(profileLink);}const wink=document.createElement("button");wink.type="button";wink.className="jf-msn-nudge";wink.textContent="⚡ Chamar atenção";wink.addEventListener("click",()=>{if(active)socket.emit("social-wink",{accountId:active.id});});head.append(wink);
    $("jfMsnInput").disabled=false;$("jfMsnForm").querySelector("button").disabled=false;
    $("jfMsnMessages").replaceChildren();setStatus("Carregando conversa...");
    socket.emit("dm-open",{accountId:person.id});
  }
  $("jfMsnOpen").addEventListener("click",()=>{
    const open=panel.hidden;setOpen(open);
    if(open&&!account){setStatus("Faça login para desbloquear mensagens privadas.");}
  });
  $("jfMsnClose").addEventListener("click",()=>setOpen(false));
  document.getElementById("jfHomeMessenger")?.addEventListener("click",()=>setOpen(true));
  document.getElementById("jfHomeArcade")?.addEventListener("click",()=>document.getElementById("jfOpenArena")?.click());
  document.getElementById("jfHomeAchievements")?.addEventListener("click",()=>document.getElementById("jfAchievementsOpen")?.click());
  $("jfMsnForm").addEventListener("submit",event=>{
    event.preventDefault();const input=$("jfMsnInput"),text=input.value.trim();
    if(!text||!active)return;
    socket.emit("dm-send",{accountId:active.id,text});input.value="";input.focus();
  });
  socket.on("dm-conversations",payload=>{
    contacts=Array.isArray(payload?.conversations)?payload.conversations:[];
    for(const person of contacts){if(person.unread)unread.set(person.id,person.unread);else unread.delete(person.id);}
    updateUnread();renderContacts();
    if(active){const latest=contacts.find(person=>person.id===active.id);if(latest)active={...active,...latest};}
  });
  socket.on("dm-history",payload=>{
    if(!active||payload?.accountId!==active.id)return;
    history=Array.isArray(payload.messages)?payload.messages:[];
    unread.delete(active.id);updateUnread();renderMessages();setStatus("Conversa privada · somente vocês dois podem ver.");
  });
  socket.on("dm-message",message=>{
    if(!message||!account)return;
    const peerId=message.sender_id===account.id?message.recipient_id:message.sender_id;
    if(active?.id===peerId){
      if(!history.some(item=>String(item.id)===String(message.id))){history.push(message);renderMessages();}
      unread.delete(peerId);updateUnread();socket.emit("dm-open",{accountId:peerId});
    }else if(message.sender_id!==account.id){
      unread.set(peerId,(unread.get(peerId)||0)+1);updateUnread();
    }
    socket.emit("dm-list");
  });
  socket.on("dm-error",payload=>setStatus(payload?.message||"Mensagens indisponíveis."));
  socket.on("social-wink-sent",payload=>setStatus(payload?.delivered?"Chamada enviada!":"Seu amigo está offline; ele verá quando entrar."));
  socket.on("social-wink-error",payload=>setStatus(payload?.message||"Não foi possível chamar atenção."));
  socket.on("social-wink-received",payload=>{
    document.body.classList.remove("jf-msn-nudged");void document.body.offsetWidth;document.body.classList.add("jf-msn-nudged");
    let toast=document.getElementById("jfMsnNudgeToast");if(!toast){toast=document.createElement("div");toast.id="jfMsnNudgeToast";toast.className="jf-msn-nudge-toast";document.body.append(toast);}
    toast.textContent="⚡ "+(payload?.from||"Um amigo")+" chamou sua atenção!";toast.hidden=false;
    window.clearTimeout(toast._hideTimer);toast._hideTimer=window.setTimeout(()=>{toast.hidden=true;document.body.classList.remove("jf-msn-nudged");},2600);
  });
  fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"}).then(response=>response.json()).then(data=>{
    account=data.loggedIn?data.profile:null;
    const ownProfile=document.getElementById("jfHomeMyProfile");if(ownProfile&&account?.username){ownProfile.href="/u/"+encodeURIComponent(account.username);ownProfile.hidden=false;}
    if(account)socket.emit("dm-list");
    else setStatus("Entre na sua conta para usar o Junto Messenger.");
    renderContacts();
  }).catch(()=>{account=null;renderContacts();setStatus("Não foi possível verificar sua conta.");});
  window.addEventListener("jf-account-username-updated",event=>{
    const username=String(event.detail?.username||"");if(!username)return;
    if(account)account.username=username;
    const ownProfile=document.getElementById("jfHomeMyProfile");
    if(ownProfile){ownProfile.href="/u/"+encodeURIComponent(username);ownProfile.hidden=false;}
    if(account)socket.emit("dm-list");
  });
  renderPublicProfilePage();
  socket.on("friends-state",()=>{if(!panel.hidden)socket.emit("dm-list");});
  socket.on("connect",()=>{if(account)socket.emit("dm-list");});
})();