"use strict";
const {Pool}=require("pg");
// Conquistas permanentes associadas a contas (Google ou login próprio).
module.exports=function setupAchievements(app,io,accountAuth){
  const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:true}:false,max:3}):null;
  const definitions=[
    {id:"welcome",title:"Bem-vindo a bordo",description:"Crie sua conta na Junto.fm.",symbol:"⛵"},
    {id:"jorge",title:"Jorge, ô curioso",description:"Interaja com cinco botões ou mais em uma sala de música.",symbol:"🍌"}
  ];
  const ready=pool?Promise.resolve(accountAuth.ready).then(async ok=>{
    if(!ok)return false;
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievements(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,achievement_id VARCHAR(32) NOT NULL,unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(account_id,achievement_id))");
    return true;
  }).catch(error=>{console.error("Conquistas:",error.message);return false;}):Promise.resolve(false);
  async function unlock(accountId,id,socket){
    if(!pool||!await ready||!definitions.some(d=>d.id===id))return;
    const result=await pool.query("INSERT INTO junto_achievements(account_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING achievement_id",[accountId,id]);
    if(result.rowCount&&socket)socket.emit("achievement-unlocked",{id});
  }
  async function snapshot(accountId){
    if(!pool||!await ready)return {configured:false,achievements:[]};
    const {rows}=await pool.query(`SELECT d.id,d.total,
      (SELECT COUNT(*)::int FROM junto_achievements j WHERE j.achievement_id=d.id) AS unlocked
      FROM (SELECT unnest($1::text[]) AS id,(SELECT COUNT(*)::int FROM junto_accounts) AS total) d`,[definitions.map(d=>d.id)]);
    const mine=accountId?await pool.query("SELECT achievement_id FROM junto_achievements WHERE account_id=$1",[accountId]):{rows:[]};
    const owned=new Set(mine.rows.map(r=>r.achievement_id));
    return {configured:true,achievements:definitions.map(d=>{
      const found=rows.find(r=>r.id===d.id);
      return {...d,unlocked:owned.has(d.id),percent:found?.total?Math.round(10000*found.unlocked/found.total)/100:0};
    })};
  }
  app.get("/api/achievements",async(req,res)=>{
    try{
      const account=await accountAuth.accountFromRequest(req);
      res.set("Cache-Control","no-store");
      res.json(await snapshot(account?.id));
    }catch(_){res.status(503).json({error:"Conquistas indisponíveis."});}
  });
  const interactions=new Map();
  const allowed=new Set(["tomato","chat","emojis","friends","skip"]);
  io.on("connection",socket=>{
    if(socket.data.account?.id)void unlock(socket.data.account.id,"welcome",socket).catch(()=>{});
    socket.on("achievement-interaction",async({button}={})=>{
      if(!socket.data.room||!socket.data.account?.id||!allowed.has(button))return;
      const room=socket.data.room;
      const entry=interactions.get(socket.id);
      const seen=entry?.room===room?entry.buttons:new Set();
      seen.add(button);interactions.set(socket.id,{room,buttons:seen});
      if(seen.size===5)await unlock(socket.data.account.id,"jorge",socket).catch(()=>{});
    });
    socket.on("leave-room",()=>interactions.delete(socket.id));
    socket.on("disconnect",()=>interactions.delete(socket.id));
  });
  return {unlock,snapshot,ready};
};
