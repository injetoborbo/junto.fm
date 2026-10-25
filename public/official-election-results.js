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
  let opened=false;
  function close(){
    modal.hidden=true;opened=false;button.setAttribute("aria-expanded","false");
  }
  function render(state){
    if(!state||state.official!==true||state.source!=="TSE — resultados.tse.jus.br")return;
    if(!state.enabled||Date.now()>=STOP){button.hidden=true;close();return;}
    button.hidden=false;
    const data=state.result;
    if(!data){
      el.lula.textContent="—";el.flavio.textContent="—";
      el.pctLula.textContent="—";el.pctFlavio.textContent="—";
      el.barLula.style.width="0";el.barFlavio.style.width="0";
      el.total.textContent="Aguardando números oficiais da apuração.";
    }else{
      el.lula.textContent=number(data.lula?.votes);
      el.flavio.textContent=number(data.flavio?.votes);
      el.pctLula.textContent=percent(data.lula?.percent);
      el.pctFlavio.textContent=percent(data.flavio?.percent);
      el.barLula.style.width=(data.lula?.percent??0)+"%";
      el.barFlavio.style.width=(data.flavio?.percent??0)+"%";
      el.total.textContent="Votos computados dos candidatos: "+number((data.lula?.votes||0)+(data.flavio?.votes||0));
    }
    const stamp=state.lastSuccessAt?new Date(state.lastSuccessAt).toLocaleTimeString("pt-BR"):"—";
    const details=state.configured?(data?"Último resultado oficial válido: "+stamp:"Aguardando divulgação de resultados pelo TSE."):"Fonte oficial ainda não configurada no servidor.";
    el.status.textContent=state.error?details+" · "+state.error:details;
  }
  button.addEventListener("click",()=>{
    modal.hidden=false;opened=true;button.setAttribute("aria-expanded","true");
    socket?.emit("jf-election-official-get");
    void refresh();
  });
  $("jfPollClose")?.addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
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
