import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";

import {createDanceAvatar} from "/wardrobe.js?v=arena-fit-12";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,lastSize={width:0,height:0};
const avatars=new Map();

const furniture=new Map(), furnitureLoader=new GLTFLoader(), furnitureAssets=new Map();
const KENNEY_CC0="https://raw.githubusercontent.com/0auBSQ/OpenTaiko/50b190a2303742202dc9cb44d946a524da2d4fff/OpenTaiko/Global/Modules/Stages/my_room/Models/";
const ASSET_PATHS={chair:"/club/cadeirabalada.glb",table:"/club/mesabalada.glb",sofa:KENNEY_CC0+"sofa.glb",bed:KENNEY_CC0+"bed.glb",shelf:KENNEY_CC0+"bookshelf.glb",plant:KENNEY_CC0+"plant.glb",lamp:KENNEY_CC0+"floorlamp.glb",tv:KENNEY_CC0+"tv.glb",banana:"/club/bananasims_otimizada.glb"};
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.88});
function block(g,w,h,d,color,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);g.add(m);}
function fallbackFurniture(type,color,w,h){
 const g=new THREE.Group(),wood="#8b6047",fabric=color||"#c96c4d";
 if(type==="sofa"){block(g,w*.92,h*.35,18,fabric,0,8,0);block(g,w*.92,34,18,fabric,0,28,-3);block(g,12,38,24,wood,-w*.43,17,0);block(g,12,38,24,wood,w*.43,17,0);}
 else if(type==="bed"){block(g,w,h*.24,24,wood,0,8,0);block(g,w*.94,h*.72,20,"#eee1c4",0,23,2);block(g,w*.94,10,22,fabric,0,39,0);}
 else if(type==="tv"){block(g,w,h*.2,20,wood,0,5,0);block(g,w*.88,h*.72,24,"#202632",0,28,0);block(g,w*.72,h*.54,3,"#8ad9d5",0,29,13);}
 else if(type==="shelf"||type==="arcade"){block(g,w*.9,h,15,wood,0,h/2,0);for(let y=10;y<h;y+=18)block(g,w*.84,3,17,"#d5b68a",0,y,10);}
 else if(type==="rug"){block(g,w,h,2,fabric,0,0,-4);}
 else if(type==="plant"||type==="banana"){block(g,w*.35,15,16,"#a96f4b",0,7,0);for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(12,7,5),material(i%2?"#5d9b58":"#78b96c"));leaf.scale.set(.65,1.35,.45);leaf.position.set(Math.cos(i*1.25)*10,27+Math.sin(i*1.25)*7,0);g.add(leaf);}}
 else if(type==="lamp"){block(g,4,h*.7,4,"#b6a17a",0,h*.36,0);const shade=new THREE.Mesh(new THREE.ConeGeometry(13,18,8),material("#f4d88c"));shade.position.y=h*.78;g.add(shade);}
 else {block(g,w*.8,h*.35,18,fabric,0,10,0);}
 return g;
}
function loadFurniture(type){if(!ASSET_PATHS[type])return Promise.resolve(null);if(!furnitureAssets.has(type))furnitureAssets.set(type,furnitureLoader.loadAsync(ASSET_PATHS[type]).then(g=>g.scene).catch(e=>{console.warn("Móvel CC0 indisponível:",type,e);return null;}));return furnitureAssets.get(type);}
function clearFurniture(id){const r=furniture.get(id);if(r){scene.remove(r.root);furniture.delete(id);}}
async function syncFurniture(items,width,height,scale){
 const wanted=new Set((items||[]).map(i=>i.id));for(const id of furniture.keys())if(!wanted.has(id))clearFurniture(id);
 for(const item of items||[]){
  const key=JSON.stringify([item.type,item.x,item.y,item.rotation]);
  let rec=furniture.get(item.id);if(rec?.key===key)continue;if(rec)clearFurniture(item.id);
  const dims={sofa:[2,1],chair:[1,1],table:[2,1],bed:[2,3],shelf:[2,1],plant:[1,1],lamp:[1,1],tv:[2,1],rug:[3,3],speaker:[1,1],arcade:[1,1],banana:[1,1]}[item.type]||[1,1];
  const px=32*scale,py=16*scale,w=(item.rotation%2?dims[1]:dims[0])*px,h=(item.rotation%2?dims[0]:dims[1])*py;
  const footprintW=item.rotation%2?dims[1]:dims[0],footprintH=item.rotation%2?dims[0]:dims[1];
  // A camada 2D projeta a origem em (ox, oy); o overlay Three.js usa o centro da tela.
  // Converte o centro da célula para o mesmo referencial, com Y invertido do canvas para o mundo.
  const root=new THREE.Group();
  root.position.set(((item.x-item.y)+(footprintW-footprintH)/2)*px,
   height/2-(height/2-120*scale+(item.x+item.y+(footprintW+footprintH)/2)*py),0);
  const token={key,root,pending:true};furniture.set(item.id,token);
  const source=await loadFurniture(item.type);
  if(furniture.get(item.id)!==token)continue;
  const object=source?source.clone(true):fallbackFurniture(item.type,item.color,w,h);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const modelSize={sofa:[1.85,.78],chair:[1.02,1.16],table:[1.42,.78],bed:[1.9,.55],shelf:[1.25,1.35],plant:[.82,1.12],lamp:[.68,1.55],tv:[1.72,.92],banana:[.9,1.3]};
  const [widthFactor,heightFactor]=modelSize[item.type]||[Math.max(.65,w/45),Math.max(.45,h/45)];
  const targetW=widthFactor*45*scale,targetH=heightFactor*45*scale;
  const fit=Math.min(targetW/Math.max(size.x,.001),targetH/Math.max(size.y,.001));
  object.scale.setScalar(fit);object.position.sub(center.multiplyScalar(fit));object.position.y+=targetH*.48;
  if(item.rotation)object.rotation.y=item.rotation*Math.PI/2;
  object.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});root.add(object);
  scene.add(root);token.pending=false;
 }
}

const CLUB_DANCES={shake:"/dance/macacochaqualha.glb",macarena:"/dance/macacomacarena.glb",party:"/dance/macacodanca.glb",capoeira:"/dance/macacocapoera.glb",groove:"/dance/macacodancagay.glb"};
const clipLoader=new GLTFLoader(),fbxLoader=new FBXLoader(),clipPromises=new Map(),animationClips=new Map();
let sittingClipPromise=null;
function loadClubSittingClip(){
 if(!sittingClipPromise)sittingClipPromise=fbxLoader.loadAsync("/poses/sentadobalanca.fbx").then(source=>{
  const score=clip=>{let total=0;for(const track of clip.tracks){
   if(!track.name.endsWith(".quaternion")||!/^.*mixamorig/i.test(track.name))continue;
   const values=track.values;if(!values||values.length<8)continue;let moving=false;
   for(let i=4;i+3<values.length;i+=4){let diff=0;for(let a=0;a<4;a++)diff+=Math.abs(values[i+a]-values[a]);if(diff>.005){moving=true;break;}}
   total+=(moving?1000:0)+Math.min(track.times?.length||0,120);
  }return total;};
  const clip=[...(source.animations||[])].sort((a,b)=>score(b)-score(a))[0];
  if(!clip?.tracks?.length)throw Error("FBX sem animação de sentar");
  animationClips.set("sitting",{clip,scene:source});return clip;
 }).catch(error=>{console.warn("Junto Club: pose sentadobalanca indisponível",error);return null;});
 return sittingClipPromise;
}
const boneKey=name=>String(name).split("/").pop().replace(/^.*[|:]/,"").replace(/^mixamorig\d*/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function loadClubClip(style){
 if(!CLUB_DANCES[style])return Promise.resolve(null);
 if(!clipPromises.has(style))clipPromises.set(style,clipLoader.loadAsync(CLUB_DANCES[style]).then(gltf=>{
  const clip=gltf.animations?.find(c=>c.tracks?.length)||null;
  if(clip)animationClips.set(style,{clip,scene:gltf.scene});
  return clip;
 }).catch(error=>{console.warn("Junto Club: animação indisponível",style,error);return null;}));
 return clipPromises.get(style);
}
function buildClubAction(record,style){
 const data=animationClips.get(style);if(!record.rig||!data)return null;
 const sourceBones=new Map(),targetBones=new Map();data.scene.updateMatrixWorld(true);record.rig.updateMatrixWorld(true);
 data.scene.traverse(o=>{if(o.name&&/^mixamorig/i.test(o.name))sourceBones.set(boneKey(o.name),o);});
 record.rig.traverse(o=>{if(o.isBone)targetBones.set(boneKey(o.name),o);});
 const tracks=[],sample=new THREE.Quaternion(),corrected=new THREE.Quaternion(),reference=new THREE.Quaternion();
 for(const track of data.clip.tracks){
  const dot=track.name.lastIndexOf(".");if(dot<0||track.name.slice(dot+1)!=="quaternion")continue;
  const key=boneKey(track.name.slice(0,dot)),source=sourceBones.get(key),target=targetBones.get(key);
  if(!source||!target)continue;
  const rest=record.restBones?.get(target.uuid)||target.quaternion.clone();
  const sourceWorld=source.getWorldQuaternion(new THREE.Quaternion());
  const targetWorld=record.restWorldBones?.get(target.uuid)||target.getWorldQuaternion(new THREE.Quaternion());
  const sourceToTarget=targetWorld.clone().invert().multiply(sourceWorld),targetToSource=sourceToTarget.clone().invert();
  const invSource=source.quaternion.clone().invert(),values=new Float32Array(track.values.length);
  for(let i=0;i<track.values.length;i+=4){
   sample.fromArray(track.values,i);corrected.copy(invSource).multiply(sample);
   if(record.experimentalRig)corrected.premultiply(sourceToTarget).multiply(targetToSource);
   corrected.premultiply(rest).normalize();
   if(i>0){reference.fromArray(values,i-4);if(reference.dot(corrected)<0)corrected.set(-corrected.x,-corrected.y,-corrected.z,-corrected.w);}
   corrected.toArray(values,i);
  }
  tracks.push(new THREE.QuaternionKeyframeTrack(target.name+".quaternion",track.times.slice(),values));
 }
 if(tracks.length<5)return null;
 record.mixer ||=new THREE.AnimationMixer(record.rig);
 const action=record.mixer.clipAction(new THREE.AnimationClip("junto-club-"+style,data.clip.duration,tracks));
 action.setLoop(THREE.LoopRepeat,Infinity);return action;
}
function switchClubDance(record,style){
 if(record.currentDance===style)return;
 record.action?.fadeOut(.24);record.currentDance=style;record.action=null;
 if(style==="idle"){
  record.mixer?.stopAllAction();
  for(const bone of record.animationBones||[]){const rest=record.restBones?.get(bone.uuid);if(rest)bone.quaternion.copy(rest);}
  return;
 }
 if(!animationClips.has(style)){const loading=style==="sitting"?loadClubSittingClip():loadClubClip(style);loading.then(clip=>{if(clip&&record.currentDance===style&&avatars.get(record.id)===record){record.currentDance="idle";switchClubDance(record,style);scheduleAnimation();}});return;}
 const action=buildClubAction(record,style);
 if(action){action.reset().fadeIn(.24).play();record.action=action;}
}
let animationFrame=0,lastFrame=0;
function bonePose(record,pose,time){
 const phase=(time||0)*.0048,walk=Math.sin(record.walkTime||0),dance=record.dance||"idle",bones=record.animationBones||[];
 for(const bone of bones){
  const rest=record.restEuler?.get(bone.uuid);if(!rest)continue;
  const n=bone.name.toLowerCase(),left=/left|(?:^|_)l_(?:arm|hand|thigh|calf|leg|shoulder)/.test(n),side=left?1:-1;
  const upperLeg=/(upleg|upperleg|thigh)/.test(n),lowerLeg=/(calf|shin|lowerleg|leg$)/.test(n)&&!upperLeg;
  const forearm=/(forearm|lowerarm)/.test(n),upperArm=/(upperarm|arm$|shoulder)/.test(n)&&!forearm,hand=/hand/.test(n),torso=/spine|chest/.test(n),head=/head|neck/.test(n);
  let x=rest.x,y=rest.y,z=rest.z;
  if(pose==="walking"){
   if(upperLeg)x+=side*.36*walk;
   if(lowerLeg)x+=.15*Math.max(0,-side*walk);
   if(upperArm)x-=side*.26*walk;
   if(forearm)x-=side*.10*walk;
   if(torso)z+=.022*walk;
  }else if(dance!=="idle"&&pose!=="sitting"&&pose!=="lying"){
   const beat=dance==="macarena"?Math.sin(phase*.72):Math.sin(phase);
   const bounce=Math.abs(Math.sin(phase*1.35));
   if(upperLeg)x+=side*(dance==="capoeira"?.42:.12)*beat;
   if(lowerLeg)x+=dance==="capoeira"?.28*bounce:.08*bounce;
   if(upperArm){x+=dance==="macarena"?-.95:.42*beat;z+=side*(dance==="party"?.55:.22);}
   if(forearm){x+=dance==="macarena"?-.72:.28*Math.sin(phase+side);}
   if(hand)z+=side*.18*Math.sin(phase*1.7);
   if(torso){x+=.12*Math.sin(phase*2);z+=.13*Math.sin(phase);}
   if(head)y+=.08*Math.sin(phase*1.2);
  }
  bone.rotation.set(x,y,z);
 }
}
function animate(now){
 animationFrame=0;
 const dt=Math.min(.065,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
 let moving=false;
 for(const record of avatars.values()){
  if(!record.root||!record.gridTarget)continue;
  const d=record.gridTarget;
  const dx=d.x-record.gridX,dz=d.y-record.gridY,distance=Math.hypot(dx,dz);
  record.mixer?.update(dt);
  const walking=distance>.025;
  // Mesmo deslocamento da Junto Club: 1,35 casas/s, sem saltos entre atualizações do servidor.
  switchClubDance(record,(record.pose==="sitting"||record.pose==="lying")?"idle":walking?"idle":record.dance||"idle");
  if(walking){
   const step=Math.min(1.35*dt,distance);
   record.gridX+=dx/distance*step;
   record.gridY+=dz/distance*step;
   const heading=Math.atan2(dx,dz);
   const angleDiff=Math.atan2(Math.sin(heading-record.root.rotation.y),Math.cos(heading-record.root.rotation.y));
   record.root.rotation.y+=Math.max(-dt*4,Math.min(dt*4,angleDiff));
   moving=true;
  }else{
   record.gridX=d.x;record.gridY=d.y;
   const targetYaw=Math.PI/4;
   record.root.rotation.y+=Math.atan2(Math.sin(targetYaw-record.root.rotation.y),Math.cos(targetYaw-record.root.rotation.y))*Math.min(1,dt*1.6);
  }
  record.walkTime=(record.walkTime||0)+(walking?dt*7.8:0);
  const stride=Math.sin(record.walkTime),style=record.dance||"idle";
  const phase=now*.002, pulse=Math.sin(phase),bounce=Math.abs(pulse);
  record.root.position.x=(record.gridX-record.gridY)*record.tileX;
  record.root.position.y=record.baseY-(record.gridX+record.gridY)*record.tileY+(walking?.032*Math.abs(stride):style==="idle"?.009*pulse:style==="capoeira"?.025*bounce:.045*bounce);
  record.root.position.z=2;
  record.root.rotation.x=record.pose==="sitting"?-.12:0;
  record.root.rotation.z=walking?0:style==="capoeira"?.14*pulse:style==="groove"?.12*pulse:style==="shake"?.07*pulse:0;
  if(record.rig&&!record.action){
   for(const bone of record.animationBones||[]){
    const rest=record.restEuler?.get(bone.uuid);if(!rest)continue;
    const [rx,ry,rz]=[rest.x,rest.y,rest.z],n=bone.name.toLowerCase();
    const left=/left|(?:^|_)l_(?:arm|hand|thigh|calf|leg|shoulder)/.test(n),side=left?1:-1;
    const upperLeg=/(upleg|upperleg|thigh)/.test(n),lowerLeg=/(calf|shin|lowerleg|leg$)/.test(n)&&!upperLeg;
    const forearm=/(forearm|lowerarm)/.test(n),upperArm=/(upperarm|arm$|shoulder)/.test(n)&&!forearm,torso=/spine/.test(n);
    let x=rx,y=ry,z=rz;
    // Copiado do dance-floor.js: mesma passada, balanço de braços e tronco.
    if(walking){
     if(upperLeg)x+=side*.36*stride;
     if(lowerLeg)x+=.15*Math.max(0,-side*stride);
     if(upperArm)x-=side*.26*stride;
     if(forearm)x-=side*.10*stride;
     if(torso)z+=.022*stride;
    }else if(style==="shake"){
     if(upperArm){x+=side*.26*Math.sin(phase*12);z+=side*.22*Math.cos(phase*12);}
     if(forearm)x+=side*.22*Math.sin(phase*12+1);
     if(upperLeg)x+=side*.08*Math.sin(phase*12);
     if(torso){y+=.09*Math.sin(phase*12);z+=.055*Math.cos(phase*12);}
    }
    bone.rotation.set(x,y,z);
   }
  }
 }
 render();
 const dancing=[...avatars.values()].some(r=>(r.dance||"idle")!=="idle"&&!["sitting","lying"].includes(r.pose));
 if(moving||dancing)animationFrame=requestAnimationFrame(animate);else lastFrame=0;
}
function scheduleAnimation(){if(!animationFrame)animationFrame=requestAnimationFrame(animate);}
function init(){
 if(renderer)return;
 scene=new THREE.Scene();
 camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,3000);
 camera.position.set(0,0,1200);camera.lookAt(0,0,0);
 renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:"low-power"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.matchMedia("(max-width:760px)").matches?1:1.25));
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 scene.add(new THREE.HemisphereLight(0xffffff,0x51406b,2.0));
 const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(-120,220,300);scene.add(key);
 const fill=new THREE.DirectionalLight(0x9deaff,.7);fill.position.set(160,-80,180);scene.add(fill);
}
function resize(width,height){
 if(lastSize.width===width&&lastSize.height===height)return;
 lastSize={width,height};renderer.setSize(width,height,false);
 camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
}
function render(){if(renderer)renderer.render(scene,camera);}
function signature(wardrobe){return JSON.stringify(wardrobe||{});}
function removeAvatar(id,record){
 if(record.root)scene.remove(record.root);
 record.dispose?.();
 avatars.delete(id);
}
async function createAvatar(person,scale,record){
 try{
  const avatar=await createDanceAvatar(person.wardrobe||{},"default",()=>{}, {local:!!person.local});
  if(avatars.get(person.id)!==record){avatar.dispose();return;}
  const height=Math.max(44,Math.min(92,68*scale));
  avatar.group.scale.setScalar(height/1.5);
  // Três quartos, como os macacos da pista: evita a leitura de boneco chapado de frente.
  avatar.group.rotation.y=Math.PI/4;
  avatar.group.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;}});
  record.id=person.id;record.root=avatar.group;record.dispose=avatar.dispose;record.rig=avatar.rig;record.experimentalRig=Boolean(avatar.experimentalUsed);
  record.restBones=new Map();record.restWorldBones=new Map();record.restEuler=new Map();record.animationBones=[];
  avatar.rig?.updateMatrixWorld(true);
  avatar.rig?.traverse?.(bone=>{if(bone.isBone){record.restBones.set(bone.uuid,bone.quaternion.clone());record.restWorldBones.set(bone.uuid,bone.getWorldQuaternion(new THREE.Quaternion()));record.restEuler.set(bone.uuid,bone.rotation.clone());record.animationBones.push(bone);}});
  record.legs=[];
  avatar.rig?.traverse?.(bone=>{
   if(!bone.isBone)return;
   const name=bone.name.toLowerCase();
   if(/(left|right).*(upleg|thigh|leg)$/.test(name)||/(upleg|thigh|leg).*(left|right)/.test(name)){
    bone.userData.jfRoomBaseX=bone.rotation.x;record.legs.push(bone);
   }
  });
  record.root.position.set((record.gridX-record.gridY)*record.tileX,
   record.baseY-(record.gridX+record.gridY)*record.tileY,2);
  scene.add(record.root);scheduleAnimation();
 }catch(error){console.warn("Quartos: não foi possível montar o traje 3D de "+(person.name||"visitante"),error);}
}
function update(payload){
 if(!payload||!Number.isFinite(payload.width)||!Number.isFinite(payload.height))return;
 init();resize(payload.width,payload.height);
 const visible=new Set((payload.avatars||[]).map(p=>p.id));
 void syncFurniture(payload.items||[],payload.width,payload.height,payload.scale||1);
 for(const [id,record] of avatars)if(!visible.has(id))removeAvatar(id,record);
 for(const p of payload.avatars||[]){
  const key=signature(p.wardrobe),old=avatars.get(p.id);
  let record=old;
  if(!record||record.signature!==key){
   if(record)removeAvatar(p.id,record);
   record={signature:key,root:null,dispose:null,target:null,gridX:p.gridX??0,gridY:p.gridY??0,gridTarget:{x:p.gridX??0,y:p.gridY??0},tileX:32*(payload.scale||1),tileY:16*(payload.scale||1),baseY:0,pose:"standing",dance:"idle",walking:false,legs:[]};avatars.set(p.id,record);
   void createAvatar(p,payload.scale||1,record);
  }
  const avatarHeight=Math.max(44,Math.min(92,68*(payload.scale||1)));
  record.gridTarget={x:p.gridX??0,y:p.gridY??0};
  record.tileX=32*(payload.scale||1);record.tileY=16*(payload.scale||1);
  record.baseY=payload.height/2-(p.y-(p.gridX+p.gridY)*16*(payload.scale||1))-avatarHeight/2;
  if(!record.root){record.gridX=record.gridTarget.x;record.gridY=record.gridTarget.y;}
  record.pose=p.pose||"standing";
  record.dance=p.dance||"idle";
  if(record.root){
   const style=record.walking||record.pose==="sitting"||record.pose==="lying"?"idle":record.dance;
   switchClubDance(record,style);
   const height=Math.max(44,Math.min(92,68*(payload.scale||1)));
   record.root.scale.setScalar(height/1.5);
   if(!record.walking&&record.lastPose!==record.pose)bonePose(record,record.pose,performance.now());
  }
 }
 render();scheduleAnimation();
}
window.JFQuartos3D={update};
window.dispatchEvent(new Event("jf-quartos-3d-ready"));
