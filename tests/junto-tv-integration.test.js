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
        id:name,parentNode:pageParent,hidden:false,disabled:false,value:"",title:"",style:{},
        closest(selector){return selector==="[role=dialog]"?tvDialog:null;},
        classList:{toggle(){},contains(){return false}},
        addEventListener(name,fn){this["on_"+name]=fn;},setAttribute(){},getAttribute(){return null},
        appendChild(node){node.parentNode=this;return node;},
        replaceChildren(){},focus(){},
        querySelectorAll(){return[]},
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
    vm.runInNewContext(source,{
      window,document,URL,navigator:{},console:{debug(){},warn(){},error(){}},
      setTimeout:timer,setInterval:()=>1
    });
    clientListeners.get("joined-room")?.({room:"cinema",ownerId:"host"});
    const client={
      id,sent,timers,players,el,serverEmit:(n,p)=>socket.emit(n,p),
      get player(){return players.at(-1);},
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

test("Dois navegadores: play → pausa imediata → play → seek → pausa",async()=>{
  const app=await createRoom();
  const host=app.connect("host"),guest=app.connect("guest");
  // Usar os botões originais da interface e sinalização real do módulo.
  // O link é definido pelo próprio ADM, como na interface.
  host.el("jfTvYoutubeUrl").value="https://youtu.be/dQw4w9WgXcQ";
  host.el("jfTvLoad").onclick();
  await host.open();await guest.open();
  const hp=host.player,gp=guest.player;
  hp.time=10;
  host.el("jfTvPlay").onclick();
  assert.equal(gp.getPlayerState(),1,"Ouvinte precisa iniciar quando ADM aperta PLAY");
  hp.time=12.25;
  host.el("jfTvPause").onclick();
  assert.equal(gp.getPlayerState(),2,"Ouvinte precisa pausar imediatamente");
  assert.equal(guest.el("jfTvYoutubeShield").hidden,false,"O vídeo pausado deve ficar coberto para o ouvinte");
  const stateAtPause=guest.sent.filter(m=>m.name==="tv:control");
  assert.equal(stateAtPause.length,0,"Ouvinte não controla a sessão");
  const count=gp.calls.length;
  gp.attemptPlay(); // um clique/efeito interno do YouTube tenta reproduzir
  assert.equal(gp.getPlayerState(),2,"O onStateChange deve reverter reprodução espontânea");
  const after=gp.calls.length;
  guest.flushTimers();
  assert.equal(gp.getPlayerState(),2,"Timers atrasados não podem reativar vídeo");
  hp.time=12.25;
  host.el("jfTvPlay").onclick();
  assert.equal(gp.getPlayerState(),1,"O PLAY seguinte precisa retomar a reprodução");
  assert.equal(guest.el("jfTvYoutubeShield").hidden,true);
  host.el("jfTvSeek").value="38";
  host.el("jfTvSeek").on_change();
  assert.ok(gp.getCurrentTime()>37&&gp.getCurrentTime()<40,
    "Avanço ordenado pelo ADM deve ir à posição correta no ouvinte");
  host.el("jfTvPause").onclick();
  assert.equal(gp.getPlayerState(),2);
  assert.ok(gp.calls.length>count&&after>count);
});

test("Convidado atrasado recebe estado pausado e iframe não deixa interagir",async()=>{
  const app=await createRoom();const host=app.connect("host");
  host.el("jfTvYoutubeUrl").value="https://youtu.be/dQw4w9WgXcQ";
  host.el("jfTvLoad").onclick();
  await host.open();
  host.el("jfTvPlay").onclick();host.el("jfTvPause").onclick();
  const late=app.connect("late");
  app.tv.joined({data:{room:"cinema"},emit:(name,p)=>late.serverEmit(name,p)});
  await late.open();
  assert.equal(late.player.getPlayerState(),2);
  assert.equal(late.el("jfTvYoutubeShield").hidden,false);
  assert.equal(late.player.options.playerVars.controls,0);
  assert.equal(late.player.options.playerVars.disablekb,1);
});

test("A ação chega em tv:playback antes do estado; revisão anterior não reabre o vídeo",async()=>{
  const app=await createRoom();const host=app.connect("host"),guest=app.connect("guest");
  host.el("jfTvYoutubeUrl").value="https://youtu.be/dQw4w9WgXcQ";
  host.el("jfTvLoad").onclick();await host.open();await guest.open();
  host.el("jfTvPlay").onclick();host.el("jfTvPause").onclick();
  assert.equal(guest.player.getPlayerState(),2);
  guest.serverEmit("tv:playback",{
    mode:"youtube",videoId:"dQw4w9WgXcQ",hostId:"host",
    playing:true,seconds:500,serverNow:Date.now(),updatedAt:Date.now(),revision:1
  });
  assert.equal(guest.player.getPlayerState(),2,"Controle velho não pode desfazer pause");
});
