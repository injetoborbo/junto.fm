import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";

import {createDanceAvatar} from "/wardrobe.js?v=arena-fit-12";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,lastSize={width:0,height:0};
const avatars=new Map();

const furniture=new Map(), furnitureLoader=new GLTFLoader(), furnitureAssets=new Map();
const CC0="https://raw.githubusercontent.com/Vuena/free-apartment-props-cc0/41b06c6223d847d9de6519dd25a493d40e65992d/GLB/";
const ASSET_PATHS={chair:"/club/cadeirabalada.glb",table:"/club/mesabalada.glb",plant:CC0+"Living/ap_plant_small.glb",lamp:CC0+"Living/ap_floor_lamp.glb",shelf:CC0+"Bedroom/ap_nightstand.glb",speaker:CC0+"Clutter/ap_book_stack.glb",banana:"/club/bananasims_otimizada.glb"};
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
  const root=new THREE.Group();root.position.set((item.x-item.y)*px,height/2-(item.x+item.y)*py,0);
  const token={key,root,pending:true};furniture.set(item.id,token);
  const source=await loadFurniture(item.type);
  if(furniture.get(item.id)!==token)continue;
  const object=source?source.clone(true):fallbackFurniture(item.type,item.color,w,h);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const clubHeight=item.type==="chair"?1.16*45*scale:item.type==="table"?.78*45*scale:0;
  const targetW=item.type==="chair"?1.02*45*scale:item.type==="table"?1.42*45*scale:Math.max(16,w*.9);
  const targetH=clubHeight||Math.max(14,h*.95,(item.type==="plant"||item.type==="lamp")?58*scale:0);
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
  const score=clip=>clip.tracks.reduce((n,t)=>n+(t.name.endsWith(".quaternion")&&t.times?.length>2?t.times.length:0),0);
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
 if(style==="idle")return;
 if(!animationClips.has(style)){const loading=style==="sitting"?loadClubSittingClip():loadClubClip(style);loading.then(clip=>{if(clip&&record.currentDance===style&&avatars.get(record.id)===record){record.currentDance="idle";switchClubDance(record,style);scheduleAnimation();}});return;}
 const action=buildClubAction(record,style);
 if(action){action.reset().fadeIn(.24).play();record.action=action;}
}
let animationFrame=0,lastFrame=0;
function bonePose(record,pose,time){
 const stride=Math.sin((record.walkTime||0)),bones=record.animationBones||[];
 for(const bone of bones){
  const rest=record.restEuler?.get(bone.uuid);if(!rest)continue;
  const n=bone.name.toLowerCase(),isLeft=/left|(?:^|_)l_(?:arm|hand|thigh|calf|leg|shoulder)/.test(n),side=isLeft?1:-1;
  const upperLeg=/(upleg|upperleg|thigh)/.test(n),lowerLeg=/(calf|shin|lowerleg|leg$)/.test(n)&&!upperLeg;
  const forearm=/(forearm|lowerarm)/.test(n),upperArm=/(upperarm|arm$|shoulder)/.test(n)&&!forearm,torso=/spine/.test(n);
  let x=rest.x,y=rest.y,z=rest.z;
  if(pose==="walking"){
   if(upperLeg)x+=side*.36*stride;
   if(lowerLeg)x+=.15*Math.max(0,-side*stride);
   if(upperArm)x-=side*.26*stride;
   if(forearm)x-=side*.10*stride;
   if(torso)z+=.022*stride;
  }
  bone.rotation.set(x,y,z);
 }
}
function animate(now){
 animationFrame=0;
 const dt=Math.min(48,now-(lastFrame||now));lastFrame=now;
 let moving=false;
 for(const record of avatars.values()){
  if(!record.root||!record.target)continue;
  const p=record.root.position,t=record.target;
  record.mixer?.update(dt/1000);
  const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
  if(d>.7){
   const step=Math.min(1,dt*.009);
   p.x+=dx*step;p.y+=dy*step;record.walking=true;moving=true;
   if(Math.abs(dx)>Math.abs(dy))record.root.rotation.y=dx<0?-.12:.12;
  }else{
   p.x=t.x;p.y=t.y;
   if(record.walking){record.walking=false;bonePose(record,record.pose||"standing",now);}
  }
  const pose=record.walking?"walking":(record.pose||"standing");
  const danceStyle=record.walking?"idle":pose==="sitting"?"sitting":record.dance||"idle";
  switchClubDance(record,danceStyle);
  record.root.rotation.z=pose==="lying"?-1.25:0;
  if(pose!==record.lastPose||pose==="walking")bonePose(record,pose,now);
  record.lastPose=pose;
  if(record.walking){p.z=2+Math.abs(Math.sin(now*.018))*2;moving=true;}
  else p.z=2;
 }
 render();
 const dancing=[...avatars.values()].some(record=>Boolean(record.action));
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
  avatar.group.rotation.y=.65;
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
  if(record.target)record.root.position.copy(record.target);
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
   record={signature:key,root:null,dispose:null,target:null,pose:"standing",dance:"idle",walking:false,legs:[]};avatars.set(p.id,record);
   void createAvatar(p,payload.scale||1,record);
  }
  record.target=new THREE.Vector3(p.x-payload.width/2,payload.height/2-p.y,2);
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
