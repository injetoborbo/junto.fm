"use strict";
const crypto = require("crypto");
const ADMIN_GITHUB_ID = 343716655;
const sessions = new Map();
const states = new Map();
const TTL = 7 * 24 * 60 * 60 * 1000;
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim().split("=")).filter(x => x.length === 2));
}
function secure(req) { return req.secure || req.headers["x-forwarded-proto"] === "https"; }
function setCookie(res, req, value, age) {
  res.append("Set-Cookie", "junto_admin=" + value + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + age + (secure(req) ? "; Secure" : ""));
}
function origin(req) { return (req.headers["x-forwarded-proto"] || req.protocol) + "://" + req.get("host"); }
function session(req) {
  const token = cookies(req).junto_admin;
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
module.exports = function setupAdmin(app) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI;
  app.get("/api/admin/status", (req, res) => res.json({ configured: Boolean(clientId && clientSecret), admin: Boolean(session(req)), skin: session(req) ? "capitao-patria" : null }));
  app.get("/auth/github", (req, res) => {
    if (!clientId || !clientSecret) return res.status(503).send("Login administrativo não configurado.");
    const state = crypto.randomBytes(24).toString("hex");
    states.set(state, Date.now() + 10 * 60 * 1000);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri || origin(req) + "/auth/github/callback", state }).toString();
    res.redirect(url.toString());
  });
  app.get("/auth/github/callback", async (req, res) => {
    const state = String(req.query.state || "");
    const expiry = states.get(state);
    states.delete(state);
    if (!expiry || expiry < Date.now() || typeof req.query.code !== "string") return res.status(400).send("Autorização inválida.");
    try {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: req.query.code, redirect_uri: redirectUri || origin(req) + "/auth/github/callback" })
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error("Falha no token OAuth");
      const userResponse = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + data.access_token, Accept: "application/vnd.github+json", "User-Agent": "junto.fm" } });
      if (!userResponse.ok) throw new Error("Falha na identidade GitHub");
      const user = await userResponse.json();
      if (user.id !== ADMIN_GITHUB_ID) return res.status(403).send("Esta conta não é administradora.");
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, { expires: Date.now() + TTL });
      setCookie(res, req, token, TTL / 1000);
      res.redirect("/?admin=connected");
    } catch (error) { console.error("OAuth admin:", error.message); res.status(502).send("Não foi possível validar o login."); }
  });
  app.post("/api/admin/logout", (req, res) => {
    const token = cookies(req).junto_admin;
    if (token) sessions.delete(token);
    setCookie(res, req, "", 0);
    res.json({ ok: true });
  });
  app.post("/api/avatar/equip", (req, res) => {
    const skin = req.body && req.body.skin;
    if (skin === "capitao-patria" && !session(req)) return res.status(403).json({ error: "Skin exclusiva do administrador." });
    if (typeof skin !== "string" || !["default", "capitao-patria"].includes(skin)) return res.status(400).json({ error: "Skin inválida." });
    res.json({ ok: true, skin });
  });
  setInterval(() => {
    for (const [key, exp] of states) if (exp < Date.now()) states.delete(key);
    for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key);
  }, 60 * 60 * 1000).unref();
  return { isAdmin: req => Boolean(session(req)) };
};
