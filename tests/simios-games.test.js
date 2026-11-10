const test=require("node:test");
const assert=require("node:assert/strict");
const {createSimiosGames}=require("../simios-games");

function setup(){
  let clock=100_000;
  const floor=new Map(),rooms=new Map([["sala",floor]]);
  const clients=new Map(),events=[];
  const io={
    sockets:{sockets:clients},
    to(destination){return{emit(event,payload){
      events.push({destination,event,payload});
    }}}
  };
  const games=createSimiosGames(io,rooms,{now:()=>clock,sweep:false});
  const connect=id=>{
    const handlers=new Map();
    const client={id,data:{room:"sala"},connected:true,on:(name,fn)=>handlers.set(name,fn),
      emit:(event,payload)=>events.push({destination:id,event,payload}),
      send:(name,payload)=>handlers.get(name)?.(payload)};
    clients.set(id,client);floor.set(id,{x:0,z:0,dance:"idle"});
    games.attachSocket(client);return client;
  };
  const a=connect("alpha"),b=connect("beta");
  const last=(name,dest)=>events.filter(e=>e.event===name&&(!dest||e.destination===dest)).at(-1)?.payload;
  const start=()=>{
    a.send("simios-fight-challenge",{targetId:"beta"});
    b.send("simios-fight-respond",{accept:true});
    return last("simios-fight-state");
  };
  return {a,b,floor,clients,events,games,now:()=>clock,advance:ms=>clock+=ms,last,start};
}
test("duelo exige convite e aceite, sem alterar saúde antes",()=>{
  const h=setup();
  h.a.send("simios-fight-challenge",{targetId:"beta"});
  assert.equal(h.last("simios-fight-invite","beta").from,"alpha");
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.b.send("simios-fight-respond",{accept:true});
  const state=h.games.snapshot("sala");
  assert.equal(state.phase,"playing");
  assert.deepEqual(state.hp,{alpha:100,beta:100});
  assert.equal(state.turn,"alpha");
  h.games.dispose();
});
test("soco, defesa, bloqueio e turno são calculados somente pelo servidor",()=>{
  const h=setup();h.start();
  h.b.send("simios-fight-act",{kind:"forte"});
  assert.equal(h.games.snapshot("sala").hp.alpha,100,"fora de turno nao vale");
  h.a.send("simios-fight-act",{kind:"soco"});
  assert.equal(h.games.snapshot("sala").hp.beta,84);
  assert.equal(h.games.snapshot("sala").turn,"beta");
  h.b.send("simios-fight-act",{kind:"defender"});
  assert.equal(h.games.snapshot("sala").guard.beta,true);
  h.a.send("simios-fight-act",{kind:"forte"});
  assert.equal(h.games.snapshot("sala").hp.beta,72,"defesa reduz 28 para 12");
  assert.equal(h.games.snapshot("sala").guard.beta,false);
  h.games.dispose();
});
test("ninguém pode desafiar a si, ausente, ou forçar aceitação",()=>{
  const h=setup();
  h.a.send("simios-fight-challenge",{targetId:"alpha"});
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.a.send("simios-fight-challenge",{targetId:"fantasma"});
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.b.send("simios-fight-respond",{accept:true});
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.a.send("simios-fight-challenge",{targetId:"beta"});
  h.advance(20_001);
  h.b.send("simios-fight-respond",{accept:true});
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.games.dispose();
});
test("Pludogos só permitem três visuais ou nenhum, visíveis para a sala",()=>{
  const h=setup();
  h.a.send("simios-pet-equip",{type:"caramelo"});
  assert.equal(h.floor.get("alpha").pet,"caramelo");
  assert.equal(h.last("dance-updated").pet,"caramelo");
  h.a.send("simios-pet-equip",{type:"hacker"});
  assert.equal(h.floor.get("alpha").pet,"caramelo");
  h.advance(400);
  h.a.send("simios-pet-equip",{type:"nenhum"});
  assert.equal(h.floor.get("alpha").pet,"nenhum");
  h.games.dispose();
});
test("recusa e saída da pista cancelam desafios e duelos",()=>{
  const h=setup();
  h.a.send("simios-fight-challenge",{targetId:"beta"});
  h.b.send("simios-fight-respond",{accept:false});
  assert.equal(h.games.snapshot("sala").phase,"idle");
  h.advance(9_000);
  h.start();
  h.games.leave("sala","beta");
  assert.equal(h.games.snapshot("sala").phase,"finished");
  assert.match(h.games.snapshot("sala").message,/saiu/);
  h.games.dispose();
});
test("combate é isolado por sala e sincronização envia estado ao novo observador",()=>{
  const h=setup();h.start();
  const events=h.events.length;
  h.a.send("simios-fight-sync");
  assert.equal(h.events.length,events+1);
  assert.equal(h.last("simios-fight-state","alpha").phase,"playing");
  h.games.dispose();
});
