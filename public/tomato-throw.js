/* Tomates 2D do miniplayer: nenhuma dependência da Junto Club 3D.
 * O servidor valida sala, DJ e intervalo. Todos recebem o mesmo evento.
 */
const bridge=window.jfDanceBridge;
const socket=bridge?.socket;
const button=document.getElementById("jfClubTomato");
const stage=document.querySelector("#jfMiniDj .jf-dj-stage");
const miniDj=document.getElementById("jfMiniDj");
const IMAGE_FLY="/tomato/tomate-inteiro.png";
const IMAGE_SPLASH="/tomato/tomate-impacto.png";
const IMPACT_SFX="/sfx/cartoonsplash.mp3";
const splashSound=new Audio(IMPACT_SFX);
splashSound.preload="auto";
function playImpact(){
  if(!splashSound.src)return;
  // Cópias independentes permitem impactos simultâneos de vários ouvintes.
  try{
    const sound=splashSound.cloneNode();
    sound.volume=.7;
    sound.play().catch(()=>{}); // Alguns navegadores exigem interação prévia para áudio.
  }catch(error){console.debug("Áudio do tomate indisponível:",error);}
}
let djId=null,cooldownUntil=0,hintTimeout=0;
const livingShots=new Set();


function message(text){
  let hint=document.getElementById("jfClubTomatoHint");
  if(!hint){
    hint=document.createElement("span");
    hint.id="jfClubTomatoHint";
    hint.className="jf-tomato-hint";
    hint.setAttribute("role","status");
    button?.insertAdjacentElement("afterend",hint);
  }
  hint.textContent=text;
  hint.hidden=false;
  clearTimeout(hintTimeout);
  hintTimeout=setTimeout(()=>{hint.hidden=true;},2600);
}
function updateButton(){
  if(!button)return;
  const room=bridge?.getRoom?.();
  const ready=Boolean(room&&djId&&djId!==socket?.id&&Date.now()>=cooldownUntil);
  button.setAttribute("aria-disabled",String(!ready));
  button.title=!room?"Entre em uma sala para jogar tomate":!djId
    ?"Aguarde alguém transmitir":djId===socket?.id
    ?"Você é o DJ!":Date.now()<cooldownUntil
    ?"Tomate recarregando":"Jogar tomate no macaco do miniplayer";
}
function targetCenter(hit){
  const rect=stage.getBoundingClientRect();
  const ux=Number.isFinite(hit?.x)?Math.max(.28,Math.min(.72,hit.x)):.5;
  const uy=Number.isFinite(hit?.y)?Math.max(.24,Math.min(.72,hit.y)):.46;
  return {x:rect.left+rect.width*ux,y:rect.top+rect.height*uy,ux,uy};
}
function splatter(hit){
  if(!stage||!stage.isConnected||miniDj.hidden)return;
  const position=targetCenter(hit);
  const splash=document.createElement("img");
  splash.className="jf-tomato-splash";
  splash.src=IMAGE_SPLASH;
  splash.alt="";
  splash.setAttribute("aria-hidden","true");
  // Posição em percentual: segue o ponto de impacto mesmo em telas menores.
  splash.style.left=(position.ux*100)+"%";
  splash.style.top=(position.uy*100)+"%";
  splash.onerror=()=>{
    splash.remove();
    const fallback=document.createElement("span");
    fallback.className="jf-tomato-splash";
    fallback.textContent="💥";
    fallback.style.cssText+=";display:grid;place-items:center;font-size:42px";
    fallback.style.left=(position.ux*100)+"%";
    fallback.style.top=(position.uy*100)+"%";
    stage.append(fallback);
    setTimeout(()=>fallback.remove(),950);
  };
  stage.append(splash);
  playImpact();
  // O impacto não reposiciona nem interfere na animação do macaquinho 3D.
  setTimeout(()=>splash.remove(),950);
}
function sprite(){
  const img=document.createElement("img");
  img.className="jf-tomato-projectile";
  img.alt="";
  img.src=IMAGE_FLY;
  img.setAttribute("aria-hidden","true");
  img.onerror=()=>{
    if(!img.isConnected)return;
    const emoji=document.createElement("span");
    emoji.className="jf-tomato-projectile";
    emoji.textContent="🍅";
    emoji.style.cssText+=";display:grid;place-items:center;font-size:58px";
    emoji.style.transform=img.style.transform;
    img.replaceWith(emoji);
    const shot=[...livingShots].find(s=>s.element===img);
    if(shot)shot.element=emoji;
  };
  return img;
}
function launch(hit,allowScroll=true){
  if(!button||!stage||miniDj.hidden||!bridge?.getRoom?.())return;
  if(livingShots.size>=8)return;
  // Se o player estiver fora da tela, centralize-o antes do lançamento,
  // para o usuário realmente enxergar o tomate acertando o macaco.
  const viewport=stage.getBoundingClientRect();
  if(allowScroll&&(viewport.bottom<40||viewport.top>innerHeight-40)){
    stage.scrollIntoView({behavior:"smooth",block:"center"});
    setTimeout(()=>launch(hit,false),330);
    return;
  }
  const bounds=button.getBoundingClientRect();
  const start={x:bounds.left+bounds.width*.5,y:bounds.top+bounds.height*.5};
  const end=targetCenter(hit);
  const distance=Math.hypot(end.x-start.x,end.y-start.y);
  const flightMs=Math.max(285,Math.min(680,distance/1.65));
  const lift=Math.min(120,Math.max(35,distance*.1));
  const element=sprite();
  const shot={element};
  livingShots.add(shot);
  document.body.append(element);
  const begun=performance.now();
  const size=72;
  function next(now){
    if(!shot.element.isConnected || !bridge?.getRoom?.()){
      shot.element.remove();livingShots.delete(shot);return;
    }
    const t=Math.min(1,(now-begun)/flightMs);
    // Arrancada rápida, aproximação veloz com desaceleração curta no impacto.
    const p=1-Math.pow(1-t,2.35);
    const dest=targetCenter(hit);
    const x=start.x+(dest.x-start.x)*p;
    const y=start.y+(dest.y-start.y)*p-lift*Math.sin(Math.PI*p);
    const scale=(.58+.54*p)*(window.innerWidth<=520?.86:1);
    const degrees=600*p;
    const transform=`translate3d(${(x-size/2).toFixed(2)}px,${(y-size/2).toFixed(2)}px,0) rotate(${degrees.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
    shot.element.style.transform=transform;
    if(t<1)requestAnimationFrame(next);
    else{shot.element.remove();livingShots.delete(shot);splatter(hit);}
  }
  requestAnimationFrame(next);
}
button?.addEventListener("click",()=>{
  const room=bridge?.getRoom?.();
  if(!room)return message("Entre numa sala para jogar tomate 🍅");
  if(!djId)return message("Aguarde alguém transmitir para jogar tomate 🍅");
  if(djId===socket?.id)return message("Você é o DJ! Os ouvintes jogam os tomates.");
  const left=cooldownUntil-Date.now();
  if(left>0)return message("Aguarde "+Math.ceil(left/1000)+"s para outro tomate 🍅");
  cooldownUntil=Date.now()+5000;
  updateButton();
  socket?.emit("club-tomato");
});
window.addEventListener("jf-player-monkey",event=>{
  djId=event.detail?.id||null;
  updateButton();
});
djId=window.jfLastTransmitterAppearance?.id||null;
socket?.on("club-tomato-fired",({to,hit})=>{
  if(!to||!bridge?.getRoom?.())return;
  launch(hit);
});
socket?.on("club-tomato-error",({message:detail})=>{
  cooldownUntil=0;updateButton();
  if(detail)message(detail);
});
socket?.on("joined-room",updateButton);
socket?.on("left-room",()=>{djId=null;updateButton();});
socket?.on("disconnect",()=>{djId=null;updateButton();});
updateButton();
