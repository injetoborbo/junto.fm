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
  const parent={insertBefore(node){node.parentNode=this;},appendChild(node){node.parentNode=this;}};
  const dialog={appendChild(node){node.parentNode=this;}};
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      parentNode:parent,closest(){return dialog;},
      id, hidden:false, disabled:false, value:"", style:{}, title:"",
      classList:{values:new Map(),toggle(k,v){this.values.set(k,v);}},querySelectorAll(){return [];},addEventListener(){},
      appendChild(){},replaceChildren(){},setAttribute(){},focus(){},
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
    createComment:()=>({parentNode:parent}),
    createElement:()=>element("node"+elements.size),
    head:{appendChild(){}},body:{appendChild(){}}
  };
  function FakePlayer(_node,opts) {
    let playing=2,seconds=0;
    youtube={
      opts,calls:[],
      setOption:(...args)=>youtube.calls.push(["option",...args]),
      getPlayerState:()=>playing,
      getCurrentTime:()=>seconds,
      getDuration:()=>120,
      cueVideoById:obj=>{youtube.calls.push(["cue",obj]);playing=5;},
      loadVideoById:obj=>{youtube.calls.push(["load",obj]);playing=1;},
      playVideo:()=>{youtube.calls.push(["play"]);playing=1;},
      pauseVideo:()=>{youtube.calls.push(["pause"]);playing=2;},
      stopVideo:()=>{youtube.calls.push(["stop"]);playing=5;},
      getIframe:()=>({setAttribute(){}}),
      simulateState(next){playing=next;opts.events.onStateChange?.({data:next});},
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

test("Ouvinte não consegue iniciar vídeo pausado pelo botão Ativar som",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  const old=app.youtube.calls.length;
  app.elements.get("jfTvSound").onclick();
  const calls=app.youtube.calls.slice(old).map(entry=>entry[0]);
  assert.ok(calls.includes("pause"),"O player deve continuar pausado após ativação de som");
  assert.equal(calls.includes("play"),false,"Clique para habilitar som não permite tocar vídeo pausado");
  assert.equal(app.youtube.getPlayerState(),2);
});

test("onStateChange bloqueia play espontâneo, inclusive durante buffering",async()=>{
  const app=setup();app.room();await app.openYoutube();
  app.youtube.simulateState(3);
  assert.equal(app.youtube.getPlayerState(),2,"BUFFERING externo não pode deixar vídeo rodando");
  app.youtube.simulateState(1);
  assert.equal(app.youtube.getPlayerState(),2,"PLAYING externo precisa ser revertido imediatamente");
  assert.equal(app.elements.get("jfTvYoutubeShield").hidden,false);
});

test("Ao abrir TV do ouvinte, o cliente pede estado recente ao servidor",async()=>{
  const app=setup();app.room();await app.openYoutube();
  assert.ok(app.transmissions.some(e=>e.name==="tv:request-state"),"O cliente deve solicitar ressincronização");
});

test("Ouvinte inicia com som habilitado sem apertar Ativar som",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  assert.ok(app.youtube.calls.some(x=>x[0]==="unmute"),"Som deve ser solicitado no onReady");
  const before=app.youtube.calls.length;
  app.events.get("tv:playback")({...base,seconds:20,playing:true,revision:2,action:"play"});
  const after=app.youtube.calls.slice(before).map(x=>x[0]);
  assert.ok(after.includes("unmute"),"Play do ADM solicita reprodução audível");
  assert.equal(after.includes("mute"),false,"Não iniciar ouvinte silenciosamente");
  assert.equal(app.elements.get("jfTvSound").hidden,true,"Botão manual não deve aparecer quando som é automático");
});
test("Pause do ADM não desativa o som da próxima reprodução",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  app.events.get("tv:playback")({...base,seconds:20,playing:true,revision:2,action:"play"});
  const before=app.youtube.calls.length;
  app.events.get("tv:playback")({...base,seconds:21,playing:false,revision:3,action:"pause"});
  const paused=app.youtube.calls.slice(before).map(x=>x[0]);
  assert.equal(paused.includes("mute"),false,"PAUSE não deve silenciar permanentemente o player");
  app.events.get("tv:playback")({...base,seconds:21,playing:true,revision:4,action:"play"});
  assert.equal(app.youtube.calls.at(-1)[0]==="unmute"||app.youtube.calls.slice(-4).some(x=>x[0]==="unmute"),true);
});
test("Se navegador bloquear autoplay, exibir botão de som sem perder sincronização",async()=>{
  const app=setup();app.room();const base=await app.openYoutube();
  app.events.get("tv:playback")({...base,seconds:20,playing:true,revision:2,action:"play"});
  app.youtube.opts.events.onAutoplayBlocked();
  assert.equal(app.elements.get("jfTvSound").hidden,false,"Exibir fallback somente quando o navegador exigir");
  assert.equal(app.youtube.calls.at(-1)[0],"play","Continua o vídeo mutado quando som é bloqueado");
  app.elements.get("jfTvSound").onclick();
  assert.equal(app.elements.get("jfTvSound").hidden,true,"Esconder fallback depois de liberar som");
  assert.ok(app.youtube.calls.slice(-3).some(x=>x[0]==="unmute"),"Tentar unMute após clique");
});


test("Chat permanece no diálogo ao abrir e volta ao pai original ao fechar",()=>{
 const app=setup();app.room();
 const chat=app.elements.get("jfChatWindow"), original=chat.parentNode;
 app.elements.get("jfTvLaunch").onclick();
 assert.notEqual(chat.parentNode,original);
 assert.equal(chat.parentNode,app.elements.get("jfTvTitle").closest());
 app.elements.get("jfTvClose").onclick();assert.equal(chat.parentNode,original);
});
test("Selo e launcher acompanham YouTube pausado, play e fim",async()=>{
 const app=setup();app.room();const base=await app.openYoutube();
 const badge=app.elements.get("jfTvLiveBadge"),launch=app.elements.get("jfTvLaunch");
 assert.equal(badge.hidden,true);assert.equal(launch.classList.values.get("jf-tv-live"),false);
 app.events.get("tv:playback")({...base,playing:true,revision:2});
 assert.equal(badge.hidden,false);assert.equal(launch.classList.values.get("jf-tv-live"),true);
 app.events.get("tv:state")(null);assert.equal(badge.hidden,true);
});
test("Legendas recebem tentativa de desligamento no ready e na mudança de módulo",async()=>{
 const app=setup();app.room();await app.openYoutube();
 assert.ok(app.youtube.calls.some(x=>x[0]==="option"&&x[1]==="captions"&&x[2]==="track"));
 const before=app.youtube.calls.length;app.youtube.opts.events.onApiChange();
 assert.equal(app.youtube.calls[before][0],"option");
});
