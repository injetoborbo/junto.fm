/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","gorro","palha"],
  glasses:["nenhum","escuros","redondos"],
  headphones:["nenhum","azul","rosa"],
  outfit:["padrao","rosa"]
};
const defaults=()=>({hat:"nenhum",glasses:"nenhum",headphones:"nenhum",outfit:"padrao"});
const sanitize=x=>Object.fromEntries(Object.entries(OPTIONS).map(([key,list])=>[key,list.includes(x?.[key])?x[key]:defaults()[key]]));
const $=id=>document.getElementById(id);
const base=await new GLTFLoader().loadAsync("/macaco.glb").catch(error=>{
  console.warn("Guarda-roupa: macaco.glb não foi encontrado.",error);return null;
});
const cache=new Map();
let previewRenderer=null;
function material(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.7,...options});}
function addPart(parent,geo,mat,x,y,z,sx=1,sy=1,sz=1){
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
}
function dress(model,selection){
  const parts=new THREE.Group();parts.name="jfWardrobeParts";model.add(parts);
  // Coordenadas no espaço do modelo depois da normalização em makeScene.
  const navy=material(0x23699c),pink=material(0xff70c5),red=material(0xc33a4a);
  if(selection.hat!=="nenhum"){
    const col=selection.hat==="palha"?0xdbb979:selection.hat==="gorro"?0xdf6268:0x307ab2;
    const hatMat=material(col,{side:THREE.DoubleSide});
    addPart(parts,new THREE.CylinderGeometry(.23,.25,.15,24),hatMat,0,.92,0);
    if(selection.hat==="bone") addPart(parts,new THREE.BoxGeometry(.31,.023,.15),hatMat,0,.87,.22);
    if(selection.hat==="palha") addPart(parts,new THREE.CylinderGeometry(.37,.37,.025,28),hatMat,0,.84,0);
    if(selection.hat==="gorro") addPart(parts,new THREE.SphereGeometry(.09,12,8),hatMat,0,1.04,0);
  }
  if(selection.glasses!=="nenhum"){
    const frame=material(selection.glasses==="escuros"?0x171923:0xffe6f4);
    for(const sign of [-1,1]){
      addPart(parts,new THREE.TorusGeometry(.102,.015,8,22),frame,sign*.135,.48,.275);
      if(selection.glasses==="escuros") addPart(parts,new THREE.CircleGeometry(.087,24),material(0x171b2e,{transparent:true,opacity:.8,side:THREE.DoubleSide}),sign*.135,.48,.283);
    }
    addPart(parts,new THREE.BoxGeometry(.09,.02,.02),frame,0,.48,.275);
  }
  if(selection.headphones!=="nenhum"){
    const col=selection.headphones==="rosa"?pink:navy;
    const band=addPart(parts,new THREE.TorusGeometry(.35,.035,8,30,Math.PI),col,0,.78,0);
    band.rotation.z=0;
    for(const sign of [-1,1])addPart(parts,new THREE.BoxGeometry(.12,.26,.15),col,sign*.355,.59,0);
  }
  if(selection.outfit==="rosa"){
    addPart(parts,new THREE.CylinderGeometry(.22,.35,.35,32,1,true),material(0xec7bb9,{side:THREE.DoubleSide}),0,-.19,0);
    addPart(parts,new THREE.CylinderGeometry(.20,.22,.25,28),pink,0,.075,0);
  }
}
function makeScene(target,wardrobe,{preview=false}={}){
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
  dress(normalized,sanitize(wardrobe));
  scene.add(normalized);
  const camera=new THREE.PerspectiveCamera(33,width/height,.01,100);
  camera.position.set(0,.05,preview?3.35:3.5);camera.lookAt(0,0,0);
  normalized.rotation.y=-.18;
  renderer.render(scene,camera);
  return {dispose:()=>{renderer.dispose();target.replaceChildren();},renderer};
}
function readSaved(){
  try{return sanitize(JSON.parse(localStorage.getItem("junto_profile")||"{}").wardrobe);}catch{return defaults();}
}
let selection=readSaved();
let editing={...selection};
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
    const instance=makeScene(target,wardrobe);
    if(instance)cards.set(target,instance);
  }
}
const observer=new MutationObserver(()=>{queueMicrotask(refreshPeople);});
const people=$("jfPeople");
if(people)observer.observe(people,{childList:true,subtree:false});
window.addEventListener("jf-wardrobe-save",()=>{selection=readSaved();refreshPeople();});
refreshPeople();
