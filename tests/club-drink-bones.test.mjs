import test from "node:test";
import assert from "node:assert/strict";
import {drinkBoneRole,resolveDrinkBones,sipBlend} from "../public/club-drink-bones.mjs";

function makeRig(){
  const root={name:"rig",children:[]};
  function node(name,parent=root){
    const n={name,isBone:true,parent,children:[]};
    parent.children.push(n);
    return n;
  }
  root.traverse=function visit(callback){
    function walk(current){
      callback(current);
      for(const child of current.children||[])walk(child);
    }
    walk(root);
  };
  return {root,node};
}
test("Mixamo: osso RightArm/RightForeArm/RightHand forma cadeia valida",()=>{
  const {root,node}=makeRig();
  const chest=node("mixamorig:Spine");
  const head=node("mixamorig:Head",chest);
  const arm=node("mixamorig:RightArm",chest);
  const forearm=node("mixamorig:RightForeArm",arm);
  const hand=node("mixamorig:RightHand",forearm);
  const result=resolveDrinkBones(root);
  assert.deepEqual([result.head,result.upperArm,result.forearm,result.hand],[head,arm,forearm,hand]);
});
test("AccuRig: selecionar mao direita e ignorar a esquerda",()=>{
  const {root,node}=makeRig();
  const chest=node("CC_Base_Spine02");
  const head=node("CC_Base_Head",chest);
  const left=node("CC_Base_L_Upperarm",chest);
  const leftFore=node("CC_Base_L_Forearm",left);
  node("CC_Base_L_Hand",leftFore);
  const upper=node("CC_Base_R_Upperarm",chest);
  const elbow=node("CC_Base_R_Forearm",upper);
  const hand=node("CC_Base_R_Hand",elbow);
  assert.deepEqual(resolveDrinkBones(root),{head,hand,forearm:elbow,upperArm:upper});
});
test("Blender: suporta nomes com sufixo .R",()=>{
  const {root,node}=makeRig();
  const head=node("Head");
  const upper=node("upper_arm.R");
  const elbow=node("forearm.R",upper);
  const hand=node("hand.R",elbow);
  assert.deepEqual(resolveDrinkBones(root),{head,hand,forearm:elbow,upperArm:upper});
});
test("Nao seleciona dedo, mao esquerda ou ponta da cabeca",()=>{
  assert.equal(drinkBoneRole("CC_Base_L_Hand"),null);
  assert.equal(drinkBoneRole("HeadTop_End"),null);
  assert.equal(drinkBoneRole("RightHandIndex1"),null);
  assert.equal(resolveDrinkBones(makeRig().root).hand,null);
});
test("Curva do gole inicia e termina no repouso e segura perto da boca",()=>{
  assert.equal(sipBlend(0),0);
  assert.equal(sipBlend(2900),0);
  assert.ok(sipBlend(1200)>.95);
  assert.ok(sipBlend(2100)>.9);
  assert.ok(sipBlend(200)>0&&sipBlend(200)<1);
  assert.ok(sipBlend(2700)>0&&sipBlend(2700)<1);
});
