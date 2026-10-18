/* Pista de dança 3D isométrica: um único renderer para até oito macacos. */
import * as THREE from "https://esm.sh/three@0.170.0";
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
let active=false,room=null,renderer=null,scene=null,camera=null,board=null,frame=0,sequence=0;
let down=null;
const people=new Map();
const tiles=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const clock=new THREE.Clock();
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
    ctx.fillStyle="#ffffff";ctx.font="bold 32px Trebuchet MS, Arial";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(safe,192,43,352);
    texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    nameMaterialCache.set(safe,texture);
  }
  const material=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true});
  const sprite=new THREE.Sprite(material);sprite.scale.set(1.22,.28,1);sprite.position.y=1.82;
  sprite.renderOrder=200;
  return sprite;
}
function sceneSetup(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0xd9ecfb);
  scene.add(new THREE.HemisphereLight(0xffffff,0x708db7,2.6));
  const sun=new THREE.DirectionalLight(0xffffff,2.6);sun.position.set(-4,11,8);scene.add(sun);
  const ambient=new THREE.DirectionalLight(0xffb5ec,1.2);ambient.position.set(4,6,-3);scene.add(ambient);
  board=new THREE.Group();scene.add(board);
  const tileGeo=new THREE.BoxGeometry(.94,.24,.94);
  const materials=[new THREE.MeshStandardMaterial({color:0xf4f0fc,roughness:.77}),new THREE.MeshStandardMaterial({color:0xc4d8f2,roughness:.77})];
  for(let x=0;x<6;x++)for(let z=0;z<6;z++){
    const mesh=new THREE.Mesh(tileGeo,materials[(x+z)%2]);
    mesh.position.set(x-2.5,-.17,z-2.5);mesh.userData.tile={x,z};mesh.receiveShadow=true;board.add(mesh);tiles.push(mesh);
  }
  const wallMat=new THREE.MeshStandardMaterial({color:0x7a9cc7,roughness:.83});
  const back=new THREE.Mesh(new THREE.BoxGeometry(6.65,2.15,.14),wallMat);back.position.set(0,.9,-3.12);scene.add(back);
  const side=new THREE.Mesh(new THREE.BoxGeometry(.14,2.15,6.65),wallMat);side.position.set(-3.12,.9,0);scene.add(side);
  for(const [x,z] of [[-2.7,-2.7],[2.7,-2.7],[-2.7,2.7],[2.7,2.7]]){
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.11,12,10),new THREE.MeshBasicMaterial({color:0xffd577}));
    lamp.position.set(x,1.83,z);scene.add(lamp);
  }
  camera=new THREE.OrthographicCamera(-6.35,6.35,4.25,-4.25,.1,100);
  camera.position.set(9,12,9);camera.lookAt(0,.45,0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));
  viewport.replaceChildren(renderer.domElement);
  const resize=()=>{
    if(!renderer||!active)return;
    const width=Math.max(300,viewport.clientWidth),height=Math.max(280,viewport.clientHeight);
    renderer.setSize(width,height,false);
    const aspect=width/height,halfH=4.3;
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
    const avatar=await createDanceAvatar(profile.wardrobe,currentSkin(id),()=>{});
    if(!active||generation!==sequence||people.get(id)!==entry){avatar.dispose();return;}
    entry.root=avatar.group;entry.rig=avatar.rig;entry.dispose=avatar.dispose;
    entry.root.rotation.y=.65;
    const tag=nameSprite(profile.name);
    entry.root.add(tag);entry.name=tag;
    scene.add(entry.root);
  }catch(error){console.warn("Falha no avatar da pista:",error);if(people.get(id)===entry)people.delete(id);}
}
function removeMember(id){
  const member=people.get(id);if(!member)return;
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
  const time=clock.getElapsedTime();
  for(const [id,p] of people){
    if(!p.root)continue;
    const d=p.data,style=d.dance||"idle";
    const targetX=d.x-2.5,targetZ=d.z-2.5;
    p.root.position.x+= (targetX-p.root.position.x)*.16;
    p.root.position.z+= (targetZ-p.root.position.z)*.16;
    const phase=time*(style==="disco"?6.4:style==="swing"?4.3:style==="bounce"?7.5:2.0);
    p.root.position.y=.77+(style==="idle"?.015*Math.sin(phase):.085*Math.abs(Math.sin(phase)));
    p.root.rotation.z=style==="swing"?.10*Math.sin(phase):style==="disco"?.06*Math.sin(phase):0;
    p.root.rotation.y=.65+(style==="disco"?.20*Math.sin(phase*.5):style==="swing"?.12*Math.sin(phase):0);
    // Dança simples usando ossos, sem substituir a rigagem Mixamo do macaco.
    if(p.rig){
      p.rig.traverse(obj=>{
        if(!obj.isBone)return;
        if(!obj.userData.jfDanceRest)obj.userData.jfDanceRest=[obj.rotation.x,obj.rotation.y,obj.rotation.z];
        const [rx,ry,rz]=obj.userData.jfDanceRest;
        const n=obj.name.toLowerCase();
        let arm=0,leg=0,torso=0;
        if(/(leftarm|rightarm|leftshoulder|rightshoulder)/.test(n))arm=n.includes("left")?1:-1;
        if(/(leftupleg|rightupleg|leftleg|rightleg)/.test(n))leg=n.includes("left")?1:-1;
        if(/spine/.test(n))torso=1;
        obj.rotation.set(rx+arm*(style==="disco"?.18*Math.sin(phase):style==="swing"?.23*Math.sin(phase):0),
          ry+torso*(style==="idle"?0:.11*Math.sin(phase)),rz+arm*(style==="idle"?0:.13*Math.cos(phase))+leg*(style==="bounce"?.06*Math.sin(phase):0));
      });
    }
  }
  renderer.render(scene,camera);
}
function setStatus(message){status.textContent=message;}
function open(){
  room=bridge?.getRoom();
  if(!room){setStatus("Entre em uma sala para usar a pista.");return;}
  if(active)return;
  active=true;sequence++;people.clear();
  modal.hidden=false;
  document.body.style.overflow="hidden";
  try{sceneSetup();clock.start();animate();socket.emit("dance-enter");setStatus("Entrando na pista...");}
  catch(error){console.error(error);setStatus("Não foi possível abrir a pista 3D.");close();}
}
function close(){
  if(!active)return;
  const oldRoom=room;active=false;room=null;sequence++;
  cancelAnimationFrame(frame);
  socket.emit("dance-exit");
  for(const id of [...people.keys()])removeMember(id);
  scene?.userData.cleanup?.();
  renderer?.dispose();renderer?.domElement.remove();
  for(const t of nameMaterialCache.values())t.dispose();nameMaterialCache.clear();
  scene=null;camera=null;renderer=null;board=null;tiles.length=0;
  modal.hidden=true;
  if(!document.querySelector(".jf-modal-backdrop:not([hidden])"))document.body.style.overflow="";
  if(oldRoom)setStatus("Saiu da pista.");
}
openButton?.addEventListener("click",open);
closeButton?.addEventListener("click",close);
modal?.addEventListener("click",e=>{if(e.target===modal)close();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&active)close();});
for(const button of choices)button.addEventListener("click",()=>{if(!active)return;socket.emit("dance-style",{dance:button.dataset.jfDance});});
viewport?.addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY};});
viewport?.addEventListener("pointerup",e=>{
  if(!active||!renderer||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;
  down=null;
  const bounds=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(tiles)[0];
  if(hit)socket.emit("dance-move",hit.object.userData.tile);
});
socket?.on("dance-state",({room:joinedRoom,participants=[]})=>{
  if(!active||joinedRoom!==room)return;
  for(const entry of participants)putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  setStatus("Clique num quadrado para andar. Escolha uma dança abaixo!");
  updateChoices();
});
socket?.on("dance-updated",entry=>{
  if(!active||!entry?.id)return;
  putMember(entry.id,entry);
  count.textContent=people.size+"/8 macacos";
  if(entry.id===socket.id)updateChoices();
});
socket?.on("dance-left",({id})=>{if(active)removeMember(id);});
socket?.on("dance-error",({message})=>{if(active)setStatus(message||"Não foi possível mover.");});
socket?.on("room-kicked",close);
socket?.on("left-room",close);
socket?.on("disconnect",close);
window.addEventListener("jf-dance-room-left",close);
