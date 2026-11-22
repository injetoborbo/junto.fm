"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("direct messages are persistent and restricted to authenticated friends",()=>{
  const source=read("direct-messages.js");
  assert.match(source,/CREATE TABLE IF NOT EXISTS junto_dm_messages/);
  assert.match(source,/accounts\.accountFromRequest\(socket\.request\)/);
  assert.match(source,/areFriends\(account\.id,peerId\)/);
  assert.match(source,/Vocês precisam ser amigos para conversar/);
  assert.match(source,/body\.length>2000/);
  assert.match(source,/old\.length>=8/);
  assert.match(source,/UPDATE junto_dm_messages SET read_at=NOW\(\)/);
  assert.match(source,/LIMIT 80/);
  assert.match(source,/LIMIT 150/);
});

test("private messages are delivered only after the recipient session is revalidated",()=>{
  const source=read("direct-messages.js");
  assert.match(source,/const other=await currentAccount\(peer\)/);
  assert.match(source,/if\(other\?\.id===peerId\)/);
});

test("home newspaper links to existing community features without duplicating them",()=>{
  const html=read("public/index.html");
  assert.match(html,/id="jfHomeCommunity"/);
  assert.match(html,/Jornal do Junto/);
  assert.match(html,/id="jfHomeArcade"/);
  assert.match(html,/href="\/mural"/);
  assert.match(html,/href="\/quartos"/);
  assert.match(html,/id="jfHomeAchievements"/);
  assert.match(html,/not\(#jfHomeCommunity\)/);
});

test("public profiles expose only social fields and existing achievement badges",()=>{
  const source=read("community-profiles.js");
  assert.match(source,/app\.get\("\/u\/:username"/);
  assert.match(source,/app\.get\("\/api\/community\/profile\/:username"/);
  assert.match(source,/SELECT id,username,nickname AS name,avatar,motto,created_at/);
  assert.match(source,/SELECT achievement_id,unlocked_at FROM junto_achievements/);
  assert.doesNotMatch(source,/SELECT .*email|password_hash|google_sub/);
  const accounts=read("account-auth.js");
  assert.match(accounts,/a\.username,a\.motto,a\.avatar/);
});

test("messenger renders user content as text and refreshes its conversation state",()=>{
  const source=read("public/community-social.js");
  assert.match(source,/bubble\.textContent=message\.body/);
  assert.match(source,/socket\.emit\("dm-send"/);
  assert.match(source,/socket\.on\("dm-history"/);
  assert.match(source,/socket\.on\("dm-message"/);
  assert.match(source,/socket\.emit\("dm-list"/);
  assert.match(source,/socket\.emit\("dm-open"/);
  assert.match(source,/Ver perfil/);
  assert.match(source,/renderPublicProfilePage/);
});

test("messenger has a compact mobile layout",()=>{
  const css=read("public/community-social.css");
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/grid-template-columns:112px/);
});


test("Google-created 23-character usernames can open public profile pages",async()=>{
  const source=read("community-profiles.js");
  const accounts=read("account-auth.js");
  assert.match(accounts,/\"macaco_\"\+crypto\.randomBytes\(8\)\.toString\(\"hex\"\)/);
  assert.match(source,/USERNAME=\/\^\[a-z0-9_\]\{3,24\}\$\/i);
  const routes={};
  const app={get:(route,handler)=>{routes[route]=handler;}};
  const accountApi={pool:{query:async(sql)=>sql.includes("junto_accounts")?{rowCount:1,rows:[{id:"account-1",username:"macaco_49a47d0c38138731",name:"Macaco",avatar:"",motto:"",created_at:new Date()}]}:{rowCount:0,rows:[]}},ready:Promise.resolve(true),accountFromRequest:async()=>null};
  require("../community-profiles")(app,accountApi);
  const username="macaco_49a47d0c38138731";
  let sentFile=null,nextCalled=false;
  const pageRes={set(){return this;},sendFile(file){sentFile=file;return file;}};
  await routes["/u/:username"]({params:{username}},pageRes,()=>{nextCalled=true;});
  assert.ok(sentFile,"the HTML app shell is served for Google usernames");
  assert.equal(nextCalled,false);
  let apiPayload=null,apiStatus=200;
  const apiRes={set(){return this;},status(value){apiStatus=value;return this;},json(value){apiPayload=value;return value;}};
  await routes["/api/community/profile/:username"]({params:{username}},apiRes);
  assert.equal(apiStatus,200);
  assert.equal(apiPayload.profile.username,username);
});
