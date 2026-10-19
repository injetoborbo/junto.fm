"use strict";
const {Pool}=require("pg");
module.exports=function enableLeaderboard(app,io,roomTransmitters){
  const url=process.env.DATABASE_URL||"";
  const pool=url?new Pool({connectionString:url,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:true}:false,max:3}):null;
  const ready=pool?pool.query("CREATE TABLE IF NOT EXISTS junto_listening_time (account_id UUID PRIMARY KEY REFERENCES junto_accounts(id) ON DELETE CASCADE, seconds BIGINT NOT NULL DEFAULT 0 CHECK(seconds>=0))").then(()=>true).catch(error=>{console.error("Ranking indisponivel:",error.message);return false;}):Promise.resolve(false);
  const recent=new Map();
  const liveRooms=new Map();
  app.get("/api/listening/ranking",async(_req,res)=>{
    res.set("Cache-Control","no-store");
    if(!await ready)return res.status(503).json({error:"Ranking exige banco PostgreSQL configurado."});
    try{
      const {rows}=await pool.query("SELECT a.nickname AS name,t.seconds::text AS seconds FROM junto_listening_time t JOIN junto_accounts a ON a.id=t.account_id ORDER BY t.seconds DESC,a.nickname LIMIT 30");
      res.json({ranking:rows});
    }catch(error){console.error("Erro no ranking:",error.message);res.status(503).json({error:"Ranking temporariamente indisponível."});}
  });
  io.on("connection",socket=>{
    socket.on("listening-heartbeat",data=>{
      const room=socket.data.room;
      if(!room||!socket.data.account?.id||!roomTransmitters.has(room))return;
      const dj=roomTransmitters.get(room);
      if(!dj||!io.sockets.sockets.has(dj.id))return;
      if(socket.id===dj.id){
        if(!socket.data.isTransmitting||data?.djActive!==true)return;
        liveRooms.set(room,Date.now());
      }else if(data?.playing!==true)return;
      recent.set(socket.id,{room,accountId:socket.data.account.id,at:Date.now()});
    });
    socket.on("leave-room",()=>recent.delete(socket.id));
    socket.on("disconnect",()=>recent.delete(socket.id));
  });
  let busy=false;
  const timer=setInterval(async()=>{
    if(busy||!(await ready))return;
    busy=true;
    try{
      const now=Date.now();
      const accounts=new Set();
      for(const [id,data] of recent){
        const socket=io.sockets.sockets.get(id);
        if(!socket||socket.data.room!==data.room||now-data.at>22000){recent.delete(id);continue;}
        const dj=roomTransmitters.get(data.room);
        if(!dj||!io.sockets.sockets.has(dj.id)||now-(liveRooms.get(data.room)||0)>22000)continue;
        accounts.add(data.accountId);
      }
      if(accounts.size){
        await pool.query("INSERT INTO junto_listening_time(account_id,seconds) SELECT UNNEST($1::uuid[]),15 ON CONFLICT(account_id) DO UPDATE SET seconds=junto_listening_time.seconds+15",[[...accounts]]);
      }
      for(const [room,time] of liveRooms)if(now-time>60000)liveRooms.delete(room);
    }catch(error){console.error("Erro de contagem de escuta:",error.message);}finally{busy=false;}
  },15000);
  timer.unref();
};
