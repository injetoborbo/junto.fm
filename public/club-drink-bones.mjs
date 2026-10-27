// Identifica articulacoes de beber sem assumir um unico padrao de rig.
// AccuRig/ActorCore, Mixamo e Blender usam nomes diferentes para os mesmos ossos.
export function drinkBoneRole(name){
  const raw=String(name||"").split(/[|/:\\]/).pop();
  const key=raw.replace(/^mixamorig\d*/i,"").replace(/[^a-z0-9]/gi,"").toLowerCase();
  if(!key)return null;
  // Nao confundir HeadTop_End/HeadEnd ou ossos da face com Head.
  if(key==="head"||/(?:ccbase|bip\d*|jbipc|armature)head$/.test(key))return "head";
  const right=(suffix)=>new RegExp("(?:right|r)(?:"+suffix+")$").test(key)
    ||new RegExp("(?:"+suffix+")(?:right|r)$").test(key);
  if(right("hand|wrist"))return "hand";
  if(right("forearm|lowerarm|elbow"))return "forearm";
  if(right("upperarm|arm"))return "upperArm";
  return null;
}

export function resolveDrinkBones(rig){
  const grouped={head:[],hand:[],forearm:[],upperArm:[]};
  rig?.traverse?.(node=>{
    if(!node.isBone)return;
    const role=drinkBoneRole(node.name);
    if(role)grouped[role].push(node);
  });
  const chain=node=>{
    const ancestors=[];
    for(let p=node?.parent;p;p=p.parent)if(p.isBone)ancestors.push(p);
    return ancestors;
  };
  // Preferir uma mao cuja cadeia de ancestrais contenha cotovelo e braco,
  // em vez de escolher ossos de acessorios ou de um rig duplicado.
  const options=grouped.hand.map(hand=>{
    const above=chain(hand);
    const forearm=above.find(x=>grouped.forearm.includes(x))
      ||above[0]||null;
    const foreAbove=chain(forearm);
    const upperArm=foreAbove.find(x=>grouped.upperArm.includes(x))
      ||foreAbove[0]||null;
    const matched=Number(grouped.forearm.includes(forearm))
      +Number(grouped.upperArm.includes(upperArm));
    return {hand,forearm,upperArm,matched};
  }).filter(x=>x.forearm&&x.upperArm&&x.forearm!==x.upperArm);
  options.sort((a,b)=>b.matched-a.matched);
  const arm=options[0]||null;
  const head=grouped.head.find(x=>x.name.replace(/[^a-z0-9]/gi,"").toLowerCase()==="head")
    ||grouped.head[0]||null;
  return {head,hand:arm?.hand||null,forearm:arm?.forearm||null,
    upperArm:arm?.upperArm||null};
}
