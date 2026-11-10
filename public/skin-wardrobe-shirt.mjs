import * as THREE from 'https://esm.sh/three@0.170.0';

// Nearest body-surface weights give a rigid, unrigged garment the SAME
// deformation as the wearer. Work in the body's mesh space, not bone space.
function tree(points,depth=0){
  if(!points.length)return null;
  const axis=depth%3;points.sort((a,b)=>a.p[axis]-b.p[axis]);
  const middle=points.length>>1;
  return {point:points[middle],axis,left:tree(points.slice(0,middle),depth+1),right:tree(points.slice(middle+1),depth+1)};
}
function nearest(node,p,best=[]){
  if(!node)return best;
  const q=node.point,dx=p[0]-q.p[0],dy=p[1]-q.p[1],dz=p[2]-q.p[2];
  const d=dx*dx+dy*dy+dz*dz;
  if(best.length<3||d<best[best.length-1].d){best.push({point:q,d});best.sort((a,b)=>a.d-b.d);if(best.length>3)best.pop();}
  const delta=p[node.axis]-q.p[node.axis];
  nearest(delta<0?node.left:node.right,p,best);
  if(best.length<3||delta*delta<=best[best.length-1].d)nearest(delta<0?node.right:node.left,p,best);
  return best;
}
export function skinWardrobeShirt(avatar){
  const {group,rig}=avatar;group.updateWorldMatrix(true,true);
  let body=null,shirt=null;
  rig.traverse(node=>{if(node.isSkinnedMesh&&!node.userData.jfGarment&&!body)body=node;if(node.name==='jfWardrobe_regatapunk')shirt=node;});
  if(!body||!shirt)return ()=>{};
  const position=body.geometry.attributes.position,indices=body.geometry.attributes.skinIndex,weights=body.geometry.attributes.skinWeight;
  if(!indices||!weights)throw Error('O macaco precisa de skin para animar as cavas da regata.');
  const points=[];
  for(let i=0;i<position.count;i++)points.push({p:[position.getX(i),position.getY(i),position.getZ(i)],i});
  const spatial=tree(points),meshes=[];
  shirt.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  const generated=[];
  for(const mesh of meshes){
    const geometry=mesh.geometry.clone();
    const intoBody=body.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    geometry.applyMatrix4(intoBody);
    const positions=geometry.attributes.position;
    const skinIndices=new Uint16Array(positions.count*4),skinWeights=new Float32Array(positions.count*4);
    for(let i=0;i<positions.count;i++){
      const neighbours=nearest(spatial,[positions.getX(i),positions.getY(i),positions.getZ(i)]);
      const totals=new Map();
      for(const neighbour of neighbours){
        const influence=1/Math.max(neighbour.d,1e-12),source=neighbour.point.i;
        for(let k=0;k<4;k++){
          const bone=indices.getComponent(source,k),weight=weights.getComponent(source,k)*influence;
          if(weight>0)totals.set(bone,(totals.get(bone)||0)+weight);
        }
      }
      const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((n,p)=>n+p[1],0);
      for(let k=0;k<top.length;k++){skinIndices[i*4+k]=top[k][0];skinWeights[i*4+k]=top[k][1]/sum;}
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
