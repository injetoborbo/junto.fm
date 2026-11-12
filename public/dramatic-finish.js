export const FINISH_MEDIA=Object.freeze({
  image:'/arena/finish/derrota.webp',audio:'/arena/finish/dramatic-finish.mp3',fallbackSeconds:16.404898
});
export const finishDevAllowed=location=>['localhost','127.0.0.1','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).get('jfDev')==='1';
const css=`
#jfDramaticFinish{position:fixed;inset:0;z-index:100000;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font:14px system-ui}
#jfDramaticFinish img{width:100%;height:100%;object-fit:contain;transform:scale(1.35);transform-origin:50% 43%;will-change:transform}
#jfDramaticFinish.is-playing img{animation:jfFinishZoomOut var(--finish-duration,16.405s) cubic-bezier(.2,.5,.4,1) forwards}
#jfDramaticFinish .jf-finish-skip{position:absolute;right:18px;top:18px;z-index:2}
#jfDramaticFinish button{padding:10px 15px;border:1px solid #ffffff80;background:#111b;color:#fff;border-radius:5px;cursor:pointer;font:inherit}
#jfDramaticFinish .jf-finish-sound{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:2}
#jfDramaticFinish.is-complete img{animation:none;transform:scale(1)}
#jfDramaticFinish .jf-finish-menu{position:absolute;inset:0;z-index:3;background:#03050cb8;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;padding:24px;animation:jfFinishMenuIn .55s ease-out}
#jfDramaticFinish .jf-finish-title{margin:0;display:grid;gap:0;font-family:Impact,"Arial Black",sans-serif;font-style:italic;text-transform:uppercase;line-height:.95;letter-spacing:.045em;transform:rotate(-4deg);filter:drop-shadow(0 6px 0 #2c121c) drop-shadow(0 0 30px #ec8c4233)}
#jfDramaticFinish .jf-finish-title span{font-size:clamp(28px,6vw,65px);color:#fff3d5;letter-spacing:.15em}
#jfDramaticFinish .jf-finish-title strong{font-size:clamp(65px,14vw,150px);background:linear-gradient(#fff4ce 12%,#ffc96c 48%,#ff6d50 90%);background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-stroke:1px #ffe4a399}
#jfDramaticFinish .jf-finish-options{display:grid;gap:13px;width:min(340px,90vw);margin-top:18px}
#jfDramaticFinish .jf-finish-options button{width:100%;padding:16px 20px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;border-radius:3px;transition:transform .15s,background .15s}
#jfDramaticFinish .jf-finish-options button:hover:not(:disabled){transform:translateY(-2px);background:#3a2526}
#jfDramaticFinish .jf-finish-options .jf-finish-rematch{background:linear-gradient(135deg,#f9d38d,#ed9d59);color:#251914;border:1px solid #fff0b8;box-shadow:0 4px 0 #6c3a2e}
#jfDramaticFinish .jf-finish-options .jf-finish-rematch:hover:not(:disabled){background:linear-gradient(135deg,#fff1ca,#ffc17c)}
#jfDramaticFinish .jf-finish-options button:disabled{opacity:.5;cursor:default}
#jfDramaticFinish .jf-finish-feedback{font-size:13px;color:#f7d6bc;min-height:20px;max-width:380px;margin:0}
@keyframes jfFinishMenuIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
#jfDramaticFinish [hidden]{display:none!important}
@keyframes jfFinishZoomOut{from{transform:scale(1.35)}to{transform:scale(1)}}`;

// Independent of Socket.IO/WebGL: the Dev Kit runs the exact same sequence.
export function createFinishPlayer({doc=document,createAudio=src=>new Audio(src),schedule=setTimeout,cancel=clearTimeout}={}){
  let active=null;
  const stop=(reason='cancelled')=>active?.close(reason);
  function play({onRematch,onReturn,canRematch=true}={}){
    stop('replaced');
    if(!doc.getElementById('jfDramaticFinishStyle')){
      const style=doc.createElement('style');style.id='jfDramaticFinishStyle';style.textContent=css;doc.head.appendChild(style);
    }
    return new Promise(resolve=>{
      const previousFocus=doc.activeElement,overlay=doc.createElement('div');
      overlay.id='jfDramaticFinish';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Dramatic Finish');
      const image=doc.createElement('img');image.src=FINISH_MEDIA.image;image.alt='Ilustração de derrota na arena';
      const skip=doc.createElement('button');skip.type='button';skip.className='jf-finish-skip';skip.textContent='Pular ✕';
      const sound=doc.createElement('button');sound.type='button';sound.className='jf-finish-sound';sound.textContent='▶ Tocar áudio e iniciar';sound.hidden=true;
      const menu=doc.createElement('section');menu.className='jf-finish-menu';menu.hidden=true;
      const title=doc.createElement('h1');title.className='jf-finish-title';
      const dramatic=doc.createElement('span');dramatic.textContent='DRAMATIC';
      const finish=doc.createElement('strong');finish.textContent='FINISH';title.append(dramatic,finish);
      const options=doc.createElement('div');options.className='jf-finish-options';
      const rematch=doc.createElement('button');rematch.type='button';rematch.className='jf-finish-rematch';rematch.textContent='Pedir revanche';rematch.disabled=!canRematch;
      const back=doc.createElement('button');back.type='button';back.textContent='Voltar ao Junto.fm';
      const feedback=doc.createElement('p');feedback.className='jf-finish-feedback';feedback.setAttribute('role','status');
      if(!canRematch)feedback.textContent='Apenas os lutadores podem pedir revanche.';
      options.append(rematch,back);menu.append(title,options,feedback);
      overlay.append(image,skip,sound,menu);doc.body.appendChild(overlay);skip.focus();
      const audio=createAudio(FINISH_MEDIA.audio);audio.preload='auto';
      let closed=false,started=false,complete=false,busy=false,timer=null;
      const close=reason=>{
        if(closed)return;closed=true;cancel(timer);audio.pause();audio.removeAttribute('src');audio.load();
        doc.removeEventListener('keydown',onKey,true);overlay.remove();
        if(active?.close===close)active=null;
        if(previousFocus?.isConnected)previousFocus.focus();resolve({reason});
      };
      const showMenu=()=>{
        if(closed||complete)return;complete=true;cancel(timer);audio.pause();
        skip.hidden=true;sound.hidden=true;menu.hidden=false;overlay.classList.add('is-complete');
        (canRematch?rematch:back).focus();
      };
      const returnToSite=()=>{if(closed)return;onReturn?.();close('return');};
      const requestRematch=async()=>{
        if(closed||busy||!canRematch)return;busy=true;rematch.disabled=true;feedback.textContent='';
        try{
          const outcome=await onRematch?.();
          if(closed)return;
          if(outcome===false||typeof outcome==='string'){
            feedback.textContent=typeof outcome==='string'?outcome:'Não foi possível pedir revanche.';
          }else close('rematch');
        }catch{if(!closed)feedback.textContent='Não foi possível pedir revanche. Tente novamente.';}
        finally{busy=false;if(!closed)rematch.disabled=!canRematch;}
      };
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(complete)returnToSite();else showMenu();}
        else if(event.key==='Tab'){
          event.preventDefault();
          const buttons=complete?[rematch,back].filter(b=>!b.disabled):[skip,...(!sound.hidden?[sound]:[])];
          const index=buttons.indexOf(doc.activeElement),direction=event.shiftKey?-1:1;
          buttons[(index+direction+buttons.length)%buttons.length]?.focus();
        }
      };
      const startVisual=()=>{
        if(closed||started||complete)return;started=true;sound.hidden=true;
        const seconds=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:FINISH_MEDIA.fallbackSeconds;
        overlay.style.setProperty('--finish-duration',seconds+'s');overlay.classList.add('is-playing');
        timer=schedule(showMenu,seconds*1000+300);
      };
      const startAudio=()=>{
        if(closed||complete)return;
        try{Promise.resolve(audio.play()).catch(error=>{
          if(closed)return;
          if(error?.name==='NotAllowedError'){sound.hidden=false;sound.focus();}
          else startVisual();
        });}catch{sound.hidden=false;sound.focus();}
      };
      active={close};doc.addEventListener('keydown',onKey,true);
      skip.addEventListener('click',showMenu);sound.addEventListener('click',startAudio);
      rematch.addEventListener('click',()=>{void requestRematch();});back.addEventListener('click',returnToSite);
      audio.addEventListener('playing',startVisual);audio.addEventListener('ended',showMenu);
      audio.addEventListener('error',startVisual);
      // Delay audio until the picture is decoded so the zoom and voice start together.
      Promise.resolve().then(()=>image.decode?.()).catch(()=>{}).then(startAudio);
    });
  }
  return {play,stop};
}
let sharedPlayer;
export const playDramaticFinish=(options={})=>{
  sharedPlayer??=createFinishPlayer();
  return sharedPlayer.play({
    onRematch:()=>{document.getElementById('jfOpenArena')?.click();},
    onReturn:()=>{document.getElementById('jfArenaClose')?.click();document.getElementById('jfCloseDance')?.click();},
    ...options
  });
};
export const stopDramaticFinish=()=>sharedPlayer?.stop();
