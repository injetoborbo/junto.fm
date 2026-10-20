"use strict";
// Junto.fm TV — somente sinais/estado passam pelo Socket.io.
// NENHUM vídeo, arquivo ou frame é enviado ao Render ou à Metered.ca.
module.exports = function createJuntoTv(io, isRoomOwner, isRateLimited) {
  const states = new Map();
  const viewers = new Map();
  const MAX_VIEWERS = 4;
  const allowedModes = new Set(["local", "screen"]);

  function snapshot(room) {
    const s = states.get(room);
    if (!s) return null;
    return { mode: s.mode, videoId: s.videoId || "", playing: !!s.playing,
      seconds: s.seconds || 0, updatedAt: s.updatedAt, hostId: s.hostId };
  }
  function broadcast(room) {
    io.to(room).emit("tv:state", snapshot(room));
  }
  function stop(room) {
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
      if (!set.size) viewers.delete(room);
    }
  }
  function joined(socket) {
    socket.emit("tv:state", snapshot(socket.data.room));
  }
  function fail(socket, message) { socket.emit("tv:error", { message }); }

  io.on("connection", socket => {
    socket.on("tv:set-youtube", data => {
      const room = socket.data.room;
      if (!isRoomOwner(socket, room)) return fail(socket, "Só o administrador pode controlar a TV.");
      if (isRateLimited(socket, "tv:set-youtube", 6, 10000)) return;
      const id = String(data?.videoId || "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return fail(socket, "Link do YouTube inválido.");
      stop(room);
      states.set(room, { mode: "youtube", videoId: id, hostId: socket.id,
        playing: false, seconds: 0, updatedAt: Date.now() });
      broadcast(room);
    });

    socket.on("tv:control", data => {
      const room = socket.data.room, s = states.get(room);
      if (!isRoomOwner(socket, room) || s?.mode !== "youtube" || s.hostId !== socket.id)
        return fail(socket, "Só o administrador controla o vídeo.");
      if (isRateLimited(socket, "tv:control", 12, 5000)) return;
      const action = data?.action;
      if (!["play", "pause", "seek"].includes(action)) return;
      const now = Date.now();
      const elapsed = s.playing ? Math.max(0, (now - s.updatedAt) / 1000) : 0;
      const base = s.seconds + elapsed;
      const requested = Number(data?.seconds);
      s.seconds = action === "seek" && Number.isFinite(requested)
        ? Math.max(0, Math.min(requested, 12 * 3600))
        : Math.max(0, Math.min(base, 12 * 3600));
      s.playing = action === "play" ? true : action === "pause" ? false : s.playing;
      s.updatedAt = now;
      broadcast(room);
    });

    // Correção periódica leve de deriva, sem vídeo na sinalização.
    socket.on("tv:sync", data => {
      const room = socket.data.room, s = states.get(room);
      if (!isRoomOwner(socket, room) || s?.mode !== "youtube" || s.hostId !== socket.id) return;
      if (isRateLimited(socket, "tv:sync", 1, 7000)) return;
      const seconds = Number(data?.seconds);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 12 * 3600) return;
      s.seconds = seconds; s.playing = !!data?.playing; s.updatedAt = Date.now();
      broadcast(room);
    });

    socket.on("tv:start-stream", data => {
      const room = socket.data.room;
      if (!isRoomOwner(socket, room)) return fail(socket, "Só o administrador pode transmitir.");
      if (isRateLimited(socket, "tv:start-stream", 4, 10000)) return;
      if (!allowedModes.has(data?.mode)) return fail(socket, "Fonte de vídeo inválida.");
      stop(room);
      states.set(room, { mode: data.mode, hostId: socket.id, playing: true, updatedAt: Date.now() });
      broadcast(room);
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
