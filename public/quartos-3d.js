import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {createWardrobeFittedAvatar} from "/wardrobe.js";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,lastSize={width:0,height:0};
const avatars=new Map();
let animationFrame=0,lastFrame=0;
const DANCES=new Set(["idle","shake","macarena","party","capoeira","groove"]);
function boneName(value){return String(value||"").toLowerCase().replace(/mixamorig\d*[:_]?/g,"").replace(/[^a-z0-9]/g,"");}
const animationFiles={
 shake:"/dance/macacochaqualha.glb",
 macarena:"/dance/macacomacarena.glb",
 party:"/dance/macacodanca.glb",
 capoeira:"/dance/macacocapoera.glb",
 groove:"/dance/macacodancagay.glb"
};
const gltfLoader=new GLTFLoader(),clipPromises=new Map(),animationClips=new Map();
const boneKey=name=>String(name).split("/").pop().replace(/^.*[|:]/,"").replace(/^mixamorig\d*/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function loadClip(style){
 if(!animationFiles[style])return Promise.resolve(null);
 if(!clipPromises.has(style)){
  clipPromises.set(style,gltfLoader.loadAsync(animationFiles[style]).then(gltf=>{
   const clip=gltf.animations?.find(c=>c.tracks?.length)||null;
   if(clip)animationClips.set(style,{clip,scene:gltf.scene});
   return clip;
  }).catch(error=>{console.warn("Quartos: animação indisponível",style,error);return null;}));
 }
 return clipPromises.get(style);
}
function buildAnimationAction(record,style){
 const data=animationClips.get(style);if(!record.rig||!data)return null;
 const sourceBones=new Map(),targetBones=new Map();
 data.scene.updateMatrixWorld(true);record.rig.updateMatrixWorld(true);
 data.scene.traverse(obj=>{if(obj.name)sourceBones.set(boneKey(obj.name),obj);});
 record.rig.traverse(obj=>{if(obj.isBone)targetBones.set(boneKey(obj.name),obj);});
 const tracks=[],invSourceRest=new THREE.Quaternion(),sample=new THREE.Quaternion(),corrected=new THREE.Quaternion(),reference=new THREE.Quaternion();
 for(const track of data.clip.tracks){
  const dot=track.name.lastIndexOf(".");if(dot<0||track.name.slice(dot+1)!=="quaternion")continue;
  const key=boneKey(track.name.slice(0,dot)),source=sourceBones.get(key),target=targetBones.get(key);
  if(!source||!target)continue;
  const rest=record.restQuaternion?.get(target.uuid)||target.quaternion.clone();
  const baseline=source.quaternion.clone();invSourceRest.copy(baseline).invert();
  const values=new Float32Array(track.values.length);
  for(let i=0;i<track.values.length;i+=4){
   sample.fromArray(track.values,i);corrected.copy(invSourceRest).multiply(sample).premultiply(rest).normalize();
   if(i>0){reference.fromArray(values,i-4);if(reference.dot(corrected)<0)corrected.set(-corrected.x,-corrected.y,-corrected.z,-corrected.w);}
   corrected.toArray(values,i);
  }
  tracks.push(new THREE.QuaternionKeyframeTrack(target.name+".quaternion",track.times.slice(),values));
 }
 if(tracks.length<5)return null;
 record.mixer ||=new THREE.AnimationMixer(record.rig);
 const clip=new THREE.AnimationClip("quarto-"+style,data.clip.duration,tracks);
 const action=record.mixer.clipAction(clip);action.setLoop(THREE.LoopRepeat,Infinity);return action;
}
function switchDance(record,style){
 if(record.currentDance===style)return;
 record.action?.fadeOut(.24);record.action=null;record.currentDance=style;
 if(style==="idle"||!animationClips.has(style))return;
 const action=buildAnimationAction(record,style);
 if(action){action.reset().fadeIn(.24).play();record.action=action;}
}
function animate(now){
 animationFrame=0;
 const dt=Math.min(.065,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
 let keepAnimating=false;
 for(const record of avatars.values()){
  if(!record.root||!record.target||!record.rig)continue;
  const logical=record.logical||(record.logical={x:record.root.position.x,z:record.root.position.z});
  const target=record.target,dx=target.x-logical.x,dz=target.z-logical.z,distance=Math.hypot(dx,dz);
  const walking=distance>.035;
  const sitting=!walking&&record.pose==="sitting",lying=!walking&&record.pose==="lying";
  const style=walking||sitting||lying?"idle":(DANCES.has(record.dance)?record.dance:"idle");
  if(walking){
   const step=Math.min(distance,1.35*dt);
   logical.x+=dx/distance*step;logical.z+=dz/distance*step;
   const heading=Math.atan2(dx,dz);
   const diff=Math.atan2(Math.sin(heading-record.root.rotation.y),Math.cos(heading-record.root.rotation.y));
   record.root.rotation.y+=Math.max(-dt*4,Math.min(dt*4,diff));
   record.walkTime=(record.walkTime||0)+dt*7.8;keepAnimating=true;
  }else{logical.x=target.x;logical.z=target.z;}
  switchDance(record,style);record.mixer?.update(dt);
  const phase=now/1000*({shake:12,macarena:4.8,party:7.2,capoeira:5.6,groove:5.1}[style]||2);
  const pulse=Math.sin(phase),stride=Math.sin(record.walkTime||0);
  const bob=walking?Math.abs(stride)*.045:sitting?.012*Math.sin(now/1000*2):lying?0:style==="idle"?.008*Math.sin(now/1000*2):Math.abs(pulse)*.035;
  record.root.position.set(logical.x,bob,logical.z);
  if(!walking&&!lying){
   const targetYaw=record.baseYaw||0;
   record.root.rotation.y+=Math.atan2(Math.sin(targetYaw-record.root.rotation.y),Math.cos(targetYaw-record.root.rotation.y))*Math.min(1,dt*1.6);
  }
  record.root.rotation.z=lying?1.25:0;
  record.root.rotation.x=sitting?-.12:!walking&&style==="capoeira"?.14*pulse:!walking&&style==="groove"?.12*pulse:!walking&&style==="shake"?.07*pulse:0;
  if(!record.action)for(const bone of record.animationBones){
   const base=record.rest.get(bone.uuid);if(!base)continue;
   const n=boneName(bone.name),left=/left|^l(?:arm|hand|thigh|calf|leg)/.test(n),side=left?1:-1;
   const upperLeg=/(upleg|upperleg|thigh)/.test(n),lowerLeg=/(calf|shin|lowerleg|leg$)/.test(n)&&!upperLeg;
   const forearm=/(forearm|lowerarm)/.test(n),upperArm=/(upperarm|arm$|shoulder)/.test(n)&&!forearm,torso=/spine/.test(n);
   let x=base.x,y=base.y,z=base.z;
   if(sitting){if(upperLeg)x-=.88;if(lowerLeg)x+=1.02;if(upperArm)x-=.12;}
   else if(lying){if(upperLeg)x-=.10;if(lowerLeg)x+=.12;}
   else if(walking){if(upperLeg)x+=side*.36*stride;if(lowerLeg)x+=.15*Math.max(0,-side*stride);if(upperArm)x-=side*.26*stride;if(forearm)x-=side*.10*stride;if(torso)z+=.022*stride;}
   else if(style==="shake"){if(upperArm){x+=side*.26*Math.sin(phase);z+=side*.22*Math.cos(phase);}if(forearm)x+=side*.22*Math.sin(phase+1);if(upperLeg)x+=side*.08*Math.sin(phase);if(torso){y+=.09*Math.sin(phase);z+=.055*Math.cos(phase);}}
   else if(style==="macarena"){const beat=Math.floor(phase/Math.PI*2)%8,reach=beat<2?1:beat<4?.55:beat<6?-.35:-.1;if(upperArm){x+=reach*.65;z+=side*(beat>=2&&beat<4?.8:beat>=4&&beat<6?.35:.08);}if(forearm)x+=(beat>=4&&beat<6?-.65:beat>=6?.65:.12);if(upperLeg)x+=side*.075*Math.sin(phase/2);if(torso)y+=.15*Math.sin(phase/2);}
   else if(style==="party"){if(upperArm){x+=side*.55*Math.sin(phase);z+=side*(.4+.25*Math.cos(phase));}if(forearm)x+=.30+.22*Math.sin(phase+side);if(upperLeg)x+=side*.17*Math.sin(phase);if(torso){y+=.12*Math.sin(phase);z+=.05*Math.cos(phase);}}
   else if(style==="capoeira"){if(upperLeg)x+=side*.24*Math.sin(phase);if(lowerLeg)x+=.12*Math.max(0,side*Math.sin(phase));if(upperArm){x+=-side*.28*Math.sin(phase);z+=side*.28;}if(forearm)x-=.32;if(torso){y+=.14*Math.sin(phase);z+=.11*Math.sin(phase);}}
   else if(style==="groove"){if(upperArm){x+=.25*Math.sin(phase+side);z+=side*(.28+.2*Math.sin(phase));}if(forearm)x+=side*.18*Math.cos(phase);if(upperLeg)x+=side*.13*Math.cos(phase);if(torso){y+=.18*Math.sin(phase);z+=.08*Math.sin(phase/2);}}
   bone.rotation.set(x,y,z);
  }
  record.walking=walking;record.lastPose=walking?"walking":record.pose;
  if(walking||sitting||lying||style!=="idle")keepAnimating=true;
 }
 render();if(keepAnimating)animationFrame=requestAnimationFrame(animate);else lastFrame=0;
}
function scheduleAnimation(){if(!animationFrame)animationFrame=requestAnimationFrame(animate);}
function init(){
 if(renderer)return;
 scene=new THREE.Scene();
 camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1000);
 renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:"low-power"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.matchMedia("(max-width:760px)").matches?1:1.25));
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 scene.add(new THREE.HemisphereLight(0xffffff,0x51406b,2.0));
 const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(-120,220,300);scene.add(key);
 const fill=new THREE.DirectionalLight(0x9deaff,.7);fill.position.set(160,-80,180);scene.add(fill);
}
function resize(width,height,scale=1){
 if(lastSize.width===width&&lastSize.height===height&&lastSize.scale===scale)return;
 lastSize={width,height,scale};renderer.setSize(width,height,false);
 const worldPerPixel=.022097/scale;
 camera.left=-width*worldPerPixel/2;camera.right=width*worldPerPixel/2;
 camera.top=height*worldPerPixel/2;camera.bottom=-height*worldPerPixel/2;
 camera.position.set(12.75,7.35,12.75);camera.lookAt(3.75,0,3.75);camera.updateProjectionMatrix();
}
function screenToGround(x,y,width,height,scale){
 const originY=height/2-120*scale;
 const dx=(x-width/2)/(32*scale),dy=(y-originY)/(16*scale);
 return {x:(dx+dy)/2,z:(dy-dx)/2};
}
function render(){if(renderer)renderer.render(scene,camera);}
function signature(wardrobe){return JSON.stringify(wardrobe||{});}
function removeAvatar(id,record){
 if(record.root)scene.remove(record.root);
 record.mixer?.stopAllAction();record.mixer?.uncacheRoot(record.rig);
 record.dispose?.();
 avatars.delete(id);
}
async function createAvatar(person,scale,record){
 try{
  const avatar=await createWardrobeFittedAvatar(person.wardrobe||{},{local:!!person.local});
  if(avatars.get(person.id)!==record){avatar.dispose();return;}
  avatar.group.scale.setScalar(1.5/1.8);
  avatar.group.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;}});
  record.root=avatar.group;record.dispose=avatar.dispose;record.rig=avatar.rig;
  record.rest=new Map();record.restQuaternion=new Map();record.animationBones=[];
  record.rig?.updateMatrixWorld(true);
  record.rig?.traverse?.(bone=>{
   if(!bone.isBone)return;
   record.animationBones.push(bone);
   record.rest.set(bone.uuid,{x:bone.rotation.x,y:bone.rotation.y,z:bone.rotation.z});
   record.restQuaternion.set(bone.uuid,bone.quaternion.clone());
  });
  if(record.target){record.logical={x:record.target.x,z:record.target.z};record.root.position.copy(record.target);}
  scene.add(record.root);scheduleAnimation();
 }catch(error){console.warn("Quartos: não foi possível montar o traje 3D de "+(person.name||"visitante"),error);}
}
function update(payload){
 if(!payload||!Number.isFinite(payload.width)||!Number.isFinite(payload.height))return;
 init();resize(payload.width,payload.height,payload.scale||1);
 const visible=new Set((payload.avatars||[]).map(p=>p.id));
 for(const [id,record] of avatars)if(!visible.has(id))removeAvatar(id,record);
 for(const p of payload.avatars||[]){
  const key=signature(p.wardrobe),old=avatars.get(p.id);
  let record=old;
  if(!record||record.signature!==key){
   if(record)removeAvatar(p.id,record);
   record={signature:key,root:null,rig:null,dispose:null,target:null,pose:"standing",dance:p.dance||"idle",walking:false,rest:new Map(),animationBones:[],walkTime:0,baseYaw:0,scale:payload.scale||1};avatars.set(p.id,record);
   void createAvatar(p,payload.scale||1,record);
  }
  const ground=screenToGround(p.x,p.y,payload.width,payload.height,payload.scale||1);
  record.target=new THREE.Vector3(ground.x,0,ground.z);
  record.pose=p.pose||"standing";record.dance=p.dance||"idle";record.scale=payload.scale||1;
  if(record.dance!=="idle"&&!animationClips.has(record.dance))void loadClip(record.dance).then(clip=>{
   if(clip&&avatars.get(p.id)===record&&record.dance===p.dance){record.currentDance=null;scheduleAnimation();}
  });
  if(record.root){
   record.root.scale.setScalar(1.5/1.8);
   if(!record.logical)record.logical={x:record.root.position.x,z:record.root.position.z};
  }
 }
 render();scheduleAnimation();
}
window.JFQuartos3D={update};
window.dispatchEvent(new Event("jf-quartos-3d-ready"));
