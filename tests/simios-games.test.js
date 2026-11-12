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
  const games=createSimiosGames(io,{now:()=>clock,random:()=>.25,sweep:false});
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
test("chute usa 3D e dano calculado no servidor",()=>{
  const h=setup();h.start();
  h.a.send("simios-fight-act",{kind:"chute"});
  const state=h.games.snapshot("sala");
  assert.equal(state.hp.beta,77);
  assert.equal(state.lastMove.kind,"chute");
  assert.equal(state.lastMove.hit,true);
  assert.equal(state.lastMove.damage,23);
  assert.equal(state.turn,"beta");
  h.games.dispose();
});
test("erros de soco e chute não causam dano e consomem o turno",()=>{
  const h=setup();
  // Simular um resultado aleatorio desfavoravel com novo jogo injetado.
  h.games.dispose();
  const clients=h.clients;
  const io={
    sockets:{sockets:clients},
    to(destination){return{emit(event,payload){h.events.push({destination,event,payload});}}}
  };
  const game=createSimiosGames(io,{now:()=>h.now(),random:()=>.99,sweep:false});
  game.attachSocket(h.a);game.attachSocket(h.b);
  h.a.send("simios-fight-challenge",{targetId:"beta"});
  h.b.send("simios-fight-respond",{accept:true});
  h.a.send("simios-fight-act",{kind:"chute"});
  assert.equal(game.snapshot("sala").hp.beta,100);
  assert.equal(game.snapshot("sala").lastMove.hit,false);
  assert.equal(game.snapshot("sala").lastMove.damage,0);
  assert.equal(game.snapshot("sala").turn,"beta");
  game.dispose();
});
test("recusa e saída da sala cancelam desafios e duelos",()=>{
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

test("rendição encerra duelo e dá vitória ao adversário",()=>{
  const h=setup();h.start();
  h.a.send("simios-fight-forfeit");
  const state=h.games.snapshot("sala");
  assert.equal(state.phase,"finished");
  assert.equal(state.winner,"beta");
  assert.match(state.message,/desistiu/);
  h.games.dispose();
});

test("Espírito Símio custa 10 HP, consome a vez e melhora dois rounds completos",()=>{
  const h=setup();h.start();
  const act=(client,kind)=>client.send("simios-fight-act",{kind});
  h.b.send("simios-fight-act",{kind:"espirito_simio"});
  assert.equal(h.games.snapshot("sala").hp.beta,100,"fora da vez não ativa");
  h.a.send("simios-fight-act",{kind:"espirito_simio",healthCost:0,attackMultiplier:999,rounds:999});
  let state=h.games.snapshot("sala");
  assert.equal(state.hp.alpha,90);assert.equal(state.turn,"beta");
  assert.deepEqual(state.spirit.alpha,{active:true,roundsRemaining:2});
  act(h.b,"soco");state=h.games.snapshot("sala");
  assert.equal(state.hp.alpha,78,"recebe 12 em vez de 16");
  assert.equal(state.spirit.alpha.roundsRemaining,2);
  act(h.a,"soco");state=h.games.snapshot("sala");
  assert.equal(state.hp.beta,80,"causa 20 em vez de 16");
  assert.equal(state.spirit.alpha.roundsRemaining,1);
  act(h.b,"soco");assert.equal(h.games.snapshot("sala").hp.alpha,66);
  act(h.a,"soco");state=h.games.snapshot("sala");
  assert.equal(state.hp.beta,60);assert.deepEqual(state.spirit.alpha,{active:false,roundsRemaining:0});
  act(h.b,"soco");assert.equal(h.games.snapshot("sala").hp.alpha,50,"defesa expira");
  act(h.a,"soco");assert.equal(h.games.snapshot("sala").hp.beta,44,"ataque expira");
  h.games.dispose();
});

test("Espírito não acumula, não renova ativo, combina com guarda e exige mais de 10 HP",()=>{
  const h=setup();h.start();const act=(c,k)=>c.send("simios-fight-act",{kind:k});
  act(h.a,"espirito_simio");act(h.b,"defender");
  const before=h.games.snapshot("sala");act(h.a,"espirito_simio");
  assert.deepEqual(h.games.snapshot("sala"),before,"tentativa ativa não gasta HP nem passa a vez");
  act(h.a,"defender");act(h.b,"soco");
  assert.equal(h.games.snapshot("sala").hp.alpha,85,"16 × 0,75 × 0,4 = 5 após arredondar");
  assert.equal(h.games.snapshot("sala").guard.alpha,false);
  h.games.dispose();
  const g=setup();g.start();
  for(let i=0;i<9;i++){
    act(g.a,"espirito_simio");act(g.b,"defender");act(g.a,"defender");act(g.b,"defender");act(g.a,"defender");act(g.b,"defender");
  }
  const low=g.games.snapshot("sala");assert.equal(low.hp.alpha,10);
  act(g.a,"espirito_simio");assert.deepEqual(g.games.snapshot("sala"),low);
  assert.match(g.last("simios-fight-notice","alpha").message,/mais de 10/);
  g.games.dispose();
});

function nearKo(h){
  h.start();for(let i=0;i<5;i++){
    h.a.send("simios-fight-act",{kind:"soco"});h.b.send("simios-fight-act",{kind:"soco"});
  }
  assert.deepEqual(h.games.snapshot("sala").hp,{alpha:20,beta:20});
}
test("Dramatic Finish dispara uma vez se a vítima sofre KO com Espírito ativo",()=>{
  const h=setup();nearKo(h);
  h.a.send("simios-fight-act",{kind:"espirito_simio"});
  h.b.send("simios-fight-act",{kind:"soco",dramaticFinish:false});
  const state=h.games.snapshot("sala");assert.equal(state.phase,"finished");assert.equal(state.hp.alpha,0);
  assert.equal(state.spirit.alpha.active,true);
  assert.deepEqual(state.dramaticFinish,{triggered:true,winner:"beta",loser:"alpha",ability:"espirito_simio",seq:12});
  assert.equal(h.events.filter(e=>e.event==="simios-dramatic-finish").length,1);
  h.a.send("simios-fight-sync");h.b.send("simios-fight-act",{kind:"soco"});
  assert.equal(h.events.filter(e=>e.event==="simios-dramatic-finish").length,1,"sync não dispara o evento novamente");
  assert.deepEqual(h.last("simios-fight-state","alpha").dramaticFinish,state.dramaticFinish);
  h.games.dispose();
});
test("Espírito já expirado não engatilha Dramatic Finish no KO",()=>{
  const h=setup();nearKo(h);const act=(c,k)=>c.send("simios-fight-act",{kind:k});
  act(h.a,"espirito_simio");act(h.b,"defender");act(h.a,"defender");act(h.b,"defender");act(h.a,"defender");
  assert.equal(h.games.snapshot("sala").spirit.alpha.active,false);
  act(h.b,"forte");const state=h.games.snapshot("sala");
  assert.equal(state.phase,"finished");assert.equal(state.hp.alpha,0);assert.equal(state.dramaticFinish,null);
  assert.equal(h.events.filter(e=>e.event==="simios-dramatic-finish").length,0);h.games.dispose();
});
test("desistência, saída e inatividade com Espírito ativo não são Dramatic Finish",()=>{
  for(const end of ["forfeit","leave","timeout"]){
    const h=setup();h.start();h.a.send("simios-fight-act",{kind:"espirito_simio"});
    if(end==="forfeit")h.a.send("simios-fight-forfeit");
    if(end==="leave")h.games.leave("sala","alpha");
    if(end==="timeout"){h.advance(90_001);h.b.send("simios-fight-act",{kind:"soco"});}
    assert.equal(h.games.snapshot("sala").phase,"finished");
    assert.equal(h.games.snapshot("sala").dramaticFinish,null);
    assert.equal(h.events.filter(e=>e.event==="simios-dramatic-finish").length,0);h.games.dispose();
  }
});
test("somente o Espírito da vítima habilita Dramatic Finish; ações forjadas não mudam a luta",()=>{
  const h=setup();nearKo(h);
  const before=h.games.snapshot("sala");
  for(const kind of ["__proto__","toString","spirit"]){h.a.send("simios-fight-act",{kind});assert.deepEqual(h.games.snapshot("sala"),before);}
  h.a.send("simios-fight-act",{kind:"espirito_simio"});h.b.send("simios-fight-act",{kind:"espirito_simio"});
  h.a.send("simios-fight-act",{kind:"soco"});
  const state=h.games.snapshot("sala");
  assert.equal(state.winner,"alpha");assert.equal(state.dramaticFinish.loser,"beta");
  h.games.dispose();
  const g=setup();nearKo(g);
  // Alpha's attack boost must not tag an unbuffed victim as Dramatic Finish.
  g.a.send("simios-fight-act",{kind:"espirito_simio"});g.b.send("simios-fight-act",{kind:"defender"});
  g.a.send("simios-fight-act",{kind:"forte"}); // 37 * .4 = 15; beta has 5 HP.
  g.b.send("simios-fight-act",{kind:"defender"});
  g.a.send("simios-fight-act",{kind:"forte"});
  assert.equal(g.games.snapshot("sala").winner,"alpha");
  assert.equal(g.games.snapshot("sala").dramaticFinish,null,"Espírito do vencedor não habilita o finish");g.games.dispose();
});
