"use strict";
// Junto.TV — somente sinais/estado passam pelo Socket.io.
// NENHUM vídeo, arquivo ou frame é enviado ao Render ou à Metered.ca.
const crypto = require("crypto");
const { AccessToken } = require("livekit-server-sdk");
const { archiveRequest, resolveArchiveVideo } = require("./archive-video");
module.exports = function createJuntoTv(io, isRoomOwner, isRateLimited) {
  const livekitUrl = String(process.env.LIVEKIT_URL || "").trim();
  const livekitKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const livekitSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  const livekitReady = (() => {
    try {
      const endpoint = new URL(livekitUrl);
      return endpoint.protocol === "wss:" && Boolean(endpoint.hostname) &&
        Boolean(livekitKey) && Boolean(livekitSecret);
    } catch (_) { return false; }
  })();
  // Never print credentials; this single startup line makes missing Render
  // configuration visible in logs without exposing API keys or secrets.
  if (livekitReady) console.info("[Junto.TV] LiveKit configurado e endpoint WSS válido.");
  else console.warn("[Junto.TV] LiveKit indisponível: configure LIVEKIT_URL (wss://), LIVEKIT_API_KEY e LIVEKIT_API_SECRET na Render.");
  const lkRoomName = room => "jf-tv-" + crypto.createHash("sha256").update(room).digest("hex").slice(0, 32);

  const directModes = new Set(["youtube", "link"]);
  function validLink(raw) {
    if (typeof raw !== "string" || raw.length > 8192) return null;
    try {
      const url = new URL(raw.trim());
      const host = url.hostname.toLowerCase();
      // No proxy or server-side fetch: browsers receive the original HTTPS source.
      if (url.protocol !== "https:" || url.username || url.password ||
          !host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") ||
          host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
      return url.href;
    } catch (_) { return null; }
  }
  const states = new Map();
  const pendingLinks = new Map();
  const viewers = new Map();
  const youtubeQueues = new Map(); // pedidos temporários por sala, independentes do Spotify
  const queueFor = room => youtubeQueues.get(room) || [];
  const sendQueue = room => io.to(room).emit("tv:queue",queueFor(room));

  const idleTimers = new Map();
  function clearIdle(room) {
    if (idleTimers.has(room)) { clearTimeout(idleTimers.get(room)); idleTimers.delete(room); }
  }
  function scheduleIdle(room, delay = 90000) {
    clearIdle(room);
    const timer = setTimeout(() => {
      idleTimers.delete(room);
      if (states.get(room) && !directModes.has(states.get(room).mode) && !(viewers.get(room)?.size)) stop(room);
    }, delay);
    timer.unref?.();
    idleTimers.set(room, timer);
  }
  // LiveKit distributes one publication to the room. Do not retain the old
  // four-peer limit from the P2P prototype; provider quotas still apply.
  const allowedModes = new Set(["local", "screen"]);
  let revisionCounter = 0;
  const nextRevision = () => ++revisionCounter;

  function snapshot(room) {
    const s = states.get(room);
    if (!s) return null;
    return { ...(s.mode === "link" ? { url:s.url, title:s.title, format:s.format, rate:s.rate } : {}),
      ...(s.mode === "local" ? { duration:s.duration || 0 } : {}), mode: s.mode, videoId: s.videoId || "", playing: !!s.playing,
      seconds: s.seconds || 0, updatedAt: s.updatedAt, hostId: s.hostId,
      revision: s.revision || 0, serverNow: Date.now() };
  }
  function broadcast(room) {
    io.to(room).emit("tv:state", snapshot(room));
  }
  function stop(room) {
    pendingLinks.delete(room);
    clearIdle(room);
    const s = states.get(room);
    if (!s) return;
    states.delete(room);
    viewers.delete(room);
    io.to(room).emit("tv:state", null);
  }
  function leave(room, id) {
    if (!room) return;
    if (pendingLinks.get(room)?.hostId === id) pendingLinks.delete(room);
    if (states.get(room)?.hostId === id) return stop(room);
    const set = viewers.get(room);
    if (set?.delete(id)) {
      io.to(states.get(room)?.hostId).emit("tv:viewer-left", { viewerId: id });
      if (!set.size) { viewers.delete(room); scheduleIdle(room, 60000); }
    }
  }
  function joined(socket) {
    socket.emit("tv:queue",queueFor(socket.data.room));
    socket.emit("tv:state", snapshot(socket.data.room));
  }
  function fail(socket, message) { socket.emit("tv:error", { message }); }

  io.on("connection", socket => {
    socket.on("tv:livekit-token", async (data, reply) => {
      if (typeof reply !== "function") return;
      const room = socket.data.room;
      const state = states.get(room);
      if (!livekitReady) return reply({ ok: false, error: "LiveKit não configurado no servidor." });
      if (!room || !state || !allowedModes.has(state.mode))
        return reply({ ok: false, error: "Não existe transmissão ativa nesta sala." });
      if (isRateLimited(socket, "tv:livekit-token", 6, 10000))
        return reply({ ok: false, error: "Muitas tentativas. Aguarde um instante." });
      const publisher = isRoomOwner(socket, room) && state.hostId === socket.id;
      if (data?.publish === true && !publisher)
        return reply({ ok: false, error: "Só o administrador transmite." });
      if (!publisher && !viewers.get(room)?.has(socket.id))
        return reply({ ok: false, error: "Clique em Assistir primeiro." });
      try {
        const token = new AccessToken(livekitKey, livekitSecret, {
          identity: socket.id,
          name: publisher ? "Junto.TV ADM" : "Junto.TV espectador",
          ttl: "10m"
        });
        token.addGrant({
          roomJoin: true, room: lkRoomName(room), canPublish: publisher,
          canSubscribe: true, canPublishData: false
        });
        reply({ ok: true, url: livekitUrl, token: await token.toJwt(), publisher });
      } catch (error) {
        console.error("Falha ao emitir token LiveKit:", error.message);
        reply({ ok: false, error: "Não foi possível autorizar o LiveKit." });
      }
    });
    socket.on("tv:queue-add", data => {
      const room=socket.data.room;
      if(!room)return;
      if(isRateLimited(socket,"tv:queue-add",3,30000))return fail(socket,"Aguarde para enviar outra sugestão.");
      const id=String(data?.videoId||"");
      if(!/^[A-Za-z0-9_-]{11}$/.test(id))return fail(socket,"Link do YouTube inválido.");
      const queue=queueFor(room);
      if(queue.length>=30)return fail(socket,"Fila cheia (30 vídeos).");
      if(queue.some(item=>item.videoId===id))return fail(socket,"Esse vídeo já está na fila.");
      queue.push({id:crypto.randomUUID(),videoId:id,from:String(socket.data.profile?.name||"Participante").slice(0,32)});
      youtubeQueues.set(room,queue);
      sendQueue(room);
    });
    socket.on("tv:queue-remove", data => {
      const room=socket.data.room;
      if(!room||!isRoomOwner(socket,room))return;
      const queue=queueFor(room),at=queue.findIndex(item=>item.id===data?.id);
      if(at<0)return;
      queue.splice(at,1);sendQueue(room);
    });
    socket.on("tv:queue-play", data => {
      const room=socket.data.room;
      if(!room||!isRoomOwner(socket,room))return fail(socket,"Só o dono pode reproduzir pedidos.");
      if(isRateLimited(socket,"tv:queue-play",5,10000))return;
      const queue=queueFor(room),at=queue.findIndex(item=>item.id===data?.id);
      if(at<0)return;
      const [item]=queue.splice(at,1);sendQueue(room);
      stop(room);
      states.set(room,{mode:"youtube",videoId:item.videoId,hostId:socket.id,
        playing:true,seconds:0,updatedAt:Date.now(),revision:nextRevision()});
      broadcast(room);
    });
    socket.on("tv:set-youtube", data => {
      const room = socket.data.room;
      if (!isRoomOwner(socket, room)) return fail(socket, "Só o administrador pode controlar a TV.");
      if (isRateLimited(socket, "tv:set-youtube", 6, 10000)) return;
      const id = String(data?.videoId || "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return fail(socket, "Link do YouTube inválido.");
      stop(room);
      states.set(room, { mode: "youtube", videoId: id, hostId: socket.id,
        playing: false, seconds: 0, updatedAt: Date.now(), revision: nextRevision() });
      broadcast(room);
    });

    socket.on("tv:set-link", async data => {
      const room = socket.data.room;
      if (!room || !isRoomOwner(socket, room)) return fail(socket, "Só o administrador pode escolher o vídeo.");
      if (isRateLimited(socket, "tv:set-link", 6, 10000)) return;
      let url = validLink(data?.url);
      if (!url) return fail(socket, "Use um link HTTPS público de vídeo, sem usuário e senha no endereço.");
      let format = ["auto", "direct", "hls"].includes(data?.format) ? data.format : "auto";
      const pending = {hostId:socket.id};
      pendingLinks.set(room,pending);
      try {
        const request = archiveRequest(url);
        if (request) {
          const resolved = await resolveArchiveVideo(request);
          if (pendingLinks.get(room) !== pending || socket.data.room !== room || !isRoomOwner(socket,room)) return;
          url = resolved.url; format = resolved.format;
        }
      } catch (error) {
        if (pendingLinks.get(room) !== pending) return;
        pendingLinks.delete(room);
        return fail(socket,error.name === "TimeoutError" ? "O Archive.org demorou a responder. Tente carregar novamente." : error.message);
      }
      stop(room);
      states.set(room, {mode:"link", url, format,
        title:typeof data?.title === "string" ? data.title.trim().slice(0,120) : "Vídeo da sala",
        hostId:socket.id, playing:false, seconds:0, rate:1,
        updatedAt:Date.now(), revision:nextRevision()});
      broadcast(room);
    });

    socket.on("tv:request-state", () => {
      const room=socket.data.room;
      if (!room || isRateLimited(socket,"tv:request-state",3,10000)) return;
      socket.emit("tv:state",snapshot(room));
    });

    socket.on("tv:control", data => {
      const room = socket.data.room, s = states.get(room);
      if (!isRoomOwner(socket, room) || !directModes.has(s?.mode) || s.hostId !== socket.id) {
        socket.emit("tv:control-result", { ok:false, message:"O comando não foi aceito: controle exclusivo do ADM." });
        return fail(socket, "Só o administrador controla o vídeo.");
      }
      if (isRateLimited(socket, "tv:control", 12, 5000)) {
        socket.emit("tv:control-result", { ok:false, message:"Comandos muito rápidos. Aguarde um instante." });
        return fail(socket, "Comandos muito rápidos. Aguarde um instante.");
      }
      const action = data?.action;
      if (!["play", "pause", "seek", ...(s.mode === "link" ? ["rate"] : [])].includes(action)) return;
      if (action === "rate" && ![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(Number(data?.rate))) return;
      const now = Date.now();
      const elapsed = s.playing ? Math.max(0, (now - s.updatedAt) / 1000 * (s.rate || 1)) : 0;
      const base = s.seconds + elapsed;
      const explicit = data && data.seconds != null ? Number(data.seconds) : NaN;
      const requested = Number.isFinite(explicit) && explicit >= 0 && explicit <= 12 * 3600;
      // O ponto capturado pelo ADM ao clicar é mais preciso do que o relógio do servidor.
      s.seconds = requested ? explicit : Math.max(0, Math.min(base, 12 * 3600));
      s.playing = action === "play" ? true : action === "pause" ? false : s.playing;
      if (action === "rate") {
        const rate = Number(data?.rate);
        if (![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(rate)) return;
        s.rate = rate;
      }
      s.updatedAt = now;
      s.revision = nextRevision();
      const current = snapshot(room);
      // Mensagem de controle de alta prioridade. Ouvintes aplicam antes de renderizar UI.
      // Não há upload de vídeo: somente posição, ação e revisão no Socket.io.
      io.to(room).emit("tv:playback", {...current, action});
      socket.emit("tv:control-result", { ok:true, action, revision:s.revision });
      broadcast(room);
    });

    // Correção periódica leve de deriva, sem vídeo na sinalização.
    socket.on("tv:sync", data => {
      const room = socket.data.room, s = states.get(room);
      if (!isRoomOwner(socket, room) || !directModes.has(s?.mode) || s.hostId !== socket.id) return;
      if (isRateLimited(socket, "tv:sync", 1, 7000)) return;
      // Sync antigo nunca pode ressuscitar um vídeo pausado.
      if (!s.playing || data?.playing !== true || Number(data?.revision) !== s.revision) return;
      const seconds = Number(data?.seconds);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 12 * 3600) return;
      s.seconds = seconds;
      s.updatedAt = Date.now();
      s.revision = nextRevision();
      broadcast(room);
    });

    socket.on("tv:start-stream", data => {
      const room = socket.data.room;
      if (!isRoomOwner(socket, room)) return fail(socket, "Só o administrador pode transmitir.");
      if (isRateLimited(socket, "tv:start-stream", 4, 10000)) return;
      if (!allowedModes.has(data?.mode)) return fail(socket, "Fonte de vídeo inválida.");
      pendingLinks.delete(room);
      // Substituir fonte sem anunciar um estado nulo intermediário, que encerraria
      // a captura recém-iniciada no navegador do administrador.
      clearIdle(room);
      states.set(room, { mode: data.mode, hostId: socket.id, playing: true, updatedAt: Date.now() });
      broadcast(room);
      if (!(viewers.get(room)?.size)) scheduleIdle(room);
    });

    socket.on("tv:stop", () => {
      const room = socket.data.room;
      if (room && isRoomOwner(socket, room)) {
        pendingLinks.delete(room);
        if (states.get(room)?.hostId === socket.id) stop(room);
      }
    });

    // The host controls the captured file itself. Viewers keep receiving the
    // same LiveKit tracks when it pauses/seeks, rather than reconnecting.
    socket.on("tv:local-state", data => {
      const room = socket.data.room, s = states.get(room);
      if (!room || s?.mode !== "local" || s.hostId !== socket.id || !isRoomOwner(socket, room)) return;
      if (isRateLimited(socket, "tv:local-state", 12, 5000)) return;
      const seconds = Number(data?.seconds), duration = Number(data?.duration);
      if (typeof data?.playing !== "boolean" || !Number.isFinite(seconds) || seconds < 0 || seconds > 43200 ||
          !Number.isFinite(duration) || duration <= 0 || duration > 43200 || seconds > duration) return;
      Object.assign(s, {seconds, duration, playing:data.playing, updatedAt:Date.now(), revision:nextRevision()});
      broadcast(room);
    });

    socket.on("tv:watch", () => {
      const room = socket.data.room, s = states.get(room);
      if (!room || !s || directModes.has(s.mode) || s.hostId === socket.id) return;
      if (isRateLimited(socket, "tv:watch", 4, 10000)) return;
      let set = viewers.get(room);
      if (!set) { set = new Set(); viewers.set(room, set); }
      if (set.has(socket.id)) return;
      set.add(socket.id);
      clearIdle(room);
      io.to(s.hostId).emit("tv:viewer-joined", { viewerId: socket.id });
    });

    socket.on("tv:unwatch", () => leave(socket.data.room, socket.id));

    socket.on("tv:signal", payload => {
      const room = socket.data.room, s = states.get(room);
      const id = String(payload?.to || "");
      const data = payload?.data;
      const target = io.sockets.sockets.get(id);
      const set = viewers.get(room);
      if (!s || directModes.has(s.mode) || !target || target.data.room !== room || !set) return;
      const fromHost = s.hostId === socket.id && set.has(id);
      const toHost = id === s.hostId && set.has(socket.id);
      if (!fromHost && !toHost) return;
      if (!data || !["offer", "answer", "candidate"].includes(data.type)) return;
      if (data.type === "offer" && !fromHost) return;
      if (data.type === "answer" && !toHost) return;
      if (["offer", "answer"].includes(data.type)) {
        if (typeof data.sdp !== "string" || data.sdp.length > 150000) return;
      } else if (!data.candidate || JSON.stringify(data.candidate).length > 6000) return;
      if (isRateLimited(socket, "tv:signal", 70, 10000)) return;
      target.emit("tv:signal", { from: socket.id, data });
    });

    socket.on("disconnect", () => leave(socket.data.room, socket.id));
  });

  return { joined, leave };
};


