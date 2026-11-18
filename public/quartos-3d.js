import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {FBXLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js";

import {createDanceAvatar} from "/wardrobe.js?v=arena-fit-12";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,lastSize={width:0,height:0};
const avatars=new Map();
let previewRoot=null,previewKey="",previewPendingKey="";

const furniture=new Map(), furnitureLoader=new GLTFLoader(), furnitureAssets=new Map();
const KENNEY_CC0="https://raw.githubusercontent.com/0auBSQ/OpenTaiko/50b190a2303742202dc9cb44d946a524da2d4fff/OpenTaiko/Global/Modules/Stages/my_room/Models/";
const ASSET_PATHS={chair:KENNEY_CC0+"chair.glb",table:KENNEY_CC0+"table.glb",sofa:KENNEY_CC0+"sofa.glb",bed:KENNEY_CC0+"bed.glb",shelf:KENNEY_CC0+"bookshelf.glb",plant:KENNEY_CC0+"plant.glb",lamp:KENNEY_CC0+"floorlamp.glb",tv:KENNEY_CC0+"tv.glb",arcade:KENNEY_CC0+"arcade.glb",banana:"/club/bananasims_otimizada.glb"};
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.88});
function block(g,w,h,d,color,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);g.add(m);}
function fallbackFurniture(type,color,w,h){
 const g=new THREE.Group(),wood="#8b6047",fabric=color||"#c96c4d",depth=.30;
 if(type==="sofa"){
  block(g,w*.92,.22,depth,fabric,0,.13,0);block(g,w*.92,.48,depth*.72,fabric,0,.46,-.07);
  block(g,.12,.52,depth,wood,-w*.43,.27,0);block(g,.12,.52,depth,wood,w*.43,.27,0);
 }else if(type==="bed"){
  block(g,w,.18,depth*1.8,wood,0,.09,0);block(g,w*.94,.17,depth*1.7,"#eee1c4",0,.25,0);
  block(g,w,.34,.08,wood,0,.25,-depth*.82);
 }else if(type==="tv"){
  block(g,w,.12,.30,wood,0,.06,0);block(g,w*.88,h*.72,.12,"#202632",0,h*.56,0);
  block(g,w*.72,h*.54,.012,"#8ad9d5",0,h*.56,.07);
 }else if(type==="arcade"){
  block(g,w*.76,h*.72,.38,"#302b48",0,h*.36,0);
  block(g,w*.68,h*.42,.035,"#151827",0,h*.58,.205);
  block(g,w*.62,.09,.16,"#8b4eaa",0,h*.31,.22);
  block(g,.045,.06,.045,"#f04f9b",-w*.19,h*.31,.32);
  block(g,.045,.06,.045,"#53e5ef",-w*.08,h*.31,.32);
  block(g,.045,.06,.045,"#f4d36b",w*.08,h*.31,.32);
  block(g,.045,.06,.045,"#53e5ef",w*.19,h*.31,.32);
  block(g,w*.9,.12,.46,"#201d32",0,.06,0);
 }else if(type==="shelf"){
  block(g,w*.9,h,.18,wood,0,h/2,0);
  for(let y=.18;y<h;y+=.22)block(g,w*.84,.035,.2,"#d5b68a",0,y,.04);
 }else if(type==="rug"){
  block(g,w,.025,depth*1.8,fabric,0,.015,0);
 }else if(type==="plant"||type==="banana"){
  block(g,w*.42,.22,.24,"#a96f4b",0,.11,0);
  for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.12,7,5),material(i%2?"#5d9b58":"#78b96c"));leaf.scale.set(.65,1.35,.45);leaf.position.set(Math.cos(i*1.25)*.10,.38+Math.sin(i*1.25)*.07,0);g.add(leaf);}
 }else if(type==="lamp"){
  block(g,.06,h*.7,.06,"#b6a17a",0,h*.35,0);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.17,.22,8),material("#f4d88c"));shade.position.y=h*.78;g.add(shade);
 }else if(type==="speaker"){
  block(g,w*.7,h,.24,"#30343c",0,h/2,0);
 }else{
  block(g,w*.8,.25,.28,fabric,0,.13,0);
 }
 return g;
}
function loadFurniture(type){if(!ASSET_PATHS[type])return Promise.resolve(null);if(!furnitureAssets.has(type))furnitureAssets.set(type,furnitureLoader.loadAsync(ASSET_PATHS[type]).then(g=>g.scene).catch(e=>{console.warn("Móvel CC0 indisponível:",type,e);return null;}));return furnitureAssets.get(type);}
function clearFurniture(id){const r=furniture.get(id);if(r){scene.remove(r.root);furniture.delete(id);}}
async function syncFurniture(items,layout){
 const wanted=new Set((items||[]).map(i=>i.id));
 for(const id of furniture.keys())if(!wanted.has(id))clearFurniture(id);
 const tile=.55;
 for(const item of items||[]){
  const key=JSON.stringify([item.type,item.x,item.y,item.rotation,item.color]);
  let rec=furniture.get(item.id);if(rec?.key===key)continue;if(rec)clearFurniture(item.id);
  const dims={sofa:[2,1],chair:[1,1],table:[2,1],bed:[2,3],shelf:[2,1],plant:[1,1],lamp:[1,1],tv:[2,1],rug:[3,3],speaker:[1,1],arcade:[1,1],banana:[1,1]}[item.type]||[1,1];
  const fw=item.rotation%2?dims[1]:dims[0],fh=item.rotation%2?dims[0]:dims[1];
  const width=fw*tile*.88,height=({sofa:.78,chair:.82,table:.55,bed:.48,shelf:1.22,plant:.82,lamp:1.3,tv:.92,rug:.035,arcade:1.2,speaker:.82,banana:.8}[item.type]||.8);
  const root=new THREE.Group();
  root.position.set((item.x+fw/2-5)*tile,0,(item.y+fh/2-5)*tile);
  const token={key,root,pending:true};furniture.set(item.id,token);
  const source=await loadFurniture(item.type);
  if(furniture.get(item.id)!==token)continue;
  const object=source?source.clone(true):fallbackFurniture(item.type,item.color,width,height);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const fit=Math.min(width/Math.max(size.x,.001),height/Math.max(size.y,.001),fw*tile*.92/Math.max(size.z,.001));
  object.scale.setScalar(fit);object.position.sub(center.multiplyScalar(fit));object.position.y+=height*.5;
  if(item.rotation)object.rotation.y=item.rotation*Math.PI/2;
  object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  root.add(object);scene.add(root);token.pending=false;
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
 let moving=false;const tile=.55;
 for(const record of avatars.values()){
  if(!record.root||!record.gridTarget)continue;
  const target=record.gridTarget,dx=target.x-record.gridX,dz=target.y-record.gridY,distance=Math.hypot(dx,dz);
  record.mixer?.update(dt);
  const walking=distance>.025;record.walking=walking;
  switchClubDance(record,(record.pose==="sitting"||record.pose==="lying")?"idle":walking?"idle":record.dance||"idle");
  if(walking){
   const step=Math.min(1.35*dt,distance);record.gridX+=dx/distance*step;record.gridY+=dz/distance*step;
   const heading=Math.atan2(dx,dz),diff=Math.atan2(Math.sin(heading-record.root.rotation.y),Math.cos(heading-record.root.rotation.y));
   record.root.rotation.y+=Math.max(-dt*4,Math.min(dt*4,diff));moving=true;
  }else{
   record.gridX=target.x;record.gridY=target.y;
   const diff=Math.atan2(Math.sin(.65-record.root.rotation.y),Math.cos(.65-record.root.rotation.y));
   record.root.rotation.y+=diff*Math.min(1,dt*1.6);
  }
  record.walkTime=(record.walkTime||0)+(walking?dt*7.8:0);
  const style=record.dance||"idle",phase=now*.002,pulse=Math.sin(phase),bounce=Math.abs(pulse);
  record.root.position.set((record.gridX-5)*tile,.60+(walking?.018*Math.abs(Math.sin(record.walkTime)):style==="idle"?.006*pulse:.025*bounce),(record.gridY-5)*tile);
  record.root.rotation.x=record.pose==="sitting"?-.12:0;
  record.root.rotation.z=walking?0:style==="capoeira"?.14*pulse:style==="groove"?.12*pulse:style==="shake"?.07*pulse:0;
  if(record.rig&&!record.action){
   if(walking)bonePose(record,"walking",now);
   else if(style!=="idle")bonePose(record,style,now);
   else for(const bone of record.animationBones||[]){const rest=record.restEuler?.get(bone.uuid);if(rest)bone.rotation.copy(rest);}
  }
 }
 render();
 const dancing=[...avatars.values()].some(r=>(r.dance||"idle")!=="idle"&&!["sitting","lying"].includes(r.pose));
 if(moving||dancing)animationFrame=requestAnimationFrame(animate);else lastFrame=0;
}
function scheduleAnimation(){if(!animationFrame)animationFrame=requestAnimationFrame(animate);}
function init(){
 if(renderer)return;
 scene=new THREE.Scene();scene.background=new THREE.Color(0x20233b);
 camera=new THREE.OrthographicCamera(-4.25,4.25,4.25,-4.25,.1,100);
 camera.position.set(9,12,9);camera.lookAt(0,.9,0);
 renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:"low-power"});
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.matchMedia("(max-width:760px)").matches?1:1.25));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x20233b,1);
 scene.add(new THREE.HemisphereLight(0xf4e8ff,0x51405b,2.0));
 const key=new THREE.DirectionalLight(0xffe6c7,2.2);key.position.set(-4,9,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
 const fill=new THREE.DirectionalLight(0x9deaff,.7);fill.position.set(5,5,-5);scene.add(fill);
 const room=new THREE.Group();room.name="junto-room-shell";scene.add(room);scene.userData.room=room;
 const floor=new THREE.Group();room.add(floor);scene.userData.floorTiles=[];
 const tile=.55;
 for(let x=0;x<12;x++)for(let z=0;z<12;z++){
  const mat=new THREE.MeshStandardMaterial({color:(x+z)%2?0xc8ad8a:0xd7bd98,roughness:.94});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(tile-.012,.045,tile-.012),mat);
  mesh.position.set((x-5.5)*tile,-.025,(z-5.5)*tile);mesh.receiveShadow=true;floor.add(mesh);scene.userData.floorTiles.push(mesh);
 }
 const wallMat=new THREE.MeshStandardMaterial({color:0x8caaa5,roughness:.9});
 const back=new THREE.Mesh(new THREE.BoxGeometry(6.72,3.25,.10),wallMat);back.position.set(0,1.62,-3.33);back.receiveShadow=true;room.add(back);
 const left=new THREE.Mesh(new THREE.BoxGeometry(.10,3.25,6.72),wallMat);left.position.set(-3.33,1.62,0);left.receiveShadow=true;room.add(left);
 const trimMat=new THREE.MeshStandardMaterial({color:0xd5c8a7,roughness:.7});
 const trimBack=new THREE.Mesh(new THREE.BoxGeometry(6.72,.07,.13),trimMat);trimBack.position.set(0,.08,-3.27);room.add(trimBack);
 const trimLeft=new THREE.Mesh(new THREE.BoxGeometry(.13,.07,6.72),trimMat);trimLeft.position.set(-3.27,.08,0);room.add(trimLeft);
 const ceilingGlow=new THREE.PointLight(0xffd9a0,.7,8);ceilingGlow.position.set(0,2.8,0);room.add(ceilingGlow);
}
function resize(width,height){
 if(lastSize.width===width&&lastSize.height===height)return;
 lastSize={width,height};renderer.setSize(width,height,false);
 const aspect=width/Math.max(1,height),halfH=3.5;
 camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
}
async function syncPreview(preview){
 if(!preview){if(previewRoot){scene.remove(previewRoot);previewRoot=null;}previewKey="";return;}
 const key=JSON.stringify(preview);
 if(key===previewKey&&(previewRoot||previewPendingKey===key))return;
 previewKey=key;previewPendingKey=key;
 if(previewRoot){scene.remove(previewRoot);previewRoot=null;}
 const t={sofa:[2,1],chair:[1,1],table:[2,1],bed:[2,3],shelf:[2,1],plant:[1,1],lamp:[1,1],tv:[2,1],rug:[3,3],speaker:[1,1],arcade:[1,1],banana:[1,1]}[preview.type]||[1,1];
 const fw=preview.rotation%2?t[1]:t[0],fh=preview.rotation%2?t[0]:t[1],tile=.55;
 const width=fw*tile*.88,height=({sofa:.78,chair:.82,table:.55,bed:.48,shelf:1.22,plant:.82,lamp:1.3,tv:.92,rug:.035,arcade:1.2,speaker:.82,banana:.8}[preview.type]||.8);
 const source=await loadFurniture(preview.type);
 if(previewKey!==key)return;previewPendingKey="";
 const root=new THREE.Group();root.position.set((preview.x+fw/2-5)*tile,.012,(preview.y+fh/2-5)*tile);
 const object=source?source.clone(true):fallbackFurniture(preview.type,"#75e5d5",width,height);
 const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const fit=Math.min(width/Math.max(size.x,.001),height/Math.max(size.y,.001),fw*tile*.92/Math.max(size.z,.001));
 object.scale.setScalar(fit);object.position.sub(center.multiplyScalar(fit));object.position.y+=height*.5;
 object.rotation.y=preview.rotation*Math.PI/2;
 object.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.transparent=true;m.opacity=.48;m.depthWrite=false;m.color.set(preview.valid?"#8bfff0":"#ff555f");}}});
 root.add(object);scene.add(root);previewRoot=root;render();
}
function updateRoomStyle(floorColor,wallColor){
 const floor=new THREE.Color(floorColor||"#c9ad85"),wall=new THREE.Color(wallColor||"#8caaa5");
 for(const mesh of scene.userData.floorTiles||[])mesh.material.color.copy(floor).multiplyScalar(mesh.position.x*mesh.position.z>0?1:.96);
 for(const mesh of scene.userData.room?.children||[]){
  if(mesh.geometry?.type==="BoxGeometry"&&mesh.position.y>1&&mesh.material?.color)mesh.material.color.copy(wall);
 }
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
  avatar.group.scale.setScalar(.78);
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
  record.root.position.set((record.gridX-5)*.55,.60,(record.gridY-5)*.55);
  scene.add(record.root);scheduleAnimation();
 }catch(error){console.warn("Quartos: não foi possível montar o traje 3D de "+(person.name||"visitante"),error);}
}
function update(payload){
 if(!payload||!Number.isFinite(payload.width)||!Number.isFinite(payload.height))return;
 init();resize(payload.width,payload.height);
 scene.userData.zoom=Math.max(.7,Math.min(1.8,payload.zoom||1));
 const halfH=3.5/scene.userData.zoom,aspect=payload.width/Math.max(1,payload.height);
 camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
 updateRoomStyle(payload.floor,payload.wall);
 const visible=new Set((payload.avatars||[]).map(p=>p.id));
 void syncFurniture(payload.items||[],payload);
 void syncPreview(payload.preview||null);
 for(const [id,record] of avatars)if(!visible.has(id))removeAvatar(id,record);
 for(const p of payload.avatars||[]){
  const key=signature(p.wardrobe),old=avatars.get(p.id);let record=old;
  if(!record||record.signature!==key){
   if(record)removeAvatar(p.id,record);
   record={signature:key,root:null,dispose:null,gridX:p.gridX??0,gridY:p.gridY??0,gridTarget:{x:p.gridX??0,y:p.gridY??0},pose:"standing",dance:"idle",walking:false,walkTime:0};
   avatars.set(p.id,record);void createAvatar(p,1,record);
  }
  record.gridTarget={x:p.gridX??0,y:p.gridY??0};record.pose=p.pose||"standing";record.dance=p.dance||"idle";
  if(record.root){
   switchClubDance(record,record.walking||record.pose==="sitting"||record.pose==="lying"?"idle":record.dance);
   if(record.lastPose!==record.pose){bonePose(record,record.pose,performance.now());record.lastPose=record.pose;}
  }
 }
 render();scheduleAnimation();
}
window.JFQuartos3D={update};
window.dispatchEvent(new Event("jf-quartos-3d-ready"));
