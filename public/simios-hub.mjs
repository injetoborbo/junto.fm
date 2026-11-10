/* Controles da Arena de Macacos e dos Pludogos, sem bibliotecas extras.
 * Todas as regras da luta permanecem no servidor Socket.IO.
 */
const PET_KEY="jf-pludogo-choice-v1";
const PETS=new Set(["nenhum","caramelo","noturno","rosinha"]);
const labelOf={soco:"Soco",forte:"Golpe forte",defender:"Defesa"};
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));

export function initSimiosHub({socket,bridge,getPeople,isActive}){
  const el=id=>document.getElementById(id);
  const root=el("jfSimiosHub");
  if(!socket||!root)return {onEnter(){},onPresence(){},onLeave(){}};
  const tabs=[...root.querySelectorAll("[data-jf-simios-tab]")];
  const panels=[...root.querySelectorAll("[data-jf-simios-panel]")];
  const opponent=el("jfFightOpponent"),challenge=el("jfFightChallenge");
  const invite=el("jfFightInvite"),inviteName=el("jfFightInviteName");
  const battle=el("jfFightBattle"),notice=el("jfFightNotice");
  const petSelect=el("jfPludogoSelect"),petStatus=el("jfPludogoStatus");
  const actions=[...root.querySelectorAll("[data-jf-fight-action]")];
  let currentState={phase:"idle"},pendingInvite=null,chosen="nenhum",lastVisualMove="";
  const own=()=>socket.id;
  const nameOf=id=>{
    const profile=id===own()?bridge?.getProfile?.():bridge?.getPeerProfile?.(id);
    return String(profile?.name||"Macaco").slice(0,30);
  };
  const msg=text=>{notice.textContent=String(text||"").slice(0,170);};
  try{
    const saved=localStorage.getItem(PET_KEY);
    if(PETS.has(saved))chosen=saved;
  }catch(_){}
  petSelect.value=chosen;
  const equip=()=>{
    if(!isActive()||!socket.connected)return;
    socket.emit("simios-pet-equip",{type:chosen});
  };
  petSelect.addEventListener("change",()=>{
    const value=petSelect.value;
    if(!PETS.has(value))return;
    chosen=value;
    try{localStorage.setItem(PET_KEY,chosen);}catch(_){}
    petStatus.textContent=chosen==="nenhum"?"Você guardou seu Pludogo.":"Pludogo escolhido! Ele acompanha seu macaco na pista.";
    equip();
  });
  const showTab=tab=>{
    for(const item of tabs){
      const on=item.dataset.jfSimiosTab===tab;
      item.setAttribute("aria-pressed",String(on));
      item.classList.toggle("active",on);
    }
    for(const panel of panels)panel.hidden=panel.dataset.jfSimiosPanel!==tab;
    if(tab==="luta")render();
  };
  for(const item of tabs)item.addEventListener("click",()=>{
    const tab=item.dataset.jfSimiosTab;
    const open=!item.classList.contains("active");
    if(open)showTab(tab);
    else {
      for(const button of tabs){button.classList.remove("active");button.setAttribute("aria-pressed","false");}
      for(const panel of panels)panel.hidden=true;
    }
  });
  function refreshOpponents(){
    const current=opponent.value;
    opponent.replaceChildren();
    const entries=[...getPeople().keys()].filter(id=>id!==own()).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    for(const id of entries){
      const option=document.createElement("option");
      option.value=id;option.textContent=nameOf(id);
      opponent.appendChild(option);
    }
    if(entries.includes(current))opponent.value=current;
    opponent.disabled=entries.length===0;
    challenge.disabled=entries.length===0||currentState.phase==="playing"||!isActive();
    if(!entries.length)msg("Entre com outro macaco na pista para desafiar.");
  }
  challenge.addEventListener("click",()=>{
    if(!isActive()||opponent.disabled||!opponent.value)return;
    socket.emit("simios-fight-challenge",{targetId:opponent.value});
  });
  el("jfFightAccept").addEventListener("click",()=>{
    if(!pendingInvite)return;
    socket.emit("simios-fight-respond",{accept:true});
    pendingInvite=null;invite.hidden=true;
  });
  el("jfFightDecline").addEventListener("click",()=>{
    if(!pendingInvite)return;
    socket.emit("simios-fight-respond",{accept:false});
    pendingInvite=null;invite.hidden=true;
  });
  for(const button of actions)button.addEventListener("click",()=>{
    if(currentState.phase!=="playing"||currentState.turn!==own())return;
    socket.emit("simios-fight-act",{kind:button.dataset.jfFightAction});
  });
  function render(){
    const fight=currentState;
    battle.hidden=!["playing","finished"].includes(fight.phase);
    if(fight.phase==="idle"){refreshOpponents();return;}
    const players=fight.players||[];
    for(let i=0;i<2;i++){
      const id=players[i],side=i===0?"A":"B";
      el("jfFightName"+side).textContent=id?nameOf(id):"Macaco";
      const hp=clamp(fight.hp?.[id]),energy=clamp(fight.energy?.[id]);
      el("jfFightHp"+side).style.width=hp+"%";
      el("jfFightHpText"+side).textContent=hp+"/100";
      el("jfFightEnergy"+side).style.width=energy+"%";
      el("jfFightEnergyText"+side).textContent=energy+"/100";
    }
    const myTurn=fight.phase==="playing"&&fight.turn===own();
    const involved=players.includes(own());
    for(const button of actions){
      const cost=button.dataset.jfFightAction==="forte"?30:
        button.dataset.jfFightAction==="soco"?12:0;
      button.disabled=!myTurn||clamp(fight.energy?.[own()])<cost;
    }
    if(fight.phase==="finished"){
      el("jfFightTurn").textContent=fight.winner
        ?"🥇 "+nameOf(fight.winner)+" venceu!":String(fight.message||"Luta encerrada.");
    }else el("jfFightTurn").textContent=myTurn?"⚡ Sua vez! Escolha o golpe.":
      involved?"⏳ Vez de "+nameOf(fight.turn):"👀 Assistindo à luta na sala.";
    const move=fight.lastMove;
    // Animacao curta do soco/defesa, sem novos modelos 3D ou bibliotecas.
    const visualKey=move?move.by+":"+move.at+":"+move.kind:"";
    if(move&&visualKey!==lastVisualMove){
      lastVisualMove=visualKey;
      const attackingSide=players.indexOf(move.by)===0?"A":"B";
      const targetSide=players.indexOf(move.to)===0?"A":"B";
      const attacker=el("jfFightFace"+attackingSide);
      const targetFace=el("jfFightFace"+targetSide);
      if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches!==true){
        attacker?.animate?.(
          move.kind==="defender"?
            [{transform:"scale(1)"},{transform:"scale(1.18)",filter:"drop-shadow(0 0 8px #6cdcff)"},{transform:"scale(1)"}]:
            [{transform:"translateX(0)"},{transform:"translateX("+(attackingSide==="A"?25:-25)+"px) scale(1.18)"},{transform:"translateX(0)"}],
          {duration:450,easing:"ease-out"});
        if(move.kind!=="defender")targetFace?.animate?.(
          [{transform:"translateX(0)"},{transform:"translateX(-6px) rotate(-8deg)"},{transform:"translateX(7px) rotate(8deg)"},{transform:"translateX(0)"}],
          {duration:400});
      }
    }
    el("jfFightLastMove").textContent=move
      ?nameOf(move.by)+" usou "+(labelOf[move.kind]||"golpe")+
        (move.kind==="defender"?" e recuperou energia.":" e causou "+move.damage+" de dano.")
      :"Os dois macacos estão prontos para lutar!";
    refreshOpponents();
  }
  socket.on("simios-fight-invite",event=>{
    if(!isActive()||!event?.from)return;
    pendingInvite=event;
    inviteName.textContent=nameOf(event.from)+" te desafiou para uma luta!";
    invite.hidden=false;
    showTab("luta");
  });
  socket.on("simios-fight-state",state=>{
    if(!isActive())return;
    currentState=state&&typeof state==="object"?state:{phase:"idle"};
    if(currentState.phase==="playing"){
      pendingInvite=null;invite.hidden=true;
      if((currentState.players||[]).includes(own()))showTab("luta");
    }
    render();
  });
  socket.on("simios-fight-notice",({message}={})=>{
    if(!isActive())return;
    msg(message);
    // Um aviso de recusa/expiracao encerra o convite pendente.
    if(/recus|expir|cancelad/i.test(String(message))){
      pendingInvite=null;invite.hidden=true;
    }
  });
  return {
    onEnter(){equip();socket.emit("simios-fight-sync");refreshOpponents();},
    onPresence(){refreshOpponents();if(currentState.phase!=="idle")render();},
    onLeave(){
      currentState={phase:"idle"};pendingInvite=null;lastVisualMove="";
      invite.hidden=true;battle.hidden=true;msg("");
      for(const item of tabs){item.classList.remove("active");item.setAttribute("aria-pressed","false");}
      for(const panel of panels)panel.hidden=true;
    }
  };
}
