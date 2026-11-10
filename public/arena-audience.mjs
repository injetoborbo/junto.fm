// The uploaded/colorized art is one shared transparent texture. Only the
// small placard canvases change when fighter names change, never per frame.
export function sampleCrowdCheer(seconds,index){
  const phase=seconds*(2.8+(index%3)*.25)+index*1.73;
  return {x:Math.sin(phase*.65)*.022,y:Math.pow(Math.max(0,Math.sin(phase)),2)*.055,tilt:Math.sin(phase*.8)*.012};
}
export function createArenaAudience(THREE,{texture,makeCanvas=()=>document.createElement('canvas')}={}){
  const group=new THREE.Group(),fans=[],signs=[],signTextures=[];
  const aspect=(texture.image?.width||1313)/(texture.image?.height||1198);
  texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.08,side:THREE.FrontSide,depthWrite:true});
  const geometry=new THREE.PlaneGeometry(1.95,1.95/aspect);
  for(let i=0;i<2;i++){
    const canvas=makeCanvas();canvas.width=512;canvas.height=128;
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;signTextures.push(map);
  }
  const addWall=(x,z,yaw,positions)=>{
    const wall=new THREE.Group();wall.position.set(x,0,z);wall.rotation.y=yaw;group.add(wall);
    for(const along of positions){
      const fan=new THREE.Group();fan.position.set(along,1.43,0);wall.add(fan);
      fan.add(new THREE.Mesh(geometry,material));
      const index=fans.length,side=index%2;
      const signMaterial=new THREE.MeshBasicMaterial({map:signTextures[side],transparent:true,side:THREE.FrontSide});
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(.76,.19),signMaterial);
      sign.position.set((index%3-1)*.14,.83,.035);sign.rotation.z=(index%2?1:-1)*.07;fan.add(sign);
      fans.push({group:fan,x:along,y:1.43});signs.push(sign);
    }
  };
  // Front faces always point INTO the ring: user names cannot read backwards.
  addWall(0,-2.55,0,[-2.85,-.95,.95,2.85]);
  addWall(-3.18,0,Math.PI/2,[-1.8,0,1.8]);
  addWall(3.18,0,-Math.PI/2,[-1.8,0,1.8]);
  let signature='';
  return {group,fans,signTextures,
    setNames(names){
      const next=names.map(name=>String(name||'DESAFIANTE').slice(0,24));
      const key=next.join('|');if(key===signature)return;signature=key;
      signTextures.forEach((map,i)=>{
        const canvas=map.image,ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,128);
        ctx.fillStyle=i?'#b4d8ce':'#f1d692';ctx.fillRect(6,6,500,116);
        ctx.strokeStyle='#382b20';ctx.lineWidth=9;ctx.strokeRect(6,6,500,116);
        ctx.fillStyle='#202825';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 50px sans-serif';
        ctx.fillText(next[i].toUpperCase(),256,66,460);map.needsUpdate=true;
      });
    },
    update(seconds){fans.forEach((fan,i)=>{
      const pose=sampleCrowdCheer(seconds,i);fan.group.position.set(fan.x+pose.x,fan.y+pose.y,0);fan.group.rotation.z=pose.tilt;
    });},
    dispose(){
      geometry.dispose();material.dispose();texture.dispose();
      for(const sign of signs){sign.geometry.dispose();sign.material.dispose();}
      signTextures.forEach(map=>map.dispose());group.removeFromParent();
    }
  };
}
