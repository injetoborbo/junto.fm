/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","gorro","palha","branco","caveira"],
  glasses:["nenhum","escuros","redondos","sem_aro","botao"],
  headphones:["nenhum","azul","rosa","preto"],
  outfit:["padrao","rosa","rosa_novo"]
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
  botao:"/olhos-botao-leve.glb",
  fone:"/fone_preto.glb",
  vestido:"/vestido_rosa.glb",
  caveira:"/toucaveira.glb",
  sem_aro:"/oculossemolo.glb",
  fone_novo:"/fonepreto.glb",
  vestido_novo:"/vestidorosa.glb",
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
  botao:{width:.68,offset:[0,.23,.31]},
  fone_novo:{width:.66,offset:[0,.40,.10]},
  vestido_novo:{width:.70,offset:[0,-.24,0]}
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
function dress(root,selection,render,monkey,{animated=false,privateFit=false,previewSeated=false}={}){
  // Capturar o bind pose ANTES das animações. As promessas de GLB podem
  // resolver com o avatar andando/sentado; nesse caso attach() simples
  // preservaria uma posição antiga num esqueleto já animado.
  root.updateMatrixWorld(true);
  monkey.updateMatrixWorld(true);
  const monkeyBindWorld=monkey.matrixWorld.clone();
  const rootBindWorld=root.matrixWorld.clone();
  const state=new THREE.Group();state.name="jfWardrobeParts";state.userData.active=true;root.add(state);
  const findBone=animated?getAnimatedBone:getBone;
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
  const correctionWorld=new THREE.Matrix4(),parentInverse=new THREE.Matrix4(),localMatrix=new THREE.Matrix4();
  const updateAccessories=(seated=isSeated)=>{
    isSeated=Boolean(seated);
    if(!animated||!state.userData.active||!followers.length)return;
    // Garantir osso atualizado APÓS mixer/pose, inclusive no modo sentado.
    monkey.updateMatrixWorld(true);
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
      monkey.add(part);
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
  const installNewWearable=(file,bone,{seatedOffset={}}={})=>{
    getAsset(file).then(asset=>{
      if(!asset||!state.userData.active||!bone)return;
      const part=asset.clone(true);
      part.name="jfWardrobe_"+file;
      const measure=getBounds(part);
      state.add(part);
      // A peça fica no espaço do osso; ao editar, recalculamos o encaixe
      // sem recriar o renderer ou fazer um novo download do GLB.
      if(animated)attachAtBind(part,bone,rootBindWorld,{},seatedOffset);
      else bone.add(part);
      const boneBind=bindMatrices.get(bone);
      const rootPart=new THREE.Matrix4(),seatPart=new THREE.Matrix4(),toBone=new THREE.Matrix4();
      const tmpPosition=new THREE.Vector3(),tmpScale=new THREE.Vector3();
      const tmpRotation=new THREE.Quaternion(),centerOffset=new THREE.Vector3();
      const buildMatrix=(params,matrix)=>{
        const sc=params.width/Math.max(measure.size.x,1e-6);
        const target=restInRoot(bone).add(new THREE.Vector3(...params.offset));
        tmpRotation.setFromAxisAngle(new THREE.Vector3(1,0,0),
          THREE.MathUtils.degToRad(file==="vestido_novo"?(params.pitch||0):0));
        centerOffset.copy(measure.center).multiplyScalar(sc).applyQuaternion(tmpRotation);
        tmpPosition.copy(target).sub(centerOffset);
        tmpScale.setScalar(sc);
        matrix.compose(tmpPosition,tmpRotation,tmpScale);
      };
      const update=()=>{
        if(!state.userData.active||!part.parent)return;
        buildMatrix(fittedItem(file,privateFit),rootPart);
        if(animated){
          const follower=followers.find(item=>item.part===part);
          if(!follower||!boneBind)return;
          toBone.copy(boneBind).invert().multiply(rootBindWorld).multiply(rootPart);
          follower.bindLocal.copy(toBone);
          // O vestido sentado usa um preset privado INDEPENDENTE.
          // As outras peças continuam usando o ajuste original sentado.
          buildMatrix(fittedItem(file,privateFit,file==="vestido_novo"),seatPart);
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
  if(selection.outfit==="rosa_novo")installNewWearable("vestido_novo",newTorsoBone,{
    seatedOffset:{y:.00010}
  });
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
      if(animated){
        attachAtBind(hat,headBone,rootBindWorld,{y:-.00020,z:-.00004},{y:-.0010,z:.0001});
      }else{
        state.updateWorldMatrix(true,true);
        if(headBone)headBone.attach(hat);
      }
      updateAccessories();
      render();
    });
  }else if(selection.hat==="bone"||selection.hat==="gorro"){
    attachFitted(selection.hat,part=>{
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
  if(selection.hat==="palha"||selection.hat==="branco"){
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
      const desiredWidth=type==="palha"?.94:.92;
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
function makeScene(target,wardrobe,{preview=false,skin="default",playerSitting=false,previewSeated=false}={}){
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
  const camera=new THREE.PerspectiveCamera(33,width/height,.01,100);
  camera.position.set(0,.04,playerSitting?3.25:preview?4.25:4.0);camera.lookAt(0,.035,0);
  normalized.rotation.y=preview?previewYaw:-.18;
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
    selection.outfit==="rosa_novo"?"vestido_novo":selection.outfit==="rosa"?"vestido":null
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
  previewRenderer=makeScene(preview,editing,{preview:true,previewSeated:fitAccess&&fitPose==="seated"&&editing.outfit==="rosa_novo"});
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
  vestido_novo:["outfit","rosa_novo"]
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
  if(!base)await ensureBaseModel();
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
  const disposeClothes=dress(root,sanitize(outfit),requestRender,monkey,{animated:true,privateFit:Boolean(options.local&&fitAccess)});
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
  return {group:root,rig:monkey,updateAccessories:disposeClothes.updateAccessories||(()=>{}),setSeatGlassesCalibration:disposeClothes.setSeatGlassesCalibration||(()=>{}),getGlassesDiagnostics:disposeClothes.getGlassesDiagnostics||(()=>({loaded:false})),dispose:()=>{stillActive=false;disposeClothes();}};
}
