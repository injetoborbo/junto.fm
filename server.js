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
const roomSkipVotes=new Map();
const skipTickets=new Map();
const roomBananaCounts = new Map(); // 0 a 15 por sala
const roomBananaResetTimers = new Map();
const roomOwners = new Map();
const danceFloors = new Map(); // presença temporária por sala, no máximo 8 avatares // room -> socket ID do criador / sucessor
const roomChatMessages = new Map();
const roomAccess = new Map();
const roomQueueJobs = new Map(); // Serializa pedidos por sala; respeita a ordem de chegada.
const SPOTIFY_SCOPES = "user-read-currently-playing user-read-playback-state user-library-modify user-modify-playback-state";

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
// A sessão na memória some quando o Render reinicia. Um cookie criptografado
// permite restaurar somente a conexão Spotify deste navegador, sem expor tokens.
const spotifyCookieSecret=String(process.env.SPOTIFY_SESSION_SECRET||"");
const spotifyCookieKey=spotifyCookieSecret.length>=32
  ?crypto.createHash("sha256").update("junto.fm.spotify.v1:").update(spotifyCookieSecret).digest()
  :null;
if(!spotifyCookieKey)console.warn("Spotify: configure SPOTIFY_SESSION_SECRET (mín. 32 caracteres) para manter conexões após reinícios.");
const spotifyCookieAge=90*24*60*60;
function spotifySecureCookie(req){
  return req.secure||req.headers["x-forwarded-proto"]==="https"?"; Secure":"";
}
function appendSpotifyCookie(res,cookie){
  if(!res)return;
  const old=res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie",[...(Array.isArray(old)?old:old?[old]:[]),cookie]);
}
function saveSpotifyCookie(req,res,session){
  if(!spotifyCookieKey||!res||!session?.refreshToken)return;
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",spotifyCookieKey,iv);
  const data=Buffer.from(JSON.stringify({refreshToken:session.refreshToken,scope:session.scope||"",issued:Date.now()}));
  const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
  const token=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
  appendSpotifyCookie(res,"junto_spotify_restore="+token+"; HttpOnly; SameSite=Lax; Path=/; Max-Age="+spotifyCookieAge+spotifySecureCookie(req));
}
function restoreSpotifyCookie(req){
  if(!spotifyCookieKey)return null;
  const value=cookieValue(req,"junto_spotify_restore");
  if(!value||value.length>4000)return null;
  try{
    const raw=Buffer.from(value,"base64url");
    if(raw.length<30)return null;
    const decipher=crypto.createDecipheriv("aes-256-gcm",spotifyCookieKey,raw.subarray(0,12));
    decipher.setAuthTag(raw.subarray(12,28));
    const payload=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString("utf8"));
    if(typeof payload.refreshToken!=="string"||!payload.refreshToken||!Number.isFinite(payload.issued)||Date.now()-payload.issued>spotifyCookieAge*1000)return null;
    return {refreshToken:payload.refreshToken,scope:String(payload.scope||""),expiresAt:0};
  }catch{return null;}
}
function getSession(req, res, create = false) {
  let id=cookieValue(req,"junto_spotify_session");
  let session=id&&spotifySessions.get(id);
  if(!session){
    session=restoreSpotifyCookie(req);
    if(session){
      if(!id)id=crypto.randomBytes(24).toString("hex");
      spotifySessions.set(id,session);
      if(res)appendSpotifyCookie(res,"junto_spotify_session="+id+"; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000"+spotifySecureCookie(req));
    }
  }
  if(!session&&create){
    id=crypto.randomBytes(24).toString("hex");
    session={};
    spotifySessions.set(id,session);
    appendSpotifyCookie(res,"junto_spotify_session="+id+"; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000"+spotifySecureCookie(req));
  }
  if(session?.refreshToken&&res)saveSpotifyCookie(req,res,session);
  return session||null;
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
async function validSpotifyAccessToken(session, req=null, res=null) {
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
  if(req&&res)saveSpotifyCookie(req,res,session);
  return session.accessToken;
}

app.use(express.json({ limit: "320kb" }));
const adminAuth = require("./admin-auth")(app);
const accountAuth = require("./account-auth")(app);
const achievements=require("./achievements")(app,io,accountAuth);
require("./listening-leaderboard")(app,io,roomTransmitters,accountAuth.ready);
// GLBs grandes e imagens mudam menos que a interface. Cache curto evita
// baixar o mesmo mascote novamente em cada visita, sem congelar atualizações.
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (/\.(?:glb|gltf|png|jpe?g|webp|mp3|wav|ogg)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=1800");
    }
  }
}));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/room-status/:room",(req,res)=>{
 const room=String(req.params.room||"");
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(room))return res.status(400).json({exists:false});
 res.set("Cache-Control","no-store");
 return res.json({exists:roomAccess.has(room),passwordProtected:!!roomAccess.get(room)});
});
app.get("/:room",(req,res,next)=>{
 const room=String(req.params.room||"");
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(room)||["api","auth","spotify","socket.io","health"].includes(room.toLowerCase()))return next();
 res.set("Cache-Control","no-cache");
 return res.sendFile(path.join(__dirname,"public","index.html"));
});

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
  res.json({ configured: Boolean(SPOTIFY_CLIENT_ID), connected: Boolean(getSession(req, res)?.refreshToken) });
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
    session.scope = tokens.scope || "";
    session.refreshToken = tokens.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
    saveSpotifyCookie(req,res,session);
    res.redirect("/?spotify=connected");
  } catch (err) {
    console.error("Erro no OAuth Spotify:", err.message);
    res.status(502).send("Não foi possível conectar ao Spotify. Confira o Client ID e a Redirect URI e tente novamente.");
  }
});
app.post("/api/spotify/logout", (req, res) => {
  const id = cookieValue(req, "junto_spotify_session");
  if (id) spotifySessions.delete(id);
  appendSpotifyCookie(res,"junto_spotify_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"+spotifySecureCookie(req));
  appendSpotifyCookie(res,"junto_spotify_restore=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"+spotifySecureCookie(req));
  res.json({ ok: true });
});
app.post("/api/spotify/skip",async(req,res)=>{
  const ticket=String(req.body?.ticket||"");
  const room=String(req.body?.room||"");
  const entry=skipTickets.get(room);
  if(!/^[a-f0-9]{48}$/.test(ticket)||!entry||entry.ticket!==ticket||entry.expires<Date.now()
     ||roomTransmitters.get(room)?.id!==entry.djId)
    return res.status(403).json({error:"Skip não autorizado pela votação."});
  // Token de uso único: impede repetição da requisição.
  skipTickets.delete(room);
  try{
    const token=await validSpotifyAccessToken(getSession(req,res),req,res);
    const response=await fetch("https://api.spotify.com/v1/me/player/next",{method:"POST",headers:{Authorization:"Bearer "+token}});
    if(!response.ok)return res.status(response.status).json({error:"Spotify não autorizou pular a faixa."});
    return res.json({ok:true});
  }catch(error){return res.status(401).json({error:"Conecte o Spotify para pular a faixa."});}
});
app.post("/api/spotify/save-track", async (req, res) => {
  try {
    if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: "Spotify ainda não foi configurado pelo administrador." });
    const uri = String(req.body && req.body.uri || "").trim();
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) return res.status(400).json({ error: "Não consegui identificar esta faixa do Spotify." });
    const token = await validSpotifyAccessToken(getSession(req, res),req,res);
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
    const token = await validSpotifyAccessToken(getSession(req, res),req,res);
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

// Os pedidos dos ouvintes são processados com o token do transmissor,
// nunca com uma credencial fornecida pelo ouvinte.
async function findSpotifyQueueTrack(token, suggestion) {
  const parts = suggestion.split(/\s+[—–-]\s+/);
  const title = normalizeMusicText(parts[0]);
  const artist = parts.length > 1 ? normalizeMusicText(parts.slice(1).join(" ")) : "";
  const endpoint = new URL("https://api.spotify.com/v1/search");
  endpoint.search = new URLSearchParams({ q: [parts[0],parts.slice(1).join(" ")].filter(Boolean).join(" "), type: "track", limit: "10", market: "BR" }).toString();
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) {
    if (response.status === 403) throw new Error("O aplicativo Spotify não tem acesso à busca de faixas. Confira as permissões da integração.");
    if (response.status === 429) throw new Error("O Spotify limitou as consultas. Tente novamente em instantes.");
    // Não expor tokens, apenas uma mensagem útil do endpoint.
    const detail=await response.json().catch(()=>({}));
    console.warn("Busca Spotify recusada:",response.status,String(detail.error?.message||"").slice(0,120));
    if(response.status===400)throw new Error("O Spotify recusou a pesquisa da faixa. Tente novamente; se persistir, reconecte o Spotify.");
    throw new Error("Não consegui consultar o catálogo do Spotify (HTTP "+response.status+").");
  }
  const body = await response.json();
  const tracks=(body.tracks?.items||[]).filter(track=>/^spotify:track:[A-Za-z0-9]{22}$/.test(track.uri||""));
  const exact=tracks.find(track=>normalizeMusicText(track.name)===title&&
    (!artist||(track.artists||[]).some(person=>normalizeMusicText(person.name)===artist)));
  if(exact)return exact;
  // Aceitar variações de remaster, ao vivo e sufixos quando o artista coincide.
  // Nunca escolher faixa só pela posição no resultado: exigir correspondência.
  return tracks.find(track=>{
    const name=normalizeMusicText(track.name);
    const artistMatch=!artist||(track.artists||[]).some(person=>{
      const n=normalizeMusicText(person.name);
      return n===artist||n.includes(artist)||artist.includes(n);
    });
    return artistMatch&&(name===title||name.startsWith(title+" ")||title.startsWith(name+" "));
  })||null;
}
async function addSpotifyQueueTrack(token, uri) {
  const endpoint = new URL("https://api.spotify.com/v1/me/player/queue");
  endpoint.searchParams.set("uri", uri);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const message = body.error?.message || "";
  if (response.status === 403) throw new Error("O Spotify recusou a fila. O DJ precisa de Premium e autorizar o controle de reprodução. Reconecte o Spotify.");
  if (response.status === 404) throw new Error("Nenhum dispositivo Spotify ativo. Abra o Spotify do DJ e inicie a reprodução antes de pedir.");
  if (response.status === 429) throw new Error("O Spotify limitou os pedidos. Aguarde um pouco.");
  throw new Error("Não foi possível adicionar à fila do Spotify (HTTP " + response.status + "). " + message.slice(0, 100));
}

// Busca pública para sugerir faixas com nome e artista antes de confirmar.
// Não acessa credenciais Spotify do usuário nem revela tokens do DJ.
app.get("/api/music/search", async (req,res)=>{
  const q=String(req.query.q||"").trim().slice(0,100);
  if(q.length<2)return res.json({tracks:[]});
  try{
    const endpoint=new URL("https://itunes.apple.com/search");
    endpoint.search=new URLSearchParams({term:q,entity:"song",media:"music",country:"BR",limit:"30"}).toString();
    const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw Error("Catálogo indisponível");
    const body=await response.json();
    const seen=new Set(),tracks=[];
    for(const item of body.results||[]){
      const title=String(item.trackName||"").trim().slice(0,150);
      const artist=String(item.artistName||"").trim().slice(0,120);
      if(!title||!artist)continue;
      const key=normalizeMusicText(title+" "+artist);
      if(seen.has(key))continue;seen.add(key);
      tracks.push({title,artist,album:String(item.collectionName||"").slice(0,100),artwork:String(item.artworkUrl100||"")});
      if(tracks.length>=12)break;
    }
    res.json({tracks});
  }catch(error){res.status(503).json({tracks:[],error:"Busca de músicas indisponível no momento."});}
});

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

// Guarda-roupa público: só peças comuns entram no perfil da sala.
// A skin Capitão Pátria permanece restrita ao fluxo de autenticação admin.
const wardrobeOptions = Object.freeze({
  hat: ["nenhum", "bone", "apocaliptico", "gorro", "palha", "branco", "caveira"],
  glasses: ["nenhum", "escuros", "redondos", "sem_aro"],
  headphones: ["nenhum", "azul", "rosa", "preto"],
  outfit: ["padrao", "rosa", "rosa_novo"]
});
function cleanWardrobe(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return Object.fromEntries(Object.entries(wardrobeOptions).map(([key, allowed]) =>
    [key, allowed.includes(source[key]) ? source[key] : allowed[0]]));
}

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

function isRoomOwner(socket,room){
  return Boolean(room&&roomOwners.get(room)===socket.id&&socket.data.room===room);
}
function releaseRoomOwnership(room,departingId){
  if(roomOwners.get(room)!==departingId)return;
  const members=[...(io.sockets.adapter.rooms.get(room)||[])].filter(id=>id!==departingId);
  if(members.length){
    roomOwners.set(room,members[0]);
    io.to(room).emit("room-owner-update",{ownerId:members[0]});
  }else{
    roomOwners.delete(room);
    roomAccess.delete(room);
    roomTracks.delete(room);
    roomChatMessages.delete(room);
    roomTomatoImpacts.delete(room);roomBananaCounts.delete(room);
    if(roomBananaResetTimers.has(room)){clearTimeout(roomBananaResetTimers.get(room));roomBananaResetTimers.delete(room);}roomSkipVotes.delete(room);skipTickets.delete(room);
  }
}
const juntoTv = require("./junto-tv-server")(io, isRoomOwner, isRateLimited);
io.use(async (socket,next)=>{
  try { socket.data.account=await accountAuth.accountFromRequest(socket.request); }
  catch(error){ console.warn("Conta na conexão:",error.message); socket.data.account=null; }
  next();
});
// Lounge no canto posterior da Junto Club: duas cadeiras frente a frente,
// mesinha no centro. Nunca gerar avatares ou permitir caminhada nos móveis.
const CLUB_SEATS=Object.freeze([{x:-3,z:-3},{x:-1,z:-3},{x:-3,z:0},{x:-1,z:0}]);
const CLUB_TABLES=Object.freeze([{x:-2,z:-3},{x:-2,z:0}]);
const isClubFurnitureTile=(x,z)=>
  CLUB_SEATS.some(seat=>seat.x===x&&seat.z===z)||
  CLUB_TABLES.some(table=>table.x===x&&table.z===z);
// Impactos recentes por sala, para evitar sobreposicao das explosoes.
const roomTomatoImpacts=new Map();
function danceSnapshot(room){
  return [...(danceFloors.get(room)||new Map()).entries()].map(([id,data])=>({id,...data}));
}
function danceLeave(room,id){
  const floor=danceFloors.get(room);
  if(!floor||!floor.delete(id))return;
  io.to(room).emit("dance-left",{id});
  if(!floor.size)danceFloors.delete(room);
}
io.on("connection", socket => {
  socket.on("dance-enter",()=>{
    const room=socket.data.room;
    if(!room)return socket.emit("dance-error",{message:"Entre numa sala de música primeiro."});
    let floor=danceFloors.get(room);
    if(!floor){floor=new Map();danceFloors.set(room,floor);}
    if(!floor.has(socket.id)&&floor.size>=8)return socket.emit("dance-error",{message:"Pista lotada! Máximo de 8 macacos dançando."});
    if(!floor.has(socket.id)){
      const taken=new Set([...floor.values()].map(v=>v.x+","+v.z));
      for(const seat of CLUB_SEATS)taken.add(seat.x+","+seat.z);
      for(const table of CLUB_TABLES)taken.add(table.x+","+table.z);
      let x=0,z=0;
      outer:for(let r=0;r<5;r++)for(let ix=0;ix<6;ix++)for(let iz=0;iz<6;iz++){
        if(Math.abs(ix-2.5)+Math.abs(iz-2.5)>r+2)continue;
        if(!taken.has(ix+","+iz)){x=ix;z=iz;break outer;}
      }
      const data={x,z,dance:"idle",seated:false};
      floor.set(socket.id,data);
      io.to(room).emit("dance-updated",{id:socket.id,...data});
    }
    socket.emit("dance-state",{room,participants:danceSnapshot(room)});
  });
  socket.on("dance-move",payload=>{
    const room=socket.data.room;
    const floor=room&&danceFloors.get(room);
    if(!floor?.has(socket.id))return;
    if(isRateLimited(socket,"dance-move",12,1000))return;
    const x=Number(payload?.x),z=Number(payload?.z);
    if(!Number.isInteger(x)||!Number.isInteger(z)||x< -4||x>9||z< -4||z>9)return;
    if(isClubFurnitureTile(x,z))
      return socket.emit("dance-error",{message:"Espaço do lounge: clique numa cadeira para sentar."});
    if([...floor].some(([id,p])=>id!==socket.id&&p.x===x&&p.z===z))
      return socket.emit("dance-error",{message:"Esse quadradinho já está ocupado."});
    const member=floor.get(socket.id);
    member.x=x;member.z=z;member.seated=false;
    io.to(room).emit("dance-updated",{id:socket.id,...member});
  });
  socket.on("dance-style",payload=>{
    const room=socket.data.room;
    const floor=room&&danceFloors.get(room);
    if(!floor?.has(socket.id))return;
    const dance=String(payload?.dance||"");
    if(!["idle","shake","macarena","party","capoeira","groove"].includes(dance))return;
    const member=floor.get(socket.id);
    member.dance=dance;
    if(dance!=="idle")member.seated=false;
    io.to(room).emit("dance-updated",{id:socket.id,...member});
  });
  // Duas cadeiras no lounge; a escolha e a ocupação são validadas no servidor.
  socket.on("dance-sit",payload=>{
    const room=socket.data.room;
    const floor=room&&danceFloors.get(room);
    if(!floor?.has(socket.id))return;
    if(isRateLimited(socket,"dance-sit",5,1000))return;
    // Cliente anterior sem ID continua usando a primeira cadeira.
    const seatId=payload?.seat??0;
    if(!Number.isInteger(seatId)||seatId<0||seatId>=CLUB_SEATS.length)return;
    const {x:seatX,z:seatZ}=CLUB_SEATS[seatId];
    if([...floor].some(([id,p])=>id!==socket.id&&p.x===seatX&&p.z===seatZ))
      return socket.emit("dance-error",{message:"Essa cadeira já está ocupada."});
    const member=floor.get(socket.id);
    member.x=seatX;member.z=seatZ;member.seated=true;member.dance="idle";
    io.to(room).emit("dance-updated",{id:socket.id,...member});
  });
  socket.on("dance-stand",()=>{
    const room=socket.data.room,floor=room&&danceFloors.get(room);
    if(!floor?.has(socket.id))return;
    const member=floor.get(socket.id);
    member.seated=false;
    io.to(room).emit("dance-updated",{id:socket.id,...member});
  });
  // Tomates são brincadeira visual: somente o transmissor atual pode ser alvo.
  // Nada de alvo arbitrário; o servidor valida sala, transmissão e cooldown.
  function emitSkip(room){
    const ids=io.sockets.adapter.rooms.get(room)||new Set();
    const state=roomSkipVotes.get(room)||{key:"",voters:new Set()};
    for(const id of state.voters)if(!ids.has(id))state.voters.delete(id);
    const total=ids.size,required=total===2?2:Math.max(2,Math.ceil(total/2));
    io.to(room).emit("skip-state",{votes:state.voters.size,total,required,approved:Boolean(state.approved)});
  }
  socket.on("skip-vote",()=>{
    const room=socket.data.room;if(!room)return;
    const track=roomTracks.get(room);
    if(!track?.is_playing||!roomTransmitters.has(room))return socket.emit("skip-error",{message:"Não há música tocando."});
    const key=track.id||track.uri||track.name+"|"+track.artists;
    const state=roomSkipVotes.get(room);
    if(!state||state.key!==key)roomSkipVotes.set(room,{key,voters:new Set(),approved:false});
    const current=roomSkipVotes.get(room);
    if(current.approved||current.voters.has(socket.id))return;
    current.voters.add(socket.id);
    const members=io.sockets.adapter.rooms.get(room)||new Set();
    const needed=members.size===2?2:Math.max(2,Math.ceil(members.size/2));
    if(current.voters.size>=needed){
      current.approved=true;
      const dj=roomTransmitters.get(room);
      if(dj?.id){
        const ticket=crypto.randomBytes(24).toString("hex");
        skipTickets.set(room,{ticket,key,expires:Date.now()+20000,djId:dj.id});
        io.to(dj.id).emit("skip-approved",{key,room,ticket});
      }
    }
    emitSkip(room);
  });
  socket.on("banana-throw",()=>{
    const room=socket.data.room;
    if(!room)return socket.emit("banana-error",{message:"Entre em uma sala primeiro."});
    if(isRateLimited(socket,"banana-throw",1,1200))return socket.emit("banana-error",{message:"Aguarde um pouco."});
    const old=roomBananaCounts.get(room)||0;
    if(old>=15)return socket.emit("banana-error",{message:"Barril cheio!"});
    const count=old+1;roomBananaCounts.set(room,count);
    io.to(room).emit("banana-thrown",{room,count,from:socket.id});
    if(count===15){
      const timer=setTimeout(()=>{
        roomBananaResetTimers.delete(room);
        if(roomBananaCounts.get(room)!==15)return;
        roomBananaCounts.set(room,0);
        io.to(room).emit("banana-reset",{room,count:0});
      },15000);
      roomBananaResetTimers.set(room,timer);
    }
  });
  socket.on("club-tomato",()=>{
    const room=socket.data.room;
    const dj=room&&roomTransmitters.get(room);
    const targetId=dj?.id;
    if(!room||!targetId)return socket.emit("club-tomato-error",{message:"Aguarde um DJ transmitir."});
    if(targetId===socket.id)return socket.emit("club-tomato-error",{message:"Você não pode jogar tomate em si mesmo."});
    if(!io.sockets.sockets.get(targetId)||io.sockets.sockets.get(targetId).data.room!==room)
      return socket.emit("club-tomato-error",{message:"O DJ saiu da sala."});
    if(isRateLimited(socket,"club-tomato",1,5000))
      return socket.emit("club-tomato-error",{message:"Espere 5 segundos para jogar outro tomate."});
    // O servidor sorteia a posição para todos verem exatamente o mesmo acerto.
    // Evita que arremessos seguidos acertem quase o mesmo pixel.
    const latest=roomTomatoImpacts.get(room)||[];
    const now=Date.now();
    const nearby=latest.filter(v=>now-v.time<3500).slice(-4);
    let hit;
    let bestDistance=-1;
    for(let attempt=0;attempt<24;attempt++){
      const candidate={x:.28+Math.random()*.44,y:.24+Math.random()*.48};
      const closest=nearby.length?Math.min(...nearby.map(v=>Math.hypot(candidate.x-v.x,candidate.y-v.y))):1;
      if(closest>bestDistance){hit=candidate;bestDistance=closest;}
      if(closest>=.18)break;
    }
    hit={x:Number(hit.x.toFixed(4)),y:Number(hit.y.toFixed(4))};
    roomTomatoImpacts.set(room,[...nearby,{...hit,time:now}].slice(-4));
    io.to(room).emit("club-tomato-fired",{from:socket.id,to:targetId,hit});
  });
  socket.on("dance-exit",()=>{if(socket.data.room)danceLeave(socket.data.room,socket.id);});

  // Um identificador por aba permite reconciliar sockets após reconexão.
  const rawClientId=socket.handshake.auth?.clientId;
  socket.data.clientId=typeof rawClientId==="string" && /^[a-zA-Z0-9_-]{16,90}$/.test(rawClientId)?rawClientId:null;
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
    if(["api","auth","spotify","socket.io","health"].includes(room.toLowerCase()))return socket.emit("create-room-error",{message:"Nome reservado."});
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
    roomOwners.set(room,socket.id);
    socket.emit("room-created", { room });
  });

  // Expulsão: somente o dono da sala pode remover OUTRA conexão.
  // Isso remove a pessoa da sala atual, não é banimento permanente.
  socket.on("room-kick", payload => {
    const room=socket.data.room;
    const targetId=typeof payload?.targetId==="string"?payload.targetId:"";
    if(!room || !isRoomOwner(socket,room)){
      socket.emit("room-kick-result",{ok:false,message:"Somente o dono da sala pode expulsar participantes."});
      return;
    }
    if(!targetId || targetId===socket.id){
      socket.emit("room-kick-result",{ok:false,message:"Escolha outro participante."});
      return;
    }
    const target=io.sockets.sockets.get(targetId);
    if(!target || target.data.room!==room){
      socket.emit("room-kick-result",{ok:false,message:"Participante não está mais nesta sala."});
      return;
    }
    // Remove primeiro do servidor para evitar que comandos atrasados continuem válidos.
    target.data.isTransmitting=false;
    target.data.receiveMusicSuggestions=false;
    target.data.room=null;
    juntoTv.leave(room,targetId);
    danceLeave(room,targetId);
    target.leave(room);
    if(roomTransmitters.get(room)?.id===targetId){
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update",{id:targetId,active:false});
    }
    target.emit("room-kicked",{room,message:"O administrador expulsou você desta sala."});
    io.to(room).emit("peer-left",{id:targetId});
    const count=io.sockets.adapter.rooms.get(room)?.size||0;
    io.to(room).emit("room-count",{count});
    socket.emit("room-kick-result",{ok:true,message:"Participante removido da sala."});
  });


  async function sendFriends(peer=socket){
    const account=peer.data.account;
    if(!account)return;
    const [friends,requests]=await Promise.all([accountAuth.friends(account.id),accountAuth.requests(account.id)]);
    const onlineRooms=new Map();
    for(const member of io.sockets.sockets.values()){
      if(member.data.account?.id&&member.data.room)onlineRooms.set(member.data.account.id,member.data.room);
    }
    peer.emit("friends-state",{friends:friends.map(f=>({...f,room:onlineRooms.get(f.id)||null})),requests});
  }
  async function notifyFriends(accountId){
    for(const member of io.sockets.sockets.values())
      if(member.data.account?.id===accountId)await sendFriends(member);
  }
  async function verifiedAccount(){
    // Logout revokes DB session immediately, including an already-connected socket.
    const current=await accountAuth.accountFromRequest(socket.request);
    if(!current)socket.data.account=null;
    return current;
  }
  function notifyPresence(){
    if(!socket.data.account)return;
    for(const member of io.sockets.sockets.values()){
      if(member.data.account?.id)sendFriends(member).catch(()=>{});
    }
  }
  socket.on("friends-list",async()=>{
    if(!await verifiedAccount())return socket.emit("friends-error",{message:"Entre com Google para usar amizades."});
    try{await sendFriends();}catch(error){socket.emit("friends-error",{message:"Falha ao carregar amizades."});}
  });
  socket.on("friend-request",async payload=>{
    const account=await verifiedAccount();
    if(!account)return socket.emit("friends-error",{message:"Visitantes não podem adicionar amigos. Entre com Google."});
    const target=io.sockets.sockets.get(String(payload?.targetId||""));
    if(!socket.data.room||!target||target.data.room!==socket.data.room||!target.data.account||target.data.account.id===account.id)
      return socket.emit("friends-error",{message:"O outro participante precisa estar cadastrado."});
    try{
      const result=await accountAuth.request(account.id,target.data.account.id);
      if(!result.ok)return socket.emit("friends-error",{message:result.error});
      await notifyFriends(target.data.account.id);
      await sendFriends();
      socket.emit("friends-notice",{message:"Solicitação enviada."});
    }catch(error){socket.emit("friends-error",{message:"Falha ao enviar solicitação."});}
  });
  socket.on("friend-request-response",async payload=>{
    const account=await verifiedAccount();
    if(!account)return socket.emit("friends-error",{message:"Entre com Google para responder."});
    const from=String(payload?.fromAccountId||"");
    if(!/^[0-9a-f-]{36}$/i.test(from))return;
    try{
      const found=await accountAuth.respond(account.id,from,Boolean(payload?.accepted));
      if(!found)return socket.emit("friends-error",{message:"Solicitação não encontrada."});
      await notifyFriends(from);await notifyFriends(account.id);
    }catch(error){socket.emit("friends-error",{message:"Falha ao responder."});}
  });
  socket.on("friend-remove",async payload=>{
    const account=await verifiedAccount();
    if(!account)return socket.emit("friends-error",{message:"Entre com Google para remover amigos."});
    const id=String(payload?.accountId||"");
    if(!/^[0-9a-f-]{36}$/i.test(id))return;
    try{await accountAuth.remove(account.id,id);await notifyFriends(id);await notifyFriends(account.id);}
    catch(error){socket.emit("friends-error",{message:"Falha ao remover."});}
  });
  socket.on("leave-room", payload => {
    const room = socket.data.room;
    if (!room || (payload && payload.room && payload.room !== room)) return;

    if (roomTransmitters.get(room)?.id === socket.id) {
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update", { id: socket.id, active: false });
    }
    socket.data.isTransmitting = false;
    juntoTv.leave(room,socket.id);
    danceLeave(room,socket.id);
    releaseRoomOwnership(room,socket.id);
    socket.leave(room);
    socket.data.room = null;
    socket.to(room).emit("peer-left", { id: socket.id });
    const roomSet = io.sockets.adapter.rooms.get(room);
    io.to(room).emit("room-count", { count: roomSet ? roomSet.size : 0 });
    socket.emit("left-room", { room });
    notifyPresence();
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
      juntoTv.leave(previousRoom,socket.id);
      danceLeave(previousRoom,socket.id);
      releaseRoomOwnership(previousRoom,socket.id);
      socket.leave(previousRoom);
      socket.to(previousRoom).emit("peer-left", { id: socket.id });
    }

    socket.join(room);
    socket.data.room = room;
    // Replace a stale connection from this very same browser tab.
    // This prevents a ghost profile from surviving a refresh/reconnect.
    if(socket.data.clientId){
      const roomMembers=[...(io.sockets.adapter.rooms.get(room)||[])];
      for(const oldId of roomMembers){
        if(oldId===socket.id)continue;
        const old=io.sockets.sockets.get(oldId);
        if(!old||old.data.clientId!==socket.data.clientId)continue;
        if(roomOwners.get(room)===oldId){
          roomOwners.set(room,socket.id);
          io.to(room).emit("room-owner-update",{ownerId:socket.id});
        }
        old.disconnect(true);
      }
    }
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])].filter(id => id !== socket.id);
    const profiles = Object.fromEntries(peers.map(id => {
      const peer = io.sockets.sockets.get(id);
      return [id, peer?.data.profile || { name: "Ouvinte", avatar: "" }];
    }));
    const avatarSkins=Object.fromEntries(peers.map(id=>[id,io.sockets.sockets.get(id)?.data.avatarSkin==="capitao-patria"?"capitao-patria":"default"]));
    const clientIds=Object.fromEntries(peers.map(id=>[id,io.sockets.sockets.get(id)?.data.clientId||null]));
    const registeredPeers=Object.fromEntries(peers.map(id=>[id,Boolean(io.sockets.sockets.get(id)?.data.account)]));
    socket.emit("joined-room", { room, peers, track: roomTracks.get(room) || null, profiles, avatarSkins, clientIds, registeredPeers, transmitter: roomTransmitters.get(room) || null, ownerId:roomOwners.get(room)||null, bananaCount:roomBananaCounts.get(room)||0 });
    emitSkip(room);
    juntoTv.joined(socket);
    socket.emit("chat-history", { messages: (roomChatMessages.get(room) || []).slice(-50) });
    socket.to(room).emit("peer-joined", { id: socket.id, clientId:socket.data.clientId, registered:Boolean(socket.data.account) });
    notifyPresence();
    io.to(room).emit("room-count", { count: (io.sockets.adapter.rooms.get(room) || new Set()).size });
  });

  socket.on("signal", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room || !payload.to || !payload.data) return;
    const target = io.sockets.sockets.get(payload.to);
    if (!target || target.data.room !== socket.data.room) return;
    if(payload.data.type==="offer" && (!isRoomOwner(socket,socket.data.room)||!socket.data.isTransmitting))return;
    target.emit("signal", { from: socket.id, data: payload.data });
  });

  socket.on("transmission-started", payload => {
    const room = socket.data.room;
    if (!room || !payload || payload.room !== room) return;
    if(!isRoomOwner(socket,room)){
      socket.emit("transmission-denied",{message:"Somente o administrador (dono) da sala pode transmitir o Spotify."});
      return;
    }
    const profile = socket.data.profile || { name: "DJ ao vivo" };
    const transmitter = { id: socket.id, name: String(profile.name || "DJ ao vivo").slice(0, 24) };
    socket.data.isTransmitting = true;
    roomTransmitters.set(room, transmitter);
    // A fila começa habilitada para DJs com Spotify autorizado, mas o próprio
    // DJ pode desativá-la. Não concedemos acesso a tokens de outros participantes.
    const spotifySession=getSession(socket.request,null);
    const wantsSuggestions=socket.data.wantsMusicSuggestions!==false;
    const hasScope=Boolean(spotifySession?.scope?.split(" ").includes("user-modify-playback-state"));
    socket.data.receiveMusicSuggestions=Boolean(wantsSuggestions&&spotifySession?.refreshToken&&hasScope);
    socket.emit("suggestion-settings-result",{
      enabled:socket.data.receiveMusicSuggestions,
      error:!wantsSuggestions?"":!spotifySession?.refreshToken
        ?"Conecte seu Spotify para receber pedidos automaticamente."
        :!hasScope?"Reconecte o Spotify para autorizar pedidos automáticos.":""
    });
    io.to(room).emit("transmitter-update", { ...transmitter, active: true });
  });

  socket.on("transmission-stopped", payload => {
    const room = socket.data.room;
    if (!room || !payload || payload.room !== room) return;
    socket.data.isTransmitting = false;
    socket.data.receiveMusicSuggestions=false;
    if (roomTransmitters.get(room)?.id === socket.id) {
      roomTransmitters.delete(room);
      io.to(room).emit("transmitter-update", { id: socket.id, active: false });
    }
  });

  socket.on("clear-track", payload => {
    if (!socket.data.room || !payload || payload.room !== socket.data.room) return;
    if(roomTransmitters.get(socket.data.room)?.id!==socket.id)return;
    roomTracks.delete(socket.data.room);
    roomSkipVotes.delete(socket.data.room);skipTickets.delete(socket.data.room);
    emitSkip(socket.data.room);
    socket.to(socket.data.room).emit("track-clear");
  });

  socket.on("track-update", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room || !payload.track) return;
    if(roomTransmitters.get(socket.data.room)?.id!==socket.id)return;
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
    const oldTrack=roomTracks.get(socket.data.room);
    if((oldTrack?.id||oldTrack?.name)!==(safeTrack.id||safeTrack.name)){roomSkipVotes.delete(socket.data.room);skipTickets.delete(socket.data.room);}
    roomTracks.set(socket.data.room, safeTrack);
    emitSkip(socket.data.room);
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
    const bubbleStyle=["classic","pink","blue","green","dark"].includes(payload.profile.bubbleStyle)?payload.profile.bubbleStyle:"classic";
    const profile = { name, avatar: safeAvatar, motto, bubbleStyle, wardrobe: cleanWardrobe(payload.profile.wardrobe) };
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
      time: Date.now(),
      senderId:socket.id,
      bubbleStyle:profile.bubbleStyle||"classic"
    };
    const history = roomChatMessages.get(room) || [];
    history.push(message);
    if (history.length > 50) history.splice(0, history.length - 50);
    roomChatMessages.set(room, history);
    io.to(room).emit("chat-message", message);
  });

  socket.on("suggestion-settings", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    const isRoomDJ = roomTransmitters.get(socket.data.room)?.id === socket.id && socket.data.isTransmitting;
    const wantsQueue = Boolean(payload.enabled);
    socket.data.wantsMusicSuggestions=wantsQueue;
    const session = getSession(socket.request, null);
    const hasQueueScope = Boolean(session?.scope?.split(" ").includes("user-modify-playback-state"));
    socket.data.receiveMusicSuggestions = Boolean(isRoomDJ && wantsQueue && session?.refreshToken && hasQueueScope);
    socket.emit("suggestion-settings-result", {
      enabled: socket.data.receiveMusicSuggestions,
      error: wantsQueue && !isRoomDJ ? "Comece a transmitir para ativar a fila automática." :
        wantsQueue && !session?.refreshToken ? "Conecte sua conta Spotify como DJ e tente novamente." :
        wantsQueue && !hasQueueScope ? "Desconecte e reconecte o Spotify para autorizar pedidos automáticos." : ""
    });
  });

  socket.on("music-suggestion", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    const suggestion = String(payload.suggestion || "").trim().slice(0, 180);
    const requestRoom = socket.data.room;
    if (!suggestion) return;
    if (isRateLimited(socket, "music-suggestion", 3, 60000)) {
      socket.emit("music-suggestion-error", { error: "Limite de três pedidos por minuto. Aguarde um pouco." });
      return;
    }
    const active = roomTransmitters.get(requestRoom);
    const dj = active && io.sockets.sockets.get(active.id);
    if (!dj || dj.data.room !== requestRoom || !dj.data.isTransmitting || !dj.data.receiveMusicSuggestions) {
      socket.emit("music-suggestion-error", { error: "O DJ ainda não ativou os pedidos automáticos." });
      return;
    }
    const previous = roomQueueJobs.get(requestRoom) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      // Revalida quem controla a transmissão antes de tocar no Spotify.
      if (roomTransmitters.get(requestRoom)?.id !== dj.id ||
          !dj.data.isTransmitting || !dj.data.receiveMusicSuggestions) {
        socket.emit("music-suggestion-error", { error: "A transmissão ou a fila do DJ foi desativada." });
        return;
      }
      try {
        const session = getSession(dj.request, null);
        if (!session?.refreshToken) throw new Error("O DJ precisa reconectar o Spotify.");
        if (session.scope && !session.scope.split(" ").includes("user-modify-playback-state"))
          throw new Error("O DJ precisa desconectar e reconectar o Spotify para autorizar a fila.");
        const token = await validSpotifyAccessToken(session);
        const track = await findSpotifyQueueTrack(token, suggestion);
        if (!track) throw new Error("Não encontrei a faixa exata no Spotify. Tente 'Música - Artista'.");
        await addSpotifyQueueTrack(token, track.uri);
        const fromName = String(socket.data.profile?.name || "Ouvinte").slice(0, 24);
        io.to(requestRoom).emit("music-queued", {
          title: track.name.slice(0, 180),
          artist: (track.artists || []).map(a => a.name).join(", ").slice(0, 120),
          fromName
        });
      } catch (err) {
        socket.emit("music-suggestion-error", { error: err.message || "Falha ao adicionar a música à fila." });
        console.warn("Pedido de música não enfileirado:", err.message);
      }
    });
    roomQueueJobs.set(requestRoom, task);
    task.finally(() => { if (roomQueueJobs.get(requestRoom) === task) roomQueueJobs.delete(requestRoom); });
  });

  socket.on("room-command", payload => {
    if (!payload || !socket.data.room || payload.room !== socket.data.room) return;
    socket.to(socket.data.room).emit("room-command", { command: payload.command });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;
    socket.data.room=null;
    juntoTv.leave(room,socket.id);
    danceLeave(room,socket.id);
    notifyPresence();
    releaseRoomOwnership(room,socket.id);
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
