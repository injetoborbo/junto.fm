/* EVENTO TEMPORARIO — só a enquete interna da Junto.fm, NÃO apuração eleitoral oficial. */
(()=>{
  "use strict";
  const socket=window.jfSocialSocket;
  const launcher=document.getElementById("jfCommunityPollLaunch");
  const modal=document.getElementById("jfCommunityPollModal");
  if(!socket||!launcher||!modal)return;
  const $=id=>document.getElementById(id);
  const el={lula:$("jfPollLula"),flavio:$("jfPollFlavio"),pctLula:$("jfPollPctLula"),
    pctFlavio:$("jfPollPctFlavio"),total:$("jfPollTotal"),barLula:$("jfPollBarLula"),
    barFlavio:$("jfPollBarFlavio"),status:$("jfPollStatus")};
  const expires=Date.parse("2026-10-27T03:00:00Z");
  let opened=false;
  let lastState=null;
  let token=null;
  function readToken(){
    if(token)return token;
    try{
      const k="jf_community_poll_voter_2026";
      token=localStorage.getItem(k);
      if(!/^[a-f0-9]{40}$/.test(token||"")){
        token=Array.from(crypto.getRandomValues(new Uint8Array(20)),v=>v.toString(16).padStart(2,"0")).join("");
        localStorage.setItem(k,token);
      }
    }catch(_){token=Array.from(crypto.getRandomValues(new Uint8Array(20)),v=>v.toString(16).padStart(2,"0")).join("");}
    return token;
  }
  function display(state){
    if(!state||state.source!=="enquete-comunidade")return;
    lastState=state;
    const active=Boolean(state.open)&&Date.now()<expires;
    launcher.hidden=!active;
    const lula=Number(state.lula)||0,flavio=Number(state.flavio)||0,total=lula+flavio;
    const a=total?Math.round(lula*100/total):0,b=total?Math.round(flavio*100/total):0;
    el.lula.textContent=lula.toLocaleString("pt-BR");
    el.flavio.textContent=flavio.toLocaleString("pt-BR");
    el.pctLula.textContent=a+"%";el.pctFlavio.textContent=b+"%";
    el.total.textContent=total.toLocaleString("pt-BR")+" voto(s) na comunidade";
    el.barLula.style.width=a+"%";el.barFlavio.style.width=b+"%";
    for(const btn of modal.querySelectorAll("[data-community-vote]"))btn.disabled=!active;
    if(!active){el.status.textContent="Enquete temporária encerrada. Estes números não são a apuração oficial.";if(opened)modal.hidden=true;}
  }
  const close=()=>{modal.hidden=true;opened=false;launcher.setAttribute("aria-expanded","false");};
  launcher.addEventListener("click",()=>{
    modal.hidden=false;opened=true;launcher.setAttribute("aria-expanded","true");
    socket.emit("community-election-poll-get");
  });
  $("jfPollClose").addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&opened)close()});
  modal.querySelectorAll("[data-community-vote]").forEach(btn=>btn.addEventListener("click",()=>{
    if(!lastState?.open)return;
    const candidate=btn.dataset.communityVote;
    socket.emit("community-election-poll-vote",{candidate,voterToken:readToken()});
    el.status.textContent="Registrando sua escolha…";
  }));
  socket.on("community-election-poll-state",display);
  socket.on("community-election-poll-confirmed",({candidate}={})=>{
    el.status.textContent="Voto registrado para "+(candidate==="lula"?"Lula":"Flávio Bolsonaro")+". Você pode alterar sua escolha enquanto a enquete estiver aberta.";
  });
  socket.on("community-election-poll-error",({message}={})=>{
    el.status.textContent=message||"Não foi possível registrar o voto.";
  });
  socket.on("connect",()=>socket.emit("community-election-poll-get"));
  if(socket.connected)socket.emit("community-election-poll-get");
  fetch("/api/community-election-poll-2026",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(display).catch(()=>{});
  const timer=setInterval(()=>{
    if(Date.now()>=expires){launcher.hidden=true;close();clearInterval(timer);}
  },30000);
})();
