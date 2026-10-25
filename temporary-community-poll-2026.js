"use strict";
// EVENTO TEMPORÁRIO — ENQUETE DA COMUNIDADE, NÃO APURAÇÃO DO TSE.
// Para remover: revert do PR desta branch. Expira automaticamente 27/10/2026 00h BRT.
const crypto=require("crypto");
const CLOSE_AT=Date.parse("2026-10-27T03:00:00.000Z");
const START_AT=Date.parse("2026-10-25T00:00:00.000Z");
const votes=new Map();
const isOpen=()=>Date.now()>=START_AT&&Date.now()<CLOSE_AT;
function summary(){
  let lula=0,flavio=0;
  for(const option of votes.values())if(option==="lula")lula++;else if(option==="flavio")flavio++;
  return {open:isOpen(),expiresAt:new Date(CLOSE_AT).toISOString(),
    source:"enquete-comunidade",lula,flavio,total:lula+flavio};
}
module.exports=function temporaryElectionPoll(app,io,isRateLimited){
  app.get("/api/community-election-poll-2026",(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json(summary());
  });
  io.on("connection",socket=>{
    socket.on("community-election-poll-get",()=>socket.emit("community-election-poll-state",summary()));
    socket.on("community-election-poll-vote",({candidate,voterToken}={})=>{
      if(!isOpen())return socket.emit("community-election-poll-error",{message:"Enquete encerrada."});
      if(!socket.data.room)return socket.emit("community-election-poll-error",{message:"Entre em uma sala para participar."});
      if(candidate!=="lula"&&candidate!=="flavio")return;
      if(isRateLimited(socket,"community-election-poll-vote",8,60000))
        return socket.emit("community-election-poll-error",{message:"Muitas tentativas. Aguarde um pouco."});
      // Uma escolha por conta autenticada ou identidade persistente do navegador.
      // Uma enquete recreativa NÃO garante a integridade de uma eleição oficial.
      const account=socket.data.account?.id;
      const token=typeof voterToken==="string"&&/^[a-f0-9]{40}$/.test(voterToken)?voterToken:null;
      const identity=account?"account:"+account:token?"browser:"+crypto.createHash("sha256").update(token).digest("hex"):null;
      if(!identity)return socket.emit("community-election-poll-error",{message:"Não consegui identificar este navegador."});
      votes.set(identity,candidate);
      socket.emit("community-election-poll-confirmed",{candidate});
      io.emit("community-election-poll-state",summary());
    });
  });
  // Sem dados persistentes: tudo some no restart e nada permanece após o prazo.
  const timer=setTimeout(()=>{votes.clear();io.emit("community-election-poll-state",summary());},Math.max(0,CLOSE_AT-Date.now()));
  timer.unref?.();
};
