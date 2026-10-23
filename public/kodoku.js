(() => {
  "use strict";
  // Emblema original em SVG: linhas limpas baseadas no esboço do mascote.
  // Não depende de imagem externa, evita peso de download e se adapta à tela.
  const sealMarkup=`<span class="jf-kodoku-seal" aria-hidden="true"><img src="/kodoku_seal_hq3.png" alt="" class="jf-kodoku-seal-image"></span>`;
  function decorateChatFrame(){
    const win=document.getElementById("jfChatWindow");
    if(!win||win.querySelector(".jf-kodoku-chat-frame"))return;
    const frame=document.createElement("div");
    frame.className="jf-kodoku-chat-frame";
    frame.setAttribute("aria-hidden","true");
    win.appendChild(frame);
  }
  const makeFeature=()=>{
    const feature=document.createElement("div");
    feature.className="jf-kodoku-feature";
    feature.innerHTML=sealMarkup+'<img class="jf-kodoku-wordmark-png" src="/kodoku_wordmark.png" alt="KODOKU"><span class="jf-kodoku-ornament">✧ ─── ◇ ─── ✧</span><p>Registros de uma sala em silêncio.</p>';
    return feature;
  };
  const place=()=>{
    const player=document.querySelector(".jf-player-panel");
    if(player&&!player.querySelector(".jf-kodoku-feature"))player.prepend(makeFeature());
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{place();decorateChatFrame()},{once:true});
  else {place();decorateChatFrame()}
})();