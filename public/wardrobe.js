/* Guarda-roupa 3D público. Cada participante possui seu próprio macaco. */
import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const OPTIONS={
  hat:["nenhum","bone","gorro","palha","branco"],
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
// Carrega apenas o chapéu equipado e compartilha o asset entre usuários.
const hatAssetUrls={
  palha:"/Meshy_AI_Straw_Hat_with_Red_Ri_1018034335_texture.glb",
  branco:"/Meshy_AI_White_Sun_Hat_1018035045_texture.glb"
};
const hatAssetCache=new Map(),hatLoader=new GLTFLoader();
function getHatAsset(type){
  if(!hatAssetUrls[type])return Promise.resolve(null);
  if(!hatAssetCache.has(type)){
    hatAssetCache.set(type,hatLoader.loadAsync(hatAssetUrls[type]).then(gltf=>gltf.scene).catch(error=>{
      hatAssetCache.delete(type);
      console.warn("GLB do chapéu não encontrado em public/: "+hatAssetUrls[type],error);
      return null;
    }));
  }
  return hatAssetCache.get(type);
}
function material(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.7,...options});}
function addPart(parent,geo,mat,x,y,z,sx=1,sy=1,sz=1){
  const mesh=new THREE.Mesh(geo,mat);mesh.userData.jfWardrobeGenerated=true;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
}
function dress(model,selection,render){
  const parts=new THREE.Group();
  parts.name="jfWardrobeParts";parts.userData.active=true;
  model.add(parts);
  const mat=(color,options={})=>material(color,options);
  const sphere=(color,x,y,z,sx,sy,sz)=>addPart(parts,new THREE.SphereGeometry(1,24,16),color,x,y,z,sx,sy,sz);
  // Coordenadas do macaco normalizado: topo da cabeça ~0.90,
  // centro dos olhos ~0.43 e quadril ~-0.20.
  const H={headTop:.85,eyes:.435,front:.275,ears:.405,waist:-.17};
  const navy=mat(0x3376ab),pink=mat(0xde78aa),dark=mat(0x24212a,{metalness:.18,roughness:.46});
  if(selection.hat==="palha"||selection.hat==="branco"){
    const accessory=selection.hat;
    getHatAsset(accessory).then(asset=>{
      if(!asset||!parts.parent||!parts.userData.active)return;
      const hat=asset.clone(true);
      hat.name="jfMeshyHat_"+accessory;
      const box=new THREE.Box3().setFromObject(hat);
      const extent=box.getSize(new THREE.Vector3());
      const center=box.getCenter(new THREE.Vector3());
      const width=accessory==="palha"?.64:.62;
      const scale=width/Math.max(extent.x,extent.z,.0001);
      hat.scale.setScalar(scale);
      // Apoiar a ABA (e não o topo do chapéu) na cabeça.
      // O centro do modelo Meshy é aproximadamente o plano da aba.
      const brimY=H.headTop-.075;
      hat.position.set(-center.x*scale,brimY-center.y*scale,-center.z*scale-.015);
      hat.traverse(node=>{if(node.isMesh)node.frustumCulled=false;});
      parts.add(hat);
      render();
    });
  }else if(selection.hat==="bone"){
    const cap=sphere(navy,0,.835,-.025,.22,.10,.215);
    cap.rotation.x=-.03;
    const brim=sphere(mat(0x215d87),0,.775,.213,.19,.015,.12);
    brim.rotation.x=-.08;
  }else if(selection.hat==="gorro"){
    sphere(pink,0,.84,-.005,.223,.12,.205);
    const hem=addPart(parts,new THREE.CylinderGeometry(.215,.218,.035,40),mat(0xa84a7a),0,.78,-.005);
    sphere(mat(0xffd6e9),0,.96,0,.037,.037,.037);
  }
  if(selection.glasses!=="nenhum"){
    const frame=selection.glasses==="escuros"?dark:mat(0xb3a5c4,{metalness:.48,roughness:.3});
    const glass=mat(selection.glasses==="escuros"?0x162132:0xc5e9fc,{
      transparent:true,opacity:selection.glasses==="escuros"?.83:.25,
      side:THREE.DoubleSide,metalness:.15,roughness:.28
    });
    for(const sign of [-1,1]){
      sphere(glass,sign*.115,H.eyes,H.front+.016,.077,.069,.008);
      const ring=addPart(parts,new THREE.TorusGeometry(.073,.007,8,32),frame,sign*.115,H.eyes,H.front+.029);
      ring.rotation.y=sign*-.08;
      const arm=addPart(parts,new THREE.BoxGeometry(.085,.012,.012),frame,sign*.218,H.eyes+.007,.244);
      arm.rotation.y=sign*-.25;
    }
    addPart(parts,new THREE.BoxGeometry(.066,.011,.012),frame,0,H.eyes+.009,H.front+.028);
  }
  if(selection.headphones!=="nenhum"){
    const shell=selection.headphones==="rosa"?pink:navy;
    const padding=mat(0x252833,{roughness:.88});
    // Arco sobre a cabeça e almofadas FORA das orelhas.
    const band=addPart(parts,new THREE.TorusGeometry(.37,.016,10,48,Math.PI),shell,0,.635,-.035);
    band.rotation.z=0;
    for(const sign of [-1,1]){
      sphere(shell,sign*.414,.43,-.018,.064,.095,.095);
      sphere(padding,sign*.381,.43,-.018,.021,.076,.076);
    }
  }
  if(selection.outfit==="rosa"){
    const fabric=mat(0xf18abc,{roughness:.9,side:THREE.DoubleSide});
    const trim=mat(0xd65298,{roughness:.87,side:THREE.DoubleSide});
    // Vestido solto curto, sem encostar nas mãos nem cobrir as pernas.
    const segments=48,rings=9,positions=[],uvs=[],indices=[];
    for(let j=0;j<=rings;j++){
      const t=j/rings,y=-.13-.31*t;
      const radius=.158+.113*Math.sin(t*Math.PI*.53);
      for(let i=0;i<=segments;i++){
        const a=2*Math.PI*i/segments;
        const r=radius+.009*Math.sin(10*a)*t*t;
        positions.push(Math.cos(a)*r,y+.006*Math.sin(10*a)*t*t,Math.sin(a)*r);
        uvs.push(i/segments,t);
      }
    }
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const n=j*(segments+1)+i,k=n+segments+1;
      indices.push(n,k,n+1,k,k+1,n+1);
    }
    const geom=new THREE.BufferGeometry();
    geom.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geom.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    geom.setIndex(indices);geom.computeVertexNormals();
    addPart(parts,geom,fabric,0,0,0);
    addPart(parts,new THREE.TorusGeometry(.267,.007,8,48),trim,0,-.437,0).rotation.x=Math.PI/2;
    addPart(parts,new THREE.CylinderGeometry(.17,.176,.045,36),fabric,0,-.13,0);
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
  dress(normalized,sanitize(wardrobe),()=>renderer.render(scene,camera));
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
    const wardrobeParts=normalized.getObjectByName("jfWardrobeParts");
    if(wardrobeParts)wardrobeParts.userData.active=false;
    wardrobeParts?.traverse(obj=>{
      if(!obj.isMesh||!obj.userData.jfWardrobeGenerated)return;
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
