/* Arena de combate 3D separada da balada.
 * Carrega os mesmos GLBs do macaco pela API do guarda-roupa.
 * O Socket.IO do servidor decide quem acerta/erra, HP e vencedor.
 */
import {playDramaticFinish,stopDramaticFinish,finishDevAllowed} from "./dramatic-finish.js?v=1";
import * as THREE from "https://esm.sh/three@0.170.0";
import {createWardrobeFittedAvatar} from "./wardrobe.js?v=arena-fit-11";
import {loadOutcomeAnimation,bindOutcomeAnimation} from "./simios-outcome-animation.js?v=7";
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
  let dramaticPlaying=false,dramaticPlayed="";
  let current={phase:"idle"},inviteFrom=null,previewOutcome=null;
  let open=false,loading=false,setupGeneration=0;
  let arenaSet=null,audienceTexture=null,audienceNames="";
  let renderer=null,scene=null,camera=null,resizeObserver=null,raf=0;
  let actors=[],lastActionKey="",actionAt=0,finishAt=0,finishedSignature="",ignoredOutcome="";
  let statusOverride="",outcomeActor=null,outcomeStarted=0;
  const outcomeAssets={};
  const outcomeViewport=$("jfArenaResultAvatar");
  function resetOutcome(){
    outcomeActor=null;previewOutcome=null;
    if(renderer&&viewport)viewport.appendChild(renderer.domElement);
    for(const actor of actors){actor.avatar.group.visible=true;actor.shadow.visible=true;for(const animation of Object.values(actor.outcomes))animation.reset();}
    if(arenaSet)arenaSet.visible=true;
    if(camera){camera.position.set(0,1.65,4.6);camera.lookAt(0,.90,0);}
  }
  function bodyBounds(avatar){
    avatar.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    avatar.rig.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||mesh.userData.jfGarment)return;
      let parent=mesh;
      while(parent&&parent!==avatar.rig){if(/^jfWardrobe/.test(parent.name))return;parent=parent.parent;}
      mesh.skeleton.update();
      bounds.expandByObject(mesh,true);
    });
    return bounds;
  }
  function updateAudience(){
    if(!audienceTexture)return;
    const names=[0,1].map(i=>{const id=current.players?.[i]||(i===0?socket.id:opponent.value);return id?safeName(id):"DESAFIANTE";});
    const signature=names.join("|");if(signature===audienceNames)return;audienceNames=signature;
    const canvas=audienceTexture.image,ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const colors=["#a79c80","#d5bd85","#8ea6a0","#a98680","#807f9c"];
    for(let row=0;row<3;row++)for(let i=0;i<16;i++){
      const x=45+i*96+(row%2)*22,y=110+row*126;
      ctx.fillStyle=row===0?"#343c3a":"#4b514b";
      ctx.fillRect(x-30,y+32,60,100);
      ctx.fillStyle=colors[(i+row*3)%colors.length];
      for(const ear of [-27,27]){ctx.beginPath();ctx.arc(x+ear,y+8,12,0,Math.PI*2);ctx.fill();}
      ctx.beginPath();ctx.ellipse(x,y+6,27,32,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#23292b";ctx.beginPath();ctx.ellipse(x,y+18,17,13,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#080d0e";ctx.fillRect(x-11,y,5,6);ctx.fillRect(x+6,y,5,6);
      if((i+row)%3===0){
        ctx.strokeStyle=colors[(i+row)%colors.length];ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(x-22,y+50);ctx.lineTo(x-40,y-45);ctx.moveTo(x+22,y+50);ctx.lineTo(x+40,y-45);ctx.stroke();
        ctx.save();ctx.translate(x,y-62);ctx.rotate(((i%3)-1)*.07);
        ctx.fillStyle=(i+row)%2?"#d8bd76":"#a9c6c0";ctx.fillRect(-65,-22,130,44);
        ctx.strokeStyle="#161d1e";ctx.lineWidth=3;ctx.strokeRect(-65,-22,130,44);
        ctx.fillStyle="#121a1b";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="900 17px sans-serif";
        ctx.fillText(names[(i+row)%2].toUpperCase(),0,0,120);ctx.restore();
      }
    }
    audienceTexture.needsUpdate=true;
  }
  const costs={soco:12,chute:22,forte:30,defender:0,espirito_simio:0};
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
      const spirit=current.spirit?.[id],badge=$("jfArenaSpirit"+label);
      badge.hidden=!spirit?.active;
      badge.textContent=spirit?.active?"🔥 Espírito Símio · "+spirit.roundsRemaining+" round(s) · ATQ +25% / dano recebido −25%":"";
      badge.parentElement.dataset.spirit=spirit?.active?"true":"false";
    }
    const myTurn=playing&&current.turn===socket.id;
    for(const b of actions){
      const kind=b.dataset.jfArenaAction;
      b.disabled=!myTurn||Number(current.energy?.[socket.id]||0)<costs[kind]||
        (kind==="espirito_simio"&&(Number(current.hp?.[socket.id]||0)<=10||current.spirit?.[socket.id]?.active));
    }
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
          const label=move.kind==="espirito_simio"?"ativou Espírito Símio (−10 de vida)":move.kind==="defender"?"se defendeu":
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
    listOpponents();updateAudience();
  }
  function showOutcome(){
    const key=String(current.at)+":"+String(current.winner);
    if(dramaticPlaying||!actors.length||result.hidden===false||(current.phase!=="finished"&&!previewOutcome)||key===ignoredOutcome)return;
    if(!previewOutcome&&current.dramaticFinish?.triggered&&dramaticPlayed!==key){
      dramaticPlayed=key;dramaticPlaying=true;
      void playDramaticFinish().finally(()=>{
        dramaticPlaying=false;
        if(open&&current.phase==="finished"&&String(current.at)+":"+String(current.winner)===key)showOutcome();
      });
      return;
    }
    const winner=current.winner,players=current.players||[];
    const myself=players.includes(socket.id);
    const won=previewOutcome?previewOutcome==="victory":myself&&winner===socket.id;
    const lost=previewOutcome?previewOutcome==="death":myself&&winner&&winner!==socket.id;
    resultTitle.textContent=won?"🏆 VITÓRIA!":lost?"💀 DERROTA!":winner?"🏆 VENCEDOR!":"⚖️ EMPATE";
    resultDetails.textContent=won?"Seu macaco venceu na arena!":
      lost?"Seu macaco foi derrotado. Você pode tentar uma revanche!":
      winner?safeName(winner)+" foi o vencedor.":String(current.message||"Luta encerrada.");
    if(!previewOutcome&&current.dramaticFinish?.triggered)resultDetails.textContent+=" Dramatic Finish!";
    result.hidden=false;
    const actor=actors.find(a=>current.players?.[a.slot]===socket.id)||(previewOutcome?actors[0]:null);
    if(actor&&(won||lost)&&renderer){
      outcomeActor=actor;outcomeStarted=now();
      actor.outcomeKind=won?"victory":"death";
      for(const a of actors){a.avatar.group.visible=a===actor;a.shadow.visible=a===actor;}
      outcomeViewport.appendChild(renderer.domElement);
      if(arenaSet)arenaSet.visible=true;
      result.dataset.outcome=won?"victory":"death";
      camera.position.set(0,1.1,3.0);camera.lookAt(0,.85,0);
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
      if(!open||generation!==setupGeneration)return;
      const width=Math.max(viewport.clientWidth,200),height=Math.max(viewport.clientHeight,240);
      scene=new THREE.Scene();
      scene.background=new THREE.Color(0x10102a);
      scene.fog=new THREE.Fog(0x10102a,10,22);
      camera=new THREE.PerspectiveCamera(37,width/height,.08,50);
      camera.position.set(0,1.65,4.6);camera.lookAt(0,.90,0);
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
      arenaSet=new THREE.Group();scene.add(arenaSet);
      const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=512;
      const ctx=canvas.getContext("2d");
      ctx.fillStyle="#25282c";ctx.fillRect(0,0,1024,512);
      ctx.strokeStyle="#505349";ctx.lineWidth=3;
      for(let i=0;i<25;i++){ctx.beginPath();ctx.moveTo(i*47,0);ctx.lineTo(i*47-120,512);ctx.stroke();}
      ctx.strokeStyle="#d1c578";ctx.lineWidth=8;ctx.strokeRect(42,38,940,436);
      ctx.save();ctx.translate(512,256);ctx.rotate(-.10);ctx.textAlign="center";
      ctx.fillStyle="#d1c578";ctx.font="900 115px sans-serif";ctx.fillText("SÍMIOS",0,10);
      ctx.font="bold 30px monospace";ctx.fillText("FIGHT CLUB // JUNTO.FM",0,65);ctx.restore();
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const floor=new THREE.Mesh(new THREE.BoxGeometry(6,.22,3.8),new THREE.MeshStandardMaterial({map:texture,roughness:.9,color:0xffffff}));
      floor.position.y=-.12;arenaSet.add(floor);
      const steel=new THREE.MeshStandardMaterial({color:0x363c42,metalness:.75,roughness:.38});
      const amber=new THREE.MeshStandardMaterial({color:0xffc76c,emissive:0x805015,emissiveIntensity:.65});
      for(const x of [-2.85,2.85])for(const z of [-1.75,1.75]){
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,1.65,8),steel);post.position.set(x,.7,z);arenaSet.add(post);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(.18,.27,.18),amber);cap.position.set(x,1.34,z);arenaSet.add(cap);
      }
      // Back and side ropes leave the fighters unobstructed from the front.
      for(const y of [.35,.75,1.15]){
        const rope=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,5.7,8),amber);
        rope.rotation.z=Math.PI/2;rope.position.set(0,y,-1.75);arenaSet.add(rope);
        for(const x of [-2.85,2.85]){const r=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,3.5,8),steel);r.rotation.x=Math.PI/2;r.position.set(x,y,0);arenaSet.add(r);}
      }
      for(let i=0;i<11;i++){
        const beam=new THREE.Mesh(new THREE.BoxGeometry(.11,3,.13),steel);beam.position.set((i-5)*.65,1.1,-2.7);arenaSet.add(beam);
      }
      const wallMaterial=new THREE.MeshStandardMaterial({color:0x242927,roughness:1,side:THREE.DoubleSide});
      for(const x of [-3.4,3.4]){
        const wall=new THREE.Mesh(new THREE.PlaneGeometry(8,5),wallMaterial);wall.rotation.y=Math.PI/2;wall.position.set(x,1.8,0);arenaSet.add(wall);
        for(let i=0;i<6;i++){
          const stripe=new THREE.Mesh(new THREE.BoxGeometry(.02,.12,6),amber);stripe.position.set(x*.99,.2+i*.5,0);arenaSet.add(stripe);
        }
      }
      const rearWall=new THREE.Mesh(new THREE.PlaneGeometry(8,5),wallMaterial);rearWall.position.set(0,1.8,-3);arenaSet.add(rearWall);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.8),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(0,1.7,-2.8);arenaSet.add(sign);
      const crowdCanvas=document.createElement("canvas");crowdCanvas.width=1536;crowdCanvas.height=512;
      audienceTexture=new THREE.CanvasTexture(crowdCanvas);audienceTexture.colorSpace=THREE.SRGBColorSpace;
      audienceNames="";updateAudience();
      const crowdMaterial=new THREE.MeshBasicMaterial({map:audienceTexture,transparent:true,alphaTest:.05,side:THREE.DoubleSide,depthWrite:false});
      const rearCrowd=new THREE.Mesh(new THREE.PlaneGeometry(7.5,2.5),crowdMaterial);rearCrowd.position.set(0,1.5,-2.55);arenaSet.add(rearCrowd);
      for(const x of [-3.18,3.18]){const crowd=new THREE.Mesh(new THREE.PlaneGeometry(6,2.5),crowdMaterial);crowd.rotation.y=Math.PI/2;crowd.position.set(x,1.5,0);arenaSet.add(crowd);}
      for(let i=0;i<2;i++){
        const id=current.players?.[i]||(i===0?socket.id:null);
        const profile=id===socket.id?bridge.getProfile?.():bridge.getPeerProfile?.(id);
        const avatar=await createWardrobeFittedAvatar(profile?.wardrobe||{},{local:id===socket.id});
        if(!open||generation!==setupGeneration){avatar.dispose();return;}
        scene.add(avatar.group);
        const side=i===0?1:-1;
        const fighter=bindCombatRig(THREE,avatar,{side,x:i===0?-.85:.85});
        const outcomes={};
        for(const kind of ["victory","death"])if(outcomeAssets[kind]){
          try{outcomes[kind]=bindOutcomeAnimation(avatar,outcomeAssets[kind]);}catch(error){console.warn(error);}
        }
        const shadow=new THREE.Mesh(new THREE.CircleGeometry(.32,24),new THREE.MeshBasicMaterial({color:0x080c0d,transparent:true,opacity:.26,depthWrite:false}));
        shadow.rotation.x=-Math.PI/2;shadow.position.set(fighter.baseX,.007,0);scene.add(shadow);
        actors.push({avatar,fighter,slot:i,outcomes,shadow});
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
        if(move.by===id)kind=move.kind==="espirito_simio"?"defender":move.kind;
        else if(move.to===id&&["soco","chute","forte"].includes(move.kind))
          kind=move.hit===false?"dodge":"hurt";
      }
      if(actor===outcomeActor){
        actor.fighter.apply("idle",0);
        actor.avatar.group.position.set(actor.fighter.baseX,.82,0);
        actor.avatar.group.rotation.set(0,actor.fighter.baseYaw,0);
        actor.avatar.group.updateMatrixWorld(true);
        const animation=actor.outcomes[actor.outcomeKind];
        if(animation)animation.apply((t-outcomeStarted)/1000);
        else actor.fighter.apply(actor.outcomeKind==="victory"?"victory":"ko",t-outcomeStarted);
      }else actor.fighter.apply(kind,age);
      if(actor===outcomeActor){
        // Use skinned body vertices AFTER the FBX pose. A fixed root Y
        // leaves the feet floating and makes the death pose pierce the mat.
        const contact=bodyBounds(actor.avatar);
        if(!contact.isEmpty()){
          const correction=.015-contact.min.y;
          actor.avatar.group.position.y+=correction;
          contact.translate(new THREE.Vector3(0,correction,0));actor.outcomeBounds=contact;
        }
      }
      actor.avatar.group.updateMatrixWorld(true);
      actor.shadow.position.set(actor.avatar.group.position.x,.007,actor.avatar.group.position.z);
      if(actor===outcomeActor&&actor.outcomeBounds){const center=actor.outcomeBounds.getCenter(new THREE.Vector3());actor.shadow.position.set(center.x,.007,center.z);}
      actor.avatar.updateAccessories?.(false);
      if(actor===outcomeActor){
        // Frame the animated body itself, never the ring or asynchronously loaded accessories.
        actor.avatar.group.updateMatrixWorld(true);
        const bounds=actor.outcomeBounds||bodyBounds(actor.avatar);
        const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
        const fov=THREE.MathUtils.degToRad(camera.fov);
        // Opponent's side of the ring: camera looks straight into the
        // fighter, preserving his side and the actual arena behind him.
        const distance=Math.max(size.y/(2*Math.tan(fov/2)),size.z/(2*Math.tan(fov/2)*camera.aspect),1)*1.35;
        camera.position.set(center.x+actor.fighter.side*distance,Math.max(1.05,center.y+.12),center.z+.12);
        camera.lookAt(center.x,center.y,center.z);
      }
    }
    if(current.phase==="finished"&&finishAt&&t-finishAt>2350)showOutcome();
    renderer.render(scene,camera);
  }
  function clearScene(){
    resetOutcome();
    setupGeneration++;
    cancelAnimationFrame(raf);raf=0;
    resizeObserver?.disconnect();resizeObserver=null;
    for(const {avatar,outcomes,shadow} of actors){shadow.geometry.dispose();shadow.material.dispose();shadow.removeFromParent();for(const animation of Object.values(outcomes))animation.dispose();avatar.group.parent?.remove(avatar.group);avatar.dispose?.();}
    actors=[];
    // A geometria e os materiais da arena são locais. Os do guarda-roupa
    // são compartilhados e não podem ser descartados aqui.
    arenaSet?.traverse(obj=>{if(obj.isMesh){obj.geometry?.dispose();obj.material?.map?.dispose();obj.material?.dispose?.();}});
    renderer?.dispose();renderer?.forceContextLoss();
    renderer?.domElement?.remove();
    scene=null;arenaSet=null;audienceTexture=null;audienceNames="";camera=null;renderer=null;
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
    if(dramaticPlaying)stopDramaticFinish();
    if(!open)return;
    open=false;modal.hidden=true;
    clearScene();inviteFrom=null;showInvite();
  }
  for(const button of modal.querySelectorAll("[data-arena-preview]"))button.addEventListener("click",()=>{
    if(!actors.length||current.phase==="playing")return;
    resetOutcome();previewOutcome=button.dataset.arenaPreview;
    result.hidden=true;showOutcome();
  });
  if(finishDevAllowed(location)){
    const previewButton=document.createElement("button");previewButton.type="button";previewButton.className="btn secondary";
    previewButton.textContent="🎬 Testar Dramatic Finish";previewButton.dataset.arenaDramaticPreview="true";
    previewButton.addEventListener("click",()=>{void playDramaticFinish();});
    modal.querySelector(".jf-arena-preview>div")?.appendChild(previewButton);
  }
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
    if(data?.phase!=="finished"&&dramaticPlaying)stopDramaticFinish();
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
    socket.on(evt,()=>{if(open){listOpponents();updateAudience();}});
  for(const evt of ["left-room","room-kicked","disconnect"])
    socket.on(evt,closeArena);
}
