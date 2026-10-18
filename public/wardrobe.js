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
let previewRenderer=null;
let previewYaw=-.18;
function material(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.7,...options});}
function addPart(parent,geo,mat,x,y,z,sx=1,sy=1,sz=1){
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
}
function dress(model,selection){
  const parts=new THREE.Group();parts.name="jfWardrobeParts";model.add(parts);
  // Acessórios proporcionais ao macaco original normalizado em 1,8 unidades.
  // As posições são de prévia; não se substitui o modelo original nem sua rigagem.
  const straw=material(0xd4aa65,{roughness:.94,side:THREE.DoubleSide});
  const strawDark=material(0x9a7042),blue=material(0x387caa),rose=material(0xd7649e);
  const ink=material(0x26262b,{metalness:.22,roughness:.36});
  const glass=material(0x19273a,{transparent:true,opacity:.78,metalness:.12,roughness:.27,side:THREE.DoubleSide});
  const sphere=(mat,x,y,z,rx,ry,rz)=>addPart(parts,new THREE.SphereGeometry(1,20,12),mat,x,y,z,rx,ry,rz);
  if(selection.hat==="palha"){
    addPart(parts,new THREE.CylinderGeometry(.185,.205,.17,40),straw,0,.86,0);
    addPart(parts,new THREE.CylinderGeometry(.305,.305,.025,40),straw,0,.775,0);
    addPart(parts,new THREE.CylinderGeometry(.208,.208,.025,40),strawDark,0,.811,0);
    // Pequenas nervuras do chapéu em vez de um disco sem textura.
    for(let i=0;i<20;i++){
      const a=i*Math.PI/10;
      const line=addPart(parts,new THREE.BoxGeometry(.105,.004,.008),strawDark,Math.sin(a)*.246,.791,Math.cos(a)*.246);
      line.rotation.y=a;
    }
  }else if(selection.hat==="bone"){
    sphere(blue,0,.815,-.02,.245,.122,.225);
    const brim=sphere(material(0x2a668e),0,.755,.205,.205,.018,.13);
    brim.rotation.x=-.13;
  }else if(selection.hat==="gorro"){
    sphere(rose,0,.845,0,.242,.145,.222);
    addPart(parts,new THREE.CylinderGeometry(.235,.232,.052,30),material(0xb94c84),0,.773,0);
    sphere(material(0xffd2e8),0,.988,0,.055,.055,.055);
  }
  if(selection.glasses!=="nenhum"){
    const frame=selection.glasses==="escuros"?ink:material(0xb8a6db,{metalness:.55,roughness:.28});
    for(const sign of [-1,1]){
      const lens=sphere(selection.glasses==="escuros"?glass:material(0xeaf5ff,{transparent:true,opacity:.22,side:THREE.DoubleSide}),sign*.117,.45,.265,.092,.084,.012);
      lens.rotation.y=sign*-.12;
      const ring=addPart(parts,new THREE.TorusGeometry(.087,.009,8,32),frame,sign*.117,.45,.279);
      ring.scale.set(1,1,.7);
      const temple=addPart(parts,new THREE.BoxGeometry(.10,.015,.014),frame,sign*.244,.459,.222);
      temple.rotation.y=sign*-.28;
    }
    addPart(parts,new THREE.BoxGeometry(.07,.012,.018),frame,0,.461,.278);
  }
  if(selection.headphones!=="nenhum"){
    const shell=selection.headphones==="rosa"?rose:blue;
    const pad=material(0x21222c,{roughness:.85});
    // Arco fino sobre a cabeça, em vez de um bloco gigante.
    const band=addPart(parts,new THREE.TorusGeometry(.267,.023,10,40,Math.PI),shell,0,.714,0);
    band.rotation.z=0;
    for(const sign of [-1,1]){
      sphere(shell,sign*.265,.588,0,.066,.115,.099);
      sphere(pad,sign*.245,.583,0,.028,.083,.077);
    }
  }
  if(selection.outfit==="rosa"){
    // Saia de tecido com pregas arredondadas, mais leve que o cone anterior.
    const fabric=material(0xf385bd,{roughness:.89,side:THREE.DoubleSide});
    const hem=material(0xd84f98,{roughness:.9,side:THREE.DoubleSide});
    const segments=64,rings=9,positions=[],uvs=[],faces=[];
    for(let j=0;j<=rings;j++){
      const t=j/rings,y=-.13-.33*t;
      const baseRadius=.163+.13*Math.sin(t*Math.PI*.58);
      for(let i=0;i<=segments;i++){
        const a=2*Math.PI*i/segments;
        const pleat=.012*Math.sin(10*a)*(t*t);
        const radius=baseRadius+pleat;
        positions.push(Math.cos(a)*radius,y+.01*Math.sin(a*10)*t*t,Math.sin(a)*radius);
        uvs.push(i/segments,t);
      }
    }
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const a=j*(segments+1)+i,b=a+segments+1;
      faces.push(a,b,a+1,b,b+1,a+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(faces);geometry.computeVertexNormals();
    addPart(parts,geometry,fabric,0,0,0);
    addPart(parts,new THREE.TorusGeometry(.286,.009,8,64),hem,0,-.46,0).rotation.x=Math.PI/2;
    addPart(parts,new THREE.CylinderGeometry(.174,.178,.055,32),fabric,0,-.115,0);
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
  camera.position.set(0,.04,preview?4.25:4.0);camera.lookAt(0,.035,0);
  normalized.rotation.y=preview?previewYaw:-.18;
  renderer.render(scene,camera);
  let dragStart=null;
  const down=event=>{
    if(!preview)return;
    dragStart={x:event.clientX,y:normalized.rotation.y};
    target.setPointerCapture?.(event.pointerId);
  };
  const move=event=>{
    if(!dragStart)return;
    previewYaw=dragStart.y+(event.clientX-dragStart.x)*.012;
    normalized.rotation.y=previewYaw;
    renderer.render(scene,camera);
  };
  const up=()=>{dragStart=null;};
  if(preview){
    target.style.touchAction="pan-y";
    target.style.cursor="grab";
    target.addEventListener("pointerdown",down);
    target.addEventListener("pointermove",move);
    target.addEventListener("pointerup",up);
    target.addEventListener("pointercancel",up);
  }
  return {dispose:()=>{
    if(preview){
      target.removeEventListener("pointerdown",down);
      target.removeEventListener("pointermove",move);
      target.removeEventListener("pointerup",up);
      target.removeEventListener("pointercancel",up);
    }
    normalized.getObjectByName("jfWardrobeParts")?.traverse(obj=>{
      if(!obj.isMesh)return;
      obj.geometry?.dispose();
      (Array.isArray(obj.material)?obj.material:[obj.material]).forEach(mat=>mat?.dispose());
    });
    renderer.dispose();target.replaceChildren();
  },renderer};
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
