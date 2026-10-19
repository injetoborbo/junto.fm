"use strict";
const {Pool}=require("pg");
module.exports=function installSocialFeatures(app,io,roomTransmitters,accountsReady){
  const db=process.env.DATABASE_URL;
  const pool=db?new Pool({connectionString:db,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:true}:false,max:3}):null;
  const achievements=[
    {id:"welcome",name:"Bem-vindo a bordo",description:"Crie sua conta e embarque no Junto.fm.",icon:"🚢"},
    {id:"jorge",name:"Jorge, ô curioso",description:"Interaja com cinco botões ou mais em uma sala de música.",icon:"🐒"}
  ];
  const ready=pool?Promise.resolve(accountsReady).then(async ok=>{
    if(!ok)throw Error("Contas indisponíveis");
    await pool.query(`CREATE TABLE IF NOT EXISTS junto_achievements (
      account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(account_id,achievement_id)
    )`);
    return true;
  }).catch(e=>{console.error("Conquistas:",e.message);return false;}):Promise.resolve(false);
  const interacted=new Map(),votes=new Map(),bananas=new Map();
  const actions=new Set(["tomato","chat","emoji","friends","skip","banana","dance","profile","wardrobe","lyrics"]);
  const participants=room=>[...(io.sockets.adapter.rooms.get(room)||[])].filter(id=>io.sockets.sockets.get(id)?.data.room===room);
  const currentTrackKey=room=>roomTracksKey.get(room)||null;
  const roomTracksKey=new Map();
  const allStats=async(account)=>{
    if(!await ready)return {configured:false,loggedIn:!!account,achievements:achievements.map(x=>({...x,percentage:0,unlocked:false}))};
    const ids=account?[account.id]:[];
    const {rows}=await pool.query(`SELECT achievement_id,COUNT(*)::int AS count FROM junto_achievements GROUP BY achievement_id`);
    const {rows:totalRows}=await pool.query("SELECT COUNT(*)::int AS total FROM junto_accounts");
    const total=totalRows[0]?.total||0;
    let mine=[];
    if(ids.length){const result=await pool.query("SELECT achievement_id FROM junto_achievements WHERE account_id=$1",[account.id]);mine=result.rows.map(x=>x.achievement_id);}
    return {configured:true,loggedIn:!!account,achievements:achievements.map(x=>{
      const count=rows.find(r=>r.achievement_id===x.id)?.count||0;
      return {...x,unlocked:mine.includes(x.id),percentage:total?Math.round(count/total*1000)/10:0};
    })};
  };
  async function unlock(socket,id){
    if(!socket.data.account?.id||!(await ready))return;
    try{
      const result=await pool.query("INSERT INTO junto_achievements(account_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING achievement_id",[socket.data.account.id,id]);
      if(result.rowCount)socket.emit("achievement-unlocked",{id});
    }catch(e){console.error("Desbloquear conquista:",e.message);}
  }
  app.get("/api/achievements",async(req,res)=>{
    try{
      const account=await req.app.locals.jfAccountFromRequest(req);
      res.set("Cache-Control","no-store");
      res.json(await allStats(account));
    }catch(e){res.status(503).json({error:"Conquistas indisponíveis"});}
  });
  function skipState(room){
    const members=participants(room);
    const needed=Math.max(2,Math.ceil(members.length/2));
    const entry=votes.get(room);
    if(entry)for(const voter of entry.voters)if(!members.includes(voter))entry.voters.delete(voter);
    const count=entry?.voters.size||0;
    io.to(room).emit("skip-votes",{votes:count,needed,participants:members.length,trackKey:entry?.trackKey||null});
    if(entry&&count>=needed&&!entry.approved){
      const dj=roomTransmitters.get(room);
      if(!dj?.id)return;
      entry.approved=true;
      io.to(dj.id).emit("skip-approved",{room,trackKey:entry.trackKey});
      io.to(room).emit("skip-approved-notice",{votes:count,needed});
    }
  }
  function updateBanana(room){
    io.to(room).emit("banana-progress",{count:bananas.get(room)||0,goal:20});
  }
  io.on("connection",socket=>{
    const roomNow=()=>socket.data.room;
    socket.on("social-join",()=>{
      const room=roomNow();if(!room)return;
      skipState(room);updateBanana(room);
      if(socket.data.account?.id)void unlock(socket,"welcome");
    });
    socket.on("achievement-action",({action}={})=>{
      const room=roomNow(),account=socket.data.account;
      if(!room||!account?.id||!actions.has(action))return;
      const key=room+":"+account.id;
      const active=interacted.get(key)||new Set();
      active.add(action);interacted.set(key,active);
      if(active.size>=5)void unlock(socket,"jorge");
    });
    socket.on("skip-track",()=>{
      const room=roomNow(),dj=room&&roomTransmitters.get(room);
      if(!room||!dj||!participants(room).includes(dj.id))return;
      const key=roomTracksKey.get(room);
      if(!key)return socket.emit("skip-error",{message:"A música ainda não foi identificada."});
      let entry=votes.get(room);
      if(!entry||entry.trackKey!==key){entry={trackKey:key,voters:new Set(),approved:false};votes.set(room,entry);}
      if(entry.approved)return;
      entry.voters.add(socket.id);
      skipState(room);
    });
    socket.on("skip-track-updated",({key}={})=>{
      const room=roomNow();
      if(!room||roomTransmitters.get(room)?.id!==socket.id)return;
      const value=String(key||"").slice(0,180);
      if(!value)return;
      if(roomTracksKey.get(room)!==value){roomTracksKey.set(room,value);votes.delete(room);}
      skipState(room);
    });
    socket.on("banana-throw",()=>{
      const room=roomNow();
      if(!room||!roomTransmitters.has(room))return socket.emit("banana-error",{message:"Aguarde um DJ ao vivo."});
      if(Date.now()-(socket.data.lastBanana||0)<2500)return;
      socket.data.lastBanana=Date.now();
      const current=Math.min(20,(bananas.get(room)||0)+1);
      bananas.set(room,current);
      io.to(room).emit("banana-fired",{from:socket.id,count:current,goal:20});
      updateBanana(room);
      if(current===20){io.to(room).emit("banana-goal",{message:"20 bananas! O macaquinho surpresa chegou! 🐒"});bananas.set(room,0);setTimeout(()=>updateBanana(room),2400);}
    });
    const leave=()=>{
      const room=roomNow();
      if(!room)return;
      const entry=votes.get(room);
      if(entry){entry.voters.delete(socket.id);setImmediate(()=>skipState(room));}
      const key=room+":"+socket.data.account?.id;
      interacted.delete(key);
    };
    socket.on("leave-room",leave);
    socket.on("disconnect",leave);
  });
};
