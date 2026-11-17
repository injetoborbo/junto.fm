import * as THREE from "https://esm.sh/three@0.170.0";
import {GLTFLoader} from "https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";

const canvas=document.getElementById("quarto3d");
if(!canvas)throw new Error("Camada 3D dos quartos não encontrada.");
let renderer,scene,camera,basePromise=null,base=null,lastSize={width:0,height:0},avatars=new Map(),frame=0;
const loader=new GLTFLoader();
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
async function loadBase(){
 if(basePromise)return basePromise;
 basePromise=loader.loadAsync("/macaco.glb").then(gltf=>{
  base=gltf.scene;
  base.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;}});
  return base;
 }).catch(error=>{console.error("Quartos: não foi possível carregar macaco.glb",error);basePromise=null;throw error;});
 return basePromise;
}
function makeAvatar(person,scale){
 const model=cloneSkeleton(base),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const height=Math.max(44,Math.min(92,68*scale)),factor=height/(size.y||1);
 model.scale.setScalar(factor);model.position.set(-center.x*factor,-bounds.min.y*factor,0);
 const root=new THREE.Group();root.add(model);root.userData={id:person.id,name:person.name||"Macaco",local:!!person.local,height};
 root.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.renderOrder=10;}});
 scene.add(root);return root;
}
function resize(width,height){
 if(lastSize.width===width&&lastSize.height===height)return;
 lastSize={width,height};renderer.setSize(width,height,false);
 camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
}
function render(){
 if(!renderer)return;
 renderer.render(scene,camera);
}
async function update(payload){
 if(!payload||!Number.isFinite(payload.width)||!Number.isFinite(payload.height))return;
 init();resize(payload.width,payload.height);
 const visible=new Set((payload.avatars||[]).map(p=>p.id));
 for(const [id,root] of avatars)if(!visible.has(id)){scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose();});avatars.delete(id);}
 if(!payload.avatars?.length){render();return;}
 try{await loadBase();}catch(_){render();return;}
 for(const p of payload.avatars){
  let root=avatars.get(p.id);
  if(!root||Math.abs((root.userData.scale||1)-(payload.scale||1))>.01){if(root)scene.remove(root);root=makeAvatar(p,payload.scale||1);root.userData.scale=payload.scale||1;avatars.set(p.id,root);}
  const height=root.userData.height;
  root.position.set(p.x-payload.width/2,payload.height/2-p.y,2);
  root.rotation.y=p.local?-.12:0;
 }
 render();
}
window.JFQuartos3D={update};
window.dispatchEvent(new Event("jf-quartos-3d-ready"));
