// Barril 3D compartilhado: um GLB e vitamina procedural, sem texturas extras.
// Os modelos devem estar em public/banana/barriovazil.glb e bananalowpoly.glb.
(async()=>{
"use strict";
const socket=window.jfBananaSocket,player=document.getElementById("jfMiniDj");
if(!socket||!player)return;
const style=document.createElement("style");
style.textContent=`
.jf-banana-dj-row{display:flex;align-items:center;justify-content:center;gap:0;width:100%;min-width:0}
.jf-banana-widget{display:flex;align-items:center;flex-direction:column;gap:2px;flex:0 0 98px;min-width:0;align-self:center}
.jf-mini-dj:has(.jf-banana-widget){width:272px;max-width:100%}
.jf-track-content:has(.jf-banana-widget){grid-template-columns:minmax(0,1fr) 272px}
.jf-banana-barrel{width:96px;height:120px;position:relative;pointer-events:none;transform:translateY(9px)}
.jf-banana-barrel canvas{width:100%;height:100%;display:block}
.jf-banana-count{font:700 11px system-ui,sans-serif;color:var(--jf-secondary,#e7c778);white-space:nowrap}
.jf-banana-button[hidden]{display:none!important}\n.jf-banana-button{position:fixed;left:10px;bottom:86px;z-index:10021;width:76px;height:76px;border:0;background:transparent;padding:0;cursor:pointer;display:grid;place-items:center;filter:drop-shadow(0 3px 5px #0009);transition:transform .14s ease,filter .14s ease}
.jf-banana-button canvas{width:100%;height:100%;display:block;pointer-events:none}
.jf-banana-button:hover{transform:scale(1.12) rotate(-8deg)}
.jf-banana-button:active{transform:scale(.92)}
.jf-banana-button:disabled{opacity:.4;cursor:not-allowed}
.jf-banana-flight{position:fixed;inset:0;width:100vw;height:100dvh;z-index:13000;pointer-events:none}
@media(max-width:760px){.jf-track-content:has(.jf-banana-widget){grid-template-columns:minmax(0,1fr)}.jf-mini-dj:has(.jf-banana-widget){width:100%;justify-content:center;flex-wrap:wrap}.jf-banana-widget{flex-basis:82px}.jf-banana-barrel{width:82px;height:102px}}
@media(max-width:520px){.jf-banana-button{left:8px;bottom:77px;width:66px;height:66px}}
`;document.head.appendChild(style);
const widget=document.createElement("div");widget.className="jf-banana-widget";
widget.innerHTML='<div class="jf-banana-barrel" id="jfBananaBarrel" aria-label="Barril 3D de vitamina de banana"></div><span class="jf-banana-count" id="jfBananaCount">0/15 🍌</span>';
const stage=player.querySelector(".jf-dj-stage");if(!stage)return;
const row=document.createElement("div");row.className="jf-banana-dj-row";stage.parentElement.insertBefore(row,stage);row.append(stage,widget);
const button=document.createElement("button");button.type="button";button.className="jf-banana-button";button.id="jfBananaThrow";button.title="Lançar banana no barril";button.setAttribute("aria-label","Lançar banana no barril");button.textContent="🍌";button.hidden=true;document.body.appendChild(button);
const holder=widget.querySelector("#jfBananaBarrel"),count=widget.querySelector("#jfBananaCount");
let joined=false,number=0,room=null,lastClick=0,liquid=null,level=0,target=0,ripple=0,barrelReady=false,flightModel=null,THREE=null,flightRenderer=null,flightScene=null,flightCamera=null,flightLayer=null,iconRenderer=null,iconScene=null,iconCamera=null,iconModel=null;
const clamp=n=>Math.min(15,Math.max(0,Number(n)||0));
const setCount=value=>{number=clamp(value);target=number/15;count.textContent=number+"/15 🍌";button.hidden=!joined;button.disabled=!joined||number>=15;};
try{
 THREE=await import("https://esm.sh/three@0.170.0");
 const {GLTFLoader}=await import("https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js");
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);
 camera.position.set(2.2,2.0,3.8);camera.lookAt(0,.35,0);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);holder.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xffffff,0x57472f,2.4));
 const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,6,5);scene.add(light);
 const root=new THREE.Group();scene.add(root);
 const loader=new GLTFLoader();
 const gltf=await loader.loadAsync("/banana/barriovazil.glb");
 const model=gltf.scene;model.updateMatrixWorld(true);
 // Normalização: deixa o barril caber no widget independentemente das unidades exportadas.
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 if(!size.y||!size.x||!size.z)throw Error("Modelo do barril sem dimensões válidas.");
 const scale=1.65/Math.max(size.x,size.y,size.z);
 model.position.sub(center).multiplyScalar(scale);model.scale.setScalar(scale);root.add(model);
 const height=size.y*scale,width=Math.min(size.x,size.z)*scale;
 // O cilindro fica dentro do barril; a superfície é opaca como vitamina grossa.
 // Caso o GLB possua parede interna diferente, os raios podem ser calibrados depois.
 const innerRadius=width*.38,base=-height*.5+height*.13,maxHeight=height*.46;
 const cream=new THREE.MeshStandardMaterial({color:0xf3e6b8,roughness:.39,metalness:0,side:THREE.DoubleSide});
 liquid=new THREE.Group();root.add(liquid);
 const body=new THREE.Mesh(new THREE.CylinderGeometry(innerRadius,innerRadius,1,32,1),cream);liquid.add(body);
 const surfaceGeo=new THREE.CircleGeometry(innerRadius,48);
 const surface=new THREE.Mesh(surfaceGeo,cream);surface.rotation.x=-Math.PI/2;liquid.add(surface);
 const resize=()=>{const w=Math.max(1,holder.clientWidth),h=Math.max(1,holder.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
 resize();if("ResizeObserver" in window)new ResizeObserver(resize).observe(holder);else window.addEventListener("resize",resize);
 barrelReady=true;
 // A banana voa num canvas transparente cobrindo a tela só durante a animação.
 loader.loadAsync("/banana/bananalowpoly.glb").then(g=>{
   flightModel=g.scene;
   const bb=new THREE.Box3().setFromObject(flightModel),sz=bb.getSize(new THREE.Vector3()),ct=bb.getCenter(new THREE.Vector3());
   const sc=1.05/Math.max(sz.x,sz.y,sz.z);flightModel.position.sub(ct).multiplyScalar(sc);flightModel.scale.setScalar(sc);
   iconScene=new THREE.Scene();iconScene.add(new THREE.AmbientLight(0xffffff,2.5));const iconLight=new THREE.DirectionalLight(0xffffff,2);iconLight.position.set(3,5,5);iconScene.add(iconLight);
   iconModel=flightModel.clone(true);iconScene.add(iconModel);iconCamera=new THREE.PerspectiveCamera(35,1,.1,100);iconCamera.position.set(0,0,3.4);
   iconRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});iconRenderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));iconRenderer.setSize(76,76,false);iconRenderer.setClearColor(0,0);button.textContent="";button.appendChild(iconRenderer.domElement);
 }).catch(err=>console.warn("Banana GLB não disponível:",err));
 const clock=new THREE.Clock();
 function render(){
  requestAnimationFrame(render);
  const dt=Math.min(.05,clock.getDelta());
  level+=(target-level)*Math.min(1,dt*4);
  ripple*=Math.exp(-dt*6);
  const amount=Math.max(.0001,maxHeight*level);
  body.scale.y=amount;body.position.y=base+amount*.5;
  surface.position.y=base+amount;
  surface.scale.setScalar(1+Math.sin(performance.now()*.015)*ripple*.045);
  surface.rotation.z=Math.sin(performance.now()*.008)*ripple*.045;
  liquid.visible=level>.002;
  renderer.render(scene,camera);if(iconRenderer&&iconModel){iconModel.rotation.y+=dt*.7;iconModel.rotation.z=-.25;iconRenderer.render(iconScene,iconCamera);}
 }
 render();
}catch(err){console.warn("Barril 3D aguardando GLB:",err);holder.textContent="🛢️";}
function fly(){
 if(!barrelReady||!flightModel||!THREE)return;
 const targetBox=holder.getBoundingClientRect(),sourceBox=button.getBoundingClientRect();
 if(!targetBox.width)return;
 const vw=innerWidth,vh=innerHeight;
 if(!flightRenderer){
  flightLayer=document.createElement("canvas");flightLayer.className="jf-banana-flight";document.body.appendChild(flightLayer);
  flightRenderer=new THREE.WebGLRenderer({canvas:flightLayer,alpha:true,antialias:true,powerPreference:"low-power"});flightRenderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));flightRenderer.setClearColor(0,0);
  flightScene=new THREE.Scene();flightScene.add(new THREE.AmbientLight(0xffffff,2.3));
  flightCamera=new THREE.OrthographicCamera(-vw/100,vw/100,vh/100,-vh/100,.1,100);flightCamera.position.z=15;
 }
 flightRenderer.setSize(vw,vh,false);flightCamera.left=-vw/100;flightCamera.right=vw/100;flightCamera.top=vh/100;flightCamera.bottom=-vh/100;flightCamera.updateProjectionMatrix();
 const clone=flightModel.clone(true);flightScene.add(clone);
 const from={x:sourceBox.left+sourceBox.width/2,y:sourceBox.top+sourceBox.height/2},to={x:targetBox.left+targetBox.width/2,y:targetBox.top+targetBox.height*.28};
 const start=performance.now(),duration=1050;
 function step(now){
  const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t);
  const x=from.x+(to.x-from.x)*ease,y=from.y+(to.y-from.y)*ease-Math.sin(Math.PI*t)*Math.min(130,vh*.17);
  clone.position.x=(x-vw/2)/50;clone.position.y=(vh/2-y)/50;clone.rotation.set(t*8,t*11,t*5);clone.scale.setScalar(Math.max(.05,1-t*.9));
  clone.visible=t<.97;flightRenderer.clear();flightRenderer.render(flightScene,flightCamera);
  if(t<1)requestAnimationFrame(step);else{flightScene.remove(clone);flightRenderer.clear();ripple=1;}
 }
 requestAnimationFrame(step);
}
button.onclick=()=>{if(!joined||number>=15||Date.now()-lastClick<1200)return;lastClick=Date.now();socket.emit("banana-throw");};
socket.on("joined-room",data=>{joined=true;room=data.room;setCount(data.bananaCount||0)});
socket.on("banana-thrown",data=>{if(!joined||data.room!==room)return;fly();setCount(data.count);ripple=1;});
socket.on("banana-error",data=>{button.title=data?.message||"Aguarde"});
function reset(){joined=false;room=null;setCount(0);}
socket.on("left-room",reset);socket.on("disconnect",reset);
setCount(0);
})();
