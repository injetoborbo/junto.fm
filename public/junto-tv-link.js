/* Direct-source watch parties. Media never passes through the application server. */
(() => {
  "use strict";
  let hlsPromise;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsPromise) hlsPromise = new Promise((resolve,reject) => {
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js";
      script.onload=()=>window.Hls?resolve(window.Hls):reject(new Error("Biblioteca HLS indisponível."));
      script.onerror=()=>reject(new Error("Não foi possível carregar o suporte a HLS."));
      document.head.appendChild(script);
    }).catch(error=>{hlsPromise=null;throw error;});
    return hlsPromise;
  }
  const time = seconds => {
    if (!Number.isFinite(seconds)) return "AO VIVO";
    seconds=Math.max(0,Math.floor(seconds||0));
    const hours=Math.floor(seconds/3600), minutes=Math.floor(seconds%3600/60);
    return (hours?hours+":"+String(minutes).padStart(2,"0"):minutes)+":"+String(seconds%60).padStart(2,"0");
  };
  function create(ctx) {
    const {socket,overlay,isAdmin,status,targetTime,getState,isOpen}=ctx;
    const $=id=>document.getElementById(id);
    const root=$("jfTvLinkStage"), controls=$("jfTvLinkControls"), tools=$("jfTvLinkTools");
    root.innerHTML=`<video id="jfTvLinkVideo" playsinline preload="metadata" referrerpolicy="no-referrer" disableRemotePlayback></video>
      <div id="jfTvLinkMessage" class="jf-link-message" role="status">Preparando vídeo…</div>
      <button type="button" id="jfTvLinkUnlock" class="jf-link-unlock" hidden>🔊 Ativar reprodução / som</button>`;
    tools.innerHTML=`<form id="jfTvLinkForm" class="jf-link-form">
      <label>Link do vídeo<input id="jfTvLinkUrl" type="url" required maxlength="8192" autocomplete="off" spellcheck="false" placeholder="https://… (MP4, WebM ou HLS)"></label>
      <div class="jf-link-fields"><label>Título opcional<input id="jfTvLinkTitle" type="text" maxlength="120" placeholder="Filme ou série · episódio"></label>
      <label>Formato<select id="jfTvLinkFormat"><option value="auto">Detectar automaticamente</option><option value="direct">Vídeo direto (MP4 / WebM)</option><option value="hls">HLS (.m3u8 ou link sem extensão)</option></select></label></div>
      <div class="jf-tv-actions"><button type="submit">🔗 Carregar para a sala</button></div>
      <p class="jf-tv-note">O vídeo começa pausado. Todos recebem a fonte diretamente; links podem expirar ou funcionar apenas no seu IP. Páginas de sites e serviços com DRM exigem integração própria.</p>
      </form>`;
    controls.innerHTML=`<div class="jf-link-top"><div><span class="jf-link-kicker">SESSÃO COMPARTILHADA</span><strong id="jfTvLinkHeading">Vídeo da sala</strong></div><span id="jfTvLinkRole" class="jf-link-pill"></span></div>
      <div class="jf-link-timeline"><label class="jf-link-sr" for="jfTvLinkSeek">Posição do vídeo na sala</label><input id="jfTvLinkSeek" type="range" min="0" max="1" step="0.1" value="0"><div><span id="jfTvLinkTime">0:00 / 0:00</span><span id="jfTvLinkBuffer">Carregando metadados…</span></div></div>
      <div class="jf-link-bar"><div class="jf-link-group"><button type="button" id="jfTvLinkBack" title="Voltar 10 segundos">−10s</button><button type="button" id="jfTvLinkPlay" title="Reproduzir ou pausar para a sala">▶ Reproduzir</button><button type="button" id="jfTvLinkForward" title="Avançar 10 segundos">+10s</button></div>
      <div class="jf-link-group"><button type="button" id="jfTvLinkMute" aria-label="Silenciar meu áudio" aria-pressed="false">🔊</button><label class="jf-link-sr" for="jfTvLinkVolume">Meu volume</label><input id="jfTvLinkVolume" type="range" min="0" max="1" step="0.01" value="1"><label class="jf-link-sr" for="jfTvLinkRate">Velocidade da sala</label><select id="jfTvLinkRate" title="Velocidade da sala"><option value="0.5">0,5×</option><option value="0.75">0,75×</option><option value="1" selected>1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="1.75">1,75×</option><option value="2">2×</option></select></div>
      <div class="jf-link-group"><button type="button" id="jfTvLinkResync" title="Voltar à posição atual da sala">↻ Sincronizar</button><button type="button" id="jfTvLinkTheatre" aria-pressed="false" title="Expandir janela">▭ Cinema</button><button type="button" id="jfTvLinkPip" title="Picture-in-Picture">▣ PiP</button><button type="button" id="jfTvLinkFullscreen" title="Tela cheia com chat">⛶ Tela cheia</button></div></div>
      <details class="jf-link-options"><summary>Qualidade, áudio e legendas</summary><div class="jf-link-fields"><label>Qualidade (individual)<select id="jfTvLinkQuality"><option value="-1">Automática</option></select></label><label>Faixa de áudio (individual)<select id="jfTvLinkAudio"><option value="-1">Padrão da fonte</option></select></label><label>Legendas (individuais)<select id="jfTvLinkCaptions"><option value="-1">Desligadas</option></select></label><label>Adicionar legenda local (.vtt)<input id="jfTvLinkSubtitle" type="file" accept=".vtt,text/vtt"></label></div><p class="jf-tv-note">Faixas e resoluções dependem da fonte. A legenda local aparece só para você. Atalhos: espaço, ← / →, M e F, com foco no player.</p></details>
      <div class="jf-link-footer"><span id="jfTvLinkHealth" role="status" aria-live="polite">Aguardando vídeo</span><button type="button" id="jfTvLinkRetry">Tentar novamente</button></div>`;
    const video=$("jfTvLinkVideo"), message=$("jfTvLinkMessage"), unlock=$("jfTvLinkUnlock");
    let source="", sourceRevision=0, hls=null, generation=0, hlsAttempted=false;
    let playingPromise=null, lastSync=0, scrubbing=false, subtitleUrl="", subtitleTrack=null;
    let lastPosition=-1, stalledTicks=0;
    const active=()=>getState()?.mode==="link"&&isOpen();
    function report(text,error=false) {
      $("jfTvLinkHealth").textContent=text;
      message.textContent=text;message.hidden=!error;
      if(error)status(text);
    }
    function destroySource() {
      ++generation; source="";sourceRevision=0;playingPromise=null;
      hls?.destroy();hls=null;hlsAttempted=false;
      video.pause();video.removeAttribute("src");video.load();
      if(subtitleTrack){subtitleTrack.remove();subtitleTrack=null;}
      if(subtitleUrl){URL.revokeObjectURL(subtitleUrl);subtitleUrl="";}
      unlock.hidden=true;lastPosition=-1;stalledTicks=0;
      $("jfTvLinkSubtitle").value="";
    }
    function currentPosition() { return Number.isFinite(video.currentTime)?video.currentTime:targetTime(); }
    function command(action,seconds=currentPosition(),extra={}) {
      if(!active()||!isAdmin())return;
      socket.emit("tv:control",{action,seconds:Math.max(0,Math.min(43200,seconds)),...extra});
    }
    function seek(seconds) {
      if(!Number.isFinite(video.duration)||video.duration<=0)return;
      command("seek",Math.max(0,Math.min(video.duration,seconds)));
    }
    function selectOptions(id,items,selected=-1) {
      const select=$(id); select.replaceChildren();
      for(const [value,label] of items){const option=document.createElement("option");option.value=String(value);option.textContent=label;select.appendChild(option);}
      select.value=String(selected);select.disabled=items.length<2;
    }
    function tracks() {
      selectOptions("jfTvLinkQuality",[[-1,"Automática"],...(hls?.levels||[]).map((x,i)=>[i,(x.height?x.height+"p":"Opção "+(i+1))+(x.bitrate?" · "+Math.round(x.bitrate/1000)+" kbps":"")])],hls?.currentLevel??-1);
      selectOptions("jfTvLinkAudio",[[-1,"Padrão da fonte"],...(hls?.audioTracks||[]).map((x,i)=>[i,x.name||x.lang||"Áudio "+(i+1)])],hls?.audioTrack??-1);
      const subs=hls?hls.subtitleTracks:Array.from(video.textTracks||[]);
      selectOptions("jfTvLinkCaptions",[[-1,"Desligadas"],...(subs||[]).map((x,i)=>[i,x.name||x.label||x.lang||x.language||"Legenda "+(i+1)]),...(hls&&subtitleTrack?[["local","Legenda local"]]:[])],hls&&subtitleTrack?.track?.mode==="showing"?"local":hls?.subtitleTrack??-1);
    }
    async function startHls(url,token) {
      if(hlsAttempted)return;
      hlsAttempted=true;
      try{
        const Hls=await loadHls();
        if(token!==generation||!active())return;
        if(!Hls.isSupported()){
          if(video.canPlayType("application/vnd.apple.mpegurl")){video.src=url;video.load();return;}
          throw new Error("Este navegador não oferece suporte a HLS.");
        }
        hls=new Hls({maxBufferLength:20,maxMaxBufferLength:40,backBufferLength:20});
        hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(token===generation){tracks();sync(true);}});
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED,tracks);
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,tracks);
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(token!==generation||!data.fatal)return;
          report(data.type===Hls.ErrorTypes.NETWORK_ERROR?
            "A origem bloqueou o HLS ou o link expirou. Verifique acesso e CORS; tente um link atualizado.":
            "Não foi possível decodificar esta fonte HLS. Tente outra fonte ou formato.",true);
          hls?.destroy();hls=null;
        });
        hls.loadSource(url);hls.attachMedia(video);
      }catch(error){
        if(token!==generation||!active())return;
        if(video.canPlayType("application/vnd.apple.mpegurl")){video.src=url;video.load();}
        else report(error.message,true);
      }
    }
    function load(s) {
      destroySource();source=s.url;sourceRevision=s.revision;
      const token=generation;video.playbackRate=s.rate||1;
      message.hidden=false;message.textContent="Carregando vídeo…";
      report("Conectando à fonte…");status("Carregando vídeo por link para a sala…");message.hidden=false;
      tracks();
      const isHls=s.format==="hls"||(s.format!=="direct"&&/\.m3u8(?:[?#]|$)/i.test(s.url));
      if(isHls)void startHls(s.url,token);
      else {video.src=s.url;video.load();}
    }
    function play() {
      if(!video.paused||!active()||!getState().playing)return;
      const token=generation, revision=getState().revision;
      playingPromise=Promise.resolve(video.play()).catch(error=>{
        if(token!==generation||!active()||!getState().playing||getState().revision!==revision)return;
        if(error.name==="NotAllowedError"){
          unlock.hidden=false;video.muted=true;
          return video.play().catch(()=>{});
        }
        if(error.name!=="AbortError")report("Não foi possível iniciar. Tente novamente ou use outra fonte.",true);
      }).finally(()=>{if(token===generation)playingPromise=null;});
    }
    function sync(force=false) {
      if(!active()||!source)return;
      const s=getState(), wanted=targetTime();
      video.playbackRate=s.rate||1;
      // Do not continually seek a buffering host. It is the playback clock.
      const finite=Number.isFinite(video.duration)&&video.duration>0;
      const bounded=finite?Math.min(wanted,Math.max(0,video.duration-0.05)):wanted;
      if(video.readyState>=1&&finite&&(force||!isAdmin())&&Math.abs(video.currentTime-bounded)>(force?0.35:1.5)){
        try{video.currentTime=bounded;}catch(_){}
      }
      if(s.playing)play();else {
        video.pause();
        if(video.readyState>=2)report("Pausado na sala. "+(isAdmin()?"Você controla a reprodução.":"Aguardando o ADM retomar."));
      }
      renderProgress();
    }
    function renderProgress() {
      const s=getState();if(s?.mode!=="link")return;
      const finite=Number.isFinite(video.duration)&&video.duration>0;
      const seekBar=$("jfTvLinkSeek");seekBar.max=String(finite?video.duration:1);
      seekBar.disabled=!isAdmin()||!finite;
      if(!scrubbing)seekBar.value=String(finite?video.currentTime||0:0);
      $("jfTvLinkTime").textContent=time(video.currentTime||0)+" / "+(finite?time(video.duration):video.readyState?"AO VIVO":"—:—");
      let buffered=0;
      for(let i=0;i<(video.buffered?.length||0);i++)if(video.buffered.start(i)<=video.currentTime&&video.buffered.end(i)>=video.currentTime)buffered=video.buffered.end(i)-video.currentTime;
      $("jfTvLinkBuffer").textContent=video.readyState<1?"Carregando metadados…":"Buffer: "+Math.floor(buffered)+"s";
      $("jfTvLinkPlay").textContent=s.playing?"Ⅱ Pausar":"▶ Reproduzir";
      $("jfTvLinkRate").value=String(s.rate||1);
      $("jfTvLinkBack").disabled=$("jfTvLinkForward").disabled=!isAdmin()||!finite;
    }
    function render() {
      const on=active(),s=getState();root.hidden=controls.hidden=!on;
      if(!on)return;
      $("jfTvLinkHeading").textContent=s.title||"Vídeo da sala";
      $("jfTvLinkRole").textContent=isAdmin()?"Você controla a sala":"Seguindo o ADM";
      $("jfTvLinkPlay").disabled=$("jfTvLinkRate").disabled=!isAdmin();
      $("jfTvLinkPip").hidden=!document.pictureInPictureEnabled;
      $("jfTvLinkFullscreen").hidden=!overlay.querySelector(".jf-tv-window").requestFullscreen;
      renderProgress();
    }
    function apply(s) {
      if(!isOpen())return;
      if(source!==s.url||sourceRevision>s.revision)load(s);
      sync(true);render();
    }
    $("jfTvLinkForm").onsubmit=event=>{
      event.preventDefault();if(!isAdmin())return;
      const raw=$("jfTvLinkUrl").value.trim(),yt=ctx.youtubeId(raw);
      if(/^[A-Za-z0-9_-]{11}$/.test(yt)){ctx.stopOther();ctx.loadYoutube(yt);return;}
      try{
        const url=new URL(raw);
        if(url.protocol!=="https:"||url.username||url.password)throw new Error();
        socket.emit("tv:set-link",{url:url.href,title:$("jfTvLinkTitle").value,format:$("jfTvLinkFormat").value});
        status("Solicitando vídeo para a sala…");
      }catch(_){status("Cole um endereço HTTPS de vídeo válido, sem usuário e senha no link.");}
    };
    $("jfTvLinkPlay").onclick=()=>{
      if(!isAdmin()||!active())return;
      const action=getState().playing?"pause":"play";
      if(action==="pause")video.pause();
      command(action);
    };
    $("jfTvLinkBack").onclick=()=>seek(currentPosition()-10);
    $("jfTvLinkForward").onclick=()=>seek(currentPosition()+10);
    $("jfTvLinkSeek").addEventListener("input",()=>{scrubbing=true;$("jfTvLinkTime").textContent=time(Number($("jfTvLinkSeek").value))+" / "+time(video.duration);});
    $("jfTvLinkSeek").addEventListener("change",()=>{scrubbing=false;seek(Number($("jfTvLinkSeek").value));});
    $("jfTvLinkRate").onchange=()=>command("rate",currentPosition(),{rate:Number($("jfTvLinkRate").value)});
    function volumeUi(){ $("jfTvLinkMute").textContent=video.muted||video.volume===0?"🔇":"🔊";$("jfTvLinkMute").setAttribute("aria-pressed",String(video.muted)); }
    $("jfTvLinkVolume").oninput=()=>{video.volume=Number($("jfTvLinkVolume").value);video.muted=video.volume===0;volumeUi();};
    $("jfTvLinkMute").onclick=()=>{video.muted=!video.muted;volumeUi();};
    unlock.onclick=()=>{video.muted=false;unlock.hidden=true;volumeUi();if(getState()?.playing)play();else video.pause();};
    $("jfTvLinkResync").onclick=()=>{sync(true);socket.emit("tv:request-state");report("Posição atualizada com a sala.");};
    $("jfTvLinkRetry").onclick=()=>{if(active()){load(getState());sync(true);}};
    $("jfTvLinkTheatre").onclick=()=>{const on=overlay.classList.toggle("jf-tv-cinema");$("jfTvLinkTheatre").setAttribute("aria-pressed",String(on));};
    $("jfTvLinkFullscreen").onclick=async()=>{
      try{if(document.fullscreenElement)await document.exitFullscreen();else await overlay.querySelector(".jf-tv-window").requestFullscreen();}
      catch(_){report("Tela cheia indisponível neste navegador.");}
    };
    $("jfTvLinkPip").onclick=async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}catch(_){report("PiP indisponível: carregue o vídeo primeiro.");}};
    $("jfTvLinkQuality").onchange=()=>{if(hls)hls.currentLevel=Number($("jfTvLinkQuality").value);};
    $("jfTvLinkAudio").onchange=()=>{const n=Number($("jfTvLinkAudio").value);if(hls&&n>=0)hls.audioTrack=n;};
    $("jfTvLinkCaptions").onchange=()=>{
      const value=$("jfTvLinkCaptions").value,n=Number(value);
      if(hls){
        hls.subtitleTrack=value==="local"?-1:n;
        if(subtitleTrack)subtitleTrack.track.mode=value==="local"?"showing":"disabled";
      }else Array.from(video.textTracks||[]).forEach((t,i)=>{t.mode=i===n?"showing":"disabled";});
    };
    $("jfTvLinkSubtitle").onchange=()=>{
      const file=$("jfTvLinkSubtitle").files?.[0];if(!file)return;
      if(!/\.vtt$/i.test(file.name)||file.size>2*1024*1024)return report("Use uma legenda WebVTT (.vtt) de até 2 MB.");
      if(subtitleTrack)subtitleTrack.remove();if(subtitleUrl)URL.revokeObjectURL(subtitleUrl);
      subtitleUrl=URL.createObjectURL(file);subtitleTrack=document.createElement("track");
      subtitleTrack.kind="subtitles";subtitleTrack.label="Legenda local";subtitleTrack.src=subtitleUrl;
      subtitleTrack.default=true;video.appendChild(subtitleTrack);
      subtitleTrack.onload=()=>{if(subtitleTrack){
        if(hls)hls.subtitleTrack=-1;
        for(const t of Array.from(video.textTracks||[]))t.mode=t===subtitleTrack.track?"showing":"disabled";
        tracks();report("Legenda local ativada.");
      }};
      report("Legenda local adicionada; só você verá esta faixa.");
    };
    root.tabIndex=0;root.setAttribute("aria-label","Player compartilhado. Espaço pausa; setas avançam; M silencia; F amplia.");
    function keyboard(event){
      if(!active()||event.ctrlKey||event.altKey||event.metaKey||/INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY/.test(event.target.tagName)||event.target.isContentEditable)return;
      const key=event.key.toLowerCase();
      if(![" ","arrowleft","arrowright","m","f"].includes(key))return;
      event.preventDefault();if(event.repeat)return;
      if(key===" ")$("jfTvLinkPlay").onclick();
      if(key==="arrowleft")seek(currentPosition()-10);
      if(key==="arrowright")seek(currentPosition()+10);
      if(key==="m")$("jfTvLinkMute").onclick();
      if(key==="f")void $("jfTvLinkFullscreen").onclick();
    }
    root.addEventListener("keydown",keyboard);controls.addEventListener("keydown",keyboard);
    video.addEventListener("loadedmetadata",()=>{if(active()){message.hidden=true;tracks();sync(true);report("Fonte carregada. "+(isAdmin()?"Pressione Reproduzir para começar.":"Seguindo os controles do ADM."));}});
    video.addEventListener("timeupdate",renderProgress);
    video.addEventListener("durationchange",renderProgress);
    video.addEventListener("volumechange",volumeUi);
    video.addEventListener("playing",()=>{
      if(!active()||!getState().playing){video.pause();return;}
      message.hidden=true;report("Reproduzindo com a sala.");
    });
    video.addEventListener("waiting",()=>{if(active())report("Carregando buffer…");});
    video.addEventListener("ended",()=>{if(active()&&isAdmin())command("pause",video.duration);report("Vídeo encerrado.");});
    video.addEventListener("error",()=>{
      if(!active()||!source)return;
      if(getState().format==="auto"&&!hlsAttempted){void startHls(source,generation);return;}
      report("A fonte não pôde ser reproduzida. O link pode ter expirado, bloquear acesso externo ou usar um formato incompatível.",true);
    });
    function tick(){
      if(!active())return;
      if(isAdmin()&&getState().playing&&!video.paused&&video.readyState>=3&&Date.now()-lastSync>=15000){
        lastSync=Date.now();socket.emit("tv:sync",{seconds:currentPosition(),playing:true,revision:getState().revision});
      }else if(!isAdmin())sync(false);
      if(isAdmin()&&getState().playing&&!video.paused){
        stalledTicks=lastPosition===video.currentTime?stalledTicks+1:0;lastPosition=video.currentTime;
        // Freeze the room clock if the host loses its source, rather than letting
        // late joiners advance indefinitely through a stalled movie.
        if(stalledTicks===5){command("pause");report("A sala foi pausada porque o vídeo do ADM parou de carregar. Retome quando estiver pronto.");}
      }
      renderProgress();
    }
    function close(){if(isAdmin()&&getState()?.playing)command("pause");destroySource();}
    return {apply,render,tick,close,destroySource};
  }
  window.JfTvLinkPlayer={create};
})();
