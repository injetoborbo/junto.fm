import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArenaAudience,sampleCrowdCheer} from '../public/arena-audience.mjs';
function setup(){
 const labels=[];
 const makeCanvas=()=>({getContext:()=>new Proxy({fillText:text=>labels.push(text)},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)})});
 const texture=new THREE.Texture({width:1313,height:1198});
 return {labels,texture,audience:createArenaAudience(THREE,{texture,makeCanvas})};
}
test('crowd and name placards face into the ring without mirrored text',()=>{
 const {audience,texture}=setup();audience.group.updateMatrixWorld(true);
 assert.equal(audience.fans.length,10);
 assert.equal(audience.silhouettes.length,20);
 for(const shade of audience.silhouettes){
  assert.equal(shade.group.material.map,texture);assert.ok(shade.z<0,'gray crowd must stay behind the original figures');
  const shader={fragmentShader:'#include <map_fragment>'};shade.group.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb = diffuse/,'rear copies use alpha silhouettes, not colored art');
 }
 for(const fan of audience.fans){
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(fan.group.getWorldQuaternion(new THREE.Quaternion()));
  const inward=fan.group.getWorldPosition(new THREE.Vector3()).negate();inward.y=0;
  assert.ok(normal.dot(inward)>0);
  assert.equal(fan.group.children[0].material.map,texture);
  assert.equal(fan.group.children[0].material.side,THREE.FrontSide);
 }
 audience.dispose();
});
test('cheering varies between groups without repainting the fighter signs each frame',()=>{
 const {audience,labels}=setup();audience.setNames(['Bufos','Ouvinte']);assert.deepEqual(labels,['BUFOS','OUVINTE']);
 audience.setNames(['Bufos','Ouvinte']);for(let i=0;i<60;i++)audience.update(i/60);
 assert.equal(labels.length,2);
 audience.setNames(['Novo','Ouvinte']);assert.equal(labels.at(-2),'NOVO');
 assert.notDeepEqual(sampleCrowdCheer(1,0),sampleCrowdCheer(1,1));
 for(let t=0;t<10;t+=.1){const p=sampleCrowdCheer(t,2);assert.ok(p.y>=0&&p.y<=.055);assert.ok(Math.abs(p.x)<=.022);}
 audience.dispose();
});
