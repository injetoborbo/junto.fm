import * as THREE from "https://esm.sh/three@0.170.0";
import {createWardrobeFittedAvatar} from "/wardrobe.js";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,lastSize={width:0,height:0};
const avatars=new Map();
let animationFrame=0,lastFrame=0;
function bonePose(record,pose,time){
 const bones=record.legs||[];
 for(const b of bones){
  const side=b.name.toLowerCase().includes("left")?-1:1;
  let x=0;
  if(pose==="walking")x=Math.sin(time*.012+(side<0?0:Math.PI))*.42;
  else if(pose==="sitting")x=b.name.toLowerCase().includes("leg")&&!b.name.toLowerCase().includes("upper")?1.05:-.95;
  else if(pose==="lying")x=b.name.toLowerCase().includes("leg")?-.15:0;
  b.rotation.x=b.userData.jfRoomBaseX+x;
 }
}
function animate(now){
 animationFrame=0;
 const dt=Math.min(48,now-(lastFrame||now));lastFrame=now;
 let moving=false;
 for(const record of avatars.values()){
  if(!record.root||!record.target)continue;
  const p=record.root.position,t=record.target;
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
  if(pose!==record.lastPose||pose==="walking")bonePose(record,pose,now);
  record.lastPose=pose;
  if(record.walking){p.z=2+Math.abs(Math.sin(now*.018))*2;moving=true;}
  else p.z=2;
 }
 render();
 if(moving)animationFrame=requestAnimationFrame(animate);else lastFrame=0;
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
  const avatar=await createWardrobeFittedAvatar(person.wardrobe||{},{local:!!person.local});
  if(avatars.get(person.id)!==record){avatar.dispose();return;}
  const height=Math.max(44,Math.min(92,68*scale));
  avatar.group.scale.setScalar(height/1.8);
  avatar.group.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;}});
  record.root=avatar.group;record.dispose=avatar.dispose;
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
 for(const [id,record] of avatars)if(!visible.has(id))removeAvatar(id,record);
 for(const p of payload.avatars||[]){
  const key=signature(p.wardrobe),old=avatars.get(p.id);
  let record=old;
  if(!record||record.signature!==key){
   if(record)removeAvatar(p.id,record);
   record={signature:key,root:null,dispose:null,target:null,pose:"standing",walking:false,legs:[]};avatars.set(p.id,record);
   void createAvatar(p,payload.scale||1,record);
  }
  record.target=new THREE.Vector3(p.x-payload.width/2,payload.height/2-p.y,2);
  record.pose=p.pose||"standing";
  if(record.root){
   const height=Math.max(44,Math.min(92,68*(payload.scale||1)));
   record.root.scale.setScalar(height/1.8);
   if(!record.walking&&record.lastPose!==record.pose)bonePose(record,record.pose,performance.now());
  }
 }
 render();scheduleAnimation();
}
window.JFQuartos3D={update};
window.dispatchEvent(new Event("jf-quartos-3d-ready"));
