/* Arena de combate 3D separada da balada.
 * Carrega os mesmos GLBs do macaco pela API do guarda-roupa.
 * O Socket.IO do servidor decide quem acerta/erra, HP e vencedor.
 */
import * as THREE from "https://esm.sh/three@0.170.0";
import {createDanceAvatar,setDanceAvatarTestModel} from "./wardrobe.js?v=arena-fit-4";
import {loadOutcomeAnimation,bindOutcomeAnimation} from "./simios-outcome-animation.js?v=4";
import {bindCombatRig} from "./simios-fight-pose.mjs";

const $=id=>document.getElementById(id);
const bridge=window.jfDanceBridge;
const socket=bridge?.socket;
const modal=$("jfArenaModal");
const viewport=$("jfArenaViewport");
if(socket&&modal&&viewport){
  const result=$("jfArenaResult");
  const resultTitle=$("jfArenaResultTitle");
  const resultDetails=$("jfArenaResultDetails");
  const status=$("jfArenaStatus");
  const actions=[...modal.querySelectorAll("[data-jf-arena-action]")];
  const opponent=$("jfArenaOpponent");
  const invite=$("jfArenaInvite");
  const lobby=$("jfArenaChallenge").parentElement;
  let current={phase:"idle"},inviteFrom=null,previewOutcome=null;
  let open=false,loading=false,setupGeneration=0;
  let renderer=null,scene=null,camera=null,resizeObserver=null,raf=0;
  let actors=[],lastActionKey="",actionAt=0,finishAt=0,finishedSignature="",ignoredOutcome="";
  let sharedRigLoad=null;
  let statusOverride="",outcomeActor=null,outcomeStarted=0;
  const outcomeAssets={};
  const outcomeViewport=$("jfArenaResultAvatar");
  function resetOutcome(){
    outcomeActor=null;previewOutcome=null;
    if(renderer&&viewport)viewport.appendChild(renderer.domElement);
    for(const actor of actors){actor.avatar.group.visible=true;for(const animation of Object.values(actor.outcomes))animation.reset();}
    if(camera){camera.position.set(0,2.08,7.6);camera.lookAt(0,.67,0);}
  }
  const costs={soco:12,chute:22,forte:30,defender:0};
  const now=()=>performance.now();
  const safeName=id=>{
    const p=id===socket.id?bridge.getProfile?.():bridge.getPeerProfile?.(id);
    return String(p?.name||"Macaco").slice(0,24);
  };
  const setStatus=text=>{status.textContent=String(text||"").slice(0,240);};
  const inRoom=()=>Boolean(socket.connected&&bridge.getRoom?.());
  const showInvite=()=>{invite.hidden=!inviteFrom;};
  const hidden=el=>el.hidden=true;
  function listOpponents(){
    const selected=opponent.value;
    opponent.replaceChildren();
    const ids=(bridge.getPeerIds?.()||[]).filter(id=>id!==socket.id);
    for(const id of ids){
      const option=document.createElement("option");
      option.value=id;option.textContent=safeName(id);
      opponent.appendChild(option);
    }
    if(ids.includes(selected))opponent.value=selected;
    opponent.disabled=!ids.length||!inRoom()||current.phase==="playing";
    $("jfArenaChallenge").disabled=opponent.disabled;
  }
  function renderUi(){
    const playing=current.phase==="playing";
    const finished=current.phase==="finished";
    const ids=current.players||[];
    lobby.hidden=playing;
    $("jfArenaActions").hidden=!playing;
    for(let i=0;i<2;i++){
      const label=i===0?"A":"B";
      const id=ids[i],hp=Math.max(0,Math.min(100,Number(current.hp?.[id]??100)));
      const energy=Math.max(0,Math.min(100,Number(current.energy?.[id]??75)));
      $("jfArenaName"+label).textContent=id?safeName(id):"Macaco "+(i+1);
      $("jfArenaHp"+label).style.width=hp+"%";
      $("jfArenaHpText"+label).textContent=hp+"/100";
      $("jfArenaEnergy"+label).style.width=energy+"%";
      $("jfArenaEnergyText"+label).textContent=energy+"/100";
    }
    const myTurn=playing&&current.turn===socket.id;
    for(const b of actions)
      b.disabled=!myTurn||Number(current.energy?.[socket.id]||0)<costs[b.dataset.jfArenaAction];
    const move=current.lastMove;
    if(playing){
      setStatus(myTurn?"⚡ Sua vez! Escolha um golpe.":"⏳ Vez de "+safeName(current.turn));
    }else if(finished){
      const winner=current.winner;
      setStatus(winner?safeName(winner)+" venceu o duelo!":current.message||"Luta encerrada.");
    }else{
      setStatus(statusOverride||(inRoom()?"Convide outro jogador da sala para lutar.":"Entre numa sala para jogar."));
    }
    if(move){
      const k=move.by+":"+move.seq+":"+move.at+":"+move.kind;
      if(k!==lastActionKey){
        lastActionKey=k;actionAt=now();
        // A animacao acontece localmente, mas o resultado e do servidor.
        if(playing||finished){
          const label=move.kind==="defender"?"se defendeu":
            move.hit===false?"errou o "+(move.kind==="chute"?"chute":"golpe"):
            "acertou "+(move.kind==="chute"?"um chute":"um golpe")+
              " ("+move.damage+" de dano)";
          setStatus(safeName(move.by)+" "+label+"!");
        }
      }
    }
    const key=finished?String(current.at)+":"+String(current.winner):"";
    if(finished&&key!==ignoredOutcome&&key!==finishedSignature){
      finishedSignature=key;finishAt=now();
      result.hidden=true;
    }else if(!finished){
      resetOutcome();finishAt=0;finishedSignature="";result.hidden=true;
    }
    if(key===ignoredOutcome){finishAt=0;result.hidden=true;}
    listOpponents();
  }
  function showOutcome(){
    const key=String(current.at)+":"+String(current.winner);
    if(!actors.length||result.hidden===false||(current.phase!=="finished"&&!previewOutcome)||key===ignoredOutcome)return;
    const winner=current.winner,players=current.players||[];
    const myself=players.includes(socket.id);
    const won=previewOutcome?previewOutcome==="victory":myself&&winner===socket.id;
    const lost=previewOutcome?previewOutcome==="death":myself&&winner&&winner!==socket.id;
    resultTitle.textContent=won?"🏆 VITÓRIA!":lost?"💀 DERROTA!":winner?"🏆 VENCEDOR!":"⚖️ EMPATE";
    resultDetails.textContent=won?"Seu macaco venceu na arena!":
      lost?"Seu macaco foi derrotado. Você pode tentar uma revanche!":
      winner?safeName(winner)+" foi o vencedor.":String(current.message||"Luta encerrada.");
    result.hidden=false;
    const actor=actors.find(a=>current.players?.[a.slot]===socket.id)||(previewOutcome?actors[0]:null);
    if(actor&&(won||lost)&&renderer){
      outcomeActor=actor;outcomeStarted=now();
      actor.outcomeKind=won?"victory":"death";
      for(const a of actors)a.avatar.group.visible=a===actor;
      outcomeViewport.appendChild(renderer.domElement);
      camera.position.set(0,1.7,5.5);camera.lookAt(0,.65,0);
      const w=Math.max(outcomeViewport.clientWidth,200),h=Math.max(outcomeViewport.clientHeight,160);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    }
  }
  async function ensureScene(){
    if(scene||loading)return;
    loading=true;
    const generation=++setupGeneration;
    setStatus("Preparando os macacos 3D...");
    try{
      await Promise.all(["victory","death"].map(async kind=>{
        try{outcomeAssets[kind]||=await loadOutcomeAnimation(kind);}catch(error){console.warn("Animação de resultado indisponível",kind,error);}
      }));
      const newRig=false; // Mesmo modelo e encaixes da prévia de Trajes.
      if(!open||generation!==setupGeneration)return;
      const width=Math.max(viewport.clientWidth,200),height=Math.max(viewport.clientHeight,240);
      scene=new THREE.Scene();
      scene.background=new THREE.Color(0x10102a);
      scene.fog=new THREE.Fog(0x10102a,10,22);
      camera=new THREE.PerspectiveCamera(37,width/height,.08,50);
      camera.position.set(0,2.08,7.6);camera.lookAt(0,.67,0);
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      renderer.setSize(width,height,false);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      viewport.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xbde7ff,0x3b2440,2.15));
      const leftLight=new THREE.DirectionalLight(0x92f3ff,2.1);
      leftLight.position.set(-3,5,4);scene.add(leftLight);
      const rightLight=new THREE.DirectionalLight(0xff83c2,1.55);
      rightLight.position.set(3,3,-2);scene.add(rightLight);
      const floor=new THREE.Mesh(new THREE.CylinderGeometry(2.9,3.05,.28,64),
        new THREE.MeshStandardMaterial({color:0x34305e,metalness:.2,roughness:.65,flatShading:true}));
      floor.position.y=-.18;scene.add(floor);
      const matA=new THREE.MeshStandardMaterial({color:0x6ad8fd,emissive:0x0c536a,metalness:.32,roughness:.38});
      const matB=new THREE.MeshStandardMaterial({color:0xff71cc,emissive:0x4d1845,metalness:.32,roughness:.38});
      for(const [radius,mat] of [[2.9,matA],[2.65,matB]]){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.035,6,100),mat);
        ring.rotation.x=Math.PI/2;ring.position.y=.025;scene.add(ring);
      }
      for(let i=0;i<2;i++){
        const id=current.players?.[i]||(i===0?socket.id:null);
        const profile=id===socket.id?bridge.getProfile?.():bridge.getPeerProfile?.(id);
        const avatar=await createDanceAvatar(profile?.wardrobe||{},"default",()=>{},
          {experimental:newRig,local:false,testOutfit:true});
        if(!open||generation!==setupGeneration){avatar.dispose();return;}
        scene.add(avatar.group);
        const side=i===0?1:-1;
        const fighter=bindCombatRig(THREE,avatar,{side,x:i===0?-1.2:1.2});
        const outcomes={};
        for(const kind of ["victory","death"])if(outcomeAssets[kind]){
          try{outcomes[kind]=bindOutcomeAnimation(avatar,outcomeAssets[kind]);}catch(error){console.warn(error);}
        }
        actors.push({avatar,fighter,slot:i,outcomes});
      }
      resizeObserver=new ResizeObserver(()=>{
        if(!renderer||!camera)return;
        const target=outcomeActor?outcomeViewport:viewport;
        const w=Math.max(target.clientWidth,200),h=Math.max(target.clientHeight,180);
        camera.aspect=w/h;camera.updateProjectionMatrix();
        renderer.setSize(w,h,false);
      });
      resizeObserver.observe(viewport);resizeObserver.observe(outcomeViewport);
      renderUi();
      tick();
    }catch(error){
      console.error("Arena 3D:",error);
      setStatus("Falha ao abrir a arena 3D: "+(error?.message||"erro desconhecido"));
    }finally{loading=false;}
  }
  function tick(){
    if(!open||!scene||!renderer)return;
    raf=requestAnimationFrame(tick);
    const t=now();
    for(const actor of actors){
      const id=current.players?.[actor.slot],move=current.lastMove;
      let kind="idle",age=t;
      if(current.phase==="finished"&&finishAt&&t-finishAt>850){
        if(current.winner===id)kind="victory";
        else kind=Number(current.hp?.[id]||0)===0?"ko":"defeat";
        age=t-finishAt-850;
      }else if(move&&t-actionAt<1050){
        age=t-actionAt;
        if(move.by===id)kind=move.kind;
        else if(move.to===id&&move.kind!=="defender")
          kind=move.hit===false?"dodge":"hurt";
      }
      if(actor===outcomeActor){
        actor.fighter.apply("idle",0);
        actor.avatar.group.position.set(0,.82,0);actor.avatar.group.rotation.set(0,0,0);
        actor.avatar.group.updateMatrixWorld(true);
        const animation=actor.outcomes[actor.outcomeKind];
        if(animation)animation.apply((t-outcomeStarted)/1000);
        else actor.fighter.apply(actor.outcomeKind==="victory"?"victory":"ko",t-outcomeStarted);
      }else actor.fighter.apply(kind,age);
      actor.avatar.updateAccessories?.(false);
    }
    if(current.phase==="finished"&&finishAt&&t-finishAt>2350)showOutcome();
    renderer.render(scene,camera);
  }
  function clearScene(){
    resetOutcome();
    setupGeneration++;
    cancelAnimationFrame(raf);raf=0;
    resizeObserver?.disconnect();resizeObserver=null;
    for(const {avatar,outcomes} of actors){for(const animation of Object.values(outcomes))animation.dispose();avatar.group.parent?.remove(avatar.group);avatar.dispose?.();}
    actors=[];
    // A geometria e os materiais da arena são locais. Os do guarda-roupa
    // são compartilhados e não podem ser descartados aqui.
    if(scene)for(const obj of scene.children){
      if(obj.isMesh){obj.geometry?.dispose();obj.material?.dispose?.();}
    }
    renderer?.dispose();renderer?.forceContextLoss();
    renderer?.domElement?.remove();
    scene=null;camera=null;renderer=null;
    loading=false;
  }
  function openArena(){
    if(open)return;
    open=true;
    modal.hidden=false;
    result.hidden=true;
    listOpponents();renderUi();
    socket.emit("simios-fight-sync");
    void ensureScene();
  }
  function closeArena(){
    if(!open)return;
    open=false;modal.hidden=true;
    clearScene();inviteFrom=null;showInvite();
  }
  for(const button of modal.querySelectorAll("[data-arena-preview]"))button.addEventListener("click",()=>{
    if(!actors.length||current.phase==="playing")return;
    resetOutcome();previewOutcome=button.dataset.arenaPreview;
    result.hidden=true;showOutcome();
  });
  $("jfOpenArena")?.addEventListener("click",openArena);
  $("jfArenaClose")?.addEventListener("click",closeArena);
  $("jfArenaResultBack")?.addEventListener("click",()=>{
    const wasPreview=Boolean(previewOutcome);resetOutcome();
    if(wasPreview){result.hidden=true;renderUi();return;}
    ignoredOutcome=String(current.at)+":"+String(current.winner);
    result.hidden=true;finishAt=0;finishedSignature="";
    current={phase:"idle"};renderUi();
  });
  modal.addEventListener("pointerdown",event=>{if(event.target===modal)closeArena();});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&open)closeArena();
  });
  $("jfArenaChallenge").addEventListener("click",()=>{
    if(!inRoom()||!opponent.value)return;
    statusOverride="Desafio enviado; aguardando o adversário.";
    socket.emit("simios-fight-challenge",{targetId:opponent.value});
    renderUi();
  });
  $("jfArenaAccept").addEventListener("click",()=>{
    if(!inviteFrom)return;
    socket.emit("simios-fight-respond",{accept:true});
    inviteFrom=null;showInvite();
  });
  $("jfArenaDecline").addEventListener("click",()=>{
    if(!inviteFrom)return;
    socket.emit("simios-fight-respond",{accept:false});
    inviteFrom=null;showInvite();
  });
  for(const button of actions)button.addEventListener("click",()=>{
    if(current.phase!=="playing"||current.turn!==socket.id)return;
    socket.emit("simios-fight-act",{kind:button.dataset.jfArenaAction});
  });
  $("jfArenaForfeit")?.addEventListener("click",()=>{
    if(current.phase!=="playing"||!(current.players||[]).includes(socket.id))return;
    if(window.confirm("Desistir da luta? O outro macaco vence.")){
      socket.emit("simios-fight-forfeit");
    }
  });
  socket.on("simios-fight-invite",event=>{
    if(!event?.from||!inRoom())return;
    inviteFrom=event.from;
    $("jfArenaInviteText").textContent=safeName(inviteFrom)+" te desafiou!";
    showInvite();openArena();
  });
  socket.on("simios-fight-state",data=>{
    current=data&&typeof data==="object"?data:{phase:"idle"};
    const ids=current.players||[];
    if(current.phase==="playing"&&ids.includes(socket.id)){
      ignoredOutcome="";
      if(!open)openArena();
      inviteFrom=null;showInvite();
    }
    if(open){
      renderUi();
      // Ao mudar o par, reconstruir clones com os perfis corretos.
      const pair=ids.join("|");
      if(pair!==openArena.lastPair){
        openArena.lastPair=pair;clearScene();void ensureScene();
      }
    }
  });
  socket.on("simios-fight-notice",event=>{
    statusOverride=String(event?.message||"");
    if(/expir|recus|cancelad/i.test(statusOverride)){inviteFrom=null;showInvite();}
    if(open)setStatus(statusOverride);
  });
  for(const evt of ["peer-joined","peer-left","joined-room","profile-update"])
    socket.on(evt,()=>{if(open)listOpponents();});
  for(const evt of ["left-room","room-kicked","disconnect"])
    socket.on(evt,closeArena);
}
