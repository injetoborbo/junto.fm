import * as THREE from 'https://esm.sh/three@0.170.0';

// Continuous, torso-only weights. Nearest-surface transfer is unsafe here:
// the monkey's bind pose puts its bent forearms next to the shirt, causing
// the chest to inherit hand/forearm motion and tear during the finish FBXs.
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const boneKey=name=>name.replace(/^.*[|:]/,'').replace(/^mixamorig/i,'').toLowerCase();
export function skinWardrobeShirt(avatar){
  const {group,rig}=avatar;group.updateWorldMatrix(true,true);
  let body=null,shirt=null;
  rig.traverse(node=>{if(node.isSkinnedMesh&&!node.userData.jfGarment&&!body)body=node;if(node.name==='jfWardrobe_regatapunk')shirt=node;});
  if(!body||!shirt)return ()=>{};
  const bones=new Map(body.skeleton.bones.map((bone,i)=>[boneKey(bone.name),{bone,index:i}]));
  const chest=bones.get('spine2'),waist=bones.get('spine1')||bones.get('spine');
  const left=bones.get('leftarm'),right=bones.get('rightarm');
  if(!chest||!waist||!left||!right)throw Error('Rig sem tronco/ombros para a regata.');
  const worldToAvatar=group.matrixWorld.clone().invert();
  const leftAt=left.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(worldToAvatar);
  const rightAt=right.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(worldToAvatar);
  const radius=Math.max(.04,leftAt.distanceTo(rightAt)*.7);
  const meshes=[];shirt.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  const generated=[];
  for(const mesh of meshes){
    const geometry=mesh.geometry.clone();
    const intoBody=body.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    geometry.applyMatrix4(intoBody);
    const positions=geometry.attributes.position;
    const intoAvatar=worldToAvatar.clone().multiply(body.matrixWorld);
    const points=[],bounds=new THREE.Box3(),p=new THREE.Vector3();
    for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(intoAvatar);points.push(p.clone());bounds.expandByPoint(p);
    }
    const height=Math.max(bounds.max.y-bounds.min.y,.0001);
    const skinIndices=new Uint16Array(positions.count*4),skinWeights=new Float32Array(positions.count*4);
    for(let i=0;i<positions.count;i++){
      const point=points[i],vertical=(point.y-bounds.min.y)/height;
      const upper=smooth((vertical-.40)/.55);
      // Small, smooth shoulder patches. Chest/hem cannot follow distal limbs.
      const l=.30*upper*Math.exp(-point.distanceToSquared(leftAt)/(radius*radius));
      const r=.30*upper*Math.exp(-point.distanceToSquared(rightAt)/(radius*radius));
      const trunk=1-l-r,chestBlend=.35+.65*smooth(vertical);
      skinIndices.set([chest.index,waist.index,left.index,right.index],i*4);
      skinWeights.set([trunk*chestBlend,trunk*(1-chestBlend),l,r],i*4);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
    const skinned=new THREE.SkinnedMesh(geometry,mesh.material);
    skinned.name=mesh.name;skinned.userData.jfGarment=true;
    skinned.position.copy(body.position);skinned.quaternion.copy(body.quaternion);skinned.scale.copy(body.scale);
    body.parent.add(skinned);skinned.updateWorldMatrix(true,false);
    skinned.bind(body.skeleton,body.bindMatrix.clone());skinned.frustumCulled=false;
    generated.push(skinned);mesh.removeFromParent();
  }
  return ()=>{for(const mesh of generated){mesh.removeFromParent();mesh.geometry.dispose();}};
}
