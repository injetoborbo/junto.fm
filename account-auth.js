"use strict";
const crypto=require("crypto");
const {Pool}=require("pg");
const {promisify}=require("util");
const scrypt=promisify(crypto.scrypt);

module.exports=function setupAccounts(app){
  const clientId=process.env.GOOGLE_CLIENT_ID||"";
  const secret=process.env.GOOGLE_CLIENT_SECRET||"";
  const dbUrl=process.env.DATABASE_URL||"";
  const enabled=Boolean(clientId&&secret&&dbUrl);
  const pool=dbUrl?new Pool({connectionString:dbUrl,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:true}:false,max:5}):null;
  const states=new Map();
  const lifetime=30*24*60*60*1000;
  const ready=pool?pool.query(`
    CREATE TABLE IF NOT EXISTS junto_accounts (
      id UUID PRIMARY KEY,
      google_sub TEXT UNIQUE,
      nickname VARCHAR(24) NOT NULL DEFAULT 'Macaco',
      avatar TEXT NOT NULL DEFAULT '',
      motto VARCHAR(90) NOT NULL DEFAULT '',
      wardrobe JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS junto_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS junto_friend_requests (
      from_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      to_id UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(from_id,to_id),
      CHECK(from_id<>to_id)
    );
    CREATE TABLE IF NOT EXISTS junto_friendships (
      user_a UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      user_b UUID NOT NULL REFERENCES junto_accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_a,user_b),
      CHECK(user_a<user_b)
    );
    ALTER TABLE junto_accounts ALTER COLUMN google_sub DROP NOT NULL;
    ALTER TABLE junto_accounts ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE junto_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS junto_accounts_email_unique ON junto_accounts (lower(email)) WHERE email IS NOT NULL;
    `).then(()=>true).catch(error=>{console.error("Contas: banco indisponível:",error.message);return false;}):Promise.resolve(false);
  const hash=s=>crypto.createHash("sha256").update(s).digest("hex");
  const attempts=new Map();
  function permitted(req){
    const key=String(req.ip||"unknown");
    const now=Date.now(),old=attempts.get(key)||[];
    const recent=old.filter(n=>now-n<15*60*1000);
    if(recent.length>=12)return false;
    recent.push(now);attempts.set(key,recent);
    return true;
  }
  function sameOrigin(req){
    const origin=req.get("origin");
    if(!origin)return false;
    try{return new URL(origin).host===req.get("host")&&new URL(origin).protocol===(req.secure||req.headers["x-forwarded-proto"]==="https"?"https:":"http:");}catch{return false}
  }
  function validCredentials(body){
    const email=String(body?.email||"").trim().toLowerCase();
    const password=String(body?.password||"");
    return {email,password,valid:/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)&&email.length<=254&&password.length>=12&&Buffer.byteLength(password)<=256};
  }
  async function passwordDigest(password,salt){
    return (await scrypt(password,salt,64,{maxmem:32*1024*1024})).toString("hex");
  }
  async function createSession(req,res,id){
    const token=crypto.randomBytes(32).toString("hex");
    await pool.query("INSERT INTO junto_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)",[hash(token),id,new Date(Date.now()+lifetime)]);
    setCookie(req,res,"junto_account",token,lifetime/1000);
  }
  async function passwordEndpoint(req,res,register){
    if(!await ready)return res.status(503).json({error:"Banco de contas indisponível."});
    if(!sameOrigin(req))return res.status(403).json({error:"Origem da requisição inválida."});
    if(!permitted(req))return res.status(429).json({error:"Muitas tentativas. Aguarde 15 minutos."});
    const {email,password,valid}=validCredentials(req.body);
    if(!valid)return res.status(400).json({error:"Informe um e-mail válido e uma senha de 12 a 256 caracteres."});
    try{
      if(register){
        const salt=crypto.randomBytes(16).toString("hex");
        const digest=await passwordDigest(password,salt);
        const result=await pool.query("INSERT INTO junto_accounts(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",[crypto.randomUUID(),email,"scrypt:"+salt+":"+digest]);
        if(!result.rowCount)return res.status(409).json({error:"Este e-mail já possui cadastro."});
        await createSession(req,res,result.rows[0].id);
      }else{
        const result=await pool.query("SELECT id,password_hash FROM junto_accounts WHERE lower(email)=$1",[email]);
        const stored=result.rows[0]?.password_hash||"";
        const parts=stored.split(":");
        const salt=parts[0]==="scrypt"&&/^[a-f0-9]{32}$/.test(parts[1]||"")?parts[1]:"00000000000000000000000000000000";
        const calculated=Buffer.from(await passwordDigest(password,salt),"hex");
        const expected=/^[a-f0-9]{128}$/.test(parts[2]||"")?Buffer.from(parts[2],"hex"):Buffer.alloc(64);
        if(!result.rows[0]||!crypto.timingSafeEqual(calculated,expected))
          return res.status(401).json({error:"E-mail ou senha incorretos."});
        await createSession(req,res,result.rows[0].id);
      }
      return res.json({ok:true});
    }catch(error){console.error("Conta local:",error.message);return res.status(503).json({error:"Não foi possível concluir a operação."});}
  }
  app.post("/api/account/register",(req,res)=>passwordEndpoint(req,res,true));
  app.post("/api/account/login",(req,res)=>passwordEndpoint(req,res,false));
  setInterval(()=>{const now=Date.now();for(const [k,v] of attempts){const live=v.filter(t=>now-t<900000);if(live.length)attempts.set(k,live);else attempts.delete(k)}},900000).unref();
  function cookie(req,name){return String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||"";}
  function setCookie(req,res,name,value,maxAge){
    const secure=req.secure||req.headers["x-forwarded-proto"]==="https";
    res.append("Set-Cookie",name+"="+value+"; HttpOnly; SameSite=Lax; Path=/; Max-Age="+maxAge+(secure?"; Secure":""));
  }
  function redirectUri(req){return process.env.GOOGLE_REDIRECT_URI||((req.headers["x-forwarded-proto"]||req.protocol)+"://"+req.get("host")+"/auth/google/callback");}
  async function accountFromRequest(req){
    if(!await ready)return null;
    const token=cookie(req,"junto_account");
    if(!/^[a-f0-9]{64}$/.test(token))return null;
    const result=await pool.query(`SELECT a.id,a.nickname,a.avatar,a.motto,a.wardrobe
      FROM junto_sessions s JOIN junto_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[hash(token)]);
    return result.rows[0]||null;
  }
  const safeAccount=a=>({id:a.id,name:a.nickname,avatar:a.avatar,motto:a.motto,wardrobe:a.wardrobe});
  app.get("/api/account/status",async(req,res)=>{
    try{
      const account=await accountFromRequest(req);
      res.set("Cache-Control","no-store");
      res.json({configured:enabled && await ready,loggedIn:!!account,profile:account?safeAccount(account):null});
    }catch(e){res.status(503).json({configured:false,loggedIn:false,error:"Serviço de contas indisponível."});}
  });
  app.get("/auth/google",async(req,res)=>{
    if(!enabled||!await ready)return res.status(503).send("Login Google ainda não configurado.");
    const state=crypto.randomBytes(24).toString("hex");
    states.set(state,{expires:Date.now()+600000});
    setCookie(req,res,"junto_google_state",state,600);
    const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri(req),response_type:"code",scope:"openid",state,prompt:"select_account"}).toString();
    res.redirect(url.toString());
  });
  app.get("/auth/google/callback",async(req,res)=>{
    const state=String(req.query.state||"");
    const pending=states.get(state);states.delete(state);
    const cookieState=cookie(req,"junto_google_state");
    setCookie(req,res,"junto_google_state","",0);
    if(!pending||pending.expires<Date.now()||cookieState!==state||typeof req.query.code!=="string")return res.status(400).send("Login inválido ou expirado.");
    try{
      if(!enabled||!await ready)throw Error("Conta não configurada.");
      const response=await fetch("https://oauth2.googleapis.com/token",{
        method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:clientId,client_secret:secret,redirect_uri:redirectUri(req),grant_type:"authorization_code",code:req.query.code})
      });
      if(!response.ok)throw Error("Token OAuth não autorizado.");
      const tokens=await response.json();
      const identity=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+tokens.access_token}});
      if(!identity.ok)throw Error("Falha na validação de identidade.");
      const info=await identity.json();
      if(!info.sub||typeof info.sub!=="string")throw Error("Identidade não confirmada.");
      // Google sub é armazenado somente para identificação. Não usamos foto, nome ou e-mail do Google.
      const result=await pool.query(`INSERT INTO junto_accounts (id,google_sub)
        VALUES ($1,$2) ON CONFLICT (google_sub) DO UPDATE SET google_sub=EXCLUDED.google_sub
        RETURNING id`,[crypto.randomUUID(),info.sub]);
      const token=crypto.randomBytes(32).toString("hex");
      await pool.query("INSERT INTO junto_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)",[hash(token),result.rows[0].id,new Date(Date.now()+lifetime)]);
      setCookie(req,res,"junto_account",token,lifetime/1000);
      res.redirect("/?account=connected");
    }catch(error){console.warn("Conta Google:",error.message);res.status(502).send("Não foi possível concluir o cadastro. Tente novamente.");}
  });
  app.post("/api/account/logout",async(req,res)=>{
    try{
      const token=cookie(req,"junto_account");
      if(/^[a-f0-9]{64}$/.test(token)&&await ready)await pool.query("DELETE FROM junto_sessions WHERE token_hash=$1",[hash(token)]);
    }catch(error){console.warn("Logout de conta:",error.message);}
    setCookie(req,res,"junto_account","",0);res.json({ok:true});
  });
  function cleanProfile(input={}){
    const name=String(input.name||"Macaco").replace(/\s+/g," ").trim().slice(0,24)||"Macaco";
    const motto=String(input.motto||"").replace(/\s+/g," ").trim().slice(0,90);
    const avatar=String(input.avatar||"");
    // Somente foto enviada e compactada pelo usuário. Nunca usar foto do Google.
    const valid=/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(avatar)&&avatar.length<=220000;
    const allowed={hat:["nenhum","bone","gorro","palha","branco","caveira"],glasses:["nenhum","escuros","redondos","sem_aro"],headphones:["nenhum","azul","rosa","preto"],outfit:["padrao","rosa","rosa_novo"]};
    const wardrobe=Object.fromEntries(Object.entries(allowed).map(([k,values])=>[k,values.includes(input.wardrobe?.[k])?input.wardrobe[k]:values[0]]));
    return {name,motto,avatar:valid?avatar:"",wardrobe};
  }
  app.post("/api/account/profile",async(req,res)=>{
    try{
      const account=await accountFromRequest(req);
      if(!account)return res.status(401).json({error:"Entre com Google para salvar sua conta."});
      const input=cleanProfile(req.body?.profile);
      const r=await pool.query("UPDATE junto_accounts SET nickname=$1,avatar=$2,motto=$3,wardrobe=$4 WHERE id=$5 RETURNING *",
        [input.name,input.avatar,input.motto,JSON.stringify(input.wardrobe),account.id]);
      res.json({ok:true,profile:safeAccount(r.rows[0])});
    }catch(error){res.status(503).json({error:"Não foi possível salvar seu perfil."});}
  });
  async function friends(accountId){
    const result=await pool.query(`SELECT a.id,a.nickname AS name,a.avatar
      FROM junto_friendships f JOIN junto_accounts a
      ON a.id=CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END
      WHERE f.user_a=$1 OR f.user_b=$1 ORDER BY a.nickname LIMIT 150`,[accountId]);
    return result.rows;
  }
  async function requests(accountId){
    const result=await pool.query(`SELECT a.id,a.nickname AS name,a.avatar
      FROM junto_friend_requests r JOIN junto_accounts a ON a.id=r.from_id WHERE r.to_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[accountId]);
    return result.rows;
  }
  async function request(from,to){
    if(from===to)return {ok:false,error:"Você não pode adicionar sua própria conta."};
    const existing=await pool.query("SELECT 1 FROM junto_friendships WHERE user_a=$1 AND user_b=$2",[...([from,to].sort())]);
    if(existing.rowCount)return {ok:false,error:"Vocês já são amigos."};
    await pool.query("INSERT INTO junto_friend_requests(from_id,to_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[from,to]);
    return {ok:true};
  }
  async function respond(user,from,accepted){
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("DELETE FROM junto_friend_requests WHERE from_id=$1 AND to_id=$2 RETURNING from_id",[from,user]);
      if(!found.rowCount){await client.query("ROLLBACK");return false;}
      if(accepted){
        const [a,b]=[from,user].sort();
        await client.query("INSERT INTO junto_friendships(user_a,user_b) VALUES($1,$2) ON CONFLICT DO NOTHING",[a,b]);
      }
      await client.query("COMMIT");return true;
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }
  async function remove(user,other){
    const [a,b]=[user,other].sort();
    await pool.query("DELETE FROM junto_friendships WHERE user_a=$1 AND user_b=$2",[a,b]);
  }
  setInterval(()=>{const now=Date.now();for(const [k,v] of states)if(v.expires<now)states.delete(k);if(pool)pool.query("DELETE FROM junto_sessions WHERE expires_at<NOW()").catch(()=>{});},3600000).unref();
  return {accountFromRequest,friends,requests,request,respond,remove,safeAccount,ready};
};
