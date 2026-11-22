(() => {
  "use strict";
  const chat = document.getElementById("jfChatWindow");
  if (!chat || chat.dataset.jfResizeReady === "1") return;
  chat.dataset.jfResizeReady = "1";

  const css = document.createElement("style");
  css.id = "jfChatResizeStyles";
  css.textContent = `
    #jfChatWindow{resize:none!important;overflow:hidden!important;box-sizing:border-box}
    #jfChatWindow .jf-chat-resize-handle{position:absolute;z-index:42;touch-action:none;user-select:none;-webkit-user-select:none}
    #jfChatWindow .jf-chat-resize-handle[data-edge="n"],#jfChatWindow .jf-chat-resize-handle[data-edge="s"]{left:13px;right:13px;height:9px;cursor:ns-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="n"]{top:0}
    #jfChatWindow .jf-chat-resize-handle[data-edge="s"]{bottom:0}
    #jfChatWindow .jf-chat-resize-handle[data-edge="e"],#jfChatWindow .jf-chat-resize-handle[data-edge="w"]{top:13px;bottom:13px;width:9px;cursor:ew-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="e"]{right:0}
    #jfChatWindow .jf-chat-resize-handle[data-edge="w"]{left:0}
    #jfChatWindow .jf-chat-resize-handle[data-edge="ne"],#jfChatWindow .jf-chat-resize-handle[data-edge="nw"],#jfChatWindow .jf-chat-resize-handle[data-edge="se"],#jfChatWindow .jf-chat-resize-handle[data-edge="sw"]{width:18px;height:18px}
    #jfChatWindow .jf-chat-resize-handle[data-edge="ne"]{right:0;top:0;cursor:nesw-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="nw"]{left:0;top:0;cursor:nwse-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="se"]{right:0;bottom:0;cursor:nwse-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="sw"]{left:0;bottom:0;cursor:nesw-resize}
    #jfChatWindow .jf-chat-resize-handle[data-edge="se"]::after{content:"";position:absolute;right:4px;bottom:4px;width:8px;height:8px;border-right:2px solid var(--jf-secondary,#70f4ff);border-bottom:2px solid var(--jf-secondary,#70f4ff);filter:drop-shadow(0 0 2px #000)}
    #jfChatWindow.jf-chat-resizing{user-select:none!important}
    #jfChatWindow.jf-chat-resizing *{user-select:none!important}
    @media(max-width:760px){#jfChatWindow .jf-chat-resize-handle{display:none!important}}
  `;
  document.head.appendChild(css);

  const edges = ["n","s","e","w","ne","nw","se","sw"];
  for (const edge of edges) {
    const handle = document.createElement("div");
    handle.className = "jf-chat-resize-handle";
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden","true");
    chat.appendChild(handle);
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || window.matchMedia("(max-width: 760px)").matches) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = chat.getBoundingClientRect();
      const start = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
      const minW = 280, minH = 250, margin = 8;
      const maxW = Math.max(minW, window.innerWidth - margin*2);
      const maxH = Math.max(minH, window.innerHeight - margin*2);
      chat.classList.add("jf-chat-resizing");
      chat.style.position = "fixed";
      chat.style.right = "auto";
      chat.style.bottom = "auto";
      chat.style.left = start.left + "px";
      chat.style.top = start.top + "px";
      chat.style.width = start.width + "px";
      chat.style.height = start.height + "px";
      handle.setPointerCapture?.(event.pointerId);

      const move = e => {
        const dx=e.clientX-start.x, dy=e.clientY-start.y;
        let left=start.left, top=start.top, width=start.width, height=start.height;
        if(edge.includes("e")) width=Math.min(maxW,Math.max(minW,start.width+dx));
        if(edge.includes("s")) height=Math.min(maxH,Math.max(minH,start.height+dy));
        if(edge.includes("w")){width=Math.min(maxW,Math.max(minW,start.width-dx));left=start.left+start.width-width;}
        if(edge.includes("n")){height=Math.min(maxH,Math.max(minH,start.height-dy));top=start.top+start.height-height;}
        left=Math.max(margin,Math.min(left,window.innerWidth-width-margin));
        top=Math.max(margin,Math.min(top,window.innerHeight-height-margin));
        chat.style.left=left+"px";chat.style.top=top+"px";
        chat.style.width=width+"px";chat.style.height=height+"px";
      };
      const finish = () => {
        chat.classList.remove("jf-chat-resizing");
        window.removeEventListener("pointermove",move);
        window.removeEventListener("pointerup",finish);
        window.removeEventListener("pointercancel",finish);
        try{handle.releasePointerCapture?.(event.pointerId)}catch{}
      };
      window.addEventListener("pointermove",move,{passive:false});
      window.addEventListener("pointerup",finish,{once:true});
      window.addEventListener("pointercancel",finish,{once:true});
    });
  }
  window.addEventListener("resize",()=>{
    if(!chat.style.left || !chat.style.top) return;
    const rect=chat.getBoundingClientRect(), margin=8;
    const width=Math.min(rect.width,window.innerWidth-margin*2);
    const height=Math.min(rect.height,window.innerHeight-margin*2);
    chat.style.width=width+"px";chat.style.height=height+"px";
    chat.style.left=Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin))+"px";
    chat.style.top=Math.max(margin,Math.min(rect.top,window.innerHeight-height-margin))+"px";
  });
})();