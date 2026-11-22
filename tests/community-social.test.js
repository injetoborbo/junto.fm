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
  assert.match(html,/not\\(#jfHomeCommunity\\)/);
});

test("messenger renders user content as text and refreshes its conversation state",()=>{
  const source=read("public/community-social.js");
  assert.match(source,/bubble\.textContent=message\.body/);
  assert.match(source,/socket\.emit\("dm-send"/);
  assert.match(source,/socket\.on\("dm-history"/);
  assert.match(source,/socket\.on\("dm-message"/);
  assert.match(source,/socket\.emit\("dm-list"/);
});

test("messenger has a compact mobile layout",()=>{
  const css=read("public/community-social.css");
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/grid-template-columns:112px/);
});
