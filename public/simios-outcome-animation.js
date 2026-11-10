import * as THREE from 'https://esm.sh/three@0.170.0';
import {GLTFLoader} from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
const assets=new Map();
const key=name=>name.replace(/^.*[|:]/,'').replace(/^mixamorig\d*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function loadOutcomeAnimation(kind){
  if(!assets.has(kind))assets.set(kind,new GLTFLoader().loadAsync('/poses/arena/'+(kind==='victory'?'victory':'death')+'.glb'));
  return assets.get(kind);
}
// Transfer global rotation deltas, then recover each target bone's local
// rotation using its animated parent. This preserves the monkey's bind pose.
export function bindOutcomeAnimation(avatar,asset){
  const source=asset.scene.clone(true),sourceBones=new Map(),targets=[];
  source.updateMatrixWorld(true);avatar.rig.updateMatrixWorld(true);
  source.traverse(node=>{if(node.name)sourceBones.set(key(node.name),{
    node,rest:node.getWorldQuaternion(new THREE.Quaternion()),position:node.position.clone()
  });});
  avatar.rig.traverse(node=>{if(!node.isBone)return;
    const match=sourceBones.get(key(node.name));
    if(match)targets.push({node,match,rest:node.getWorldQuaternion(new THREE.Quaternion()),position:node.position.clone()});
  });
  const score=clip=>clip.tracks.reduce((sum,t)=>{
    if(!t.name.endsWith('.quaternion'))return sum;
    for(let i=4;i<t.values.length;i++)if(Math.abs(t.values[i]-t.values[i%4])>.005)return sum+1000+t.times.length;
    return sum;
  },0);
  const clip=[...asset.animations].sort((a,b)=>score(b)-score(a))[0];
  if(!clip||targets.length<5)throw Error('Animação sem ossos compatíveis com o macaco');
  const mixer=new THREE.AnimationMixer(source),action=mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const sourceHip=sourceBones.get('hips'),targetHip=targets.find(t=>key(t.node.name)==='hips');
  const scale=sourceHip&&targetHip?targetHip.node.getWorldPosition(new THREE.Vector3()).distanceTo(avatar.rig.getWorldPosition(new THREE.Vector3()))/Math.max(.001,sourceHip.node.getWorldPosition(new THREE.Vector3()).distanceTo(source.getWorldPosition(new THREE.Vector3()))):1;
  const world=new THREE.Quaternion(),parent=new THREE.Quaternion();
  return {apply(seconds){
    mixer.setTime(Math.min(Math.max(seconds,0),Math.max(0,clip.duration-.001)));
    source.updateMatrixWorld(true);
    for(const t of targets){
      t.match.node.getWorldQuaternion(world).multiply(t.match.rest.clone().invert()).multiply(t.rest);
      t.node.parent.getWorldQuaternion(parent).invert();
      t.node.quaternion.copy(parent.multiply(world)).normalize();
      if(t===targetHip&&sourceHip){
        const delta=sourceHip.node.position.clone().sub(sourceHip.position);
        // Convert source parent space through world into target parent space.
        delta.multiply(sourceHip.node.parent.getWorldScale(new THREE.Vector3())).applyQuaternion(sourceHip.node.parent.getWorldQuaternion(new THREE.Quaternion()));
        delta.multiplyScalar(scale);
        const local=delta.applyQuaternion(t.node.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
        const parentScale=t.node.parent.getWorldScale(new THREE.Vector3());
        local.divide(parentScale);t.node.position.copy(t.position).add(local);
      }
      t.node.updateMatrixWorld(true);
    }
    avatar.updateAccessories?.();
  },reset(){for(const t of targets)t.node.position.copy(t.position);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(source);}};
}
