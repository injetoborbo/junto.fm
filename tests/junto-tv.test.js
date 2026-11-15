"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const createJuntoTv = require("../junto-tv-server");

function setup() {
  const messages = [];
  const io = {
    listeners: [],
    on(event, cb) { if (event === "connection") this.listeners.push(cb); },
    to(room) { return { emit(event, payload) { messages.push({ room, event, payload }); } }; },
    sockets: { sockets: new Map() }
  };
  const api = createJuntoTv(io, (socket, room) =>
    socket.id === "owner" && socket.data.room === room, () => false);
  const connect = id => {
    const socket = {
      id, data: { room: "teste" }, callbacks: new Map(), outgoing: [],
      on(event, cb) { this.callbacks.set(event, cb); },
      emit(event, payload) { this.outgoing.push({ event, payload }); },
      send(event, payload) {
        const cb = this.callbacks.get(event);
        assert.ok(cb, "Missing socket listener: " + event);
        return cb(payload);
      }
    };
    io.sockets.sockets.set(id, socket);
    io.listeners.forEach(cb => cb(socket));
    return socket;
  };
  return { api, messages, connect };
}

test("Somente o dono define YouTube e controla play/pause", () => {
  const { api, connect } = setup();
  const owner = connect("owner"), guest = connect("guest");
  guest.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  assert.ok(guest.outgoing.some(e => e.event === "tv:error"));
  owner.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  guest.send("tv:control", { action: "play" });
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing, false);
  owner.send("tv:control", { action: "play" });
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing, true);
});
test("Rejeita IDs do YouTube não verificados", () => {
  const { api, connect } = setup();
  const owner = connect("owner");
  owner.send("tv:set-youtube", { videoId: "https://attacker.example" });
  api.joined(owner);
  assert.equal(owner.outgoing.at(-1).payload, null);
});
test("Convida só espectadores autorizados para transmissão P2P", () => {
  const { connect, messages } = setup();
  const owner = connect("owner"), guest = connect("guest"), stranger = connect("stranger");
  owner.send("tv:start-stream", { mode: "screen" });
  guest.send("tv:watch");
  assert.ok(messages.some(e => e.room === "owner" && e.event === "tv:viewer-joined"));
  stranger.send("tv:signal", { to: "owner", data: { type: "answer", sdp: "v=0" } });
  assert.equal(owner.outgoing.some(e => e.event === "tv:signal"), false);
  owner.send("tv:signal", { to: "guest", data: { type: "offer", sdp: "v=0" } });
  assert.ok(guest.outgoing.some(e => e.event === "tv:signal"));
  guest.send("tv:unwatch");
  assert.ok(messages.some(e => e.room === "owner" && e.event === "tv:viewer-left"));
});
test("LiveKit aceita todos os participantes da sala, inclusive após o quarto", () => {
  const { connect, messages } = setup();
  const owner = connect("owner");
  owner.send("tv:start-stream", { mode: "local" });
  for (let i = 0; i < 24; i++) {
    const viewer=connect("viewer" + i);viewer.send("tv:watch");viewer.send("tv:watch");
    assert.equal(viewer.outgoing.some(e => e.event === "tv:error"),false);
  }
  assert.equal(messages.filter(e=>e.event==="tv:viewer-joined").length,24);
});
test("Parar a TV e sair da sala limpam o estado", () => {
  const { api, connect } = setup();
  const owner = connect("owner"), guest = connect("guest");
  owner.send("tv:start-stream", { mode: "screen" });
  api.leave("teste", "owner");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
  owner.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  api.joined(guest);
  assert.ok(guest.outgoing.at(-1).payload);
  owner.send("tv:stop");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
  owner.send("tv:start-stream", { mode: "local" });
  owner.send("tv:stop");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
});

test("Comandos imediatos trazem revisões; sync antigo não desfaz pause", () => {
  const { api, connect } = setup();
  const owner=connect("owner"), guest=connect("guest");
  owner.send("tv:set-youtube",{videoId:"dQw4w9WgXcQ"});
  owner.send("tv:control",{action:"play",seconds:15});
  api.joined(guest);
  const playing=guest.outgoing.at(-1).payload;
  assert.equal(playing.playing,true);
  assert.equal(playing.seconds,15);
  owner.send("tv:control",{action:"pause",seconds:16.2});
  api.joined(guest);
  const paused=guest.outgoing.at(-1).payload;
  assert.equal(paused.playing,false);
  assert.equal(paused.seconds,16.2);
  assert.ok(paused.revision>playing.revision);
  owner.send("tv:sync",{seconds:50,playing:true,revision:playing.revision});
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing,false);
  assert.equal(guest.outgoing.at(-1).payload.seconds,16.2);
  owner.send("tv:control",{action:"play",seconds:16.2});
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing,true);
});

test("Pausa gera evento prioritário de reprodução e confirmação para o ADM", () => {
  const { api, connect, messages } = setup();
  const owner=connect("owner"), guest=connect("guest");
  owner.send("tv:set-youtube",{videoId:"dQw4w9WgXcQ"});
  owner.send("tv:control",{action:"play",seconds:23});
  const before=messages.length;
  owner.send("tv:control",{action:"pause",seconds:24.2});
  const newMessages=messages.slice(before);
  const fast=newMessages.find(m=>m.event==="tv:playback");
  const slow=newMessages.find(m=>m.event==="tv:state");
  assert.ok(fast, "Ouvintes precisam receber pausa prioritária");
  assert.equal(fast.room,"teste");
  assert.equal(fast.payload.action,"pause");
  assert.equal(fast.payload.playing,false);
  assert.equal(fast.payload.seconds,24.2);
  assert.ok(newMessages.indexOf(fast)<newMessages.indexOf(slow),"Pause prioritário antes do estado padrão");
  assert.equal(owner.outgoing.at(-1).event,"tv:control-result");
  assert.equal(owner.outgoing.at(-1).payload.ok,true);
  assert.equal(owner.outgoing.at(-1).payload.revision,fast.payload.revision);
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing,false);
});
test("Comando de ouvinte é rejeitado e não gera falso pause", () => {
  const { connect, messages } = setup();
  const owner=connect("owner"), guest=connect("guest");
  owner.send("tv:set-youtube",{videoId:"dQw4w9WgXcQ"});
  const before=messages.length;
  guest.send("tv:control",{action:"pause",seconds:99});
  assert.equal(guest.outgoing.some(m=>m.event==="tv:control-result"&&m.payload.ok===false),true);
  assert.equal(messages.slice(before).some(m=>m.event==="tv:playback"),false);
});


test("Estado local só aceita ADM e mantém pausa/posição para novos participantes",()=>{
  const {api,connect}=setup(),host=connect("owner"),guest=connect("guest");
  host.send("tv:start-stream",{mode:"local"});
  guest.send("tv:local-state",{playing:false,seconds:40,duration:120});
  api.joined(guest);assert.equal(guest.outgoing.at(-1).payload.playing,true);
  host.send("tv:local-state",{playing:false,seconds:40,duration:120});
  const late=connect("late");api.joined(late);
  assert.equal(late.outgoing.at(-1).payload.playing,false);assert.equal(late.outgoing.at(-1).payload.seconds,40);
  host.send("tv:local-state",{playing:true,seconds:Infinity,duration:120});api.joined(late);
  assert.equal(late.outgoing.at(-1).payload.playing,false);
  host.send("tv:local-state",{playing:true,seconds:40,duration:120});api.joined(late);
  assert.equal(late.outgoing.at(-1).payload.playing,true);
});
test("Espectador de outra sala não ganha acesso ao LiveKit",async()=>{
  const old={url:process.env.LIVEKIT_URL,key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET};
  process.env.LIVEKIT_URL="wss://test.example.org";process.env.LIVEKIT_API_KEY="test";process.env.LIVEKIT_API_SECRET="test-secret-at-least-32-characters-long";
  try{
    const {connect}=setup(),host=connect("owner");host.send("tv:start-stream",{mode:"local"});
    for(let i=0;i<8;i++){
      const v=connect("viewer"+i);v.send("tv:watch");
      const result=await new Promise(resolve=>v.callbacks.get("tv:livekit-token")({publish:false},resolve));
      assert.equal(result.ok,true);assert.equal(typeof result.token,"string");
    }
    const stranger=connect("stranger");stranger.data.room="different";
    const denied=await new Promise(resolve=>stranger.callbacks.get("tv:livekit-token")({publish:false},resolve));assert.equal(denied.ok,false);
  }finally{
    for(const [name,value] of [["LIVEKIT_URL",old.url],["LIVEKIT_API_KEY",old.key],["LIVEKIT_API_SECRET",old.secret]])if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
test("Archive: consulta metadados sem substituir outro vídeo escolhido durante a espera",async()=>{
 const previous=globalThis.fetch;let resolve;
 globalThis.fetch=()=>new Promise(r=>{resolve=()=>r({ok:true,text:async()=>JSON.stringify({files:[{name:"Episode 1.ia.mp4"}]})});});
 try{
  const {api,connect}=setup(),host=connect("owner"),guest=connect("guest");
  const first=host.send("tv:set-link",{url:"https://archive.org/details/series/Episode+1.mp4"});
  resolve();await first;api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.url,"https://archive.org/download/series/Episode%201.ia.mp4");
  assert.equal(guest.outgoing.at(-1).payload.format,"direct");
  const late=host.send("tv:set-link",{url:"https://archive.org/details/series/Episode+1.mp4"});
  host.send("tv:set-youtube",{videoId:"dQw4w9WgXcQ"});resolve();await late;api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.mode,"youtube");
  host.send("tv:stop");const cancelled=host.send("tv:set-link",{url:"https://archive.org/details/series/Episode+1.mp4"});
  host.send("tv:stop");resolve();await cancelled;api.joined(guest);assert.equal(guest.outgoing.at(-1).payload,null);
 }finally{globalThis.fetch=previous;}
});
