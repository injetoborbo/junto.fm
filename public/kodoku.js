(() => {
  "use strict";
  // Emblema original em SVG: linhas limpas baseadas no esboço do mascote.
  // Não depende de imagem externa, evita peso de download e se adapta à tela.
  const sealMarkup=`<span class="jf-kodoku-seal" aria-hidden="true"><img src="/kodoku-reference-seal.png" alt="" class="jf-kodoku-seal-image"></span>`;
  // Apenas apresentação das mensagens: o conteúdo enviado e armazenado segue intacto.
  const chatMonkey=`<span class="jf-kodoku-chat-o" aria-hidden="true"><svg viewBox="0 0 100 100" focusable="false"><path d="M50 6 64 12 78 11 89 23 89 37 95 50 89 63 89 77 78 89 64 88 50 94 36 88 22 89 11 77 11 63 5 50 11 37 11 23 22 11 36 12Z"/><path d="M25 33Q25 19 50 19Q75 19 75 33Q78 58 68 72Q58 82 50 82Q42 82 32 72Q22 58 25 33Z"/><path d="M33 50Q30 38 41 35Q46 39 47 51Q40 56 33 50Z M67 50Q70 38 59 35Q54 39 53 51Q60 56 67 50Z"/><path d="M33 28L45 39M67 28L55 39M46 59Q50 56 54 59L50 64Z"/><path d="M29 69Q50 64 71 69M37 78Q50 82 63 78"/></svg></span>`;
  const glyphTemplate=document.createElement("template");
  glyphTemplate.innerHTML=chatMonkey;
  function decorateMessage(node){
    if(!node.matches?.(".jf-chat-text"))return;
    if(node.dataset.kodokuDecorated==="1")return;
    const raw=node.textContent;
    if(document.documentElement.dataset.jfTheme!=="kodoku"||!/[oO]/.test(raw))return;
    node.dataset.kodokuOriginal=raw;
    node.dataset.kodokuDecorated="1";
    const parts=raw.split(/([oO])/g);
    const content=document.createDocumentFragment();
    for(const part of parts){
      if(part==="o"||part==="O"){
        const glyph=glyphTemplate.content.firstElementChild.cloneNode(true);
        glyph.setAttribute("aria-label",part);
        content.appendChild(glyph);
      }else if(part)content.appendChild(document.createTextNode(part));
    }
    node.replaceChildren(content);
    // Leitores de tela continuam ouvindo a mensagem original.
    node.setAttribute("aria-label",raw);
  }
  function refreshChat(){
    const enabled=document.documentElement.dataset.jfTheme==="kodoku";
    document.querySelectorAll("#jfChatLog .jf-chat-text").forEach(node=>{
      if(!enabled&&node.dataset.kodokuDecorated==="1"){
        node.textContent=node.dataset.kodokuOriginal||"";
        delete node.dataset.kodokuDecorated;
        delete node.dataset.kodokuOriginal;
        node.removeAttribute("aria-label");
      }else if(enabled)decorateMessage(node);
    });
  }
  function watchChat(){
    const log=document.getElementById("jfChatLog");
    if(log)new MutationObserver(records=>{
      const added=[];
      for(const record of records)for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches?.(".jf-chat-text"))added.push(node);
        node.querySelectorAll?.(".jf-chat-text").forEach(item=>added.push(item));
      }
      added.forEach(decorateMessage);
    }).observe(log,{childList:true,subtree:true});
    new MutationObserver(refreshChat).observe(document.documentElement,{attributes:true,attributeFilter:["data-jf-theme"]});
    refreshChat();
  }
  const makeFeature=()=>{
    const feature=document.createElement("div");
    feature.className="jf-kodoku-feature";
    const miniMonkeyO=`<span class="jf-kodoku-letter-o" aria-hidden="true"><svg viewBox="0 0 100 100" focusable="false"><path d="M50 6 64 12 78 11 89 23 89 37 95 50 89 63 89 77 78 89 64 88 50 94 36 88 22 89 11 77 11 63 5 50 11 37 11 23 22 11 36 12Z"/><path d="M25 33Q25 19 50 19Q75 19 75 33Q78 58 68 72Q58 82 50 82Q42 82 32 72Q22 58 25 33Z"/><path d="M33 50Q30 38 41 35Q46 39 47 51Q40 56 33 50Z M67 50Q70 38 59 35Q54 39 53 51Q60 56 67 50Z"/><path d="M33 28L45 39M67 28L55 39M46 59Q50 56 54 59L50 64Z"/><path d="M29 69Q50 64 71 69M37 78Q50 82 63 78"/></svg></span>`;
    feature.innerHTML=sealMarkup+'<strong class="jf-kodoku-wordmark"><span>K</span>'+miniMonkeyO+'<span>D</span>'+miniMonkeyO+'<span>K</span><span>U</span></strong><span class="jf-kodoku-ornament">✧ ─── ◇ ─── ✧</span><p>Registros de uma sala em silêncio.</p>';
    return feature;
  };
  const place=()=>{
    const player=document.querySelector(".jf-player-panel");
    if(player&&!player.querySelector(".jf-kodoku-feature"))player.prepend(makeFeature());
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{place();watchChat()},{once:true});
  else {place();watchChat()}
})();