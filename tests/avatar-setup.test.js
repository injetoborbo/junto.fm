'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const account=read('account-auth.js'),client=read('public/avatar-setup.js'),css=read('public/avatar-setup.css'),html=read('public/index.html');
const cleanProfile=vm.runInNewContext(account.slice(account.indexOf('  function cleanProfile'),account.indexOf('  app.post("/api/account/profile"'))+';cleanProfile');
test('avatar setup endpoint is authenticated, same-origin and saves the official wardrobe once',async()=>{
 let handler,query,stored;
 const context={
  app:{post:(route,fn)=>{assert.equal(route,'/api/avatar/setup');handler=fn;}},
  sameOrigin:()=>true,
  accountFromRequest:async()=>({id:'account-id'}),
  cleanProfile,
  pool:{query:async(sql,params)=>{query=sql;stored=params;return {rowCount:1,rows:[{id:'account-id',nickname:'Macaco',username:'macaco_123',wardrobe:JSON.parse(params[0]),avatar_setup_completed_at:new Date()}]};}},
  safeAccount:account=>({name:account.nickname,username:account.username,wardrobe:account.wardrobe,avatarSetupCompleted:Boolean(account.avatar_setup_completed_at)}),
  console
 };
 vm.runInNewContext(account.slice(account.indexOf('  app.post("/api/avatar/setup"'),account.indexOf('  app.post("/api/account/username"')),context);
 const response=()=>({code:200,data:null,set(){return this;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 const res=response();
 await handler({body:{wardrobe:{hat:'bone',glasses:'escuros',headphones:'preto',outfit:'punk'}}},res);
 assert.equal(res.code,200);assert.equal(res.data.ok,true);
 assert.match(query,/avatar_setup_completed_at=COALESCE\(avatar_setup_completed_at,NOW\(\)\)/);
 assert.equal(stored[1],'account-id');
 assert.deepEqual(JSON.parse(stored[0]),{hat:'bone',glasses:'escuros',headphones:'preto',outfit:'punk'});
 assert.equal(res.data.profile.avatarSetupCompleted,true);
});
test('avatar setup rejects anonymous and cross-origin requests before writing',async()=>{
 let handler,writes=0,authorized=false,origin=true;
 const context={app:{post:(_route,fn)=>handler=fn;},sameOrigin:()=>origin,accountFromRequest:async()=>authorized?({id:'account'}):null,cleanProfile,pool:{query:async()=>{writes++;return {rowCount:1,rows:[{}]};}},safeAccount:x=>x,console};
 vm.runInNewContext(account.slice(account.indexOf('  app.post("/api/avatar/setup"'),account.indexOf('  app.post("/api/account/username"')),context);
 const res=()=>({code:200,data:null,set(){return this;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 let r=res();await handler({body:{}},r);assert.equal(r.code,401);
 authorized=true;origin=false;r=res();await handler({body:{}},r);assert.equal(r.code,403);assert.equal(writes,0);
});
test('creator appears only for signed-in accounts without a completed avatar and uses the existing wardrobe',()=>{
 assert.match(client,/data\.loggedIn&&data\.profile&&!data\.profile\.avatarSetupCompleted/);
 assert.match(client,/\/api\/avatar\/setup/);
 assert.match(client,/jf-wardrobe-save/);
 assert.match(client,/jfOpenWardrobe/);
 assert.match(client,/jfSaveWardrobe/);
 assert.match(html,/avatar-setup\.js\?v=first-avatar-creator-1/);
 assert.match(html,/avatar-setup\.css\?v=first-avatar-creator-1/);
 assert.match(account,/avatar_setup_completed_at TIMESTAMPTZ/);
 assert.match(account,/avatarSetupCompleted:Boolean\(a\.avatar_setup_completed_at\)/);
});
test('avatar studio follows the active theme and provides the ruler and nameplate composition',()=>{
 assert.match(css,/var\(--jf-ui-panel/);
 assert.match(css,/data-jf-theme="aero"/);
 assert.match(css,/jf-avatar-ruler/);
 assert.match(css,/jf-avatar-plaque/);
 assert.match(css,/@media\(max-width:760px\)/);
});
