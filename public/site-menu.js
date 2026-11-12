/* Menu de tres tracinhos; reaproveita botoes e modais existentes da Junto.fm. */
(()=>{
  const button=document.getElementById("jfSiteMenuButton");
  const panel=document.getElementById("jfSiteMenuPanel");
  if(!button||!panel)return;
  const setOpen=open=>{
    panel.hidden=!open;
    button.setAttribute("aria-expanded",String(open));
    button.setAttribute("aria-label",open?"Fechar menu":"Abrir menu");
    if(open)panel.querySelector("button:not([hidden])")?.focus();
  };
  button.addEventListener("click",()=>setOpen(panel.hidden));
  panel.addEventListener("click",event=>{
    if(event.target.closest("button,a"))setOpen(false);
  });
  document.addEventListener("pointerdown",event=>{
    if(!panel.hidden&&!panel.contains(event.target)&&!button.contains(event.target))setOpen(false);
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!panel.hidden){setOpen(false);button.focus();}
  });
})();
