import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
const project=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'arena-wardrobe-'));
const threeURL=import.meta.resolve('three');
const loaderURL=import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js');
const cloneURL=import.meta.resolve('three/examples/jsm/utils/SkeletonUtils.js');
const loadSource="import fs from 'node:fs';\nimport {GLTFLoader} from 'PLACEHOLDER';\nglobalThis.ProgressEvent=class{};\nexport async function load(path){\n const b=fs.readFileSync(path);const n=b.readUInt32LE(12),data=JSON.parse(b.subarray(20,20+n));\n delete data.images;delete data.textures;data.materials=[];\n for(const mesh of data.meshes||[])for(const p of mesh.primitives)delete p.material;\n if(data.buffers?.length){const start=20+n;data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(start+8,start+8+b.readUInt32LE(start)).toString('base64');}\n return new GLTFLoader().parseAsync(JSON.stringify(data),'');\n}\n";
await fs.writeFile(path.join(temp,'load.mjs'),loadSource.replace('PLACEHOLDER',loaderURL));
const prefix="import * as THREE from 'THREE_URL';\nimport {clone as cloneSkeleton} from 'CLONE_URL';\nimport {load} from './load.mjs';\nconst location={hostname:'test'};\nconst localStorage={getItem(){return null},setItem(){}};\nconst document={getElementById(){return null}};\nconst window={addEventListener(){},dispatchEvent(){},removeEventListener(){}};\nclass GLTFLoader{loadAsync(url){return load(PUBLIC_DIR+url)}}\n";
// Execute the actual browser fitting functions, isolating only DOM and texture IO.
const wardrobe=await fs.readFile(path.join(project,'public/wardrobe.js'),'utf8');
const code=prefix.replace('THREE_URL',threeURL).replace('CLONE_URL',cloneURL).replace('PUBLIC_DIR',JSON.stringify(path.join(project,'public')))+wardrobe.slice(wardrobe.indexOf('const OPTIONS='),wardrobe.indexOf('// Encaixe INDEPENDENTE'))+wardrobe.slice(wardrobe.indexOf('// Arena: assemble EXACTLY'))+'\nexport {dress};export function qaBase(model){base=model;}export function qaFits(fits){fitAccess=true;privateFits=fits;}';
await fs.writeFile(path.join(temp,'wardrobe.mjs'),code);
const source=(await fs.readFile(path.join(project,'public/simios-outcome-animation.js'),'utf8')).replaceAll('https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js',loaderURL).replaceAll('https://esm.sh/three@0.170.0',threeURL);
await fs.writeFile(path.join(temp,'outcome.mjs'),source);
const {load}=await import(pathToFileURL(path.join(temp,'load.mjs')));
const {dress,createWardrobeFittedAvatar,qaBase,qaFits}=await import(pathToFileURL(path.join(temp,'wardrobe.mjs')));
const {bindOutcomeAnimation}=await import(pathToFileURL(path.join(temp,'outcome.mjs')));
const arenaSource=await fs.readFile(path.join(project,'public/simios-arena.js'),'utf8');
const bodyBounds=new Function('THREE',arenaSource.slice(arenaSource.indexOf('  function bodyBounds'),arenaSource.indexOf('  function updateAudience'))+';return bodyBounds;')(THREE);
test.after(async()=>{await fs.rm(temp,{recursive:true,force:true});});
test('arena matches wardrobe fits, keeps accessories on bones and body on mat in both FBXs',async()=>{
const dir=path.join(project,'public')+'/';
const base=await load(dir+'macaco.glb');qaBase(base);
const assets={victory:await load(dir+'poses/arena/victory.glb'),death:await load(dir+'poses/arena/death.glb')};
const parts=root=>{const out=new Map();root.traverse(p=>{if(/^jfWardrobe_|^jfWardrobeHat_/.test(p.name))out.set(p.name,p)});return out;};
let checks=0;
for(const local of [false,true]){
 if(local)qaFits({caveira:{width:.69,offset:[.02,.32,.04]},escuros:{width:.52,offset:[0,.15,.28]},regatapunk:{width:.48,offset:[0,-.02,0]}});
 for(const wardrobe of [...['bone','gorro','caveira','palha','apocaliptico','branco'].map(hat=>({hat,glasses:'escuros',headphones:'preto',outfit:'punk'})),
 {hat:'bone',glasses:'redondos',headphones:'azul',outfit:'rosa'},
 {hat:'gorro',glasses:'sem_aro',headphones:'rosa',outfit:'rosa_novo'},
 {hat:'caveira',glasses:'botao',headphones:'preto',outfit:'punk'},
 {hat:'nenhum',glasses:'escuros',headphones:'azul',outfit:'padrao'},
 {hat:'nenhum',glasses:'redondos',headphones:'rosa',outfit:'rosa'},
 {hat:'branco',glasses:'nenhum',headphones:'nenhum',outfit:'padrao'}
 ]){const hat=JSON.stringify(wardrobe);
 const arena=await createWardrobeFittedAvatar(wardrobe,{local});
 // Independent setup copied from the standing makeScene() wardrobe preview.
 const rig=cloneSkeleton(base.scene),group=new THREE.Group();
 const box=new THREE.Box3().setFromObject(rig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const scale=1.8/Math.max(size.x,size.y,size.z);rig.scale.setScalar(scale);rig.position.copy(center).multiplyScalar(-scale);group.add(rig);group.rotation.y=-.18;
 dress(group,wardrobe,()=>{},rig,{animated:false,privateFit:local});await Promise.resolve();group.rotation.y=0;group.updateMatrixWorld(true);arena.group.updateMatrixWorld(true);
 const reference=parts(group),actual=parts(arena.group);
 if(actual.size!==reference.size)throw Error('missing accessories '+hat);
 let maxError=0;
 for(const [name,p] of reference){const other=actual.get(name);if(!other)throw Error(name);p.matrixWorld.elements.forEach((v,i)=>maxError=Math.max(maxError,Math.abs(v-other.matrixWorld.elements[i])));}
 if(maxError>1e-6)throw Error('Preview parity failed '+hat+': '+maxError);
 const anchors=new Map();for(const p of actual.values()){
  if(!p.parent.isBone)throw Error('Not anchored to bone '+p.name);
  anchors.set(p,p.matrix.clone());
 }
 const animations=['victory','death'].map(kind=>({kind,anim:bindOutcomeAnimation(arena,assets[kind])}));
 for(const {kind,anim} of animations){
  for(const t of [0,.3,.8,1.5,2.5,3.8,8.5]){
   arena.group.position.set(-.85,.82,0);arena.group.rotation.y=Math.PI/2;arena.group.updateMatrixWorld(true);
   anim.apply(t);const b=bodyBounds(arena);arena.group.position.y+=.015-b.min.y;arena.updateAccessories();
   assert.ok(Math.abs(bodyBounds(arena).min.y-.015)<1e-5,"body must touch mat");
   for(const p of actual.values()){
    const relative=new THREE.Matrix4().copy(p.parent.matrixWorld).invert().multiply(p.matrixWorld);
    relative.elements.forEach((v,i)=>{if(Math.abs(v-anchors.get(p).elements[i])>1e-5)throw Error('Accessory detached '+p.name+' '+kind);});
    checks++;
   }
  }anim.reset();anim.dispose();
 }
 
 }
}
assert.ok(checks>=1100);

});
