import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../public/dramatic-finish.js',import.meta.url),'utf8');
const {createFinishPlayer,finishDevAllowed}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
class El extends EventTarget{
 constructor(doc){super();this.doc=doc;this.children=[];this.style={setProperty:(k,v)=>this.duration=v};this.classes=new Set();this.classList={add:k=>this.classes.add(k)};}
 appendChild(e){e.parent=this;this.children.push(e);return e;} append(...elements){elements.forEach(e=>this.appendChild(e));}
 remove(){this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}
 setAttribute(){} focus(){this.doc.activeElement=this;} decode(){return Promise.resolve();}get isConnected(){return !!this.parent;}
}
class Doc extends EventTarget{
 constructor(){super();this.head=new El(this);this.body=new El(this);}createElement(){return new El(this);}
 getElementById(id){const find=e=>e.id===id?e:e.children.map(find).find(Boolean);return find(this.body)||find(this.head);}
}
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function setup(blocked=false){
 const doc=new Doc(),audios=[],timers=new Map();let seq=0;
 const player=createFinishPlayer({doc,schedule:(f,ms)=>{timers.set(++seq,{f,ms});return seq;},cancel:id=>timers.delete(id),createAudio:src=>{
  const a=new EventTarget();a.src=src;a.duration=16.404898;a.plays=0;a.pauses=0;
  a.play=()=>{a.plays++;if(blocked&&a.plays===1)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));a.dispatchEvent(new Event('playing'));return Promise.resolve();};
  a.pause=()=>a.pauses++;a.removeAttribute=()=>{};a.load=()=>{};audios.push(a);return a;
 }});return {doc,audios,timers,player};
}
test('voice and zoom start together; audio end retains image and opens result menu',async()=>{
 const h=setup(),done=h.player.play(),overlay=h.doc.getElementById('jfDramaticFinish');
 assert.equal(h.audios[0].plays,0);await tick();assert.equal(h.audios[0].plays,1);
 assert.ok(overlay.classes.has('is-playing'));assert.equal(overlay.duration,'16.404898s');
 assert.equal(overlay.children[0].src,'/arena/finish/derrota.webp');assert.equal(h.audios[0].src,'/arena/finish/dramatic-finish.mp3');
 h.audios[0].dispatchEvent(new Event('ended'));
 assert.equal(h.doc.body.children.length,1);assert.equal(overlay.children[3].hidden,false);assert.ok(overlay.classes.has('is-complete'));
 assert.equal(h.audios[0].pauses,1);assert.equal(h.timers.size,0);
 overlay.children[3].children[1].children[1].dispatchEvent(new Event('click'));
 assert.deepEqual(await done,{reason:'return'});assert.equal(h.doc.body.children.length,0);
});
test('autoplay denial offers a click and does not desynchronize the zoom',async()=>{
 const h=setup(true),done=h.player.play();await tick();const overlay=h.doc.getElementById('jfDramaticFinish'),sound=overlay.children[2];
 assert.equal(sound.hidden,false);assert.equal(overlay.classes.has('is-playing'),false);
 sound.dispatchEvent(new Event('click'));await tick();assert.equal(sound.hidden,true);assert.ok(overlay.classes.has('is-playing'));
 h.player.stop();await done;
});
test('repeated previews replace audio and skip releases every timer',async()=>{
 const h=setup(),first=h.player.play();await tick();const second=h.player.play();assert.deepEqual(await first,{reason:'replaced'});await tick();
 assert.equal(h.doc.body.children.length,1);assert.equal(h.audios[0].pauses,1);
 const overlay=h.doc.getElementById('jfDramaticFinish');overlay.children[1].dispatchEvent(new Event('click'));
 assert.equal(overlay.children[3].hidden,false);assert.equal(h.timers.size,0);
 overlay.children[3].children[1].children[1].dispatchEvent(new Event('click'));
 assert.deepEqual(await second,{reason:'return'});assert.equal(h.doc.body.children.length,0);
});
test('audio failure still completes the image animation',async()=>{
 const h=setup(true),done=h.player.play();await tick();h.audios[0].dispatchEvent(new Event('error'));
 assert.ok(h.doc.getElementById('jfDramaticFinish').classes.has('is-playing'));[...h.timers.values()][0].f();
 const overlay=h.doc.getElementById('jfDramaticFinish');assert.equal(overlay.children[3].hidden,false);
 overlay.children[3].children[1].children[1].dispatchEvent(new Event('click'));assert.deepEqual(await done,{reason:'return'});
});
test('Dev Kit preview follows localhost or jfDev permission',()=>{
 for(const hostname of ['localhost','127.0.0.1','[::1]'])assert.equal(finishDevAllowed({hostname,search:''}),true);
 assert.equal(finishDevAllowed({hostname:'junto-fm.onrender.com',search:'?jfDev=1'}),true);
 assert.equal(finishDevAllowed({hostname:'junto-fm.onrender.com',search:''}),false);
});

test('rematch invokes its handler once; return invokes its separate handler',async()=>{
 const h=setup();let rematches=0,returns=0;
 const done=h.player.play({onRematch:async()=>{rematches++;return true;},onReturn:()=>returns++});await tick();
 h.audios[0].dispatchEvent(new Event('ended'));
 const button=h.doc.getElementById('jfDramaticFinish').children[3].children[1].children[0];
 button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('click'));await tick();
 assert.deepEqual(await done,{reason:'rematch'});assert.equal(rematches,1);assert.equal(returns,0);
 const again=h.player.play({onReturn:()=>returns++});await tick();h.audios[1].dispatchEvent(new Event('ended'));
 h.doc.getElementById('jfDramaticFinish').children[3].children[1].children[1].dispatchEvent(new Event('click'));
 assert.deepEqual(await again,{reason:'return'});assert.equal(returns,1);
});
test('failed rematch stays in menu and spectators cannot request a duel',async()=>{
 const h=setup(),done=h.player.play({onRematch:()=> 'O adversário não está mais na sala.'});await tick();h.audios[0].dispatchEvent(new Event('ended'));
 const menu=h.doc.getElementById('jfDramaticFinish').children[3],button=menu.children[1].children[0];
 button.dispatchEvent(new Event('click'));await tick();
 assert.equal(menu.children[2].textContent,'O adversário não está mais na sala.');assert.equal(button.disabled,false);
 h.player.stop();await done;
 let calls=0;const next=h.player.play({canRematch:false,onRematch:()=>calls++});await tick();h.audios[1].dispatchEvent(new Event('ended'));
 const disabled=h.doc.getElementById('jfDramaticFinish').children[3].children[1].children[0];
 assert.equal(disabled.disabled,true);disabled.dispatchEvent(new Event('click'));await tick();assert.equal(calls,0);
 h.player.stop();await next;
});
