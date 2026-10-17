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
const SPOTIFY_SCOPES = "user-read-currently-playing user-read-playback-state";

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

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

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
      item: { id: item.id, name: item.name, artists: (item.artists || []).map(a => a.name),
        album: item.album?.name || "", image: item.album?.images?.[0]?.url || "",
        duration_ms: item.duration_ms || 0, uri: item.uri || "" },
      fetched_at: Date.now()
    });
  } catch (err) {
    res.status(401).json({ error: err.message || "Erro ao consultar Spotify." });
  }
});

function cleanRoom(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

io.on("connection", socket => {
  socket.on("join-room", payload => {
    const room = cleanRoom(payload && payload.room);
    if (!room) {
      socket.emit("join-error", { message: "Digite um nome válido para a sala." });
      return;
    }

    const previousRoom = socket.data.room;
    if (previousRoom) {
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
    socket.emit("joined-room", { room, peers, track: roomTracks.get(room) || null, profiles });
    socket.to(room).emit("peer-joined", { id: socket.id });
    io.to(room).emit("room-count", { count: (io.sockets.adapter.rooms.get(room) || new Set()).size });
  });

  socket.on("signal", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room || !payload.to || !payload.data) return;
    const target = io.sockets.sockets.get(payload.to);
    if (!target || target.data.room !== socket.data.room) return;
    target.emit("signal", { from: socket.id, data: payload.data });
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
    const profile = { name, avatar: safeAvatar };
    socket.data.profile = profile;
    socket.to(socket.data.room).emit("profile-update", { id: socket.id, profile });
  });

  socket.on("suggestion-settings", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    socket.data.receiveMusicSuggestions = Boolean(payload.enabled);
  });

  socket.on("music-suggestion", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    const suggestion = String(payload.suggestion || "").trim().slice(0, 180);
    if (!suggestion) return;
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
    socket.to(room).emit("peer-left", { id: socket.id });
    const roomSet = io.sockets.adapter.rooms.get(room);
    io.to(room).emit("room-count", { count: roomSet ? roomSet.size : 0 });
  });
});

server.listen(PORT, () => console.log(`Junto.fm rodando na porta ${PORT}`));
