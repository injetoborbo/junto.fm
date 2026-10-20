"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/junto-tv.js"), "utf8");

// Isolamento: simula só a API nativa do navegador. Usa o cliente real,
// inclusive a captura, o RTCRtpSender e o callback tv:viewer-joined.
async function setup(height = 1080, {shareAudio = true, provideAudio = true} = {}) {
  const elements = new Map(), events = new Map(), outbound = [], peers = [];
  let captureConstraints = null;
  let track = null, audioTrack = null;
  const el = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden:false, disabled:false, value:"", style:{}, title:"",
      classList:{toggle(){}}, setAttribute(){}, getAttribute(){return null},
      addEventListener(){}, querySelectorAll(){return [];}, appendChild(){}, focus(){},
      set innerHTML(v){this.html=v;},
      set textContent(v){this.text=v;},
      play(){return Promise.resolve();}
    });
    return elements.get(id);
  };
  const socket = {
    id:"host",
    on(name,listener){events.set(name,listener);},
    emit(name,payload){
      outbound.push({name,payload});
      if(name==="tv:start-stream")events.get("tv:state")?.({
        mode:payload.mode, hostId:"host", playing:true, updatedAt:Date.now()
      });
    }
  };
  class FakePeer {
    constructor(ice){this.ice=ice;this.senders=[];peers.push(this);}
    close(){}
    addTrack(attachedTrack){
      const sender={
        track:attachedTrack, params:null,
        getParameters(){return {encodings:[{}]};},
        setParameters(params){this.params=params;return Promise.resolve();}
      };
      this.senders.push(sender);
      return sender;
    }
    async createOffer(){return {type:"offer",sdp:"fake sdp"};}
    async setLocalDescription(desc){this.localDescription=desc;}
  }
  const navigator={
    mediaDevices:{
      async getDisplayMedia(options){
        captureConstraints=options;
        track={
          kind:"video", contentHint:"",
          getSettings(){return {height,width:Math.round(height*16/9)};},
          stop(){}
        };
        audioTrack=options.audio && provideAudio?{
          kind:"audio",readyState:"live",stop(){},
        }:null;
        return {
          getTracks(){return audioTrack?[track,audioTrack]:[track];},
          getVideoTracks(){return [track];},
          getAudioTracks(){return audioTrack?[audioTrack]:[];}
        };
      }
    }
  };
  const document={
    getElementById:el,
    createElement(){return el("node"+elements.size);},
    head:{appendChild(){}},
    body:{appendChild(){}}
  };
  vm.runInNewContext(source,{
    window:{jfSocialSocket:socket},document,navigator,
    RTCPeerConnection:FakePeer,
    console:{debug(){},warn(){},error(){}},
    setTimeout(){return 1;},
    setInterval(){return 1;},
    URL
  },{filename:"public/junto-tv.js"});
  events.get("joined-room")({room:"qualidade",ownerId:"host"});
  el("jfTvLaunch").onclick();
  el("jfTvCaptureAudio").checked=shareAudio;
  await el("jfTvStartGame").onclick();
  events.get("tv:viewer-joined")({viewerId:"guest"});
  // A oferta e o SDP são assíncronos; aguardar conclusão antes de retornar.
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  return {peers,track,audioTrack,outbound,events,el,get constraints(){return captureConstraints;}};
}

test("Transmissão de tela captura Full HD/30 FPS com áudio e sem TURN",async()=>{
  const app=await setup();
  assert.equal(app.constraints.video.width.ideal,1920);
  assert.equal(app.constraints.video.height.ideal,1080);
  assert.equal(app.constraints.video.frameRate.max,30);
  assert.equal(app.constraints.audio,true);
  assert.equal(app.constraints.systemAudio,"include");
  assert.equal(app.constraints.windowAudio,"window");
  assert.ok(app.audioTrack,"O navegador deve poder devolver áudio junto com vídeo");
  assert.equal(app.peers[0].senders.some(sender=>sender.track.kind==="audio"),true,"O áudio precisa ser adicionado ao WebRTC");
  assert.equal(app.outbound.some(x=>x.name==="tv:start-stream" && x.payload.mode==="screen"),true);
  assert.equal(app.peers.length,1);
  assert.equal(app.peers[0].ice.iceServers.length,1);
  assert.ok(app.peers[0].ice.iceServers[0].urls.startsWith("stun:"));
  assert.equal(app.peers[0].ice.iceServers.some(s=>String(s.urls).includes("turn:")),false);
  assert.equal(app.track.contentHint,"motion");
});
test("1080p não reduz escala e usa até 6 Mbps por espectador",async()=>{
  const app=await setup(1080);
  const video=app.peers[0].senders.find(sender=>sender.track.kind==="video");
  assert.ok(video?.params);
  const params=video.params.encodings[0];
  assert.equal(params.maxBitrate,6000000);
  assert.equal(params.maxFramerate,30);
  assert.equal(params.scaleResolutionDownBy,undefined);
});
test("Captura acima de 1080p ajusta escala, mas nunca recorre a relay",async()=>{
  const app=await setup(2160);
  const video=app.peers[0].senders.find(sender=>sender.track.kind==="video");
  assert.equal(video.params.encodings[0].scaleResolutionDownBy,2);
  assert.equal(app.peers[0].ice.iceServers.length,1);
  assert.equal(app.outbound.some(x=>x.name==="tv:signal"),true);
  assert.equal(app.outbound.some(x=>x.payload && x.payload.track),false,
    "A faixa da tela nunca deve viajar pelo Socket.io");
});
test("Rótulos da interface: Transmissão de tela e compartilhamento amplo",()=>{
  assert.ok(source.includes("Transmissão de tela"));
  assert.ok(source.includes("Compartilhar tela ou janela"));
  assert.ok(source.includes("janela, aba ou tela inteira"));
  assert.equal(source.includes('data-tv-tab="screen"'),true);
});

test("Sem áudio do navegador, transmitir vídeo e avisar o administrador",async()=>{
  const app=await setup(1080,{provideAudio:false});
  assert.equal(app.constraints.audio,true);
  assert.equal(app.peers[0].senders.length,1);
  assert.ok(app.el("jfTvStatus").textContent.includes("SEM áudio"));
  assert.equal(app.outbound.some(x=>x.name==="tv:start-stream"),true);
});
test("ADM pode desativar captura de som para evitar áudio duplicado",async()=>{
  const app=await setup(1080,{shareAudio:false});
  assert.equal(app.constraints.audio,false);
  assert.equal(app.constraints.systemAudio,"exclude");
  assert.equal(app.audioTrack,null);
  assert.equal(app.peers[0].senders.some(sender=>sender.track.kind==="audio"),false);
  assert.ok(app.el("jfTvStatus").textContent.includes("sem áudio por escolha"));
});
