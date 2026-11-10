"use strict";

/* The Símios: minigame PvP por turnos com aceite mútuo e pets temporários.
 * O servidor é a única autoridade para vida, energia, turno e vencedor.
 * Estado é por sala e não usa placar persistente nem modifica conquistas.
 */
const PETS=Object.freeze(["nenhum","caramelo","noturno","rosinha"]);
const ATTACKS=Object.freeze({
  soco:{cost:12,damage:16,label:"Soco"},
  forte:{cost:30,damage:28,label:"Golpe forte"},
  defender:{cost:0,damage:0,label:"Defesa"}
});
const INVITE_MS=20_000,IDLE_MS=90_000;
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));

function createSimiosGames(io,danceFloors,{now=()=>Date.now(),sweep=true}={}){
  const rooms=new Map(),lastChallenge=new Map();
  const gameOf=room=>{
    if(!rooms.has(room))rooms.set(room,{invite:null,fight:null,last:null});
    return rooms.get(room);
  };
  const floorOf=socket=>{
    const room=socket?.data?.room;
    return room&&danceFloors.get(room)?.has(socket.id)
      ?{room,floor:danceFloors.get(room)}:null;
  };
  const validPair=(room,by,to)=>Boolean(by!==to&&danceFloors.get(room)?.has(by)&&danceFloors.get(room)?.has(to)
    &&io.sockets.sockets.get(by)?.data?.room===room
    &&io.sockets.sockets.get(to)?.data?.room===room);
  const serialize=(room)=>{
    const state=rooms.get(room);
    if(!state)return {phase:"idle"};
    const f=state.fight;
    if(f)return {phase:"playing",players:f.players.slice(),hp:{...f.hp},
      energy:{...f.energy},guard:{...f.guard},turn:f.turn,
      round:f.round,lastMove:f.lastMove,startedAt:f.startedAt};
    return state.last&&now()-state.last.at<15_000
      ?{phase:"finished",...state.last}:{phase:"idle"};
  };
  const broadcast=room=>io.to(room).emit("simios-fight-state",serialize(room));
  const notice=(id,message)=>io.to(id).emit("simios-fight-notice",{message});
  const clearInvite=(room,reason)=>{
    const state=rooms.get(room);
    if(!state?.invite)return;
    const {from,to}=state.invite;state.invite=null;
    if(reason){notice(from,reason);notice(to,reason);}
  };
  const finish=(room,winner,message)=>{
    const state=rooms.get(room),fight=state?.fight;
    if(!fight)return;
    state.fight=null;
    state.last={winner:winner||null,players:fight.players.slice(),hp:{...fight.hp},
      energy:{...fight.energy},message:String(message).slice(0,140),at:now(),
      lastMove:fight.lastMove};
    broadcast(room);
  };
  const leave=(room,id)=>{
    if(!room||!id)return;
    const state=rooms.get(room);if(!state)return;
    if(state.invite&&(state.invite.from===id||state.invite.to===id))
      clearInvite(room,"O desafio foi cancelado porque alguém saiu da pista.");
    if(state.fight?.players.includes(id)){
      const opponent=state.fight.players.find(x=>x!==id);
      finish(room,validPair(room,id,opponent)?opponent:null,"Luta encerrada: um macaco saiu da pista.");
    }
    if(!state.invite&&!state.fight&&!danceFloors.get(room)?.size)rooms.delete(room);
  };
  const attachSocket=socket=>{
    let nextPetChangeAt=0;
    socket.on("simios-pet-equip",payload=>{
      const context=floorOf(socket);
      if(!context)return;
      const type=typeof payload?.type==="string"?payload.type:"";
      if(!PETS.includes(type))return;
      const member=context.floor.get(socket.id);
      if(member.pet===type||now()<nextPetChangeAt)return;
      nextPetChangeAt=now()+350; // Evita recriar dezenas de GLBs por segundo.
      member.pet=type;
      io.to(context.room).emit("dance-updated",{id:socket.id,...member});
    });
    socket.on("simios-fight-sync",()=>{
      const context=floorOf(socket);
      if(!context)return;
      socket.emit("simios-fight-state",serialize(context.room));
      const invite=rooms.get(context.room)?.invite;
      if(invite?.to===socket.id&&now()-invite.at<INVITE_MS)
        socket.emit("simios-fight-invite",{from:invite.from,expiresAt:invite.at+INVITE_MS});
    });
    socket.on("simios-fight-challenge",payload=>{
      const context=floorOf(socket);if(!context)return;
      const to=typeof payload?.targetId==="string"?payload.targetId:"";
      if(!validPair(context.room,socket.id,to))return notice(socket.id,"Escolha outro macaco que esteja na pista.");
      if(now()-(lastChallenge.get(socket.id)||0)<8_000)
        return notice(socket.id,"Aguarde um pouco antes de desafiar novamente.");
      const state=gameOf(context.room);
      if(state.fight)return notice(socket.id,"Já existe uma luta acontecendo nesta sala.");
      if(state.invite&&now()-state.invite.at>=INVITE_MS)clearInvite(context.room);
      if(state.invite)return notice(socket.id,"Já existe um desafio aguardando resposta nesta sala.");
      state.last=null;
      lastChallenge.set(socket.id,now());
      state.invite={from:socket.id,to,at:now()};
      io.to(to).emit("simios-fight-invite",{from:socket.id,expiresAt:now()+INVITE_MS});
      notice(socket.id,"Desafio enviado! O outro macaco precisa aceitar.");
    });
    socket.on("simios-fight-respond",payload=>{
      const context=floorOf(socket);if(!context)return;
      const state=rooms.get(context.room),invite=state?.invite;
      if(!invite||invite.to!==socket.id)return;
      if(now()-invite.at>=INVITE_MS||!validPair(context.room,invite.from,invite.to)){
        clearInvite(context.room,"Desafio expirado ou participante saiu.");return;
      }
      state.invite=null;
      if(payload?.accept!==true){
        notice(invite.from,"Seu desafio foi recusado.");
        notice(invite.to,"Você recusou o desafio.");
        return;
      }
      const players=[invite.from,invite.to];
      const hp=Object.fromEntries(players.map(id=>[id,100]));
      const energy=Object.fromEntries(players.map(id=>[id,75]));
      const guard=Object.fromEntries(players.map(id=>[id,false]));
      state.fight={players,hp,energy,guard,turn:players[0],round:1,
        lastMove:null,startedAt:now(),lastActionAt:now()};
      state.last=null;
      broadcast(context.room);
    });
    socket.on("simios-fight-act",payload=>{
      const context=floorOf(socket);if(!context)return;
      const fight=rooms.get(context.room)?.fight;
      if(!fight||fight.turn!==socket.id)return;
      if(now()-fight.lastActionAt>IDLE_MS){
        finish(context.room,null,"Luta encerrada por inatividade.");return;
      }
      const kind=typeof payload?.kind==="string"?payload.kind:"";
      const move=ATTACKS[kind];if(!move)return;
      const actor=socket.id,target=fight.players.find(id=>id!==actor);
      if(!validPair(context.room,actor,target)){finish(context.room,null,"Um participante saiu.");return;}
      if(fight.energy[actor]<move.cost)
        return notice(actor,"Energia insuficiente. Use Defesa para recuperar.");
      let damage=move.damage;
      if(kind==="defender"){
        fight.guard[actor]=true;
        fight.energy[actor]=clamp(fight.energy[actor]+28,0,100);
      }else{
        fight.energy[actor]=clamp(fight.energy[actor]-move.cost+5,0,100);
        if(fight.guard[target]){damage=Math.ceil(damage*.4);fight.guard[target]=false;}
        fight.hp[target]=clamp(fight.hp[target]-damage,0,100);
      }
      fight.energy[target]=clamp(fight.energy[target]+9,0,100);
      fight.lastMove={by:actor,to:target,kind,damage,at:now()};
      fight.lastActionAt=now();
      if(fight.hp[target]<=0){
        finish(context.room,actor,"Nocaute! O macaco vencedor levou a melhor.");return;
      }
      fight.turn=target;
      fight.round++;
      broadcast(context.room);
    });
  };
  const timer=sweep?setInterval(()=>{
    for(const [room,state] of rooms){
      if(state.invite&&now()-state.invite.at>=INVITE_MS)clearInvite(room,"Desafio expirado.");
      if(state.fight&&now()-state.fight.lastActionAt>=IDLE_MS)
        finish(room,null,"Luta encerrada por inatividade.");
      if(!state.invite&&!state.fight&&!danceFloors.get(room)?.size)rooms.delete(room);
    }
    for(const [id,ts] of lastChallenge)if(now()-ts>60_000)lastChallenge.delete(id);
  },5_000):null;
  timer?.unref?.();
  return {attachSocket,leave,sync:socket=>{const ctx=floorOf(socket);if(ctx)
    socket.emit("simios-fight-state",serialize(ctx.room));},
    snapshot:serialize,dispose:()=>{if(timer)clearInterval(timer);rooms.clear();lastChallenge.clear();}};
}
module.exports={createSimiosGames,PETS,ATTACKS};
