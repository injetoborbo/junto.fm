"use strict";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports=function setupDirectMessages(io,accounts){
  const pool=accounts.pool;
  const ready=Promise.resolve(accounts.ready).then(async ok=>{
    if(!ok||!pool)return false;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS junto_dm_messages(
        id BIGSERIAL PRIMARY KEY,
        sender_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
        body VARCHAR(2000) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS junto_dm_pair_recent
        ON junto_dm_messages(sender_id,recipient_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS junto_dm_recipient_unread
        ON junto_dm_messages(recipient_id,read_at,created_at DESC);
    `);
    return true;
  }).catch(error=>{console.error("Mensagens privadas:",error.message);return false;});

  const limits=new Map();
  function allowed(socket){
    const now=Date.now(),old=(limits.get(socket.id)||[]).filter(t=>now-t<10000);
    if(old.length>=8){limits.set(socket.id,old);return false;}
    old.push(now);limits.set(socket.id,old);return true;
  }
  async function currentAccount(socket){
    try{
      const account=await accounts.accountFromRequest(socket.request);
      socket.data.account=account;
      return account;
    }catch{return null;}
  }
  async function areFriends(a,b){
    if(!UUID.test(String(a||""))||!UUID.test(String(b||""))||a===b)return false;
    const [first,second]=[a,b].sort();
    const result=await pool.query("SELECT 1 FROM junto_friendships WHERE user_a=$1 AND user_b=$2",[first,second]);
    return result.rowCount>0;
  }
  async function emitConversations(socket,account){
    const result=await pool.query(`
      WITH peers AS (
        SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS peer_id
        FROM junto_friendships WHERE user_a=$1 OR user_b=$1
      ), latest AS (
        SELECT DISTINCT ON (peer_id) peer_id,body,created_at,sender_id
        FROM (
          SELECT id,CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS peer_id,
                 body,created_at,sender_id
          FROM junto_dm_messages
          WHERE sender_id=$1 OR recipient_id=$1
        ) messages
        ORDER BY peer_id,created_at DESC,id DESC
      ), unread AS (
        SELECT sender_id AS peer_id,COUNT(*)::int AS count
        FROM junto_dm_messages WHERE recipient_id=$1 AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT a.id,a.nickname AS name,a.username,a.avatar,a.motto,
             latest.body AS last_message,latest.created_at AS last_at,
             COALESCE(unread.count,0)::int AS unread
      FROM peers p JOIN junto_accounts a ON a.id=p.peer_id
      LEFT JOIN latest ON latest.peer_id=p.peer_id
      LEFT JOIN unread ON unread.peer_id=p.peer_id
      ORDER BY latest.created_at DESC NULLS LAST,a.nickname ASC
      LIMIT 150
    `,[account.id]);
    socket.emit("dm-conversations",{conversations:result.rows});
  }
  async function history(socket,account,peerId){
    if(!UUID.test(peerId)||!(await areFriends(account.id,peerId)))
      return socket.emit("dm-error",{message:"Mensagens privadas só ficam disponíveis entre amigos."});
    const result=await pool.query(`
      SELECT id,sender_id,recipient_id,body,created_at,read_at
      FROM (
        SELECT id,sender_id,recipient_id,body,created_at,read_at
        FROM junto_dm_messages
        WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
        ORDER BY created_at DESC,id DESC LIMIT 80
      ) recent ORDER BY created_at ASC,id ASC
    `,[account.id,peerId]);
    await pool.query("UPDATE junto_dm_messages SET read_at=NOW() WHERE sender_id=$1 AND recipient_id=$2 AND read_at IS NULL",[peerId,account.id]);
    socket.emit("dm-history",{accountId:peerId,messages:result.rows});
    await emitConversations(socket,account);
  }
  io.on("connection",socket=>{
    socket.on("dm-list",async()=>{
      const account=await currentAccount(socket);
      if(!account)return socket.emit("dm-error",{message:"Entre na sua conta para usar mensagens privadas."});
      if(!await ready)return socket.emit("dm-error",{message:"Mensagens privadas indisponíveis no momento."});
      try{await emitConversations(socket,account);}
      catch(error){console.error("DM list:",error.message);socket.emit("dm-error",{message:"Não foi possível carregar suas conversas."});}
    });
    socket.on("dm-open",async payload=>{
      const account=await currentAccount(socket);
      if(!account)return socket.emit("dm-error",{message:"Entre na sua conta para usar mensagens privadas."});
      if(!await ready)return socket.emit("dm-error",{message:"Mensagens privadas indisponíveis no momento."});
      try{await history(socket,account,String(payload?.accountId||""));}
      catch(error){console.error("DM history:",error.message);socket.emit("dm-error",{message:"Não foi possível abrir esta conversa."});}
    });
    socket.on("dm-send",async payload=>{
      const account=await currentAccount(socket);
      if(!account)return socket.emit("dm-error",{message:"Entre na sua conta para enviar mensagens."});
      if(!await ready)return socket.emit("dm-error",{message:"Mensagens privadas indisponíveis no momento."});
      if(!allowed(socket))return socket.emit("dm-error",{message:"Você está enviando mensagens rápido demais. Aguarde um instante."});
      const peerId=String(payload?.accountId||"");
      const body=typeof payload?.text==="string"?payload.text.trim():"";
      if(!body||body.length>2000)return socket.emit("dm-error",{message:"A mensagem precisa ter entre 1 e 2.000 caracteres."});
      try{
        if(!(await areFriends(account.id,peerId)))return socket.emit("dm-error",{message:"Vocês precisam ser amigos para conversar."});
        const inserted=await pool.query(`
          INSERT INTO junto_dm_messages(sender_id,recipient_id,body)
          VALUES($1,$2,$3)
          RETURNING id,sender_id,recipient_id,body,created_at,read_at
        `,[account.id,peerId,body]);
        const message=inserted.rows[0];
        socket.emit("dm-message",message);
        for(const peer of io.sockets.sockets.values()){
          if(peer.id!==socket.id&&peer.data.account?.id===peerId){
            peer.emit("dm-message",message);
            const other=await currentAccount(peer);
            if(other)await emitConversations(peer,other);
          }
        }
        await emitConversations(socket,account);
      }catch(error){console.error("DM send:",error.message);socket.emit("dm-error",{message:"Não foi possível enviar. Tente novamente."});}
    });
    socket.on("disconnect",()=>limits.delete(socket.id));
  });
  return {ready};
};
