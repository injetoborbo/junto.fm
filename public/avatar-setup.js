(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let active=false,checking=false,finished=false,devkitPreviewMode=false,category="outfit",originals=null,currentProfile=null;
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
  async function openAvatarLabFromDevkit(){
    if(active)return;
    let profile=null;
    try{
      const response=await fetch("/api/account/status",{credentials:"same-origin",cache:"no-store"});
      if(response.ok){
        const data=await response.json();
        if(data.loggedIn&&data.profile)profile=data.profile;
      }
    }catch(_){}
    if(!profile){
      profile={name:"DevKit Preview",username:"github-admin",devkitPreview:true};
      devkitPreviewMode=true;
    }else devkitPreviewMode=false;
    currentProfile=profile;finished=false;
    prepare(profile,true);
  }
  window.addEventListener("jf-admin-open-avatar-lab",()=>void openAvatarLabFromDevkit());
  async function mountGlobalDevkit(){
    if(document.querySelector(".jf-global-devkit-launch"))return;
    try{
      const response=await fetch("/api/admin/status",{credentials:"same-origin",cache:"no-store"});
      const access=response.ok?await response.json():{};
      if(access.admin!==true)return;
    }catch(_){return;}
    const launch=document.createElement("button");
    launch.type="button";launch.className="jf-global-devkit-launch";
    launch.textContent="⚙ DevKit";launch.setAttribute("aria-expanded","false");
    launch.setAttribute("aria-label","Abrir ferramentas de desenvolvimento");
    const panel=document.createElement("section");panel.className="jf-global-devkit-panel";panel.hidden=true;
    const title=document.createElement("strong");title.textContent="DEVKIT · JUNTO.FM";
    const note=document.createElement("p");note.textContent="GitHub admin conectado. Abra o Avatar Lab para testar a nova aba e inspecionar o rig.";
    const here=document.createElement("button");here.type="button";here.textContent="Abrir Avatar Lab aqui";
    const newTab=document.createElement("button");newTab.type="button";newTab.textContent="Abrir Avatar Lab em nova aba";
    const status=document.createElement("span");status.className="jf-global-devkit-status";status.setAttribute("role","status");
    status.textContent="Ferramentas administrativas ativas.";
    panel.append(title,note,here,newTab,status);document.body.append(launch,panel);
    launch.addEventListener("click",()=>{
      panel.hidden=!panel.hidden;launch.setAttribute("aria-expanded",String(!panel.hidden));
      launch.textContent=panel.hidden?"⚙ DevKit":"⚙ Fechar DevKit";
    });
    here.addEventListener("click",()=>{
      panel.hidden=true;launch.setAttribute("aria-expanded","false");launch.textContent="⚙ DevKit";
      window.dispatchEvent(new CustomEvent("jf-admin-open-avatar-lab"));
    });
    newTab.addEventListener("click",()=>{
      const url=new URL(location.href);url.search="";url.hash="";url.searchParams.set("jfDevkitAvatar","1");
      const opened=window.open(url.href,"_blank","noopener");
      status.textContent=opened?"Avatar Lab aberto em outra aba.":"O navegador bloqueou a nova aba; permita pop-ups para este site.";
    });
    if(new URLSearchParams(location.search).get("jfDevkitAvatar")==="1"){
      status.textContent="Preparando prévia do Avatar Lab...";
      window.dispatchEvent(new CustomEvent("jf-admin-open-avatar-lab"));
    }
  }
  async function mountDevkit(stage){
    if(!stage||stage.querySelector(".jf-avatar-devkit-launch"))return;
    try{
      const response=await fetch("/api/admin/status",{credentials:"same-origin",cache:"no-store"});
      const access=response.ok?await response.json():{};
      if(access.admin!==true||!active||!stage.isConnected)return;
    }catch(_){return;}
    const launch=document.createElement("button");
    launch.type="button";launch.className="jf-avatar-devkit-launch";
    launch.textContent="⚙ DevKit";launch.setAttribute("aria-expanded","false");
    const panel=document.createElement("section");panel.className="jf-avatar-devkit-panel";panel.hidden=true;
    panel.setAttribute("aria-label","DevKit de coordenadas do Avatar Lab");
    const title=document.createElement("strong");title.textContent="DEVKIT · POSIÇÕES 3D";
    const note=document.createElement("p");note.textContent="Agora dá para editar: escolha avatar, roupa, acessório ou osso; ajuste posição, rotação e escala e aplique ao vivo. As mudanças são de prévia, não salvam no servidor.";
    const editTitle=document.createElement("strong");editTitle.textContent="EDITOR DE TRANSFORM";
    const targetSelect=document.createElement("select");targetSelect.className="jf-avatar-devkit-target";
    targetSelect.setAttribute("aria-label","Selecionar parte do avatar para editar");
    const transformGrid=document.createElement("div");transformGrid.className="jf-avatar-devkit-transform-grid";
    const inputs={position:[],rotation:[],scale:[]};
    const axisNames=["X","Y","Z"];
    const makeGroup=(key,label,unit,defaults)=>{
      const group=document.createElement("fieldset");group.className="jf-avatar-devkit-fieldset";
      const legend=document.createElement("legend");legend.textContent=label;group.append(legend);
      axisNames.forEach((axis,index)=>{
        const labelEl=document.createElement("label");labelEl.textContent=axis;
        const input=document.createElement("input");input.type="number";input.step=key==="rotation"?"1":"0.01";input.value=String(defaults[index]);input.dataset.transform=key;input.dataset.axis=String(index);input.setAttribute("aria-label",label+" "+axis+" ("+unit+")");
        inputs[key].push(input);labelEl.append(input);group.append(labelEl);
      });
      return group;
    };
    transformGrid.append(makeGroup("position","Posição","m",[0,0,0]),makeGroup("rotation","Rotação","graus",[0,0,0]),makeGroup("scale","Escala","x",[1,1,1]));
    const editActions=document.createElement("div");editActions.className="jf-avatar-devkit-actions";
    const applyTransform=document.createElement("button");applyTransform.type="button";applyTransform.textContent="Aplicar ao vivo";
    const resetTransform=document.createElement("button");resetTransform.type="button";resetTransform.textContent="Restaurar original";
    editActions.append(applyTransform,resetTransform);
    const actions=document.createElement("div");actions.className="jf-avatar-devkit-actions";
    const refresh=document.createElement("button");refresh.type="button";refresh.textContent="Atualizar peças / JSON";
    const copy=document.createElement("button");copy.type="button";copy.textContent="Copiar posições";
    const copyPlate=document.createElement("button");copyPlate.type="button";copyPlate.textContent="Copiar placa + mãos";
    const output=document.createElement("textarea");output.readOnly=true;output.rows=6;output.spellcheck=false;
    output.setAttribute("aria-label","JSON de coordenadas atual");
    const status=document.createElement("span");status.className="jf-avatar-devkit-status";status.setAttribute("role","status");
    status.textContent="Selecione uma parte, altere X/Y/Z e aplique para ver no modelo.";
    actions.append(refresh,copy,copyPlate);panel.append(title,note,editTitle,targetSelect,transformGrid,editActions,actions,output,status);
    const fillTransform=()=>{
      const api=window.jfAvatarLabDevkit,id=targetSelect.value;
      const value=api?.getTransform?.(id);if(!value)return;
      ["position","rotation","scale"].forEach(key=>value[key].forEach((number,index)=>{
        inputs[key][index].value=String(Number((key==="rotation"?number*180/Math.PI:number).toFixed(4)));
      }));
    };
    const refreshTargets=()=>{
      const api=window.jfAvatarLabDevkit;
      if(!api?.getTargets){status.textContent="3D carregando… aguarde os modelos e tente novamente.";return false;}
      const previous=targetSelect.value,targets=api.getTargets();
      const existing=[...targetSelect.options].map(option=>option.value);
      const incoming=targets.map(target=>target.id);
      if(existing.length===incoming.length&&existing.every((id,index)=>id===incoming[index]))return targets.length>0;
      targetSelect.replaceChildren();
      targets.forEach(target=>{
        const option=document.createElement("option");option.value=target.id;option.textContent=target.group+" · "+target.label;targetSelect.append(option);
      });
      if(targets.some(target=>target.id===previous))targetSelect.value=previous;
      fillTransform();return targets.length>0;
    };
    const onDevkitTargetAdded=()=>{
      if(!panel.hidden&&refreshTargets())status.textContent="Roupa/acessório carregado e disponível no seletor.";
    };
    window.addEventListener("jf-avatar-devkit-target-added",onDevkitTargetAdded);
    targetSelect.addEventListener("change",fillTransform);
    applyTransform.addEventListener("click",()=>{
      const api=window.jfAvatarLabDevkit,id=targetSelect.value;
      if(!api?.setTransform){status.textContent="Rig indisponível. Atualize quando o 3D terminar de carregar.";return;}
      const read=key=>inputs[key].map(input=>Number(input.value));
      const transform={position:read("position"),rotation:read("rotation").map(value=>value*Math.PI/180),scale:read("scale")};
      if(Object.values(transform).flat().every(Number.isFinite)&&api.setTransform(id,transform)){
        snapshot();status.textContent="Transform aplicado ao vivo. É uma prévia: ainda não foi salvo permanentemente.";
      }else status.textContent="Valores inválidos ou parte não encontrada.";
    });
    resetTransform.addEventListener("click",()=>{
      const api=window.jfAvatarLabDevkit;
      if(api?.resetTransform?.(targetSelect.value)){fillTransform();status.textContent="Transform original restaurado.";snapshot();}
      else status.textContent="Original ainda não capturado; selecione novamente e tente.";
    });
    stage.append(launch,panel);
    const snapshot=()=>{
      const api=window.jfAvatarLabDevkit;
      if(!api?.getSnapshot){status.textContent="3D ainda carregando. Aguarde e atualize.";return null;}
      try{
        const data=api.getSnapshot();output.value=JSON.stringify(data,null,2);
        status.textContent="Snapshot atualizado · "+new Date(data.captured_at).toLocaleTimeString();
        return data;
      }catch(error){status.textContent="Falha ao ler o rig: "+(error?.message||error);return null;}
    };
    const copyText=async(value)=>{
      output.value=value;
      output.focus();output.select();
      try{
        await navigator.clipboard.writeText(value);
        status.textContent="Copiado! Cole o JSON aqui na conversa.";
      }catch(_){
        try{
          const copied=document.execCommand("copy");
          status.textContent=copied?"Copiado! Cole o JSON aqui na conversa.":"Texto selecionado — pressione Ctrl+C e envie aqui.";
        }catch(__){status.textContent="Texto selecionado — pressione Ctrl+C e envie aqui.";}
      }
    };
    launch.addEventListener("click",()=>{
      panel.hidden=!panel.hidden;launch.setAttribute("aria-expanded",String(!panel.hidden));
      launch.textContent=panel.hidden?"⚙ DevKit":"⚙ Fechar DevKit";
      if(!panel.hidden){refreshTargets();snapshot();}
    });
    refresh.addEventListener("click",()=>{refreshTargets();snapshot();});
    copy.addEventListener("click",()=>{const data=snapshot();if(data)void copyText(JSON.stringify(data,null,2));});
    copyPlate.addEventListener("click",()=>{
      const data=snapshot();if(!data)return;
      void copyText(JSON.stringify({captured_at:data.captured_at,units:data.units,
        plate:data.identification_plate,hands:data.hands},null,2));
    });
    if(originals){originals.devkitLaunch=launch;originals.devkitPanel=panel;originals.devkitTargetListener=onDevkitTargetAdded;}
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
      void mountDevkit(stage);
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
    save.textContent="CONFIRMAR PERSONAGEM";save.classList.add("jf-avatar-setup-confirm");save.hidden=Boolean(profile?.devkitPreview);
    if(originalSaveRow)originalSaveRow.remove();
    if(profile?.devkitPreview){
      footnote.innerHTML='<strong>Prévia do DevKit</strong><span>Modo de teste: nada será salvo na conta.</span>';
      const closePreview=document.createElement("button");closePreview.type="button";closePreview.className="btn jf-avatar-setup-confirm";closePreview.textContent="FECHAR PRÉVIA";
      closePreview.addEventListener("click",()=>{restoreWardrobeDialog();close?.click();});
      actions.append(closePreview);originals.previewClose=closePreview;
    }else actions.append(save);
    footer.append(footnote,actions);
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
    const {oldHead,oldDescription,stage,preview,fields,fieldChildren,status,originalSaveRow,footer,heading,devkitLaunch,devkitPanel}=originals;
    if(fields)fields.replaceChildren(...fieldChildren);
    stage?.classList.remove("jf-avatar-studio-stage");
    stage?.querySelector(".jf-avatar-stage-topline")?.remove();
    stage?.querySelector(".jf-avatar-stage-bottomline")?.remove();
    if(preview){delete preview.dataset.avatarStudio;delete preview.dataset.avatarPlateName;delete preview.dataset.avatarPlateHandle;}
    status?.classList.remove("jf-avatar-stage-status");
    devkitLaunch?.remove();devkitPanel?.remove();if(originals?.devkitTargetListener)window.removeEventListener("jf-avatar-devkit-target-added",originals.devkitTargetListener);originals?.previewClose?.remove();save.hidden=false;devkitPreviewMode=false;
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
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{void check();void mountGlobalDevkit();},{once:true});
  else {void check();void mountGlobalDevkit();}
})();
