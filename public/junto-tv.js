(() => {
  "use strict";
  // TV via LiveKit Cloud. Música continua usando seu transporte independente.
  const socket = window.jfSocialSocket;
  const dance = document.getElementById("jfOpenDance");
  if (!socket || !dance) return;
  // Bitrate de publicação global, não um custo por espectador.
  const VIDEO_MAX_HEIGHT = 1080;
  const VIDEO_MAX_FPS = 30;
  const VIDEO_MAX_BITRATE = 3500000; // até 6 Mbps por espectador, WebRTC adapta à rede

  const style = document.createElement("style");
  style.textContent = [
    "#jfTvLaunch.jf-tv-live img{filter:drop-shadow(0 0 6px #ff83c9) drop-shadow(0 2px 3px #0009)!important}",
    "body:not(.jf-in-room) #jfTvLaunch{display:none!important}",
    "#jfTvOverlay[hidden],#jfTvOverlay [hidden]{display:none!important}",
    "#jfTvOverlay{position:fixed;inset:0;z-index:12050;display:grid;place-items:center;padding:16px;background:#040514ae;backdrop-filter:blur(5px)}",
    "#jfTvOverlay .jf-tv-window{width:min(920px,100%);max-height:min(93dvh,900px);overflow:auto;border-radius:14px;border:2px solid #a2b5ff;background:linear-gradient(155deg,#282e66,#151935 60%,#0e1731);box-shadow:0 24px 75px #000b, inset 0 1px #ffffff55;color:#f6f8ff;font-family:Tahoma,Verdana,Arial,sans-serif}",
    "#jfTvOverlay .jf-tv-head{background:linear-gradient(180deg,#8bbdfd,#3562b0 55%,#20477f);padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:11px 11px 0 0;color:#fff}",
    "#jfTvOverlay .jf-tv-head strong{font-size:15px;text-shadow:0 1px 2px #122c70}",
    "#jfTvOverlay .jf-tv-close{background:#c73b58;border:1px solid #ffc3d4;border-radius:5px;color:#fff;font-weight:bold;font-size:15px;min-width:34px;min-height:30px;cursor:pointer}",
    "#jfTvOverlay .jf-tv-inner{padding:14px;display:grid;gap:11px}",
    "#jfTvOverlay .jf-tv-tabs{display:flex;gap:7px;flex-wrap:wrap}",
    "#jfTvOverlay .jf-tv-tabs button{flex:1;min-width:100px;background:#252d56;border:1px solid #7c8bbf;color:#dce4ff;border-radius:8px;padding:10px 8px;cursor:pointer;font-size:12px;font-weight:bold}",
    "#jfTvOverlay .jf-tv-tabs button[aria-selected=true]{background:#4779c8;color:#fff;border-color:#a6d1ff}",
    "#jfTvOverlay .jf-tv-screen{aspect-ratio:16/9;background:#070914;border-radius:9px;border:1px solid #55608c;display:grid;place-items:center;position:relative;min-height:185px;overflow:hidden}",
    "#jfTvOverlay .jf-tv-screen video,#jfTvOverlay .jf-tv-screen iframe,#jfTvOverlay #jfTvYoutubeWrapper{width:100%;height:100%;display:block;object-fit:contain}",
    "#jfTvOverlay #jfTvYoutubeWrapper iframe{pointer-events:none!important}",
    "#jfTvOverlay .jf-tv-youtube-shield{position:absolute;inset:0;z-index:3;display:grid;place-items:center;pointer-events:auto;background:linear-gradient(180deg,#0d123cdd,#090c26e9);color:#fff;text-align:center;font-size:15px;font-weight:bold;letter-spacing:.3px}",
    "#jfTvOverlay .jf-tv-youtube-shield span{border:1px solid #6679ae;border-radius:10px;background:#171d47ed;padding:14px 22px;box-shadow:0 8px 24px #0007}",
    "#jfTvOverlay .jf-tv-empty{text-align:center;display:grid;gap:7px;justify-items:center;padding:18px;color:#cbd3ec;font-size:13px}",
    "#jfTvOverlay .jf-tv-empty span{font-size:34px}",
    "#jfTvOverlay .jf-tv-tools{display:grid;gap:10px}",
    "#jfTvOverlay .jf-tv-tools label{display:grid;gap:5px;font-size:12px;font-weight:700}",
    "#jfTvOverlay .jf-tv-tools label.jf-tv-audio-choice{display:flex;align-items:center;gap:8px;font-weight:700}",
    "#jfTvOverlay .jf-tv-audio-choice input{width:17px;height:17px;accent-color:#80b9ff}",
    "#jfTvOverlay input[type=url],#jfTvOverlay input[type=file]{width:100%;background:#090f2d;border:1px solid #6979bc;border-radius:7px;color:#fff;padding:10px;min-width:0;font-size:13px}",
    "#jfTvOverlay .jf-tv-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}",
    "#jfTvOverlay .jf-tv-actions button{border:1px solid #8dafe3;border-radius:7px;background:#33589a;color:#fff;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;min-height:36px}",
    "#jfTvOverlay .jf-tv-actions button:disabled{opacity:.45;cursor:default}",
    "#jfTvOverlay .jf-tv-actions button.jf-tv-danger{background:#6b3156;border-color:#be7fa0}",
    "#jfTvOverlay .jf-tv-actions input[type=range]{flex:1 1 120px;min-width:90px;max-width:350px}",
    "#jfTvOverlay .jf-tv-note{font-size:11px;line-height:1.55;color:#bdc8e8;margin:0}",
    "#jfTvOverlay .jf-tv-status{padding:9px 10px;background:#0b1735;border:1px solid #445c9a;border-radius:8px;color:#cfdef9;font-size:12px;line-height:1.5}",
    "@media(max-width:540px){#jfTvOverlay{padding:5px}#jfTvOverlay .jf-tv-window{max-height:97dvh;border-radius:9px}#jfTvOverlay .jf-tv-inner{padding:9px;gap:8px}#jfTvOverlay .jf-tv-tabs button{min-width:70px;font-size:11px;padding:8px 4px}#jfTvOverlay .jf-tv-screen{min-height:165px}.jf-tv-dock #jfOpenDance,.jf-tv-dock #jfTvLaunch{font-size:11px}}"
  ].join("\n");
  document.head.appendChild(style);

  // Botão estático ao lado do tomate, banana 3D e disco no dock do player.
  // Não deslocar a pista para a lateral, nem adicionar botões à lista de pessoas.
  const launch=document.getElementById("jfTvLaunch");
  if(!launch)return;

  const overlay=document.createElement("div");
  overlay.id="jfTvOverlay";overlay.hidden=true;
  overlay.innerHTML=[
    '<section class="jf-tv-window" role="dialog" aria-modal="true" aria-labelledby="jfTvTitle">',
      '<header class="jf-tv-head"><strong id="jfTvTitle">📺 Junto.fm TV · Protótipo</strong><button type="button" class="jf-tv-close" id="jfTvClose" aria-label="Fechar TV">✕</button></header>',
      '<div class="jf-tv-inner">',
        '<div class="jf-tv-tabs" id="jfTvTabs" role="tablist" aria-label="Tipo de vídeo">',
          '<button type="button" data-tv-tab="youtube" role="tab" aria-selected="true">▶ YouTube</button>',
          '<button type="button" data-tv-tab="local" role="tab" aria-selected="false">📁 Vídeo local</button>',
          '<button type="button" data-tv-tab="screen" role="tab" aria-selected="false">🖥️ Transmissão de tela</button>',
        '</div>',
        '<div class="jf-tv-screen">',
          '<div class="jf-tv-empty" id="jfTvEmpty"><span>📺</span><strong>Nada na telinha ainda</strong><small>O administrador escolhe o que assistir.</small></div>',
          '<div id="jfTvYoutubeWrapper" hidden><div id="jfTvYoutubeFrame"></div></div>',
          '<div id="jfTvYoutubeShield" class="jf-tv-youtube-shield" hidden><span>⏸ Pausado pelo administrador</span></div>',
          '<video id="jfTvStreamVideo" autoplay playsinline hidden></video>',
        '</div>',
        '<div class="jf-tv-tools" id="jfTvAdminTools" hidden>',
          '<section id="jfTvYoutubeTools" class="jf-tv-tools" hidden>',
            '<label>Link do YouTube<input type="url" id="jfTvYoutubeUrl" placeholder="https://youtu.be/..." autocomplete="off"></label>',
            '<div class="jf-tv-actions"><button type="button" id="jfTvLoad">Carregar vídeo</button><button type="button" id="jfTvPlay">▶ Play</button><button type="button" id="jfTvPause">Ⅱ Pausar</button></div>',
            '<label>Posição do vídeo <span id="jfTvTime">0:00</span><input type="range" id="jfTvSeek" min="0" max="100" value="0" step="1"></label>',
          '</section>',
          '<section id="jfTvLocalTools" class="jf-tv-tools" hidden>',
            '<label>Vídeo do seu computador (não será enviado ao Render)<input type="file" id="jfTvFile" accept="video/*"></label>',
            '<div class="jf-tv-actions"><button type="button" id="jfTvStartLocal">Transmitir arquivo</button></div>',
            '<p class="jf-tv-note">O arquivo fica no seu PC. A reprodução (vídeo e áudio) segue por LiveKit. Prévia do ADM silenciosa para evitar áudio duplicado.</p>',
          '</section>',
          '<section id="jfTvGameTools" class="jf-tv-tools" hidden>',
            '<label class="jf-tv-audio-choice"><input id="jfTvCaptureAudio" type="checkbox" checked> 🔊 Transmitir áudio da tela/aba</label>',
            '<div class="jf-tv-actions"><button type="button" id="jfTvStartGame">🖥️ Compartilhar tela ou janela</button></div>',
            '<p class="jf-tv-note">Escolha <strong>aba, janela ou tela inteira</strong>. Para transmitir som, marque também <strong>Compartilhar áudio</strong> no seletor do navegador (se disponível). O Chrome/Edge costuma oferecer áudio de abas e, no Windows, pode oferecer áudio do sistema ou de janelas. Nem toda janela/navegador permite captura de som. Até 1080p / 30 FPS / 3,5 Mbps por ouvinte. Se a música já estiver sendo transmitida separadamente, evite capturá-la outra vez.</p>',
          '</section>',
          '<div class="jf-tv-actions"><button type="button" class="jf-tv-danger" id="jfTvStop">■ Encerrar TV</button></div>',
        '</div>',
        '<div class="jf-tv-actions" id="jfTvViewerTools" hidden><button type="button" id="jfTvWatch">▶ Assistir ao vídeo</button><button type="button" id="jfTvSound">🔊 Ativar reprodução/som</button></div>',
        '<div class="jf-tv-status" role="status" aria-live="polite" id="jfTvStatus">Entre em uma sala para usar a TV.</div>',
        '<p class="jf-tv-note">🛡 YouTube: cada pessoa assiste pelo YouTube. Tela (vídeo e áudio) e arquivos: LiveKit Cloud para tela e arquivos, sem enviar o arquivo ao Render. A música continua independente.</p>',
      '</div>',
    '</section>'
  ].join("");
  document.body.appendChild(overlay);
  const $=id=>document.getElementById(id);
  const stage=$("jfTvStreamVideo"), frame=$("jfTvYoutubeFrame"), ytWrapper=$("jfTvYoutubeWrapper"), pauseShield=$("jfTvYoutubeShield");
  let joined=false, room="", ownerId=null, state=null, currentTab="youtube";
  let player=null, playerReady=false, loadedId="", ytLoading=null, opened=false;
  let stateReceivedAt=Date.now(), syncAttempt=0, lastAdminSyncAt=0;
  // Abrir a TV é uma interação do usuário: tentar áudio audível desde o início.
  // Só usar o botão manual quando o próprio navegador bloquear autoplay com som.
  let youtubeHardStopped=false, viewerAudioEnabled=true, viewerAudioBlocked=false, pauseRetryCount=0;
  let sourceStream=null, localVideo=null, localUrl="", localAudioContext=null, viewerRequested=false;
  let lkRoom=null, lkLoadPromise=null, lkGeneration=0;

  function isAdmin(){return joined && socket.id===ownerId;}
  function status(message){$("jfTvStatus").textContent=message;}
  function fmt(t){t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+":"+String(t%60).padStart(2,"0");}
  function youtubeId(raw){
    try {
      const u=new URL(raw.trim());
      const h=u.hostname.toLowerCase();
      if (h==="youtu.be"||h==="www.youtu.be") return u.pathname.slice(1).split("/")[0];
      if (["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com"].includes(h))
        return u.searchParams.get("v")||(/^\/(shorts|live|embed)\//.test(u.pathname)?u.pathname.split("/")[2]:"");
    }catch(_){}
    return "";
  }
  function showTab(mode){
    currentTab=mode;
    for(const button of overlay.querySelectorAll("[data-tv-tab]")) button.setAttribute("aria-selected",String(button.dataset.tvTab===mode));
    $("jfTvYoutubeTools").hidden=mode!=="youtube";
    $("jfTvLocalTools").hidden=mode!=="local";
    $("jfTvGameTools").hidden=mode!=="screen";
  }
  function releasePeers(){
    ++lkGeneration;
    if(lkRoom){const old=lkRoom;lkRoom=null;void old.disconnect().catch(()=>{});}
    stage.srcObject=null;
  }
  function stopLocal(){
    if(sourceStream){for(const track of sourceStream.getTracks())track.stop();sourceStream=null;}
    if(localVideo){localVideo.pause();localVideo.removeAttribute("src");localVideo.load();localVideo=null;}
    if(localUrl){URL.revokeObjectURL(localUrl);localUrl="";}
    if(localAudioContext){localAudioContext.close().catch(()=>{});localAudioContext=null;}
    releasePeers();
  }
  function stopBroadcast(){
    if(joined&&isAdmin()&&sourceStream)socket.emit("tv:stop");
    stopLocal();
  }
  function closeTv(){
    overlay.hidden=true;opened=false;
    if(isAdmin()&&sourceStream) stopBroadcast(); // nunca compartilhar uma tela com a janela fechada
    if(!isAdmin() && viewerRequested){socket.emit("tv:unwatch");viewerRequested=false;releasePeers();}
    if(playerReady && state?.mode==="youtube")try{player.pauseVideo()}catch(_){}
    pauseShield.hidden=true;
  }
  $("jfTvClose").onclick=closeTv;
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeTv();});
  launch.onclick=()=>{
    if(!joined)return;
    opened=true;overlay.hidden=false;updateUi();
    socket.emit("tv:request-state");
    if(state?.mode==="youtube")void ensureYoutube();
    $("jfTvClose").focus();
  };
  overlay.querySelectorAll("[data-tv-tab]").forEach(button=>button.addEventListener("click",()=>{if(isAdmin())showTab(button.dataset.tvTab);}));

  async function loadYoutubeApi(){
    if(window.YT?.Player)return window.YT;
    if(ytLoading)return ytLoading;
    ytLoading=new Promise((resolve,reject)=>{
      const old=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{if(typeof old==="function")old();resolve(window.YT);};
      const script=document.createElement("script");
      script.src="https://www.youtube.com/iframe_api";
      script.onerror=()=>reject(new Error("Não foi possível carregar o YouTube."));
      document.head.appendChild(script);
    });
    return ytLoading;
  }
  function targetTime(){
    if(!state)return 0;
    // Usar relógio relativo à recepção para evitar diferenças de fuso/relógio entre PCs.
    const baseline=(Number(state.seconds)||0)+
      (state.playing?Math.max(0,((Number(state.serverNow)||Number(state.updatedAt))-(Number(state.updatedAt)||0))/1000):0);
    return Math.max(0, baseline+(state.playing?Math.max(0,(Date.now()-stateReceivedAt)/1000):0));
  }
  function updateYoutubePauseShield(){
    pauseShield.hidden=!opened||state?.mode!=="youtube"||Boolean(state.playing);
  }
  function hardStopYoutubeIfNecessary(expectedRevision){
    if(!playerReady||!opened||state?.mode!=="youtube"||state.playing||state.revision!==expectedRevision)return;
    try{
      // Fallback para players que continuam avançando apesar do pauseVideo.
      // stopVideo descarrega a execução, mas preservamos o ID/tempo para restaurar no PLAY.
      if(player.getPlayerState()===1){
        player.stopVideo();
        youtubeHardStopped=true;
        status("⏸ Pausa forçada: o YouTube não interrompeu na primeira tentativa.");
      }
    }catch(_){}
  }
  function syncYoutube(force=false){
    if(!playerReady||state?.mode!=="youtube"||!opened)return;
    const paused=!state.playing;
    const wanted=targetTime();
    try{
      const changed=loadedId!==state.videoId;
      if(paused){
        // Sem seek enquanto pausado: alguns players recomeçam ao buscar posição.
        // Não mutar: o som deve permanecer habilitado para a próxima retomada.
        player.pauseVideo();
        if(changed){
          loadedId=state.videoId;
          player.cueVideoById({videoId:loadedId,startSeconds:wanted});
        }
        player.pauseVideo();
      }else{
        // Prioridade ao som automático. Somente caso onAutoplayBlocked dispare,
        // recorrer à reprodução mutada e oferecer o botão de desbloqueio.
        if(!isAdmin()&&viewerAudioEnabled)player.unMute();
        else if(!isAdmin())player.mute();
        if(changed||youtubeHardStopped){
          loadedId=state.videoId;
          youtubeHardStopped=false;
          player.loadVideoById({videoId:loadedId,startSeconds:wanted});
        }else{
          const current=player.getCurrentTime();
          if(Math.abs(current-wanted)>1.25)player.seekTo(wanted,true);
          if(force||player.getPlayerState()!==1)player.playVideo();
        }
      }
      $("jfTvSeek").max=String(Math.max(1,Math.floor(player.getDuration()||100)));
      $("jfTvSeek").value=String(Math.min(Number($("jfTvSeek").max),Math.floor(wanted)));
      $("jfTvTime").textContent=fmt(wanted);
    }catch(error){console.debug("Junto TV: player ainda não pronto",error);}
    updateYoutubePauseShield();
  }
  function retryYoutubePlayback(){
    const rev=state?.revision,vid=state?.videoId,token=++syncAttempt;
    [120,350,850].forEach(wait=>setTimeout(()=>{
      if(token!==syncAttempt||!opened||state?.revision!==rev||state?.videoId!==vid||!state?.playing)return;
      syncYoutube(false);
    },wait));
  }
  function enforceYoutubePause(){
    const rev=state?.revision,vid=state?.videoId,token=++syncAttempt;
    pauseRetryCount=0;
    // Reforçar pause no YouTube IFrame via postMessage. Reproduções externas
    // (cliques, buffer e seek tardio) são capturadas também por onStateChange.
    [80,220,500,950].forEach(wait=>setTimeout(()=>{
      if(token!==syncAttempt||!opened||state?.revision!==rev||state?.videoId!==vid||state?.playing!==false)return;
      syncYoutube(false);
      if(wait===950)hardStopYoutubeIfNecessary(rev);
    },wait));
  }
  function onYoutubePlayerState(event){
    // Mesmo ocultando controles, onStateChange fecha a brecha quando o iframe
    // muda para PLAYING independentemente de uma ordem do servidor.
    if(!state||state.mode!=="youtube"||!opened)return;
    const next=Number(event?.data);
    if(!state.playing && (next===1||next===3)){
      try{
        // Pausar não deve desligar o som permanentemente do ouvinte.
        player.pauseVideo();
        if(++pauseRetryCount>3)hardStopYoutubeIfNecessary(state.revision);
      }catch(_){}
      updateYoutubePauseShield();
    }
  }

  function onYoutubeAutoplayBlocked(){
    if(isAdmin()||!opened||state?.mode!=="youtube"||!state.playing)return;
    viewerAudioEnabled=false;
    viewerAudioBlocked=true;
    updateViewerAudioButton();
    status("🔊 Seu navegador bloqueou o som automático. Clique em Ativar som uma vez.");
    try{
      // Manter o vídeo sincronizado, mesmo se áudio com autoplay for bloqueado.
      player.mute();
      player.playVideo();
    }catch(_){}
  }
  function updateViewerAudioButton(){
    const manual=Boolean(!isAdmin()&&state?.mode==="youtube"&&viewerAudioBlocked);
    $("jfTvSound").hidden=!manual && state?.mode==="youtube";
    if(manual)$("jfTvSound").textContent="🔊 Ativar som";
  }
  async function ensureYoutube(){
    if(!opened||state?.mode!=="youtube")return;
    ytWrapper.hidden=false;
    try{
      const YT=await loadYoutubeApi();
      if(!opened||state?.mode!=="youtube")return;
      if(!player){
        player=new YT.Player(frame,{height:"360",width:"640",videoId:state.videoId,
          playerVars:{playsinline:1,controls:0,disablekb:1,fs:0,rel:0,autoplay:0},
          events:{onReady:()=>{
              playerReady=true;loadedId="";youtubeHardStopped=false;
              try{player.getIframe()?.setAttribute("tabindex","-1");}catch(_){}
              if(!isAdmin()&&viewerAudioEnabled)try{player.unMute();}catch(_){}
              syncYoutube(true);
              if(state?.playing)retryYoutubePlayback();
              else if(state?.mode==="youtube")enforceYoutubePause();
            },
            onStateChange:onYoutubePlayerState,
            onAutoplayBlocked:onYoutubeAutoplayBlocked,
            onError:()=>status("Este vídeo não permite reprodução incorporada ou não está disponível.")}});
      }else syncYoutube();
    }catch(e){status(e.message||"Não foi possível abrir o YouTube.");}
  }
  $("jfTvLoad").onclick=()=>{
    if(!isAdmin())return;
    const id=youtubeId($("jfTvYoutubeUrl").value);
    if(!/^[a-zA-Z0-9_-]{11}$/.test(id)){status("Cole um link válido do YouTube.");return;}
    stopLocal();socket.emit("tv:set-youtube",{videoId:id});
    status("Carregando vídeo para a sala...");
  };
  function sendYoutubeControl(action,seconds){
    if(!isAdmin()||state?.mode!=="youtube")return;
    const exact=Number.isFinite(seconds)?seconds:(playerReady&&loadedId===state.videoId?Number(player.getCurrentTime()):NaN);
    if(action==="pause"){
      ++syncAttempt;
      if(playerReady)try{player.pauseVideo();}catch(_){}
    }else if(action==="play"){
      if(playerReady)try{player.playVideo();}catch(_){}
    }
    socket.emit("tv:control",{action,...(Number.isFinite(exact)?{seconds:exact}:{})});
  }
  $("jfTvPlay").onclick=()=>sendYoutubeControl("play");
  $("jfTvPause").onclick=()=>sendYoutubeControl("pause");
  $("jfTvSeek").addEventListener("change",()=>sendYoutubeControl("seek",Number($("jfTvSeek").value)));

  async function loadLivekit(){
    if(window.LivekitClient)return window.LivekitClient;
    if(!lkLoadPromise)lkLoadPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/livekit-client@2.15.0/dist/livekit-client.umd.js";
      script.onload=()=>window.LivekitClient?resolve(window.LivekitClient):reject(new Error("SDK LiveKit não carregou."));
      script.onerror=()=>reject(new Error("Falha ao baixar biblioteca LiveKit."));
      document.head.appendChild(script);
    }).catch(error=>{lkLoadPromise=null;throw error;});
    return lkLoadPromise;
  }
  function getLivekitToken(publish){
    return new Promise((resolve,reject)=>{
      socket.timeout(9000).emit("tv:livekit-token",{publish},(error,response)=>{
        if(error)return reject(new Error("Servidor não respondeu à autorização LiveKit."));
        if(!response?.ok)return reject(new Error(response?.error||"LiveKit indisponível."));
        resolve(response);
      });
    });
  }
  async function connectLivekit(publish,stream){
    const generation=++lkGeneration;
    if(lkRoom){const old=lkRoom;lkRoom=null;await old.disconnect().catch(()=>{});}
    const Client=await loadLivekit();
    const auth=await getLivekitToken(publish);
    if(generation!==lkGeneration||!joined||(publish&&!isAdmin()))return;
    const roomInstance=new Client.Room({adaptiveStream:true,dynacast:true});
    lkRoom=roomInstance;
    roomInstance.on(Client.RoomEvent.Disconnected,()=>{
      if(lkRoom===roomInstance && generation===lkGeneration)status("Conexão com LiveKit encerrada.");
    });
    if(!publish){
      roomInstance.on(Client.RoomEvent.TrackSubscribed,(track,publication,participant)=>{
        if(track.kind===Client.Track.Kind.Video){
          track.attach(stage);
          stage.muted=false;stage.hidden=false;
          stage.play().catch(()=>status("Clique em Ativar reprodução/som."));
        }else if(track.kind===Client.Track.Kind.Audio){
          track.attach();
        }
      });
      roomInstance.on(Client.RoomEvent.TrackUnsubscribed,track=>track.detach());
    }
    await roomInstance.connect(auth.url,auth.token,{autoSubscribe:!publish});
    if(generation!==lkGeneration){await roomInstance.disconnect();return;}
    if(publish){
      if(!stream||sourceStream!==stream){await roomInstance.disconnect();return;}
      for(const track of stream.getTracks()){
        const options=track.kind==="video"?
          {name:"junto-tv-video",source:Client.Track.Source.ScreenShare,
            videoEncoding:{maxBitrate:VIDEO_MAX_BITRATE,maxFramerate:VIDEO_MAX_FPS},simulcast:true}:
          {name:"junto-tv-audio",source:Client.Track.Source.ScreenShareAudio};
        await roomInstance.localParticipant.publishTrack(track,options);
      }
      status("🟢 TV ao vivo pelo LiveKit, com qualidade adaptativa.");
    }else status("🟢 Conectado ao vídeo pelo LiveKit.");
  }
  socket.on("tv:viewer-joined",()=>{});
  socket.on("tv:viewer-left",()=>{});
  $("jfTvWatch").onclick=async()=>{
    if(isAdmin()||!joined||!state||state.mode==="youtube")return;
    viewerRequested=true;releasePeers();
    socket.emit("tv:watch");
    $("jfTvWatch").disabled=true;
    status("Conectando à transmissão LiveKit...");
    try{await connectLivekit(false);}
    catch(error){viewerRequested=false;releasePeers();status("Falha ao assistir: "+error.message);updateUi();}
  };
  $("jfTvSound").onclick=()=>{
    if(state?.mode==="youtube"){
      if(!playerReady)return status("Aguarde o player do YouTube carregar.");
      viewerAudioEnabled=true;
      viewerAudioBlocked=false;
      updateViewerAudioButton();
      try{
        player.unMute();
        if(state.playing){
          player.playVideo();
          status("Som habilitado. Agora segue o play/pause do ADM.");
        }else{
          // Nunca iniciar vídeo pausado só para liberar áudio.
          player.pauseVideo();
          status("Som liberado para a próxima reprodução do ADM.");
        }
      }catch(_){
        viewerAudioBlocked=true;
        updateViewerAudioButton();
        status("O navegador ainda bloqueou o som. Toque de novo para liberar.");
      }
    }else stage.play().catch(()=>status("Não foi possível iniciar a reprodução."));
  };
  async function publishStream(stream,mode){
    if(!isAdmin()){stream.getTracks().forEach(t=>t.stop());return;}
    if(mode==="local"){
      // Já limpamos a sessão anterior antes de selecionar o arquivo.
      // Não fechar o AudioContext/URL do NOVO arquivo aqui.
      releasePeers();
    }else stopLocal();
    sourceStream=stream;
    for(const track of stream.getVideoTracks()){
      track.contentHint="motion";
      track.onended=()=>{if(sourceStream===stream){stopBroadcast();status("Compartilhamento encerrado.");}};
    }
    stage.hidden=false;
    stage.muted=true;stage.srcObject=stream;
    stage.play().catch(()=>{});
    socket.emit("tv:start-stream",{mode});
    try{await connectLivekit(true,stream);}
    catch(error){status("Falha ao publicar no LiveKit: "+error.message);stopBroadcast();}
  }
  $("jfTvStartGame").onclick=async()=>{
    if(!isAdmin()||!navigator.mediaDevices?.getDisplayMedia)return status("Seu navegador não suporta compartilhar janela.");
    try{
      // A pessoa escolhe tela inteira, aba ou janela no diálogo do navegador.
      // "ideal" não força upscale se a fonte não tiver resolução Full HD.
      const wantAudio=$("jfTvCaptureAudio").checked;
      const stream=await navigator.mediaDevices.getDisplayMedia({
        video:{frameRate:{ideal:VIDEO_MAX_FPS,max:VIDEO_MAX_FPS},
          width:{ideal:1920},height:{ideal:VIDEO_MAX_HEIGHT}},
        // Sem permissão para capturar áudio se o ADM desativar esta opção.
        // Com som ligado, o navegador ainda exige "Compartilhar áudio" no seletor.
        audio:wantAudio,
        systemAudio:wantAudio?"include":"exclude",
        windowAudio:wantAudio?"window":"exclude"
      });
      const hasAudio=stream.getAudioTracks().some(track=>track.readyState!=="ended");
      await publishStream(stream,"screen");
      if(wantAudio && hasAudio){
        status("🟢 Tela + áudio capturados. Transmitindo diretamente pelo LiveKit, sem TURN.");
      }else if(wantAudio){
        status("⚠️ Tela transmitindo SEM áudio: o navegador não forneceu faixa de som. Compartilhe uma aba com 'Compartilhar áudio' marcado ou selecione áudio do sistema, se disponível, e reinicie a transmissão.");
      }else{
        status("🖥️ Tela transmitindo sem áudio por escolha do administrador (LiveKit).");
      }
    }catch(e){if(e.name!=="NotAllowedError")status("Não foi possível capturar a tela: "+e.message);}
  };
  $("jfTvStartLocal").onclick=async()=>{
    if(!isAdmin())return;
    const file=$("jfTvFile").files?.[0];
    if(!file||!file.type.startsWith("video/"))return status("Selecione um arquivo de vídeo.");
    if(!HTMLMediaElement.prototype.captureStream && !HTMLMediaElement.prototype.mozCaptureStream)
      return status("Este navegador não permite capturar vídeo local; tente Chrome ou Firefox no computador.");
    stopLocal();
    localUrl=URL.createObjectURL(file);
    const video=document.createElement("video");
    localVideo=video;video.playsInline=true;video.muted=false;video.preload="auto";
    video.src=localUrl;video.onended=()=>{if(localVideo===video)stopBroadcast();};
    try{
      // O som vai direto ao MediaStreamDestination: nada sai pelo fone do ADM
      // e não duplicamos as faixas de áudio do captureStream.
      let audioStream=null;
      const AudioEngine=window.AudioContext||window.webkitAudioContext;
      let audioReady=Promise.resolve();
      if(AudioEngine){
        localAudioContext=new AudioEngine();
        const sourceNode=localAudioContext.createMediaElementSource(video);
        const destination=localAudioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        audioStream=destination.stream;
        audioReady=localAudioContext.resume();
      }else video.muted=true;
      // play() e resume() começam enquanto o gesto do clique ainda está ativo.
      await Promise.all([audioReady,video.play()]);
      const direct=(video.captureStream||video.mozCaptureStream).call(video);
      const captured=new MediaStream([
        ...direct.getVideoTracks(),
        ...(audioStream?audioStream.getAudioTracks():direct.getAudioTracks())
      ]);
      if(!captured.getVideoTracks().length)throw new Error("Vídeo não disponível para captura.");
      await publishStream(captured,"local");
      stage.muted=true;
      status("Arquivo local pelo LiveKit, com áudio quando o formato permitir. Nenhum arquivo foi enviado ao servidor.");
    }catch(e){
      status("Falha no arquivo local: "+e.message);
      stopLocal();
    }
  };
  $("jfTvStop").onclick=()=>{
    if(!isAdmin())return;
    stopLocal();socket.emit("tv:stop");status("TV encerrada para todos.");
  };
  function updateUi(){
    launch.disabled=!joined;launch.classList.toggle("jf-tv-live",!!state);
    launch.title=state?"Abrir Junto.fm TV (no ar)":"Abrir Junto.fm TV";
    const admin=isAdmin();
    $("jfTvTabs").hidden=!admin;
    $("jfTvAdminTools").hidden=!admin;
    const isStream=state&&state.mode!=="youtube";
    $("jfTvViewerTools").hidden=!joined||admin||!state;
    $("jfTvWatch").hidden=!isStream;
    $("jfTvWatch").disabled=viewerRequested;
    $("jfTvSound").hidden=!state||state.mode==="youtube"&&!viewerAudioBlocked;
    const showYoutube=state?.mode==="youtube"&&opened;
    ytWrapper.hidden=!showYoutube;
    updateYoutubePauseShield();
    stage.hidden=!isStream||!opened;
    $("jfTvEmpty").hidden=!!state;
    if(!state){status(joined?(admin?"Escolha YouTube, vídeo local ou jogo para começar.":"Aguardando o administrador abrir a TV."):"Entre em uma sala para usar a TV.");}
    else if(state.mode==="youtube"){status("YouTube sincronizado. Apenas o ADM controla o vídeo; tráfego do vídeo fora da Metered.ca.");}
    else status(admin?"Vídeo LiveKit. Fechar a janela encerra a captura.":viewerRequested?"Aguardando conexão LiveKit...":"Clique em Assistir para receber a transmissão.");
    if(admin)showTab(currentTab);
    if(isAdmin()&&sourceStream&&isStream&&state.hostId===socket.id && stage.srcObject!==sourceStream)stage.srcObject=sourceStream;
    if(showYoutube)void ensureYoutube();
  }
  function receiveTvState(incoming,immediate=false){
    const prior=state;
    if(incoming?.mode==="youtube" && prior?.mode==="youtube" && prior.videoId===incoming.videoId &&
        Number.isFinite(incoming.revision) && Number.isFinite(prior.revision) &&
        incoming.revision<=prior.revision)return; // inclusive duplicação TV PLAYBACK / TV STATE
    state=incoming||null;
    stateReceivedAt=Date.now();
    ++syncAttempt;
    // Aplicar o comando de mídia ANTES de atualizar toda a interface.
    // A notificação rápida do servidor ignora o caminho mais pesado de UI.
    if(immediate && state?.mode==="youtube"){
      if(opened){
        syncYoutube(true);
        if(state.playing)retryYoutubePlayback();
        else enforceYoutubePause();
      }
      if(!isAdmin())status(state.playing?"▶ Reprodução recebida do administrador.":"⏸ Pausa recebida do administrador.");
      return;
    }
    if(!state||state.mode!=="youtube"){
      if(playerReady)try{player.pauseVideo()}catch(_){}
      viewerAudioBlocked=false;
      viewerAudioEnabled=true;
      pauseShield.hidden=true;
    }
    if(!state||state.mode==="youtube"||prior?.mode!==state.mode||prior?.hostId!==state.hostId){
      if(prior?.mode!=="youtube" && viewerRequested){socket.emit("tv:unwatch");}
      if(!state||state.mode==="youtube"||prior?.hostId!==state.hostId){viewerRequested=false;releasePeers();}
    }
    if(isAdmin()&&sourceStream && (!state||state.hostId!==socket.id||state.mode==="youtube"))stopLocal();
    if(state?.mode==="youtube"&&prior?.videoId!==state.videoId){loadedId="";if(isAdmin())showTab("youtube");}
    updateUi();
    syncYoutube(true);
    if(state?.mode==="youtube"){
      if(state.playing)retryYoutubePlayback();
      else enforceYoutubePause();
    }
  }
  socket.on("tv:playback",incoming=>receiveTvState(incoming,true));
  socket.on("tv:state",incoming=>receiveTvState(incoming,false));
  socket.on("tv:control-result",result=>{
    if(result?.ok){
      status(result.action==="pause"?"✓ Pausa confirmada pelo servidor e enviada à sala."
        :result.action==="play"?"✓ Reprodução confirmada pelo servidor.":"✓ Posição sincronizada.");
    }else{
      status(result?.message||"O servidor recusou o comando da TV.");
      console.warn("Junto.fm TV: controle recusado",result?.message);
    }
  });
  socket.on("tv:error",data=>{status(data?.message||"Falha na TV.");});
  socket.on("joined-room",data=>{joined=true;room=data.room;ownerId=data.ownerId||null;state=null;viewerRequested=false;updateUi();});
  socket.on("room-owner-update",data=>{ownerId=data?.ownerId||null;updateUi();});
  function reset(){
    joined=false;room="";ownerId=null;state=null;viewerRequested=false;
    viewerAudioEnabled=true;viewerAudioBlocked=false;
    if(sourceStream)stopLocal();else releasePeers();
    overlay.hidden=true;opened=false;updateUi();
  }
  socket.on("left-room",reset);socket.on("room-kicked",reset);socket.on("disconnect",reset);
  setInterval(()=>{
    if(!opened||!state||state.mode!=="youtube"||!playerReady)return;
    // Leitura de segurança a cada segundo, mesmo pausado.
    if(!state.playing){
      if(player.getPlayerState()===1||player.getPlayerState()===3)syncYoutube(false);
      return;
    }
    if(isAdmin()){
      if(Date.now()-lastAdminSyncAt<15000||player.getPlayerState()!==1)return;
      lastAdminSyncAt=Date.now();
      try{socket.emit("tv:sync",{seconds:player.getCurrentTime(),playing:true,revision:state.revision});}catch(_){}
    }else syncYoutube(false);
  },1000);
  updateUi();
})();
