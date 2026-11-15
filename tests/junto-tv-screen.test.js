"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../public/junto-tv.js"),"utf8");
// Browser and LiveKit boundaries are simulated; the production client runs intact.
function setup({guest=false,provideAudio=true,deferCapture=false,failConnect=false}={}){
  const elements=new Map(),events=new Map(),outbound=[],rooms=[],videos=[],contexts=[];
  let captureConstraints,resolveCapture,stream;
  const parent={insertBefore(n){n.parentNode=this;},appendChild(n){n.parentNode=this;}};
  const el=id=>{
    if(!elements.has(id))elements.set(id,{
      id,hidden:false,value:"",style:{},parentNode:parent,duration:120,currentTime:0,paused:true,muted:false,volume:1,
      classList:{toggle(){},contains(){return false;}},setAttribute(){},getAttribute(){return null},
      closest(){return parent;},querySelector(){return {};},querySelectorAll(){return [];},focus(){},replaceChildren(){},
      addEventListener(n,fn){this["on_"+n]=fn;},appendChild(n){n.parentNode=this;return n;},remove(){},removeAttribute(){},load(){},
      play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},
      captureStream(){return new Stream([track("video")]);}
    });
    return elements.get(id);
  };
  const track=kind=>({kind,stopped:false,stop(){this.stopped=true;},getSettings(){return{width:1920,height:1080};}});
  class Stream{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}getVideoTracks(){return this.tracks.filter(t=>t.kind==="video");}getAudioTracks(){return this.tracks.filter(t=>t.kind==="audio");}}
  class AudioContext{
    constructor(){this.destination={speaker:true};this.nodes=[];contexts.push(this);}
    createMediaElementSource(){const n={connections:[],connect(to){this.connections.push(to);}};this.nodes.push(n);return n;}
    createMediaStreamDestination(){return{stream:new Stream([track("audio")])};}
    createGain(){this.gain={gain:{value:1},connect(){}};return this.gain;}
    resume(){return Promise.resolve();}close(){return Promise.resolve();}
  }
  const socket={id:guest?"guest":"host",on(n,fn){events.set(n,fn);},emit(n,p){
    outbound.push({name:n,payload:p});
    if(n==="tv:start-stream")events.get("tv:state")({mode:p.mode,hostId:"host",playing:true,updatedAt:Date.now()});
    if(n==="tv:stop")events.get("tv:state")(null);
    if(n==="tv:local-state")events.get("tv:state")({mode:"local",hostId:"host",updatedAt:Date.now(),...p});
  },timeout(){return{emit(n,p,reply){outbound.push({name:n,payload:p});reply(null,{ok:true,url:"wss://test.example.org",token:"test"});}};}};
  class Room{
    constructor(options){this.options=options;this.handlers=new Map();this.published=[];rooms.push(this);this.localParticipant={publishTrack:async(t,o)=>this.published.push({track:t,options:o})};}
    on(n,fn){this.handlers.set(n,fn);return this;}
    async connect(url,token,options){if(failConnect)throw new Error("connection failed");this.connection={url,token,options};}
    async disconnect(){this.disconnected=true;this.handlers.get("disconnected")?.();}
  }
  const document={getElementById:el,createComment:()=>({parentNode:parent}),createElement(tag){const n=el(tag+elements.size);if(tag==="video")videos.push(n);return n;},head:{appendChild(){}},body:{appendChild(){}}};
  const navigator={mediaDevices:{getDisplayMedia(options){
    captureConstraints=options;stream=new Stream([track("video"),...(options.audio&&provideAudio?[track("audio")]:[])]);
    return deferCapture?new Promise(r=>resolveCapture=()=>r(stream)):Promise.resolve(stream);
  }}};
  const Client={Room,RoomEvent:{Disconnected:"disconnected",TrackSubscribed:"track",TrackUnsubscribed:"untrack",Reconnecting:"reconnecting",Reconnected:"reconnected"},Track:{Kind:{Video:"video",Audio:"audio"},Source:{ScreenShare:"screen",ScreenShareAudio:"audio"}}};
  vm.runInNewContext(source,{window:{jfSocialSocket:socket,LivekitClient:Client,AudioContext},document,navigator,MediaStream:Stream,
    HTMLMediaElement:{prototype:{captureStream(){}}},URL:{createObjectURL:()=>"blob:test",revokeObjectURL(){}},
    console,setTimeout:()=>1,setInterval:()=>1});
  events.get("joined-room")({room:"room",ownerId:"host"});el("jfTvLaunch").onclick();el("jfTvCaptureAudio").checked=true;
  return{el,events,outbound,rooms,videos,contexts,get constraints(){return captureConstraints;},get stream(){return stream;},resolveCapture:()=>resolveCapture()};
}

test("Tela publica áudio/vídeo uma vez no LiveKit com perfil 1080p/30 e 3 Mbps",async()=>{
  const app=setup();await app.el("jfTvStartGame").onclick();
  assert.equal(app.constraints.video.width.ideal,1920);assert.equal(app.constraints.video.frameRate.max,30);
  assert.equal(app.constraints.audio,true);assert.equal(app.constraints.systemAudio,"include");
  const room=app.rooms[0];assert.equal(room.published.length,2);
  assert.equal(room.published[0].options.videoEncoding.maxBitrate,3000000);
  assert.equal(room.published[0].options.videoEncoding.maxFramerate,30);assert.equal(room.published[0].options.simulcast,true);
  for(let i=0;i<20;i++)app.events.get("tv:viewer-joined")({viewerId:"v"+i});
  assert.equal(app.rooms.length,1);assert.equal(room.published.length,2);
});
test("Sem áudio de captura há aviso claro; escolha de não compartilhar áudio é respeitada",async()=>{
  const app=setup({provideAudio:false});await app.el("jfTvStartGame").onclick();
  assert.equal(app.rooms[0].published.length,1);assert.match(app.el("jfTvStatus").textContent,/SEM áudio/);
  const muted=setup();muted.el("jfTvCaptureAudio").checked=false;await muted.el("jfTvStartGame").onclick();
  assert.equal(muted.constraints.audio,false);assert.equal(muted.constraints.systemAudio,"exclude");assert.equal(muted.rooms[0].published.length,1);
});
test("Fechar TV durante seletor de tela descarta captura tardia",async()=>{
  const app=setup({deferCapture:true});const pending=app.el("jfTvStartGame").onclick();
  app.el("jfTvClose").onclick();app.resolveCapture();await pending;
  assert.equal(app.rooms.length,0);assert.equal(app.stream.getTracks().every(t=>t.stopped),true);
});
test("Arquivo local tem pausa, seek e monitor de volume separado da publicação",async()=>{
  const app=setup();app.el("jfTvFile").files=[{type:"video/mp4",name:"episode.mp4"}];
  await app.el("jfTvStartLocal").onclick();const video=app.videos[0],room=app.rooms[0],audio=app.contexts[0];
  assert.equal(room.published.length,2);assert.equal(room.published[0].options.videoEncoding.maxBitrate,4000000);
  assert.equal(app.el("jfTvLocalControls").hidden,false);
  await app.el("jfTvLocalPlay").onclick();assert.equal(video.paused,true);
  app.el("jfTvLocalSeek").value="70";app.el("jfTvLocalSeek").onchange();assert.equal(video.currentTime,70);
  app.el("jfTvLocalBack").onclick();assert.equal(video.currentTime,60);
  app.el("jfTvLocalForward").onclick();assert.equal(video.currentTime,70);
  await app.el("jfTvLocalPlay").onclick();assert.equal(video.paused,false);
  app.el("jfTvStreamVolume").value="0.2";app.el("jfTvStreamVolume").oninput();assert.equal(audio.gain.gain.value,0.2);
  app.el("jfTvStreamMute").onclick();assert.equal(audio.gain.gain.value,0);
  assert.equal(audio.nodes[0].connections.length,2);assert.ok(audio.nodes[0].connections[0].stream);
  assert.equal(room.published.length,2);assert.equal(app.rooms.length,1);
  const updates=app.outbound.filter(x=>x.name==="tv:local-state");assert.ok(updates.some(x=>!x.payload.playing));assert.equal(updates.at(-1).payload.playing,true);
});
test("Ouvinte ajusta só seu som e consegue reconectar após desconexão final",async()=>{
  const app=setup({guest:true});app.events.get("tv:state")({mode:"local",hostId:"host",playing:true});
  await app.el("jfTvWatch").onclick();const room=app.rooms[0];
  const audio={style:{},play:()=>Promise.resolve(),pause(){},remove(){}};
  room.handlers.get("track")({kind:"audio",attach:()=>audio});
  app.el("jfTvStreamVolume").value="0.35";app.el("jfTvStreamVolume").oninput();assert.equal(audio.volume,0.35);
  await app.el("jfTvLocalPlay").onclick();assert.equal(app.outbound.some(x=>x.name==="tv:local-state"),false);
  room.handlers.get("disconnected")();assert.equal(app.el("jfTvWatch").disabled,false);
  assert.match(app.el("jfTvStatus").textContent,/reconectar/);
  await app.el("jfTvWatch").onclick();assert.equal(app.rooms.length,2);
});

test("Falha na publicação não aparece como transmissão bem-sucedida",async()=>{
 const app=setup({failConnect:true});await app.el("jfTvStartGame").onclick();
 assert.match(app.el("jfTvStatus").textContent,/Falha ao publicar/);
 assert.ok(app.stream.getTracks().every(t=>t.stopped));
});
