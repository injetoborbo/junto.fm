// Junto.fm — barril coletivo de bananas. A sala é a fonte de verdade.
(() => {
  const css = `
  .jf-banana-widget{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:75px;padding:4px 3px;align-self:center}
  .jf-banana-barrel{width:68px;height:67px;position:relative;display:grid;place-items:center;filter:drop-shadow(0 3px 3px #0005)}
  .jf-banana-barrel::before{content:"";position:absolute;inset:9px 6px 2px;border:3px solid #603219;border-radius:15px 15px 21px 21px;background:repeating-linear-gradient(90deg,#8c4b26 0 14px,#b77438 14px 26px);box-shadow:inset 0 -7px 0 #4e2e1a}
  .jf-banana-barrel::after{content:"";position:absolute;top:2px;left:5px;right:5px;height:21px;border:4px solid #673b20;border-radius:50%;background:radial-gradient(ellipse,#372116 0 55%,#694029 58%);z-index:2}
  .jf-banana-fill{position:absolute;top:9px;left:10px;right:10px;height:12px;border-radius:50%;background:#f0e2a1;z-index:3;opacity:0;transition:opacity .25s}
  .jf-banana-widget[data-level="half"] .jf-banana-fill,.jf-banana-widget[data-level="full"] .jf-banana-fill{opacity:1}
  .jf-banana-widget[data-level="half"] .jf-banana-fill{transform:translateY(9px);background:#e5d69e}
  .jf-banana-widget[data-level="full"] .jf-banana-fill{transform:translateY(0);background:#f9e9b2}
  .jf-banana-barrel img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:5}
  .jf-banana-widget:has(.jf-banana-barrel img:not([hidden])) .jf-banana-barrel::before,.jf-banana-widget:has(.jf-banana-barrel img:not([hidden])) .jf-banana-barrel::after,.jf-banana-widget:has(.jf-banana-barrel img:not([hidden])) .jf-banana-fill{display:none}
  .jf-banana-count{font:700 11px system-ui,sans-serif;color:var(--jf-secondary,#e7c778);white-space:nowrap}
  .jf-banana-button{border:0;background:transparent;padding:0;cursor:pointer;font-size:27px;line-height:1;transition:transform .15s;filter:drop-shadow(0 2px 2px #0005)}
  .jf-banana-button:hover{transform:scale(1.16)}.jf-banana-button:disabled{opacity:.45;cursor:not-allowed}
  .jf-banana-falling{position:fixed;width:38px;height:38px;z-index:13000;pointer-events:none;transform-origin:center;will-change:transform,opacity}
  @media(max-width:520px){.jf-banana-widget{min-width:60px}.jf-banana-barrel{width:55px;height:56px}.jf-banana-button{font-size:24px}}
  `;
  const sheet=document.createElement("style");sheet.textContent=css;document.head.appendChild(sheet);
  const socket=window.jfBananaSocket;
  const player=document.querySelector("#jfMiniDj");
  if(!socket||!player)return;
  const widget=document.createElement("div");widget.className="jf-banana-widget";widget.dataset.level="empty";
  widget.innerHTML='<div class="jf-banana-barrel" id="jfBananaBarrel"><div class="jf-banana-fill"></div><img id="jfBananaBarrelImage" alt="" hidden></div><span class="jf-banana-count" id="jfBananaCount">0/19 🍌</span><button class="jf-banana-button" id="jfBananaThrow" type="button" aria-label="Jogar banana no barril" title="Jogar banana no barril">🍌</button>';
  player.insertAdjacentElement("afterend",widget);
  const count=widget.querySelector("#jfBananaCount"),image=widget.querySelector("#jfBananaBarrelImage"),button=widget.querySelector("#jfBananaThrow"),barrel=widget.querySelector("#jfBananaBarrel");
  const images={empty:"/banana/barrel-empty.png",half:"/banana/barrel-half.png",full:"/banana/barrel-full.png"};
  let joined=false,number=0,room=null,lastClick=0;
  function setCount(value){
    number=Math.max(0,Math.min(19,Number(value)||0));
    const level=number>=19?"full":number>=10?"half":"empty";
    count.textContent=number+"/19 🍌";widget.dataset.level=level;
    image.hidden=true;image.onload=()=>{image.hidden=false;};image.onerror=()=>{image.hidden=true;};
    image.src=images[level];
    button.disabled=!joined||number>=19;
  }
  function drop(){
    const box=barrel.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const banana=document.createElement("span");banana.className="jf-banana-falling";banana.textContent="🍌";
    const x=box.left+box.width*.5-19,y=box.top-72;
    banana.style.left=x+"px";banana.style.top=y+"px";
    document.body.appendChild(banana);
    // Cai verticalmente para a boca; desaparece gradualmente enquanto entra no barril.
    const destination=box.top+box.height*.29-y;
    const animation=banana.animate([
      {transform:"translateY(0) rotate(-15deg) scale(1)",opacity:1,offset:0},
      {transform:`translateY(${destination*.75}px) rotate(20deg) scale(.85)`,opacity:1,offset:.68},
      {transform:`translateY(${destination}px) rotate(38deg) scale(.55)`,opacity:0,offset:1}
    ],{duration:850,easing:"ease-in",fill:"forwards"});
    animation.finished.catch(()=>{}).finally(()=>banana.remove());
  }
  button.addEventListener("click",()=>{if(!joined||number>=19||Date.now()-lastClick<750)return;lastClick=Date.now();socket.emit("banana-throw");});
  socket.on("joined-room",payload=>{joined=true;room=payload.room;setCount(payload.bananaCount||0);});
  socket.on("banana-thrown",payload=>{if(!joined||payload.room!==room)return;drop();setCount(payload.count);});
  socket.on("banana-error",payload=>{button.title=payload?.message||"Tente novamente";});
  socket.on("left-room",()=>{joined=false;room=null;setCount(0);});
  socket.on("disconnect",()=>{joined=false;room=null;setCount(0);});
  setCount(0);
})();
