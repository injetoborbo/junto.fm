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
let down=null;
const people=new Map();
const tiles=[],chairs=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const clock=new THREE.Clock();
const sittingFrameQuaternion=new THREE.Quaternion();
const seatedHipDelta=new THREE.Vector3();
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
  cube(6.65,.26,6.65,edge,0,-.34,0,board);
  const tileGeo=new THREE.BoxGeometry(.982,.09,.982);
  const tilesMats=[mat(0x252044,.45,.27),mat(0x112c44,.42,.25),mat(0x24203c,.4,.28),mat(0x163546,.46,.25)];
  for(let x=0;x<6;x++)for(let z=0;z<6;z++){
    const tile=new THREE.Mesh(tileGeo,tilesMats[(x+z)%4]);
    tile.position.set(x-2.5,-.13,z-2.5);tile.userData.tile={x,z};
    board.add(tile);tiles.push(tile);
    const trimMat=new THREE.MeshStandardMaterial({color:0x232d50,emissive:(x+z)%2?0x00d7ff:0xff3ea8,emissiveIntensity:.48,roughness:.32});
    const trim=cube(.92,.012,.92,trimMat,x-2.5,-.078,z-2.5,board);
    trim.userData.jfDanceGlow={x,z};
  }
  // Cadeira na casa (4,4), com assento e encosto clicáveis.
  const chairGroup=new THREE.Group();chairGroup.position.set(1.5,-.04,1.5);chairGroup.scale.setScalar(.68);board.add(chairGroup);
  scene.userData.seatChair=chairGroup;
  const chairMat=mat(0x355a89,.42,.37),chairLeg=mat(0x162943,.75,.28);
  cube(.94,.16,.84,chairMat,0,.35,0,chairGroup);
  cube(.94,1.13,.15,chairMat,0,.89,-.39,chairGroup);
  for(const x of [-.36,.36])for(const z of [-.29,.29])cube(.10,.52,.10,chairLeg,x,.02,z,chairGroup);
  chairGroup.traverse(obj=>{if(obj.isMesh)chairs.push(obj);});
  // Teto aberto: duas paredes em perspectiva Habbo, molduras e rodapés.
  cube(6.7,2.35,.18,wall,0,.96,-3.12);
  cube(.18,2.35,6.7,wall,-3.12,.96,0);
  cube(6.7,.18,.25,wood,0,2.19,-3.12);
  cube(.25,.18,6.7,wood,-3.12,2.19,0);
  cube(6.65,.24,.3,edge,0,-.01,-3.08);
  cube(.3,.24,6.65,edge,-3.08,-.01,0);
  // Painel de DJ, telas iluminadas e botões de mixagem fora das casas da pista.
  cube(2.5,.9,.42,wood,1.55,.53,-2.83);
  cube(1.22,.58,.12,mat(0x182846,.15,.28),1.55,1.19,-2.92);
  for(let k=0;k<7;k++)cube(.09,.08+(k%3)*.11,.03,k%2?mat(0x78f2dd):mat(0xff87b6),1.11+k*.15,1.02,-2.84);
  for(const x of [.65,2.45]){
    mesh(new THREE.CylinderGeometry(.27,.27,.035,24),mat(0x18243b,.6,.25),x,1.01,-2.66);
    mesh(new THREE.CylinderGeometry(.12,.12,.045,24),gold,x,1.05,-2.66);
  }
  // Luminárias redondas e arabescos discretos nas paredes, estilo club retrô.
  for(const [x,z] of [[-2.82,-2.82],[2.82,-2.82],[-2.82,2.82]]){
    const stand=mesh(new THREE.CylinderGeometry(.07,.09,1.34,12),wood,x,.56,z);
    const globe=mesh(new THREE.SphereGeometry(.25,20,12),glass,x,1.48,z);
    const glow=new THREE.PointLight(x<0?0xff3cac:0x24dfff,9,4);glow.position.set(x,1.55,z);scene.add(glow);
  }
  // Globo espelhado em pequenos quadrados, sem partículas pesadas.
  const disco=new THREE.Group();disco.position.set(-1.5,2.45,-1.5);
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
  for(const [x,z,color,phase] of [[-2.1,-2.3,0xff3caa,0],[2.25,-2.4,0x24d9ff,1.8],[.4,2.25,0x9a65ff,3.1]]){
    const beam=new THREE.Mesh(beamGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.095,depthWrite:false,side:THREE.DoubleSide}));
    beam.position.set(x,2.85,z);beam.rotation.x=.18;beam.rotation.z=.14;
    scene.add(beam);beams.push({beam,phase});
    const lamp=new THREE.PointLight(color,14,5);lamp.position.set(x,2.35,z);scene.add(lamp);
  }
  scene.userData.beams=beams;
  scene.userData.glowingTiles=board.children.filter(o=>o.userData?.jfDanceGlow);
  // Faixa decorativa com nome do club.
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=160;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#100e2b";ctx.fillRect(0,0,512,160);
  ctx.strokeStyle="#ff55c6";ctx.lineWidth=12;ctx.strokeRect(7,7,498,146);
  ctx.fillStyle="#e8faff";ctx.textAlign="center";ctx.font="bold 70px Trebuchet MS";ctx.fillText("JUNTO CLUB",256,102);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.7,.84),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
  sign.position.set(-1.25,1.3,-2.99);scene.add(sign);scene.userData.signTexture=texture;
  camera=new THREE.OrthographicCamera(-6.35,6.35,4.25,-4.25,.1,100);
  camera.position.set(9,12,9);camera.lookAt(0,.55,0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.3));
  viewport.replaceChildren(renderer.domElement);
  const resize=()=>{
    if(!renderer||!active)return;
    const width=Math.max(220,viewport.clientWidth),height=Math.max(220,viewport.clientHeight);
    renderer.setSize(width,height,false);
    const aspect=width/height,halfH=4.55;
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
    entry.root=avatar.group;entry.rig=avatar.rig;entry.dispose=avatar.dispose;entry.updateAccessories=avatar.updateAccessories;entry.setSeatGlassesCalibration=avatar.setSeatGlassesCalibration;entry.getGlassesDiagnostics=avatar.getGlassesDiagnostics;
    // Ajuste fino do slider fica apenas no nosso avatar; os demais usam o padrão salvo.
    if(id===socket.id)entry.setSeatGlassesCalibration?.(seatGlassesAdjustment);
    entry.restBones=new Map();
    entry.rig.traverse(obj=>{if(obj.isBone)entry.restBones.set(obj.uuid,obj.quaternion.clone());});
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
    const tag=nameSprite(profile.name);
    entry.root.add(tag);entry.name=tag;
    scene.add(entry.root);
  }catch(error){console.warn("Falha no avatar da pista:",error);if(people.get(id)===entry)people.delete(id);}
}
function removeMember(id){
  const member=people.get(id);if(!member)return;
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
function animate(){
  if(!active||!renderer)return;
  frame=requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.065);
  const time=clock.elapsedTime;
  for(const {beam,phase} of scene.userData.beams||[]){
    beam.rotation.z=.16*Math.sin(time*.55+phase);
    beam.rotation.x=.16*Math.cos(time*.43+phase);
  }
  for(const tile of scene.userData.glowingTiles||[]){
    const {x,z}=tile.userData.jfDanceGlow;
    tile.material.emissiveIntensity=.19+.45*(.5+.5*Math.sin(time*1.85+(x+z)*.63));
  }
  if(scene.userData.disco)scene.userData.disco.rotation.y+=dt*.34;
  for(const [id,p] of people){
    if(!p.root)continue;
    const d=p.data,style=d.seated?"idle":d.dance||"idle";
    switchDance(p,style);
    const targetX=d.x-2.5,targetZ=d.z-2.5;
    // A cadeira usa um deslocamento visual. O destino da caminhada
    // precisa ser o mesmo para não provocar oscilação infinita.
    const seatedOffsetX=d.seated?.12:0,seatedOffsetZ=d.seated?-.12:0;
    const poseX=targetX+seatedOffsetX,poseZ=targetZ+seatedOffsetZ;
    const dx=poseX-p.root.position.x,dz=poseZ-p.root.position.z;
    const distance=Math.hypot(dx,dz);
    const walking=distance>.025;
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
    p.root.position.y=(d.seated&&!walking?.70:.77)+(d.seated?0:walking?.032*Math.abs(stride):style==="idle"?.009*pulse:style==="capoeira"?.025*bounce:.045*bounce);

    p.root.rotation.z=walking?0:style==="capoeira"?.14*pulse:style==="groove"?.12*pulse:style==="shake"?.07*pulse:0;
    if(!walking)p.root.rotation.y+=Math.atan2(Math.sin((d.seated?0:.65)-p.root.rotation.y),Math.cos((d.seated?0:.65)-p.root.rotation.y))*Math.min(1,dt*1.6);
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
            .applyQuaternion(hip.alignment).multiplyScalar(hip.scale);
          hip.bone.position.add(seatedHipDelta);
        }
      }
    }
    if(p.rig&&!p.action){
      // Retarget em espaço GLOBAL somente para o conjunto de braços.
      // No FBX as bases locais de clavículas e ombros podem ser diferentes
      // das do macaco. A matriz mundial relativa à raiz preserva os eixos.
      const sourcePoseWorld=new Map();
      const seatedTime=p.sitDuration>0?
        ((time%p.sitDuration)+p.sitDuration)%p.sitDuration:0;
      const animatedSourceWorld=(info)=>{
        if(sourcePoseWorld.has(info.key))return sourcePoseWorld.get(info.key);
        const parentWorld=info.parent?
          animatedSourceWorld(info.parent):
          info.parentWorldRest.clone();
        const values=info.track?.evaluate(seatedTime);
        const local=values?.length===4?
          sittingFrameQuaternion.fromArray(values).clone():info.localRest;
        const world=parentWorld.multiply(local).normalize();
        sourcePoseWorld.set(info.key,world);
        return world;
      };
      p.rig.traverse(obj=>{
        if(!obj.isBone)return;
        if(d.seated&&!walking&&p.sitTracks?.has(obj.uuid)&&p.sitDuration>0){
          const key=boneKey(obj.name);
          // Omoplatas, braços e antebraços recebem rotação GLOBAL relativa
          // ao rig original. O restante continua com a transferência antiga.
          const isArm=/^(left|right)(shoulder|arm|forearm|hand)$/.test(key);
          const sourceInfo=isArm?p.sitSourceWorld?.get(key):null;
          const targetRest=isArm?p.sitTargetRestWorld?.get(obj.uuid):null;
          if(sourceInfo&&targetRest){
            const sourceRotation=animatedSourceWorld(sourceInfo);
            const desiredWorld=sourceRotation.clone()
              .multiply(sourceInfo.worldRest.clone().invert())
              .multiply(targetRest);
            p.rig.updateWorldMatrix(true,false);
            obj.parent.updateWorldMatrix(true,false);
            const rigWorld=p.rig.getWorldQuaternion(new THREE.Quaternion());
            const parentWorld=obj.parent.getWorldQuaternion(new THREE.Quaternion());
            const parentInRig=rigWorld.invert().multiply(parentWorld);
            obj.quaternion.copy(parentInRig.invert().multiply(desiredWorld)).normalize();
            obj.updateMatrix();
            return;
          }
          const {rest,sourceInverse,interpolant}=p.sitTracks.get(obj.uuid);
          const value=interpolant.evaluate(seatedTime);
          if(value?.length===4){
            obj.quaternion.copy(rest).multiply(sourceInverse)
              .multiply(sittingFrameQuaternion.fromArray(value)).normalize();
            return;
          }
        }
        if(d.seated&&!walking&&p.sitRotations?.has(obj.uuid)){
          obj.quaternion.copy(p.sitRotations.get(obj.uuid));
          return;
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
      });
    }
    // Selecionar perfil de encaixe da cadeira apenas quando chegou ao assento.
    p.updateAccessories?.(Boolean(d.seated));
  }
  if(!inspectCleanup)renderer.render(scene,camera);
}
function setStatus(message){status.textContent=message;}
function open(){
  room=bridge?.getRoom();
  if(!room){setStatus("Entre em uma sala para usar a pista.");return;}
  if(active)return;
  active=true;sequence++;people.clear();
  void sittingPose();
  modal.hidden=false;
  if(openButton)openButton.hidden=true;
  try{sceneSetup();clock.start();animate();socket.emit("dance-enter");setStatus("Entrando na pista...");}
  catch(error){console.error(error);setStatus("Não foi possível abrir a pista 3D.");close();}
}
function close(){
  inspectCleanup?.();
  if(!active)return;
  const oldRoom=room;active=false;room=null;sequence++;
  cancelAnimationFrame(frame);
  socket.emit("dance-exit");
  for(const id of [...people.keys()])removeMember(id);
  scene?.userData.cleanup?.();
  scene?.userData.signTexture?.dispose();
  for(const tile of scene?.userData.glowingTiles||[])tile.material.dispose();
  for(const {beam} of scene?.userData.beams||[])beam.material.dispose();
  renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();
  for(const t of nameMaterialCache.values())t.dispose();nameMaterialCache.clear();
  scene=null;camera=null;renderer=null;board=null;tiles.length=0;chairs.length=0;
  modal.hidden=true;
  if(openButton)openButton.hidden=false;
  if(oldRoom)setStatus("Saiu da pista.");
}
// Inspeção ampliada isolada: um renderer temporário, sem alterar o estado da pista.
const inspectButton=document.getElementById("jfSeatInspect");
const inspectModal=document.getElementById("jfSeatInspectModal");
const inspectClose=document.getElementById("jfSeatInspectClose");
const inspectViewport=document.getElementById("jfSeatInspectViewport");
let inspectCleanup=null,inspectOpening=false;
const glassesAxes=["x","y","z"];
const glassesInputs=Object.fromEntries(glassesAxes.map(axis=>[axis,document.getElementById("jfSeatGlasses"+axis.toUpperCase())]));
const savedSeatGlassesAdjustment=Object.freeze({x:-.0002,y:-.0011,z:-.0024});
const seatGlassesAdjustment={...savedSeatGlassesAdjustment};
const eyewearDiagnostics=document.getElementById("jfSeatGlassesDiagnostics");
function displayEyewearDiagnostics(){
  if(!eyewearDiagnostics)return;
  const member=people.get(socket?.id);
  if(!member){eyewearDiagnostics.textContent="Aguardando seu avatar entrar na pista.";return;}
  const check=member.getGlassesDiagnostics?.();
  if(!check?.loaded){
    eyewearDiagnostics.textContent="Óculos ainda não vinculados | selecionado: "+
      (check?.requested||"desconhecido")+" | Head encontrado: "+
      (check?.headBone||"NÃO")+" | objetos vinculados: "+
      (check?.attached?.join(", ")||"nenhum")+".";
    return;
  }
  eyewearDiagnostics.textContent="Óculos detectados: "+check.requested+
    " | osso: "+check.bone+
    " | pose sentada: "+(check.seated?"SIM":"NÃO")+
    " | posição real: "+check.coordinates.join(", ")+
    " | ajuste: "+glassesAxes.map(axis=>seatGlassesAdjustment[axis].toFixed(4)).join(", ");
}
function updateGlassesPreview(){
  for(const axis of glassesAxes){
    const input=glassesInputs[axis];
    if(input)input.value=String(seatGlassesAdjustment[axis]);
    const output=document.getElementById("jfSeatGlasses"+axis.toUpperCase()+"Value");
    if(output)output.textContent=seatGlassesAdjustment[axis].toFixed(4);
  }
  const member=people.get(socket?.id);
  member?.setSeatGlassesCalibration?.(seatGlassesAdjustment);
  displayEyewearDiagnostics();
}
for(const axis of glassesAxes){
  glassesInputs[axis]?.addEventListener("input",value=>{
    // Input is native DOM; read slider value directly.
    seatGlassesAdjustment[axis]=Number(glassesInputs[axis].value)||0;
    updateGlassesPreview();
  });
}
document.getElementById("jfSeatGlassesPreset")?.addEventListener("click",()=>{
  // Deslocamento perceptível e reversível para verificar se o código da
  // prévia realmente afeta o óculos que está sendo renderizado.
  // Comparar com a posição anterior, sem a calibração aprovada.
  Object.assign(seatGlassesAdjustment,{x:0,y:0,z:0});
  updateGlassesPreview();
});
document.getElementById("jfSeatGlassesReset")?.addEventListener("click",()=>{
  Object.assign(seatGlassesAdjustment,savedSeatGlassesAdjustment);
  updateGlassesPreview();
});
document.getElementById("jfSeatGlassesCopy")?.addEventListener("click",()=>{
  const info=JSON.stringify(seatGlassesAdjustment);
  navigator.clipboard?.writeText(info).catch(()=>{});
});

async function openSeatInspect(){
  if(!active||inspectCleanup||!inspectModal||!inspectViewport)return;
  const me=people.get(socket?.id);
  if(!me?.root||!me.data.seated){
    setStatus("Sente seu macaco na cadeira da pista antes de abrir a visão ampliada.");
    return;
  }
  inspectModal.hidden=false;
  updateGlassesPreview();
  let raf=0,disposed=false,drag=null,yaw=.55,pitch=.23,distance=2.65;
  // Compartilha o renderer e a cena originais: não clona o rig, os óculos
  // nem as texturas, e não cria outro contexto WebGL.
  const inspectCamera=new THREE.PerspectiveCamera(35,1,.05,80);
  const center=new THREE.Vector3(),bounds=new THREE.Box3();
  const dispose=()=>{
    if(disposed)return;
    disposed=true;cancelAnimationFrame(raf);
    inspectViewport.removeEventListener("pointerdown",down);
    inspectViewport.removeEventListener("pointermove",move);
    inspectViewport.removeEventListener("pointerup",up);
    inspectViewport.removeEventListener("pointercancel",up);
    inspectViewport.removeEventListener("wheel",wheel);
    // Um canvas não pode pertencer a dois elementos: devolve-o à pista.
    if(renderer?.domElement&&viewport){
      viewport.appendChild(renderer.domElement);
      // Restaurar dimensões e câmera da pista ao fechar a inspeção.
      const width=Math.max(220,viewport.clientWidth),height=Math.max(220,viewport.clientHeight);
      renderer.setSize(width,height,false);
      const aspect=width/height,halfH=4.55;
      camera.left=-halfH*aspect;camera.right=halfH*aspect;
      camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
    }
    inspectModal.hidden=true;
    inspectCleanup=null;
  };
  const down=e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};inspectViewport.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!drag)return;yaw=drag.y-(e.clientX-drag.x)*.009;pitch=Math.max(-.1,Math.min(.9,drag.pitch+(e.clientY-drag.y)*.006));};
  const up=()=>{drag=null;};
  const wheel=e=>{e.preventDefault();distance=Math.max(1.7,Math.min(6,distance+Math.sign(e.deltaY)*.18));};
  inspectCleanup=dispose;
  inspectViewport.addEventListener("pointerdown",down);
  inspectViewport.addEventListener("pointermove",move);
  inspectViewport.addEventListener("pointerup",up);
  inspectViewport.addEventListener("pointercancel",up);
  inspectViewport.addEventListener("wheel",wheel,{passive:false});
  inspectViewport.setAttribute("aria-label","Cena real da pista ampliada sobre o macaco sentado, com acessórios originais");
  inspectViewport.appendChild(renderer.domElement);
  // A renderização ocorre no loop principal, depois da atualização da pose.
  // Somente trocamos câmera e viewport, nunca alteramos os ossos.
  const update=()=>{
    if(disposed)return;
    const current=people.get(socket?.id);
    if(!active||!renderer||!current?.root||!current.data.seated){dispose();return;}
    current.root.updateWorldMatrix(true,true);
    bounds.setFromObject(current.root);
    bounds.getCenter(center);
    // A cabeça e a cadeira ocupam aproximadamente este espaço.
    center.y=Math.max(.55,Math.min(1.18,center.y));
    const w=Math.max(1,inspectViewport.clientWidth),h=Math.max(1,inspectViewport.clientHeight);
    renderer.setSize(w,h,false);
    inspectCamera.aspect=w/h;inspectCamera.updateProjectionMatrix();
    inspectCamera.position.set(center.x+distance*Math.sin(yaw)*Math.cos(pitch),
      center.y+distance*Math.sin(pitch),
      center.z+distance*Math.cos(yaw)*Math.cos(pitch));
    inspectCamera.lookAt(center);
    renderer.render(scene,inspectCamera);
    displayEyewearDiagnostics();
    raf=requestAnimationFrame(update);
  };
  update();
}
inspectButton?.addEventListener("click",openSeatInspect);
inspectClose?.addEventListener("click",()=>inspectCleanup?.());
inspectModal?.addEventListener("click",e=>{if(e.target===inspectModal)inspectCleanup?.();});
openButton?.addEventListener("click",open);
closeButton?.addEventListener("click",close);
modal?.addEventListener("click",e=>{if(e.target===modal)close();});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(inspectCleanup)inspectCleanup();else if(active)close();});
for(const button of choices)button.addEventListener("click",()=>{if(!active)return;socket.emit("dance-style",{dance:button.dataset.jfDance});});
viewport?.addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY};});
viewport?.addEventListener("pointerup",e=>{
  if(!active||!renderer||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;
  down=null;
  const bounds=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  if(raycaster.intersectObjects(chairs).length){socket.emit("dance-sit");return;}
  const hit=raycaster.intersectObjects(tiles)[0];
  if(hit){const {x,z}=hit.object.userData.tile;if(x===4&&z===4)socket.emit("dance-sit");else socket.emit("dance-move",{x,z});}
});
socket?.on("dance-state",({room:joinedRoom,participants=[]})=>{
  if(!active||joinedRoom!==room)return;
  for(const entry of participants)putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  setStatus("Clique no chão para andar ou na cadeira para sentar.");
  updateChoices();
});
socket?.on("dance-updated",entry=>{
  if(!active||!entry?.id)return;
  putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  if(entry.id===socket.id)updateChoices();
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
window.addEventListener("jf-admin-skin-changed",()=>refreshDancer(socket.id));

socket?.on("dance-error",({message})=>{if(active)setStatus(message||"Não foi possível mover.");});
socket?.on("room-kicked",close);
socket?.on("left-room",close);
socket?.on("disconnect",close);
window.addEventListener("jf-dance-room-left",close);
