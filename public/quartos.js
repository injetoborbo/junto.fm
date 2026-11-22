(()=>{'use strict';
const $=id=>document.getElementById(id),R=RoomRules,canvas=$('canvas'),ctx=canvas.getContext('2d');
let data,current,own=false,editing=false,draft,selected=null,people=[],bubbles=new Map(),zoom=1,hover=null,saving=false;
const socket=io('/quartos',{autoConnect:false});
const status=text=>$('status').textContent=text;
function showLoginGate(message='Entre na sua conta do Junto.fm para acessar os quartos.'){ $('lobby').hidden=true;$('room').hidden=true;$('authGate').hidden=false;status(message); }
async function api(url,method='GET',body){const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok){if(r.status===401)showLoginGate(d.error);throw Error(d.error||'Falha na conexão.');}return d;}
function run(fn){return async(...args)=>{try{await fn(...args);}catch(e){status(e.message);}};}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=run(fn);return b;}
function card(name,subtitle,action){const el=document.createElement('div');el.className='invite-card';const text=document.createElement('div');text.textContent=name;const small=document.createElement('small');small.textContent=subtitle;text.append(small);el.append(text,action);return el;}
async function load(){data=await api('/api/quartos');$('invitations').replaceChildren();for(const i of data.invites)$('invitations').append(card(i.name,'de '+i.owner_name,button('Entrar',()=>enter(i.owner_id))));if(!data.invites.length)$('invitations').textContent='Ainda sem convites. Peça a um amigo para te convidar!';$('create').textContent=data.own?'Entrar no meu quarto →':'Criar meu quarto →';status('');}
function emit(event,payload){return new Promise((resolve,reject)=>socket.timeout(10000).emit(event,payload,(e,r)=>e?reject(Error('Conexão interrompida. Tente novamente.')):r?.error?reject(Error(r.error)):resolve(r)));}
async function enter(id){if(!socket.connected){socket.connect();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('Não foi possível conectar.')),10000);function done(e){clearTimeout(timer);socket.off('connect',ok);socket.off('connect_error',bad);e?reject(e):resolve();}const ok=()=>done(),bad=e=>done(e);socket.once('connect',ok);socket.once('connect_error',bad);});}
 const result=await emit('enter',{owner:id});current=result.room;own=result.own;editing=false;selected=null;draft=null;people=[];$('lobby').hidden=true;$('room').hidden=false;$('editor').hidden=true;$('guests').hidden=true;$('chatLog').replaceChildren();$('editBtn').hidden=!own;$('inviteBtn').hidden=!own;heading();history.replaceState(null,'','/quartos?room='+id);status('');draw();}
function heading(){$('roomTitle').textContent=current.name;$('ownerLabel').textContent='QUARTO DE '+current.owner_name;$('count').textContent=people.length+' / 12 no quarto';}
function lobby(){if(editing&&!confirm('Sair sem salvar a decoração?'))return;socket.emit('leave');current=null;editing=false;people=[];$('room').hidden=true;$('lobby').hidden=false;history.replaceState(null,'','/quartos');return load();}
$('lobbyBtn').onclick=run(lobby);$('refresh').onclick=run(load);$('create').onclick=run(async()=>{const r=await api('/api/quartos','POST',{});await enter(r.owner_id);});
$('editBtn').onclick=()=>{if(editing)return;draft=R.validate(structuredClone(current.layout),current.layout);editing=true;selected=null;$('editor').hidden=false;$('guests').hidden=true;$('name').value=current.name;$('wall').value=draft.wall;$('floor').value=draft.floor;$('tip').textContent='Selecione um objeto • Posicione no quarto ou sobre uma mesa • Gire pelo controle no próprio objeto';selection();draw();};
function stopEdit(){editing=false;draft=null;selected=null;$('editor').hidden=true;$('tip').textContent='Clique no chão para andar • Converse com seus amigos';draw();}
$('cancel').onclick=()=>{if(saving)return;stopEdit();status('Alterações descartadas.');};
$('save').onclick=run(async()=>{if(saving)return;saving=true;$('save').disabled=true;try{draft=R.validate(draft,current?.layout);const r=await api('/api/quartos','PUT',{layout:draft,name:$('name').value,revision:current.revision});current={...current,...r};stopEdit();heading();status('Decoração salva!');}finally{saving=false;$('save').disabled=false;}});
for(const key of ['wall','floor'])$(key).oninput=()=>{if(editing){draft[key]=$(key).value;draw();}};
function selection(){
 const t=selected&&R.itemType(selected.type);
 $('selection').textContent=t?t.name+' • '+(selected.rotation*90)+'° • '+(selected.legacyFloor?'No chão (antigo)':t.placement==='surface'?'Sobre mesa':'No chão'):'Nenhum móvel selecionado';
 document.querySelectorAll('#catalog button').forEach(b=>b.classList.toggle('selected',b.dataset.type===selected?.type));
}
for(const t of R.catalog.filter(item=>!item.legacy&&item.type!=='rug')){
 const target=$(t.placement==='surface'?'surfaceCatalog':'floorCatalog');
 const b=button(t.name,()=>{selected={id:crypto.randomUUID(),type:t.type,x:0,y:0,rotation:0};selection();draw();});
 b.dataset.type=t.type;const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=t.color;b.prepend(swatch);target.append(b);
}
function previewItem(items){
 if(!editing||!selected||!hover)return null;
 const type=R.itemType(selected.type);if(!type)return null;
 const item={...selected,...hover};
 if(type.placement==='surface'&&!selected.legacyFloor){
  const host=R.surfaceHostAt(items,hover);
  if(!host||!R.surfaceCellFree(items,host,hover,selected.id))return null;
  item.parentId=host.id;
 }else delete item.parentId;
 return item;
}
function rotateSelected(step){
 if(!editing||!selected)return;
 const rotated={...selected,rotation:(selected.rotation+step+4)%4};
 if(draft.items.some(item=>item.id===selected.id)){
  const previous=draft.items.find(item=>item.id===selected.id),before=R.cells(previous),after=R.cells(rotated);
  const candidateItems=draft.items.map(item=>{
   if(item.id===rotated.id)return rotated;
   if(item.parentId===rotated.id){
    const index=Math.max(0,before.findIndex(([x,y])=>x===item.x&&y===item.y));
    const cell=after[Math.min(index,after.length-1)];
    return {...item,x:cell[0],y:cell[1]};
   }
   return item;
  });
  const candidate={...draft,items:candidateItems};draft=R.validate(candidate,current?.layout);
 }
 selected=rotated;selection();draw();
}
function updateObjectControls(items){
 const controls=$('objectControls');
 if(!editing||!selected){controls.hidden=true;return;}
 const preview=previewItem(items),placed=items.find(item=>item.id===selected.id),anchor=preview||placed;
 if(!anchor){controls.hidden=true;return;}
 const cells=R.cells(anchor);if(!cells.length){controls.hidden=true;return;}
 const center=cells.reduce((sum,cell)=>({x:sum.x+cell[0]+.5,y:sum.y+cell[1]+.5}),{x:0,y:0});
 center.x/=cells.length;center.y/=cells.length;
 const anchorType=R.itemType(anchor.type);
 const lift=anchorType?.placement==='surface'&&!anchor.legacyFloor?24:58;
 const point=iso(center.x,center.y,lift);
 controls.style.left=point.x+'px';controls.style.top=point.y+'px';controls.hidden=false;
}
$('rotateLeft').onclick=run(()=>rotateSelected(-1));
$('rotateRight').onclick=run(()=>rotateSelected(1));
$('remove').onclick=()=>{if(selected){const removedId=selected.id,hadSurfaceItems=draft.items.some(i=>i.parentId===removedId);draft.items=draft.items.filter(i=>i.id!==removedId&&i.parentId!==removedId);selected=null;selection();draw();status(hadSurfaceItems?'Móvel e objetos que estavam sobre ele removidos.':'Objeto removido.');}};
$('clearSelection').onclick=()=>{selected=null;selection();draw();};
$('inviteBtn').onclick=run(async()=>{if(editing){status('Salve ou cancele a decoração primeiro.');return;}$('guests').hidden=!$('guests').hidden;if(!$('guests').hidden)await guests();});
async function guests(){const invited=await api('/api/quartos/guests');data=await api('/api/quartos');$('friendList').replaceChildren();$('guestList').replaceChildren();for(const f of data.friends){const b=button(invited.some(i=>i.id===f.id)?'Convidado':'Convidar',async()=>{await api('/api/quartos/invites','POST',{guestId:f.id});status('Convite disponível nos Quartos de '+f.name+'.');await guests();});b.disabled=invited.some(i=>i.id===f.id);$('friendList').append(card(f.name,'Amigo',b));}if(!data.friends.length)$('friendList').textContent='Adicione amigos pelo Social do Junto.fm.';for(const g of invited)$('guestList').append(card(g.name,'Acesso ao quarto',button('Remover',async()=>{await api('/api/quartos/invites/'+g.id,'DELETE');await guests();})));}
$('chatForm').onsubmit=run(async e=>{e.preventDefault();const text=$('chatInput').value.trim();if(!text)return;await emit('chat',{text});$('chatInput').value='';});
socket.on('people',p=>{people=p;if(current){heading();draw();}});
socket.on('layout',r=>{if(!current||current.owner_id!==r.owner_id)return;if(editing&&!saving){current={...current,...r};stopEdit();heading();status('A decoração mudou em outra aba. Reabra o editor para continuar.');return;}current={...current,...r};heading();draw();});
socket.on('chat',m=>{const p=document.createElement('p'),b=document.createElement('b');b.textContent=m.name+': ';p.append(b,document.createTextNode(m.text));$('chatLog').append(p);while($('chatLog').children.length>60)$('chatLog').firstChild.remove();$('chatLog').scrollTop=$('chatLog').scrollHeight;bubbles.set(m.id,{text:m.text,until:Date.now()+6500});draw();setTimeout(draw,6600);});
socket.on('removed',()=>{editing=false;void run(lobby)();status('O dono encerrou seu acesso ao quarto.');});
socket.on('disconnect',()=>{if(current)status('Reconectando ao quarto…');});
socket.on('connect',()=>{if(current){const id=current.owner_id;emit('enter',{owner:id}).then(r=>{current=r.room;stopEdit();status('Reconectado.');}).catch(e=>status(e.message));}});
socket.on('connect_error',e=>status(e.message));
window.addEventListener('beforeunload',e=>{if(editing){e.preventDefault();e.returnValue='';}});
// Isometric canvas. Furniture is drawn locally: no heavy model downloads.
let scale=1,ox=500,oy=180,turn=null;
function iso(x,y,z=0){if(turn){const dx=x-turn.x,dy=y-turn.y,t=R.itemType(turn.type);if(turn.rotation===1){x=turn.x+t.h-dy;y=turn.y+dx;}else if(turn.rotation===2){x=turn.x+t.w-dx;y=turn.y+t.h-dy;}else if(turn.rotation===3){x=turn.x+dy;y=turn.y+t.w-dx;}}return {x:ox+(x-y)*32*scale,y:oy+(x+y)*16*scale-z*scale};}
function poly(points,fill,stroke='#273b35'){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.5*scale;ctx.stroke();}
function tint(hex,n){return '#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(hex.slice(i,i+2),16)+n)).toString(16).padStart(2,'0')).join('');}
function box(x,y,w,h,z,c,base=0){poly([iso(x,y,base),iso(x+w,y,base),iso(x+w,y,base+z),iso(x,y,base+z)],tint(c,-32));poly([iso(x+w,y,base),iso(x+w,y+h,base),iso(x+w,y+h,base+z),iso(x+w,y,base+z)],tint(c,-18));poly([iso(x,y+h,base),iso(x+w,y+h,base),iso(x+w,y+h,base+z),iso(x,y+h,base+z)],tint(c,-10));poly([iso(x,y,base+z),iso(x+w,y,base+z),iso(x+w,y+h,base+z),iso(x,y+h,base+z)],c);}
function ellipse(p,rx,ry,color){ctx.beginPath();ctx.ellipse(p.x,p.y,rx*scale,ry*scale,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function furniture(i,ghost=false){
 if(i.type!=='rug')return;
 const t=R.itemType(i.type),w=t.w,h=t.h,x=i.x,y=i.y,c=t.color;turn=i;ctx.save();if(ghost)ctx.globalAlpha=.6;
 box(x,y,w,h,1,c);poly([iso(x+.15,y+.15,2),iso(x+w-.15,y+.15,2),iso(x+w-.15,y+h-.15,2),iso(x+.15,y+h-.15,2)],tint(c,20));
 ctx.restore();turn=null;
}
function monkeyName(p){const q=iso(p.x+.5,p.y+.5),me=p.id===socket.id;ellipse(q,13,6,'#00000044');ctx.font=`bold ${11*scale}px Trebuchet MS`;ctx.textAlign='center';ctx.fillStyle='#14251d';ctx.fillRect(q.x-49*scale,q.y+9*scale,98*scale,18*scale);ctx.fillStyle=me?'#f1cd6c':'#eee7d2';ctx.fillText(p.name.slice(0,17),q.x,q.y+22*scale);}
function draw(){const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height;scale=Math.min(w/760,h/580)*zoom;ox=w/2;oy=(h-320*scale)/2+40*scale;if(!current)return;const l=editing?draft:current.layout;
 poly([iso(0,0),iso(10,0),iso(10,0,110),iso(0,0,110)],tint(l.wall,-12));poly([iso(0,0),iso(0,10),iso(0,10,110),iso(0,0,110)],l.wall);
 // Wall trims, framed club print and the entry marker.
 box(0,0,10,.07,7,'#d5c8a7');box(0,0,.07,10,7,'#d5c8a7');
 for(let x=0;x<10;x++)for(let y=0;y<10;y++)poly([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],tint(l.floor,(x+y)%2?0:8),editing?'#8b8d72':'#99896c');
 poly([iso(0,0,1),iso(1,0,1),iso(1,1,1),iso(0,1,1)],'#a8b9a0');const sign=iso(0,5,75);ctx.save();ctx.translate(sign.x,sign.y);ctx.transform(1,.5,0,1,0,0);ctx.fillStyle='#233b32';ctx.fillRect(-62*scale,-23*scale,124*scale,42*scale);ctx.fillStyle='#e5c76d';ctx.font=`bold ${14*scale}px Trebuchet MS`;ctx.textAlign='center';ctx.fillText('THE SÍMIOS',0,3*scale);ctx.restore();
 l.items.filter(i=>i.type==='rug').forEach(i=>furniture(i));
 const objects=[...l.items.filter(i=>i.type!=='rug').map(i=>({depth:i.x+i.y+Math.max(...R.cells(i).map(c=>c[0]+c[1]))-i.x-i.y,draw:()=>furniture(i)}))];objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
 // Avatares 3D usam a mesma posição isométrica e o mesmo estado de presença do quarto.
 const preview=previewItem(l.items);
 window.JFQuartos3D?.update({width:w,height:h,scale,furniture:l.items,preview,avatars:people.map(p=>{const q=iso(p.x+.5,p.y+.5);return {id:p.id,name:p.name,wardrobe:p.wardrobe||{},pose:p.pose||"standing",poseTarget:p.poseTarget||null,dance:p.dance||"idle",x:q.x,y:q.y+5,local:p.id===socket.id};})});
 for(const p of people)monkeyName(p);
 if(editing&&selected&&hover&&selected.type==='rug')furniture({...selected,...hover},true);
 updateObjectControls(l.items);
 for(const p of people){const b=bubbles.get(p.id);if(!b||b.until<Date.now())continue;const q=iso(p.x+.5,p.y+.5,90);ctx.font=`${12*scale}px Trebuchet MS`;ctx.textAlign='center';const lines=b.text.match(/.{1,32}(?:\s|$)|.{1,32}/g)||[];const bw=218*scale,bh=(Math.min(lines.length,3)*17+12)*scale;ctx.fillStyle='#f5efda';ctx.strokeStyle='#1d3026';ctx.lineWidth=2;ctx.fillRect(q.x-bw/2,q.y-bh,bw,bh);ctx.strokeRect(q.x-bw/2,q.y-bh,bw,bh);ctx.fillStyle='#20352a';lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,q.x,q.y-bh+(19+i*17)*scale));}
}
function tile(e){const r=canvas.getBoundingClientRect(),dx=(e.clientX-r.left-ox)/(32*scale),dy=(e.clientY-r.top-oy)/(16*scale);return {x:Math.floor((dx+dy)/2),y:Math.floor((dy-dx)/2)};}
function surfaceTargetAt(e,items){
 const rect=canvas.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;
 let best=null,score=Infinity;
 for(const host of items||[]){
  const type=R.itemType(host.type);if(!type?.canSupport)continue;
  for(const [x,y] of R.cells(host)){
   const q=iso(x+.5,y+.5,type.surfaceLift||20),distance=Math.abs(px-q.x)/(32*scale)+Math.abs(py-q.y)/(16*scale);
   if(distance<1.2&&distance<score){best={host,point:{x,y}};score=distance;}
  }
 }
 return best;
}
function placementPoint(e){
 const type=selected&&R.itemType(selected.type);
 if(editing&&type?.placement==='surface'&&!selected.legacyFloor)return surfaceTargetAt(e,draft.items)?.point||null;
 return tile(e);
}
function furnitureAt(e){
 if(!current)return null;
 const r=canvas.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
 let best=null,score=Infinity;
 for(const item of current.layout.items){
  const t=R.itemType(item.type);if(!t?.interactive)continue;
  const cells=R.cells(item);if(!cells.length)continue;
  const center=cells.reduce((sum,cell)=>({x:sum.x+cell[0]+.5,y:sum.y+cell[1]+.5}),{x:0,y:0});
  center.x/=cells.length;center.y/=cells.length;
  const q=iso(center.x,center.y,30),dx=px-q.x,dy=py-q.y,d=Math.hypot(dx,dy);
  const limit=Math.max(48*scale,(cells.length+1)*18*scale);
  if(d<limit&&d<score){best=item;score=d;}
 }
 return best;
}
canvas.onpointermove=e=>{if(editing){hover=placementPoint(e);draw();}};
canvas.onclick=run(async e=>{if(!current||saving)return;
 const surfacePlacement=editing&&selected&&R.itemType(selected.type)?.placement==='surface'&&!selected.legacyFloor;
 const surfaceHit=surfacePlacement?surfaceTargetAt(e,draft.items):null;
 if(surfacePlacement&&!surfaceHit){status('Clique sobre uma mesa ou mesinha para colocar esse objeto.');return;}
 const p=surfacePlacement?surfaceHit.point:tile(e);
 if(!p||p.x<0||p.y<0||p.x>=10||p.y>=10)return;
 if(!editing){const target=furnitureAt(e)||[...current.layout.items].reverse().find(i=>R.cells(i).some(([x,y])=>x===p.x&&y===p.y));if(target&&R.itemType(target.type)?.interactive){const result=await emit('interact',{itemId:target.id});status(result.pose==='lying'?'Indo descansar na cama…':'Indo sentar no móvel…');}else await emit('walk',p);return;}
 if(selected){
  const type=R.itemType(selected.type),item={...selected,...p};
  if(type.placement==='surface'&&!selected.legacyFloor){
   const host=R.surfaceHostAt(draft.items,p);
   if(!host)throw Error('Esse objeto precisa ser colocado sobre uma mesa, mesinha ou criado-mudo.');
   if(!R.surfaceCellFree(draft.items,host,p,selected.id))throw Error('Já existe um objeto nesse espaço da mesa.');
   item.parentId=host.id;
  }else delete item.parentId;
  const previous=draft.items.find(entry=>entry.id===item.id),before=previous?R.cells(previous):[],after=R.cells(item);
  const candidateItems=draft.items.map(entry=>{
   if(entry.id===item.id)return item;
   if(previous&&entry.parentId===item.id){
    const index=Math.max(0,before.findIndex(([x,y])=>x===entry.x&&y===entry.y));
    const cell=after[Math.min(index,after.length-1)];
    return {...entry,x:cell[0],y:cell[1]};
   }
   return entry;
  });
  if(!previous)candidateItems.push(item);
  const candidate={...draft,items:candidateItems};draft=R.validate(candidate,current?.layout);selected=draft.items.find(entry=>entry.id===item.id);selection();
  status(type.placement==='surface'?'Objeto colocado sobre a mesa. Salve para todos verem.':'Móvel colocado. Salve para todos verem.');
 }else{
  const item=[...draft.items].reverse().find(i=>R.cells(i).some(([x,y])=>x===p.x&&y===p.y));
  if(item)selected={...item};selection();
 }
 draw();});
for(const danceButton of document.querySelectorAll('[data-room-dance]')){
 danceButton.addEventListener('click',run(async()=>{
  const dance=danceButton.dataset.roomDance;
  await emit('dance-style',{dance});
  for(const button of document.querySelectorAll('[data-room-dance]'))button.classList.toggle('active',button===danceButton);
 }));
}

const SEAT_CALIBRATION_STORAGE='juntofm.quartos.seat-calibration.v1';
const seatCalibrationDefaults={
 diningChair:{seatHeight:.73,offsetX:0,offsetZ:0,bodyTilt:-7,yawOffset:0},
 chair:{seatHeight:.73,offsetX:0,offsetZ:0,bodyTilt:-7,yawOffset:0},
 bench:{seatHeight:.48,offsetX:0,offsetZ:-.1,bodyTilt:-7,yawOffset:-180},
 sofa:{seatHeight:.36,offsetX:0,offsetZ:0,bodyTilt:-7,yawOffset:0}
};
let seatCalibrationValues={},seatDevkitEnabled=false;
function currentSeatCalibration(type){
 const runtime=window.JFQuartos3D?.getSeatCalibration?.(type);
 return runtime||{...seatCalibrationDefaults[type],...(seatCalibrationValues[type]||{})};
}
function paintSeatCalibration(){
 const type=$('seatCalibrationType').value,values=currentSeatCalibration(type);
 for(const input of document.querySelectorAll('[data-seat-calibration]')){
  const field=input.dataset.seatCalibration;input.value=String(values[field]);
  const output=$('seatCalibrationValue-'+field);
  if(output)output.textContent=field==='seatHeight'?values[field].toFixed(2)+' m':(field==='offsetX'||field==='offsetZ'?values[field].toFixed(2)+' m':Math.round(values[field])+'°');
 }
 $('seatCalibrationJson').value=JSON.stringify({[type]:values},null,2);
}
function saveSeatCalibrations(){
 try{localStorage.setItem(SEAT_CALIBRATION_STORAGE,JSON.stringify(seatCalibrationValues));}catch(error){status('Não foi possível salvar os ajustes neste navegador.');}
 window.JFQuartos3D?.setSeatCalibrations?.(seatCalibrationValues);
 paintSeatCalibration();
}
function setupSeatDevkit(){
 if(seatDevkitEnabled)return;seatDevkitEnabled=true;
 try{
  const saved=JSON.parse(localStorage.getItem(SEAT_CALIBRATION_STORAGE)||'{}');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   for(const type of Object.keys(seatCalibrationDefaults))if(saved[type]&&typeof saved[type]==='object')seatCalibrationValues[type]=saved[type];
  }
 }catch(error){seatCalibrationValues={};}
 $('seatDevkitToggle').hidden=false;
 $('seatDevkitToggle').onclick=()=>{$('seatDevkit').hidden=!$('seatDevkit').hidden;if(!$('seatDevkit').hidden)paintSeatCalibration();};
 $('seatDevkitClose').onclick=()=>{$('seatDevkit').hidden=true;};
 $('seatCalibrationType').onchange=paintSeatCalibration;
 for(const input of document.querySelectorAll('[data-seat-calibration]')){
  input.oninput=()=>{
   const type=$('seatCalibrationType').value,field=input.dataset.seatCalibration;
   seatCalibrationValues[type]={...currentSeatCalibration(type),[field]:Number(input.value)};
   saveSeatCalibrations();
  };
 }
 $('seatCalibrationReset').onclick=()=>{
  delete seatCalibrationValues[$('seatCalibrationType').value];
  saveSeatCalibrations();status('Preset restaurado para este tipo de assento.');
 };
 $('seatCalibrationCopy').onclick=run(async()=>{
  const type=$('seatCalibrationType').value,json=JSON.stringify({[type]:currentSeatCalibration(type)},null,2);
  $('seatCalibrationJson').value=json;$('seatCalibrationJson').focus();$('seatCalibrationJson').select();
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(json);status('Preset copiado. Ele ainda está salvo só neste navegador.');}
  else status('JSON selecionado. Copie com Ctrl+C.');
 });
 window.JFQuartos3D?.setSeatCalibrations?.(seatCalibrationValues);
 paintSeatCalibration();
}
window.addEventListener('jf-quartos-3d-ready',()=>{
 if(seatDevkitEnabled){window.JFQuartos3D?.setSeatCalibrations?.(seatCalibrationValues);paintSeatCalibration();}
});
$('zoomIn').onclick=()=>{zoom=Math.min(1.6,zoom+.15);draw();};$('zoomOut').onclick=()=>{zoom=Math.max(.65,zoom-.15);draw();};new ResizeObserver(draw).observe(canvas.parentElement);window.addEventListener('jf-quartos-3d-ready',draw);
run(async()=>{const response=await fetch('/api/account/status',{credentials:'same-origin',cache:'no-store'});const auth=await response.json();if(!response.ok||!auth.loggedIn){showLoginGate('É necessário entrar em uma conta do Junto.fm para acessar os quartos.');return;} $('authGate').hidden=true;setupSeatDevkit();await load();const id=new URLSearchParams(location.search).get('room');if(id)await enter(id);})();
})();
