"use strict";
const {Pool}=require("pg");
module.exports=function setupAchievements(app,io,accountAuth){
  const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:true}:false,max:3}):null;
  const definitions=[
  {
    "id": "welcome",
    "title": "Bem-vindo a bordo",
    "description": "Entre no site pela primeira vez.",
    "symbol": "🚢"
  },
  {
    "id": "listen1",
    "title": "Só mais uma música",
    "description": "Acumule 1 hora ouvindo música.",
    "symbol": "🎧"
  },
  {
    "id": "listen10",
    "title": "Uno mas...",
    "description": "Acumule 10 horas ouvindo música.",
    "symbol": "🐒"
  },
  {
    "id": "listen50",
    "title": "To fritando",
    "description": "Acumule 50 horas ouvindo música.",
    "symbol": "📻"
  },
  {
    "id": "listen100",
    "title": "AYYY!",
    "description": "Acumule 100 horas ouvindo música.",
    "symbol": "💯"
  },
  {
    "id": "firstdj",
    "title": "Solta o som",
    "description": "Faça sua primeira transmissão de música.",
    "symbol": "🎙️"
  },
  {
    "id": "dj10",
    "title": "Respeita o DJ",
    "description": "Acumule 10 horas transmitindo música.",
    "symbol": "🎛️"
  },
  {
    "id": "firstroom",
    "title": "Cada macaco no seu galho",
    "description": "Crie sua primeira sala.",
    "symbol": "🏠"
  },
  {
    "id": "planet",
    "title": "Planeta Macaco",
    "description": "Tenha 4 pessoas ao mesmo tempo na sua sala, incluindo você.",
    "symbol": "🎉"
  },
  {
    "id": "nomad",
    "title": "Nomade",
    "description": "Visite 10 salas diferentes.",
    "symbol": "🧭"
  },
  {
    "id": "friend1",
    "title": "Macaco amigo",
    "description": "Adicione seu primeiro amigo.",
    "symbol": "🤝"
  },
  {
    "id": "friend10",
    "title": "Bando formado",
    "description": "Tenha 10 amigos adicionados.",
    "symbol": "🐵"
  },
  {
    "id": "firstchat",
    "title": "Sinais de evolucao",
    "description": "Envie sua primeira mensagem no chat.",
    "symbol": "💬"
  },
  {
    "id": "days7",
    "title": "Emocionado",
    "description": "Visite a Junto.fm em 7 dias diferentes.",
    "symbol": "📅"
  },
  {
    "id": "streak7",
    "title": "Ponto marcado",
    "description": "Visite a Junto.fm por 7 dias consecutivos.",
    "symbol": "🔥"
  },
  {
    "id": "banana1",
    "title": "Agindo como tal",
    "description": "Arremesse sua primeira banana.",
    "symbol": "🍌"
  },
  {
    "id": "banana_mvp",
    "title": "MVP",
    "description": "Lance a banana que completa o barril.",
    "symbol": "🥤"
  },
  {
    "id": "banana100",
    "title": "Fornecedor da feira",
    "description": "Arremesse 100 bananas no total.",
    "symbol": "🍌"
  },
  {
    "id": "tomato1",
    "title": "Na cara nao",
    "description": "Arremesse seu primeiro tomate.",
    "symbol": "🍅"
  },
  {
    "id": "tomato50",
    "title": "Desperdicio...",
    "description": "Arremesse 50 tomates no total.",
    "symbol": "🥫"
  },
  {
    "id": "dance1",
    "title": "Dança gatinhe...",
    "description": "Comece sua primeira dança na pista.",
    "symbol": "💃"
  },
  {
    "id": "dance_hour",
    "title": "Nao ta puro",
    "description": "Acumule 1 hora dançando.",
    "symbol": "🪩"
  },
  {
    "id": "dance_all",
    "title": "Molejo",
    "description": "Experimente todas as danças disponíveis.",
    "symbol": "🕺"
  },
  {
    "id": "outfit1",
    "title": "Feio arrumado",
    "description": "Salve seu primeiro visual com roupa ou acessório.",
    "symbol": "👕"
  },
  {
    "id": "outfit_all",
    "title": "Exagerado",
    "description": "Use chapéu, óculos, fones e roupa ao mesmo tempo.",
    "symbol": "👑"
  }
];
  const thresholds={
    listen_seconds:[[3600,"listen1"],[36000,"listen10"],[180000,"listen50"],[360000,"listen100"]],
    dj_seconds:[[36000,"dj10"]],
    banana:[[1,"banana1"],[100,"banana100"]],
    tomato:[[1,"tomato1"],[50,"tomato50"]],
    dance_seconds:[[3600,"dance_hour"]],
    rooms:[[10,"nomad"]],
    friends:[[1,"friend1"],[10,"friend10"]],
    days:[[7,"days7"]],
    streak:[[7,"streak7"]],
    styles:[[5,"dance_all"]]
  };
  const ready=pool?Promise.resolve(accountAuth.ready).then(async ok=>{
    if(!ok)return false;
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievements(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,achievement_id VARCHAR(32) NOT NULL,unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(account_id,achievement_id))");
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievement_progress(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,metric VARCHAR(32) NOT NULL,value BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(account_id,metric))");
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievement_rooms(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,room VARCHAR(40) NOT NULL,PRIMARY KEY(account_id,room))");
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievement_days(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,day DATE NOT NULL,PRIMARY KEY(account_id,day))");
    await pool.query("CREATE TABLE IF NOT EXISTS junto_achievement_styles(account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,style VARCHAR(24) NOT NULL,PRIMARY KEY(account_id,style))");
    return true;
  }).catch(error=>{console.error("Conquistas:",error.message);return false;}):Promise.resolve(false);
  async function unlock(accountId,id,socket){
    if(!accountId||!pool||!await ready||!definitions.some(d=>d.id===id))return;
    const result=await pool.query("INSERT INTO junto_achievements(account_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING achievement_id",[accountId,id]);
    if(result.rowCount){
      for(const client of io.sockets.sockets.values())if(client.data.account?.id===accountId)client.emit("achievement-unlocked",{id});
    }
  }
  async function awardMetric(accountId,metric,value,socket){
    for(const [minimum,id] of thresholds[metric]||[])if(value>=minimum)await unlock(accountId,id,socket);
  }
  async function increment(accountId,metric,amount=1,socket){
    if(!accountId||!pool||!await ready||!thresholds[metric]||!Number.isSafeInteger(amount)||amount<1||amount>3600)return;
    const {rows}=await pool.query("INSERT INTO junto_achievement_progress(account_id,metric,value) VALUES($1,$2,$3) ON CONFLICT(account_id,metric) DO UPDATE SET value=junto_achievement_progress.value+EXCLUDED.value RETURNING value::text AS value",[accountId,metric,amount]);
    await awardMetric(accountId,metric,Number(rows[0].value),socket);
  }
  async function setMetric(accountId,metric,value,socket){
    if(!accountId||!pool||!await ready||!thresholds[metric]||!Number.isSafeInteger(value)||value<0)return;
    const {rows}=await pool.query("INSERT INTO junto_achievement_progress(account_id,metric,value) VALUES($1,$2,$3) ON CONFLICT(account_id,metric) DO UPDATE SET value=GREATEST(junto_achievement_progress.value,EXCLUDED.value) RETURNING value::text AS value",[accountId,metric,value]);
    await awardMetric(accountId,metric,Number(rows[0].value),socket);
  }
  async function event(accountId,id,socket){return unlock(accountId,id,socket);}
  async function visit(accountId,room,socket){
    if(!accountId||!pool||!await ready)return;
    if(room){
      await pool.query("INSERT INTO junto_achievement_rooms(account_id,room) VALUES($1,$2) ON CONFLICT DO NOTHING",[accountId,room]);
      const {rows}=await pool.query("SELECT COUNT(*)::int AS n FROM junto_achievement_rooms WHERE account_id=$1",[accountId]);
      await setMetric(accountId,"rooms",rows[0].n,socket);
    }
    await visitDay(accountId,socket);
  }
  async function visitDay(accountId,socket){
    if(!accountId||!pool||!await ready)return;
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    await pool.query("INSERT INTO junto_achievement_days(account_id,day) VALUES($1,$2::date) ON CONFLICT DO NOTHING",[accountId,today]);
    const {rows}=await pool.query("SELECT to_char(day,'YYYY-MM-DD') AS day FROM junto_achievement_days WHERE account_id=$1 ORDER BY day DESC",[accountId]);
    await setMetric(accountId,"days",rows.length,socket);
    const days=new Set(rows.map(r=>r.day));
    let streak=0;
    let cursor=Date.parse(today+"T00:00:00Z");
    while(days.has(new Date(cursor).toISOString().slice(0,10))){streak++;cursor-=86400000;}
    await setMetric(accountId,"streak",streak,socket);
  }
  async function danceStyle(accountId,style,socket){
    if(!accountId||!pool||!await ready||!["shake","macarena","party","capoeira","groove"].includes(style))return;
    await pool.query("INSERT INTO junto_achievement_styles(account_id,style) VALUES($1,$2) ON CONFLICT DO NOTHING",[accountId,style]);
    const {rows}=await pool.query("SELECT COUNT(*)::int AS n FROM junto_achievement_styles WHERE account_id=$1",[accountId]);
    await setMetric(accountId,"styles",rows[0].n,socket);
  }
  async function checkFriends(accountId,socket){
    if(!accountId)return;
    const friends=await accountAuth.friends(accountId);
    await setMetric(accountId,"friends",friends.length,socket);
  }
  async function snapshot(accountId){
    if(!pool||!await ready)return {configured:false,achievements:[]};
    const [{rows},mine,stats]=await Promise.all([
      pool.query("SELECT d.id,d.total,(SELECT COUNT(*)::int FROM junto_achievements j WHERE j.achievement_id=d.id) AS unlocked FROM (SELECT unnest($1::text[]) AS id,(SELECT COUNT(*)::int FROM junto_accounts) AS total) d",[definitions.map(d=>d.id)]),
      accountId?pool.query("SELECT achievement_id FROM junto_achievements WHERE account_id=$1",[accountId]):Promise.resolve({rows:[]}),
      accountId?pool.query("SELECT metric,value::text AS value FROM junto_achievement_progress WHERE account_id=$1",[accountId]):Promise.resolve({rows:[]})
    ]);
    const owned=new Set(mine.rows.map(r=>r.achievement_id));
    const metrics=Object.fromEntries(stats.rows.map(r=>[r.metric,Number(r.value)]));
    return {configured:true,achievements:definitions.map(d=>{
      const found=rows.find(r=>r.id===d.id);
      const entry=Object.entries(thresholds).flatMap(([metric,levels])=>levels.filter(([,id])=>id===d.id).map(([target])=>({metric,target})))[0];
      return {...d,unlocked:owned.has(d.id),percent:found?.total?Math.round(10000*found.unlocked/found.total)/100:0,...entry?{progress:Math.min(metrics[entry.metric]||0,entry.target),target:entry.target}:{}};
    })};
  }
  app.get("/api/achievements",async(req,res)=>{
    try{
      const account=await accountAuth.accountFromRequest(req);
      res.set("Cache-Control","no-store");
      res.json(await snapshot(account?.id));
    }catch(error){console.error("Conquistas snapshot:",error.message);res.status(503).json({error:"Conquistas indisponíveis."});}
  });
  io.on("connection",socket=>{
    if(socket.data.account?.id){
      void unlock(socket.data.account.id,"welcome",socket).catch(error=>console.error("Conquista welcome:",error.message));
      void visitDay(socket.data.account.id,socket).catch(error=>console.error("Conquista visita:",error.message));
    }
  });
  return {unlock,event,increment,setMetric,visit,visitDay,danceStyle,checkFriends,snapshot,ready};
};
