(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let active=false,checking=false,finished=false;
  let accountProfile=null;
  const wardrobeKeys=["hat","glasses","headphones","outfit"];
  const wardrobeDefaults={hat:"nenhum",glasses:"nenhum",headphones:"nenhum",outfit:"padrao"};
  const modal=$("jfWardrobeModal"),dialog=modal?.querySelector(".jf-wardrobe-modal");
  const save=$("jfSaveWardrobe"),close=$("jfCloseWardrobe"),open=$("jfOpenWardrobe");
  const statusNode=document.createElement("p");
  statusNode.className="jf-avatar-setup-status";
  statusNode.setAttribute("role","status");statusNode.setAttribute("aria-live","polite");
  statusNode.textContent="Escolha o visual e faça seu primeiro registro.";
  function profileName(profile){
    const name=String(profile?.name||"Macaco").trim().slice(0,24);
    const handle=String(profile?.username||"").trim().slice(0,24);
    return {name:name||"Macaco",handle:handle?"@"+handle:""};
  }
  function prepare(profile){
    if(!modal||!dialog||!save||active||finished)return;
    active=true;accountProfile=profile||{};
    modal.classList.add("jf-avatar-setup");
    document.body.classList.add("jf-avatar-setup-active");
    const title=$("jfWardrobeTitle");if(title)title.textContent="Vamos criar seu macaco";
    const closeButton=close; if(closeButton)closeButton.hidden=true;
    const head=dialog.querySelector(".jf-modal-head");
    const intro=document.createElement("div");
    intro.className="jf-avatar-setup-intro";
    intro.innerHTML='<span class="jf-avatar-setup-kicker">SEU PRIMEIRO REGISTRO</span><h2>Esse macaco é a sua cara.</h2><p>Monte seu visual. Ele vai acompanhar você pelo Junto.</p>';
    head?.after(intro);
    const layout=dialog.querySelector(".jf-wardrobe-layout");
    const stage=layout?.querySelector("#jfWardrobePreview")?.parentElement;
    if(stage){
      stage.classList.add("jf-avatar-studio-stage");
      const ruler=document.createElement("div");ruler.className="jf-avatar-ruler";ruler.setAttribute("aria-hidden","true");
      ruler.innerHTML='<span>200</span><span>175</span><span>150</span><span>125</span><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>';
      stage.appendChild(ruler);
      const plaque=document.createElement("div");plaque.className="jf-avatar-plaque";
      plaque.innerHTML='<small>FICHA DO AVATAR</small><strong id="jfAvatarPlateName"></strong><span id="jfAvatarPlateHandle"></span>';
      stage.appendChild(plaque);
      const name=profileName(profile);$("jfAvatarPlateName").textContent=name.name;$("jfAvatarPlateHandle").textContent=name.handle||"JUNTO.FM";
    }
    dialog.querySelector(".jf-wardrobe-modal > p.small")?.classList.add("jf-avatar-setup-description");
    dialog.querySelector(".jf-pet-wardrobe-slot")?.setAttribute("hidden","");
    save.textContent="Esse é meu macaco  ✓";
    save.classList.add("jf-avatar-setup-confirm");
    save.after(statusNode);
    // During the required first setup, don't allow dismissing the modal by accident.
    modal.addEventListener("click",event=>{if(event.target===modal){event.preventDefault();event.stopImmediatePropagation();}},true);
    document.addEventListener("keydown",event=>{
      if(active&&(event.key==="Escape"||event.key==="Tab"&&event.shiftKey&&document.activeElement===save)){
        if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();}
      }
    },true);
    save.addEventListener("click",complete,true);
    open?.click();
    // Make the first experience focused on the character, not the site's other controls.
    const first=dialog.querySelector(".jf-wardrobe-fields select");first?.focus({preventScroll:true});
  }
  async function complete(event){
    if(!active||finished)return;
    event.preventDefault();event.stopImmediatePropagation();
    save.disabled=true;statusNode.textContent="Salvando seu avatar...";
    const wardrobe={};
    for(const key of wardrobeKeys){
      const select=$("jfWardrobe"+key[0].toUpperCase()+key.slice(1));
      wardrobe[key]=select?.value||wardrobeDefaults[key];
    }
    try{
      const response=await fetch("/api/avatar/setup",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({wardrobe})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||"Não foi possível salvar agora.");
      finished=true;active=false;
      try{
        const local=JSON.parse(localStorage.getItem("junto_profile")||"{}");
        local.wardrobe=wardrobe;localStorage.setItem("junto_profile",JSON.stringify(local));
      }catch(_){}
      window.dispatchEvent(new CustomEvent("jf-wardrobe-save",{detail:{wardrobe}}));
      window.dispatchEvent(new CustomEvent("jf-avatar-created",{detail:{profile:data.profile}}));
      modal.classList.remove("jf-avatar-setup");document.body.classList.remove("jf-avatar-setup-active");
      close?.click();
    }catch(error){
      statusNode.textContent=error.message||"Falha ao salvar. Tente novamente.";
      save.disabled=false;
    }
  }
  async function check(){
    if(checking||active||finished)return;
    checking=true;
    try{
      const response=await fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)return;
      const data=await response.json();
      if(data.loggedIn&&data.profile&&!data.profile.avatarSetupCompleted)prepare(data.profile);
      else if(data.profile?.avatarSetupCompleted)finished=true;
    }catch(_){}
    finally{checking=false;}
  }
  // Account hydration fires this after login without a full page reload.
  window.addEventListener("jf-local-profile-updated",()=>{if(!active&&!finished)void check();});
  window.addEventListener("jf-avatar-created",()=>{finished=true;});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void check(),{once:true});
  else void check();
})();
