"use strict";
const path=require("node:path");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER=/^[a-z0-9_]{3,24}$/i;
function setupCommunityClassics(app,io,accounts,roomTransmitters){
  const pool=accounts.pool,postTimes=new Map(),actionTimes=new Map();
  const ready=Promise.resolve(accounts.ready).then(async ok=>{
    if(!ok||!pool)return false;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS junto_scrapbook(
        id BIGSERIAL PRIMARY KEY, profile_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        body VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS junto_scrapbook_profile_recent ON junto_scrapbook(profile_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS junto_testimonials(
        id BIGSERIAL PRIMARY KEY, profile_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        body VARCHAR(500) NOT NULL, accepted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(profile_id<>author_id)
      );
      CREATE INDEX IF NOT EXISTS junto_testimonials_profile ON junto_testimonials(profile_id,accepted,created_at DESC);
      CREATE TABLE IF NOT EXISTS junto_profile_visits(
        visitor_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        profile_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(visitor_id,profile_id), CHECK(visitor_id<>profile_id)
      );
      CREATE TABLE IF NOT EXISTS junto_communities(
        id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        name VARCHAR(60) NOT NULL, slug VARCHAR(40) UNIQUE NOT NULL,
        description VARCHAR(280) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS junto_community_members(
        community_id UUID NOT NULL REFERENCES junto_communities(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(community_id,account_id)
      );
      CREATE INDEX IF NOT EXISTS junto_community_members_count ON junto_community_members(community_id);
      CREATE TABLE IF NOT EXISTS junto_community_posts(
        id BIGSERIAL PRIMARY KEY, community_id UUID NOT NULL REFERENCES junto_communities(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        body VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS junto_community_posts_recent ON junto_community_posts(community_id,created_at DESC);
    `);
    return true;
  }).catch(e=>{console.error("Social clássico:",e.message);return false;});
  const safe=(req,res)=>{const origin=req.get("origin");if(req.get("sec-fetch-site")==="cross-site"||(origin&&origin!==`https://${req.get("host")}`&&origin!==`http://${req.get("host")}`)){res.status(403).json({error:"Origem inválida."});return false;}return true;};
  const wrap=fn=>async(req,res)=>{res.set("Cache-Control","no-store");try{if(!await ready)return res.status(503).json({error:"Comunidade temporariamente indisponível."});await fn(req,res);}catch(e){console.error("Social clássico:",e.message);res.status(500).json({error:"Não foi possível concluir. Tente novamente."});}};
  async function account(req){return accounts.accountFromRequest(req);}
  async function profile(username){const r=await pool.query("SELECT id,username,nickname AS name FROM junto_accounts WHERE lower(username)=lower($1) LIMIT 1",[username]);return r.rows[0]||null;}
  app.get("/api/social-classics/profile/:username",wrap(async(req,res)=>{
    if(!USER.test(req.params.username))return res.status(400).json({error:"Perfil inválido."});
    const target=await profile(req.params.username);if(!target)return res.status(404).json({error:"Perfil não encontrado."});
    const viewer=await account(req);
    const [scraps,testimonials,visits]=await Promise.all([
      pool.query(`SELECT s.id,s.body,s.created_at,a.username,a.nickname AS name,a.avatar FROM junto_scrapbook s JOIN junto_accounts a ON a.id=s.author_id WHERE s.profile_id=$1 ORDER BY s.created_at DESC LIMIT 30`,[target.id]),
      pool.query(`SELECT t.id,t.body,t.created_at,a.username,a.nickname AS name,a.avatar FROM junto_testimonials t JOIN junto_accounts a ON a.id=t.author_id WHERE t.profile_id=$1 AND t.accepted=TRUE ORDER BY t.created_at DESC LIMIT 30`,[target.id]),
      pool.query("SELECT count(*)::int AS count FROM junto_profile_visits WHERE profile_id=$1 AND last_seen>NOW()-INTERVAL '30 days'",[target.id])
    ]);
    let pending=[],visitors=[];
    if(viewer?.id===target.id){const p=await pool.query(`SELECT t.id,t.body,t.created_at,a.username,a.nickname AS name FROM junto_testimonials t JOIN junto_accounts a ON a.id=t.author_id WHERE t.profile_id=$1 AND t.accepted=FALSE ORDER BY t.created_at DESC LIMIT 30`,[target.id]);pending=p.rows;const v=await pool.query(`SELECT a.username,a.nickname AS name,a.avatar,v.last_seen FROM junto_profile_visits v JOIN junto_accounts a ON a.id=v.visitor_id WHERE v.profile_id=$1 ORDER BY v.last_seen DESC LIMIT 20`,[target.id]);visitors=v.rows;}
    res.json({scrapbook:scraps.rows,testimonials:testimonials.rows,pending,visitors,visits:visits.rows[0].count,isSelf:viewer?.id===target.id});
  }));
  app.post("/api/social-classics/visit/:username",wrap(async(req,res)=>{
    if(!safe(req,res))return;
    const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para registrar visitas."});
    if(!USER.test(req.params.username))return res.status(400).json({error:"Perfil inválido."});
    const target=await profile(req.params.username);if(!target)return res.status(404).json({error:"Perfil não encontrado."});
    if(viewer.id!==target.id)await pool.query(`INSERT INTO junto_profile_visits(visitor_id,profile_id) VALUES($1,$2) ON CONFLICT(visitor_id,profile_id) DO UPDATE SET last_seen=NOW()`,[viewer.id,target.id]);
    res.json({ok:true});
  }));
  app.post("/api/social-classics/scrapbook/:username",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para deixar um recado."});
    const target=await profile(req.params.username);if(!target)return res.status(404).json({error:"Perfil não encontrado."});
    const body=typeof req.body?.body==="string"?req.body.body.trim():"";if(!body||body.length>500)return res.status(400).json({error:"Escreva um recado de até 500 caracteres."});
    const recent=await pool.query("SELECT 1 FROM junto_scrapbook WHERE author_id=$1 AND created_at>NOW()-INTERVAL '10 seconds' LIMIT 1",[viewer.id]);if(recent.rowCount)return res.status(429).json({error:"Espere alguns segundos antes de publicar outro recado."});
    await pool.query("INSERT INTO junto_scrapbook(profile_id,author_id,body) VALUES($1,$2,$3)",[target.id,viewer.id,body]);res.status(201).json({ok:true});
  }));
  app.post("/api/social-classics/testimonials/:username",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para deixar um depoimento."});
    const target=await profile(req.params.username);if(!target)return res.status(404).json({error:"Perfil não encontrado."});if(viewer.id===target.id)return res.status(400).json({error:"Você não pode depor sobre si mesmo."});
    const body=typeof req.body?.body==="string"?req.body.body.trim():"";if(!body||body.length>500)return res.status(400).json({error:"Depoimento de até 500 caracteres."});const now=Date.now(),last=actionTimes.get(viewer.id+":testimonial")||0;if(now-last<30000)return res.status(429).json({error:"Aguarde 30 segundos antes de enviar outro depoimento."});actionTimes.set(viewer.id+":testimonial",now);
    await pool.query("INSERT INTO junto_testimonials(profile_id,author_id,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[target.id,viewer.id,body]);res.status(201).json({ok:true,message:"Depoimento enviado para aprovação."});
  }));
  app.post("/api/social-classics/testimonials/:id/respond",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta."});
    if(!/^\d{1,15}$/.test(req.params.id))return res.status(400).json({error:"Depoimento inválido."});
    const accepted=req.body?.accepted===true;
    const result=await pool.query("UPDATE junto_testimonials SET accepted=$1 WHERE id=$2 AND profile_id=$3 RETURNING id",[accepted,req.params.id,viewer.id]);
    if(!result.rowCount)return res.status(404).json({error:"Depoimento não encontrado."});res.json({ok:true});
  }));
  app.get("/api/social-classics/communities",wrap(async(req,res)=>{
    const viewer=await account(req);
    const result=await pool.query(`SELECT c.id,c.name,c.slug,c.description,c.created_at,a.nickname AS owner_name,count(m.account_id)::int AS members,bool_or(m.account_id=$1) AS joined FROM junto_communities c JOIN junto_accounts a ON a.id=c.owner_id LEFT JOIN junto_community_members m ON m.community_id=c.id GROUP BY c.id,a.nickname ORDER BY members DESC,c.created_at DESC LIMIT 100`,[viewer?.id||null]);
    res.json({communities:result.rows});
  }));
  app.post("/api/social-classics/communities",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para criar uma comunidade."});
    const name=typeof req.body?.name==="string"?req.body.name.trim():"",description=typeof req.body?.description==="string"?req.body.description.trim():"";
    if(name.length<3||name.length>60||description.length>280)return res.status(400).json({error:"Nome de 3 a 60 caracteres; descrição até 280."});const now=Date.now(),last=actionTimes.get(viewer.id+":community")||0;if(now-last<60000)return res.status(429).json({error:"Aguarde um minuto antes de criar outra comunidade."});actionTimes.set(viewer.id+":community",now);
    const slug=name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);
    if(!slug)return res.status(400).json({error:"Escolha outro nome."});
    const id=require("node:crypto").randomUUID();
    try{await pool.query("INSERT INTO junto_communities(id,owner_id,name,slug,description) VALUES($1,$2,$3,$4,$5)",[id,viewer.id,name,slug,description]);await pool.query("INSERT INTO junto_community_members(community_id,account_id) VALUES($1,$2)",[id,viewer.id]);}catch(e){if(e.code==="23505")return res.status(409).json({error:"Já existe uma comunidade com esse nome."});throw e;}
    res.status(201).json({ok:true,id,slug});
  }));
  app.post("/api/social-classics/communities/:id/join",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para participar."});if(!UUID.test(req.params.id))return res.status(400).json({error:"Comunidade inválida."});
    const exists=await pool.query("SELECT 1 FROM junto_communities WHERE id=$1",[req.params.id]);if(!exists.rowCount)return res.status(404).json({error:"Comunidade não encontrada."});
    await pool.query("INSERT INTO junto_community_members(community_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,viewer.id]);res.json({ok:true});
  }));
  app.post("/api/social-classics/communities/:id/leave",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta."});if(!UUID.test(req.params.id))return res.status(400).json({error:"Comunidade inválida."});
    await pool.query("DELETE FROM junto_community_members WHERE community_id=$1 AND account_id=$2 AND NOT EXISTS(SELECT 1 FROM junto_communities WHERE id=$1 AND owner_id=$2)",[req.params.id,viewer.id]);res.json({ok:true});
  }));
  app.get("/api/social-classics/communities/:id/posts",wrap(async(req,res)=>{
    if(!UUID.test(req.params.id))return res.status(400).json({error:"Comunidade inválida."});
    const result=await pool.query(`SELECT p.id,p.body,p.created_at,a.username,a.nickname AS name FROM junto_community_posts p JOIN junto_accounts a ON a.id=p.author_id WHERE p.community_id=$1 ORDER BY p.created_at DESC LIMIT 40`,[req.params.id]);
    res.json({posts:result.rows});
  }));
  app.post("/api/social-classics/communities/:id/posts",wrap(async(req,res)=>{
    if(!safe(req,res))return;const viewer=await account(req);if(!viewer)return res.status(401).json({error:"Entre na conta para publicar."});
    if(!UUID.test(req.params.id))return res.status(400).json({error:"Comunidade inválida."});
    const body=typeof req.body?.body==="string"?req.body.body.trim():"";if(!body||body.length>500)return res.status(400).json({error:"Escreva uma publicação de até 500 caracteres."});
    const member=await pool.query("SELECT 1 FROM junto_community_members WHERE community_id=$1 AND account_id=$2",[req.params.id,viewer.id]);if(!member.rowCount)return res.status(403).json({error:"Participe da comunidade antes de publicar."});
    const now=Date.now(),last=postTimes.get(viewer.id)||0;if(now-last<10000)return res.status(429).json({error:"Espere alguns segundos antes de publicar novamente."});postTimes.set(viewer.id,now);
    await pool.query("INSERT INTO junto_community_posts(community_id,author_id,body) VALUES($1,$2,$3)",[req.params.id,viewer.id,body]);res.status(201).json({ok:true});
  }));
  app.get("/comunidades",(_req,res)=>res.set("Cache-Control","no-cache").sendFile(path.join(__dirname,"public","communities.html")));
  const onlineAccounts=new Map(),listeningTracks=new Map();
  async function publishListening(accountId,track){
    try{const friends=await accounts.friends(accountId),ids=new Set(friends.map(f=>f.id));for(const peer of io.sockets.sockets.values()){const recipient=await currentSocialAccount(peer);if(recipient?.id&&ids.has(recipient.id))peer.emit("social-listening-update",{accountId,track});}}catch(_){}
  }
  async function publishPresence(accountId,online){
    try{
      const friends=await accounts.friends(accountId),friendIds=new Set(friends.map(f=>f.id));
      const account=online?[...io.sockets.sockets.values()].find(s=>s.data.account?.id===accountId)?.data.account:null;
      for(const peer of io.sockets.sockets.values()){const recipient=await currentSocialAccount(peer);if(recipient?.id&&friendIds.has(recipient.id))peer.emit("social-presence-update",{accountId,online,status:account?.motto||"",track:listeningTracks.get(accountId)||null});}
    }catch(_){}
  }
  const winkTimes=new Map(),emoteTimes=new Map();
  async function currentSocialAccount(socket){
    const account=await accounts.accountFromRequest(socket.request).catch(()=>null);
    return account?.id&&account.id===socket.data.account?.id?account:null;
  }
  async function sendPresenceState(socket){
    const account=await currentSocialAccount(socket),id=account?.id;
    if(!id){
      const staleId=socket.data.account?.id,sockets=staleId&&onlineAccounts.get(staleId);
      sockets?.delete(socket.id);
      if(sockets&&!sockets.size){onlineAccounts.delete(staleId);if(listeningTracks.delete(staleId))void publishListening(staleId,null);void publishPresence(staleId,false);}
      socket.emit("social-presence-state",{online:[],listening:[]});return;
    }
    try{
      const friends=await accounts.friends(id),friendIds=new Set(friends.map(friend=>friend.id));
      const online=[...onlineAccounts.keys()].filter(friendId=>friendIds.has(friendId));
      const listening=[...listeningTracks.entries()].filter(([friendId])=>friendIds.has(friendId)).map(([accountId,track])=>({accountId,track}));
      socket.emit("social-presence-state",{online,listening});
    }catch(_){socket.emit("social-presence-state",{online:[],listening:[]});}
  }
  io.on("connection",socket=>{
    const accountId=socket.data.account?.id;
    if(accountId){
      if(!onlineAccounts.has(accountId))onlineAccounts.set(accountId,new Set());
      const sockets=onlineAccounts.get(accountId),first=sockets.size===0;sockets.add(socket.id);
      void sendPresenceState(socket);
      if(first)void publishPresence(accountId,true);
    }
    socket.on("social-presence-sync",()=>void sendPresenceState(socket));
    socket.on("track-update",async payload=>{
      const account=await currentSocialAccount(socket),id=account?.id,room=socket.data.room,track=payload?.track;
      if(!id||!room||payload?.room!==room||!track||typeof track.name!=="string"||typeof track.artists!=="string")return;
      if(roomTransmitters&&roomTransmitters.get(room)?.id!==socket.id)return;
      const next={name:track.name.slice(0,200),artists:track.artists.slice(0,300),id:String(track.id||"").slice(0,22)};
      const previous=listeningTracks.get(id);
      if(previous?.id===next.id&&previous?.name===next.name)return;
      listeningTracks.set(id,next);
      void publishListening(id,next);
    });
    socket.on("track-clear",async()=>{
      const account=await currentSocialAccount(socket),id=account?.id,room=socket.data.room;
      if(!id||!room||(roomTransmitters&&roomTransmitters.get(room)?.id!==socket.id))return;
      if(!listeningTracks.delete(id))return;
      void publishListening(id,null);
    });
    socket.on("social-emote",async payload=>{
      const sender=await currentSocialAccount(socket),peerId=String(payload?.accountId||""),kind=String(payload?.kind||"");
      const emotes={dance:"💃🐒",banana:"🍌🐒",laugh:"😂🐒",heart:"💖🐒"};
      if(!sender?.id||!UUID.test(peerId)||peerId===sender.id||!emotes[kind])return socket.emit("social-emote-error",{message:"Escolha um amigo e um wink válido."});
      const now=Date.now(),last=emoteTimes.get(socket.id)||0;if(now-last<3000)return socket.emit("social-emote-error",{message:"Aguarde um instante antes de enviar outro wink."});
      try{
        const [a,b]=[sender.id,peerId].sort(),friend=await pool.query("SELECT 1 FROM junto_friendships WHERE user_a=$1 AND user_b=$2",[a,b]);
        if(!friend.rowCount)return socket.emit("social-emote-error",{message:"Winks só podem ser enviados entre amigos."});
        emoteTimes.set(socket.id,now);let delivered=false;
        for(const peer of io.sockets.sockets.values()){const recipient=await currentSocialAccount(peer);if(recipient?.id===peerId){peer.emit("social-emote-received",{from:sender.nickname||"Um amigo",emote:emotes[kind]});delivered=true;}}
        socket.emit("social-emote-sent",{delivered});
      }catch(_){socket.emit("social-emote-error",{message:"Não foi possível enviar o wink."});}
    });
    socket.on("social-wink",async payload=>{
      const sender=await currentSocialAccount(socket);
      const peerId=String(payload?.accountId||"");
      if(!sender||!UUID.test(peerId)||peerId===sender.id)return socket.emit("social-wink-error",{message:"Entre na conta e escolha um amigo."});
      const now=Date.now(),last=winkTimes.get(socket.id)||0;
      if(now-last<15000)return socket.emit("social-wink-error",{message:"Aguarde um pouco antes de chamar atenção novamente."});
      try{
        const [a,b]=[sender.id,peerId].sort();
        const friend=await pool.query("SELECT 1 FROM junto_friendships WHERE user_a=$1 AND user_b=$2",[a,b]);
        if(!friend.rowCount)return socket.emit("social-wink-error",{message:"Só é possível chamar atenção de amigos."});
        winkTimes.set(socket.id,now);
        let delivered=false;
        for(const peer of io.sockets.sockets.values()){const recipient=await currentSocialAccount(peer);if(recipient?.id===peerId){peer.emit("social-wink-received",{from:sender.nickname||"Um amigo"});delivered=true;}}
        socket.emit("social-wink-sent",{delivered});
      }catch(e){socket.emit("social-wink-error",{message:"Não foi possível chamar atenção agora."});}
    });
    socket.on("disconnect",()=>{
      winkTimes.delete(socket.id);emoteTimes.delete(socket.id);
      if(accountId){const sockets=onlineAccounts.get(accountId);sockets?.delete(socket.id);if(sockets&&!sockets.size){onlineAccounts.delete(accountId);if(listeningTracks.delete(accountId))void publishListening(accountId,null);void publishPresence(accountId,false);}}
    });
  });
  return {ready};
}
module.exports=setupCommunityClassics;
