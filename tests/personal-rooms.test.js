'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const rules=require('../public/room-rules'),{initial,setupRooms}=require('../personal-rooms');
test('placement rejects collisions, bounds, blocked entrance and malformed items',()=>{
 const base=initial();assert.equal(rules.validate(base).items.length,4);
 const item={id:'test',type:'sofa',x:3,y:2,rotation:0};
 for(const bad of [{...item,x:9},{...item,x:0,y:0},{...item,rotation:NaN},{...item,type:'__proto__'},{...item,x:1,y:7},{...item,id:'welcome-chair'}])assert.throws(()=>rules.validate({...base,items:[...base.items,bad]}));
 assert.throws(()=>rules.validate({...base,items:Array(61).fill(item)}));
 assert.throws(()=>rules.validate({...base,wall:'url(evil)'}));
 assert.equal(rules.validate({...base,items:[...base.items,{...item,x:3,y:3}]}).items.length,5,'rug may sit beneath furniture');
});
test('navigation walks around furniture, rotates footprints and rejects unreachable tiles',()=>{
 const base=initial(),route=rules.route(base,{x:0,y:0},{x:9,y:9});assert.ok(route.length);let last={x:0,y:0};
 for(const p of route){assert.equal(Math.abs(last.x-p.x)+Math.abs(last.y-p.y),1);last=p;}
 assert.equal(rules.route(base,{x:0,y:0},{x:1,y:7}),null);
 assert.equal(rules.route(base,{x:0,y:0},{x:NaN,y:1}),null);
 assert.equal(rules.route(base,{x:0,y:0},{x:10,y:1}),null);
 assert.deepEqual(rules.cells({type:'bed',x:0,y:0,rotation:1}),[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]);
 const wall={...base,items:Array.from({length:10},(_,y)=>({id:'w'+y,type:'chair',x:1,y,rotation:0}))};
 assert.equal(rules.route(wall,{x:0,y:0},{x:2,y:0}),null);
});
test('persisted rooms, owner-only changes, invitations, optimistic locking and realtime access',{skip:!process.env.PGLITE_TEST_MODULE||!process.env.SOCKET_CLIENT_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),{io:client}=require(process.env.SOCKET_CLIENT_TEST_MODULE);
 const db=new PGlite(),pool={query:async(s,a)=>{if(s.includes('CREATE TABLE'))return db.exec(s);const r=await db.query(s,a);return {...r,rowCount:r.rows.length||r.affectedRows||0};}};
 const a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
 await db.exec('CREATE TABLE junto_accounts(id UUID PRIMARY KEY,nickname TEXT);');
 for(const [id,name] of [[a,'Dono'],[b,'Amigo'],[c,'Outro']])await db.query('INSERT INTO junto_accounts VALUES($1,$2)',[id,name]);
 const express=require('express'),app=express(),server=require('node:http').createServer(app),io=new(require('socket.io').Server)(server);app.use(express.json());
 const accounts={pool,ready:Promise.resolve(true),accountFromRequest:async req=>{const id=req.headers['x-test-account'];return [a,b,c].includes(id)?{id,nickname:id===a?'Dono':'Visitante',wardrobe:{hat:'bone',glasses:'nenhum',headphones:'nenhum',outfit:'punk'}}:null;},friends:async id=>id===a?[{id:b,name:'Amigo'}]:[]};
 const rooms=setupRooms(app,io,accounts);assert.equal(await rooms.ready,true);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(method,path,body,id=a)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(id?{'x-test-account':id}:{})},body:body?JSON.stringify(body):undefined});
 const sockets=[];async function connect(id){const s=client(base+'/quartos',{extraHeaders:{'x-test-account':id}});sockets.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
 const emit=(s,event,payload)=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,payload,(e,r)=>e?reject(e):resolve(r)));
 try{
  assert.equal((await request('POST','/api/quartos',{},null)).status,401);
  const own=await(await request('POST','/api/quartos',{})).json();assert.equal(own.owner_id,a);
  assert.equal((await request('PUT','/api/quartos',{name:'Invadido',layout:initial(),revision:1},b)).status,409);
  const layout={...initial(),wall:'#112233',items:[...initial().items,{id:'test-bed',type:'bed',x:5,y:5,rotation:0}]};
  assert.equal((await request('PUT','/api/quartos',{name:'Minha casa',layout,revision:1})).status,200);
  assert.equal((await request('PUT','/api/quartos',{name:'Velho',layout,revision:1})).status,409);
  const saved=await(await request('GET','/api/quartos')).json();assert.equal(saved.own.layout.wall,'#112233');assert.equal(saved.own.name,'Minha casa');
  assert.equal((await request('POST','/api/quartos/invites',{guestId:c})).status,403);
  const visitor=await connect(b);assert.match((await emit(visitor,'enter',{owner:a})).error,/convidados/);
  assert.equal((await request('POST','/api/quartos/invites',{guestId:b})).status,200);
  const inbox=await(await request('GET','/api/quartos',null,b)).json();assert.equal(inbox.invites[0].owner_id,a);
  // The socket throttles join requests for 500ms.
  await new Promise(r=>setTimeout(r,550));const peopleUpdate=new Promise(r=>visitor.once('people',r));assert.equal((await emit(visitor,'enter',{owner:a})).own,false);
  const present=await peopleUpdate;assert.equal(present.find(p=>p.accountId===b)?.wardrobe.outfit,'punk','presence shares the account wardrobe for the 3D avatar');
  assert.equal((await emit(visitor,'interact',{itemId:'welcome-chair'})).pose,'sitting','chairs trigger a synchronized sitting interaction');
  await new Promise(r=>setTimeout(r,400));
  const bedPresence=new Promise(r=>visitor.once('people',r));assert.equal((await emit(visitor,'interact',{itemId:'test-bed'})).pose,'lying','beds trigger a synchronized lying interaction');
  const atBed=await bedPresence,walker=atBed.find(p=>p.accountId===b);const step=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:walker.x+dx,y:walker.y+dy})).find(tile=>rules.route(layout,walker,tile)?.length===1);assert.ok(step,'a free adjacent walking tile exists');
  const waitForPose=pose=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{visitor.off('people',onPeople);reject(new Error('Timed out waiting for avatar pose: '+pose));},5000);
   function onPeople(people){
    if(people.find(p=>p.accountId===b)?.pose!==pose)return;
    clearTimeout(timeout);visitor.off('people',onPeople);resolve(people);
   }
   visitor.on('people',onPeople);
  });
  const movingUpdate=waitForPose('walking'),standingUpdate=waitForPose('standing');
  assert.equal((await emit(visitor,'walk',step)).ok,true,'walking interrupts a furniture pose');
  assert.equal((await movingUpdate).find(p=>p.accountId===b)?.pose,'walking');
  const settled=await standingUpdate;assert.equal(settled.find(p=>p.accountId===b)?.pose,'standing','walking returns the avatar to standing');
  await new Promise(r=>setTimeout(r,180));
  assert.match((await emit(visitor,'walk',{x:1,y:7})).error,/chegar/);
  const owner=await connect(a);assert.equal((await emit(owner,'enter',{owner:a})).own,true);
  const message=new Promise(r=>owner.once('chat',r));assert.equal((await emit(visitor,'chat',{text:'Olá!'})).ok,true);assert.equal((await message).text,'Olá!');
  const removed=new Promise(r=>visitor.once('removed',r));assert.equal((await request('DELETE','/api/quartos/invites/'+b)).status,200);await removed;
  assert.equal((await(await request('GET','/api/quartos',null,b)).json()).invites.length,0);
  await new Promise(r=>setTimeout(r,550));assert.match((await emit(visitor,'enter',{owner:a})).error,/convidados/);
 }finally{for(const s of sockets)s.disconnect();rooms.close();await new Promise(r=>io.close(r));await db.close();}
});
