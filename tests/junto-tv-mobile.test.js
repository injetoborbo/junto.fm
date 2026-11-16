"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../public/junto-tv-mobile.js"),"utf8");
class Node{
 constructor(){this.children=[];this.parentNode=null;this.hidden=false;this.attrs={};this.events={};this.props={};this.classes=new Set();this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n)};this.style={setProperty:(n,v)=>this.props[n]=v,removeProperty:n=>delete this.props[n]};}
 appendChild(node){return this.insertBefore(node,null);}
 insertBefore(node,anchor){node.remove();const at=anchor?this.children.indexOf(anchor):this.children.length;assert.ok(at>=0);this.children.splice(at,0,node);node.parentNode=this;return node;}
 remove(){if(this.parentNode){const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}
 setAttribute(n,v){this.attrs[n]=v;}
 addEventListener(n,cb){this.events[n]=cb;}
}
function setup(matches=true,hidden=true){
 const overlay=new Node(),dialog=new Node(),inner=new Node(),screen=new Node(),chat=new Node(),launcher=new Node(),log=new Node(),before=new Node(),after=new Node();
 overlay.appendChild(dialog);dialog.appendChild(inner);inner.appendChild(before);inner.appendChild(screen);inner.appendChild(after);dialog.appendChild(launcher);dialog.appendChild(chat);chat.hidden=hidden;log.scrollHeight=200;
 overlay.querySelector=s=>({'.jf-tv-window':dialog,'.jf-tv-inner':inner,'.jf-tv-screen':screen}[s]);
 const media=new Node();media.matches=matches;
 const viewport=new Node();Object.assign(viewport,{height:800,offsetTop:0,scale:1});
 const window={matchMedia:()=>media,visualViewport:viewport,innerHeight:800,addEventListener(){}};
 const document={createComment:()=>new Node(),createElement:()=>new Node(),getElementById:id=>({jfChatWindow:chat,jfChatLauncher:launcher,jfChatLog:log}[id])};
 vm.runInNewContext(source,{window,document});
 return{layout:window.JfTvMobile.create(overlay),overlay,dialog,inner,screen,chat,launcher,media,viewport,before,after,log};
}
test("Mobile separa vídeo/chat sem recriar os nós nem focar o campo",()=>{
 const a=setup();a.screen.playbackPosition=48;a.chat.draft='minha mensagem';
 a.layout.open();assert.equal(a.screen.parentNode,a.inner);assert.equal(a.chat.hidden,false);assert.equal(a.log.scrollTop,200);
 assert.equal(a.before.parentNode.parentNode.id,'jfTvMobileOptions');assert.equal(a.before.parentNode.parentNode.open,undefined);
 assert.equal(a.launcher.attrs['aria-expanded'],'true');assert.equal(a.screen.playbackPosition,48);assert.equal(a.chat.draft,'minha mensagem');
});
test("Fechar/restaurar repetidamente preserva ordem, reprodução, rascunho e chat anterior",()=>{
 const a=setup();for(let i=0;i<3;i++){a.layout.open();a.layout.close();assert.deepEqual(a.inner.children,[a.before,a.screen,a.after]);assert.equal(a.inner.parentNode,a.dialog);assert.equal(a.chat.hidden,true);assert.equal(a.dialog.children.length,3);}
 const b=setup(true,false);b.layout.open();b.layout.close();assert.equal(b.chat.hidden,false);
});
test("Teclado reduz altura visível e focar o chat recolhe controles",()=>{
 const a=setup();a.layout.open();const options=a.before.parentNode.parentNode;options.open=true;
 a.chat.events.focusin();assert.equal(options.open,false);
 a.viewport.height=380;a.viewport.offsetTop=25;a.viewport.events.resize();
 assert.equal(a.overlay.props['--jf-tv-visible-height'],'380px');assert.equal(a.overlay.props['--jf-tv-visible-top'],'25px');
 a.viewport.scale=2;a.viewport.height=190;a.viewport.events.resize();assert.equal(a.overlay.props['--jf-tv-visible-height'],'380px');
 a.layout.close();assert.equal(a.overlay.props['--jf-tv-visible-height'],undefined);
});
test("Desktop não muda; rotação/troca de breakpoint monta e desmonta o painel",()=>{
 const a=setup(false);a.layout.open();assert.equal(a.screen.parentNode,a.inner);assert.equal(a.chat.hidden,true);
 a.media.matches=true;a.media.events.change();assert.equal(a.screen.parentNode,a.inner);
 a.media.matches=false;a.media.events.change();assert.equal(a.screen.parentNode,a.inner);assert.equal(a.chat.hidden,true);
});
