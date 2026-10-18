/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","gorro","palha","branco"],
  glasses:["nenhum","escuros","redondos"],
  headphones:["nenhum","azul","rosa"],
  outfit:["padrao","rosa"]
};
const defaults=()=>({hat:"nenhum",glasses:"nenhum",headphones:"nenhum",outfit:"padrao"});
const sanitize=x=>Object.fromEntries(Object.entries(OPTIONS).map(([key,list])=>[key,list.includes(x?.[key])?x[key]:defaults()[key]]));
const $=id=>document.getElementById(id);
const base=await new GLTFLoader().loadAsync("/macaco.glb").catch(error=>{
  console.warn("Guarda-roupa: macaco.glb não foi encontrado.",error);return null;
});
let previewRenderer=null;
let previewYaw=-.18;
// Todas as roupas são GLBs ajustados ao corpo original do macaco.
// Modelos pequenos de roupa/óculos/fones usam a escala ORIGINAL do macaco;
// apenas os chapéus Meshy grandes precisam ser normalizados.
const ASSETS={
  palha:"/Meshy_AI_Straw_Hat_with_Red_Ri_1018034335_texture.glb",
  branco:"/chapeu_sol_branco_corrigido.glb",
  bone:"/bone_azul.glb",
  gorro:"/touca_preta.glb",
  escuros:"/oculos_escuros.glb",
  redondos:"/oculos_redondos.glb",
  fone:"/fone_preto.glb",
  vestido:"/vestido_rosa.glb",
  hero:"/patrianocape_pose_heroica_final.glb",
  heroCape:"/Meshy_AI_Crimson_Champion_Cape_1018025832_texture.glb"
};
const assetCache=new Map(),loader=new GLTFLoader();
function getAsset(name){
  if(!ASSETS[name])return Promise.resolve(null);
  if(!assetCache.has(name)){
    assetCache.set(name,loader.loadAsync(ASSETS[name]).then(gltf=>gltf.scene).catch(error=>{
      assetCache.delete(name);
      const notice=document.getElementById("jfWardrobeAssetStatus");
      if(notice&&!document.getElementById("jfWardrobeModal")?.hidden)
        notice.textContent="Arquivo ausente: "+ASSETS[name]+". Extraia o pacote de acessórios na pasta public.";
      console.warn("Trajes: não carregou "+ASSETS[name],error);
      return null;
    }));
  }
  return assetCache.get(name);
}
function getBone(root,part){
  let bone=null;
  root.traverse(o=>{
    if(!bone&&o.isBone&&o.name.toLowerCase().endsWith(":"+part.toLowerCase()))bone=o;
  });
  return bone;
}
function getBounds(root){
  const box=new THREE.Box3().setFromObject(root);
  return {box,center:box.getCenter(new THREE.Vector3()),size:box.getSize(new THREE.Vector3())};
}
function dress(root,selection,render,monkey){
  const state=new THREE.Group();state.name="jfWardrobeParts";state.userData.active=true;root.add(state);
  const headBone=getBone(monkey,"Head");
  const topBone=getBone(monkey,"HeadTop_End");
  const neckBone=getBone(monkey,"Neck");
  monkey.updateMatrixWorld(true);
  const worldHead=new THREE.Vector3(-.13,.28,-.05);
  const worldTop=new THREE.Vector3(-.13,.9,0);
  const worldNeck=new THREE.Vector3(-.13,.18,-.05);
  if(headBone)headBone.getWorldPosition(worldHead);
  if(topBone)topBone.getWorldPosition(worldTop);
  if(neckBone)neckBone.getWorldPosition(worldNeck);
  // Corrige o desvio lateral do GLB antigo: a cabeça NÃO fica em X=0.
  const rawX=(worldHead.x-monkey.position.x)/monkey.scale.x;
  const rawNeckY=(worldNeck.y-monkey.position.y)/monkey.scale.y;
  const rawNeckZ=(worldNeck.z-monkey.position.z)/monkey.scale.z;
  const attachFitted=(file,configure,followHead=false)=>{
    getAsset(file).then(asset=>{
      if(!asset||!state.userData.active)return;
      const part=asset.clone(true);
      part.name="jfWardrobe_"+file;
      const measure=getBounds(part);
      configure(part,measure);
      monkey.add(part);
      monkey.updateMatrixWorld(true);
      if(followHead&&headBone)headBone.attach(part);
      render();
    });
  };
  if(selection.hat==="palha"||selection.hat==="branco"){
    const type=selection.hat;
    getAsset(type).then(asset=>{
      if(!asset||!state.userData.active)return;
      const hat=asset.clone(true);
      const measure=getBounds(hat);
      // Meshy: aba = Y mínimo + cerca de 12% da altura. Apoio = topo - 17 cm visuais.
      const width=type==="palha"?.94:.92;
      const scale=width/Math.max(measure.size.x,measure.size.z,1e-6);
      const brim=measure.box.min.y+measure.size.y*.12;
      hat.scale.setScalar(scale);
      hat.position.set(worldHead.x-measure.center.x*scale,
        worldTop.y-.17-brim*scale,
        worldHead.z-measure.center.z*scale+.05);
      hat.name="jfWardrobeHat_"+type;
      state.add(hat);
      // Reassocia ao osso da cabeça preservando a posição no espaço do macaco.
      state.updateWorldMatrix(true,true);
      if(headBone)headBone.attach(hat);
      render();
    });
  }else if(selection.hat==="bone"||selection.hat==="gorro"){
    attachFitted(selection.hat,part=>{
      part.position.x=rawX;
    },true);
  }
  if(selection.glasses!=="nenhum"){
    attachFitted(selection.glasses,(part,measure)=>{
      const s=.88;
      part.scale.setScalar(s);
      // Escalonar em torno do centro da peça, e não em torno do chão do cenário.
      part.position.set(rawX+(1-s)*measure.center.x,
        (1-s)*measure.center.y-.00018,
        (1-s)*measure.center.z+.00012);
    },true);
  }
  if(selection.headphones!=="nenhum"){
    const wearingHat=selection.hat!=="nenhum";
    attachFitted("fone",(part,measure)=>{
      part.traverse(node=>{
        if(!node.isMesh)return;
        const name=node.name.toLowerCase();
        if(name.includes("interior"))return;
        node.material=node.material.clone();
        node.userData.jfWardrobeOwnMaterial=true;
        node.material.color.set(selection.headphones==="rosa"?"#e06ba6":"#368dd0");
      });
      if(wearingHat){
        // Headset apoiado no pescoço, sem atravessar chapéu e olhos.
        const sc=.8;
        part.scale.setScalar(sc);
        part.position.set(rawX-measure.center.x*sc,
          rawNeckY-measure.center.y*sc-.0005,
          rawNeckZ-measure.center.z*sc+.0003);
      }else{
        // Geometria do fone foi originalmente feita para macaco.glb.
        const sc=.95;
        part.scale.setScalar(sc);
        part.position.set(rawX+(1-sc)*measure.center.x,
          (1-sc)*measure.center.y-.00005,
          (1-sc)*measure.center.z);
      }
    },!wearingHat);
  }
  if(selection.outfit==="rosa"){
    attachFitted("vestido",(part)=>{
      // Vestido modelado em coordenadas do corpo do macaco, sem escala arbitrária.
      part.position.x=rawX;
    },false);
  }
  return ()=>{
    state.userData.active=false;
    // As geometrias GLB são compartilhadas com os outros usuários;
    // descarte apenas os materiais clonados dos fones.
    monkey.traverse(obj=>{
      if(obj.isMesh&&obj.userData.jfWardrobeOwnMaterial)obj.material?.dispose();
    });
  };
}
// Pose Mixamo opcional, exclusiva do macaco ao lado do player.
let playerSittingPosePromise=null;
function loadPlayerSittingPose(){
  if(!playerSittingPosePromise){
    playerSittingPosePromise=new GLTFLoader().loadAsync("/poses/female-sitting.glb").catch(error=>{
      console.warn("Pose sentada do player ainda não disponível:",error);
      return null;
    });
  }
  return playerSittingPosePromise;
}
function applyPlayerSittingPose(monkey,source){
  const clip=source?.animations?.find(anim=>anim.tracks?.length);
  if(!clip){console.warn("Pose sentada: GLB sem animação utilizável.");return false;}
  const targets=new Map();
  const clean=name=>String(name).split("/").pop().replace(/^.*[|:]/,"").replace(/^mixamorig\d*/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  monkey.traverse(obj=>{if(obj.isBone)targets.set(clean(obj.name),obj);});
  const sources=new Map();
  source.scene.traverse(obj=>{if(obj.name&&/^mixamorig/i.test(obj.name))sources.set(clean(obj.name),obj);});
  const time=Math.min(.5,clip.duration*.5);
  let applied=0;
  const original=new THREE.Quaternion(),animated=new THREE.Quaternion(),result=new THREE.Quaternion();
  for(const track of clip.tracks){
    const dot=track.name.lastIndexOf(".");
    if(dot<0||track.name.slice(dot+1)!=="quaternion")continue;
    const key=clean(track.name.slice(0,dot)),bone=targets.get(key),src=sources.get(key);
    if(!bone||!src)continue;
    const interpolation=track.createInterpolant();
    const values=interpolation.evaluate(time);
    if(!values||values.length!==4)continue;
    original.copy(src.quaternion).invert();
    animated.fromArray(values);
    result.copy(original).multiply(animated);
    bone.quaternion.multiply(result).normalize();
    applied++;
  }
  console.info("Pose sentada Mixamo: ossos aplicados",applied,"de",clip.tracks.length,"canais");
  return applied>=5;
}
function makeScene(target,wardrobe,{preview=false,skin="default",playerSitting=false}={}){
  if(!base)return null;
  const width=preview?248:64,height=preview?248:68;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setSize(width,height,false);
  renderer.domElement.style.cssText="width:100%;height:100%;display:block";
  renderer.domElement.setAttribute("aria-label","Macaco 3D personalizado");
  target.replaceChildren(renderer.domElement);
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x61587a,2.7));
  const key=new THREE.DirectionalLight(0xffffff,2.1);key.position.set(2,3,4);scene.add(key);
  const monkey=cloneSkeleton(base.scene);
  const bounds=new THREE.Box3().setFromObject(monkey);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=1.8/(Math.max(size.x,size.y,size.z)||1);
  // Grupo normalizado: todos os acessórios usam o mesmo espaço visual.
  const normalized=new THREE.Group();
  monkey.scale.setScalar(scale);monkey.position.copy(center).multiplyScalar(-scale);
  normalized.add(monkey);
  const disposeOutfit=dress(normalized,sanitize(wardrobe),()=>renderer.render(scene,camera),monkey);
  scene.add(normalized);
  let active=true;
  if(playerSitting){
    loadPlayerSittingPose().then(asset=>{
      if(!active||!asset)return;
      if(applyPlayerSittingPose(monkey,asset))renderer.render(scene,camera);
      else console.warn("Pose sentada: ossos Mixamo insuficientes.");
    });
  }
  if(skin==="capitao-patria"){
    // Render independente da mesma skin 3D do player, sem editar o GLB base.
    getAsset("hero").then(asset=>{
      if(!asset||!active)return;
      // O Capitão Pátria é SkinnedMesh: clone() comum quebra o vínculo dos ossos.
      const hero=cloneSkeleton(asset);
      const bounds=new THREE.Box3().setFromObject(hero);
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const sc=1.78/Math.max(size.x,size.y,size.z,.001);
      hero.scale.setScalar(sc);
      hero.position.copy(center).multiplyScalar(-sc);
      const group=new THREE.Group();group.rotation.y=-.18;group.add(hero);
      scene.add(group);
      normalized.visible=false;
      // Reenquadrar pelo volume REAL, considerando esqueleto e capa.
      // A lista usa um canvas pequeno e não pode herdar o zoom da prévia.
      const fitHeroToCard=()=>{
        group.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(group,true);
        if(box.isEmpty())return;
        const center=box.getCenter(new THREE.Vector3());
        const size=box.getSize(new THREE.Vector3());
        const fov=THREE.MathUtils.degToRad(camera.fov);
        const aspect=Math.max(camera.aspect,.001);
        const distance=Math.max(
          size.y/(2*Math.tan(fov/2)),
          size.x/(2*Math.tan(fov/2)*aspect),
          size.z
        )*1.30;
        camera.position.set(center.x,center.y+distance*.025,center.z+distance);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        renderer.render(scene,camera);
      };
      fitHeroToCard();
      // Mesma capa da skin do player, mantendo alinhamento e texturas.
      getAsset("heroCape").then(capeAsset=>{
        if(!capeAsset||!active)return;
        const cape=capeAsset.clone(true);
        const capeBox=new THREE.Box3().setFromObject(cape);
        const capeCenter=capeBox.getCenter(new THREE.Vector3());
        const capeSize=capeBox.getSize(new THREE.Vector3());
        // Na miniatura, o topo da capa precisa coincidir com os ombros,
        // não com o quadril. O GLB Meshy tem origem no centro da capa.
        const heroBox=new THREE.Box3().setFromObject(hero,true);
        const heroSize=heroBox.getSize(new THREE.Vector3());
        const capeHeight=heroSize.y*.66;
        const capeScale=capeHeight/Math.max(capeSize.y,.001);
        cape.scale.setScalar(capeScale);
        cape.position.copy(capeCenter).multiplyScalar(-capeScale);
        const capeMount=new THREE.Group();
        // Ombros ~17% abaixo da cabeça; capa termina acima das botas.
        const shoulderY=heroBox.max.y-heroSize.y*.17;
        capeMount.position.set(heroBox.getCenter(new THREE.Vector3()).x,
          shoulderY-capeHeight*.5,-.62);
        capeMount.rotation.x=.12;
        cape.traverse(node=>{if(node.isMesh)node.frustumCulled=false;});
        capeMount.add(cape);
        group.add(capeMount);
        fitHeroToCard();
      });
    });
  }
  const camera=new THREE.PerspectiveCamera(33,width/height,.01,100);
  camera.position.set(0,.04,preview?4.25:4.0);camera.lookAt(0,.035,0);
  normalized.rotation.y=preview?previewYaw:-.18;
  renderer.render(scene,camera);
  let dragStart=null;
  const down=event=>{
    if(!preview)return;
    dragStart={x:event.clientX,y:normalized.rotation.y};
    target.setPointerCapture?.(event.pointerId);
  };
  const move=event=>{
    if(!dragStart)return;
    previewYaw=dragStart.y+(event.clientX-dragStart.x)*.012;
    normalized.rotation.y=previewYaw;
    renderer.render(scene,camera);
  };
  const up=()=>{dragStart=null;};
  if(preview){
    target.style.touchAction="pan-y";
    target.style.cursor="grab";
    target.addEventListener("pointerdown",down);
    target.addEventListener("pointermove",move);
    target.addEventListener("pointerup",up);
    target.addEventListener("pointercancel",up);
  }
  return {dispose:()=>{
    active=false;
    if(preview){
      target.removeEventListener("pointerdown",down);
      target.removeEventListener("pointermove",move);
      target.removeEventListener("pointerup",up);
      target.removeEventListener("pointercancel",up);
    }
    disposeOutfit();
    renderer.dispose();target.replaceChildren();
  },renderer};
}
// O mascote do player representa SEMPRE o usuário deste navegador,
// nunca o transmissor. Mantém a pose sentada e os acessórios locais.
let playerInstance=null;
let currentLocalWardrobe=null;
const playerStage=document.querySelector("#jfMiniDj .jf-dj-stage");
const playerHolder=document.createElement("div");
playerHolder.className="jf-transmitter-wardrobe";
playerHolder.style.cssText="position:absolute;inset:0;z-index:2;pointer-events:none;display:none;animation:jf-player-hover 3.2s ease-in-out infinite";
// Movimento de levitação independente do render 3D, sem modificar o rig sentado.
if(!document.getElementById("jfPlayerHoverStyle")){
  const style=document.createElement("style");style.id="jfPlayerHoverStyle";
  style.textContent="@keyframes jf-player-hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@media(prefers-reduced-motion:reduce){.jf-transmitter-wardrobe{animation:none!important}}";
  document.head.appendChild(style);
}
playerStage?.appendChild(playerHolder);
function updatePlayerMonkey(){
  const adminCostume=document.getElementById("jfMiniDj")?.classList.contains("jf-homelander");
  playerInstance?.dispose();playerInstance=null;
  const shown=Boolean(!adminCostume&&playerStage&&base);
  playerHolder.style.display=shown?"block":"none";
  playerStage?.querySelector("canvas.jf-glb-canvas")?.style.setProperty("visibility",shown?"hidden":"visible");
  if(shown){
    playerInstance=makeScene(playerHolder,currentLocalWardrobe||readSaved(),{preview:true,playerSitting:true});
    playerHolder.style.pointerEvents="none";
  }
}
window.addEventListener("jf-player-stage-ready",updatePlayerMonkey);
window.addEventListener("jf-local-profile-updated",event=>{currentLocalWardrobe=sanitize(event.detail?.wardrobe);updatePlayerMonkey();});
window.addEventListener("jf-wardrobe-save",event=>{currentLocalWardrobe=sanitize(event.detail?.wardrobe);updatePlayerMonkey();});
window.addEventListener("storage",event=>{if(event.key==="junto_profile"){currentLocalWardrobe=null;updatePlayerMonkey();}});
if(playerStage){
  new MutationObserver(updatePlayerMonkey)
    .observe(document.getElementById("jfMiniDj"),{attributes:true,attributeFilter:["class"]});
}
function readSaved(){
  try{return sanitize(JSON.parse(localStorage.getItem("junto_profile")||"{}").wardrobe);}catch{return defaults();}
}
let selection=readSaved();
let editing={...selection};
const selectors=Object.fromEntries(Object.keys(OPTIONS).map(k=>[k,$("jfWardrobe"+k[0].toUpperCase()+k.slice(1))]));
const preview=$("jfWardrobePreview");
function showPreview(){
  previewRenderer?.dispose();
  previewRenderer=makeScene(preview,editing,{preview:true});
}
for(const [key,element] of Object.entries(selectors)){
  if(!element)continue;
  element.value=editing[key];
  element.addEventListener("change",()=>{
    editing[key]=element.value;showPreview();
  });
}
const modal=$("jfWardrobeModal");
$("jfOpenWardrobe")?.addEventListener("click",()=>{
  editing={...selection};
  for(const [k,e] of Object.entries(selectors))if(e)e.value=editing[k];
  modal.hidden=false;document.body.style.overflow="hidden";showPreview();
});
function close(){
  modal.hidden=true;document.body.style.overflow="";
  previewRenderer?.dispose();previewRenderer=null;
}
$("jfCloseWardrobe")?.addEventListener("click",close);
modal?.addEventListener("click",e=>{if(e.target===modal)close();});
$("jfSaveWardrobe")?.addEventListener("click",()=>{
  selection=sanitize(editing);
  window.dispatchEvent(new CustomEvent("jf-wardrobe-save",{detail:{wardrobe:{...selection}}}));
  close();
});
const cards=new Map();
function refreshPeople(){
  const list=$("jfPeople");if(!list)return;
  for(const [target,instance] of cards){
    if(!target.isConnected){instance.dispose();cards.delete(target);}
  }
  const rows=list.querySelectorAll(".jf-person[data-jf-monkey='true']");
  for(const row of rows){
    const target=row.querySelector(".jf-member-monkey");
    if(!target||cards.has(target))continue;
    let wardrobe=defaults();
    try{wardrobe=sanitize(JSON.parse(row.dataset.wardrobe||"{}"));}catch{}
    const instance=makeScene(target,wardrobe,{skin:row.dataset.skin||"default"});
    if(instance)cards.set(target,instance);
  }
}
const observer=new MutationObserver(()=>{queueMicrotask(refreshPeople);});
const people=$("jfPeople");
if(people)observer.observe(people,{childList:true,subtree:false});
window.addEventListener("jf-wardrobe-save",()=>{selection=readSaved();refreshPeople();});
refreshPeople();

/* API reaproveitável da pista isométrica: usa a mesma rigagem e os mesmos GLBs.
   A pista é pequena e evita criar WebGLRenderers por participante. */
export async function createDanceAvatar(outfit={},skin="default",requestRender=()=>{}){
  if(!base)throw Error("Modelo macaco.glb indisponível.");
  const root=new THREE.Group();
  const monkey=cloneSkeleton(base.scene);
  const bounds=new THREE.Box3().setFromObject(monkey);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=1.50/Math.max(size.x,size.y,size.z,.0001);
  monkey.scale.setScalar(scale);
  monkey.position.copy(center).multiplyScalar(-scale);
  root.add(monkey);
  let stillActive=true;
  const disposeClothes=dress(root,sanitize(outfit),requestRender,monkey);
  if(skin==="capitao-patria"){
    const asset=await getAsset("hero");
    if(asset&&stillActive){
      const hero=cloneSkeleton(asset);
      const hbox=new THREE.Box3().setFromObject(hero);
      const sz=hbox.getSize(new THREE.Vector3()),mid=hbox.getCenter(new THREE.Vector3());
      const hs=1.5/Math.max(sz.x,sz.y,sz.z,.0001);
      hero.scale.setScalar(hs);hero.position.copy(mid).multiplyScalar(-hs);
      root.add(hero);monkey.visible=false;
      getAsset("heroCape").then(cape=>{
        if(!cape||!stillActive)return;
        const copy=cape.clone(true),box=new THREE.Box3().setFromObject(copy);
        const csz=box.getSize(new THREE.Vector3()),cc=box.getCenter(new THREE.Vector3());
        const cs=1.05/Math.max(csz.y,.001);
        copy.scale.setScalar(cs);copy.position.copy(cc).multiplyScalar(-cs);
        const mount=new THREE.Group();mount.position.set(0,.23,-.27);mount.add(copy);root.add(mount);
        requestRender();
      });
    }
  }
  return {group:root,rig:monkey,dispose:()=>{stillActive=false;disposeClothes();}};
}
