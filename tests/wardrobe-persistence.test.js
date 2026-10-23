'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const client=read('public/wardrobe.js'),server=read('server.js'),account=read('account-auth.js'),html=read('public/index.html');
const slice=(s,a,b)=>{const start=s.indexOf(a);assert.notEqual(start,-1,a);const end=s.indexOf(b,start);assert.notEqual(end,-1,b);return s.slice(start,end);};
const json=x=>JSON.parse(JSON.stringify(x));
const common=vm.runInNewContext(slice(client,'const OPTIONS=','const $=')+';({OPTIONS,sanitize,defaults})');
const room=vm.runInNewContext(slice(server,'const wardrobeOptions =','function cleanRoom')+';cleanWardrobe');
const profile=vm.runInNewContext(slice(account,'  function cleanProfile','  app.post("/api/account/profile"')+';cleanProfile');
const combinations=[];
for(const hat of common.OPTIONS.hat)for(const glasses of common.OPTIONS.glasses)for(const headphones of common.OPTIONS.headphones)for(const outfit of common.OPTIONS.outfit)combinations.push({hat,glasses,headphones,outfit});
test('all 560 wardrobe combinations survive browser, room and account JSON round trips',()=>{
 assert.equal(combinations.length,560);
 for(const original of combinations){
  const local=json(common.sanitize(json(original)));
  const broadcast=json(room(local));
  const saved=json(profile({wardrobe:broadcast}).wardrobe);
  assert.deepEqual(local,original);assert.deepEqual(broadcast,original);assert.deepEqual(saved,original);
  assert.deepEqual(json(common.sanitize(saved)),original);
 }
});
test('every visible selector option is accepted; unknown/admin skins cannot enter wardrobe',()=>{
 for(const [slot,id] of Object.entries({hat:'Hat',glasses:'Glasses',headphones:'Headphones',outfit:'Outfit'})){
  const select=html.match(new RegExp('<select id="jfWardrobe'+id+'">([\\s\\S]*?)</select>'))[1];
  assert.deepEqual([...select.matchAll(/value="([^"]+)"/g)].map(m=>m[1]),json(common.OPTIONS[slot]));
 }
 for(const input of [undefined,null,{},[],{hat:'capitao-patria',glasses:'bad',outfit:'bad',headphones:'bad'}]){
  assert.deepEqual(json(room(input)),json(common.defaults()));
  assert.deepEqual(json(profile({wardrobe:input}).wardrobe),json(common.defaults()));
 }
});
test('guest reload uses local storage; hydrated account overrides stale browser selection',()=>{
 const ctx={window:{},localStorage:{getItem:()=>JSON.stringify({wardrobe:combinations.at(-1)})},sanitize:common.sanitize,defaults:common.defaults};
 vm.createContext(ctx);vm.runInContext(slice(client,'function readSaved(){','let selection='),ctx);
 assert.deepEqual(json(ctx.readSaved()),combinations.at(-1));
 ctx.window.jfDanceBridge={getProfile:()=>({wardrobe:combinations[0]})};
 assert.deepEqual(json(ctx.readSaved()),combinations[0]);
 ctx.window={};ctx.localStorage.getItem=()=>'{broken';assert.deepEqual(json(ctx.readSaved()),json(common.defaults()));
});
function hydration(pending){
 const saved=combinations.at(-1),current=combinations[0],nodes={},writes=[],events=[],emits=[];
 const ctx={jfProfile:{wardrobe:current},jfAccount:null,jfAccountConfigured:false,jfAccountLoaded:false,jfPendingWardrobeSave:pending,joined:true,
 fetch:async()=>({json:async()=>({configured:true,loggedIn:true,profile:{id:'account',name:'Test',wardrobe:saved}})}),
 $:id=>nodes[id]||(nodes[id]={}),localStorage:{setItem:(k,v)=>writes.push(JSON.parse(v))},window:{dispatchEvent:e=>events.push(e)},CustomEvent:function(type,opts){this.type=type;this.detail=opts.detail;},
 socket:{emit:(...v)=>emits.push(v)},jfRenderAvatar(){},jfRenderPeople(){},jfRenderFriends(){},jfCanUseFriends:()=>true,jfPersistAccountProfile:()=>{ctx.persisted=json(ctx.jfProfile);}};
 vm.createContext(ctx);vm.runInContext(slice(html,'  async function jfFetchAccount(){','  $("jfGoogleLogout").addEventListener'),ctx);
 return {ctx,writes,events,emits,saved,current};
}
test('account login caches outfit and notifies wardrobe/room; early save wins over slow login',async()=>{
 for(const pending of [false,true]){
  const {ctx,writes,events,emits,saved,current}=hydration(pending);await ctx.jfFetchAccount();
  const expected=pending?current:saved;
  assert.deepEqual(json(ctx.jfProfile.wardrobe),expected);assert.deepEqual(writes[0].wardrobe,expected);
  assert.equal(events[0].type,'jf-local-profile-updated');assert.equal(emits[0][0],'profile-update');
  assert.equal(ctx.jfAccountLoaded,true);if(pending)assert.deepEqual(ctx.persisted.wardrobe,current);
 }
});
test('rapid account saves execute in order and a failure does not block the next save',async()=>{
 const calls=[],release=[];let warnings=0;
 const ctx={jfProfile:{wardrobe:combinations[0]},jfAccount:{id:'account'},jfCanUseFriends:()=>true,jfProfileSaveQueue:Promise.resolve(),
 document:{getElementById:()=>({})},setStatus:()=>warnings++,fetch:(_url,options)=>new Promise(resolve=>{calls.push(JSON.parse(options.body));release.push(resolve);})};
 vm.createContext(ctx);vm.runInContext(slice(html,'  function jfPersistAccountProfile(){','  function jfUpdateFavoriteButton(){'),ctx);
 const first=ctx.jfPersistAccountProfile();ctx.jfProfile={wardrobe:combinations.at(-1)};const second=ctx.jfPersistAccountProfile();
 await Promise.resolve();assert.equal(calls.length,1);assert.deepEqual(calls[0].profile.wardrobe,combinations[0]);
 release[0]({ok:false});await first;await Promise.resolve();assert.equal(calls.length,2);
 assert.deepEqual(calls[1].profile.wardrobe,combinations.at(-1));release[1]({ok:true,json:async()=>({profile:{id:'account',wardrobe:combinations.at(-1)}})});
 await second;assert.equal(warnings,1);assert.deepEqual(json(ctx.jfAccount.wardrobe),combinations.at(-1));
});
test('account POST stores and returns every outfit; room handler broadcasts it intact',async()=>{
 let save,update,stored,emitted;
 const ctx={cleanProfile:profile,accountFromRequest:async()=>({id:'test'}),
 pool:{query:async(sql,params)=>{assert.match(sql,/UPDATE junto_accounts/);stored=JSON.parse(params[3]);return {rows:[{wardrobe:stored}]};}},safeAccount:x=>x,
 app:{post:(_url,fn)=>save=fn}};
 vm.createContext(ctx);vm.runInContext(slice(account,'  app.post("/api/account/profile"','  async function friends('),ctx);
 const roomContext={cleanWardrobe:room,socket:{data:{room:'test'},on:(_event,fn)=>update=fn,to:()=>({emit:(_event,payload)=>emitted=payload.profile})}};
 vm.createContext(roomContext);vm.runInContext(slice(server,'  socket.on("profile-update"','  socket.on("chat-send"'),roomContext);
 for(const wardrobe of combinations){
  let result;await save({body:{profile:{name:'Test',wardrobe}}},{json:x=>result=x,status:()=>{throw Error('save failed');}});
  assert.deepEqual(stored,wardrobe);assert.deepEqual(json(result.profile.wardrobe),wardrobe);
  update({profile:{name:'Test',wardrobe:stored}});assert.deepEqual(json(emitted.wardrobe),wardrobe);
 }
});
test('private standing fits for all adjustable items and seated dress survive reload',()=>{
 const source=slice(client,'const FIT_DEFAULTS=','const fittedItem=');
 const data=new Map();const context={location:{hostname:'localhost'},console,localStorage:{getItem:k=>data.get(k)||null},THREE:{MathUtils:{clamp:(v,min,max)=>Math.max(min,Math.min(max,v))}}};
 vm.createContext(context);vm.runInContext(source+';globalThis.fits=FIT_DEFAULTS;',context);
 const fits=Object.fromEntries(Object.keys(context.fits).map(k=>[k,{width:.52,offset:[.01,-.03,.02]}]));
 data.set('jf_wardrobe_private_fit_v1',JSON.stringify(fits));data.set('jf_wardrobe_private_fit_seated_v1',JSON.stringify({vestido_novo:{width:.6,offset:[0,.1,0],pitch:20}}));
 vm.runInContext('loadPrivateFits();globalThis.restored=privateFits;globalThis.seated=privateSeatFits;',context);
 assert.deepEqual(json(context.restored),fits);assert.equal(context.seated.vestido_novo.pitch,20);
});
