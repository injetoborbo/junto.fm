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
#jfDramaticFinish [hidden]{display:none!important}
@keyframes jfFinishZoomOut{from{transform:scale(1.35)}to{transform:scale(1)}}`;

// Independent of Socket.IO/WebGL: the Dev Kit runs the exact same sequence.
export function createFinishPlayer({doc=document,createAudio=src=>new Audio(src),schedule=setTimeout,cancel=clearTimeout}={}){
  let active=null;
  const stop=(reason='skip')=>active?.close(reason);
  function play(){
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
      overlay.append(image,skip,sound);doc.body.appendChild(overlay);skip.focus();
      const audio=createAudio(FINISH_MEDIA.audio);audio.preload='auto';
      let closed=false,started=false,timer=null;
      const close=reason=>{
        if(closed)return;closed=true;cancel(timer);audio.pause();audio.removeAttribute('src');audio.load();
        doc.removeEventListener('keydown',onKey,true);overlay.remove();
        if(active?.close===close)active=null;
        if(previousFocus?.isConnected)previousFocus.focus();resolve({reason});
      };
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close('skip');}
        else if(event.key==='Tab'){event.preventDefault();(doc.activeElement===skip&&!sound.hidden?sound:skip).focus();}
      };
      const startVisual=()=>{
        if(closed||started)return;started=true;sound.hidden=true;
        const seconds=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:FINISH_MEDIA.fallbackSeconds;
        overlay.style.setProperty('--finish-duration',seconds+'s');overlay.classList.add('is-playing');
        timer=schedule(()=>close('ended'),seconds*1000+300);
      };
      const startAudio=()=>{
        if(closed)return;
        try{Promise.resolve(audio.play()).catch(error=>{
          if(closed)return;
          if(error?.name==='NotAllowedError'){sound.hidden=false;sound.focus();}
          else startVisual();
        });}catch{sound.hidden=false;sound.focus();}
      };
      active={close};doc.addEventListener('keydown',onKey,true);
      skip.addEventListener('click',()=>close('skip'));sound.addEventListener('click',startAudio);
      audio.addEventListener('playing',startVisual);audio.addEventListener('ended',()=>close('ended'));
      audio.addEventListener('error',startVisual);
      // Delay audio until the picture is decoded so the zoom and voice start together.
      Promise.resolve().then(()=>image.decode?.()).catch(()=>{}).then(startAudio);
    });
  }
  return {play,stop};
}
let sharedPlayer;
export const playDramaticFinish=()=>{sharedPlayer??=createFinishPlayer();return sharedPlayer.play();};
export const stopDramaticFinish=()=>sharedPlayer?.stop();
