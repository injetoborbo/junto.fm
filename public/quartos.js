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
$('editBtn').onclick=()=>{if(editing)return;draft=structuredClone(current.layout);editing=true;selected=null;$('editor').hidden=false;$('guests').hidden=true;$('name').value=current.name;$('wall').value=draft.wall;$('floor').value=draft.floor;$('tip').textContent='Escolha um móvel • Clique para colocar • Girar muda a orientação';draw();};
function stopEdit(){editing=false;draft=null;selected=null;$('editor').hidden=true;$('tip').textContent='Clique no chão para andar • Converse com seus amigos';draw();}
$('cancel').onclick=()=>{if(saving)return;stopEdit();status('Alterações descartadas.');};
$('save').onclick=run(async()=>{if(saving)return;saving=true;$('save').disabled=true;try{R.validate(draft);const r=await api('/api/quartos','PUT',{layout:draft,name:$('name').value,revision:current.revision});current={...current,...r};stopEdit();heading();status('Decoração salva!');}finally{saving=false;$('save').disabled=false;}});
for(const key of ['wall','floor'])$(key).oninput=()=>{if(editing){draft[key]=$(key).value;draw();}};
function selection(){const t=selected&&R.itemType(selected.type);$('selection').textContent=t?t.name+' • '+(selected.rotation*90)+'°':'Nenhum móvel selecionado';for(const b of $('catalog').children)b.classList.toggle('selected',b.dataset.type===selected?.type);}
for(const t of R.catalog){const b=button(t.name,()=>{selected={id:crypto.randomUUID(),type:t.type,x:0,y:0,rotation:0};selection();draw();});b.dataset.type=t.type;const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=t.color;b.prepend(swatch);$('catalog').append(b);}
$('rotate').onclick=()=>{if(selected){selected.rotation=(selected.rotation+1)%4;selection();draw();}};
$('remove').onclick=()=>{if(selected){draft.items=draft.items.filter(i=>i.id!==selected.id);selected=null;selection();draw();}};
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
function furniture(i,ghost=false){const t=R.itemType(i.type),w=t.w,h=t.h,x=i.x,y=i.y,c=t.color;turn=i;ctx.save();if(ghost)ctx.globalAlpha=.6;
 if(i.type==='rug'){box(x,y,w,h,1,c);poly([iso(x+.15,y+.15,2),iso(x+w-.15,y+.15,2),iso(x+w-.15,y+h-.15,2),iso(x+.15,y+h-.15,2)],tint(c,20));}
 else if(['plant','banana'].includes(i.type)){box(x+.25,y+.25,.5,.5,18,'#b77c56');const p=iso(x+.5,y+.5,20);ctx.strokeStyle='#3f7245';ctx.lineWidth=5*scale;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-40*scale);ctx.stroke();for(let a=0;a<6;a++){const angle=a*Math.PI/3;ellipse({x:p.x+Math.cos(angle)*15*scale,y:p.y-30*scale+Math.sin(angle)*13*scale},15,7,a%2?'#79b26a':'#427d50');}if(i.type==='banana')ellipse({x:p.x+8*scale,y:p.y-12*scale},5,11,'#e7cb5a');}
 else if(i.type==='lamp'){box(x+.35,y+.35,.3,.3,4,'#666555');box(x+.46,y+.46,.08,.08,60,'#c9b989');box(x+.1,y+.1,.8,.8,17,c,52);}
 else if(i.type==='sofa'||i.type==='chair'){box(x,y,w,h,16,c);box(x,y,w,.2,35,c);box(x,y,.18,h,27,tint(c,15));box(x+w-.18,y,.18,h,27,tint(c,15));box(x+.2,y+.25,w-.4,h-.3,8,tint(c,22),15);}
 else if(i.type==='table'){box(x+.1,y+.1,.15,.15,20,'#6b4c3c');box(x+w-.25,y+h-.25,.15,.15,20,'#6b4c3c');box(x,y,w,h,6,c,20);box(x+.4,y+.25,.4,.4,3,'#e9d49b',26);}
 else if(i.type==='bed'){box(x,y,w,h,18,'#997051');box(x+.05,y+.05,w-.1,h-.1,8,c,18);box(x,y,w,.2,43,'#997051');box(x+.2,y+.3,w-.4,.55,6,'#eee1c4',26);}
 else if(i.type==='shelf'){box(x,y,w,h,64,c);for(let a=0;a<w*5;a++)box(x+.1+a*.18,y+h-.18,.12,.15,18,['#b88d62','#7ba3a0','#d3bd77','#b96d61'][a%4],a%2?8:35);}
 else if(i.type==='tv'){box(x,y,w,h,20,'#997051');box(x+.2,y+.1,w-.4,h-.2,32,c,20);box(x+.35,y+h-.18,w-.7,.04,21,'#9ec4ab',26);}
 else if(i.type==='arcade'){box(x+.08,y+.08,.84,.84,58,c);box(x+.18,y+.88,.64,.04,23,'#182e38',29);box(x,y+.6,1,.4,8,'#ddbc67',22);box(x+.1,y, .8,1,9,'#e8ce83',57);}
 else {box(x+.1,y+.1,.8,.8,40,c);const p=iso(x+.5,y+.94,22);ellipse(p,11,15,'#1d2a2b');ellipse(p,4,6,'#7e8b83');}ctx.restore();turn=null;
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
 window.JFQuartos3D?.update({width:w,height:h,scale,avatars:people.map(p=>{const q=iso(p.x+.5,p.y+.5);return {id:p.id,name:p.name,wardrobe:p.wardrobe||{},pose:p.pose||"standing",x:q.x,y:q.y+5,local:p.id===socket.id};})});
 for(const p of people)monkeyName(p);
 if(editing&&selected&&hover)furniture({...selected,...hover},true);
 for(const p of people){const b=bubbles.get(p.id);if(!b||b.until<Date.now())continue;const q=iso(p.x+.5,p.y+.5,90);ctx.font=`${12*scale}px Trebuchet MS`;ctx.textAlign='center';const lines=b.text.match(/.{1,32}(?:\s|$)|.{1,32}/g)||[];const bw=218*scale,bh=(Math.min(lines.length,3)*17+12)*scale;ctx.fillStyle='#f5efda';ctx.strokeStyle='#1d3026';ctx.lineWidth=2;ctx.fillRect(q.x-bw/2,q.y-bh,bw,bh);ctx.strokeRect(q.x-bw/2,q.y-bh,bw,bh);ctx.fillStyle='#20352a';lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,q.x,q.y-bh+(19+i*17)*scale));}
}
window.addEventListener("jf-quartos-3d-ready",()=>draw());
function tile(e){const r=canvas.getBoundingClientRect(),dx=(e.clientX-r.left-ox)/(32*scale),dy=(e.clientY-r.top-oy)/(16*scale);return {x:Math.floor((dx+dy)/2),y:Math.floor((dy-dx)/2)};}
function furnitureAt(e){if(!current)return null;const r=canvas.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=null,score=Infinity;for(const item of current.layout.items){if(!['sofa','chair','bed'].includes(item.type))continue;const t=R.itemType(item.type),q=iso(item.x+t.w/2,item.y+t.h/2,item.type==='bed'?22:28),dx=px-q.x,dy=py-q.y,d=Math.hypot(dx,dy),limit=Math.max(48*scale,(t.w+t.h)*18*scale);if(d<limit&&d<score){best=item;score=d;}}return best;}
canvas.onpointermove=e=>{if(editing){hover=tile(e);draw();}};
canvas.onclick=run(async e=>{if(!current||saving)return;const p=tile(e);if(p.x<0||p.y<0||p.x>=10||p.y>=10)return;
 if(!editing){const target=furnitureAt(e)||[...current.layout.items].reverse().find(i=>R.cells(i).some(([x,y])=>x===p.x&&y===p.y));if(target&&['sofa','chair','bed'].includes(target.type)){const result=await emit('interact',{itemId:target.id});status(result.pose==='lying'?'Indo descansar na cama…':'Indo sentar no móvel…');}else await emit('walk',p);return;}
 if(selected){const item={...selected,...p},candidate={...draft,items:[...draft.items.filter(i=>i.id!==item.id),item]};R.validate(candidate);draft=candidate;selected=null;selection();status('Móvel colocado. Salve para todos verem.');}
 else {const item=[...draft.items].reverse().find(i=>R.cells(i).some(([x,y])=>x===p.x&&y===p.y));if(item)selected={...item};selection();}draw();});
$('zoomIn').onclick=()=>{zoom=Math.min(1.6,zoom+.15);draw();};$('zoomOut').onclick=()=>{zoom=Math.max(.65,zoom-.15);draw();};new ResizeObserver(draw).observe(canvas.parentElement);window.addEventListener('jf-quartos-3d-ready',draw);
run(async()=>{const response=await fetch('/api/account/status',{credentials:'same-origin',cache:'no-store'});const auth=await response.json();if(!response.ok||!auth.loggedIn){showLoginGate('É necessário entrar em uma conta do Junto.fm para acessar os quartos.');return;} $('authGate').hidden=true;await load();const id=new URLSearchParams(location.search).get('room');if(id)await enter(id);})();
})();
