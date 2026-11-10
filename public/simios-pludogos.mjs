/* Pludogos: mascotes low-poly gerados em Three.js; nenhum GLB extra para baixar.
 * A escolha é salva no navegador, o pet é sincronizado entre usuários na pista.
 */
export const PLUDOGO_VARIANTS=Object.freeze({
  nenhum:{label:"Sem pet"},
  caramelo:{label:"Pludogo Caramelo",body:0xd59a58,ears:0x8f522e,collar:0x48c7ed},
  noturno:{label:"Pludogo Noturno",body:0x404558,ears:0x222638,collar:0xb18cff},
  rosinha:{label:"Pludogo Rosinha",body:0xf2a2c7,ears:0xd765a1,collar:0xffe177}
});
export function makePludogo(THREE,type){
  const color=PLUDOGO_VARIANTS[type];
  if(!color?.body)return null;
  const root=new THREE.Group();root.name="Pludogo-"+type;
  root.position.set(.57,.13,.43);
  const skin=new THREE.MeshStandardMaterial({color:color.body,roughness:.88,flatShading:true});
  const ears=new THREE.MeshStandardMaterial({color:color.ears,roughness:.87,flatShading:true});
  const collar=new THREE.MeshStandardMaterial({color:color.collar,roughness:.43,metalness:.15});
  const black=new THREE.MeshStandardMaterial({color:0x161627,roughness:.58});
  const white=new THREE.MeshStandardMaterial({color:0xfbf6e4,roughness:.75});
  const cheek=new THREE.MeshStandardMaterial({color:0xffddc3,roughness:.9});
  const ball=(name,mat,x,y,z,sx,sy,sz,detail=1)=>{
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,detail),mat);
    mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    root.add(mesh);return mesh;
  };
  ball("Corpo",skin,0,.18,0,.20,.17,.26);
  ball("Cabeca",skin,0,.35,.18,.19,.185,.18);
  ball("Focinho",cheek,0,.287,.328,.11,.08,.089);
  ball("Nariz",black,0,.327,.401,.036,.027,.027);
  for(const side of [-1,1]){
    const ear=ball("Orelha",ears,side*.185,.42,.11,.07,.14,.085,0);
    ear.rotation.z=side*.32;
    ball("Olho",white,side*.077,.397,.326,.037,.042,.029);
    ball("Pupila",black,side*.077,.396,.35,.018,.025,.013);
    ball("PataFrente",skin,side*.125,.064,.15,.065,.095,.082,0);
    ball("PataTras",skin,side*.135,.065,-.16,.073,.084,.078,0);
  }
  ball("Coleira",collar,0,.267,.134,.158,.033,.16,0);
  ball("Plaquinha",collar,0,.214,.282,.034,.04,.024,0);
  const tail=ball("Rabinho",ears,0,.28,-.266,.06,.058,.18,0);
  tail.rotation.x=-.48;
  root.userData.pludogo={tail,feet:root.children.filter(n=>n.name.startsWith("Pata")),
    baseY:root.position.y};
  return root;
}
export function animatePludogo(root,time,walking){
  const state=root?.userData?.pludogo;
  if(!state)return;
  const speed=walking?9:2.2;
  root.position.y=state.baseY+(walking?.026:.014)*Math.sin(time*speed);
  root.rotation.y=.13*Math.sin(time*1.25);
  state.tail.rotation.y=.45*Math.sin(time*4.2);
  for(let i=0;i<state.feet.length;i++)
    state.feet[i].rotation.x=walking?.22*Math.sin(time*speed+(i%2?Math.PI:0)):0;
}
export function disposePludogo(root){
  if(!root)return;
  const materials=new Set();
  root.traverse(obj=>{
    obj.geometry?.dispose?.();
    if(Array.isArray(obj.material))obj.material.forEach(m=>materials.add(m));
    else if(obj.material)materials.add(obj.material);
  });
  for(const m of materials)m.dispose?.();
  root.parent?.remove(root);
}
