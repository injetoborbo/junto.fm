/* Shared placement and navigation rules; no client-provided permissions. */
(function(root){
'use strict';
const size=10;
const catalog=[
 // Modelos GLB CC0 importados do pacote Free Apartment Props (Vuena).
 ['coffeeTable','Mesa de centro',2,1,'#ab7954','coffee-table'],
 ['diningChair','Cadeira de jantar',1,1,'#e9ae4e','dining-chair'],
 ['floorLamp','Luminária de chão',1,1,'#ebcd79','floor-lamp'],
 ['cactus','Cacto decorativo',1,1,'#629c66','cactus'],
 ['plant','Planta de interior',1,1,'#629c66','plant'],
 ['sideTable','Mesinha lateral',1,1,'#ab7954','side-table'],
 ['tableLamp','Abajur de mesa',1,1,'#ebcd79','table-lamp'],
 ['books','Pilha de livros',1,1,'#98684c','books'],
 ['vase','Vaso decorativo',1,1,'#b96d87','vase'],
 ['basket','Cesto de vime',1,1,'#b88d62','basket'],
 ['pillow','Almofada',1,1,'#7d9eaa','pillow'],
 ['nightstand','Criado-mudo',1,1,'#98684c','nightstand'],
 ['kettle','Chaleira',1,1,'#9da5ad','kettle'],
 ['mug','Caneca',1,1,'#b96d61','mug'],
 ['bench','Banco low-poly',2,1,'#98684c','bench'],
 ['planter','Vaso de plantas',1,1,'#629c66','planter'],
 // Tapete é uma peça plana de piso, não um móvel CSS.
 ['rug','Tapete retrô',3,3,'#a6779b',null],
 // Tipos antigos permanecem válidos para não quebrar quartos já salvos.
 ['sofa','Sofá antigo',2,1,'#c96c4d','dining-chair',true],
 ['chair','Poltrona antiga',1,1,'#e9ae4e','dining-chair',true],
 ['table','Mesa antiga',2,1,'#ab7954','coffee-table',true],
 ['bed','Cama antiga',2,3,'#669eaa','coffee-table',true],
 ['shelf','Estante antiga',2,1,'#98684c','nightstand',true],
 ['lamp','Luminária antiga',1,1,'#ebcd79','floor-lamp',true],
 ['tv','TV antiga',2,1,'#7d8090','nightstand',true],
 ['speaker','Caixa de som antiga',1,1,'#525b6e','mug',true],
 ['arcade','Fliperama antigo',1,1,'#b273ba','nightstand',true],
 ['banana','Bananeira antiga',1,1,'#7fba70','plant',true]
].map(([type,name,w,h,color,asset,legacy=false])=>({type,name,w,h,color,asset,legacy,solid:type!=='rug',interactive:['diningChair','bench','chair','sofa','bed'].includes(type)}));
const itemType=t=>catalog.find(i=>i.type===t);
const TABLETOP_TYPES=new Set(['tableLamp','books','vase','kettle','mug']);
const SURFACE_HOST_TYPES=new Set(['coffeeTable','sideTable','nightstand','table','shelf','tv']);
const SURFACE_LIFTS={coffeeTable:20,sideTable:22,nightstand:25,table:20,shelf:37,tv:25};
for(const item of catalog){
 item.placement=TABLETOP_TYPES.has(item.type)?'surface':'floor';
 item.canSupport=SURFACE_HOST_TYPES.has(item.type);
 item.surfaceLift=SURFACE_LIFTS[item.type]||20;
 item.solid=item.type!=='rug'&&item.placement!=='surface';
}
// Furniture quarter-turns use the room's world axes, not screen-space rotation.
function rotationRadians(rotation){return rotation*Math.PI/2;}
function cells(item){const t=itemType(item.type);if(!t)return [];const w=item.rotation%2?t.h:t.w,h=item.rotation%2?t.w:t.h;return Array.from({length:w*h},(_,i)=>[item.x+i%w,item.y+Math.floor(i/w)]);}
function surfaceHostAt(items,point){
 for(let i=(items||[]).length-1;i>=0;i--){
  const item=items[i],type=itemType(item.type);
  if(type?.canSupport&&type.solid&&cells(item).some(([x,y])=>x===point.x&&y===point.y))return item;
 }
 return null;
}
function surfaceCellFree(items,host,point,excludeId){
 return !(items||[]).some(item=>item.id!==excludeId&&item.parentId===host?.id&&item.x===point.x&&item.y===point.y);
}
function validate(layout){
 if(!layout||!Array.isArray(layout.items)||layout.items.length>60)throw Error('Use até 60 móveis.');
 if(!/^#[a-f0-9]{6}$/i.test(layout.wall)||!/^#[a-f0-9]{6}$/i.test(layout.floor))throw Error('Cor inválida.');
 const occupied=new Set(),ids=new Set();
 const items=layout.items.map(i=>{
  if(!i||!itemType(i.type)||typeof i.id!=='string'||! /^[a-zA-Z0-9-]{1,50}$/.test(i.id)||ids.has(i.id)||![i.x,i.y,i.rotation].every(Number.isInteger)||i.rotation<0||i.rotation>3)throw Error('Móvel inválido.');
  ids.add(i.id);const item={id:i.id,type:i.type,x:i.x,y:i.y,rotation:i.rotation};
  if(i.parentId!==undefined&&i.parentId!==null){
   if(typeof i.parentId!=='string'||!i.parentId||i.parentId.length>50)throw Error('Mesa inválida.');
   item.parentId=i.parentId;
  }
  for(const [x,y] of cells(item)){
   if(x<0||y<0||x>=size||y>=size||x===0&&y===0)throw Error('Mantenha os móveis dentro do quarto e a entrada livre.');
   if(itemType(i.type).solid){const k=x+','+y;if(occupied.has(k))throw Error('Os móveis não podem se sobrepor.');occupied.add(k);}
  }return item;
 });
 const byId=new Map(items.map(item=>[item.id,item])),usedSurfaceCells=new Set();
 for(const item of items){
  const type=itemType(item.type);
  if(type.placement==='surface'){
   const host=byId.get(item.parentId),hostType=host&&itemType(host.type);
   if(!hostType?.canSupport||!hostType.solid)throw Error('Objetos de mesa precisam ficar sobre uma mesa, mesinha ou criado-mudo.');
   if(!cells(host).some(([x,y])=>x===item.x&&y===item.y))throw Error('Coloque o objeto dentro da superfície de apoio.');
   const key=host.id+':'+item.x+','+item.y;
   if(usedSurfaceCells.has(key))throw Error('Já existe um objeto nesse espaço da mesa.');
   usedSurfaceCells.add(key);
  }else if(item.parentId)throw Error('Somente objetos de mesa podem ser colocados sobre outros móveis.');
 }
 return {wall:layout.wall,floor:layout.floor,items};
}
function route(layout,start,end){
 if(!end||![end.x,end.y].every(Number.isInteger)||end.x<0||end.y<0||end.x>=size||end.y>=size)return null;
 const blocked=new Set(layout.items.filter(i=>itemType(i.type).solid).flatMap(cells).map(c=>c.join(',')));
 const key=p=>p.x+','+p.y,queue=[[start]],seen=new Set([key(start)]);
 while(queue.length){const p=queue.shift(),last=p[p.length-1];if(key(last)===key(end))return p.slice(1);
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:last.x+dx,y:last.y+dy},k=key(n);if(n.x<0||n.y<0||n.x>=size||n.y>=size||seen.has(k)||blocked.has(k))continue;seen.add(k);queue.push([...p,n]);}}
 return null;
}
const api={size,catalog,cells,validate,route,itemType,rotationRadians,surfaceHostAt,surfaceCellFree};if(typeof module!=='undefined')module.exports=api;else root.RoomRules=api;
})(typeof window!=='undefined'?window:globalThis);
