"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../public/junto-tv.js"), "utf8");

function setup() {
  const elements = new Map();
  const events = new Map();
  const pending = [];
  const transmissions = [];
  let youtube = null;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden:false, disabled:false, value:"", style:{}, title:"",
      classList:{toggle(){}},querySelectorAll(){return [];},addEventListener(){},
      appendChild(){},setAttribute(){},focus(){},
      set innerHTML(s){this.html=s;},
      set textContent(s){this.text=s;},
      get textContent(){return this.text;}
    });
    return elements.get(id);
  }
  const socket = {
    id:"guest",
    on(name,cb){events.set(name,cb);},
    emit(name,payload){transmissions.push({name,payload});}
  };
  const document = {
    getElementById:element,
    createElement:()=>element("node"+elements.size),
    head:{appendChild(){}},body:{appendChild(){}}
  };
  function FakePlayer(_node,opts) {
    let playing=2,seconds=0;
    youtube={
      opts,calls:[],
      getPlayerState:()=>playing,
      getCurrentTime:()=>seconds,
      getDuration:()=>120,
      cueVideoById:obj=>{youtube.calls.push(["cue",obj]);playing=5;},
      loadVideoById:obj=>{youtube.calls.push(["load",obj]);playing=1;},
      playVideo:()=>{youtube.calls.push(["play"]);playing=1;},
      pauseVideo:()=>{youtube.calls.push(["pause"]);playing=2;},
      // Simular navegador que continua reproduzindo após seek durante buffering.
      seekTo:x=>{youtube.calls.push(["seek",x]);seconds=x;playing=1;},
      mute:()=>youtube.calls.push(["mute"]),
      unMute:()=>youtube.calls.push(["unmute"])
    };
    return youtube;
  }
  const window = {jfSocialSocket:socket,YT:{Player:FakePlayer}};
  const timer = (fn,ms)=>{pending.push({fn,ms});return pending.length;};
  vm.runInNewContext(source,{
    document,window,navigator:{},console:{debug(){},warn(){},error(){}},
    setInterval:timer,setTimeout:timer,URL
  },{filename:"public/junto-tv.js"});
  return {
    elements,events,pending,transmissions,
    get youtube(){return youtube;},
    room(){events.get("joined-room")({room:"teste",ownerId:"owner"});},
    async openYoutube() {
      const base={mode:"youtube",videoId:"dQw4w9WgXcQ",hostId:"owner",updatedAt:Date.now(),serverNow:Date.now()};
      events.get("tv:state")({...base,seconds:10,playing:false,revision:1});
      element("jfTvLaunch").onclick();
      await Promise.resolve();await Promise.resolve();await Promise.resolve();
      assert.ok(youtube,"YouTube player precisa ser criado ao abrir a janela");
      youtube.opts.events.onReady();
      return base;
    }
  };
}

test("Ouvinte pausa de imediato mesmo quando seek do YouTube tenta religar reprodução",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  app.events.get("tv:playback")({...base,seconds:20,playing:true,revision:2,action:"play"});
  const before=app.youtube.calls.length;
  app.events.get("tv:playback")({...base,seconds:21,playing:false,revision:3,action:"pause"});
  const actions=app.youtube.calls.slice(before).map(x=>x[0]);
  assert.ok(actions.includes("pause"),"O pause precisa chegar diretamente ao YouTube");
  assert.equal(actions.at(-1),"pause","A última ordem deve ser PAUSE, mesmo após SEEK");
  assert.equal(app.youtube.getPlayerState(),2);
  const after=app.youtube.calls.length;
  app.events.get("tv:state")({...base,seconds:21,playing:false,revision:3});
  assert.equal(app.youtube.calls.length,after,"Duplicação do mesmo comando não deve reprocessar");
});

test("PLAY posterior cancela reforços atrasados de PAUSE",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  app.events.get("tv:playback")({...base,seconds:20,playing:true,revision:2,action:"play"});
  app.events.get("tv:playback")({...base,seconds:21,playing:false,revision:3,action:"pause"});
  app.events.get("tv:playback")({...base,seconds:21,playing:true,revision:4,action:"play"});
  const before=app.youtube.calls.length;
  for (const task of app.pending) if(task.ms===90||task.ms===250||task.ms===650||task.ms===1200)task.fn();
  assert.equal(app.youtube.calls.slice(before).some(x=>x[0]==="pause"),false,
    "Um reforço antigo não pode pausar um PLAY novo");
});
