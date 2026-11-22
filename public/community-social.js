(()=>{
  const socket=window.jfSocialSocket;
  if(!socket)return;
  const style=document.createElement("link");style.rel="stylesheet";style.href="/community-social.css?v=1";document.head.appendChild(style);
  const dock=document.createElement("div");dock.className="jf-msn-dock";
  dock.innerHTML='<button type="button" class="jf-msn-launcher" id="jfMsnOpen" aria-expanded="false"><span>✉</span><b>Mensagens</b><i id="jfMsnUnread" hidden>0</i></button>';
  const panel=document.createElement("section");panel.className="jf-msn-window";panel.id="jfMsnWindow";panel.hidden=true;
  panel.innerHTML='<header class="jf-msn-titlebar"><span>🟢 Junto Messenger <small>online</small></span><button type="button" id="jfMsnClose" aria-label="Fechar">×</button></header><div class="jf-msn-body"><aside class="jf-msn-sidebar"><div class="jf-msn-section-title">MEUS CONTATOS</div><div id="jfMsnContacts" class="jf-msn-contacts"><p>Carregando...</p></div></aside><section class="jf-msn-chat"><div class="jf-msn-chat-head" id="jfMsnChatHead">Selecione um amigo para conversar</div><div class="jf-msn-messages" id="jfMsnMessages"><div class="jf-msn-empty">💬<br>Escolha alguém da sua lista de amigos.</div></div><form id="jfMsnForm" class="jf-msn-compose"><input id="jfMsnInput" maxlength="2000" autocomplete="off" placeholder="Escreva uma mensagem..." disabled><button type="submit" disabled>Enviar ➤</button></form><p class="jf-msn-status" id="jfMsnStatus" aria-live="polite">Mensagens privadas entre amigos.</p></section></div>';
  document.body.append(dock,panel);
  const $=id=>document.getElementById(id);
  let account=null,contacts=[],active=null,history=[];
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
      const count=unread.get(person.id)||person.unread||0;if(count){const badge=document.createElement("i");badge.className="jf-msn-contact-unread";badge.textContent=count>9?"9+":String(count);button.append(badge);}
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
    $("jfMsnChatHead").textContent="🐒 "+(person.name||"Macaco")+(person.username?" · @"+person.username:"");
    $("jfMsnInput").disabled=false;$("jfMsnForm").querySelector("button").disabled=false;
    $("jfMsnMessages").replaceChildren();setStatus("Carregando conversa...");
    socket.emit("dm-open",{accountId:person.id});
  }
  $("jfMsnOpen").addEventListener("click",()=>{
    const open=panel.hidden;setOpen(open);
    if(open&&!account){setStatus("Faça login para desbloquear mensagens privadas.");}
  });
  $("jfMsnClose").addEventListener("click",()=>setOpen(false));
  $("jfMsnForm").addEventListener("submit",event=>{
    event.preventDefault();const input=$("jfMsnInput"),text=input.value.trim();
    if(!text||!active)return;
    socket.emit("dm-send",{accountId:active.id,text});input.value="";input.focus();
  });
  socket.on("dm-conversations",payload=>{
    contacts=Array.isArray(payload?.conversations)?payload.conversations:[];
    for(const person of contacts)if(person.unread)unread.set(person.id,person.unread);
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
    }else if(message.sender_id!==account.id){
      unread.set(peerId,(unread.get(peerId)||0)+1);updateUnread();
    }
    socket.emit("dm-list");
  });
  socket.on("dm-error",payload=>setStatus(payload?.message||"Mensagens indisponíveis."));
  fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"}).then(response=>response.json()).then(data=>{
    account=data.loggedIn?data.profile:null;
    if(account)socket.emit("dm-list");
    else setStatus("Entre na sua conta para usar o Junto Messenger.");
    renderContacts();
  }).catch(()=>{account=null;renderContacts();setStatus("Não foi possível verificar sua conta.");});
  socket.on("friends-state",()=>{if(!panel.hidden)socket.emit("dm-list");});
  socket.on("connect",()=>{if(account)socket.emit("dm-list");});
})();