/* Pista de dança 3D isométrica: um único renderer para até oito macacos. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";
import {createDanceAvatar} from "./wardrobe.js";

const bridge=window.jfDanceBridge;
const socket=bridge?.socket;
const modal=document.getElementById("jfDanceModal");
const viewport=document.getElementById("jfDanceViewport");
const stage=document.getElementById("jfDanceStage");
const status=document.getElementById("jfDanceStatus");
const count=document.getElementById("jfDanceCount");
const openButton=document.getElementById("jfOpenDance");
const closeButton=document.getElementById("jfCloseDance");
const choices=[...document.querySelectorAll("[data-jf-dance]")];
const animationFiles={
  shake:"/dance/macacochaqualha.glb",
  macarena:"/dance/macacomacarena.glb",
  party:"/dance/macacodanca.glb",
  capoeira:"/dance/macacocapoera.glb",
  groove:"/dance/macacodancagay.glb"
};
// Danças Mixamo reais: transferir variações da pose de descanso em espaço global,
// em vez de copiar diretamente quaternions locais entre rigs diferentes.
const gltfLoader=new GLTFLoader(),clipPromises=new Map(),animationClips=new Map();
let drinkingClipPromise=null;
function loadDrinkingClip(){
 if(!drinkingClipPromise)drinkingClipPromise=new FBXLoader().loadAsync("/poses/Drinking.fbx").then(source=>{
   const clip=(source.animations||[]).filter(c=>c.tracks?.length).sort((a,b)=>b.tracks.filter(t=>t.name.endsWith(".quaternion")).length-a.tracks.filter(t=>t.name.endsWith(".quaternion")).length)[0];
   if(clip)animationClips.set("drinking",{clip,scene:source});
   return clip||null;
 }).catch(error=>{console.warn("Animacao Drinking.fbx nao instalada:",error);return null;});
 return drinkingClipPromise;
}
// Assets independentes: o indicador não altera o esqueleto nem animações do avatar.
const jfBananaMarkerPromise=gltfLoader.loadAsync("/club/bananasims_otimizada.glb").then(gltf=>gltf.scene).catch(error=>{
  console.warn("The Símios: adicione public/club/bananasims_otimizada.glb para ativar o marcador.",error);
  return null;
});

const boneKey=name=>String(name).split("/").pop().replace(/^.*[|:]/,"").replace(/^mixamorig\d*/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
// Animacao sentadobalanca.fbx (enviada pelo criador).
// O FBX fica fora do GitHub ate instalar o pacote de teste em public/poses.
// A pose anterior e mantida como fallback para nao quebrar o deploy.
const seatedFBXLoader=new FBXLoader();
let sittingPosePromise=null;
function sittingPose(){
  if(!sittingPosePromise)sittingPosePromise=(async()=>{
    let source;
    try{
      // sentadotryfix: FBX somente de esqueleto, 49 nós Mixamo e 64 quadros.
      // Mesma hierarquia do arquivo original, sem malha/câmera extra.
      const scene=await seatedFBXLoader.loadAsync("/poses/sentadotryfix.fbx");
      source={scene,animations:scene.animations,filename:"sentadotryfix.fbx"};
    }catch(error){
      console.warn("Nova animação sentadotryfix indisponível; tentando versões anteriores.");
      try{
        const scene=await seatedFBXLoader.loadAsync("/poses/sentadobalanca.fbx");
        source={scene,animations:scene.animations,filename:"sentadobalanca.fbx"};
      }catch(previousError){
        try{
          const gltf=await gltfLoader.loadAsync("/poses/sitting-idle.glb");
          source={scene:gltf.scene,animations:gltf.animations,filename:"sitting-idle.glb"};
        }catch(fallbackError){
          console.warn("Nenhuma animação sentada disponível.",fallbackError);
          return null;
        }
      }
    }
    const clips=source.animations||[];
    // O FBX do Mixamo contem DUAS tomadas: RootNode|mixamo.com
    // (transforms estaticos) e mixamo.com (64 quadros de movimento).
    // Contar somente ossos empatava as tomadas e podia escolher a estatica.
    // Preferir a que tem rotacoes REALMENTE variando no tempo.
    const clipScore=take=>{
      let score=0;
      for(const track of take.tracks){
        if(!track.name.endsWith(".quaternion")||!/mixamorig/i.test(track.name))continue;
        const values=track.values;
        if(!values||values.length<4)continue;
        let moving=false;
        for(let i=4;i+3<values.length;i+=4){
          let difference=0;
          for(let axis=0;axis<4;axis++)
            difference+=Math.abs(values[i+axis]-values[axis]);
          if(difference>.005){moving=true;break;}
        }
        score+=(moving?1000:0)+Math.min(track.times?.length||0,120);
      }
      return score;
    };
    const clip=[...clips].sort((a,b)=>clipScore(b)-clipScore(a))[0];
    if(source.filename==="sentadobalanca.fbx"||source.filename==="sentadotryfix.fbx")
      console.info("Tomadas no FBX:",clips.map(c=>({
        name:c.name,seconds:c.duration.toFixed(2),motionScore:clipScore(c)
      })),"Selecionada:",clip?.name);
    if(!clip?.tracks?.length)return null;
    source.scene.updateMatrixWorld(true);
    const sourceBones=new Map();
    source.scene.traverse(obj=>{if(obj.name)sourceBones.set(boneKey(obj.name),obj);});
    // Registrar orientação GLOBAL de repouso do esqueleto de origem.
    // Ombros/antebraços não podem usar o delta local de um outro bind pose:
    // ele gira em eixos incompatíveis e abre os braços em posições estranhas.
    const sourceWorldBones=new Map();
    const byObject=new Map();
    source.scene.traverse(node=>{
      if(!node.isBone)return;
      const key=boneKey(node.name);
      if(!key)return;
      const info={
        key,node,
        localRest:node.quaternion.clone(),
        worldRest:node.getWorldQuaternion(new THREE.Quaternion()),
        parent:null,track:null,
        parentWorldRest:node.parent.getWorldQuaternion(new THREE.Quaternion())
      };
      sourceWorldBones.set(key,info);
      byObject.set(node,info);
    });
    for(const info of sourceWorldBones.values())
      info.parent=byObject.get(info.node.parent)||null;
    const hipBone=sourceBones.get("hips");
    const hipPositionTrack=/^sentado(?:balanca|tryfix)\.fbx$/.test(source.filename)?
      clip.tracks.find(track=>track.name.endsWith(".position")&&
        boneKey(track.name.slice(0,track.name.lastIndexOf(".")))==="hips"):null;
    const hipInterpolant=hipPositionTrack?.createInterpolant();
    const initialHipPosition=hipInterpolant?.evaluate(0);
    const hipPosition=initialHipPosition?.length===3&&hipBone?{
      interpolant:hipInterpolant,
      initial:new THREE.Vector3().fromArray(initialHipPosition),
      sourceRest:hipBone.position.clone(),
      sourceParentQuaternion:hipBone.parent.getWorldQuaternion(new THREE.Quaternion())
    }:null;
    const time=Math.min(.5,clip.duration*.5);
    const changes=new Map(),animatedTracks=new Map();
    for(const track of clip.tracks){
      const dot=track.name.lastIndexOf(".");
      if(dot<0||track.name.slice(dot+1)!=="quaternion")continue;
      const name=boneKey(track.name.slice(0,dot)),bone=sourceBones.get(name);
      if(!bone)continue;
      const interpolant=track.createInterpolant();
      const value=interpolant.evaluate(time);
      if(!value||value.length!==4)continue;
      const sourceInverse=bone.quaternion.clone().invert();
      const correction=sourceInverse.clone().multiply(new THREE.Quaternion().fromArray(value));
      changes.set(name,correction);
      if(source.filename==="sentadobalanca.fbx"||source.filename==="sentadotryfix.fbx"){
        animatedTracks.set(name,{sourceInverse,interpolant});
        const info=sourceWorldBones.get(name);
        if(info)info.track=interpolant;
      }
    }
    console.info("Junto Club sentado:",source.filename,changes.size,
      "ossos; translacao do quadril:",Boolean(hipPosition),
      "duracao:",clip.duration.toFixed(2),"s");
    return changes.size>=5?{
      changes,animatedTracks,sourceWorldBones,hipPosition,
      duration:clip.duration,filename:source.filename
    }:null;
  })();
  return sittingPosePromise;
}
function loadClip(style){
  if(!animationFiles[style])return Promise.resolve(null);
  if(!clipPromises.has(style)){
    clipPromises.set(style,gltfLoader.loadAsync(animationFiles[style]).then(gltf=>{
      const clip=gltf.animations?.find(c=>c.tracks?.length)||null;
      if(clip)animationClips.set(style,{clip,scene:gltf.scene});
      return clip;
    }).catch(error=>{
      console.warn("Animação Mixamo indisponível:",animationFiles[style],error);
      return null;
    }));
  }
  return clipPromises.get(style);
}
function buildAnimationAction(member,style){
  const data=animationClips.get(style);
  if(!member.rig||!data)return null;
  const sourceBones=new Map(),targetBones=new Map();
  data.scene.updateMatrixWorld(true);
  member.rig.updateMatrixWorld(true);
  // GLB sem skin: GLTFLoader cria Object3D comuns, não necessariamente Bone.
  data.scene.traverse(obj=>{if(obj.name&&/^mixamorig/i.test(obj.name))sourceBones.set(boneKey(obj.name),obj);});
  member.rig.traverse(obj=>{if(obj.isBone)targetBones.set(boneKey(obj.name),obj);});
  const tracks=[];
  const invSourceRest=new THREE.Quaternion(),sample=new THREE.Quaternion();
  const corrected=new THREE.Quaternion(),reference=new THREE.Quaternion();
  // GLBs Mixamo sem skin usam pose inicial diferente do macaco vestido.
  // Transferir a mudança LOCAL relativa à pose inicial de cada osso.
  for(const track of data.clip.tracks){
    const dot=track.name.lastIndexOf(".");
    if(dot<0)continue;
    const property=track.name.slice(dot+1);
    const key=boneKey(track.name.slice(0,dot));
    const source=sourceBones.get(key),target=targetBones.get(key);
    if(!source||!target||property!=="quaternion")continue;
    const rest=member.restBones?.get(target.uuid)||target.quaternion.clone();
    invSourceRest.copy(source.quaternion).invert();
    const values=new Float32Array(track.values.length);
    for(let i=0;i<track.values.length;i+=4){
      sample.fromArray(track.values,i);
      // Em repouso, a rotação resultante deve ser exatamente a pose do macaco.
      corrected.copy(invSourceRest).multiply(sample);
      corrected.premultiply(rest).normalize();
      // Evitar saltos entre quaternions equivalentes com sinais opostos.
      if(i>0){
        reference.fromArray(values,i-4);
        if(reference.dot(corrected)<0)corrected.set(-corrected.x,-corrected.y,-corrected.z,-corrected.w);
      }
      corrected.toArray(values,i);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(target.name+".quaternion",track.times.slice(),values));
  }
  if(tracks.length<5){console.warn("Mixamo: ossos correspondentes insuficientes para",style,tracks.length);return null;}
  console.info("Mixamo retarget:",style,tracks.length,"ossos com animação");
  member.mixer ||=new THREE.AnimationMixer(member.rig);
  const clip=new THREE.AnimationClip("junto-retarget-"+style,data.clip.duration,tracks);
  const action=member.mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat,Infinity);
  return action;
}
function switchDance(member,style){
  if(member.currentDance===style)return;
  member.action?.fadeOut(.24);
  member.currentDance=style;
  member.action=null;
  if(style==="idle"||!animationClips.has(style))return;
  const action=buildAnimationAction(member,style);
  if(action){action.reset().fadeIn(.24).play();member.action=action;}
}
let active=false,room=null,renderer=null,scene=null,camera=null,board=null,frame=0,sequence=0;
const drinkControls=document.createElement("div");
drinkControls.style.cssText="position:absolute;right:15px;bottom:55px;display:none;gap:8px;z-index:6;pointer-events:auto";
const drinkButton=document.createElement("button"),dropButton=document.createElement("button");
drinkButton.type=dropButton.type="button";
drinkButton.textContent="🥤 Beber";dropButton.textContent="Soltar garrafa";
drinkButton.className="btn";dropButton.className="btn secondary";
drinkControls.append(drinkButton,dropButton);stage?.appendChild(drinkControls);
function refreshDrinkControls(){
 const entry=people.get(socket?.id),equipped=Boolean(entry?.data?.drink);
 drinkControls.style.display=active&&equipped?"flex":"none";
 drinkButton.disabled=Date.now()<(entry?.data?.drinkingUntil||0);
}
drinkButton.onclick=()=>{if(people.get(socket.id)?.data?.drink)socket.emit("club-drink-sip");};
dropButton.onclick=()=>socket.emit("club-drink-drop");
let down=null;
// Teto de render: menor carga na GPU sem limitar as animações do restante do site.
const CLUB_MOBILE=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const CLUB_FPS=CLUB_MOBILE?30:40;
const CLUB_FRAME_MS=1000/CLUB_FPS;
const CLUB_RENDER_SCALE=CLUB_MOBILE?.8:.9;
let lastClubFrame=0,clubVisualTick=0;
const people=new Map();
const danceSpeechTimers=new Map(); // Map<avatar, Set<timeout>>
function clearDanceSpeech(member){
  for(const timer of danceSpeechTimers.get(member)||[])clearTimeout(timer);
  danceSpeechTimers.delete(member);
  for(const item of member.speechStack||[]){
    item.sprite.parent?.remove(item.sprite);
    item.sprite.material.map?.dispose();
    item.sprite.material.dispose();
  }
  member.speechStack=[];
  member.speech=null;
}
function layoutDanceSpeech(member){
  const stack=member.speechStack||[];
  let offset=0;
  // Novas mensagens embaixo; as anteriores sobem sem reiniciar seus 7 segundos.
  for(let i=stack.length-1;i>=0;i--){
    const item=stack[i];
    item.targetY=3.15+item.sprite.scale.y/2+offset;
    offset+=item.sprite.scale.y+.12;
  }
}
const tiles=[],chairs=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const clock=new THREE.Clock();
const sittingFrameQuaternion=new THREE.Quaternion();
const seatedHipDelta=new THREE.Vector3();
const PUBLISHED_SEAT_GLASSES_FIT=Object.freeze({x:-.0002,y:-.0011,z:-.0024});
// Encaixe da cadeira, separado dos acessórios. Valores privados não são
// enviados ao Socket.IO nem aplicados ao modelo de outros participantes.
const SEATED_DEFAULTS=Object.freeze({x:.10,y:.85,z:.28,yaw:0,lean:0,hip:0});
// Restaurar o espaçamento original do lounge: 2 casas entre as cadeiras,
// uma mesa centralizada e folga para os macacos sentados.
// IDs lógicos seguem idênticos aos validados pelo servidor.
const CLUB_SEATS=Object.freeze([
  Object.freeze({id:0,x:-3,z:-3,yaw:Math.PI/2,wx:-5.5,wz:-5.18}),
  Object.freeze({id:1,x:-1,z:-3,yaw:-Math.PI/2,wx:-3.5,wz:-5.18}),
  Object.freeze({id:2,x:-3,z:0,yaw:Math.PI/2,wx:-5.5,wz:-2.18}),
  Object.freeze({id:3,x:-1,z:0,yaw:-Math.PI/2,wx:-3.5,wz:-2.18})
]);
const CLUB_TABLES=Object.freeze([
  Object.freeze({x:-2,z:-3,wx:-4.5,wz:-5.18}),
  Object.freeze({x:-2,z:0,wx:-4.5,wz:-2.18})
]);
// Mesas de coquetel nas bordas livres da pista; longe do lounge e do DJ.
// Nao ocupam tiles de circulacao central. Objetos decorativos sem colisao.
const CLUB_COCKTAIL_SPOTS=Object.freeze([
  {x:6.45,z:-3.5,rotation:-.22,drinks:["licorbanana","licorbananal"]},
  {x:6.45,z:2.35,rotation:.31,drinks:["licorbananal"]},
  {x:1.55,z:6.35,rotation:-.14,drinks:["licorbanana","licorbanana"]}
]);
const isCocktailTile=(x,z)=>CLUB_COCKTAIL_SPOTS.some(t=>Math.abs((x-2.5)-t.x)<.55&&Math.abs((z-2.5)-t.z)<.55);
const isTableTile=(x,z)=>CLUB_TABLES.some(t=>t.x===x&&t.z===z);
const clubSeatAt=(x,z)=>CLUB_SEATS.find(seat=>seat.x===x&&seat.z===z)||null;
// A calibração X/Z pertence à orientação do assento: acompanhá-la
// quando a cadeira gira, para o macaco continuar encaixado.
function chairRelativeOffset(settings,seat){
  const angle=seat?.yaw||0,c=Math.cos(angle),s=Math.sin(angle);
  return {x:settings.x*c+settings.z*s,z:settings.z*c-settings.x*s};
}
// Publicação: calibração fixa aprovada; ferramentas ficam na branch de dev.
const seatSettingsFor=()=>SEATED_DEFAULTS;
// Os modelos novos sao assets independentes. O clone protege o cache ao
// reabrir a Junto Club; descartamos carregamentos de cenas ja fechadas.
const furnitureAssets=new Map(),cocktailTargets=[];
function getClubFurniture(file){
  if(!furnitureAssets.has(file)){
    const loading=gltfLoader.loadAsync("/club/"+file).catch(error=>{
      furnitureAssets.delete(file);
      throw error;
    });
    furnitureAssets.set(file,loading);
  }
  return furnitureAssets.get(file);
}
function installClubFurniture({file,sceneBoard,worldScene,x,z,height,rotation=0,seatId=null}){
  getClubFurniture(file).then(gltf=>{
    if(!active||scene!==worldScene||board!==sceneBoard)return;
    const item=gltf.scene.clone(true);
    const bounds=new THREE.Box3().setFromObject(item);
    if(bounds.isEmpty())throw Error("Modelo sem geometria: "+file);
    const extent=bounds.getSize(new THREE.Vector3());
    const center=bounds.getCenter(new THREE.Vector3());
    const scale=height/Math.max(extent.y,.0001);
    // Centralizar no pivô ANTES de rotacionar. Assim, girar 180° a segunda
    // cadeira não faz o GLB deslocar lateralmente pela origem da exportação.
    const anchor=new THREE.Group();
    anchor.name=seatId===null?"jfClubTable":"jfClubChair"+seatId;
    anchor.position.set(x,0,z);
    anchor.rotation.y=rotation;
    item.scale.setScalar(scale);
    item.position.set(-center.x*scale,-.08-bounds.min.y*scale,-center.z*scale);
    anchor.add(item);
    sceneBoard.add(anchor);
    if(seatId!==null)item.traverse(node=>{
      if(!node.isMesh)return;
      node.userData.jfClubSeatId=seatId;
      chairs.push(node);
    });
  }).catch(error=>{
    console.warn("Junto Club: nao foi possivel carregar "+file,error);
    if(active&&scene===worldScene)setStatus("Móvel 3D ausente: public/club/"+file+". Extraia o pacote de móveis no projeto.");
  });
}
// Modelos otimizados compartilhados entre mesas; geometria e texturas em cache.
async function installCocktailTables(worldScene,sceneBoard){
  const assets=["mesinhabalada_otimizado.glb","licorbanana_otimizado.glb","licorbananal_otimizado.glb"];
  let loaded;
  try{loaded=await Promise.all(assets.map(file=>getClubFurniture(file)));}
  catch(error){console.warn("The Simios: modelos das mesinhas indisponiveis",error);return;}
  if(!active||scene!==worldScene||board!==sceneBoard)return;
  const models=new Map(assets.map((f,i)=>[f.split("_")[0],loaded[i].scene]));
  // Encaixa o fundo da garrafa no tampo, independentemente do pivo Meshy.
  const prepare=(model,targetHeight)=>{
    const copy=model.clone(true),bounds=new THREE.Box3().setFromObject(copy);
    if(bounds.isEmpty())return null;
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=targetHeight/Math.max(size.y,.001);
    copy.scale.setScalar(scale);
    copy.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    return copy;
  };
  for(let i=0;i<CLUB_COCKTAIL_SPOTS.length;i++){
    const spot=CLUB_COCKTAIL_SPOTS[i];
    const anchor=new THREE.Group();
    anchor.name="jfCocktailTable"+i;
    anchor.position.set(spot.x,-.08,spot.z);
    anchor.rotation.y=spot.rotation;
    const tabletop=1.85;
    const table=prepare(models.get("mesinhabalada"),tabletop);
    if(!table)continue;
    anchor.add(table);
    const offsets=spot.drinks.length===1?[[0,0]]:[[-.34,.08],[.34,-.06]];
    spot.drinks.forEach((name,j)=>{
      const model=models.get(name);
      if(!model)return;
      const bottle=prepare(model,name==="licorbananal"?.75:.70);
      if(!bottle)return;
      bottle.position.x+=offsets[j][0];
      bottle.position.y+=tabletop;
      bottle.position.z+=offsets[j][1];
      bottle.rotation.y=j?-.4:.3;
      bottle.traverse(node=>{if(node.isMesh){node.userData.jfDrinkType=name;cocktailTargets.push(node);}});
      anchor.add(bottle);
    });
    sceneBoard.add(anchor);
  }
}
const stageColor=0xb6d5eb;
const nameMaterialCache=new Map();

function nameSprite(name){
  const safe=String(name||"Macaco").slice(0,24);
  let texture=nameMaterialCache.get(safe);
  if(!texture){
    const canvas=document.createElement("canvas");canvas.width=384;canvas.height=88;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="rgba(21,43,74,.86)";ctx.beginPath();ctx.roundRect(4,4,376,78,18);ctx.fill();
    ctx.strokeStyle="#8ad0fb";ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle="#ffffff";ctx.font="bold 42px Trebuchet MS, Arial";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(safe,192,43,352);
    texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    nameMaterialCache.set(safe,texture);
  }
  const material=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true});
  const sprite=new THREE.Sprite(material);sprite.scale.set(1.65,.39,1);sprite.position.y=1.99;
  sprite.renderOrder=200;
  return sprite;
}
function showDanceSpeech(message){
  if(!active||!message?.text)return;
  const member=people.get(message.senderId);
  if(!member?.root)return;

  const name=String(message.name||"Macaco").slice(0,24);
  const content=String(message.text||"").trim().slice(0,500);
  if(!content)return;
  const themes={
    classic:{bg:"#ffffff",border:"#333846",ink:"#252830",name:"#3d5265"},
    pink:{bg:"#ffe4f1",border:"#b74280",ink:"#5e2245",name:"#8b2f63"},
    blue:{bg:"#d9f2ff",border:"#3179bd",ink:"#1e405d",name:"#27639b"},
    green:{bg:"#dcffe4",border:"#38915a",ink:"#225536",name:"#287d49"},
    dark:{bg:"#303649",border:"#a6bbdb",ink:"#ffffff",name:"#b6d9ff"}
  };
  const style=themes[message.bubbleStyle]||themes.classic;
  const canvas=document.createElement("canvas"),measure=canvas.getContext("2d");
  const size=45,lineH=58,pad=22,iconW=76,gap=24,maxWidth=1140;
  measure.font="bold 41px Arial,sans-serif";
  const prefixWidth=measure.measureText(name+":").width+18;
  measure.font="700 "+size+"px Arial,sans-serif";
  const otherMax=maxWidth-iconW-gap-pad*4;
  const firstMax=Math.max(100,otherMax-prefixWidth);
  const lines=[""];
  for(const word of content.split(/\s+/)){
    let remain=word;
    while(remain){
      const i=lines.length-1,limit=i===0?firstMax:otherMax;
      const candidate=lines[i]?lines[i]+" "+remain:remain;
      if(measure.measureText(candidate).width<=limit){lines[i]=candidate;break;}
      if(lines[i]){lines.push("");continue;}
      let piece="";
      for(const ch of remain){if(measure.measureText(piece+ch).width>limit&&piece)break;piece+=ch;}
      if(!piece)piece=remain[0];
      lines[i]=piece;remain=remain.slice(piece.length);
      if(remain)lines.push("");
    }
  }
  const firstContent=measure.measureText(lines[0]).width+prefixWidth;
  const otherContent=lines.slice(1).map(v=>measure.measureText(v).width);
  const widest=Math.max(firstContent,...otherContent,0);
  const innerW=Math.ceil(Math.max(180,widest+pad*2));
  const bodyW=iconW+gap+pad*2+innerW;
  const bodyH=pad*4+Math.max(1,lines.length)*lineH;
  const tail=24,margin=8;
  canvas.width=bodyW+margin*2;canvas.height=bodyH+tail+margin*2;
  const g=canvas.getContext("2d");
  // Contorno externo arredondado; a fala tem seu próprio contorno e cauda
  // dentro dele, apontando para o retrato de quem enviou a mensagem.
  const rounded=(x,y,w,h,r,fill,stroke)=>{
    g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();
    g.lineWidth=4;g.strokeStyle=stroke;g.stroke();
  };
  rounded(margin,margin,bodyW,bodyH,28,style.bg,style.border);
  const mid=margin+bodyW/2;
  g.fillStyle=style.border;g.beginPath();g.moveTo(mid-20,margin+bodyH-1);g.lineTo(mid,margin+bodyH+tail);g.lineTo(mid+20,margin+bodyH-1);g.closePath();g.fill();
  g.fillStyle=style.bg;g.beginPath();g.moveTo(mid-13,margin+bodyH-6);g.lineTo(mid,margin+bodyH+tail-9);g.lineTo(mid+13,margin+bodyH-6);g.closePath();g.fill();
  const innerX=margin+pad+iconW+gap,innerY=margin+pad;
  const innerH=bodyH-pad*2;
  // Divisória ligada às bordas externas, com o rabinho voltado à foto.
  // O restante compartilha o fundo e o contorno do balão externo.
  const mouthY=innerY+innerH/2;
  const dividerPath=()=>{
    g.beginPath();
    g.moveTo(innerX+12,margin);
    g.quadraticCurveTo(innerX,margin,innerX,margin+12);
    g.lineTo(innerX,mouthY-14);
    g.lineTo(innerX-18,mouthY+8);
    g.lineTo(innerX,mouthY+14);
    g.lineTo(innerX,margin+bodyH-12);
    g.quadraticCurveTo(innerX,margin+bodyH,innerX+12,margin+bodyH);
  };
  const firstY=innerY+pad;
  const avatarX=margin,avatarY=margin,avatarW=innerX+12-margin,avatarH=bodyH;
  const avatarSrc=typeof message.avatar==="string"&&/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(message.avatar)?message.avatar:"";
  const drawAvatar=(photo=null)=>{
    g.save();
    // Interseção entre o contorno externo e a área à esquerda da divisória.
    g.beginPath();g.roundRect(margin,margin,bodyW,bodyH,28);g.clip();
    dividerPath();
    g.lineTo(margin,margin+bodyH);g.lineTo(margin,margin);g.closePath();g.clip();
    g.fillStyle="#d9e3ef";g.fillRect(avatarX,avatarY,avatarW,avatarH);
    if(photo){
      const ratio=Math.max(avatarW/photo.naturalWidth,avatarH/photo.naturalHeight);
      const drawW=photo.naturalWidth*ratio,drawH=photo.naturalHeight*ratio;
      g.drawImage(photo,avatarX+(avatarW-drawW)/2,avatarY+(avatarH-drawH)/2,drawW,drawH);
    }else{
      g.fillStyle="#52617b";g.font="bold 44px Arial,sans-serif";
      g.textAlign="center";g.textBaseline="middle";
      g.fillText(name.slice(0,1).toUpperCase(),avatarX+(innerX-margin)/2,avatarY+avatarH/2);
    }
    g.restore();
    // Repor as linhas sobre a foto, inclusive após o carregamento assíncrono.
    g.save();g.strokeStyle=style.border;g.lineWidth=4;g.lineJoin="round";g.lineCap="round";
    dividerPath();g.stroke();
    // Somente a borda externa do retrato: não fechar a cauda externa da fala.
    g.beginPath();g.moveTo(innerX+12,margin);g.lineTo(margin+28,margin);
    g.quadraticCurveTo(margin,margin,margin,margin+28);
    g.lineTo(margin,margin+bodyH-28);
    g.quadraticCurveTo(margin,margin+bodyH,margin+28,margin+bodyH);
    g.lineTo(innerX+12,margin+bodyH);g.stroke();g.restore();
  };
  drawAvatar();
  g.textBaseline="top";g.textAlign="left";
  g.font="bold 41px Arial,sans-serif";g.fillStyle=style.name;
  const nameX=innerX+pad;
  g.fillText(name+":",nameX,firstY);
  const textX=nameX+g.measureText(name+":").width+18;
  g.font="700 "+size+"px Arial,sans-serif";g.fillStyle=style.ink;
  g.fillText(lines[0],textX,firstY);
  lines.slice(1).forEach((line,i)=>g.fillText(line,nameX,firstY+(i+1)*lineH));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  const scale=.0076; // Balões cerca de 25% menores, preservando a nitidez da textura.
  bubble.scale.set(canvas.width*scale,canvas.height*scale,1);
  bubble.position.set(0,3.15+canvas.height*scale/2,0);bubble.renderOrder=260;
  member.root.add(bubble);
  if(avatarSrc){
    const photo=new Image();
    photo.onload=()=>{
      if(!bubble.parent)return;
      if(!photo.naturalWidth||!photo.naturalHeight)return;
      drawAvatar(photo);texture.needsUpdate=true;
    };
    photo.onerror=()=>{};
    photo.src=avatarSrc;
  }
  if(!member.speechStack)member.speechStack=[];
  const item={sprite:bubble,targetY:bubble.position.y};
  member.speechStack.push(item);
  member.speech=bubble;
  layoutDanceSpeech(member);
  const timer=setTimeout(()=>{
    const stack=member.speechStack||[];
    const index=stack.indexOf(item);
    if(index!==-1)stack.splice(index,1);
    bubble.parent?.remove(bubble);bubble.material.map?.dispose();bubble.material.dispose();
    if(member.speech===bubble)member.speech=stack.at(-1)?.sprite||null;
    danceSpeechTimers.get(member)?.delete(timer);
    if(!danceSpeechTimers.get(member)?.size)danceSpeechTimers.delete(member);
    layoutDanceSpeech(member);
  },7000);
  if(!danceSpeechTimers.has(member))danceSpeechTimers.set(member,new Set());
  danceSpeechTimers.get(member).add(timer);
}
socket?.on("chat-message",showDanceSpeech);
function sceneSetup(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x090d20);
  scene.fog=new THREE.Fog(0x090d20,14,29);
  scene.add(new THREE.HemisphereLight(0x9caeea,0x171629,1.15));
  const sunlight=new THREE.DirectionalLight(0xa4b9f5,1.25);sunlight.position.set(2,10,8);scene.add(sunlight);
  const pinkLight=new THREE.PointLight(0xff389d,33,9);pinkLight.position.set(-1,3,0);scene.add(pinkLight);
  const blueLight=new THREE.PointLight(0x27acff,34,9);blueLight.position.set(2,3,-2);scene.add(blueLight);
  const mat=(color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const surface=mat(0x14213c),edge=mat(0x182747,.35,.4),wall=mat(0x131a36);
  const gold=mat(0xffbd6c,.72,.22),wood=mat(0x261837,.35,.4),glass=mat(0x26d6fc,.35,.12);
  const mesh=(geo,material,x,y,z,parent=scene)=>{
    const object=new THREE.Mesh(geo,material);object.position.set(x,y,z);parent.add(object);return object;
  };
  const cube=(w,h,d,material,x,y,z,parent=scene)=>mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent);
  board=new THREE.Group();scene.add(board);
  cube(14.65,.26,14.65,edge,0,-.34,0,board);
  const tileGeo=new THREE.BoxGeometry(.982,.09,.982);
  const tilesMats=[mat(0x252044,.45,.27),mat(0x112c44,.42,.25),mat(0x24203c,.4,.28),mat(0x163546,.46,.25)];
  for(let x=-4;x<10;x++)for(let z=-4;z<10;z++){
    const tile=new THREE.Mesh(tileGeo,tilesMats[(x+z)%4]);
    tile.position.set(x-2.5,-.13,z-2.5);tile.userData.tile={x,z};
    board.add(tile);tiles.push(tile);
    const trimMat=new THREE.MeshStandardMaterial({color:0x232d50,emissive:(x+z)%2?0x00d7ff:0xff3ea8,emissiveIntensity:.48,roughness:.32});
    const trim=cube(.92,.012,.92,trimMat,x-2.5,-.078,z-2.5,board);
    trim.userData.jfDanceGlow={x,z};
  }
  // Lounge no canto: duas cópias da cadeira original, uma de frente para
  // a outra, com a mesinha no quadrado central. Sem cadeira em cubos.
  const furnitureScene=scene,furnitureBoard=board;
  for(const seat of CLUB_SEATS)installClubFurniture({
    file:"cadeirabalada.glb",sceneBoard:furnitureBoard,worldScene:furnitureScene,
    x:seat.wx,z:seat.wz,height:1.16,rotation:seat.yaw,seatId:seat.id
  });
  for(const table of CLUB_TABLES)installClubFurniture({
    file:"mesabalada.glb",sceneBoard:furnitureBoard,worldScene:furnitureScene,
    x:table.wx,z:table.wz,height:.78
  });
  void installCocktailTables(furnitureScene,furnitureBoard);
  // Teto aberto: duas paredes em perspectiva Habbo, molduras e rodapés.
  cube(14.7,2.35,.18,wall,0,.96,-7.12);
  cube(.18,2.35,14.7,wall,-7.12,.96,0);
  cube(14.7,.18,.25,wood,0,2.19,-7.12);
  cube(.25,.18,14.7,wood,-7.12,2.19,0);
  cube(14.65,.24,.3,edge,0,-.01,-7.08);
  cube(.3,.24,14.65,edge,-7.08,-.01,0);
  // Painel de DJ, telas iluminadas e botões de mixagem fora das casas da pista.
  cube(2.5,.9,.42,wood,4.3,.53,-6.83);
  cube(1.22,.58,.12,mat(0x182846,.15,.28),4.3,1.19,-6.92);
  for(let k=0;k<7;k++)cube(.09,.08+(k%3)*.11,.03,k%2?mat(0x78f2dd):mat(0xff87b6),3.86+k*.15,1.02,-6.84);
  for(const x of [3.4,5.2]){
    mesh(new THREE.CylinderGeometry(.27,.27,.035,24),mat(0x18243b,.6,.25),x,1.01,-6.66);
    mesh(new THREE.CylinderGeometry(.12,.12,.045,24),gold,x,1.05,-6.66);
  }
  // Luminárias redondas e arabescos discretos nas paredes, estilo club retrô.
  for(const [x,z] of [[-6.72,-6.72],[6.72,-6.72],[-6.72,6.72],[6.72,6.72]]){
    const stand=mesh(new THREE.CylinderGeometry(.07,.09,1.34,12),wood,x,.56,z);
    const globe=mesh(new THREE.SphereGeometry(.25,20,12),glass,x,1.48,z);
    const glow=new THREE.PointLight(x<0?0xff3cac:0x24dfff,9,4);glow.position.set(x,1.55,z);scene.add(glow);
  }
  // Globo espelhado em pequenos quadrados, sem partículas pesadas.
  const disco=new THREE.Group();disco.position.set(.3,3.0,.2);
  disco.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.31,2),mat(0xe9f5fd,.92,.11)));
  const mirror=mat(0xffffff,.85,.1);
  for(let j=0;j<18;j++){
    const a=j*Math.PI*2/18;
    const facet=cube(.12,.1,.025,mirror,Math.cos(a)*.31,Math.sin(a)*.25,Math.sin(a*2)*.11,disco);
    facet.rotation.z=a;
  }
  scene.add(disco);scene.userData.disco=disco;
  // Holofotes neon translúcidos, girando devagar.
  const beamGeometry=new THREE.ConeGeometry(.46,4.7,14,1,true);
  beamGeometry.translate(0,-2.35,0);
  const beams=[];
  for(const [x,z,color,phase] of [[-5.4,-5.4,0xff3caa,0],[5.3,-5.4,0x24d9ff,1.8],[.4,5.3,0x9a65ff,3.1]]){
    const beam=new THREE.Mesh(beamGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.095,depthWrite:false,side:THREE.DoubleSide}));
    beam.position.set(x,2.85,z);beam.rotation.x=.18;beam.rotation.z=.14;
    scene.add(beam);beams.push({beam,phase});
    const lamp=new THREE.PointLight(color,14,5);lamp.position.set(x,2.35,z);scene.add(lamp);
  }
  scene.userData.beams=beams;
  scene.userData.glowingTiles=board.children.filter(o=>o.userData?.jfDanceGlow);
  // Letreiro neon: moldura rosa e letras azul-claro iluminadas.
  // Uma segunda textura SEM fundo, com composicao aditiva, cria o halo
  // visível para além do retângulo sem esconder o texto nitido.
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=320;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#0c102a";ctx.fillRect(0,0,1024,320);
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.strokeStyle="#ff70d5";ctx.lineWidth=14;
  ctx.shadowColor="#ff3cba";ctx.shadowBlur=24;
  ctx.strokeRect(34,32,956,256);
  ctx.shadowColor="#5cecff";ctx.shadowBlur=22;
  ctx.fillStyle="#f3ffff";ctx.font="bold 125px Trebuchet MS, Arial, sans-serif";
  ctx.fillText("JUNTO CLUB",512,163,888);
  ctx.shadowBlur=0;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const signGeometry=new THREE.PlaneGeometry(2.7,.84);
  const sign=new THREE.Mesh(signGeometry,new THREE.MeshBasicMaterial({
    map:texture,side:THREE.DoubleSide,toneMapped:false
  }));
  sign.position.set(-1.25,1.3,-2.99);
  scene.add(sign);
  scene.userData.signTexture=texture;

  // Brilho exterior na moldura e ao redor das letras (não é apenas cor forte).
  const haloCanvas=document.createElement("canvas");
  haloCanvas.width=1024;haloCanvas.height=320;
  const haloCtx=haloCanvas.getContext("2d");
  haloCtx.textAlign="center";haloCtx.textBaseline="middle";
  haloCtx.strokeStyle="rgba(255,87,203,.78)";
  haloCtx.lineWidth=15;
  haloCtx.shadowColor="#ff36ad";haloCtx.shadowBlur=55;
  haloCtx.strokeRect(34,32,956,256);
  haloCtx.fillStyle="rgba(119,237,255,.58)";
  haloCtx.font="bold 125px Trebuchet MS, Arial, sans-serif";
  haloCtx.shadowColor="#5cecff";haloCtx.shadowBlur=50;
  haloCtx.fillText("JUNTO CLUB",512,163,888);
  const haloTexture=new THREE.CanvasTexture(haloCanvas);
  haloTexture.colorSpace=THREE.SRGBColorSpace;
  const haloMaterial=new THREE.MeshBasicMaterial({
    map:haloTexture,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    toneMapped:false,opacity:.77
  });
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(2.85,.89),haloMaterial);
  halo.position.set(3.9,1.3,-6.963);
  scene.add(halo);
  const signLight=new THREE.PointLight(0xff55c1,3.5,2.8,2);
  signLight.position.set(3.9,1.3,-6.67);
  scene.add(signLight);
  scene.userData.signNeon={halo,haloTexture,signLight};
  camera=new THREE.OrthographicCamera(-6.35,6.35,4.25,-4.25,.1,100);
  camera.position.set(9,12,9);camera.lookAt(0,.55,0);
  renderer=new THREE.WebGLRenderer({antialias:!CLUB_MOBILE,alpha:false,powerPreference:"low-power"});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(CLUB_RENDER_SCALE);
  viewport.replaceChildren(renderer.domElement);
  const resize=()=>{
    if(!renderer||!active)return;
    const width=Math.max(220,viewport.clientWidth),height=Math.max(220,viewport.clientHeight);
    renderer.setSize(width,height,false);
    const aspect=width/height,halfH=9.1;
    camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize",resize);
  scene.userData.cleanup=()=>window.removeEventListener("resize",resize);
  resize();
}
function currentProfile(id){
  if(id===socket.id)return bridge.getProfile();
  return bridge.getPeerProfile(id)||{name:"Macaco",wardrobe:{}};
}
function currentSkin(id){
  return id===socket.id?bridge.getSkin():bridge.getPeerSkin(id);
}
async function putMember(id,details){
  if(!active||!room||!id)return;
  const prev=people.get(id);
  if(prev){
    prev.data={...prev.data,...details};return;
  }
  const generation=sequence;
  const profile=currentProfile(id);
  const entry={data:{...details},root:null,rig:null,dispose:null,name:null};
  people.set(id,entry);
  try{
    const avatar=await createDanceAvatar(profile.wardrobe,"default",()=>{},{local:id===socket.id});
    if(!active||generation!==sequence||people.get(id)!==entry){avatar.dispose();return;}
    entry.profileName=profile.name;
    entry.root=avatar.group;entry.rig=avatar.rig;entry.dispose=avatar.dispose;
    entry.rig.traverse(node=>{if(node.isBone&&boneKey(node.name)==="righthand")entry.drinkHand=node;});
    entry.rig.traverse(node=>{if(node.isBone&&/^(?:mixamorig:)?head$/i.test(node.name))entry.headBone=node;});
    jfBananaMarkerPromise.then(template=>{
      if(!template||!active||people.get(id)!==entry||!entry.root)return;
      const marker=template.clone(true);
      const box=new THREE.Box3().setFromObject(marker);
      const dims=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const longest=Math.max(dims.x,dims.y,dims.z,0.0001);
      marker.scale.setScalar(.68/longest);
      marker.position.copy(center).multiplyScalar(-.68/longest);
      marker.traverse(obj=>{
        if(!obj.isMesh)return;
        obj.material=(Array.isArray(obj.material)?obj.material:[obj.material]).map(material=>{
          const m=material.clone();
          if(m.color)m.color.multiplyScalar(1.65);
          if("roughness" in m)m.roughness=Math.min(m.roughness,.2);
          if("metalness" in m)m.metalness=Math.min(m.metalness,.15);
          if("emissive" in m){m.emissive.set(0x45ff22);m.emissiveIntensity=.28;}
          return m;
        });
        if(obj.material.length===1)obj.material=obj.material[0];
      });
      const pivot=new THREE.Group();
      pivot.add(marker);entry.root.add(pivot);entry.bananaMarker=pivot;
    });
entry.updateAccessories=avatar.updateAccessories;entry.setSeatGlassesCalibration=avatar.setSeatGlassesCalibration;entry.getGlassesDiagnostics=avatar.getGlassesDiagnostics;
    // Ajuste fino do slider fica apenas no nosso avatar; os demais usam o padrão salvo.
    if(id===socket.id)entry.setSeatGlassesCalibration?.(PUBLISHED_SEAT_GLASSES_FIT);
    entry.restBones=new Map();
    entry.animationBones=[];
    entry.rig.traverse(obj=>{
      if(!obj.isBone)return;
      entry.animationBones.push(obj);
      entry.restBones.set(obj.uuid,obj.quaternion.clone());
      // Memorizar a pose natural ANTES da primeira animacao.
      // Se a pessoa sentar antes de dancar, nao capturar a pose deformada
      // como repouso ao se levantar da cadeira.
      obj.userData.jfDanceRest=[obj.rotation.x,obj.rotation.y,obj.rotation.z];
    });
    sittingPose().then(pose=>{
      if(!pose||!active||people.get(id)!==entry)return;
      entry.sitRotations=new Map();
      entry.sitTracks=new Map();
      entry.sitDuration=pose.duration;
      entry.sitSourceWorld=pose.sourceWorldBones;
      entry.sitTargetRestWorld=new Map();
      // Quaternions de repouso relativos à raiz do macaco, sem a rotação
      // do avatar sobre a pista nem o giro da câmera.
      const invRigRest=entry.rig.getWorldQuaternion(new THREE.Quaternion()).invert();
      entry.rig.updateMatrixWorld(true);
      entry.rig.traverse(bone=>{
        if(!bone.isBone)return;
        const q=bone.getWorldQuaternion(new THREE.Quaternion());
        entry.sitTargetRestWorld.set(bone.uuid,q.premultiply(invRigRest));
      });
      entry.rig.updateMatrixWorld(true);
      // O FBX move tambem o quadril: nao descartar essa faixa como antes.
      // Transferir deslocamento RELATIVO ao primeiro quadro, jamais a posicao
      // absoluta do Mixamo (evita jogar o macaco para fora da cadeira).
      const targetHips=(()=>{let found=null;entry.rig.traverse(obj=>{
        if(!found&&obj.isBone&&boneKey(obj.name)==="hips")found=obj;
      });return found;})();
      if(targetHips&&pose.hipPosition){
        const sourceHip=pose.hipPosition;
        const scale=THREE.MathUtils.clamp(
          targetHips.position.length()/Math.max(sourceHip.sourceRest.length(),1e-6),.25,4);
        const targetParentRotation=targetHips.parent.getWorldQuaternion(new THREE.Quaternion());
        entry.sitHips={
          bone:targetHips,rest:targetHips.position.clone(),
          interpolant:sourceHip.interpolant,initial:sourceHip.initial,
          scale,
          alignment:targetParentRotation.invert().multiply(sourceHip.sourceParentQuaternion)
        };
      }
      entry.rig.traverse(bone=>{
        if(!bone.isBone)return;
        const name=boneKey(bone.name);
        const correction=pose.changes.get(name);
        const rest=entry.restBones.get(bone.uuid);
        if(correction&&rest)entry.sitRotations.set(bone.uuid,rest.clone().multiply(correction));
        const track=pose.animatedTracks.get(name);
        if(track&&rest)entry.sitTracks.set(bone.uuid,{...track,rest});
      });
    });
    for(const key of Object.keys(animationFiles))loadClip(key).then(clip=>{
      // Só reiniciar a ação quando a animação atualmente escolhida terminar de carregar.
      if(clip&&active&&people.get(id)===entry&&entry.data.dance===key&&entry.currentDance===key&&!entry.action)entry.currentDance=null;
    });
    entry.root.rotation.y=.65;
    entry.root.position.set(entry.data.x-2.5,.77,entry.data.z-2.5);
    // Nome flutuante removido: plumbob de banana livre.
    scene.add(entry.root);
  }catch(error){console.warn("Falha no avatar da pista:",error);if(people.get(id)===entry)people.delete(id);}
}
function removeMember(id){
  const member=people.get(id);if(!member)return;
  clearDanceSpeech(member);
  member.mixer?.stopAllAction();
  member.mixer?.uncacheRoot(member.rig);
  member.dispose?.();
  if(member.name)member.name.material.dispose();
  if(member.root)scene?.remove(member.root);
  people.delete(id);
  count.textContent=people.size+"/8 macacos";
}
function updateChoices(){
  const selected=people.get(socket.id)?.data.dance||"idle";
  for(const b of choices){b.setAttribute("aria-pressed",String(b.dataset.jfDance===selected));b.classList.toggle("active",b.dataset.jfDance===selected);}
}
function animate(now=performance.now()){
  if(!active||!renderer)return;
  frame=requestAnimationFrame(animate);
  // Não renderizar se a aba estiver oculta. Reiniciar o relógio evita saltos.
  if(document.hidden){lastClubFrame=0;clock.getDelta();return;}
  if(lastClubFrame && now-lastClubFrame<CLUB_FRAME_MS-1)return;
  lastClubFrame=now;
  const dt=Math.min(clock.getDelta(),.065);
  const time=clock.elapsedTime;
  // Luzes decorativas atualizadas em metade dos quadros; danças permanecem fluidas.
  if((++clubVisualTick&1)===0){
  for(const {beam,phase} of scene.userData.beams||[]){
    beam.rotation.z=.16*Math.sin(time*.55+phase);
    beam.rotation.x=.16*Math.cos(time*.43+phase);
  }
  for(const tile of scene.userData.glowingTiles||[]){
    const {x,z}=tile.userData.jfDanceGlow;
    tile.material.emissiveIntensity=.19+.45*(.5+.5*Math.sin(time*1.85+(x+z)*.63));
  }
  if(scene.userData.disco)scene.userData.disco.rotation.y+=dt*.34;
  // Suave pulsação de LED sem piscar agressivamente.
  if(scene.userData.signNeon){
    const neon=scene.userData.signNeon;
    neon.halo.material.opacity=.77+.09*Math.sin(time*1.3);
    neon.signLight.intensity=3.5+.6*Math.sin(time*1.3);
  }
  }
  for(const [id,p] of people){
    if(!p.root)continue;
    for(const item of p.speechStack||[]){
      item.sprite.position.y+= (item.targetY-item.sprite.position.y)*Math.min(1,dt*9);
    }
    const d=p.data,style=d.seated?"idle":d.dance||"idle";
    const sipping=Boolean(d.drink&&d.drinkingUntil>Date.now());
    if(p.drinkShown!==d.drink){
      p.drinkShown=d.drink||null;
      if(p.heldDrink){p.heldDrink.parent?.remove(p.heldDrink);p.heldDrink=null;}
      if(d.drink&&p.drinkHand){
        const desired=d.drink;
        getClubFurniture(desired+"_otimizado.glb").then(gltf=>{
          if(!active||people.get(id)!==p||p.drinkShown!==desired||!p.drinkHand)return;
          const model=gltf.scene.clone(true),bounds=new THREE.Box3().setFromObject(model);
          const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
          const factor=.50/Math.max(size.y,.001);
          model.scale.setScalar(factor);model.position.set(-center.x*factor,-center.y*factor,-center.z*factor);
          const holder=new THREE.Group();
          holder.position.set(.02,-.08,.045);holder.rotation.set(Math.PI/2,0,Math.PI/2);
          holder.add(model);p.drinkHand.add(holder);p.heldDrink=holder;
        }).catch(()=>{});
      }
    }
    if(id===socket.id)refreshDrinkControls();
    const targetX=d.x-2.5,targetZ=d.z-2.5;
    // A cadeira usa um deslocamento visual. O destino da caminhada
    // precisa ser o mesmo para não provocar oscilação infinita.
    const seatedSettings=seatSettingsFor(id);
    const seat=d.seated?clubSeatAt(d.x,d.z):null;
    const offset=d.seated?chairRelativeOffset(seatedSettings,seat):{x:0,z:0};
    const seatBaseX=d.seated&&seat?seat.wx:targetX;
    const seatBaseZ=d.seated&&seat?seat.wz:targetZ;
    const poseX=seatBaseX+offset.x,poseZ=seatBaseZ+offset.z;
    const dx=poseX-p.root.position.x,dz=poseZ-p.root.position.z;
    const distance=Math.hypot(dx,dz);
    const walking=distance>.025;
    // Interrompe a dança enquanto se desloca; retoma a dança escolhida ao chegar.
    // "idle" libera o rig para a animação procedural de caminhada abaixo.
    switchDance(p,sipping&&animationClips.has("drinking")?"drinking":walking?"idle":style);
    if(sipping&&!animationClips.has("drinking"))void loadDrinkingClip();
    // 0.7 casa por segundo: um caminhar leve, sem teleportar.
    if(walking){
      const step=Math.min(.70*dt,distance);
      p.root.position.x+=dx/distance*step;
      p.root.position.z+=dz/distance*step;
      // O macaco olha para o destino sem girar bruscamente.
      const heading=Math.atan2(dx,dz);
      const angleDiff=Math.atan2(Math.sin(heading-p.root.rotation.y),Math.cos(heading-p.root.rotation.y));
      p.root.rotation.y+=Math.max(-dt*4,Math.min(dt*4,angleDiff));
    }
    p.walkTime=(p.walkTime||0)+(walking?dt*7.8:0);
    const stride=Math.sin(p.walkTime);
    const speeds={shake:12,macarena:4.8,party:7.2,capoeira:5.6,groove:5.1};
    const phase=time*(speeds[style]||2);
    const pulse=Math.sin(phase),bounce=Math.abs(pulse);
    // A pose altera as articulações, não enterra o grupo inteiro no chão.
    p.root.position.y=(d.seated&&!walking?seatedSettings.y:.77)+(d.seated?0:walking?.032*Math.abs(stride):style==="idle"?.009*pulse:style==="capoeira"?.025*bounce:.045*bounce);

    p.root.rotation.x=d.seated&&!walking?THREE.MathUtils.degToRad(seatedSettings.lean):0;
    p.root.rotation.z=walking?0:style==="capoeira"?.14*pulse:style==="groove"?.12*pulse:style==="shake"?.07*pulse:0;
    if(!walking){
      const targetYaw=d.seated?(seat?.yaw||0)+THREE.MathUtils.degToRad(seatedSettings.yaw):.65;
      p.root.rotation.y+=Math.atan2(Math.sin(targetYaw-p.root.rotation.y),Math.cos(targetYaw-p.root.rotation.y))*Math.min(1,dt*1.6);
    }
    p.mixer?.update(dt);
    if(p.sitHips){
      const hip=p.sitHips;
      hip.bone.position.copy(hip.rest);
      if(d.seated&&!walking&&!p.action&&p.sitDuration>0){
        const t=((time%p.sitDuration)+p.sitDuration)%p.sitDuration;
        const sample=hip.interpolant.evaluate(t);
        if(sample?.length===3){
          seatedHipDelta.set(sample[0]-hip.initial.x,
            sample[1]-hip.initial.y,sample[2]-hip.initial.z)
            .applyQuaternion(hip.alignment).multiplyScalar(hip.scale*seatedSettings.hip);
          hip.bone.position.add(seatedHipDelta);
        }
      }
    }
    if(p.rig&&!p.action){
      const seatedTime=p.sitDuration>0?
        ((time%p.sitDuration)+p.sitDuration)%p.sitDuration:0;
      for(const obj of p.animationBones||[]){
        // Retarget Mixamo nao garante os MESMOS eixos de ombro e cotovelo.
        // Nesta versao de teste, preserve inteiramente o bind pose dos
        // bracos/maos e da cabeca durante a animacao sentada. Assim nao ha
        // rotacoes FBX deformando os bracos nem saltos na pose de repouso.
        if(d.seated&&!walking&&/^(?:left|right)(?:shoulder|arm|forearm|hand)|^(?:head|neck)$/.test(boneKey(obj.name))){
          const rest=p.restBones?.get(obj.uuid);
          if(rest)obj.quaternion.copy(rest);
          continue;
        }
        if(d.seated&&!walking&&p.sitTracks?.has(obj.uuid)&&p.sitDuration>0){
          const {rest,sourceInverse,interpolant}=p.sitTracks.get(obj.uuid);
          const value=interpolant.evaluate(seatedTime);
          if(value?.length===4){
            obj.quaternion.copy(rest).multiply(sourceInverse)
              .multiply(sittingFrameQuaternion.fromArray(value)).normalize();
            continue;
          }
        }
        if(d.seated&&!walking&&p.sitRotations?.has(obj.uuid)){
          obj.quaternion.copy(p.sitRotations.get(obj.uuid));
          continue;
        }
        if(!obj.userData.jfDanceRest)obj.userData.jfDanceRest=[obj.rotation.x,obj.rotation.y,obj.rotation.z];
        const [rx,ry,rz]=obj.userData.jfDanceRest;
        const n=obj.name.toLowerCase();
        // Compatível com esqueletos Mixamo e AccuRig/Reallusion.
        const isLeft=/left|(?:^|_)l_(?:arm|hand|thigh|calf|leg|shoulder)/.test(n),side=isLeft?1:-1;
        const upperLeg=/(upleg|upperleg|thigh)/.test(n);
        const lowerLeg=/(calf|shin|lowerleg|leg$)/.test(n)&&!upperLeg;
        const forearm=/(forearm|lowerarm)/.test(n);
        const upperArm=/(upperarm|arm$|shoulder)/.test(n)&&!forearm;
        const torso=/spine/.test(n);
        let x=rx,y=ry,z=rz;
        if(walking){
          if(upperLeg)x+=side*.36*stride;
          if(lowerLeg)x+=.15*Math.max(0,-side*stride);
          if(upperArm)x-=side*.26*stride;
          if(forearm)x-=side*.10*stride;
          if(torso)z+=.022*stride;
        }else if(style==="shake"){
          if(upperArm){x+=side*.26*Math.sin(phase);z+=side*.22*Math.cos(phase);}
          if(forearm)x+=side*.22*Math.sin(phase+1);
          if(upperLeg)x+=side*.08*Math.sin(phase);
          if(torso){y+=.09*Math.sin(phase);z+=.055*Math.cos(phase);}
        }else if(style==="macarena"){
          // Oito tempos: braços à frente, abertos, mãos à cabeça e à cintura.
          const beat=Math.floor(phase/Math.PI*2)%8;
          const reach=beat<2?1:beat<4?.55:beat<6?-.35:-.1;
          if(upperArm){x+=reach*.65;z+=side*(beat>=2&&beat<4?.80:beat>=4&&beat<6?.35:.08);}
          if(forearm)x+=(beat>=4&&beat<6?-.65:beat>=6?.65:.12);
          if(upperLeg)x+=side*.075*Math.sin(phase/2);
          if(torso)y+=.15*Math.sin(phase/2);
        }else if(style==="party"){
          if(upperArm){x+=side*.55*Math.sin(phase);z+=side*(.40+.25*Math.cos(phase));}
          if(forearm)x+=.30+.22*Math.sin(phase+side);
          if(upperLeg)x+=side*.17*Math.sin(phase);
          if(torso){y+=.12*Math.sin(phase);z+=.05*Math.cos(phase);}
        }else if(style==="capoeira"){
          // Ginga no lugar: alterna apoio das pernas e guarda dos braços.
          if(upperLeg)x+=side*.24*Math.sin(phase);
          if(lowerLeg)x+=.12*Math.max(0,side*Math.sin(phase));
          if(upperArm){x+=-side*.28*Math.sin(phase);z+=side*.28;}
          if(forearm)x+=-.32;
          if(torso){y+=.14*Math.sin(phase);z+=.11*Math.sin(phase);}
        }else if(style==="groove"){
          if(upperArm){x+=.25*Math.sin(phase+side);z+=side*(.28+.2*Math.sin(phase));}
          if(forearm)x+=side*.18*Math.cos(phase);
          if(upperLeg)x+=side*.13*Math.cos(phase);
          if(torso){y+=.18*Math.sin(phase);z+=.08*Math.sin(phase/2);}
        }
        obj.rotation.set(x,y,z);
      }
    }
    // Selecionar perfil de encaixe da cadeira apenas quando chegou ao assento.
    p.updateAccessories?.(Boolean(d.seated));
    if(p.bananaMarker){
      if(p.headBone){
        p.root.updateMatrixWorld(true);
        const head=p.headBone.getWorldPosition(new THREE.Vector3());
        p.root.worldToLocal(head);
        p.bananaMarker.position.copy(head).add(new THREE.Vector3(-.12,.6+.035*Math.sin(time*2),0));
      }else p.bananaMarker.position.set(-.12,1.85+.035*Math.sin(time*2),0);
      p.bananaMarker.rotation.y=time*.8;
    }

  }
  renderer.render(scene,camera);
}
function setStatus(message){status.textContent=message;}
function open(){
  room=bridge?.getRoom();
  if(!room){setStatus("Entre em uma sala para usar a pista.");return;}
  if(active)return;
  active=true;sequence++;people.clear();
  void sittingPose();
  void loadDrinkingClip();
  modal.hidden=false;
  if(openButton)openButton.hidden=true;
  try{sceneSetup();clock.start();lastClubFrame=0;clubVisualTick=0;animate();socket.emit("dance-enter");setStatus("Entrando na pista...");}
  catch(error){console.error(error);setStatus("Não foi possível abrir a pista 3D.");close();}
}
function close(){
  if(!active)return;
  const oldRoom=room;active=false;room=null;sequence++;lastClubFrame=0;
  cancelAnimationFrame(frame);
  socket.emit("dance-exit");
  for(const id of [...people.keys()])removeMember(id);
  scene?.userData.cleanup?.();
  scene?.userData.signTexture?.dispose();
  if(scene?.userData.signNeon){
    const {halo,haloTexture,signLight}=scene.userData.signNeon;
    halo.geometry.dispose();halo.material.dispose();haloTexture.dispose();
    signLight.dispose?.();
  }
  for(const tile of scene?.userData.glowingTiles||[])tile.material.dispose();
  for(const {beam} of scene?.userData.beams||[])beam.material.dispose();
  renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();
   cocktailTargets.length=0;drinkControls.style.display="none";
  for(const t of nameMaterialCache.values())t.dispose();nameMaterialCache.clear();
  scene=null;camera=null;renderer=null;board=null;tiles.length=0;chairs.length=0;
  modal.hidden=true;
  modal.classList.remove("jf-dance-expanded");
  if(openButton)openButton.hidden=false;
  if(oldRoom)setStatus("Saiu da pista.");
}
openButton?.addEventListener("click",open);
closeButton?.addEventListener("click",close);
document.getElementById("jfDanceExpand")?.addEventListener("click",()=>{
  const expanded=modal.classList.toggle("jf-dance-expanded");
  const button=document.getElementById("jfDanceExpand");
  button.textContent=expanded?"⤡ Retrair":"⤢ Ampliar";
  button.setAttribute("aria-pressed",String(expanded));
  window.dispatchEvent(new Event("resize"));
});
modal?.addEventListener("click",e=>{if(e.target===modal)close();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&active)close();});
for(const button of choices)button.addEventListener("click",()=>{if(!active)return;socket.emit("dance-style",{dance:button.dataset.jfDance});});
viewport?.addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY};});
viewport?.addEventListener("pointerup",e=>{
  if(!active||!renderer||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;
  down=null;
  const bounds=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const drinkHit=raycaster.intersectObjects(cocktailTargets,false)[0];
  if(drinkHit){
    const type=drinkHit.object.userData.jfDrinkType;
    if(type){socket.emit("club-drink-pickup",{type});setStatus("Garrafa equipada! Use Beber para consumir.");return;}
  }
  const chairHit=raycaster.intersectObjects(chairs)[0];
  if(chairHit){
    socket.emit("dance-sit",{seat:chairHit.object.userData.jfClubSeatId});
    return;
  }
  const hit=raycaster.intersectObjects(tiles)[0];
  if(hit){
    const {x,z}=hit.object.userData.tile;
    const seat=clubSeatAt(x,z);
    if(seat)socket.emit("dance-sit",{seat:seat.id});
    else if(isTableTile(x,z)||isCocktailTile(x,z))
      setStatus("Essa casa está ocupada pela mesinha da balada.");
    else socket.emit("dance-move",{x,z});
  }
});
socket?.on("dance-state",({room:joinedRoom,participants=[]})=>{
  if(!active||joinedRoom!==room)return;
  for(const entry of participants)putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  setStatus("Clique nas garrafas para pegar, no chão para andar ou na cadeira para sentar.");
  updateChoices();
});
socket?.on("dance-updated",entry=>{
  if(!active||!entry?.id)return;
  putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  if(entry.id===socket.id){updateChoices();refreshDrinkControls();}
});
socket?.on("dance-left",({id})=>{if(active)removeMember(id);});
function refreshDancer(id){
  if(!active||!people.has(id))return;
  const data={...people.get(id).data};
  removeMember(id);putMember(id,data);
  count.textContent=people.size+"/8 macacos";
}
socket?.on("profile-update",({id})=>{if(id)setTimeout(()=>refreshDancer(id),0);});
socket?.on("avatar-skin-update",({id})=>{if(id)setTimeout(()=>refreshDancer(id),0);});
window.addEventListener("jf-wardrobe-save",()=>refreshDancer(socket.id));
window.addEventListener("jf-local-profile-updated",()=>refreshDancer(socket.id));
window.addEventListener("jf-admin-skin-changed",()=>refreshDancer(socket.id));

socket?.on("dance-error",({message})=>{if(active)setStatus(message||"Não foi possível mover.");});
socket?.on("room-kicked",close);
socket?.on("left-room",close);
socket?.on("disconnect",close);
window.addEventListener("jf-dance-room-left",close);

