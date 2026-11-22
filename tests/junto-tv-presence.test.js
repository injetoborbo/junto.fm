"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const tv=fs.readFileSync(path.join(root,"public/junto-tv.js"),"utf8");
const index=fs.readFileSync(path.join(root,"public/index.html"),"utf8");

test("Junto.TV exposes a live participant list and refreshes it on room presence/profile changes",()=>{
  assert.match(tv,/id="jfTvPeopleList"/);
  assert.match(tv,/id="jfTvPeopleCount"/);
  assert.match(tv,/getPeerIds\?\.\(\)/);
  assert.match(tv,/socket\.on\("peer-joined",renderTvPeople\)/);
  assert.match(tv,/socket\.on\("peer-left",renderTvPeople\)/);
  assert.match(tv,/socket\.on\("profile-update",renderTvPeople\)/);
  assert.match(tv,/jf-room-people-update/);
  assert.match(index,/getPeerClientId:id=>jfPeerClientIds\.get\(id\)\|\|null/);
});

test("Room join and leave sounds are short local tones triggered by peer presence events",()=>{
  assert.match(index,/function jfPresenceSound\(kind\)/);
  assert.match(index,/jfPresenceSound\("enter"\)/);
  assert.match(index,/jfPresenceSound\("leave"\)/);
  assert.match(index,/AudioContextClass=window\.AudioContext\|\|window\.webkitAudioContext/);
});
