/* Apuracao oficial do TSE, jamais votos enviados pelos usuarios.
 * Todas as leituras sao feitas pelo servidor; a tela so exibe retorno validado.
 */
(()=>{
  "use strict";
  const socket=window.jfSocialSocket;
  const button=document.getElementById("jfCommunityPollLaunch");
  const modal=document.getElementById("jfCommunityPollModal");
  if(!button||!modal)return;
  const $=id=>document.getElementById(id);
  const el={
    lula:$("jfPollLula"),flavio:$("jfPollFlavio"),
    pctLula:$("jfPollPctLula"),pctFlavio:$("jfPollPctFlavio"),
    barLula:$("jfPollBarLula"),barFlavio:$("jfPollBarFlavio"),
    total:$("jfPollTotal"),status:$("jfPollStatus")
  };
  const STOP=Date.parse("2026-10-27T03:00:00Z");
  const number=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString("pt-BR"):"—";
  const percent=n=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":"—";
  const miniScore=$("jfPollMiniScore");
  const collapseButton=$("jfPollCollapse");
  let opened=false,collapsed=false;
  function setCollapsed(value){
    collapsed=Boolean(value);
    modal.classList.toggle("jf-poll-collapsed",collapsed);
    collapseButton.textContent=collapsed?"+":"−";
    collapseButton.title=collapsed?"Expandir placar":"Recolher placar";
    collapseButton.setAttribute("aria-label",collapseButton.title);
    collapseButton.setAttribute("aria-expanded",String(!collapsed));
  }
  collapseButton.addEventListener("click",()=>setCollapsed(!collapsed));
  // Arraste pelo titulo: funciona com mouse, touch e caneta, sem impedir os
  // botoes de fechar/recolher nem o uso normal do restante da pagina.
  const dragHandle=modal.querySelector(".jf-poll-title");
  const STORAGE_KEY="jf-official-vote-window-position-v1";
  let drag=null;
  const clampPosition=(left,top)=>{
    const rect=modal.getBoundingClientRect();
    const width=rect.width||300,height=rect.height||80;
    const x=Math.max(0,Math.min(window.innerWidth-width,left));
    const y=Math.max(0,Math.min(window.innerHeight-Math.min(height,window.innerHeight),top));
    modal.style.setProperty("left",x+"px","important");
    modal.style.setProperty("top",y+"px","important");
    modal.style.setProperty("right","auto","important");
    modal.style.setProperty("bottom","auto","important");
  };
  const savePosition=()=>{
    try{
      const rect=modal.getBoundingClientRect();
      localStorage.setItem(STORAGE_KEY,JSON.stringify({x:rect.left,y:rect.top}));
    }catch(_){}
  };
  const loadPosition=()=>{
    try{
      const pos=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y))
        clampPosition(pos.x,pos.y);
    }catch(_){}
  };
  dragHandle?.addEventListener("pointerdown",event=>{
    if(event.button!==0||event.target.closest("button,a,input,select,textarea"))return;
    const rect=modal.getBoundingClientRect();
    drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    dragHandle.classList.add("jf-poll-dragging");
    dragHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  dragHandle?.addEventListener("pointermove",event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    clampPosition(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
  });
  const finishDrag=event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    drag=null;dragHandle.classList.remove("jf-poll-dragging");savePosition();
  };
  dragHandle?.addEventListener("pointerup",finishDrag);
  dragHandle?.addEventListener("pointercancel",finishDrag);
  window.addEventListener("resize",()=>{
    if(!opened||!modal.style.left)return;
    const rect=modal.getBoundingClientRect();clampPosition(rect.left,rect.top);
  });
  // As duas artes têm o mesmo enquadramento e movimento. Enquanto não
  // chegarem os PNGs, exibir iniciais sem ícone de imagem quebrada.
  for(const candidate of ["Lula","Flavio"]){
    const img=$("jfPollSprite"+candidate);
    const fallback=$("jfPollPlaceholder"+candidate);
    if(!img||!fallback)continue;
    const update=()=>{
      const ready=img.complete&&img.naturalWidth>0;
      img.hidden=!ready;fallback.hidden=ready;
    };
    img.addEventListener("load",update);
    img.addEventListener("error",update);
    update();
  }
  function close(){
    modal.hidden=true;opened=false;button.setAttribute("aria-expanded","false");
  }
  function render(state){
    if(!state||state.official!==true||state.source!=="TSE — resultados.tse.jus.br")return;
    if(!state.enabled||Date.now()>=STOP){button.hidden=true;close();return;}
    button.hidden=false;
    const data=state.result;
    if(!data){
      miniScore.textContent="Aguardando contagem oficial do TSE.";
      el.lula.textContent="—";el.flavio.textContent="—";
      el.pctLula.textContent="—";el.pctFlavio.textContent="—";
      el.barLula.style.width="0";el.barFlavio.style.width="0";
      el.total.textContent="Aguardando números oficiais da apuração.";
    }else{
      miniScore.textContent="Lula "+percent(data.lula?.percent)+" · Flávio "+percent(data.flavio?.percent);
      el.lula.textContent=number(data.lula?.votes);
      el.flavio.textContent=number(data.flavio?.votes);
      el.pctLula.textContent=percent(data.lula?.percent);
      el.pctFlavio.textContent=percent(data.flavio?.percent);
      el.barLula.style.width=(data.lula?.percent??0)+"%";
      el.barFlavio.style.width=(data.flavio?.percent??0)+"%";
      el.total.textContent="Votos computados dos candidatos: "+number((data.lula?.votes||0)+(data.flavio?.votes||0));
    }
    const stamp=state.lastSuccessAt?new Date(state.lastSuccessAt).toLocaleTimeString("pt-BR"):"—";
    const sourceFile=typeof state.lastSourcePath==="string"?state.lastSourcePath.split("/").pop():null;
    const details=state.configured?
      (data?"Último resultado TSE validado: "+stamp+(sourceFile?" · "+sourceFile:"")
        :"Conferindo arquivos de votos do TSE."):
      "Fonte oficial ainda não configurada no servidor.";
    el.status.textContent=state.error?details+" · "+state.error:details;
  }
  button.addEventListener("click",()=>{
    modal.hidden=false;opened=true;setCollapsed(false);loadPosition();
    button.setAttribute("aria-expanded","true");
    socket?.emit("jf-election-official-get");
    void refresh();
  });
  $("jfPollClose")?.addEventListener("click",close);
  document.addEventListener("keydown",e=>{if(opened&&e.key==="Escape")close()});
  async function refresh(){
    try{
      const response=await fetch("/api/official-election-2026",{cache:"no-store"});
      if(response.ok)render(await response.json());
    }catch(error){el.status.textContent="Sem conexão com a apuração. Tente novamente.";}
  }
  socket?.on("jf-election-official-update",render);
  socket?.on("connect",()=>socket.emit("jf-election-official-get"));
  if(socket?.connected)socket.emit("jf-election-official-get");
  void refresh();
  const timer=setInterval(()=>{if(Date.now()>=STOP){button.hidden=true;close();clearInterval(timer);return;}void refresh();},30000);
})();
