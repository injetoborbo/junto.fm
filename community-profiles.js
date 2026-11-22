"use strict";
const path=require("node:path");
const USERNAME=/^[a-z0-9_]{3,20}$/i;

module.exports=function setupCommunityProfiles(app,accounts){
  const pool=accounts.pool;
  const ready=Promise.resolve(accounts.ready);
  app.get("/u/:username",async(req,res,next)=>{
    const username=String(req.params.username||"");
    if(!USERNAME.test(username))return next();
    res.set("Cache-Control","no-cache");
    return res.sendFile(path.join(__dirname,"public","index.html"));
  });
  app.get("/api/community/profile/:username",async(req,res)=>{
    res.set("Cache-Control","no-store");
    const username=String(req.params.username||"");
    if(!USERNAME.test(username))return res.status(400).json({error:"Nome de usuário inválido."});
    try{
      if(!pool||!await ready)return res.status(503).json({error:"Perfis indisponíveis no momento."});
      const found=await pool.query(`
        SELECT id,username,nickname AS name,avatar,motto,created_at
        FROM junto_accounts WHERE lower(username)=lower($1) LIMIT 1
      `,[username]);
      if(!found.rowCount)return res.status(404).json({error:"Esse perfil não existe."});
      const account=found.rows[0];
      let achievements=[];
      try{
        const badges=await pool.query(`
          SELECT achievement_id,unlocked_at FROM junto_achievements
          WHERE account_id=$1 ORDER BY unlocked_at DESC LIMIT 25
        `,[account.id]);
        achievements=badges.rows;
      }catch(_){}
      const viewer=await accounts.accountFromRequest(req).catch(()=>null);
      res.json({
        profile:{username:account.username,name:account.name,avatar:account.avatar,motto:account.motto,createdAt:account.created_at},
        achievements,
        isSelf:viewer?.id===account.id
      });
    }catch(error){
      console.error("Perfil público:",error.message);
      res.status(503).json({error:"Não foi possível carregar esse perfil."});
    }
  });
};
