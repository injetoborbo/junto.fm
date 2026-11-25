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


test("users can update their own public @ and the UI exposes a separate editor",()=>{
  const accounts=read("account-auth.js");
  const html=read("public/index.html");
  const messenger=read("public/community-social.js");
  assert.ok(accounts.includes('app.post("/api/account/username"'));
  assert.ok(accounts.includes('UPDATE junto_accounts SET username=$1 WHERE id=$2 RETURNING *'));
  assert.ok(accounts.includes('error.code==="23505"'));
  assert.ok(accounts.includes('accountFromRequest(req)'));
  assert.ok(html.includes('id="jfUsernameEditor"'));
  assert.ok(html.includes('id="jfSaveUsername"'));
  assert.ok(html.includes('fetch("/api/account/username"'));
  assert.ok(messenger.includes('jf-account-username-updated'));
});

test("Google-created 23-character usernames can open public profile pages",async()=>{
  const source=read("community-profiles.js");
  const accounts=read("account-auth.js");
  assert.match(accounts,/\"macaco_\"\+crypto\.randomBytes\(8\)\.toString\(\"hex\"\)/);
  assert.ok(source.includes("{3,24}"),"the public route accepts the generated 23-character username");
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


test("new community and standalone pages inherit the selected site theme",()=>{
  const bridge=read("public/theme-bridge.js");
  assert.match(bridge,/localStorage\.getItem\(key\)/);
  assert.match(bridge,/\"junto_theme\"/);
  assert.ok(bridge.includes("root.dataset.jfTheme = name"),"the stored theme is applied to the document");
  assert.match(bridge,/--jf-ui-panel/);
  assert.match(read("public/index.html"),/theme-bridge\.js/);
  assert.match(read("public/quartos.html"),/theme-bridge\.js/);
  assert.match(read("public/mural.html"),/theme-bridge\.js/);
  assert.match(read("public/community-social.css"),/var\(--jf-ui-panel/);
  assert.match(read("public/quartos.css"),/herda a aparência escolhida/);
  assert.match(read("public/mural.css"),/mesma paleta selecionada/);
});


test("presence and listening sync only disclose friends to authenticated users",()=>{
  const source=read("community-classics.js");
  assert.match(source,/async function sendPresenceState\(socket\)/);
  assert.match(source,/const friends=await accounts\.friends\(id\),friendIds=new Set\(friends\.map\(friend=>friend\.id\)\)/);
  assert.match(source,/filter\(friendId=>friendIds\.has\(friendId\)\)/);
  assert.match(source,/filter\(\(\[friendId\]\)=>friendIds\.has\(friendId\)\)/);
  assert.match(source,/social-presence-sync",\(\)=>void sendPresenceState\(socket\)/);
  assert.match(source,/if\(!id\)\{[\s\S]*?social-presence-state",\{online:\[\],listening:\[\]\}\);return;/);
});

test("offline MSN nudge status does not claim deferred delivery",()=>{
  const source=read("public/community-social.js");
  assert.match(source,/Seu amigo está offline; chamada não entregue/);
  assert.doesNotMatch(source,/offline; ele verá quando entrar/);
});

test("community and scrapbook styling use theme variables with a retro UI treatment",()=>{
  const css=read("public/community-classics.css");
  const profile=read("public/community-classics-profile.css");
  assert.match(css,/var\(--jf-ui-panel/);
  assert.match(css,/var\(--jf-ui-button/);
  assert.match(profile,/var\(--jf-ui-panel/);
  assert.match(css,/border:2px ridge/);
  assert.match(read("public/communities.html"),/theme-bridge\.js/);
});


test("social socket events revalidate the account session after logout",()=>{
  const source=read("community-classics.js");
  assert.match(source,/async function currentSocialAccount\(socket\)/);
  assert.match(source,/accounts\.accountFromRequest\(socket\.request\)/);
  assert.match(source,/const sender=await currentSocialAccount\(socket\)/);
  assert.match(source,/const account=await currentSocialAccount\(socket\),id=account\?\.id/);
  assert.match(source,/const recipient=await currentSocialAccount\(peer\)/);
  assert.match(source,/const sender=await currentSocialAccount\(socket\)/);
});
