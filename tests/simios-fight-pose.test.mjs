import test from "node:test";
import assert from "node:assert/strict";
import {combatBoneRole,sampleCombatPose} from "../public/simios-fight-pose.mjs";

test("identificar ossos do macaco Mixamo, AccuRig e Blender",()=>{
  const cases={
    "mixamorig:RightArm":"rightArm",
    "mixamorig:RightForeArm":"rightForearm",
    "mixamorig:LeftUpLeg":"leftThigh",
    "CC_Base_R_Upperarm":"rightArm",
    "CC_Base_R_Forearm":"rightForearm",
    "CC_Base_R_Thigh":"rightThigh",
    "CC_Base_L_Forearm":"leftForearm",
    "CC_Base_Head":"head",
    "CC_Base_Spine02":"spine",
    "upper_arm.R":"rightArm",
    "forearm.L":"leftForearm",
    "upper_leg.L":"leftThigh"
  };
  for(const [bone,expected] of Object.entries(cases))
    assert.equal(combatBoneRole(bone),expected,bone);
  assert.equal(combatBoneRole("HeadTop_End"),null);
  assert.equal(combatBoneRole("RightHandIndex1"),null);
});
test("soco anima braço e avança em direção ao oponente",()=>{
  const p=sampleCombatPose("soco",385,{side:1});
  assert.ok(p.joints.rightArm[0]<-.7);
  assert.ok(p.root.x>.15);
  assert.ok(sampleCombatPose("soco",900).finished);
});
test("chute anima perna sem usar os braços como pernas",()=>{
  const p=sampleCombatPose("chute",385,{side:-1});
  assert.ok(p.joints.rightThigh[0]<-.7);
  assert.ok(p.joints.rightCalf[0]>.3);
  assert.ok(p.root.x<0);
});
test("erro de golpe ativa esquiva, enquanto acerto ativa reação",()=>{
  const dodge=sampleCombatPose("dodge",310);
  const hurt=sampleCombatPose("hurt",310);
  assert.ok(dodge.root.x<0);
  assert.ok(hurt.root.x<0);
  assert.notEqual(dodge.joints.head[2],hurt.joints.head[2]);
});
test("morte dramática derruba o avatar e vitória ergue os braços",()=>{
  const ko=sampleCombatPose("ko",1800,{side:1});
  const win=sampleCombatPose("victory",1000);
  assert.ok(ko.root.roll< -1);
  assert.ok(ko.root.y<-.3);
  assert.ok(win.joints.leftArm[0]<-2);
  assert.ok(win.joints.rightArm[0]<-2);
});
test("derrota sem KO é diferente de nocaute e respira em repouso",()=>{
  const defeat=sampleCombatPose("defeat",1000);
  const idle=sampleCombatPose("idle",200);
  assert.ok(defeat.root.y<0);
  assert.equal(defeat.root.roll!==0,true);
  assert.equal(idle.root.roll,0);
});
