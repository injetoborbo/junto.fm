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
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xb3d7e9);
  scene.fog=new THREE.Fog(0xb3d7e9,16,32);
  scene.add(new THREE.HemisphereLight(0xfff8ec,0x5b75a3,2.35));
  const sunlight=new THREE.DirectionalLight(0xfff4d9,2.5);sunlight.position.set(2,10,8);scene.add(sunlight);
  const pinkLight=new THREE.PointLight(0xff70bd,25,12);pinkLight.position.set(-1,3,0);scene.add(pinkLight);
  const blueLight=new THREE.PointLight(0x65bbff,25,12);blueLight.position.set(2,3,-2);scene.add(blueLight);
  const mat=(color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const surface=mat(0xd6e7f1),edge=mat(0x638db2),wall=mat(0xa9c6d9);
  const gold=mat(0xffd477,.6,.27),wood=mat(0x9873a8),glass=mat(0x95d7ed,.22,.15);
  const mesh=(geo,material,x,y,z,parent=scene)=>{
    const object=new THREE.Mesh(geo,material);object.position.set(x,y,z);parent.add(object);return object;
  };
  const cube=(w,h,d,material,x,y,z,parent=scene)=>mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent);
  board=new THREE.Group();scene.add(board);
  cube(6.65,.26,6.65,edge,0,-.34,0,board);
  const tileGeo=new THREE.BoxGeometry(.982,.09,.982);
  const tilesMats=[mat(0xffe0ef,.08,.28),mat(0xc6e4f9,.08,.3),mat(0xd8d1ff,.08,.32),mat(0xfff1d4,.08,.32)];
  for(let x=0;x<6;x++)for(let z=0;z<6;z++){
    const tile=new THREE.Mesh(tileGeo,tilesMats[(x+z)%4]);
    tile.position.set(x-2.5,-.13,z-2.5);tile.userData.tile={x,z};
    board.add(tile);tiles.push(tile);
    cube(.91,.025,.91,mat((x+z)%2===0?0xffffff:0xc9eaf8,.1,.5),x-2.5,-.075,z-2.5,board);
  }
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
    const glow=new THREE.PointLight(x<0?0xff88ce:0x88e7ff,5,3.5);glow.position.set(x,1.55,z);scene.add(glow);
  }
  // Globo espelhado em pequenos quadrados, sem partículas pesadas.
  const disco=new THREE.Group();disco.position.set(-1.5,2.25,-1.5);
  disco.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.31,2),mat(0xe9f5fd,.92,.11)));
  const mirror=mat(0xffffff,.85,.1);
  for(let j=0;j<18;j++){
    const a=j*Math.PI*2/18;
    const facet=cube(.12,.1,.025,mirror,Math.cos(a)*.31,Math.sin(a)*.25,Math.sin(a*2)*.11,disco);
    facet.rotation.z=a;
  }
  scene.add(disco);scene.userData.disco=disco;
  // Faixa decorativa com nome do club.
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=160;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#344e89";ctx.fillRect(0,0,512,160);
  ctx.strokeStyle="#ffe0ae";ctx.lineWidth=12;ctx.strokeRect(7,7,498,146);
  ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.font="bold 70px Trebuchet MS";ctx.fillText("JUNTO CLUB",256,102);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.7,.84),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
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
    const aspect=width/height,halfH=5.15;
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
