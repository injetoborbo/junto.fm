/* Shared placement and navigation rules; no client-provided permissions. */
(function(root){
'use strict';
const size=10;
const catalog=[
 ['sofa','Sofá retrô',2,1,'#c96c4d'],['chair','Poltrona',1,1,'#e9ae4e'],
 ['table','Mesa de centro',2,1,'#ab7954'],['bed','Cama',2,3,'#669eaa'],
 ['shelf','Estante de discos',2,1,'#98684c'],['plant','Costela de adão',1,1,'#629c66'],
 ['lamp','Luminária',1,1,'#ebcd79'],['tv','TV de tubo',2,1,'#7d8090'],
 ['rug','Tapete',3,3,'#a6779b'],['speaker','Jukebox',1,1,'#525b6e'],
 ['arcade','Fliperama',1,1,'#b273ba'],['banana','Bananeira',1,1,'#7fba70']
].map(([type,name,w,h,color])=>({type,name,w,h,color,solid:type!=='rug'}));
const itemType=t=>catalog.find(i=>i.type===t);
function cells(item){const t=itemType(item.type);if(!t)return [];const w=item.rotation%2?t.h:t.w,h=item.rotation%2?t.w:t.h;return Array.from({length:w*h},(_,i)=>[item.x+i%w,item.y+Math.floor(i/w)]);}
function validate(layout){
 if(!layout||!Array.isArray(layout.items)||layout.items.length>60)throw Error('Use até 60 móveis.');
 if(!/^#[a-f0-9]{6}$/i.test(layout.wall)||!/^#[a-f0-9]{6}$/i.test(layout.floor))throw Error('Cor inválida.');
 const occupied=new Set(),ids=new Set();
 const items=layout.items.map(i=>{
  if(!i||!itemType(i.type)||typeof i.id!=='string'||! /^[a-zA-Z0-9-]{1,50}$/.test(i.id)||ids.has(i.id)||![i.x,i.y,i.rotation].every(Number.isInteger)||i.rotation<0||i.rotation>3)throw Error('Móvel inválido.');
  ids.add(i.id);const item={id:i.id,type:i.type,x:i.x,y:i.y,rotation:i.rotation};
  for(const [x,y] of cells(item)){
   if(x<0||y<0||x>=size||y>=size||x===0&&y===0)throw Error('Mantenha os móveis dentro do quarto e a entrada livre.');
   if(itemType(i.type).solid){const k=x+','+y;if(occupied.has(k))throw Error('Os móveis não podem se sobrepor.');occupied.add(k);}
  }return item;
 });
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
const api={size,catalog,cells,validate,route,itemType};if(typeof module!=='undefined')module.exports=api;else root.RoomRules=api;
})(typeof window!=='undefined'?window:globalThis);
