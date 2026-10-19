/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","gorro","palha","branco","caveira"],
  glasses:["nenhum","escuros","redondos","sem_aro"],
  headphones:["nenhum","azul","rosa","preto"],
  outfit:["padrao","rosa","rosa_novo"]
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
  caveira:"/toucaveira.glb",
  sem_aro:"/oculossemolo.glb",
  fone_novo:"/fonepreto.glb",
  vestido_novo:"/vestidorosa.glb",
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
function dress(root,selection,render,monkey,{animated=false}={}){
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
  let isSeated=false;
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
        seatShift.makeTranslation(glassesCalibration.x,glassesCalibration.y,glassesCalibration.z);
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
  const installNewWearable=(file,bone,{width,offset,seatedOffset={}})=>{
    getAsset(file).then(asset=>{
      if(!asset||!state.userData.active||!bone)return;
      const part=asset.clone(true);
      part.name="jfWardrobe_"+file;
      const measure=getBounds(part);
      const scale=width/Math.max(measure.size.x,1e-6);
      const target=restInRoot(bone).add(new THREE.Vector3(...offset));
      part.scale.setScalar(scale);
      part.position.set(target.x-measure.center.x*scale,
        target.y-measure.center.y*scale,
        target.z-measure.center.z*scale);
      state.add(part);
      if(animated)attachAtBind(part,bone,rootBindWorld,{},seatedOffset);
      else{
        root.updateMatrixWorld(true);
        monkey.updateMatrixWorld(true);
        bone.attach(part);
      }
      updateAccessories(isSeated);
      render();
    });
  };
  if(selection.hat==="caveira")installNewWearable("caveira",newHeadBone,{
    width:.66,offset:[0,.35,0],seatedOffset:{y:-.00015}
  });
  if(selection.glasses==="sem_aro")installNewWearable("sem_aro",newHeadBone,{
    width:.56,offset:[0,.16,.06],seatedOffset:{z:.00015}
  });
  if(selection.headphones==="preto")installNewWearable("fone_novo",newHeadBone,{
    width:.76,offset:[0,.26,0],seatedOffset:{y:-.00010}
  });
  if(selection.outfit==="rosa_novo")installNewWearable("vestido_novo",newTorsoBone,{
    width:.68,offset:[0,-.10,.02],seatedOffset:{y:.00010}
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
  if(selection.glasses!=="nenhum"&&selection.glasses!=="sem_aro"){
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
  if(!playerSitting)disposeOutfit=dress(normalized,sanitize(wardrobe),renderOutfit,monkey);
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
  const queue=[...new Set([...preferred,...wardrobePrefetchKeys])];
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
if(document.readyState==="complete"){
  setTimeout(prefetchWardrobeAssets,500);
}else{
  window.addEventListener("load",()=>setTimeout(prefetchWardrobeAssets,500),{once:true});
}
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
  const disposeClothes=dress(root,sanitize(outfit),requestRender,monkey,{animated:true});
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
