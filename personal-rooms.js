'use strict';
const path=require('node:path');
const rules=require('./public/room-rules');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const initial=()=>({wall:'#8caaa5',floor:'#c9ad85',items:[{id:'welcome-sofa',type:'sofa',x:1,y:7,rotation:0},{id:'welcome-plant',type:'plant',x:8,y:1,rotation:0},{id:'welcome-rug',type:'rug',x:3,y:3,rotation:0}]});
function setupRooms(app,io,accounts){
 const pool=accounts.pool,ns=io.of('/quartos'),presence=new Map();
 const ready=accounts.ready.then(async ok=>{if(!ok||!pool)return false;await pool.query(`CREATE TABLE IF NOT EXISTS junto_personal_rooms(owner_id UUID PRIMARY KEY REFERENCES junto_accounts(id),name VARCHAR(48) NOT NULL,layout JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS junto_room_invites(owner_id UUID NOT NULL REFERENCES junto_personal_rooms(owner_id),guest_id UUID NOT NULL REFERENCES junto_accounts(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(owner_id,guest_id));`);return true;}).catch(e=>{console.error('Quartos:',e.message);return false;});
 const err=(message,status=400)=>Object.assign(Error(message),{status});
 const room=async id=>(await pool.query('SELECT r.*,a.nickname AS owner_name FROM junto_personal_rooms r JOIN junto_accounts a ON a.id=r.owner_id WHERE owner_id=$1',[id])).rows[0];
 async function allowed(owner,guest){return owner===guest||!!(await pool.query('SELECT 1 FROM junto_room_invites WHERE owner_id=$1 AND guest_id=$2',[owner,guest])).rowCount;}
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{
  if(!await ready)throw err('Quartos indisponíveis. Tente novamente em instantes.',503);
  if(req.method!=='GET'&&(req.get('sec-fetch-site')==='cross-site'||req.get('origin')&&!['http://'+req.get('host'),'https://'+req.get('host')].includes(req.get('origin'))))throw err('Origem inválida.',403);
  const account=await accounts.accountFromRequest(req);if(!account)throw err('Entre na sua conta do Junto.fm para acessar os quartos.',401);
  await fn(req,res,account);
 }catch(e){if(!e.status)console.error('Quartos:',e.message);res.status(e.status||500).json({error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}};
 app.get('/quartos',(_,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'public/quartos.html')));
 app.get('/api/quartos',wrap(async(req,res,a)=>{
  const own=await room(a.id),invites=await pool.query('SELECT r.owner_id,r.name,a.nickname AS owner_name FROM junto_room_invites i JOIN junto_personal_rooms r ON r.owner_id=i.owner_id JOIN junto_accounts a ON a.id=r.owner_id WHERE i.guest_id=$1 ORDER BY i.created_at DESC LIMIT 150',[a.id]);
  res.json({account:{id:a.id,name:a.nickname},own,invites:invites.rows,friends:(await accounts.friends(a.id)).map(f=>({id:f.id,name:f.name}))});
 }));
 app.post('/api/quartos',wrap(async(req,res,a)=>{await pool.query('INSERT INTO junto_personal_rooms(owner_id,name,layout) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[a.id,'Quarto de '+String(a.nickname||'Macaco').slice(0,24),JSON.stringify(initial())]);res.json(await room(a.id));}));
 app.put('/api/quartos',wrap(async(req,res,a)=>{
  let layout;try{layout=rules.validate(req.body?.layout);}catch(e){throw err(e.message);}
  const name=String(req.body?.name||'').trim();if(!name||name.length>48||!Number.isInteger(req.body?.revision))throw err('Nome ou versão inválidos.');
  const result=await pool.query('UPDATE junto_personal_rooms SET name=$2,layout=$3,revision=revision+1 WHERE owner_id=$1 AND revision=$4 RETURNING *',[a.id,name,JSON.stringify(layout),req.body.revision]);
  if(!result.rowCount)throw err('O quarto mudou em outra aba. Reabra antes de editar.',409);
  for(const p of presence.get(a.id)?.values()||[]){p.x=0;p.y=0;p.path=[];p.pose='standing';p.pendingPose=null;}
  ns.to(a.id).emit('layout',result.rows[0]);broadcast(a.id);res.json(result.rows[0]);
 }));
 app.post('/api/quartos/invites',wrap(async(req,res,a)=>{
  const guest=req.body?.guestId;if(!UUID.test(guest||''))throw err('Amigo inválido.');
  if(!(await accounts.friends(a.id)).some(f=>f.id===guest))throw err('Escolha alguém da sua lista de amigos.',403);
  if(!await room(a.id))throw err('Crie seu quarto primeiro.');
  await pool.query('INSERT INTO junto_room_invites(owner_id,guest_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[a.id,guest]);res.json({ok:true});
 }));
 app.delete('/api/quartos/invites/:guest',wrap(async(req,res,a)=>{
  if(!UUID.test(req.params.guest))throw err('Convidado inválido.');
  await pool.query('DELETE FROM junto_room_invites WHERE owner_id=$1 AND guest_id=$2',[a.id,req.params.guest]);
  for(const s of ns.sockets.values())if(s.data.owner===a.id&&s.data.account.id===req.params.guest){leave(s);s.emit('removed');}
  res.json({ok:true});
 }));
 app.get('/api/quartos/guests',wrap(async(req,res,a)=>res.json((await pool.query('SELECT a.id,a.nickname AS name FROM junto_room_invites i JOIN junto_accounts a ON a.id=i.guest_id WHERE i.owner_id=$1 ORDER BY a.nickname',[a.id])).rows)));
 function broadcast(id){ns.to(id).emit('people',[...(presence.get(id)?.values()||[])] .map(({path,...p})=>p));}
 function leave(s){const id=s.data.owner;if(!id)return;presence.get(id)?.delete(s.id);if(!presence.get(id)?.size)presence.delete(id);s.leave(id);s.data.owner=null;broadcast(id);}
 ns.use(async(s,next)=>{try{if(!await ready)return next(Error('Quartos indisponíveis.'));const a=await accounts.accountFromRequest(s.request);if(!a)return next(Error('Entre na sua conta.'));s.data.account=a;next();}catch{next(Error('Não foi possível conectar.'));}});
 ns.on('connection',s=>{
  let busy=false;const times={};
  function on(event,ms,fn){s.on(event,async(payload,ack)=>{const reply=typeof ack==='function'?ack:()=>{};if(busy||Date.now()-(times[event]||0)<ms)return reply({error:'Aguarde um instante.'});times[event]=Date.now();busy=true;try{
   const a=await accounts.accountFromRequest(s.request);if(!a)throw err('Sua sessão expirou. Entre novamente.');await fn(payload,a,reply);
  }catch(e){reply({error:e.status?e.message:'Não foi possível concluir.'});}finally{busy=false;}});}
  on('enter',500,async(p,a,reply)=>{
   const id=p?.owner;if(!UUID.test(id||'')||!await allowed(id,a.id))throw err('Este quarto é somente para convidados.',403);
   const r=await room(id);if(!r)throw err('Quarto não encontrado.',404);
   if((presence.get(id)?.size||0)>=12&&s.data.owner!==id)throw err('Quarto cheio (12 visitantes).');
   leave(s);if(!s.connected)return;await s.join(id);s.data.owner=id;
   if(!presence.has(id))presence.set(id,new Map());presence.get(id).set(s.id,{id:s.id,accountId:a.id,name:String(a.nickname||'Macaco').slice(0,24),wardrobe:a.wardrobe||{},x:0,y:0,path:[]});
   reply({room:r,own:id===a.id});broadcast(id);
  });
  on('walk',150,async(p,a,reply)=>{const id=s.data.owner;if(!id||!await allowed(id,a.id))throw err('Entre no quarto.');const r=await room(id),person=presence.get(id)?.get(s.id);if(!person)return;const route=rules.route(r.layout,person,p);if(!route)throw err('Não dá para chegar aí.');person.path=route;person.pose='walking';person.pendingPose=null;if(!route.length)person.pose='standing';broadcast(id);reply({ok:true});});
  on('interact',350,async(p,a,reply)=>{
   const id=s.data.owner;if(!id||!await allowed(id,a.id))throw err('Entre no quarto.');
   const r=await room(id),person=presence.get(id)?.get(s.id);if(!person)return;
   const item=r.layout.items.find(i=>i.id===p?.itemId);if(!item)throw err('Esse móvel não está mais no quarto.');
   const pose=item.type==='bed'?'lying':['sofa','chair'].includes(item.type)?'sitting':null;
   if(!pose)throw err('Esse móvel ainda não tem interação.');
   const occupied=new Set(r.layout.items.filter(i=>rules.itemType(i.type).solid).flatMap(rules.cells).map(cell=>cell.join(',')));
   const occupiedByPeople=new Set([...(presence.get(id)?.values()||[])].filter(other=>other.id!==s.id).map(other=>other.x+','+other.y));
   const candidates=rules.cells(item).flatMap(([x,y])=>[[x+1,y],[x-1,y],[x,y+1],[x,y-1]])
    .filter((v,index,all)=>v[0]>=0&&v[1]>=0&&v[0]<10&&v[1]<10&&!occupied.has(v.join(','))&&!occupiedByPeople.has(v.join(','))&&all.findIndex(w=>w[0]===v[0]&&w[1]===v[1])===index)
    .sort((u,v)=>Math.abs(u[0]-person.x)+Math.abs(u[1]-person.y)-Math.abs(v[0]-person.x)-Math.abs(v[1]-person.y));
   let target=null,path=null;
   for(const [x,y] of candidates){const route=rules.route(r.layout,person,{x,y});if(route){target={x,y};path=route;break;}}
   if(!target)throw err('Não há espaço livre ao redor desse móvel.');
   person.path=path;person.pendingPose=path.length?pose:null;person.pose=path.length?'walking':pose;
   broadcast(id);reply({ok:true,pose});
  });
  on('chat',700,async(p,a,reply)=>{const id=s.data.owner;if(!id||!await allowed(id,a.id))throw err('Entre no quarto.');const text=typeof p?.text==='string'?p.text.trim().slice(0,240):'';if(!text)return;ns.to(id).emit('chat',{id:s.id,name:String(a.nickname||'Macaco').slice(0,24),text});reply({ok:true});});
  s.on('leave',()=>leave(s));s.on('disconnect',()=>leave(s));
 });
 const timer=setInterval(()=>{for(const [id,people] of presence){let moved=false;for(const p of people.values())if(p.path.length){Object.assign(p,p.path.shift());if(!p.path.length&&p.pendingPose){p.pose=p.pendingPose;p.pendingPose=null;}moved=true;}if(moved)broadcast(id);}},220);timer.unref();
 return {ready,close:()=>clearInterval(timer)};
}
module.exports={setupRooms,initial};
