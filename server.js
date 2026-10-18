const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

// Carrega variáveis de um arquivo .env local sem exigir dependências extras.
try {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch (_) {}

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  pingInterval: 25000,
  pingTimeout: 20000
});
const PORT = process.env.PORT || 3000;
const spotifySessions = new Map();
const spotifyAuthStates = new Map();
const roomTracks = new Map();
const roomTransmitters = new Map();
const roomChatMessages = new Map();
const roomAccess = new Map();
const SPOTIFY_SCOPES = "user-read-currently-playing user-read-playback-state user-library-modify";

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
function getSession(req, res, create = false) {
  let id = cookieValue(req, "junto_spotify_session");
  let session = id && spotifySessions.get(id);
  if (!session && create) {
    id = crypto.randomBytes(24).toString("hex");
    session = {};
    spotifySessions.set(id, session);
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.setHeader("Set-Cookie", `junto_spotify_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? "; Secure" : ""}`);
  }
  return session || null;
}
function spotifyRedirectUri(req) {
  if (SPOTIFY_REDIRECT_URI) return SPOTIFY_REDIRECT_URI;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}/spotify/callback`;
}
async function spotifyTokenRequest(body) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || "Falha ao autenticar com o Spotify.");
  return data;
}
async function validSpotifyAccessToken(session) {
  if (!session) throw new Error("Conecte sua conta do Spotify primeiro.");
  if (session.accessToken && session.expiresAt > Date.now() + 60000) return session.accessToken;
  if (!session.refreshToken) throw new Error("Sua sessão do Spotify expirou. Conecte novamente.");
  const refreshed = await spotifyTokenRequest({
    grant_type: "refresh_token", refresh_token: session.refreshToken,
    client_id: SPOTIFY_CLIENT_ID
  });
  session.accessToken = refreshed.access_token;
  session.expiresAt = Date.now() + (refreshed.expires_in || 3600) * 1000;
  if (refreshed.refresh_token) session.refreshToken = refreshed.refresh_token;
  return session.accessToken;
}

app.use(express.json({ limit: "10kb" }));
const adminAuth = require("./admin-auth")(app);
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Mantém a API key específica da credencial TURN no servidor, nunca no HTML público.
const METERED_DOMAIN = String(process.env.METERED_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
const METERED_TURN_API_KEY = String(process.env.METERED_TURN_API_KEY || "").trim();
let cachedTurnIceServers = null;
let cachedTurnIceServersAt = 0;
app.get("/api/turn/ice-servers", async (_req, res) => {
  if (!METERED_DOMAIN || !METERED_TURN_API_KEY) {
    return res.status(503).json({ error: "TURN não configurado no servidor." });
  }
  if (cachedTurnIceServers && Date.now() - cachedTurnIceServersAt < 5 * 60 * 1000) {
    return res.json(cachedTurnIceServers);
  }
  try {
    const endpoint = new URL(`https://${METERED_DOMAIN}/api/v1/turn/credentials`);
    endpoint.searchParams.set("apiKey", METERED_TURN_API_KEY);
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data) || data.length === 0) {
      return res.status(502).json({ error: "Não foi possível obter a configuração TURN." });
    }
    cachedTurnIceServers = data;
    cachedTurnIceServersAt = Date.now();
    return res.json(data);
  } catch (_error) {
    return res.status(502).json({ error: "Falha ao consultar o serviço TURN." });
  }
});

app.get("/api/spotify/status", (req, res) => {
  res.json({ configured: Boolean(SPOTIFY_CLIENT_ID), connected: Boolean(getSession(req, res)) });
});
app.get("/spotify/login", (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).send("Spotify não configurado. Defina SPOTIFY_CLIENT_ID no ambiente do servidor.");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(24).toString("hex");
  spotifyAuthStates.set(state, { verifier, createdAt: Date.now() });
  for (const [key, value] of spotifyAuthStates) if (Date.now() - value.createdAt > 10 * 60 * 1000) spotifyAuthStates.delete(key);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID, response_type: "code", redirect_uri: spotifyRedirectUri(req),
    scope: SPOTIFY_SCOPES, state, code_challenge_method: "S256", code_challenge: challenge
  }).toString();
  res.redirect(url.toString());
});
app.get("/spotify/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const pending = spotifyAuthStates.get(String(state || ""));
  spotifyAuthStates.delete(String(state || ""));
  if (error) return res.redirect("/?spotify=denied");
  if (!code || !pending || Date.now() - pending.createdAt > 10 * 60 * 1000) return res.status(400).send("Autorização do Spotify inválida ou expirada. Tente conectar novamente.");
  try {
    const tokens = await spotifyTokenRequest({
      client_id: SPOTIFY_CLIENT_ID, grant_type: "authorization_code", code: String(code),
      redirect_uri: spotifyRedirectUri(req), code_verifier: pending.verifier
    });
    const session = getSession(req, res, true);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
    res.redirect("/?spotify=connected");
  } catch (err) {
    console.error("Erro no OAuth Spotify:", err.message);
    res.status(502).send("Não foi possível conectar ao Spotify. Confira o Client ID e a Redirect URI e tente novamente.");
  }
});
app.post("/api/spotify/logout", (req, res) => {
  const id = cookieValue(req, "junto_spotify_session");
  if (id) spotifySessions.delete(id);
  res.setHeader("Set-Cookie", "junto_spotify_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.post("/api/spotify/save-track", async (req, res) => {
  try {
    if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: "Spotify ainda não foi configurado pelo administrador." });
    const uri = String(req.body && req.body.uri || "").trim();
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) return res.status(400).json({ error: "Não consegui identificar esta faixa do Spotify." });
    const token = await validSpotifyAccessToken(getSession(req, res));
    const endpoint = new URL("https://api.spotify.com/v1/me/library");
    endpoint.searchParams.set("uris", uri);
    const response = await fetch(endpoint, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data.error?.message || (response.status === 403 ? "O Spotify não autorizou salvar esta faixa. Reconecte sua conta e aceite a permissão de biblioteca." : "Não foi possível favoritar a música no Spotify.");
      return res.status(response.status).json({ error: message });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: err.message || "Conecte sua conta do Spotify primeiro." });
  }
});

app.get("/api/spotify/now-playing", async (req, res) => {
  try {
    if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: "Spotify ainda não foi configurado pelo administrador." });
    const token = await validSpotifyAccessToken(getSession(req, res));
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 204 || response.status === 404) return res.json({ item: null, is_playing: false });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Não foi possível ler a música atual." });
    const item = data.item;
    if (!item) return res.json({ item: null, is_playing: Boolean(data.is_playing) });
    res.json({
      is_playing: Boolean(data.is_playing), progress_ms: data.progress_ms || 0,
      item: { id: item.id, uri: item.uri || (item.id ? `spotify:track:${item.id}` : ""), name: item.name, artists: (item.artists || []).map(a => a.name),
        album: item.album?.name || "", image: item.album?.images?.[0]?.url || "",
        duration_ms: item.duration_ms || 0 },
      fetched_at: Date.now()
    });
  } catch (err) {
    res.status(401).json({ error: err.message || "Erro ao consultar Spotify." });
  }
});

function normalizeMusicText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
async function findRealSong(input) {
  const raw = String(input || "").trim().slice(0, 180);
  if (!raw || raw.length < 2) return false;
  const parts = raw.split(/\s+[—–-]\s+/);
  const requestedTitle = normalizeMusicText(parts[0]);
  const requestedArtist = parts.length > 1 ? normalizeMusicText(parts.slice(1).join(" ")) : "";
  if (!requestedTitle) return false;
  const endpoint = new URL("https://itunes.apple.com/search");
  endpoint.search = new URLSearchParams({ term: raw, entity: "song", media: "music", country: "BR", limit: "25" }).toString();
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Catálogo de músicas indisponível.");
  const data = await response.json();
  return (data.results || []).some(track => {
    if (normalizeMusicText(track.trackName) !== requestedTitle) return false;
    return !requestedArtist || normalizeMusicText(track.artistName) === requestedArtist;
  });
}

app.get("/api/music/validate-suggestion", async (req, res) => {
  const title = String(req.query.title || "").trim().slice(0, 180);
  if (!title) return res.status(400).json({ valid: false, error: "Digite o nome de uma música." });
  try {
    const valid = await findRealSong(title);
    return res.json({ valid, error: valid ? "" : "Não encontrei uma faixa com esse título exato. Confira o nome e o artista." });
  } catch (_) {
    return res.status(503).json({ valid: false, error: "Não foi possível consultar o catálogo de músicas agora. Tente novamente." });
  }
});

function cleanRoom(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

function isRateLimited(socket, key, limit, windowMs) {
  const now = Date.now();
  const limits = socket.data.rateLimits || (socket.data.rateLimits = {});
  const recent = (limits[key] || []).filter(timestamp => now - timestamp < windowMs);
  if (recent.length >= limit) {
    limits[key] = recent;
    return true;
  }
  recent.push(now);
  limits[key] = recent;
  return false;
}

app.get("/api/lyrics", async (req, res) => {
  const track = String(req.query.track || "").trim().slice(0, 180);
  const artist = String(req.query.artist || "").trim().slice(0, 180);
  if (!track) return res.status(400).json({ error: "Informe o título da música." });
  try {
    const url = new URL("https://lrclib.net/api/search");
    url.searchParams.set("track_name", track);
    if (artist) url.searchParams.set("artist_name", artist);
    const response = await fetch(url, { headers: { "User-Agent": "Junto.fm/1.0" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return res.status(502).json({ error: "A fonte de letras está indisponível no momento." });
    const results = await response.json();
    const list = Array.isArray(results) ? results : [];
    const best = list.find(item => item.syncedLyrics) || list.find(item => item.plainLyrics) || null;
    if (!best) return res.json({ found: false, lyrics: "", synced: false });
    return res.json({ found: true, lyrics: best.syncedLyrics || best.plainLyrics || "", synced: Boolean(best.syncedLyrics), instrumental: Boolean(best.instrumental), trackName: best.trackName || track, artistName: best.artistName || artist });
  } catch (_) { return res.status(502).json({ error: "Não foi possível buscar as letras agora." }); }
});

io.on("connection", socket => {
  socket.data.isAdmin = adminAuth.isAdmin(socket.request);
  socket.data.avatarSkin = "default";
  socket.on("avatar-skin-set", payload => {
    if (!socket.data.room) return;
    const requested = payload && payload.skin;
    if (requested !== "default" && requested !== "capitao-patria") return;
    if (requested === "capitao-patria" && !socket.data.isAdmin) {
      socket.emit("avatar-skin-error", { message: "Skin exclusiva do administrador." });
      return;
    }
    socket.data.avatarSkin = requested;
    io.to(socket.data.room).emit("avatar-skin-update", { id: socket.id, skin: requested });
  });
  socket.on("create-room", payload => {
    if (isRateLimited(socket, "create-room", 5, 60_000)) {
      socket.emit("create-room-error", { message: "Muitas tentativas de criação. Aguarde um minuto e tente novamente." });
      return;
    }
    const room = cleanRoom(payload && payload.room);
    const password = String(payload && payload.password || "");
    if (!room) {
      socket.emit("create-room-error", { message: "Escolha um nome válido para a sala." });
      return;
    }
    if (password && password.length < 4) {
      socket.emit("create-room-error", { message: "A senha deve ter pelo menos 4 caracteres." });
      return;
    }
    if (password.length > 100) {
      socket.emit("create-room-error", { message: "A senha deve ter no máximo 100 caracteres." });
      return;
    }
    const activeRoom = io.sockets.adapter.rooms.get(room);
    if (roomAccess.has(room) || (activeRoom && activeRoom.size > 0)) {
      socket.emit("create-room-error", { message: "Já existe uma sala com esse nome. Escolha outro nome." });
      return;
    }
    if (password) {
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(password, salt, 64);
      roomAccess.set(room, { salt, hash });
    } else {
      roomAccess.set(room, null);
    }
    socket.emit("room-created", { room });
  });

  socket.on("friend-request", payload => {
    const room = cleanRoom(payload && payload.room);
    const targetId = String(payload && payload.targetId || "");
    const target = io.sockets.sockets.get(targetId);
    const senderName = String((socket.data.profile || {}).name || "").trim().toLocaleLowerCase();
    const targetName = String((target && target.data.profile || {}).name || "").trim().toLocaleLowerCase();
    if (!room || socket.data.room !== room || !target || target.data.room !== room || targetId === socket.id || (senderName && targetName && senderName === targetName)) {
      socket.emit("friend-request-result", { accepted: false, error: "not-available" });
      return;
    }
    const profile = socket.data.profile || { name: "Ouvinte" };
    target.emit("friend-request-received", { fromId: socket.id, profile: { name: String(profile.name || "Ouvinte").slice(0, 24), avatar: String(profile.avatar || "").slice(0, 500), motto: String(profile.motto || "").slice(0, 90) }, room });
  });

  socket.on("friend-request-response", payload => {
    const targetId = String(payload && payload.targetId || "");
    const target = io.sockets.sockets.get(targetId);
    if (!target || !socket.data.room || target.data.room !== socket.data.room || targetId === socket.id) return;
    const accepted = !!(payload && payload.accepted);
    if (!accepted) {
      target.emit("friend-request-result", { accepted: false, profile: { name: String((socket.data.profile || {}).name || "Amigo").slice(0, 24) } });
      return;
    }
    const profile = socket.data.profile || { name: "Ouvinte" };
    target.emit("friend-request-result", { accepted: true, profile: { name: String(profile.name || "Amigo").slice(0, 24), avatar: String(profile.avatar || "").slice(0, 500), motto: String(profile.motto || "").slice(0, 90) }, room: socket.data.room });
  });

  socket.on("leave-room", payload => {
    const room = socket.data.room;
    if (!room || (payload && payload.room && payload.room !== room)) return;

    if (roomTransmitters.get(room)?.id === socket.id) {
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update", { id: socket.id, active: false });
    }
    socket.data.isTransmitting = false;
    socket.leave(room);
    socket.data.room = null;
    socket.to(room).emit("peer-left", { id: socket.id });
    const roomSet = io.sockets.adapter.rooms.get(room);
    io.to(room).emit("room-count", { count: roomSet ? roomSet.size : 0 });
    socket.emit("left-room", { room });
  });

  socket.on("join-room", payload => {
    if (isRateLimited(socket, "join-room", 10, 60_000)) {
      socket.emit("join-error", { message: "Muitas tentativas de entrada. Aguarde um minuto e tente novamente." });
      return;
    }
    const room = cleanRoom(payload && payload.room);
    const password = String(payload && payload.password || "");
    if (!room) {
      socket.emit("join-error", { message: "Digite um nome válido para a sala." });
      return;
    }
    if (!roomAccess.has(room)) {
      socket.emit("join-error", { message: "Essa sala não existe. Confira o nome ou crie uma sala nova." });
      return;
    }
    const access = roomAccess.get(room);
    if (access) {
      const attempted = crypto.scryptSync(password, access.salt, 64);
      if (attempted.length !== access.hash.length || !crypto.timingSafeEqual(attempted, access.hash)) {
        socket.emit("join-error", { message: "Senha incorreta. Confira a senha da sala e tente de novo." });
        return;
      }
    }

    const previousRoom = socket.data.room;
    if (previousRoom) {
      if (roomTransmitters.get(previousRoom)?.id === socket.id) {
        roomTransmitters.delete(previousRoom);
        io.to(previousRoom).emit("transmitter-update", { id: socket.id, active: false });
      }
      socket.data.isTransmitting = false;
      socket.leave(previousRoom);
      socket.to(previousRoom).emit("peer-left", { id: socket.id });
    }

    const peers = [...(io.sockets.adapter.rooms.get(room) || [])].filter(id => id !== socket.id);
    socket.join(room);
    socket.data.room = room;
    const profiles = Object.fromEntries(peers.map(id => {
      const peer = io.sockets.sockets.get(id);
      return [id, peer?.data.profile || { name: "Ouvinte", avatar: "" }];
    }));
    socket.emit("joined-room", { room, peers, track: roomTracks.get(room) || null, profiles, transmitter: roomTransmitters.get(room) || null });
    socket.emit("chat-history", { messages: (roomChatMessages.get(room) || []).slice(-50) });
    socket.to(room).emit("peer-joined", { id: socket.id });
    io.to(room).emit("room-count", { count: (io.sockets.adapter.rooms.get(room) || new Set()).size });
  });

  socket.on("signal", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room || !payload.to || !payload.data) return;
    const target = io.sockets.sockets.get(payload.to);
    if (!target || target.data.room !== socket.data.room) return;
    target.emit("signal", { from: socket.id, data: payload.data });
  });

  socket.on("transmission-started", payload => {
    const room = socket.data.room;
    if (!room || !payload || payload.room !== room) return;
    const profile = socket.data.profile || { name: "DJ ao vivo" };
    const transmitter = { id: socket.id, name: String(profile.name || "DJ ao vivo").slice(0, 24) };
    socket.data.isTransmitting = true;
    roomTransmitters.set(room, transmitter);
    io.to(room).emit("transmitter-update", { ...transmitter, active: true });
  });

  socket.on("transmission-stopped", payload => {
    const room = socket.data.room;
    if (!room || !payload || payload.room !== room) return;
    socket.data.isTransmitting = false;
    if (roomTransmitters.get(room)?.id === socket.id) {
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update", { id: socket.id, active: false });
    }
  });

  socket.on("clear-track", payload => {
    if (!socket.data.room || !payload || payload.room !== socket.data.room) return;
    roomTracks.delete(socket.data.room);
    socket.to(socket.data.room).emit("track-clear");
  });

  socket.on("track-update", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room || !payload.track) return;
    const track = payload.track;
    if (typeof track.name !== "string" || typeof track.artists !== "string") return;
    const safeTrack = {
      id: /^[A-Za-z0-9]{22}$/.test(String(track.id || "")) ? String(track.id) : "",
      uri: /^spotify:track:[A-Za-z0-9]{22}$/.test(String(track.uri || "")) ? String(track.uri) : "",
      name: track.name.slice(0, 200), artists: track.artists.slice(0, 300),
      album: String(track.album || "").slice(0, 200), image: /^https:\/\//.test(track.image || "") ? track.image.slice(0, 2000) : "",
      duration_ms: Math.max(0, Math.min(Number(track.duration_ms) || 0, 24 * 60 * 60 * 1000)),
      progress_ms: Math.max(0, Math.min(Number(track.progress_ms) || 0, 24 * 60 * 60 * 1000)),
      is_playing: Boolean(track.is_playing), updated_at: Date.now()
    };
    roomTracks.set(socket.data.room, safeTrack);
    socket.to(socket.data.room).emit("track-update", safeTrack);
  });

  socket.on("profile-update", payload => {
    if (!socket.data.room || !payload || !payload.profile) return;
    const name = String(payload.profile.name || "Ouvinte").trim().split(" ").filter(Boolean).join(" ").slice(0, 24) || "Ouvinte";
    const avatar = String(payload.profile.avatar || "");
    const comma = avatar.indexOf(",");
    const prefix = comma >= 0 ? avatar.slice(0, comma + 1) : "";
    const allowedImage = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "data:image/gif;base64,"].includes(prefix);
    const safeAvatar = avatar.length <= 220000 && allowedImage && comma < avatar.length - 1 ? avatar : "";
    const motto = String(payload.profile.motto || "").trim().replace(/\s+/g, " ").slice(0, 90);
    const profile = { name, avatar: safeAvatar, motto };
    socket.data.profile = profile;
    socket.to(socket.data.room).emit("profile-update", { id: socket.id, profile });
    if (socket.data.isTransmitting) {
      const transmitter = { id: socket.id, name: profile.name };
      roomTransmitters.set(socket.data.room, transmitter);
      io.to(socket.data.room).emit("transmitter-update", { ...transmitter, active: true });
    }
  });

  socket.on("chat-send", payload => {
    if (isRateLimited(socket, "chat-send", 8, 5_000)) {
      socket.emit("chat-rate-limit");
      return;
    }
    const room = socket.data.room;
    if (!room || !payload || typeof payload.text !== "string") return;
    const text = payload.text.trim().slice(0, 500);
    if (!text) return;
    const profile = socket.data.profile || { name: "Ouvinte", avatar: "" };
    const message = {
      room,
      name: String(profile.name || "Ouvinte").slice(0, 24),
      avatar: typeof profile.avatar === "string" && profile.avatar.length <= 220000 ? profile.avatar : "",
      text,
      time: Date.now()
    };
    const history = roomChatMessages.get(room) || [];
    history.push(message);
    if (history.length > 50) history.splice(0, history.length - 50);
    roomChatMessages.set(room, history);
    io.to(room).emit("chat-message", message);
  });

  socket.on("suggestion-settings", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    socket.data.receiveMusicSuggestions = Boolean(payload.enabled);
  });

  socket.on("music-suggestion", async payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    const suggestion = String(payload.suggestion || "").trim().slice(0, 180);
    if (!suggestion || isRateLimited(socket, "music-suggestion", 5, 60000)) return;
    try {
      if (!(await findRealSong(suggestion))) {
        socket.emit("music-suggestion-error", { error: "Sugestão recusada: não encontrei uma música com esse título exato." });
        return;
      }
    } catch (_) {
      socket.emit("music-suggestion-error", { error: "Não foi possível verificar a música agora. Tente novamente." });
      return;
    }
    const peer = io.sockets.sockets.get(socket.id);
    const fromName = String(payload.fromName || peer?.data.profile?.name || "Ouvinte").trim().slice(0, 24) || "Ouvinte";
    const roomMembers = io.sockets.adapter.rooms.get(socket.data.room) || new Set();
    for (const id of roomMembers) {
      if (id === socket.id) continue;
      const recipient = io.sockets.sockets.get(id);
      if (recipient?.data.receiveMusicSuggestions) {
        recipient.emit("music-suggestion", { suggestion, fromName });
      }
    }
  });

  socket.on("room-command", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    socket.to(socket.data.room).emit("room-command", { command: payload.command });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;
    if (roomTransmitters.get(room)?.id === socket.id) {
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update", { id: socket.id, active: false });
    }
    socket.to(room).emit("peer-left", { id: socket.id });
    const roomSet = io.sockets.adapter.rooms.get(room);
    io.to(room).emit("room-count", { count: roomSet ? roomSet.size : 0 });
  });
});

server.listen(PORT, () => console.log(`Junto.fm rodando na porta ${PORT}`));
