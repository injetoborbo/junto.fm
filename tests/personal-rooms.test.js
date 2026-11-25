'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const rules=require('../public/room-rules'),{initial,setupRooms}=require('../personal-rooms');
test('placement rejects collisions, bounds, blocked entrance and malformed items',()=>{
 const base=initial();assert.equal(rules.validate(base).items.length,4);
 const item={id:'test',type:'sofa',x:3,y:2,rotation:0};
 for(const bad of [{...item,x:9},{...item,x:0,y:0},{...item,rotation:NaN},{...item,type:'__proto__'},{...item,x:1,y:7},{...item,id:'welcome-chair'}])assert.throws(()=>rules.validate({...base,items:[...base.items,bad]}));
 assert.throws(()=>rules.validate({...base,items:Array(61).fill(item)}));
 assert.throws(()=>rules.validate({...base,wall:'url(evil)'}));
 assert.equal(rules.validate({...base,items:[...base.items,{...item,x:3,y:3}]}).items.length,5,'rug may sit beneath furniture');
});
test('tabletop objects require a supporting furniture surface and do not block walking',()=>{
 const base=initial(),mug={id:'table-mug',type:'mug',x:2,y:7,rotation:0,parentId:'welcome-table'};
 const layout=rules.validate({...base,items:[...base.items,mug]});
 assert.equal(layout.items.at(-1).parentId,'welcome-table');
 assert.equal(rules.itemType('mug').placement,'surface');
 assert.equal(rules.itemType('mug').solid,false);
 assert.equal(rules.surfaceHostAt(base.items,{x:3,y:7})?.id,'welcome-table');
 assert.equal(rules.surfaceCellFree([...base.items,mug],{id:'welcome-table'},{x:2,y:7}),false);
 assert.deepEqual(rules.route(layout,{x:0,y:0},{x:9,y:9}),rules.route(base,{x:0,y:0},{x:9,y:9}));
 const legacyLayout={...base,items:[...base.items,{...mug,parentId:undefined,x:6,y:6}]};
 assert.throws(()=>rules.validate(legacyLayout),/objetos de mesa/i,'new objects still cannot be placed on the floor');
 const migrated=rules.validate(legacyLayout,legacyLayout);
 assert.equal(migrated.items.at(-1).legacyFloor,true,'old floor decorations keep their saved placement');
 assert.equal(rules.route(migrated,{x:6,y:5},{x:6,y:6}),null,'old floor decorations still block walking');
 assert.throws(()=>rules.validate({...base,items:[...base.items,{...mug,x:4,y:7}]}),/superfície de apoio/i);
 assert.throws(()=>rules.validate({...base,items:[...base.items,mug,{...mug,id:'second-mug'}]}),/Já existe um objeto/i);
 assert.throws(()=>rules.validate({...base,items:[...base.items,{id:'floor-chair-on-table',type:'chair',x:4,y:8,rotation:0,parentId:'welcome-table'}]}),/Somente objetos de mesa/i);
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
test('3D furniture uses the isometric room axes for every quarter-turn',()=>{
 assert.deepEqual([0,1,2,3].map(rules.rotationRadians),[0,Math.PI/2,Math.PI,3*Math.PI/2]);
 const renderer=fs.readFileSync(require.resolve('../public/quartos-3d.js'),'utf8');
 assert.equal((renderer.match(/rotationRadians\(/g)||[]).length,4,'furniture, preview and seated avatar all use the room-axis rotation');
 assert.doesNotMatch(renderer,/-Math\.PI\/4/,'no extra screen-space 45-degree offset remains');
});
test('3D sitting uses the selected seat height and furniture-facing yaw',()=>{
 const renderer=fs.readFileSync(require.resolve('../public/quartos-3d.js'),'utf8');
 assert.match(renderer,/sittingTarget\?furnitureGround\(sittingTarget,payload\)/);
 assert.match(renderer,/const calibration=sittingTarget\?getSeatCalibration\(sittingTarget\.type\)/);
 assert.match(renderer,/record\.poseHeight=calibration\?calibration\.seatHeight:0/);
 assert.match(renderer,/record\.poseFurnitureYaw=sittingTarget\?window\.RoomRules\.rotationRadians\(sittingTarget\.rotation\|\|0\):null/);
 assert.match(renderer,/record\.poseYaw=sittingTarget\?record\.poseFurnitureYaw\+THREE\.MathUtils\.degToRad\(calibration\?\.yawOffset\|\|0\):null/);
 assert.match(renderer,/new THREE\.Vector3\(record\.poseOffsetX\|\|0,0,record\.poseOffsetZ\|\|0\)\.applyAxisAngle\(new THREE\.Vector3\(0,1,0\),Number\.isFinite\(record\.poseFurnitureYaw\)\?record\.poseFurnitureYaw:record\.root\.rotation\.y\)/);
 assert.match(renderer,/record\.poseOffsetX=calibration\?calibration\.offsetX:0/);
 assert.match(renderer,/record\.poseTilt=calibration\?THREE\.MathUtils\.degToRad/);
 assert.match(renderer,/if\(sitting&&Number\.isFinite\(record\.poseYaw\)\)/);
 assert.match(renderer,/record\.hipOffset=hips\?record\.root\.worldToLocal/);
 assert.match(renderer,/const seatOffset=new THREE\.Vector3\(record\.poseOffsetX\|\|0,0,record\.poseOffsetZ\|\|0\)/);
 assert.match(renderer,/record\.root\.position\.set\(logical\.x\+seatOffset\.x-hipOffset\.x/);
});
test('the seat devkit is available to logged-in room accounts and keeps local calibration presets',()=>{
 const html=fs.readFileSync(require.resolve('../public/quartos.html'),'utf8');
 const editor=fs.readFileSync(require.resolve('../public/quartos.js'),'utf8');
 const renderer=fs.readFileSync(require.resolve('../public/quartos-3d.js'),'utf8');
 assert.match(html,/id="seatDevkitToggle"/);
 assert.match(html,/id="seatDevkit"/);
 assert.match(html,/data-seat-calibration="seatHeight"/);
 assert.match(html,/data-seat-calibration="offsetX"/);
 assert.match(html,/data-seat-calibration="offsetZ"/);
 assert.match(html,/data-seat-calibration="bodyTilt"/);
 assert.match(html,/data-seat-calibration="yawOffset"/);
 assert.match(editor,/setupSeatDevkit\(\);await load\(\)/,'the panel is initialized only after the account status gate succeeds');
 assert.match(editor,/localStorage\.setItem\(SEAT_CALIBRATION_STORAGE/);
 assert.match(editor,/seatCalibrationCopy/);
 assert.match(renderer,/window\.JFQuartos3D=\{update,getSeatCalibration,setSeatCalibrations,seatTypes:SEAT_TYPES\}/);
});
test('the furniture editor separates catalog groups and rotates from controls on the selected object',()=>{
 const html=fs.readFileSync(require.resolve('../public/quartos.html'),'utf8');
 const editor=fs.readFileSync(require.resolve('../public/quartos.js'),'utf8');
 assert.match(html,/id="floorCatalog"/);
 assert.match(html,/id="surfaceCatalog"/);
 assert.match(html,/id="objectControls"/);
 assert.match(html,/id="rotateLeft"/);
 assert.match(html,/id="rotateRight"/);
 assert.doesNotMatch(html,/id="rotate"/);
 assert.match(editor,/updateObjectControls\(l\.items\)/);
 assert.match(editor,/anchorType\?\.placement==='surface'&&!anchor\.legacyFloor\?24:58/);
 assert.match(editor,/rotateSelected\(-1\)/);
 assert.match(editor,/rotateSelected\(1\)/);
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
 const waitForPose=(socket,accountId,pose)=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{socket.off('people',onPeople);reject(new Error('Timed out waiting for avatar pose: '+pose));},5000);
  function onPeople(people){
   if(people.find(p=>p.accountId===accountId)?.pose!==pose)return;
   clearTimeout(timeout);socket.off('people',onPeople);resolve(people);
  }
  socket.on('people',onPeople);
 });
 try{
  assert.equal((await request('POST','/api/quartos',{},null)).status,401);
  const own=await(await request('POST','/api/quartos',{})).json();assert.equal(own.owner_id,a);
  assert.equal((await request('PUT','/api/quartos',{name:'Invadido',layout:initial(),revision:1},b)).status,409);
  const layout={...initial(),wall:'#112233',items:[...initial().items,{id:'test-bed',type:'bed',x:5,y:5,rotation:0}]};
  assert.equal((await request('PUT','/api/quartos',{name:'Minha casa',layout,revision:1})).status,200);
  assert.equal((await request('PUT','/api/quartos',{name:'Velho',layout,revision:1})).status,409);
  const saved=await(await request('GET','/api/quartos')).json();assert.equal(saved.own.layout.wall,'#112233');assert.equal(saved.own.name,'Minha casa');
  const published=await request('PUT','/api/quartos',{name:'Minha casa',layout,revision:saved.own.revision,visibility:'public',category:'nostalgia',description:'Um lugar para lembrar e conversar.'});
  assert.equal(published.status,200,'owner can publish the room');const publicRoom=await published.json();assert.equal(publicRoom.visibility,'public');assert.equal(publicRoom.category,'nostalgia');
  const directory=await(await request('GET','/api/quartos')).json();assert.equal(directory.publicRooms[0].owner_id,a);assert.equal(directory.publicRooms[0].description,'Um lugar para lembrar e conversar.');
  assert.equal((await request('PUT','/api/quartos',{name:'Minha casa',layout,revision:publicRoom.revision,visibility:'public',category:'__proto__'})).status,400,'categories are validated');
  assert.equal((await request('POST','/api/quartos/invites',{guestId:c})).status,403);
  const visitor=await connect(b);assert.equal((await emit(visitor,'enter',{owner:a})).own,false,'any logged-in member can enter a public room');visitor.emit('leave');await new Promise(r=>setTimeout(r,100));
  const madePrivate=await request('PUT','/api/quartos',{name:'Minha casa',layout,revision:publicRoom.revision,visibility:'private',category:'nostalgia',description:'Um lugar para lembrar e conversar.'});assert.equal(madePrivate.status,200);
  await new Promise(r=>setTimeout(r,550));assert.match((await emit(visitor,'enter',{owner:a})).error,/convidados/,'private room returns to invite-only access');
  assert.equal((await request('POST','/api/quartos/invites',{guestId:b})).status,200);
  const inbox=await(await request('GET','/api/quartos',null,b)).json();assert.equal(inbox.invites[0].owner_id,a);
  // The socket throttles join requests for 500ms.
  await new Promise(r=>setTimeout(r,550));const peopleUpdate=new Promise(r=>visitor.once('people',r));assert.equal((await emit(visitor,'enter',{owner:a})).own,false);
  const present=await peopleUpdate;assert.equal(present.find(p=>p.accountId===b)?.wardrobe.outfit,'punk','presence shares the account wardrobe for the 3D avatar');
  const sittingUpdate=waitForPose(visitor,b,'sitting');
  assert.equal((await emit(visitor,'interact',{itemId:'welcome-chair'})).pose,'sitting','chairs trigger a synchronized sitting interaction');
  const sittingPeople=await sittingUpdate,sitter=sittingPeople.find(p=>p.accountId===b);
  assert.deepEqual(sitter.poseTarget,{itemId:'welcome-chair',type:'diningChair',x:1,y:7,rotation:0},'the server identifies the exact seat so the 3D avatar can sit on it');

  const bedPresence=waitForPose(visitor,b,'lying');
  assert.equal((await emit(visitor,'interact',{itemId:'test-bed'})).pose,'lying','beds trigger a synchronized lying interaction');
  const atBed=await bedPresence,walker=atBed.find(p=>p.accountId===b);const step=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:walker.x+dx,y:walker.y+dy})).find(tile=>rules.route(layout,walker,tile)?.length===1);assert.ok(step,'a free adjacent walking tile exists');
  const movingUpdate=waitForPose(visitor,b,'walking'),standingUpdate=waitForPose(visitor,b,'standing');
  assert.equal((await emit(visitor,'walk',step)).ok,true,'walking interrupts a furniture pose');
  assert.equal((await movingUpdate).find(p=>p.accountId===b)?.pose,'walking');
  const settled=await standingUpdate;assert.equal(settled.find(p=>p.accountId===b)?.pose,'standing','walking returns the avatar to standing');
  assert.equal(settled.find(p=>p.accountId===b)?.poseTarget,null,'walking clears the previous seat anchor');
  await new Promise(r=>setTimeout(r,180));
  assert.match((await emit(visitor,'walk',{x:1,y:7})).error,/chegar/);
  const owner=await connect(a);assert.equal((await emit(owner,'enter',{owner:a})).own,true);
  const message=new Promise(r=>owner.once('chat',r));assert.equal((await emit(visitor,'chat',{text:'Olá!'})).ok,true);assert.equal((await message).text,'Olá!');
  const removed=new Promise(r=>visitor.once('removed',r));assert.equal((await request('DELETE','/api/quartos/invites/'+b)).status,200);await removed;
  assert.equal((await(await request('GET','/api/quartos',null,b)).json()).invites.length,0);
  await new Promise(r=>setTimeout(r,550));assert.match((await emit(visitor,'enter',{owner:a})).error,/convidados/);
 }finally{for(const s of sockets)s.disconnect();rooms.close();await new Promise(r=>io.close(r));await db.close();}
});

test('public room directory controls and palette styles stay wired to existing room editing',()=>{
 const html=fs.readFileSync(require.resolve('../public/quartos.html'),'utf8');
 const js=fs.readFileSync(require.resolve('../public/quartos.js'),'utf8');
 const css=fs.readFileSync(require.resolve('../public/quartos.css'),'utf8');
 assert.match(html,/id="publicRooms"/);assert.match(html,/id="publicRoomList"/);assert.match(html,/id="roomVisibility"/);assert.match(html,/value="public">Quarto público/);assert.match(html,/id="roomCategory"/);assert.match(html,/id="roomDescription"/);
 assert.match(js,/renderPublicRooms\(data\.publicRooms\|\|\[\]\)/);assert.match(js,/visibility:\$\('roomVisibility'\)\.value/);assert.match(js,/category:\$\('roomCategory'\)\.value/);assert.match(js,/description:\$\('roomDescription'\)\.value/);assert.match(js,/public-room-visit/);
 assert.match(css,/public-room-grid/);assert.match(css,/data-jf-theme="aero"/);assert.match(css,/data-jf-theme="classic"/);
});
