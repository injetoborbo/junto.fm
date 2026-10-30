"use strict";
// Teste de integração sem YouTube externo: dois clientes da página real
// conversam com o backend real da TV usando um Socket.io simulado.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const buildTv=require("../junto-tv-server");
const source=fs.readFileSync(path.join(__dirname,"../public/junto-tv.js"),"utf8");

async function createRoom(){
  const sockets=new Map(),serverConnections=[];
  const io={
    on(event,callback){if(event==="connection")serverConnections.push(callback);},
    to(room){return{emit(name,payload){
      for(const socket of sockets.values())if(socket.data.room===room)socket.emit(name,payload);
    }}},
    sockets:{sockets}
  };
  const tv=buildTv(io,(socket,room)=>socket.id==="host"&&socket.data.room===room,()=>false);
  const clients=new Map();
  function connect(id){
    const clientListeners=new Map(),serverListeners=new Map();
    const sent=[],timers=[],elements=new Map(),players=[];
    // DOM minimo fiel ao reparenting do chat: createComment/insertBefore
    // e appendChild sao usados pelo cliente para mover o mesmo elemento.
    const pageParent={
      insertBefore(node){node.parentNode=this;return node;},
      appendChild(node){node.parentNode=this;return node;}
    };
    const tvDialog={appendChild(node){node.parentNode=this;return node;}};
    const socket={
      id,data:{room:"cinema"},
      on(name,fn){serverListeners.set(name,fn);},
      emit(name,payload){clientListeners.get(name)?.(payload);}
    };
    sockets.set(id,socket);
    for(const fn of serverConnections)fn(socket);
    const userSocket={
      id,
      on(name,fn){clientListeners.set(name,fn);},
      emit(name,payload){sent.push({name,payload});serverListeners.get(name)?.(payload);}
    };
    function el(name){
      if(!elements.has(name))elements.set(name,{
        id:name,parentNode:pageParent,hidden:false,disabled:false,value:"",title:"",style:{},tagName:"DIV",currentTime:0,duration:120,readyState:4,paused:true,muted:false,volume:1,playbackRate:1,buffered:{length:0},textTracks:[],
        play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){},canPlayType(){return "";},remove(){},
        closest(selector){return selector==="[role=dialog]"?tvDialog:null;},
        classList:{toggle(){},contains(){return false}},
        addEventListener(name,fn){this["on_"+name]=fn;},setAttribute(){},getAttribute(){return null},
        appendChild(node){node.parentNode=this;return node;},
        replaceChildren(){},focus(){},
        querySelector(){return {requestFullscreen(){}};},querySelectorAll(){return[]},
        set innerHTML(v){this.html=v;},
        set textContent(v){this.text=v;},
        get textContent(){return this.text;}
      });
      return elements.get(name);
    }
    class FakeYT {
      constructor(_node,opts){
        this.options=opts;this.state=2;this.time=0;this.duration=120;this.muted=false;
        this.calls=[];players.push(this);
      }
      cueVideoById(obj){this.calls.push(["cue",obj]);this.state=5;this.time=obj.startSeconds;}
      loadVideoById(obj){this.calls.push(["load",obj]);this.state=1;this.time=obj.startSeconds;}
      playVideo(){this.calls.push(["play"]);this.state=1;}
      pauseVideo(){this.calls.push(["pause"]);this.state=2;}
      seekTo(t){this.calls.push(["seek",t]);this.time=t;this.state=1;}
      stopVideo(){this.calls.push(["stop"]);this.state=5;}
      getCurrentTime(){return this.time;}
      getPlayerState(){return this.state;}
      getDuration(){return this.duration;}
      getIframe(){return{setAttribute(){}};}
      setOption(module,name,value){this.calls.push(["option",module,name,value]);}
      mute(){this.muted=true;this.calls.push(["mute"]);}
      unMute(){this.muted=false;this.calls.push(["unmute"]);}
      attemptPlay(){this.state=1;this.options.events.onStateChange?.({data:1});}
    }
    const window={jfSocialSocket:userSocket,YT:{Player:FakeYT}};
    const document={
      getElementById:el,createElement:()=>el("created_"+elements.size),
      createComment:()=>({parentNode:pageParent}),
      head:{appendChild(){}},body:{appendChild(){}}
    };
    const timer=(fn,delay)=>{timers.push({fn,delay,done:false});return timers.length;};
    const context=vm.createContext({
      window,document,URL,navigator:{},console:{debug(){},warn(){},error(){}},
      setTimeout:timer,setInterval:()=>1
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,"../public/junto-tv-link.js"),"utf8"),context);
    vm.runInContext(source,context);

    clientListeners.get("joined-room")?.({room:"cinema",ownerId:"host"});
    const client={
      id,sent,timers,players,el,send:(n,p)=>userSocket.emit(n,p),serverEmit:(n,p)=>socket.emit(n,p),
      get player(){return players.at(-1);},
      openLink(){el("jfTvLaunch").onclick();},
      async open(){
        el("jfTvLaunch").onclick();
        await Promise.resolve();await Promise.resolve();await Promise.resolve();
        assert.ok(this.player,"YouTube player não foi inicializado");
        this.player.options.events.onReady();
      },
      flushTimers(){
        for(const t of timers)if(!t.done){t.done=true;t.fn();}
      }
    };
    clients.set(id,client);
    return client;
  }
  return {connect,tv,clients};
}

const mediaUrl="https://media.example.org/signed/path?token=temporary";
function loadLink(host){
  host.openLink();host.el("jfTvLinkUrl").value=mediaUrl;
  host.el("jfTvLinkTitle").value="Sessão de teste";host.el("jfTvLinkFormat").value="direct";
  host.el("jfTvLinkForm").onsubmit({preventDefault(){}});
}
test("Link sem extensão: dois clientes recebem a fonte, play/pause/seek e velocidade",async()=>{
  const app=await createRoom(),host=app.connect("host"),guest=app.connect("guest");
  loadLink(host);guest.openLink();
  const h=host.el("jfTvLinkVideo"),g=guest.el("jfTvLinkVideo");
  assert.equal(g.src,mediaUrl);assert.equal(g.paused,true);
  host.el("jfTvLinkPlay").onclick();assert.equal(g.paused,false);
  h.currentTime=31.4;host.el("jfTvLinkPlay").onclick();
  assert.equal(g.paused,true);assert.equal(g.currentTime,31.4);
  host.el("jfTvLinkSeek").value="78";host.el("jfTvLinkSeek").on_change();
  assert.equal(g.currentTime,78);assert.equal(g.paused,true);
  host.el("jfTvLinkRate").value="1.5";host.el("jfTvLinkRate").onchange();
  assert.equal(g.playbackRate,1.5);
  host.el("jfTvLinkPlay").onclick();assert.equal(g.paused,false);
});
test("Ouvinte não controla a sala; volume e mute são individuais",async()=>{
  const app=await createRoom(),host=app.connect("host"),guest=app.connect("guest");
  loadLink(host);guest.openLink();
  guest.el("jfTvLinkPlay").onclick();assert.equal(host.el("jfTvLinkVideo").paused,true);
  guest.send("tv:control",{action:"play",seconds:99});
  assert.equal(host.el("jfTvLinkVideo").paused,true);
  guest.el("jfTvLinkVolume").value="0.3";guest.el("jfTvLinkVolume").oninput();
  assert.equal(guest.el("jfTvLinkVideo").volume,0.3);assert.equal(host.el("jfTvLinkVideo").volume,1);
});
test("Rejeita esquemas inseguros, credenciais e endereços locais sem substituir a sessão",async()=>{
  const app=await createRoom(),host=app.connect("host");loadLink(host);
  for(const url of ["javascript:alert(1)","http://media.example.org/a","https://127.0.0.1/a","https://localhost/a","https://user:pass@media.example.org/a"]){
    host.send("tv:set-link",{url});assert.equal(host.el("jfTvLinkVideo").src,mediaUrl);
  }
  host.send("tv:control",{action:"rate",rate:99,seconds:90});
  assert.equal(host.el("jfTvLinkVideo").currentTime,0);
});
test("Fechar TV do ADM pausa a sala e descarrega a fonte; reabrir restaura a posição",async()=>{
  const app=await createRoom(),host=app.connect("host"),guest=app.connect("guest");
  loadLink(host);guest.openLink();host.el("jfTvLinkPlay").onclick();
  host.el("jfTvLinkVideo").currentTime=42;host.el("jfTvClose").onclick();
  assert.equal(guest.el("jfTvLinkVideo").paused,true);assert.equal(guest.el("jfTvLinkVideo").currentTime,42);
  host.openLink();assert.equal(host.el("jfTvLinkVideo").currentTime,42);
});
test("Estado antigo e reprodução tardia não desfazem uma pausa",async()=>{
  const app=await createRoom(),host=app.connect("host"),guest=app.connect("guest");
  loadLink(host);guest.openLink();host.el("jfTvLinkPlay").onclick();host.el("jfTvLinkPlay").onclick();
  guest.serverEmit("tv:playback",{mode:"link",url:mediaUrl,playing:true,seconds:99,revision:1});
  assert.equal(guest.el("jfTvLinkVideo").paused,true);
  guest.el("jfTvLinkVideo").paused=false;guest.el("jfTvLinkVideo").on_playing();
  assert.equal(guest.el("jfTvLinkVideo").paused,true);
});
test("Trocar para YouTube pausa e libera a fonte direta",async()=>{
  const app=await createRoom(),host=app.connect("host"),guest=app.connect("guest");
  loadLink(host);guest.openLink();host.el("jfTvLinkPlay").onclick();
  host.el("jfTvYoutubeUrl").value="https://youtu.be/dQw4w9WgXcQ";host.el("jfTvLoad").onclick();
  assert.equal(guest.el("jfTvLinkVideo").paused,true);
  assert.equal(guest.el("jfTvLinkControls").hidden,true);
});
