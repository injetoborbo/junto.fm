/* Mobile layout reuses the live video and chat nodes: no duplicate player/chat. */
(() => {
  "use strict";
  window.JfTvMobile = {create(overlay) {
    const media=window.matchMedia("(max-width: 760px), (max-height: 520px) and (pointer: coarse)");
    const dialog=overlay.querySelector(".jf-tv-window"),inner=overlay.querySelector(".jf-tv-inner");
    const screen=overlay.querySelector(".jf-tv-screen");
    const chat=document.getElementById("jfChatWindow"),launcher=document.getElementById("jfChatLauncher");
    let active=false,mounted=false,anchors=[],options=null,wasHidden=true;
    function viewport(){
      if(!active||!mounted)return;
      const view=window.visualViewport;
      // Do not fight pinch zoom. At normal scale, keep the composer above the
      // soft keyboard even on browsers which only resize the visual viewport.
      if(view&&Math.abs(view.scale-1)>0.05)return;
      overlay.style.setProperty("--jf-tv-visible-height",(view?.height||window.innerHeight)+"px");
      overlay.style.setProperty("--jf-tv-visible-top",(view?.offsetTop||0)+"px");
    }
    function unmount(){
      if(!mounted)return;
      mounted=false;overlay.classList.remove("jf-tv-mobile");
      for(const [node,anchor] of anchors){
        if(anchor.parentNode)anchor.parentNode.insertBefore(node,anchor);
        anchor.remove();
      }
      anchors=[];options.remove();options=null;
      if(chat){chat.hidden=wasHidden;
        launcher?.setAttribute("aria-expanded",String(!wasHidden));
        launcher?.setAttribute("aria-label",wasHidden?"Abrir chat da sala":"Fechar chat da sala");
        if(launcher)launcher.title=wasHidden?"Abrir chat da sala":"Fechar chat da sala";
      }
      overlay.style.removeProperty("--jf-tv-visible-height");overlay.style.removeProperty("--jf-tv-visible-top");
    }
    function update(){
      if(!active||!media.matches){unmount();return;}
      if(!mounted){
        mounted=true;wasHidden=chat?.hidden??true;
        options=document.createElement("details");options.id="jfTvMobileOptions";
        const summary=document.createElement("summary");summary.textContent="Controles e fonte do vídeo";
        options.appendChild(summary);
        const controls=document.createElement("div");controls.className="jf-tv-mobile-controls";
        options.appendChild(controls);dialog.insertBefore(options,inner.nextSibling||null);
        // Keep the media subtree in place: reparenting an iframe would reload
        // YouTube. Only move controls; display:contents lays out the screen.
        for(const node of Array.from(inner.children)){
          if(node===screen)continue;
          const anchor=document.createComment("jf-tv-control-position");inner.insertBefore(anchor,node);
          anchors.push([node,anchor]);controls.appendChild(node);
        }
        overlay.classList.add("jf-tv-mobile");
        if(chat){
          chat.hidden=false;launcher?.setAttribute("aria-expanded","true");
          launcher?.setAttribute("aria-label","Fechar chat da sala");
          if(launcher){launcher.title="Fechar chat da sala";launcher.classList.remove("has-unread");}
          const log=document.getElementById("jfChatLog");if(log)log.scrollTop=log.scrollHeight;
          // Showing messages must not focus the input or summon the keyboard.
        }
      }
      viewport();
    }
    media.addEventListener("change",update);
    chat?.addEventListener("focusin",()=>{if(mounted&&options)options.open=false;});
    window.visualViewport?.addEventListener("resize",viewport);
    window.visualViewport?.addEventListener("scroll",viewport);
    window.addEventListener("resize",viewport);
    return {open(){active=true;update();},close(){active=false;unmount();}};
  }};
})();
