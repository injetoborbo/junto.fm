"use strict";
// Junto.fm TV — somente sinais/estado passam pelo Socket.io.
// NENHUM vídeo, arquivo ou frame é enviado ao Render ou à Metered.ca.
const crypto = require("crypto");
const { AccessToken } = require("livekit-server-sdk");
module.exports = function createJuntoTv(io, isRoomOwner, isRateLimited) {
  const livekitUrl = process.env.LIVEKIT_URL || "";
  const livekitKey = process.env.LIVEKIT_API_KEY || "";
  const livekitSecret = process.env.LIVEKIT_API_SECRET || "";
  const livekitReady = /^wss:\/\//.test(livekitUrl) && !!livekitKey && !!livekitSecret;
  const lkRoomName = room => "jf-tv-" + crypto.createHash("sha256").update(room).digest("hex").slice(0, 32);

  const states = new Map();
  const viewers = new Map();
  const idleTimers = new Map();
  function clearIdle(room) {
    if (idleTimers.has(room)) { clearTimeout(idleTimers.get(room)); idleTimers.delete(room); }
  }
  function scheduleIdle(room, delay = 90000) {
    clearIdle(room);
    const timer = setTimeout(() => {
      idleTimers.delete(room);
      if (states.get(room) && states.get(room).mode !== "youtube" && !(viewers.get(room)?.size)) stop(room);
    }, delay);
    timer.unref?.();
    idleTimers.set(room, timer);
  }
  const MAX_VIEWERS = 4;
  const allowedModes = new Set(["local", "screen"]);
  let revisionCounter = 0;
  const nextRevision = () => ++revisionCounter;

  function snapshot(room) {
    const s = states.get(room);
    if (!s) return null;
    return { mode: s.mode, videoId: s.videoId || "", playing: !!s.playing,
      seconds: s.seconds || 0, updatedAt: s.updatedAt, hostId: s.hostId,
      revision: s.revision || 0, serverNow: Date.now() };
  }
  function broadcast(room) {
    io.to(room).emit("tv:state", snapshot(room));
  }
  function stop(room) {
    clearIdle(room);
    const s = states.get(room);
    if (!s) return;
    states.delete(room);
    viewers.delete(room);
    io.to(room).emit("tv:state", null);
  }
  function leave(room, id) {
    if (!room) return;
    if (states.get(room)?.hostId === id) return stop(room);
    const set = viewers.get(room);
    if (set?.delete(id)) {
      io.to(states.get(room)?.hostId).emit("tv:viewer-left", { viewerId: id });
      if (!set.size) { viewers.delete(room); scheduleIdle(room, 60000); }
    }
  }
  function joined(socket) {
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
          name: publisher ? "Junto.fm TV ADM" : "Junto.fm TV espectador",
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

    socket.on("tv:request-state", () => {
      const room=socket.data.room;
      if (!room || isRateLimited(socket,"tv:request-state",3,10000)) return;
      socket.emit("tv:state",snapshot(room));
    });

    socket.on("tv:control", data => {
      const room = socket.data.room, s = states.get(room);
      if (!isRoomOwner(socket, room) || s?.mode !== "youtube" || s.hostId !== socket.id) {
        socket.emit("tv:control-result", { ok:false, message:"O comando não foi aceito: controle exclusivo do ADM." });
        return fail(socket, "Só o administrador controla o vídeo.");
      }
      if (isRateLimited(socket, "tv:control", 12, 5000)) {
        socket.emit("tv:control-result", { ok:false, message:"Comandos muito rápidos. Aguarde um instante." });
        return fail(socket, "Comandos muito rápidos. Aguarde um instante.");
      }
      const action = data?.action;
      if (!["play", "pause", "seek"].includes(action)) return;
      const now = Date.now();
      const elapsed = s.playing ? Math.max(0, (now - s.updatedAt) / 1000) : 0;
      const base = s.seconds + elapsed;
      const explicit = data && data.seconds != null ? Number(data.seconds) : NaN;
      const requested = Number.isFinite(explicit) && explicit >= 0 && explicit <= 12 * 3600;
      // O ponto capturado pelo ADM ao clicar é mais preciso do que o relógio do servidor.
      s.seconds = requested ? explicit : Math.max(0, Math.min(base, 12 * 3600));
      s.playing = action === "play" ? true : action === "pause" ? false : s.playing;
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
      if (!isRoomOwner(socket, room) || s?.mode !== "youtube" || s.hostId !== socket.id) return;
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
      // Substituir fonte sem anunciar um estado nulo intermediário, que encerraria
      // a captura recém-iniciada no navegador do administrador.
      clearIdle(room);
      states.set(room, { mode: data.mode, hostId: socket.id, playing: true, updatedAt: Date.now() });
      broadcast(room);
      if (!(viewers.get(room)?.size)) scheduleIdle(room);
    });

    socket.on("tv:stop", () => {
      const room = socket.data.room;
      if (room && isRoomOwner(socket, room) && states.get(room)?.hostId === socket.id) stop(room);
    });

    socket.on("tv:watch", () => {
      const room = socket.data.room, s = states.get(room);
      if (!room || !s || s.mode === "youtube" || s.hostId === socket.id) return;
      if (isRateLimited(socket, "tv:watch", 4, 10000)) return;
      let set = viewers.get(room);
      if (!set) { set = new Set(); viewers.set(room, set); }
      if (!set.has(socket.id) && set.size >= MAX_VIEWERS) return fail(socket, "Limite de espectadores do protótipo atingido.");
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
      if (!s || s.mode === "youtube" || !target || target.data.room !== room || !set) return;
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
