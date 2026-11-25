import "./asset-cache.js";
import {skinWardrobeShirt} from "./skin-wardrobe-shirt.mjs?v=2";
/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","apocaliptico","gorro","palha","branco","caveira"],
  glasses:["nenhum","escuros","redondos","sem_aro","botao"],
  headphones:["nenhum","azul","rosa","preto"],
  outfit:["padrao","rosa","rosa_novo","punk"]
};
const defaults=()=>({hat:"nenhum",glasses:"nenhum",headphones:"nenhum",outfit:"padrao"});
const sanitize=x=>Object.fromEntries(Object.entries(OPTIONS).map(([key,list])=>[key,list.includes(x?.[key])?x[key]:defaults()[key]]));
const $=id=>document.getElementById(id);
// O macaco-base (6,5 MiB) não é necessário na tela inicial.
let base=null,baseLoadPromise=null;
function ensureBaseModel(){
  if(baseLoadPromise)return baseLoadPromise;
  baseLoadPromise=new GLTFLoader().loadAsync("/macaco.glb").then(model=>{
    base=model;
    refreshPeople();
    const opened=document.getElementById("jfWardrobeModal");
    if(opened&&!opened.hidden)showPreview();
    return model;
  }).catch(error=>{
    console.warn("Guarda-roupa: macaco.glb não foi encontrado.",error);
    const opened=document.getElementById("jfWardrobeModal");
    if(opened&&!opened.hidden)document.getElementById("jfWardrobePreview").textContent="Modelo 3D indisponível.";
    return null;
  });
  return baseLoadPromise;
}
// Rig experimental: acessivel apenas para o avatar local da pista.
let testDanceModel=null;
export async function setDanceAvatarTestModel(url){
  if(!url){testDanceModel=null;return false;}
  const gltf=await new GLTFLoader().loadAsync(url);
  let skinned=0,bones=0;
  gltf.scene.traverse(node=>{if(node.isSkinnedMesh)skinned++;if(node.isBone)bones++;});
  if(!skinned||bones<15)throw new Error("Este GLB não possui rig/skinning completo.");
  testDanceModel=gltf;
  console.info("The Símios: Macaco 2.0 carregado:",skinned,"malha(s) com skin,",bones,"ossos");
  return true;
}
// Ajustes exclusivos do AccuRig experimental na pista, salvos localmente.
const DANCE_TEST_FIT_KEY="jf_macaco2_dance_outfit_fit_v1";
const DANCE_TEST_FIT_DEFAULTS={
  head:{offset:[0,-.14,0],scale:.94},
  torso:{offset:[0,-.02,0],scale:.94}
};
let danceTestFit=structuredClone(DANCE_TEST_FIT_DEFAULTS);
function normalizeDanceTestFit(value){
  const result=structuredClone(DANCE_TEST_FIT_DEFAULTS);
  for(const region of ["head","torso"]){
    const patch=value?.[region]||{};
    const arr=Array.isArray(patch.offset)?patch.offset:[];
    result[region].offset=[0,1,2].map(i=>{
      const v=Number(arr[i]);return Number.isFinite(v)?THREE.MathUtils.clamp(v,-.4,.4):result[region].offset[i];
    });
    const sc=Number(patch.scale);
    if(Number.isFinite(sc))result[region].scale=THREE.MathUtils.clamp(sc,.60,1.40);
  }
  return result;
}
try{
  const stored=localStorage.getItem(DANCE_TEST_FIT_KEY);
  if(stored)danceTestFit=normalizeDanceTestFit(JSON.parse(stored));
}catch(_){/* armazenamento bloqueado */}
export function getDanceAvatarTestFit(){return structuredClone(danceTestFit);}
export function setDanceAvatarTestFit(value){
  danceTestFit=normalizeDanceTestFit(value);
  try{localStorage.setItem(DANCE_TEST_FIT_KEY,JSON.stringify(danceTestFit));}catch(_){}
  return getDanceAvatarTestFit();
}
let previewRenderer=null;
let previewYaw=-.18;
// Todas as roupas são GLBs ajustados ao corpo original do macaco.
// Modelos pequenos de roupa/óculos/fones usam a escala ORIGINAL do macaco;
// apenas os chapéus Meshy grandes precisam ser normalizados.
const ASSETS={
  palha:"/Meshy_AI_Straw_Hat_with_Red_Ri_1018034335_texture.glb",
  branco:"/chapeu_sol_branco_corrigido.glb",
  bone:"/bone_azul.glb",
  apocaliptico:"/boneapocaliptico_otimizado.glb",
  gorro:"/touca_preta.glb",
  escuros:"/oculos_escuros.glb",
  redondos:"/oculos_redondos.glb",
  botao:"/olhos-botao-leve.glb",
  fone:"/fone_preto.glb",
  vestido:"/vestido_rosa.glb",
  caveira:"/toucaveira.glb",
  sem_aro:"/oculossemolo.glb",
  fone_novo:"/fonepreto.glb",
  vestido_novo:"/vestidorosa.glb",
  regatapunk:"/regatapunk_512_ultraleve.glb",
  hero:"/patrianocape_pose_heroica_final.glb",
  heroCape:"/Meshy_AI_Crimson_Champion_Cape_1018025832_texture.glb"
};
// Encaixes dos GLBs recentes. O vestido usa a profundidade (Z=0)
// calibrada manualmente pelo criador, não a antiga posição .06.
const FIT_DEFAULTS=Object.freeze({
  caveira:{width:.65,offset:[0,.35,.05]},
  sem_aro:{width:.56,offset:[0,.16,.06]},
  escuros:{width:.56,offset:[0,.16,.32]},
  redondos:{width:.56,offset:[0,.16,.29]},
  // Modelo Meshy normalizado pela largura e ancorado ao osso da cabeça.
  botao:{width:.68,offset:[0,.23,.31],scale:[.78,1,1]},
  fone_novo:{width:.66,offset:[0,.40,.10]},
  vestido_novo:{width:.70,offset:[0,-.24,0]},
  regatapunk:{width:.44,offset:[0,-.01,0]}
});
const FIT_STORAGE="jf_wardrobe_private_fit_v1";
const FIT_SEATED_STORAGE="jf_wardrobe_private_fit_seated_v1";
const localDevelopment=["localhost","127.0.0.1","[::1]"].includes(location.hostname);
let fitAccess=localDevelopment;
let privateFits={},privateSeatFits={};
function cleanFit(file,value){
  const base=FIT_DEFAULTS[file];
  if(!base)return null;
  const n=(v,fallback,min,max)=>Number.isFinite(Number(v))?THREE.MathUtils.clamp(Number(v),min,max):fallback;
  const offset=Array.isArray(value?.offset)?value.offset:base.offset;
  return {width:n(value?.width,base.width,.20,1.30),
    offset:base.offset.map((v,i)=>n(offset[i],v,-.60,.60))};
}
function cleanSeatedFit(file,value){
  const fit=cleanFit(file,value);
  if(!fit)return null;
  const pitch=Number(value?.pitch);
  return {...fit,pitch:Number.isFinite(pitch)?THREE.MathUtils.clamp(pitch,-80,80):0};
}
function loadPrivateFits(){
  if(!fitAccess)return;
  try{
    const data=JSON.parse(localStorage.getItem(FIT_STORAGE)||"{}");
    if(data&&typeof data==="object"&&!Array.isArray(data))
      for(const file of Object.keys(FIT_DEFAULTS))
        if(data[file])privateFits[file]=cleanFit(file,data[file]);
  }catch(error){console.warn("Editor de trajes: calibração local inválida.",error);}
  try{
    const data=JSON.parse(localStorage.getItem(FIT_SEATED_STORAGE)||"{}");
    if(data?.vestido_novo)privateSeatFits.vestido_novo=cleanSeatedFit("vestido_novo",data.vestido_novo);
  }catch(error){console.warn("Editor de trajes: ajuste sentado inválido.",error);}
}
if(fitAccess)loadPrivateFits();
const fittedItem=(file,enabled,seated=false)=>{
  const standing=enabled&&fitAccess?(privateFits[file]||FIT_DEFAULTS[file]):FIT_DEFAULTS[file];
  if(seated&&file==="vestido_novo"&&enabled&&fitAccess)
    return privateSeatFits.vestido_novo||{...standing,offset:[...standing.offset],pitch:0};
  return standing;
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
// O GLTFLoader normaliza nomes (por exemplo, "mixamorig:Head" pode
// virar "mixamorigHead"). O resolvedor legado exige ":" e falha,
// deixando os acessórios soltos no grupo do macaco.
// Usar identificação canônica APENAS nos avatares animados por ora.
function getAnimatedBone(root,part){
  const expected=String(part).replace(/[^a-z0-9]/gi,"").toLowerCase();
  let result=null;
  root.traverse(obj=>{
    if(result||!obj.isBone)return;
    const basename=String(obj.name||"").split(/[|/:]/).pop();
    const canonical=basename.replace(/^mixamorig\d*/i,"")
      .replace(/[^a-z0-9]/gi,"").toLowerCase();
    if(canonical===expected)result=obj;
  });
  return result;
}
function getBounds(root){
  const box=new THREE.Box3().setFromObject(root);
  return {box,center:box.getCenter(new THREE.Vector3()),size:box.getSize(new THREE.Vector3())};
}
function dress(root,selection,render,monkey,{animated=false,privateFit=false,previewSeated=false,experimental=false,rigidFollowers=false}={}){
  // Escala proporcional aplicada apenas ao Avatar Lab; as prévias antigas
  // continuam usando seus encaixes históricos.
  const fitScale=THREE.MathUtils.clamp(Number(root.userData.jfWardrobeScale)||1,.5,1.5);
  // Capturar o bind pose ANTES das animações. As promessas de GLB podem
  // resolver com o avatar andando/sentado; nesse caso attach() simples
  // preservaria uma posição antiga num esqueleto já animado.
  root.updateMatrixWorld(true);
  monkey.updateMatrixWorld(true);
  const monkeyBindWorld=monkey.matrixWorld.clone();
  const rootBindWorld=root.matrixWorld.clone();
  const state=new THREE.Group();state.name="jfWardrobeParts";state.userData.active=true;root.add(state);
  const notifyDevkitTarget=part=>{
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("jf-avatar-devkit-target-added",{detail:{name:part?.name||""}}));
  };
  const findBone=(model,part)=>getAnimatedBone(model,part)||getBone(model,part);
  const headBone=findBone(monkey,"Head");
  const topBone=findBone(monkey,"HeadTop_End");
  const neckBone=findBone(monkey,"Neck");
  const torsoBone=findBone(monkey,"Spine2")||findBone(monkey,"Spine");
  const hipBone=findBone(monkey,"Hips");
  // Novas peças de geometria livre: buscar os ossos também quando GLTFLoader
  // converte "mixamorig:Head" para "mixamorigHead".
  const newHeadBone=getAnimatedBone(monkey,"Head")||headBone;
  const newTopBone=getAnimatedBone(monkey,"HeadTop_End")||topBone;
  const newTorsoBone=getAnimatedBone(monkey,"Spine2")||torsoBone;
  if(animated&&!headBone)console.error("Guarda-roupa 3D: osso Head ausente.",monkey.name);
  const bindMatrices=new Map(),followers=[];
  let isSeated=Boolean(previewSeated);
  // Calibração feita na Junto Club (18/10): encaixe da armação
  // na pose Sitting Idle, relativo ao osso Head. Apenas avatares animados.
  const glassesCalibration={x:-.0002,y:-.0011,z:-.0024};
  const seatShift=new THREE.Matrix4();
  const setSeatGlassesCalibration=(values={})=>{
    for(const axis of ["x","y","z"]){
      const number=Number(values[axis]);
      if(Number.isFinite(number))glassesCalibration[axis]=THREE.MathUtils.clamp(number,-.004,.004);
    }
    // No controle de inspeção, a pose sentada é a referência obrigatória:
    // o slider não depende do critério de parada da animação.
    updateAccessories(true);
  };
  const getGlassesDiagnostics=()=>{
    const eyewear=followers.find(({part})=>part.name==="jfWardrobe_escuros"||part.name==="jfWardrobe_redondos"||part.name==="jfWardrobe_sem_aro");
    if(!eyewear)return {loaded:false,requested:selection.glasses,seated:isSeated,
      headBone:headBone?.name||null,attached:followers.map(({part})=>part.name)};
    monkey.updateMatrixWorld(true);
    const world=eyewear.part.getWorldPosition(new THREE.Vector3());
    const center=eyewear.bone.getWorldPosition(new THREE.Vector3());
    return {loaded:true,requested:selection.glasses,seated:isSeated,
      bone:eyewear.bone.name,
      coordinates:world.toArray().map(v=>Number(v.toFixed(4))),
      boneCoordinates:center.toArray().map(v=>Number(v.toFixed(4))),
      calibration:{...glassesCalibration}};
  };
  for(const bone of [headBone,neckBone,torsoBone,hipBone,newHeadBone,newTopBone,newTorsoBone])if(bone)bindMatrices.set(bone,bone.matrixWorld.clone());
  const rigidPosition=new THREE.Vector3(),rigidRotation=new THREE.Quaternion(),rigidScale=new THREE.Vector3();
  const bindPosition=new THREE.Vector3(),bindRotation=new THREE.Quaternion(),bindScale=new THREE.Vector3();
  const anchorPosition=new THREE.Vector3(),anchorRotation=new THREE.Quaternion(),anchorScale=new THREE.Vector3();
  const rootBindScale=new THREE.Vector3().setFromMatrixScale(rootBindWorld);
  const correctionWorld=new THREE.Matrix4(),parentInverse=new THREE.Matrix4(),localMatrix=new THREE.Matrix4();
  const updateAccessories=(seated=isSeated)=>{
    isSeated=Boolean(seated);
    if(!animated||!state.userData.active||!followers.length)return;
    // O root pode ter sido reposicionado para encostar no chão. Atualizar
    // TODA a hierarquia antes de ler bone.matrixWorld e calcular as roupas.
    root.updateWorldMatrix(true,true);
    for(const {part,bone,bindLocal,seatedLocal} of followers){
      if(!part.parent)continue;
      // A calibração é aplicada ANTES da matriz local do acessório,
      // portanto os eixos continuam relativos ao osso Head animado.
      if((part.name==="jfWardrobe_escuros"||part.name==="jfWardrobe_redondos")&&isSeated){
        // O modelo sem aro veio de um GLB novo e foi encaixado por largura e
        // ossatura; NÃO herdar o ajuste absoluto salvo para os óculos antigos.
        // O slider continua funcionando usando o deslocamento RELATIVO ao
        // preset antigo, sem estragar a posição neutra do novo modelo.
        const newModel=part.name==="jfWardrobe_sem_aro";
        seatShift.makeTranslation(
          glassesCalibration.x-(newModel?-.0002:0),
          glassesCalibration.y-(newModel?-.0011:0),
          glassesCalibration.z-(newModel?-.0024:0)
        );
        correctionWorld.multiplyMatrices(bone.matrixWorld,seatShift).multiply(seatedLocal);
      }else{
        correctionWorld.multiplyMatrices(bone.matrixWorld,isSeated?seatedLocal:bindLocal);
      }
      if(rigidFollowers){
        // A rigid hat/shirt must follow translation + rotation, not the
        // non-uniform scale/shear of a retargeted bone's world matrix.
        const bind=bindMatrices.get(bone);
        const local=isSeated?seatedLocal:bindLocal;
        bind.decompose(bindPosition,bindRotation,bindScale);
        correctionWorld.copy(bind).multiply(local).decompose(rigidPosition,rigidRotation,rigidScale);
        bone.matrixWorld.decompose(anchorPosition,anchorRotation,anchorScale);
        const ratio=root.getWorldScale(new THREE.Vector3()).x/rootBindScale.x;
        rigidPosition.sub(bindPosition).applyQuaternion(bindRotation.clone().invert())
          .multiplyScalar(ratio).applyQuaternion(anchorRotation).add(anchorPosition);
        rigidRotation.premultiply(bindRotation.clone().invert()).premultiply(anchorRotation);
        rigidScale.multiplyScalar(ratio);
        correctionWorld.compose(rigidPosition,rigidRotation,rigidScale);
      }
      part.parent.updateWorldMatrix(true,false);
      parentInverse.copy(part.parent.matrixWorld).invert();
      localMatrix.multiplyMatrices(parentInverse,correctionWorld);
      localMatrix.decompose(part.position,part.quaternion,part.scale);
      part.updateMatrix();
    }
  };
  // Converter do espaço ORIGINAL do acessório para o local do osso na pose
  // inicial; nunca usar a matriz atual (que pode ser de uma dança).
  const attachAtBind=(part,bone,sourceBindWorld,offset={},seatedOffset={})=>{
    if(!bone)return;
    const boneBind=bindMatrices.get(bone);
    if(!boneBind)return;
    part.updateMatrix();
    const local=new THREE.Matrix4().copy(boneBind).invert()
      .multiply(sourceBindWorld).multiply(part.matrix);
    // Armazenar a relação com o osso na pose original. No modo animado,
    // o acessório continua sob o grupo do avatar; a matriz é sincronizada
    // explicitamente com o Head/Neck/Hips após cada frame.
    const atBone=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
    local.decompose(atBone,rotation,scale);
    atBone.x+=offset.x||0;
    atBone.y+=offset.y||0;
    atBone.z+=offset.z||0;
    const bindLocal=new THREE.Matrix4().compose(atBone,rotation,scale);
    const seatPosition=atBone.clone().add(new THREE.Vector3(seatedOffset.x||0,seatedOffset.y||0,seatedOffset.z||0));
    const seatedLocal=new THREE.Matrix4().compose(seatPosition,rotation,scale);
    followers.push({part,bone,bindLocal,seatedLocal});
    updateAccessories();
  };
  const worldHead=new THREE.Vector3(-.13,.28,-.05);
  const worldTop=new THREE.Vector3(-.13,.9,0);
  const worldNeck=new THREE.Vector3(-.13,.18,-.05);
  if(headBone)headBone.getWorldPosition(worldHead);
  if(topBone)topBone.getWorldPosition(worldTop);
  else if(experimental&&headBone){
    // O rig AccuRig nao tem HeadTop_End: usar o topo real da malha.
    const bounds=new THREE.Box3().setFromObject(monkey,true);
    worldTop.set(worldHead.x,bounds.max.y,worldHead.z);
  }
  if(neckBone)neckBone.getWorldPosition(worldNeck);

  // Corrige o desvio lateral do GLB antigo: a cabeça NÃO fica em X=0.
  const rawX=(worldHead.x-monkey.position.x)/monkey.scale.x;
  const rawNeckY=(worldNeck.y-monkey.position.y)/monkey.scale.y;
  const rawNeckZ=(worldNeck.z-monkey.position.z)/monkey.scale.z;
  const attachFitted=(file,configure,followHead=false,animatedAnchor=null,animatedOffset=null,seatedOffset=null)=>{
    getAsset(file).then(asset=>{
      if(!asset||!state.userData.active)return;
      const part=asset.clone(true);
      part.name="jfWardrobe_"+file;
      const measure=getBounds(part);
      configure(part,measure);
      // A roupa rígida acompanha a nova escala física do personagem.
      part.scale.multiplyScalar(fitScale);
      if(experimental){
        const region=file==="vestido"?"torso":"head";
        const tune=danceTestFit[region];
        const inv=Math.max(Math.abs(monkey.scale.x),.0001);
        part.position.add(new THREE.Vector3(...tune.offset).multiplyScalar(1/inv));
        part.scale.multiplyScalar(tune.scale);
      }
      monkey.add(part);
      notifyDevkitTarget(part);
      if(animated){
        if(animatedAnchor)attachAtBind(part,animatedAnchor,monkeyBindWorld,animatedOffset||{},seatedOffset||{});
        // Os óculos clássicos usam um encaixe próprio calibrado para a pose
        // Sitting Idle. Aplicar somente DIFERENÇAS do editor privado sobre
        // essas matrizes: defaults não mudam o que já funciona na pista.
        if(privateFit&&(file==="escuros"||file==="redondos")){
          const follower=followers.find(item=>item.part===part);
          const bind=bindMatrices.get(animatedAnchor);
          if(follower&&bind){
            const originalBind=follower.bindLocal.clone();
            const originalSeated=follower.seatedLocal.clone();
            const boneFromRoot=bind.clone().invert().multiply(rootBindWorld);
            const rootOrigin=new THREE.Vector3().setFromMatrixPosition(boneFromRoot);
            const delta=new THREE.Vector3();
            const move=new THREE.Matrix4(),resize=new THREE.Matrix4();
            const update=()=>{
              if(!state.userData.active||!part.parent)return;
              const def=FIT_DEFAULTS[file],fit=fittedItem(file,true);
              delta.set(
                fit.offset[0]-def.offset[0],
                fit.offset[1]-def.offset[1],
                fit.offset[2]-def.offset[2]
              ).applyMatrix4(boneFromRoot).sub(rootOrigin);
              move.makeTranslation(delta.x,delta.y,delta.z);
              const ratio=fit.width/def.width;
              resize.makeScale(ratio,ratio,ratio);
              follower.bindLocal.copy(move).multiply(originalBind).multiply(resize);
              follower.seatedLocal.copy(move).multiply(originalSeated).multiply(resize);
              updateAccessories(isSeated);
              render();
            };
            adjustableParts.push({file,update});
            update();
          }
        }
      }else{
        monkey.updateMatrixWorld(true);
        if(followHead&&headBone)headBone.attach(part);
      }
      updateAccessories(isSeated);
      render();
    });
  };
  // Os novos arquivos têm largura ~2, diferente dos acessórios originais.
  // Usa o centro do osso no bind pose e escala por largura em unidades de palco.
  const rootBindInverse=rootBindWorld.clone().invert();
  const restInRoot=bone=>{
    const mat=bindMatrices.get(bone);
    return mat?new THREE.Vector3().setFromMatrixPosition(mat).applyMatrix4(rootBindInverse):new THREE.Vector3();
  };
  const adjustableParts=[];
  const onFitUpdated=event=>{
    const file=event.detail?.file;
    for(const binding of adjustableParts)
      if(!file||file===binding.file)binding.update();
  };
  if(privateFit&&fitAccess)window.addEventListener("jf-private-fit-updated",onFitUpdated);
  const installNewWearable=(file,bone,{seatedOffset={},preset=null}={})=>{
    getAsset(file).then(asset=>{
      if(!asset||!state.userData.active||!bone)return;
      const part=asset.clone(true);
      part.name="jfWardrobe_"+file;
      const measure=getBounds(part);
      state.add(part);
      notifyDevkitTarget(part);
      // A peça fica no espaço do osso; ao editar, recalculamos o encaixe
      // sem recriar o renderer ou fazer um novo download do GLB.
      if(animated)attachAtBind(part,bone,rootBindWorld,{},seatedOffset);
      else bone.add(part);
      const boneBind=bindMatrices.get(bone);
      const rootPart=new THREE.Matrix4(),seatPart=new THREE.Matrix4(),toBone=new THREE.Matrix4();
      const tmpPosition=new THREE.Vector3(),tmpScale=new THREE.Vector3();
      const tmpRotation=new THREE.Quaternion(),centerOffset=new THREE.Vector3();
      const buildMatrix=(params,matrix)=>{
        const region=file==="regatapunk"||file==="vestido_novo"?"torso":"head";
        const tune=experimental?danceTestFit[region]:null;
        const fittedWidth=params.width*fitScale;
        const fittedOffset=params.offset.map(value=>value*fitScale);
        const sc=fittedWidth/Math.max(measure.size.x,1e-6)*(tune?.scale??1);
        const target=restInRoot(bone).add(new THREE.Vector3(...fittedOffset));
        if(tune)target.add(new THREE.Vector3(...tune.offset.map(value=>value*fitScale)));
        tmpRotation.setFromAxisAngle(new THREE.Vector3(1,0,0),
          THREE.MathUtils.degToRad(file==="vestido_novo"?(params.pitch||0):0));
        centerOffset.copy(measure.center).multiplyScalar(sc);
        if(file==="regatapunk")centerOffset.y*=.74;
        centerOffset.applyQuaternion(tmpRotation);
        tmpPosition.copy(target).sub(centerOffset);
        tmpScale.setScalar(sc);
        // Regata Meshy veio comprida como vestido; reduzir apenas a altura.
        // É uma peça rígida (GLB sem skin), mantendo os acessórios antigos intactos.
        if(file==="regatapunk")tmpScale.y*=.74;
        matrix.compose(tmpPosition,tmpRotation,tmpScale);
      };
      const update=()=>{
        if(!state.userData.active||!part.parent)return;
        buildMatrix(preset||fittedItem(file,privateFit),rootPart);
        if(animated){
          const follower=followers.find(item=>item.part===part);
          if(!follower||!boneBind)return;
          toBone.copy(boneBind).invert().multiply(rootBindWorld).multiply(rootPart);
          follower.bindLocal.copy(toBone);
          // O vestido sentado usa um preset privado INDEPENDENTE.
          // As outras peças continuam usando o ajuste original sentado.
          buildMatrix(preset||fittedItem(file,privateFit,file==="vestido_novo"),seatPart);
          toBone.copy(boneBind).invert().multiply(rootBindWorld).multiply(seatPart);
          toBone.decompose(tmpPosition,tmpRotation,tmpScale);
          tmpPosition.x+=seatedOffset.x||0;
          tmpPosition.y+=seatedOffset.y||0;
          tmpPosition.z+=seatedOffset.z||0;
          follower.seatedLocal.compose(tmpPosition,tmpRotation,tmpScale);
          updateAccessories(isSeated);
        }else{
          root.updateMatrixWorld(true);
          bone.updateWorldMatrix(true,false);
          toBone.copy(bone.matrixWorld).invert()
            .multiply(root.matrixWorld).multiply(rootPart);
          toBone.decompose(part.position,part.quaternion,part.scale);
          part.updateMatrix();
        }
        render();
      };
      adjustableParts.push({file,update});
      update();
    });
  };
  if(selection.hat==="caveira")installNewWearable("caveira",newHeadBone,{
    seatedOffset:{y:-.00015}
  });
  if(selection.glasses==="sem_aro"||selection.glasses==="botao"||
     (!animated&&(selection.glasses==="escuros"||selection.glasses==="redondos")))
    installNewWearable(selection.glasses,newHeadBone,{
      seatedOffset:{z:.00015}
    });
  if(selection.headphones==="preto")installNewWearable("fone_novo",newHeadBone,{
    seatedOffset:{y:-.00010}
  });
  if(selection.outfit==="punk")installNewWearable("regatapunk",newTorsoBone,{
    seatedOffset:{y:.00010}
  });
  if(selection.outfit==="rosa_novo")installNewWearable("vestido_novo",newTorsoBone,{
    seatedOffset:{y:.00010}
  });
  if(["palha","branco","apocaliptico"].includes(selection.hat)){
    const type=selection.hat;
    getAsset(type).then(asset=>{
      if(!asset||!state.userData.active)return;
      const hat=asset.clone(true);
      const measure=getBounds(hat);
      // Meshy: aba = Y mínimo + cerca de 12% da altura. Apoio = topo - 17 cm visuais.
      const width=(type==="palha"?.94:type==="apocaliptico"?.79:.92)*fitScale;
      const scale=width/Math.max(measure.size.x,measure.size.z,1e-6);
      const brim=measure.box.min.y+measure.size.y*.12;
      const tune=experimental?danceTestFit.head:null;
      const finalScale=scale*(tune?.scale??1);
      hat.scale.setScalar(finalScale);
      hat.position.set(worldHead.x-measure.center.x*finalScale+(tune?.offset[0]||0)*fitScale,
        worldTop.y-.17*fitScale-brim*finalScale+(tune?.offset[1]||0)*fitScale,
        worldHead.z-measure.center.z*finalScale+.05*fitScale+(tune?.offset[2]||0)*fitScale);
      hat.name="jfWardrobeHat_"+type;
      state.add(hat);
      notifyDevkitTarget(hat);
      // Reassocia ao osso da cabeça preservando a posição no espaço do macaco.
      if(animated){
        attachAtBind(hat,headBone,rootBindWorld,{y:-.00020,z:-.00004},{y:-.0010,z:.0001});
      }else{
        state.updateWorldMatrix(true,true);
        if(headBone)headBone.attach(hat);
      }
      updateAccessories();
      render();
    });
  }else if(selection.hat==="bone"){
    // O boné azul era reaproveitado com o posicionamento antigo do GLB,
    // por isso ficava suspenso depois da escala física de 1,50 m no Avatar Lab.
    // Encaixar pelo HeadTop: calcular largura em metros e assentar a aba
    // alguns centímetros sobre o crânio, mantendo o mesmo rig nas animações.
    attachFitted("bone",(part,measure)=>{
      monkey.updateWorldMatrix(true,true);
      const monkeyWorldScale=monkey.getWorldScale(new THREE.Vector3());
      const topWorld=topBone?topBone.getWorldPosition(new THREE.Vector3()):
        worldHead.clone().add(new THREE.Vector3(0,.15,0));
      const topLocal=monkey.worldToLocal(topWorld);
      const capWidth=Math.max(measure.size.x,measure.size.z,1e-6);
      const desiredWorldWidth=.45;
      // attachFitted multiplica depois por fitScale; compensar aqui para
      // que o boné tenha a mesma largura física no Avatar Lab e nas demais telas.
      const localScale=desiredWorldWidth/
        (capWidth*Math.max(monkeyWorldScale.x,.0001)*fitScale);
      part.scale.setScalar(localScale);
      const finalScale=localScale*fitScale;
      const drop=.075/Math.max(monkeyWorldScale.y,.0001);
      part.position.set(
        topLocal.x-measure.center.x*finalScale,
        topLocal.y-drop-measure.box.min.y*finalScale,
        topLocal.z-measure.center.z*finalScale+.01/Math.max(monkeyWorldScale.z,.0001)
      );
    },true,headBone,null,{y:-.0004});
  }else if(selection.hat==="gorro"){
    attachFitted("gorro",part=>{
      part.position.x=rawX;
    },true,headBone,null,{y:-.0004});
  }
  if(animated&&(selection.glasses==="escuros"||selection.glasses==="redondos")){
    attachFitted(selection.glasses,(part,measure)=>{
      const s=.88;
      part.scale.setScalar(s);
      // Escalonar em torno do centro da peça, e não em torno do chão do cenário.
      part.position.set(rawX+(1-s)*measure.center.x,
        (1-s)*measure.center.y-.00018,
        (1-s)*measure.center.z+.00012);
    // O Head usa a escala NAtiva (~milésimos de unidade no GLB).\n    // Ajuste pequeno na coordenada do osso, preservado por toda animação.
    },true,headBone,animated?{x:.00010,y:-.00008,z:.00072}:null,{x:.00026,y:-.00022,z:.00185});
  }
  if(selection.headphones!=="nenhum"&&selection.headphones!=="preto"){
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
    },!wearingHat,wearingHat?neckBone:headBone,null,{y:-.0004,z:.00015});
  }
  if(selection.outfit==="rosa"){
    attachFitted("vestido",(part)=>{
      // Vestido modelado em coordenadas do corpo do macaco, sem escala arbitrária.
      part.position.x=rawX;
    },false,hipBone||torsoBone,null,{y:.0002});
  }
  return Object.assign(()=>{
    state.userData.active=false;
    if(privateFit)window.removeEventListener("jf-private-fit-updated",onFitUpdated);
    // As geometrias GLB são compartilhadas com os outros usuários;
    // descarte apenas os materiais clonados dos fones.
    monkey.traverse(obj=>{
      if(obj.isMesh&&obj.userData.jfWardrobeOwnMaterial)obj.material?.dispose();
    });
  },{updateAccessories,setSeatGlassesCalibration,getGlassesDiagnostics});
}
// Encaixe INDEPENDENTE para o mascote sentado do miniplayer.
// Cada GLB é clonado de forma exclusiva; offsets nunca alteram dress() usado
// pelos participantes, guarda-roupa e pista. Calibrado em unidades do macaco.glb.
async function dressMiniPlayer(selection,render,monkey,root,isActive){
  const copies=[],ownMaterials=[];
  const head=getBone(monkey,"Head");
  const top=getBone(monkey,"HeadTop_End");
  const neck=getBone(monkey,"Neck");
  monkey.updateMatrixWorld(true);
  const headPos=head?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3();
  const topPos=top?.getWorldPosition(new THREE.Vector3())||headPos.clone();
  const neckPos=neck?.getWorldPosition(new THREE.Vector3())||headPos.clone();
  const scale=monkey.scale.x||1;
  const headHeight=topPos.distanceTo(headPos)/scale||.0064;
  const rawX=(headPos.x-monkey.position.x)/scale;
  const neckY=(neckPos.y-monkey.position.y)/scale;
  const neckZ=(neckPos.z-monkey.position.z)/scale;
  const add=async(file,configure,anchor,parent=monkey)=>{
    const asset=await getAsset(file);
    if(!asset||!isActive())return;
    const part=asset.clone(true);part.name="jfMini_"+file;
    const box=getBounds(part);
    parent.add(part);
    configure(part,box);
    root.updateMatrixWorld(true);
    if(anchor)anchor.attach(part);
    copies.push(part);
    render();
  };
  const jobs=[];
  if(["palha","branco","apocaliptico"].includes(selection.hat)){
    const type=selection.hat;
    jobs.push((async()=>{
      const asset=await getAsset(type);
      if(!asset||!isActive()||!head||!top)return;
      // Ancoragem DIRETA no osso Head, usando o HeadTop como referência
      // anatômica. Não converter a posição entre monkey e normalized.
      monkey.updateMatrixWorld(true);
      const hat=asset.clone(true);
      hat.name="jfMiniHat_"+type;
      const measure=getBounds(hat);
      const worldScale=head.getWorldScale(new THREE.Vector3()).x||1;
      const desiredWidth=type==="palha"?.94:type==="apocaliptico"?.79:.92;
      const nativeScale=desiredWidth/
        (Math.max(measure.size.x,measure.size.z,1e-6)*worldScale);
      const topLocal=head.worldToLocal(top.getWorldPosition(new THREE.Vector3()));
      const brim=measure.box.min.y+measure.size.y*.12;
      head.add(hat);
      hat.scale.setScalar(nativeScale);
      hat.position.set(
        topLocal.x-measure.center.x*nativeScale,
        topLocal.y*.80-brim*nativeScale,
        topLocal.z-measure.center.z*nativeScale+.05/worldScale
      );
      copies.push(hat);
      render();
    })());
  }else if(selection.hat!=="nenhum"){
    jobs.push(add(selection.hat,part=>{part.position.x=rawX;},head));
  }
  if(selection.glasses!=="nenhum"){
    jobs.push(add(selection.glasses,(part,measure)=>{
      const s=.88;
      part.scale.setScalar(s);
      // Os óculos do GLB em pé ficam perto da testa ao sentar.
      // Descer 22% da distância Head -> HeadTop e aproximar do rosto.
      part.position.set(
        rawX+(1-s)*measure.center.x,
        (1-s)*measure.center.y-.00018,
        (1-s)*measure.center.z+.00012
      );
    },head));
  }
  if(selection.headphones!=="nenhum"){
    const wearingHat=selection.hat!=="nenhum";
    jobs.push(add("fone",(part,measure)=>{
      part.traverse(node=>{
        if(!node.isMesh||node.name.toLowerCase().includes("interior"))return;
        const mats=Array.isArray(node.material)?node.material:[node.material];
        const replacement=mats.map(mat=>{
          const copy=mat.clone();
          copy.color?.set(selection.headphones==="rosa"?"#e06ba6":"#368dd0");
          ownMaterials.push(copy);return copy;
        });
        node.material=Array.isArray(node.material)?replacement:replacement[0];
      });
      const s=wearingHat?.78:.95;
      part.scale.setScalar(s);
      if(wearingHat){
        part.position.set(rawX-measure.center.x*s,
          neckY-measure.center.y*s-.0005,
          neckZ-measure.center.z*s+.0003);
      }else{
        part.position.set(rawX+(1-s)*measure.center.x,
          (1-s)*measure.center.y-.00005,
          (1-s)*measure.center.z);
      }
    },wearingHat?neck:head));
  }
  if(selection.outfit==="rosa"){
    jobs.push(add("vestido",part=>{part.position.x=rawX;},null));
  }
  await Promise.all(jobs);
  return ()=>{
    copies.forEach(part=>part.removeFromParent());
    ownMaterials.forEach(mat=>mat.dispose());
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
// Usar a mesma animacao sentadobalanca.fbx da Junto Club quando instalada.
// Se nao houver arquivo local, manter a pose antiga e depois female-sitting.
let wardrobeSittingPosePromise=null;
function loadWardrobeSittingPose(){
  if(!wardrobeSittingPosePromise){
    const converter=new FBXLoader();
    wardrobeSittingPosePromise=converter.loadAsync("/poses/sentadotryfix.fbx")
      .then(scene=>({gltf:{scene,animations:scene.animations},matchingClub:true}))
      .catch(()=>converter.loadAsync("/poses/sentadobalanca.fbx")
        .then(scene=>({gltf:{scene,animations:scene.animations},matchingClub:false}))
        .catch(()=>new GLTFLoader().loadAsync("/poses/sitting-idle.glb")
          .then(gltf=>({gltf,matchingClub:false}))
          .catch(()=>loadPlayerSittingPose().then(gltf=>({gltf,matchingClub:false})))));
  }
  return wardrobeSittingPosePromise;
}
function applyPlayerSittingPose(monkey,source){
  // FBX com duas tomadas: preferir a que tem variacao real,
  // nao a tomada estatica exportada junto com o Mixamo.
  const movementScore=take=>{
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
  const clip=[...(source?.animations||[])].sort((a,b)=>movementScore(b)-movementScore(a))[0];
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
    // O FBX sentado inclina/torce muito pescoço e cabeça. Evitar esses
    // dois canais preserva o rosto (e os acessórios) do macaco original.
    if(key==="head"||key==="neck")continue;
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
function createAvatarLineup(scene,normalized,target){
  const theme=document.documentElement.dataset.jfTheme||"y2k";
  const palette=getComputedStyle(document.documentElement);
  const accent=palette.getPropertyValue("--jf-secondary").trim()||"#70d7ef";
  const glow=palette.getPropertyValue("--jf-glow").trim()||"#315f83";
  const wallColor=theme==="aero"?"#12374c":theme==="classic"?"#22364c":theme==="tsimiomi"?"#321b1b":theme==="kodoku"?"#242629":"#1a2636";
  scene.background=new THREE.Color(wallColor);
  const group=new THREE.Group();scene.add(group);
  const wallCanvas=document.createElement("canvas");wallCanvas.width=1200;wallCanvas.height=900;
  const ctx=wallCanvas.getContext("2d");
  const wallGradient=ctx.createLinearGradient(0,0,0,900);
  wallGradient.addColorStop(0,wallColor);wallGradient.addColorStop(.66,"#243447");wallGradient.addColorStop(1,"#101b29");
  ctx.fillStyle=wallGradient;ctx.fillRect(0,0,1200,900);
  const bloom=ctx.createRadialGradient(610,360,30,610,360,650);
  bloom.addColorStop(0,"rgba(255,255,255,.10)");bloom.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=bloom;ctx.fillRect(0,0,1200,900);
  const chartX=185,top=120,bottom=805;
  ctx.strokeStyle=accent;ctx.globalAlpha=.83;ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(chartX,top);ctx.lineTo(chartX,bottom);ctx.stroke();
  ctx.globalAlpha=.6;ctx.font="bold 22px Arial";ctx.fillStyle="#effaff";ctx.textAlign="right";
  for(let cm=0;cm<=200;cm+=5){
    // Escala real: 1 m no cenário equivale a 100 cm na régua.
    // A marca 0 fica no piso da plataforma; a cabeça de 1,50 m
    // coincide com a marca 150.
    const y=760-cm*2.22,major=cm%10===0;
    ctx.globalAlpha=major?.9:.42;ctx.lineWidth=major?3:1.5;
    ctx.beginPath();ctx.moveTo(chartX-(major?52:24),y);ctx.lineTo(chartX,y);ctx.stroke();
    if(major)ctx.fillText(String(cm),chartX-62,y+7);
  }
  ctx.globalAlpha=.9;ctx.textAlign="left";ctx.font="bold 18px Arial";ctx.fillStyle=accent;
  ctx.fillText("JUNTO / PERSONNEL",250,72);
  ctx.globalAlpha=.55;ctx.font="13px Arial";ctx.fillStyle="#eef8ff";
  ctx.fillText("IDENTIFICATION STUDIO  ·  01",250,101);
  ctx.globalAlpha=.24;ctx.strokeStyle="#ffffff";ctx.lineWidth=1;
  for(let x=250;x<1140;x+=72){ctx.beginPath();ctx.moveTo(x,140);ctx.lineTo(x,820);ctx.stroke();}
  ctx.globalAlpha=1;
  const wallTexture=new THREE.CanvasTexture(wallCanvas);wallTexture.colorSpace=THREE.SRGBColorSpace;
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.05),new THREE.MeshBasicMaterial({map:wallTexture}));
  wall.position.set(0,.52,-1.22);group.add(wall);
  const trimMat=new THREE.MeshStandardMaterial({color:new THREE.Color(accent),metalness:.72,roughness:.3,emissive:new THREE.Color(glow),emissiveIntensity:.14});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x293b4d,metalness:.82,roughness:.28});
  for(const x of [-2.32,2.32]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(.075,3.75,.11),darkMetal);
    post.position.set(x,.48,-1.13);group.add(post);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(.012,3.7,.012),trimMat);
    edge.position.set(x+(x<0?.045:-.045),.48,-1.065);group.add(edge);
  }
  const floorMat=new THREE.MeshStandardMaterial({color:theme==="aero"?0x426a7b:0x24313e,metalness:.28,roughness:.56});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(16,16),floorMat);
  floor.rotation.x=-Math.PI/2;floor.position.set(0,-.965,0);group.add(floor);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.88,.94,.075,64),darkMetal);
  base.position.set(0,-.917,0);group.add(base);
  const topRing=new THREE.Mesh(new THREE.TorusGeometry(.78,.012,8,80),trimMat);
  topRing.rotation.x=Math.PI/2;topRing.position.set(0,-.875,0);group.add(topRing);
  const softLight=new THREE.SpotLight(0xffffff,4.2,8,Math.PI/5,.7,1.2);
  softLight.position.set(0,2.8,2.3);softLight.target.position.set(0,-.05,0);
  scene.add(softLight,softLight.target);
  const rim=new THREE.PointLight(new THREE.Color(accent),1.35,5);
  rim.position.set(-1.8,.8,-.25);scene.add(rim);
  const fill=new THREE.PointLight(0xe7f5ff,.9,4);fill.position.set(1.8,.5,1.8);scene.add(fill);
  const plateCanvas=document.createElement("canvas");plateCanvas.width=768;plateCanvas.height=288;
  const pctx=plateCanvas.getContext("2d");
  const plateGradient=pctx.createLinearGradient(0,0,0,288);
  plateGradient.addColorStop(0,"#34495b");plateGradient.addColorStop(1,"#101c2b");
  pctx.fillStyle=plateGradient;pctx.fillRect(0,0,768,288);
  pctx.strokeStyle=accent;pctx.lineWidth=9;pctx.strokeRect(8,8,752,272);
  pctx.strokeStyle="rgba(255,255,255,.22)";pctx.lineWidth=2;pctx.strokeRect(22,22,724,244);
  pctx.fillStyle=accent;pctx.textAlign="center";pctx.font="bold 23px Arial";
  pctx.fillText("JUNTO.FM  /  REGISTRO DE PERSONAGEM",384,63);
  const name=String(target.dataset.avatarPlateName||"MACACO").toLocaleUpperCase().slice(0,24);
  const handle=String(target.dataset.avatarPlateHandle||"VISITANTE").toLocaleUpperCase().slice(0,30);
  pctx.fillStyle="#ffffff";pctx.font="bold 55px Arial";pctx.fillText(name,384,151);
  pctx.fillStyle="#c5d4df";pctx.font="bold 25px Arial";pctx.fillText(handle,384,207);
  const plateTexture=new THREE.CanvasTexture(plateCanvas);plateTexture.colorSpace=THREE.SRGBColorSpace;
  const plaqueBaseWidth=.62;
  const plaque=new THREE.Group();plaque.name="jfAvatarIdentificationPlate";plaque.position.set(0,-.30,.34);plaque.rotation.x=-.035;normalized.add(plaque);
  // Plaquinha de identificação menor, leve e sem hastes.
  const board=new THREE.Mesh(new THREE.BoxGeometry(.62,.24,.035),darkMetal);plaque.add(board);
  const faceMat=new THREE.MeshBasicMaterial({map:plateTexture});
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.60,.22),faceMat);
  face.position.z=.019;plaque.add(face);
  // A placa acompanha as mãos do rig: as pontas ficam alinhadas aos pulsos,
  // sem tubos nem hastes artificiais.
  const leftHand=getAnimatedBone(normalized,"LeftHand");
  const rightHand=getAnimatedBone(normalized,"RightHand");
  const leftWorld=new THREE.Vector3(),rightWorld=new THREE.Vector3();
  const leftLocal=new THREE.Vector3(),rightLocal=new THREE.Vector3(),midLocal=new THREE.Vector3();
  const update=()=>{
    if(!leftHand||!rightHand)return;
    normalized.updateWorldMatrix(true,true);
    leftHand.getWorldPosition(leftWorld);rightHand.getWorldPosition(rightWorld);
    normalized.worldToLocal(leftLocal.copy(leftWorld));
    normalized.worldToLocal(rightLocal.copy(rightWorld));
    midLocal.copy(leftLocal).add(rightLocal).multiplyScalar(.5);
    plaque.position.copy(midLocal);
    // Centro da placa exatamente entre as mãos. A face fica ligeiramente
    // atrás dos pulsos (câmera em +Z), para as mãos aparecerem sobre as
    // bordas e parecerem apoiar/segurar a identificação, não uma placa flutuante.
    plaque.position.y+=.01;
    // A placa fica ligeiramente atrás dos pulsos, não à frente deles:
    // assim as mãos podem aparecer por cima das bordas e segurá-la.
    plaque.position.z-=.035;
    // O rig pode inverter a ordem espacial dos pulsos; manter o texto legível.
    let handAngle=Math.atan2(rightLocal.y-leftLocal.y,rightLocal.x-leftLocal.x);
    if(Math.abs(handAngle)>Math.PI/2)handAngle+=handAngle>0?-Math.PI:Math.PI;
    plaque.rotation.set(-.035,0,handAngle);
    const span=leftLocal.distanceTo(rightLocal);
    // A placa é menor que a original, mas chega às mãos para parecer segurada.
    const width=THREE.MathUtils.clamp(span*1.12,.50,.86);
    plaque.scale.set(width/plaqueBaseWidth,.92,1);
  };
  normalized.userData.jfAvatarLabParts={plate:plaque,leftHand,rightHand};
  update();
  return {update,dispose:()=>{
    group.traverse(object=>{if(object.isMesh)object.geometry.dispose();});
    plaque.traverse(object=>{if(object.isMesh)object.geometry.dispose();});
    normalized.remove(plaque);
    wallTexture.dispose();plateTexture.dispose();faceMat.dispose();
    wall.material.dispose();floorMat.dispose();trimMat.dispose();darkMetal.dispose();
    softLight.target.removeFromParent();scene.remove(softLight,rim,fill);group.removeFromParent();
  }};
}
function createBoothIdleAnimation(monkey){
  let disposed=false,ready=false,duration=0;
  const tracks=[];
  const fallbackParts=[
    ["Head",.025,.035,.012],["Neck",.012,.012,.008],
    ["Spine2",.008,.006,.005],["Spine",.006,.004,.003]
  ];
  const fallbackTargets=fallbackParts.map(([name,rx,ry,rz],index)=>{
    const bone=getAnimatedBone(monkey,name)||getBone(monkey,name);
    return bone?{bone,base:bone.quaternion.clone(),rx,ry,rz,phase:index*.9}:null;
  }).filter(Boolean);
  const fallback=(time)=>{
    for(const item of fallbackTargets){
      const {bone,base,rx,ry,rz,phase}=item,t=time*.001+phase;
      item.sway||(item.sway=new THREE.Quaternion());
      item.euler||(item.euler=new THREE.Euler());
      item.euler.set(Math.sin(t*.83)*rx,Math.sin(t*.57)*ry,Math.cos(t*.71)*rz,"XYZ");
      item.sway.setFromEuler(item.euler);
      bone.quaternion.copy(base).multiply(item.sway).normalize();
    }
  };
  const restPose={
    Spine:[.05175,-.012019,-.039175,.997819],
    Spine1:[.039043,-.007133,.001282,.999211],
    Spine2:[.009496,-.007915,.001775,.999922],
    Neck:[-.046185,.012836,.029471,.998416],
    Head:[.028326,-.012257,-.011577,.999457],
    RightShoulder:[.097319,-.017769,-.063543,.993064],
    RightArm:[.589033,-.031344,.017123,.807319],
    RightForeArm:[0,0,-.113762,.993508],
    RightHand:[-.154885,.029712,-.056991,.98584],
    LeftShoulder:[.029982,.013276,.029013,.999041],
    LeftArm:[.630068,-.04179,.142477,.762213],
    LeftForeArm:[0,0,.164436,.986388],
    LeftHand:[.005244,-.208364,-.044264,.977035]
  };
  const load=async()=>{
    try{
      if(typeof DecompressionStream!=="function"||typeof atob!=="function"||typeof Blob!=="function")
        throw new Error("Este navegador não oferece descompressão de animação.");
      const response=await fetch("/poses/standing-w-briefcase-idle.json.gz.b64?v=briefcase-idle-20261125-1",{cache:"no-cache"});
      if(!response.ok)throw new Error("Animação de espera indisponível ("+response.status+").");
      const encoded=(await response.text()).trim();
      const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const data=JSON.parse(await new Response(stream).text());
      if(!Array.isArray(data.times)||!Array.isArray(data.tracks)||data.times.length<2||!Number.isFinite(data.duration))
        throw new Error("Estrutura da animação inválida.");
      for(const source of data.tracks){
        const bone=getAnimatedBone(monkey,source.bone);
        const rest=restPose[source.bone];
        if(!bone||!Array.isArray(rest)||!Array.isArray(source.q)||source.q.length!==data.times.length*4)continue;
        tracks.push({
          bone,base:bone.quaternion.clone(),
          rest:new THREE.Quaternion(rest[0],rest[1],rest[2],rest[3]).normalize(),
          values:source.q,
          qa:new THREE.Quaternion(),qb:new THREE.Quaternion(),delta:new THREE.Quaternion(),result:new THREE.Quaternion()
        });
      }
      if(tracks.length<10)throw new Error("Rig incompatível: apenas "+tracks.length+" ossos foram encontrados.");
      if(disposed)return;
      duration=data.duration;ready=true;
      console.info("Avatar Lab: animação Mixamo aplicada a",tracks.length,"ossos.");
    }catch(error){
      if(!disposed)console.warn("Avatar Lab: falha ao carregar a pose de maleta; usando idle leve.",error);
    }
  };
  void load();
  return {
    update(time){
      if(disposed)return;
      if(!ready){fallback(time);return;}
      const t=((time*.001)%duration+duration)%duration;
      const n=tracks.length;
      // A timeline tem 141 amostras; localizar o intervalo e interpolar
      // slerp evita saltos entre as chaves da animação Mixamo.
      const sampleCount=141;
      const scaled=t/duration*(sampleCount-1);
      const index=Math.min(sampleCount-2,Math.max(0,Math.floor(scaled)));
      const alpha=THREE.MathUtils.clamp(scaled-index,0,1);
      for(let i=0;i<n;i++){
        const track=tracks[i],offset=index*4,next=offset+4;
        track.qa.set(track.values[offset],track.values[offset+1],track.values[offset+2],track.values[offset+3]);
        track.qb.set(track.values[next],track.values[next+1],track.values[next+2],track.values[next+3]);
        track.delta.copy(track.qa).slerp(track.qb,alpha);
        track.result.copy(track.rest).multiply(track.delta);
        track.bone.quaternion.copy(track.base).multiply(track.result).normalize();
      }
    },
    dispose(){
      disposed=true;
      for(const track of tracks)track.bone.quaternion.copy(track.base);
      for(const item of fallbackTargets)item.bone.quaternion.copy(item.base);
    }
  };
}
function makeScene(target,wardrobe,{preview=false,skin="default",playerSitting=false,previewSeated=false,photoBooth=false}={}){
  if(!base)return null;
  const width=Math.max(1,target.clientWidth||(preview?448:64)),height=Math.max(1,target.clientHeight||(preview?520:68));
  const renderer=new THREE.WebGLRenderer({alpha:!photoBooth,antialias:true,powerPreference:"low-power"});
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
  // No Avatar Lab, a altura é definida em metros (1 unidade Three.js = 1 m).
  // As outras prévias mantêm a escala visual histórica.
  const legacyAvatarScale=1.8/(Math.max(size.x,size.y,size.z)||1);
  const scale=photoBooth?1.50/Math.max(size.y,.0001):legacyAvatarScale;
  // Mantém roupas e acessórios proporcionais à nova escala física.
  const wardrobeScale=photoBooth?scale/legacyAvatarScale:1;
  // Grupo normalizado: todos os acessórios usam o mesmo espaço visual.
  const normalized=new THREE.Group();
  monkey.scale.setScalar(scale);monkey.position.copy(center).multiplyScalar(-scale);
  // Pés apoiados no topo da plataforma do estúdio (y = -0.88).
  if(photoBooth)normalized.position.y=-.875+1.50*.5;
  normalized.userData.jfWardrobeScale=wardrobeScale;
  normalized.add(monkey);
  scene.add(normalized);
  let active=true;
  let disposeOutfit=()=>{};
  const renderOutfit=()=>{if(active)renderer.render(scene,camera);};
  if(playerSitting){
    // Clones e encaixes próprios no miniplayer, antes de aplicar a pose.
    (async()=>{
      try{
        const dispose=await dressMiniPlayer(sanitize(wardrobe),renderOutfit,monkey,normalized,()=>active);
        if(!active){dispose();return;}
        disposeOutfit=dispose;
        const pose=await loadPlayerSittingPose();
        if(!active)return;
        if(pose&&applyPlayerSittingPose(monkey,pose)){
          const box=new THREE.Box3().setFromObject(normalized,true);
          if(!box.isEmpty()){
            normalized.position.sub(box.getCenter(new THREE.Vector3()));
            normalized.position.y-=.12;
          }
        }else console.warn("Miniplayer: pose sentada indisponível.");
        renderOutfit();
      }catch(error){console.warn("Miniplayer: falha ao montar acessórios próprios",error);}
    })();
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
  const camera=new THREE.PerspectiveCamera(photoBooth?36:33,width/height,.01,100);
  camera.position.set(0,photoBooth ? .02 : .04,playerSitting?3.25:photoBooth?6.25:preview?4.25:4.0);camera.lookAt(0,photoBooth ? -.13 : .035,0);
  normalized.rotation.y=preview?previewYaw:-.18;
  const lineup=photoBooth?createAvatarLineup(scene,normalized,target):null;
  const boothIdle=photoBooth?createBoothIdleAnimation(monkey):null;
  // Admin-only Avatar Lab DevKit: exports the live rig, plate, hands,
  // attached clothing/accessories and camera transforms in meter units.
  let devkitApi=null;
  if(photoBooth){
    const devkitOriginals=new Map();
    const devkitNodes=()=>{
      const nodes=[],seen=new Set();
      const add=(node,label,group)=>{
        if(!node||seen.has(node.uuid))return;seen.add(node.uuid);
        nodes.push({id:node.uuid,label:label||node.name||node.type,group,node});
      };
      add(normalized,"Avatar inteiro / escala","Avatar");
      add(monkey,"Macaco / modelo 3D","Avatar");
      // As peças do guarda-roupa não ficam todas dentro de monkey:
      // os GLBs novos são filhos de normalized/jfWardrobeParts (ou do osso),
      // então percorrer somente monkey fazia roupas desaparecerem do seletor.
      normalized.traverse(node=>{
        if(node.isBone)add(node,"Osso · "+(node.name||"Bone"),"Esqueleto");
        const wardrobeName=String(node.name||"");
        if(wardrobeName&&(/^jfWardrobe(?:_|Hat_)/.test(wardrobeName)||/^jfMini(?:_|Hat_)/.test(wardrobeName))){
          const label=wardrobeName.replace(/^jfWardrobe(?:_|Hat_)|^jfMiniHat_|^jfMini_/,"");
          add(node,label||wardrobeName,"Roupas e acessórios");
        }
      });
      const lab=normalized.userData.jfAvatarLabParts||{};
      add(lab.plate,"Placa de identificação","Placa e mãos");
      add(lab.leftHand,"Mão esquerda (IK/rig)","Placa e mãos");
      add(lab.rightHand,"Mão direita (IK/rig)","Placa e mãos");
      return nodes;
    };
    devkitApi={
      getTargets(){return devkitNodes().map(({id,label,group})=>({id,label,group}));},
      getTransform(id){
        const entry=devkitNodes().find(item=>item.id===id);if(!entry)return null;
        const node=entry.node;
        if(!devkitOriginals.has(id))devkitOriginals.set(id,{position:node.position.toArray(),rotation:node.rotation.toArray().slice(0,3),scale:node.scale.toArray()});
        return {position:node.position.toArray(),rotation:node.rotation.toArray().slice(0,3),scale:node.scale.toArray()};
      },
      setTransform(id,transform){
        const entry=devkitNodes().find(item=>item.id===id);if(!entry)return false;
        const node=entry.node;
        const apply=(key,value)=>{if(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite))node[key].set(value[0],value[1],value[2]);};
        apply("position",transform.position);apply("rotation",transform.rotation);apply("scale",transform.scale);
        node.updateMatrix();node.updateMatrixWorld(true);normalized.updateMatrixWorld(true);
        renderOutfit();return true;
      },
      resetTransform(id){
        const original=devkitOriginals.get(id);if(!original)return false;
        return this.setTransform(id,original);
      },
      getSnapshot(){
        normalized.updateMatrixWorld(true);monkey.updateMatrixWorld(true);
        const vec=node=>{
          if(!node)return null;
          const world=node.getWorldPosition(new THREE.Vector3());
          const euler=node.rotation;
          return {
            name:node.name||node.type,
            local_position:node.position.toArray().map(v=>Number(v.toFixed(5))),
            world_position:world.toArray().map(v=>Number(v.toFixed(5))),
            local_rotation_rad:[euler.x,euler.y,euler.z].map(v=>Number(v.toFixed(5))),
            local_scale:node.scale.toArray().map(v=>Number(v.toFixed(5)))
          };
        };
        const bones=[];
        monkey.traverse(node=>{if(node.isBone)bones.push(vec(node));});
        const parts=[];
        monkey.traverse(node=>{
          if(node.name&&(/^jfWardrobe(?:_|Hat_)/.test(node.name)||/^jfMini(?:_|Hat_)/.test(node.name)))parts.push(vec(node));
        });
        const lab=normalized.userData.jfAvatarLabParts||{};
        return {
          tool:"Junto.fm Avatar Lab DevKit",
          version:1,
          captured_at:new Date().toISOString(),
          units:"meters (1 Three.js unit = 1 meter in Avatar Lab)",
          avatar:{height_m:1.5,scale:scale,wardrobe_scale:wardrobeScale,selection:sanitize(wardrobe),
            normalized_position:normalized.position.toArray().map(v=>Number(v.toFixed(5))),
            normalized_rotation_y_rad:Number(normalized.rotation.y.toFixed(5))},
          scene:{camera_position:camera.position.toArray().map(v=>Number(v.toFixed(5))),
            camera_fov_deg:camera.fov,stage_floor_y:-.965,platform_top_y:-.875},
          identification_plate:vec(lab.plate),
          hands:{left:vec(lab.leftHand),right:vec(lab.rightHand),
            distance_m:lab.leftHand&&lab.rightHand?Number(lab.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(lab.rightHand.getWorldPosition(new THREE.Vector3())).toFixed(5)):null},
          accessories_and_clothing:parts,
          bones
        };
      }
    };
    window.jfAvatarLabDevkit=devkitApi;
  }
  renderer.render(scene,camera);
  // A câmera precisa existir antes que dress() possa solicitar um render.
  if(!playerSitting)disposeOutfit=dress(normalized,sanitize(wardrobe),renderOutfit,monkey,{
    animated:Boolean(preview&&previewSeated),
    privateFit:Boolean(preview&&fitAccess),
    previewSeated:Boolean(preview&&previewSeated)
  });
  if(preview&&previewSeated){
    loadWardrobeSittingPose().then(({gltf,matchingClub})=>{
      if(!active)return;
      const applied=gltf&&applyPlayerSittingPose(monkey,gltf);
      if(applied){
        normalized.updateMatrixWorld(true);
        disposeOutfit.updateAccessories?.(true);
        const box=new THREE.Box3().setFromObject(monkey,true);
        const focus=box.getCenter(new THREE.Vector3());
        camera.position.set(focus.x,focus.y+.08,focus.z+3.7);
        camera.lookAt(focus);
        renderOutfit();
      }
      window.dispatchEvent(new CustomEvent("jf-wardrobe-seat-preview",{
        detail:{applied:Boolean(applied),matchingClub:Boolean(matchingClub&&applied)}
      }));
    }).catch(error=>{if(active)console.warn("Prévia sentada indisponível",error);});
  }
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
  let resizeObserver=null,boothFrame=0,lastBoothFrame=0;
  if(preview&&typeof ResizeObserver!=="undefined"){
    resizeObserver=new ResizeObserver(()=>{const w=Math.max(1,target.clientWidth),h=Math.max(1,target.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);});
    resizeObserver.observe(target);
  }
  if(photoBooth){
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animateBooth=now=>{boothFrame=requestAnimationFrame(animateBooth);if(!active||document.hidden||now-lastBoothFrame<40)return;const delta=lastBoothFrame?Math.min((now-lastBoothFrame)/1000,.08):.04;lastBoothFrame=now;if(!reduced){normalized.rotation.y=previewYaw+Math.sin(now*.00042)*.025;normalized.position.y=Math.sin(now*.0007)*.005;}boothIdle?.update(reduced?0:now);lineup?.update();renderer.render(scene,camera);};
    boothFrame=requestAnimationFrame(animateBooth);
  }
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
    if(photoBooth&&window.jfAvatarLabDevkit===devkitApi)delete window.jfAvatarLabDevkit;
    if(boothFrame)cancelAnimationFrame(boothFrame);
    resizeObserver?.disconnect();
    boothIdle?.dispose();
    lineup?.dispose();
    if(preview){
      target.removeEventListener("pointerdown",down);
      target.removeEventListener("pointermove",move);
      target.removeEventListener("pointerup",up);
      target.removeEventListener("pointercancel",up);
    }
    disposeOutfit();
    // THREE.WebGLRenderer.dispose() libera recursos internos mas não fecha
    // imediatamente o contexto WebGL. Trocas repetidas de roupa/prévia
    // ultrapassavam o limite do navegador e apagavam o canvas do DJ.
    renderer.dispose();
    renderer.forceContextLoss();
    target.replaceChildren();
  },renderer};
}
// Miniplayer: a cena principal em index.html renderiza o GLB Meshypint.
// Não sobrepor o macaco do guarda-roupa neste palco; os acessórios do
// guarda-roupa continuam normalmente na prévia e nos participantes.
function readSaved(){
  const current=window.jfDanceBridge?.getProfile?.();
  if(current?.wardrobe)return sanitize(current.wardrobe);
  try{return sanitize(JSON.parse(localStorage.getItem("junto_profile")||"{}").wardrobe);}catch{return defaults();}
}
let selection=readSaved();
let editing={...selection};

// Antecipar o download dos acessórios antes da primeira abertura do guarda-roupa.
// getAsset compartilha a mesma Promise entre pré-carga, prévia e avatares.
// Carregar aos poucos impede que todas as texturas disputem a conexão de uma vez.
const wardrobePrefetchKeys=["bone","gorro","palha","branco","escuros","redondos","fone","vestido"];
function prefetchWardrobeAssets(){
  const preferred=[
    selection.hat,
    selection.glasses,
    selection.headphones==="preto"?"fone_novo":selection.headphones!=="nenhum"?"fone":null,
    selection.outfit==="punk"?"regatapunk":selection.outfit==="rosa_novo"?"vestido_novo":selection.outfit==="rosa"?"vestido":null
  ].filter(name=>ASSETS[name]);
  // Evita pré-baixar dezenas de MiB de roupas que ninguém está usando.
  const queue=[...new Set(preferred)];
  let next=0;
  async function worker(){
    while(next<queue.length){
      const file=queue[next++];
      await getAsset(file);
    }
  }
  // Duas cargas paralelas, compartilhadas com todas as instâncias da cena.
  void Promise.all([worker(),worker()]);
}
// Evita baixar acessórios 3D quando o usuário só quer ouvir música.
// A pré-carga acontece quando Trajes for solicitado pela primeira vez.
let wardrobePrefetchStarted=false;
function beginWardrobePrefetch(){
  if(wardrobePrefetchStarted)return;
  wardrobePrefetchStarted=true;
  prefetchWardrobeAssets();
}
const wardrobeOpenButton=$("jfOpenWardrobe");
if(wardrobeOpenButton){
  wardrobeOpenButton.addEventListener("pointerenter",beginWardrobePrefetch,{once:true});
  wardrobeOpenButton.addEventListener("focus",beginWardrobePrefetch,{once:true});
  wardrobeOpenButton.addEventListener("click",beginWardrobePrefetch,{once:true});
}
const selectors=Object.fromEntries(Object.keys(OPTIONS).map(k=>[k,$("jfWardrobe"+k[0].toUpperCase()+k.slice(1))]));
const preview=$("jfWardrobePreview");
let fitPose="standing";
function showPreview(){
  previewRenderer?.dispose();
  if(!base){
    if(preview)preview.textContent="Carregando macaco 3D…";
    return;
  }
  previewRenderer=makeScene(preview,editing,{preview:true,photoBooth:preview.dataset.avatarStudio==="true",previewSeated:fitAccess&&fitPose==="seated"&&editing.outfit==="rosa_novo"});
}

const fitPanel=$("jfWardrobeFitEditor"),fitItem=$("jfFitItem"),fitStatus=$("jfFitStatus");
const fitPosePicker=$("jfFitPosePicker"),fitTiltWrap=$("jfFitTiltWrap");
const fitTilt=$("jfFitTilt"),fitTiltValue=$("jfFitTiltValue");
const fitStandingButton=$("jfFitStanding"),fitSittingButton=$("jfFitSitting");
const sittingDressSelected=()=>fitItem?.value==="vestido_novo";
const isEditingSittingDress=()=>fitPose==="seated"&&sittingDressSelected();
function setFitPose(next){
  const pose=next==="seated"&&sittingDressSelected()?"seated":"standing";
  const changed=fitPose!==pose;
  fitPose=pose;
  if(fitStandingButton)fitStandingButton.setAttribute("aria-pressed",String(pose==="standing"));
  if(fitSittingButton)fitSittingButton.setAttribute("aria-pressed",String(pose==="seated"));
  if(fitTiltWrap)fitTiltWrap.hidden=pose!=="seated";
  if(changed&&fitAccess)showPreview();
  showFitValues();
  if(changed&&pose==="seated")setFitStatus("Carregando a pose sentada na prévia...");
}
fitStandingButton?.addEventListener("click",()=>setFitPose("standing"));
fitSittingButton?.addEventListener("click",()=>setFitPose("seated"));
window.addEventListener("jf-wardrobe-seat-preview",event=>{
  if(fitPose!=="seated"||!fitAccess)return;
  const {applied,matchingClub}=event.detail||{};
  if(!applied)setFitStatus("Não foi possível carregar a pose sentada nesta versão.");
  else if(!matchingClub)setFitStatus("Prévia sentada alternativa: instale sentadotryfix.fbx em public/poses para testar a nova pose.");
  else setFitStatus("Prévia sentadotryfix (quadro de referência). O balanço completo aparece na Junto Club.");
});
const fitInputNames=["Width","X","Y","Z"];
const fitInputs=Object.fromEntries(fitInputNames.map(name=>[name,$("jfFit"+name)]));
const fitOptions={
  caveira:["hat","caveira"],
  sem_aro:["glasses","sem_aro"],
  botao:["glasses","botao"],
  escuros:["glasses","escuros"],
  redondos:["glasses","redondos"],
  fone_novo:["headphones","preto"],
  vestido_novo:["outfit","rosa_novo"],
  regatapunk:["outfit","punk"]
};
function setFitStatus(message){if(fitStatus)fitStatus.textContent=message;}
function showFitValues(){
  if(!fitItem||!fitAccess)return;
  const file=fitItem.value;
  const params=fittedItem(file,true,isEditingSittingDress());
  if(!params)return;
  const values={Width:params.width,X:params.offset[0],Y:params.offset[1],Z:params.offset[2]};
  if(fitTilt)fitTilt.value=String(params.pitch||0);
  if(fitTiltValue)fitTiltValue.textContent=String(params.pitch||0)+"°";
  for(const name of fitInputNames){
    if(fitInputs[name])fitInputs[name].value=String(values[name]);
    const output=$("jfFit"+name+"Value");
    if(output)output.textContent=Number(values[name]).toFixed(2);
  }
}
function focusFitItem(file,{equip=false}={}){
  if(!fitAccess||!fitItem||!fitOptions[file])return;
  fitItem.value=file;
  if(fitPosePicker)fitPosePicker.hidden=file!=="vestido_novo";
  if(file!=="vestido_novo"&&fitPose==="seated")setFitPose("standing");
  else showFitValues();
  if(equip){
    const [slot,value]=fitOptions[file];
    if(editing[slot]!==value){
      editing[slot]=value;
      if(selectors[slot])selectors[slot].value=value;
      showPreview();
    }
  }
}
function preferredFitItem(){
  // Priorizar o último item selecionado no guarda-roupa.
  if(editing.headphones==="preto")return "fone_novo";
  if(editing.outfit==="punk")return "regatapunk";
  if(editing.outfit==="rosa_novo")return "vestido_novo";
  if(["sem_aro","escuros","redondos","botao"].includes(editing.glasses))return editing.glasses;
  if(editing.hat==="caveira")return "caveira";
  return "fone_novo";
}
function persistPrivateFit(file,data){
  if(!fitAccess||!FIT_DEFAULTS[file])return;
  try{
    if(file==="vestido_novo"&&isEditingSittingDress()){
      privateSeatFits.vestido_novo=cleanSeatedFit(file,data);
      localStorage.setItem(FIT_SEATED_STORAGE,JSON.stringify(privateSeatFits));
    }else{
      privateFits[file]=cleanFit(file,data);
      localStorage.setItem(FIT_STORAGE,JSON.stringify(privateFits));
    }
  }catch(error){setFitStatus("Não consegui salvar os ajustes neste navegador.");}
  window.dispatchEvent(new CustomEvent("jf-private-fit-updated",{detail:{file}}));
}
function editSelectedFit(){
  if(!fitAccess||!fitItem)return;
  const file=fitItem.value;
  const data={width:Number(fitInputs.Width?.value),
    offset:["X","Y","Z"].map(axis=>Number(fitInputs[axis]?.value)),
    pitch:isEditingSittingDress()?Number(fitTilt?.value):0};
  persistPrivateFit(file,data);
  showFitValues();
  setFitStatus("Ajuste aplicado ao vivo e salvo neste navegador. Os outros jogadores não recebem essas mudanças.");
}
for(const name of fitInputNames)
  fitInputs[name]?.addEventListener("input",editSelectedFit);
fitTilt?.addEventListener("input",editSelectedFit);
fitItem?.addEventListener("change",()=>focusFitItem(fitItem.value,{equip:true}));
$("jfFitReset")?.addEventListener("click",()=>{
  if(!fitAccess||!fitItem)return;
  if(isEditingSittingDress())delete privateSeatFits.vestido_novo;
  else delete privateFits[fitItem.value];
  try{
    if(isEditingSittingDress())localStorage.setItem(FIT_SEATED_STORAGE,JSON.stringify(privateSeatFits));
    else localStorage.setItem(FIT_STORAGE,JSON.stringify(privateFits));
  }
  catch(error){setFitStatus("Não consegui salvar neste navegador.");}
  window.dispatchEvent(new CustomEvent("jf-private-fit-updated",{detail:{file:fitItem.value}}));
  showFitValues();
  setFitStatus("Encaixe padrão restaurado para esta peça.");
});
$("jfFitCopy")?.addEventListener("click",async()=>{
  if(!fitAccess||!fitItem)return;
  const file=fitItem.value,fit=fittedItem(file,true,isEditingSittingDress());
  const value=file+(isEditingSittingDress()?" sentado":" em pé")+": width:"+fit.width.toFixed(2)+", offset:["+
    fit.offset.map(n=>n.toFixed(2)).join(",")+"]"+
    (isEditingSittingDress()?", inclinação:"+Number(fit.pitch||0).toFixed(0)+"°":"");
  try{await navigator.clipboard.writeText(value);setFitStatus("Valores copiados!");}
  catch(error){setFitStatus("Cópia não autorizada pelo navegador: "+value);}
});
function updateEditorAccess(allowed){
  const wasAllowed=fitAccess;
  fitAccess=Boolean(allowed);
  if(fitPanel)fitPanel.hidden=!fitAccess;
  if(fitAccess){
    if(!wasAllowed)loadPrivateFits();
    focusFitItem(preferredFitItem());
    if(!wasAllowed&&!modal?.hidden)showPreview();
  }else if(wasAllowed&&!modal?.hidden)showPreview();
}
updateEditorAccess(fitAccess);
// No domínio público, a ferramenta exige a sessão OAuth administrativa
// validada em /api/admin/status. Localhost é permitido só para desenvolvimento.
fetch("/api/admin/status",{credentials:"same-origin",cache:"no-store"})
  .then(response=>response.ok?response.json():{admin:false})
  .then(data=>updateEditorAccess(localDevelopment||data.admin===true))
  .catch(()=>updateEditorAccess(localDevelopment));

for(const [key,element] of Object.entries(selectors)){
  if(!element)continue;
  element.value=editing[key];
  element.addEventListener("change",()=>{
    editing[key]=element.value;showPreview();
    if(fitAccess){
      for(const [file,[slot,value]] of Object.entries(fitOptions))
        if(slot===key&&value===editing[key]){focusFitItem(file);break;}
    }
  });
}
const modal=$("jfWardrobeModal");
$("jfOpenWardrobe")?.addEventListener("click",()=>{
  selection=readSaved();
  editing={...selection};
  for(const [k,e] of Object.entries(selectors))if(e)e.value=editing[k];
  modal.hidden=false;document.body.style.overflow="hidden";
  void ensureBaseModel();
  showPreview();
  if(fitAccess)focusFitItem(preferredFitItem());
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
window.addEventListener("jf-local-profile-updated",()=>{
  selection=readSaved();
  if(!modal||modal.hidden)editing={...selection};
  refreshPeople();
});
refreshPeople();
// Após entrar numa sala, liberar o avatar 3D dos participantes sem disputar
// imediatamente o download do mascote principal do player.
function scheduleRoomAvatarLoad(){
  setTimeout(()=>{
    if(document.body.classList.contains("jf-in-room"))void ensureBaseModel();
  },1800);
}
window.jfDanceBridge?.socket?.on("joined-room",scheduleRoomAvatarLoad);
if(document.body.classList.contains("jf-in-room"))scheduleRoomAvatarLoad();

/* API reaproveitável da pista isométrica: usa a mesma rigagem e os mesmos GLBs.
   A pista é pequena e evita criar WebGLRenderers por participante. */
export async function createDanceAvatar(outfit={},skin="default",requestRender=()=>{},options={}){
  if(!base&&!(options.experimental&&testDanceModel?.scene))await ensureBaseModel();
  if(!base&&!(options.experimental&&testDanceModel?.scene))throw Error("Modelo macaco.glb indisponível.");
  const root=new THREE.Group();
  const experimentalUsed=Boolean(options.experimental&&testDanceModel?.scene);
  const monkey=cloneSkeleton(experimentalUsed?testDanceModel.scene:base.scene);
  const bounds=new THREE.Box3().setFromObject(monkey);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=1.50/Math.max(size.x,size.y,size.z,.0001);
  monkey.scale.setScalar(scale);
  monkey.position.copy(center).multiplyScalar(-scale);
  root.add(monkey);
  let stillActive=true;
  // Os trajes antigos têm encaixes próprios do macaco original.
  const experimentalOutfit=experimentalUsed&&!options.testOutfit?{}:outfit;
  const disposeClothes=dress(root,sanitize(experimentalOutfit),requestRender,monkey,{
    animated:true,privateFit:Boolean(options.local&&fitAccess),experimental:experimentalUsed,rigidFollowers:Boolean(options.rigidAccessories)
  });
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
  return {group:root,rig:monkey,experimentalUsed,updateAccessories:disposeClothes.updateAccessories||(()=>{}),setSeatGlassesCalibration:disposeClothes.setSeatGlassesCalibration||(()=>{}),getGlassesDiagnostics:disposeClothes.getGlassesDiagnostics||(()=>({loaded:false})),dispose:()=>{stillActive=false;disposeClothes();}};
}


// Arena: assemble EXACTLY as the standing wardrobe preview first, then let
// the skeleton animate it. The dance-floor fitting path has separate presets
// (including seated glasses) and must not be used as the wardrobe reference.
export async function createWardrobeFittedAvatar(outfit={}, {local=false}={}){
  if(!base)await ensureBaseModel();
  if(!base)throw Error("Modelo macaco.glb indisponível.");
  const selection=sanitize(outfit);
  const files=[selection.hat,selection.glasses,
    selection.headphones==="preto"?"fone_novo":selection.headphones!=="nenhum"?"fone":null,
    {punk:"regatapunk",rosa:"vestido",rosa_novo:"vestido_novo"}[selection.outfit]]
    .filter(file=>ASSETS[file]);
  // All assets finish loading BEFORE the first pose is applied. Otherwise a
  // late attach() can accidentally capture a victory/death pose as its bind.
  await Promise.all(files.map(getAsset));
  const group=new THREE.Group(),monkey=cloneSkeleton(base.scene);
  const bounds=new THREE.Box3().setFromObject(monkey);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=1.8/(Math.max(size.x,size.y,size.z)||1);
  monkey.scale.setScalar(scale);monkey.position.copy(center).multiplyScalar(-scale);
  group.add(monkey);group.rotation.y=-.18;
  let active=true;
  const disposeClothes=dress(group,selection,()=>{},monkey,{
    animated:false,privateFit:Boolean(local&&fitAccess)
  });
  // Cached getAsset().then() callbacks install the clothes in this microtask.
  await Promise.resolve();
  group.updateWorldMatrix(true,true);
  // Some static legacy pieces (skirt and headphones worn at the neck)
  // stay at the model root in the preview. Keep their exact world fit but
  // parent them to the appropriate bone so they follow the whole animation.
  const legacy=[];
  monkey.traverse(part=>{if(/^jfWardrobe_/.test(part.name)&&part.parent===monkey)legacy.push(part);});
  for(const part of legacy){
    const role=part.name==="jfWardrobe_vestido"?"Hips":part.name==="jfWardrobe_fone"&&selection.hat!=="nenhum"?"Neck":"Head";
    const bone=getAnimatedBone(monkey,role);if(bone)bone.attach(part);
  }
  group.rotation.y=0;group.updateWorldMatrix(true,true);
  const disposeShirt=selection.outfit==="punk"?skinWardrobeShirt({group,rig:monkey}):()=>{};
  return {group,rig:monkey,updateAccessories:()=>{
    if(active)group.updateWorldMatrix(true,true);
  },dispose:()=>{active=false;disposeShirt();disposeClothes();}};
}
