(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let active=false,checking=false,finished=false,category="outfit",originals=null,currentProfile=null;
  const keys=["hat","glasses","headphones","outfit"];
  const defaults={hat:"nenhum",glasses:"nenhum",headphones:"nenhum",outfit:"padrao"};
  const meta={
    hat:{title:"Cabeça",eyebrow:"CHAPÉUS E ESTILO",copy:"Escolha o que vai no topo do seu visual.",icon:"⌑",
      icons:{nenhum:"—",bone:"🧢",apocaliptico:"☠",gorro:"◒",palha:"🌾",branco:"☀",caveira:"💀"}},
    glasses:{title:"Rosto",eyebrow:"OLHOS E EXPRESSÃO",copy:"Um detalhe muda a personalidade toda.",icon:"◉",
      icons:{nenhum:"—",escuros:"🕶",redondos:"👓",sem_aro:"◉",botao:"🧵"}},
    headphones:{title:"Acessórios",eyebrow:"SOM E IDENTIDADE",copy:"O Junto também tem seu próprio som.",icon:"♫",
      icons:{nenhum:"—",azul:"🎧",rosa:"🎧",preto:"🎧"}},
    outfit:{title:"Roupas",eyebrow:"SEU JEITO DE CHEGAR",copy:"Escolha a roupa que vai representar você.",icon:"◇",
      icons:{padrao:"◈",rosa:"🌸",rosa_novo:"👗",punk:"⚡"}}
  };
  const modal=$("jfWardrobeModal"),dialog=modal?.querySelector(".jf-wardrobe-modal");
  const save=$("jfSaveWardrobe"),close=$("jfCloseWardrobe"),open=$("jfOpenWardrobe");
  const reopenButton=document.createElement("button");
  reopenButton.type="button";reopenButton.id="jfAvatarStudioReopen";reopenButton.className="btn secondary jf-avatar-studio-reopen";
  reopenButton.textContent="✦ Abrir estúdio de personagem";reopenButton.hidden=true;
  const wardrobeDescription=dialog?.querySelector(":scope > p.small");
  wardrobeDescription?.after(reopenButton);
  reopenButton.addEventListener("click",()=>{
    if(!currentProfile||active)return;
    finished=false;
    prepare(currentProfile,true);
  });
  const statusNode=document.createElement("p");
  statusNode.className="jf-avatar-setup-status";statusNode.setAttribute("role","status");statusNode.setAttribute("aria-live","polite");
  statusNode.textContent="Suas escolhas aparecem no personagem em tempo real.";
  function nameplate(profile){
    const name=String(profile?.name||"Macaco").trim().slice(0,24)||"Macaco";
    const handle=String(profile?.username||"").trim().slice(0,24);
    return {name,handle:handle?"@"+handle:"JUNTO.FM"};
  }
  function makeChoiceCards(key,select){
    const group=document.createElement("div");group.className="jf-avatar-choice-grid";
    group.setAttribute("role","group");group.setAttribute("aria-label",meta[key].title);
    [...select.options].forEach(option=>{
      const card=document.createElement("button");card.type="button";card.className="jf-avatar-choice";
      card.dataset.value=option.value;card.setAttribute("aria-pressed",String(option.value===select.value));
      if(option.value===select.value)card.classList.add("selected");
      const icon=document.createElement("span");icon.className="jf-avatar-choice-icon";icon.textContent=meta[key].icons[option.value]||"✦";
      const text=document.createElement("span");text.className="jf-avatar-choice-label";text.textContent=option.textContent.trim();
      card.append(icon,text);card.addEventListener("click",()=>{
        select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));
        syncChoices(key,select.value);statusNode.textContent=text.textContent+" selecionado.";
      });
      group.append(card);
    });
    return group;
  }
  function syncChoices(key,value){
    document.querySelectorAll(".jf-avatar-choice[data-slot='"+key+"']").forEach(card=>{
      const selected=card.dataset.value===value;card.classList.toggle("selected",selected);
      card.setAttribute("aria-pressed",String(selected));
    });
  }
  function activateCategory(key){
    category=key;
    document.querySelectorAll(".jf-avatar-category-tab").forEach(tab=>{
      const selected=tab.dataset.category===key;tab.classList.toggle("active",selected);tab.setAttribute("aria-selected",String(selected));
    });
    document.querySelectorAll(".jf-avatar-category-panel").forEach(panel=>{panel.hidden=panel.dataset.categoryPanel!==key;});
  }
  function buildAppearancePanel(fields){
    const selects={};
    const nativeControls=document.createElement("div");nativeControls.className="jf-avatar-native-controls";
    for(const key of keys){
      const select=$("jfWardrobe"+key[0].toUpperCase()+key.slice(1));
      if(!select)continue;
      selects[key]=select;
      const label=select.closest("label");
      if(label){label.classList.add("jf-avatar-native-control");nativeControls.append(label);}
    }
    const header=document.createElement("div");header.className="jf-avatar-controls-heading";
    header.innerHTML='<span>PERSONALIZAÇÃO</span><h2>Seu personagem</h2><p>Escolha os detalhes. O macaco muda na hora.</p>';
    const tabs=document.createElement("div");tabs.className="jf-avatar-category-tabs";tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Categorias do personagem");
    const panels=document.createElement("div");panels.className="jf-avatar-category-panels";
    for(const key of keys){
      const tab=document.createElement("button");tab.type="button";tab.className="jf-avatar-category-tab";tab.dataset.category=key;
      tab.setAttribute("role","tab");tab.setAttribute("aria-selected","false");
      const icon=document.createElement("span");icon.textContent=meta[key].icon;
      const label=document.createElement("span");label.textContent=meta[key].title;
      tab.append(icon,label);tab.addEventListener("click",()=>activateCategory(key));tabs.append(tab);
      const panel=document.createElement("section");panel.className="jf-avatar-category-panel";panel.dataset.categoryPanel=key;
      const intro=document.createElement("div");intro.className="jf-avatar-category-copy";
      const eyebrow=document.createElement("span");eyebrow.textContent=meta[key].eyebrow;
      const title=document.createElement("h3");title.textContent=meta[key].title;
      const copy=document.createElement("p");copy.textContent=meta[key].copy;
      intro.append(eyebrow,title,copy);panel.append(intro);
      const grid=makeChoiceCards(key,selects[key]);grid.querySelectorAll(".jf-avatar-choice").forEach(card=>card.dataset.slot=key);
      panel.append(grid);panels.append(panel);
    }
    const tools=document.createElement("div");tools.className="jf-avatar-studio-tools";
    const random=document.createElement("button");random.type="button";random.className="jf-avatar-random";
    random.innerHTML='<span aria-hidden="true">✧</span> Surpreenda-me';
    random.addEventListener("click",()=>{
      for(const key of keys){
        const select=selects[key];if(!select)continue;
        const options=[...select.options];select.value=options[Math.floor(Math.random()*options.length)].value;
        select.dispatchEvent(new Event("change",{bubbles:true}));syncChoices(key,select.value);
      }
      statusNode.textContent="Novo visual sorteado. Gostou? Pode confirmar ou continuar editando.";
    });
    const rotate=document.createElement("span");rotate.className="jf-avatar-rotate-hint";rotate.textContent="↔ Arraste o macaco para girar";
    tools.append(random,rotate);fields.replaceChildren(header,tabs,panels,tools,nativeControls);
    activateCategory("outfit");
  }
  function prepare(profile,force=false){
    if(!modal||!dialog||!save||active||finished&&!force)return;
    active=true;
    modal.classList.add("jf-avatar-setup");
    document.body.classList.add("jf-avatar-setup-active");
    const oldHead=dialog.querySelector(".jf-modal-head");
    const oldDescription=dialog.querySelector(":scope > p.small");
    const layout=dialog.querySelector(".jf-wardrobe-layout");
    const stage=layout?.querySelector("#jfWardrobePreview")?.parentElement;
    const preview=$("jfWardrobePreview");
    const fields=layout?.querySelector(".jf-wardrobe-fields");
    const status=$("jfWardrobeAssetStatus");
    const originalSaveRow=save.closest(".row");
    originals={oldHead,oldDescription,stage,preview,fields,fieldChildren:fields?[...fields.childNodes]:[],status,originalSaveRow,footer:null,heading:null};
    if(oldHead)oldHead.hidden=true;
    if(close)close.hidden=true;
    if(oldDescription)oldDescription.hidden=true;
    if(stage&&preview){
      stage.classList.add("jf-avatar-studio-stage");
      preview.dataset.avatarStudio="true";
      const identity=nameplate(profile);
      preview.dataset.avatarPlateName=identity.name;
      preview.dataset.avatarPlateHandle=identity.handle;
      const top=document.createElement("div");top.className="jf-avatar-stage-topline";
      top.innerHTML='<span>JUNTO.FM <i>／</i> ESTÚDIO DE PERSONAGENS</span><span>REGISTRO 001</span>';
      const bottom=document.createElement("div");bottom.className="jf-avatar-stage-bottomline";
      bottom.innerHTML='<span>SEU AVATAR · SUA IDENTIDADE</span><span>↔ GIRE PARA CONFERIR</span>';
      stage.append(top,bottom);originals.stageTop=top;originals.stageBottom=bottom;
      status?.classList.add("jf-avatar-stage-status");
    }
    const heading=document.createElement("header");heading.className="jf-avatar-studio-header";
    const brand=document.createElement("div");brand.className="jf-avatar-studio-brand";
    brand.innerHTML='<span class="jf-avatar-studio-mark">♫</span><span><small>JUNTO.FM / AVATAR LAB</small><strong>Crie seu personagem</strong></span>';
    const step=document.createElement("div");step.className="jf-avatar-studio-step";
    step.innerHTML='<span>01</span><span>DEFINIÇÃO DE IDENTIDADE</span>';
    heading.append(brand,step);dialog.prepend(heading);originals.heading=heading;
    if(fields)buildAppearancePanel(fields);
    const footer=document.createElement("footer");footer.className="jf-avatar-studio-footer";originals.footer=footer;
    const footnote=document.createElement("div");footnote.className="jf-avatar-studio-footnote";
    footnote.innerHTML='<strong>Pronto para entrar?</strong><span>Seu macaco será salvo como seu avatar oficial.</span>';
    const actions=document.createElement("div");actions.className="jf-avatar-studio-actions";
    save.textContent="CONFIRMAR PERSONAGEM";save.classList.add("jf-avatar-setup-confirm");
    if(originalSaveRow)originalSaveRow.remove();
    actions.append(save);footer.append(footnote,actions);
    statusNode.textContent="As mudanças são aplicadas no modelo 3D em tempo real.";
    footer.append(statusNode);dialog.append(footer);
    modal.addEventListener("click",event=>{if(active&&event.target===modal){event.preventDefault();event.stopImmediatePropagation();}},true);
    document.addEventListener("keydown",event=>{
      if(active&&event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    save.addEventListener("click",complete,true);
    open?.click();
    fields?.querySelector(".jf-avatar-category-tab")?.focus({preventScroll:true});
  }
  function restoreWardrobeDialog(){
    if(!originals)return;
    const {oldHead,oldDescription,stage,preview,fields,fieldChildren,status,originalSaveRow,footer,heading}=originals;
    if(fields)fields.replaceChildren(...fieldChildren);
    stage?.classList.remove("jf-avatar-studio-stage");
    stage?.querySelector(".jf-avatar-stage-topline")?.remove();
    stage?.querySelector(".jf-avatar-stage-bottomline")?.remove();
    if(preview){delete preview.dataset.avatarStudio;delete preview.dataset.avatarPlateName;delete preview.dataset.avatarPlateHandle;}
    status?.classList.remove("jf-avatar-stage-status");
    if(oldHead)oldHead.hidden=false;
    if(oldDescription)oldDescription.hidden=false;
    if(close)close.hidden=false;
    heading?.remove();footer?.remove();statusNode.remove();
    if(originalSaveRow){
      save.textContent="Salvar traje";save.classList.remove("jf-avatar-setup-confirm");save.disabled=false;
      originalSaveRow.append(save);dialog.append(originalSaveRow);
    }
    modal.classList.remove("jf-avatar-setup");document.body.classList.remove("jf-avatar-setup-active");
    originals=null;
  }
  async function complete(event){
    if(!active||finished)return;
    event.preventDefault();event.stopImmediatePropagation();
    save.disabled=true;statusNode.textContent="Salvando seu personagem...";
    const wardrobe={};
    for(const key of keys){
      const select=$("jfWardrobe"+key[0].toUpperCase()+key.slice(1));
      wardrobe[key]=select?.value||defaults[key];
    }
    try{
      const response=await fetch("/api/avatar/setup",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({wardrobe})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||"Não foi possível salvar agora.");
      finished=true;active=false;
      try{const local=JSON.parse(localStorage.getItem("junto_profile")||"{}");local.wardrobe=wardrobe;localStorage.setItem("junto_profile",JSON.stringify(local));}catch(_){}
      window.dispatchEvent(new CustomEvent("jf-wardrobe-save",{detail:{wardrobe}}));
      window.dispatchEvent(new CustomEvent("jf-avatar-created",{detail:{profile:data.profile}}));
      restoreWardrobeDialog();
      close?.click();
    }catch(error){
      statusNode.textContent=error.message||"Falha ao salvar. Tente novamente.";save.disabled=false;
    }
  }
  async function check(){
    if(checking||active||finished)return;
    checking=true;
    try{
      const response=await fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)return;
      const data=await response.json();
      currentProfile=data.loggedIn?data.profile:null;
      reopenButton.hidden=!currentProfile;
      if(data.loggedIn&&data.profile&&!data.profile.avatarSetupCompleted)prepare(data.profile);
      else if(data.profile?.avatarSetupCompleted)finished=true;
    }catch(_){}
    finally{checking=false;}
  }
  window.addEventListener("jf-local-profile-updated",()=>{if(!active&&!finished)void check();});
  window.addEventListener("jf-avatar-created",()=>{finished=true;});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void check(),{once:true});
  else void check();
})();
