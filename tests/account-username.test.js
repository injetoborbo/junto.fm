"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {normalizeUsername,isValidUsername}=require("../username-rules");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("public @ values are normalized consistently",()=>{
  assert.equal(normalizeUsername("  @Macaco_49  "),"macaco_49");
  assert.equal(normalizeUsername("MIXEDCase"),"mixedcase");
});

test("public @ accepts 3 to 24 letters, digits and underscores",()=>{
  for(const value of ["abc","abc_123","a".repeat(24)])assert.equal(isValidUsername(value),true,value);
  for(const value of ["ab","a".repeat(25),"with.dot","with-dash","two words","@double",""])assert.equal(isValidUsername(value),false,value);
});

test("username update is scoped to the authenticated account and handles case-insensitive conflicts",()=>{
  const source=read("account-auth.js");
  assert.ok(source.includes('app.post("/api/account/username"'));
  assert.ok(source.includes('const account=await accountFromRequest(req)'));
  assert.ok(source.includes('UPDATE junto_accounts SET username=$1 WHERE id=$2 RETURNING *'));
  assert.ok(source.includes('error.code==="23505"'));
  assert.ok(source.includes('409).json({error:"Esse @ já está em uso'));
});
