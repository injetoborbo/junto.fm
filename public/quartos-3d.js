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
const ASSET_PATHS={
 chair:"/club/cadeirabalada.glb",table:"/club/mesabalada.glb",
 sofa:CC0+"Living/ap_sofa.glb",bed:CC0+"Bedroom/ap_bed_double.glb",
 plant:CC0+"Living/ap_plant_small.glb",lamp:CC0+"Living/ap_floor_lamp.glb",
 shelf:CC0+"Bedroom/ap_nightstand.glb",speaker:CC0+"Clutter/ap_book_stack.glb",
 tv:CC0+"Electronics/ap_tv.glb",rug:CC0+"Living/ap_rug.glb",
 arcade:CC0+"Electronics/ap_arcade_machine.glb",
 banana:"/club/bananasims_otimizada.glb"
};
const CLUB_DANCES={shake:"/dance/macacochaqualha.glb",macarena:"/dance/macacomacarena.glb",party:"/dance/macacodanca.glb",capoeira:"/dance/macacocapoera.glb",groove:"/dance/macacodancagay.glb"};
const animationLoader=new GLTFLoader(),clipPromises=new Map(),animationClips=new Map();
const boneKey=name=>String(name).split("/").pop().replace(/^.*[|:]/,"").replace(/^mixamorig\\d*/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function loadDanceClip(style){
 if(!CLUB_DANCES[style])return Promise.resolve(null);
 if(!clipPromises.has(style))clipPromises.set(style,animationLoader.loadAsync(CLUB_DANCES[style]).then(gltf=>{
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
  const baseline=source.quaternion.clone(),inv=baseline.invert(),values=new Float32Array(track.values.length);
  for(let i=0;i<track.values.length;i+=4){
   sample.fromArray(track.values,i);corrected.copy(inv).multiply(sample);
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
 if(style==="idle"||!animationClips.has(style))return;
 const action=buildClubAction(record,style);
 if(action){action.reset().fadeIn(.24).play();record.action=action;}
}
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.88});}
function fallbackFurniture(type,color,w,h){
 const g=new THREE.Group(),wood="#8b6047",fabric=color||"#c96c4d";
 const block=(ww,hh,dd,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(ww,hh,dd),material(c));m.position.set(x,y,z);g.add(m);};
 if(type==="sofa"){block(w*.92,h*.35,24,fabric,0,12,0);block(w*.92,32,24,fabric,0,35,-5);block(14,42,28,wood,-w*.43,22,0);block(14,42,28,wood,w*.43,22,0);}
 else if(type==="bed"){block(w,14,32,wood,0,7,0);block(w*.94,h*.65,28,"#eee1c4",0,25,0);block(w*.94,9,28,fabric,0,38,0);block(w*.94,18,30,wood,0,49,-4);}
 else if(type==="tv"){block(w,12,22,wood,0,6,0);block(w*.9,h*.72,8,"#202632",0,35,0);block(w*.78,h*.55,2,"#8ad9d5",0,35,5);}
 else if(type==="shelf"||type==="arcade"){block(w*.9,8,18,wood,0,4,0);block(w*.9,h,12,wood,0,h/2,0);for(let y=15;y<h;y+=20)block(w*.82,3,16,"#d5b68a",0,y,8);}
 else if(type==="rug"){block(w,2,h,fabric,0,1,0);block(w*.88,1,h*.88,"#d8bd91",0,2,0);}
 else if(type==="plant"||type==="banana"){block(w*.35,15,16,"#a96f4b",0,7,0);for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(12,7,5),material(i%2?"#5d9b58":"#78b96c"));leaf.scale.set(.65,1.35,.45);leaf.position.set(Math.cos(i*1.25)*10,27+Math.sin(i*1.25)*7,0);g.add(leaf);}}
 else if(type==="lamp"){block(4,h*.7,4,"#b6a17a",0,h*.36,0);const shade=new THREE.Mesh(new THREE.ConeGeometry(13,18,8),material("#f4d88c"));shade.position.y=h*.78;g.add(shade);}
 else {block(w*.8,h*.35,18,fabric,0,10,0);block(w*.7,3,20,wood,0,20,0);}
 return g;
}
function loadFurniture(type){
 if(!ASSET_PATHS[type])return Promise.resolve(null);
 if(!furnitureAssets.has(type))furnitureAssets.set(type,furnitureLoader.loadAsync(ASSET_PATHS[type]).then(g=>g.scene).catch(e=>{console.warn("Modelo de móvel indisponível:",type,ASSET_PATHS[type],e);return null;}));
 return furnitureAssets.get(type);
}
function clearFurniture(id){const r=furniture.get(id);if(r){scene.remove(r.root);furniture.delete(id);}}
async function syncFurniture(items,width,height,scale){
 const wanted=new Set((items||[]).map(i=>i.id));for(const id of furniture.keys())if(!wanted.has(id))clearFurniture(id);
 for(const item of items||[]){
  const key=JSON.stringify([item.type,item.x,item.y,item.rotation]);let rec=furniture.get(item.id);
  if(rec?.key===key)continue;if(rec)clearFurniture(item.id);
  const dims={sofa:[2,1],chair:[1,1],table:[2,1],bed:[2,3],shelf:[2,1],plant:[1,1],lamp:[1,1],tv:[2,1],rug:[3,3],speaker:[1,1],arcade:[1,1],banana:[1,1]}[item.type]||[1,1];
  const px=32*scale,py=16*scale,w=(item.rotation%2?dims[1]:dims[0])*px,h=(item.rotation%2?dims[0]:dims[1])*py;
  const root=new THREE.Group();root.position.set((item.x-item.y)*px,height/2-(item.x+item.y)*py,0);
  const token={key,root,pending:true};furniture.set(item.id,token);
  const source=await loadFurniture(item.type);if(furniture.get(item.id)!==token)continue;
  const object=source?source.clone(true):fallbackFurniture(item.type,item.color,w,h);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const targetW=Math.max(16,w*.78),targetH=Math.max(14,h*.95,(item.type==="plant"||item.type==="lamp")?58*scale:0);
  const fit=Math.min(targetW/Math.max(size.x,.001),targetH/Math.max(size.y,.001),1.8);
  object.scale.setScalar(fit);object.position.sub(center.multiplyScalar(fit));object.position.y+=targetH*.48;
  if(item.rotation)object.rotation.y=item.rotation*Math.PI/2;
  object.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});root.add(object);scene.add(root);token.pending=false;
 }
}function bonePose(record,pose,time){
 const bones=record.legs||[];
 for(const b of bones){const side=b.name.toLowerCase().includes("left")?-1:1;let x=0;
  if(pose==="walking")x=Math.sin(time*.012+(side<0?0:Math.PI))*.42;
  else if(pose==="sitting")x=b.name.toLowerCase().includes("leg")&&!b.name.toLowerCase().includes("upper")?1.05:-.95;
  else if(pose==="lying")x=b.name.toLowerCase().includes("leg")?-.15:0;
  b.rotation.x=b.userData.jfRoomBaseX+x;
 }
}

