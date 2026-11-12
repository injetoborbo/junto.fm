/* Poses procedurais para o MACACO 3D atual.
 * Nao depende de um FBX externo ou nomes exatos do rig Mixamo/AccuRig.
 * Cada quadro restaura as quaternions originais, evitando acumulo/deformacao.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
const pulse=(t,from=.12,peak=.38,end=.84)=>t<=from||t>=end?0:
  t<peak?smooth((t-from)/(peak-from)):1-smooth((t-peak)/(end-peak));

export function combatBoneRole(name){
  const raw=String(name||"").split(/[|/:\\]/).pop();
  // Normalizar separadores ANTES de remover prefixo CC_Base_/mixamorig.
  const key=raw.replace(/[^a-z0-9]/gi,"")
    .replace(/^(?:mixamorig\d*|ccbase)/i,"").toLowerCase();
  if(key==="head"||key==="neck")return key;
  if(/^(?:spine\d*|chest|upperchest)$/.test(key))return "spine";
  if(key==="hips"||key==="pelvis")return "hips";
  const sides=[["right",/^(?:right|r)/],["left",/^(?:left|l)/]];
  for(const [side,re] of sides){
    if(!re.test(key))continue;
    const part=key.replace(re,"");
    if(/^(?:arm|upperarm|shoulder)$/.test(part))return side+"Arm";
    if(/^(?:forearm|lowerarm|elbow)$/.test(part))return side+"Forearm";
    if(/^(?:upleg|upperleg|thigh)$/.test(part))return side+"Thigh";
    if(/^(?:leg|lowerleg|calf|shin)$/.test(part))return side+"Calf";
  }
  // Blender tipicamente usa upper_arm.R/forearm.L.
  const suffix=String(raw).match(/(?:^|[._-])([RL])$/i);
  if(suffix){
    const side=suffix[1].toUpperCase()==="R"?"right":"left";
    const part=raw.replace(/[._-][RL]$/i,"").toLowerCase().replace(/[^a-z]/g,"");
    if(/^(?:upperarm|arm)$/.test(part))return side+"Arm";
    if(/^(?:forearm|lowerarm)$/.test(part))return side+"Forearm";
    if(/^(?:upperleg|thigh)$/.test(part))return side+"Thigh";
    if(/^(?:lowerleg|calf|shin|leg)$/.test(part))return side+"Calf";
  }
  return null;
}
const ease=smooth;
export function sampleCombatPose(kind,elapsedMs=0,{side=1}={}){
  const ms=Math.max(0,Number(elapsedMs)||0);
  const t=clamp(ms/860),attack=pulse(t),defend=pulse(t,.03,.23,.95);
  const joints={head:[0,0,0],spine:[0,0,0],
    rightArm:[-.14,0,.12],rightForearm:[-.18,0,0],
    leftArm:[-.14,0,-.12],leftForearm:[-.18,0,0],
    rightThigh:[0,0,0],rightCalf:[0,0,0],
    leftThigh:[0,0,0],leftCalf:[0,0,0]};
  const root={x:0,y:0,roll:0,pitch:0};
  switch(kind){
    case "soco":
      joints.rightArm=[-1.35*attack,.1*attack,-.25*attack];
      joints.rightForearm=[-.72*attack,0,0];
      joints.leftArm=[-.28*attack,0,.25*attack];
      joints.spine=[.15*attack,0,-.12*attack];
      root.x=side*.34*attack;root.roll=-side*.08*attack;break;
    case "chute":
      joints.rightThigh=[-1.35*attack,0,-.08*attack];
      joints.rightCalf=[.75*attack,0,0];
      joints.leftArm=[-.60*attack,0,-.15*attack];
      joints.rightArm=[-.35*attack,0,.18*attack];
      joints.spine=[-.08*attack,0,.24*attack];
      root.x=side*.30*attack;root.y=.12*attack;root.roll=side*.12*attack;break;
    case "forte":
      joints.rightArm=[-1.65*attack,.18*attack,-.22*attack];
      joints.rightForearm=[-.88*attack,0,0];
      joints.leftArm=[-.95*attack,-.10*attack,.2*attack];
      joints.spine=[.20*attack,0,-.20*attack];
      root.x=side*.48*attack;root.roll=-side*.16*attack;break;
    case "defender":
      joints.rightArm=[-.95*defend,0,-.30*defend];
      joints.leftArm=[-.95*defend,0,.30*defend];
      joints.rightForearm=[-1.1*defend,0,0];
      joints.leftForearm=[-1.1*defend,0,0];
      root.x=-side*.05*defend;break;
    case "dodge":{
      const q=pulse(t,.1,.3,.9);
      joints.spine=[-.22*q,0,.35*q];joints.head=[0,0,-.32*q];
      root.x=-side*.30*q;root.y=-.09*q;root.roll=side*.20*q;break;
    }
    case "hurt":{
      const q=pulse(t,.12,.35,.93);
      joints.spine=[.23*q,0,-.24*q];joints.head=[-.16*q,0,.26*q];
      joints.rightArm=[-.32*q,0,.45*q];joints.leftArm=[-.32*q,0,-.45*q];
      root.x=-side*.19*q;root.roll=-side*.10*q;break;
    }
    case "ko":{
      const q=ease(ms/1700);
      const flop=pulse(clamp(ms/1700),.02,.35,.98);
      joints.spine=[.6*q,0,-.3*q];joints.head=[-.35*q,0,.38*q];
      joints.rightArm=[-.7*flop,0,.7*q];
      joints.leftArm=[-.8*flop,0,-.9*q];
      joints.rightThigh=[.3*q,0,0];joints.leftThigh=[-.2*q,0,0];
      root.roll=-side*1.45*q;root.y=-.39*q;root.x=-side*.40*q;break;
    }
    case "victory":{
      const q=ease(ms/850),bounce=q*Math.abs(Math.sin(ms*.008));
      joints.rightArm=[-2.35*q,0,.25*q];
      joints.leftArm=[-2.35*q,0,-.25*q];
      joints.rightForearm=[-.20*q,0,0];joints.leftForearm=[-.20*q,0,0];
      joints.head=[-.16*q,0,.09*Math.sin(ms*.005)*q];
      root.y=.12*bounce;root.roll=.06*Math.sin(ms*.006)*q;break;
    }
    case "defeat":{
      const q=ease(ms/950);
      joints.head=[.35*q,0,-.15*q];joints.spine=[.27*q,0,.09*q];
      joints.rightArm=[.25*q,0,.18*q];joints.leftArm=[.25*q,0,-.18*q];
      root.y=-.12*q;root.roll=side*.12*q;break;
    }
    default: {
      const breath=.02*Math.sin(ms*.0024);
      joints.spine=[breath,0,0];joints.rightArm=[-.2+breath,0,.12];
      joints.leftArm=[-.2+breath,0,-.12];
    }
  }
  return {root,joints,finished:ms>=860};
}
export function bindCombatRig(THREE,avatar,{side=1,x=0}={}){
  const bones=new Map(),rest=new Map();
  avatar.rig?.traverse(node=>{
    if(!node.isBone)return;
    rest.set(node,node.quaternion.clone());
    const role=combatBoneRole(node.name);
    if(role&&!bones.has(role))bones.set(role,node);
  });
  return {group:avatar.group,bones,rest,side,baseX:x,baseY:.82,
    baseYaw:side===1?Math.PI/2:-Math.PI/2,
    apply(kind,elapsed=0){
      const pose=sampleCombatPose(kind,elapsed,{side});
      for(const [bone,q] of rest)bone.quaternion.copy(q);
      const euler=new THREE.Euler(0,0,0,"XYZ"),offset=new THREE.Quaternion();
      for(const [role,xyz] of Object.entries(pose.joints)){
        const bone=bones.get(role);
        if(!bone)continue;
        euler.set(...xyz);
        offset.setFromEuler(euler);
        bone.quaternion.multiply(offset).normalize();
      }
      avatar.group.position.set(x+pose.root.x,this.baseY+pose.root.y,0);
      avatar.group.rotation.set(pose.root.pitch,this.baseYaw,pose.root.roll,"YXZ");
      avatar.rig?.updateMatrixWorld?.(true);
    }
  };
}
