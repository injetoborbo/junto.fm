"use strict";
const path = require("node:path");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateDrawing(strokes) {
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 100)
    throw Error("Use de 1 a 100 traços por publicação.");
  let total = 0;
  return strokes.map((s) => {
    if (
      !s ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !["brush", "spray", "erase"].includes(s.tool) ||
      !Number.isFinite(s.width) ||
      s.width < 1 ||
      s.width > 60 ||
      !Array.isArray(s.points) ||
      !s.points.length
    )
      throw Error("Traço inválido.");
    total += s.points.length;
    if (total > 2000)
      throw Error(
        "Desenho muito grande. Publique esta parte antes de continuar.",
      );
    const points = s.points.map((p) => {
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        p[0] < 0 ||
        p[0] > 1536 ||
        p[1] < 0 ||
        p[1] > 1024
      )
        throw Error("Ponto fora do muro.");
      return p.map((n) => Math.round(n * 10) / 10);
    });
    return { tool: s.tool, color: s.color, width: s.width, points };
  });
}
function setupMural(app, io, accounts, admin) {
  const pool = accounts.pool;
  const ready = accounts.ready
    .then(async (ok) => {
      if (!ok || !pool) return false;
      await pool.query(`CREATE TABLE IF NOT EXISTS junto_mural (
      id UUID PRIMARY KEY, author_id UUID NOT NULL REFERENCES junto_accounts(id),
      author_name VARCHAR(24) NOT NULL, strokes JSONB NOT NULL,
      revision BIGSERIAL UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted BOOLEAN NOT NULL DEFAULT FALSE
    ); CREATE INDEX IF NOT EXISTS junto_mural_author_date ON junto_mural(author_id,created_at);`);
      return true;
    })
    .catch((e) => {
      console.error("Mural:", e.message);
      return false;
    });
  const ns = io.of("/mural");
  app.get("/mural", (_req, res) =>
    res
      .set("Cache-Control", "no-cache")
      .sendFile(path.join(__dirname, "public/mural.html")),
  );
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!(await ready))
        return res
          .status(503)
          .json({
            error:
              "O mural está temporariamente indisponível. Seu rascunho continua neste navegador.",
          });
      await fn(req, res);
    } catch (e) {
      console.error("Mural:", e.message);
      res
        .status(500)
        .json({
          error:
            "Não foi possível salvar ou carregar. Tente novamente; seu rascunho foi mantido.",
        });
    }
  };
  function sameOrigin(req, res) {
    const origin = req.get("origin");
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        origin !== `${req.protocol}://${req.get("host")}` &&
        origin !== `https://${req.get("host")}`)
    ) {
      res.status(403).json({ error: "Abra o mural pelo próprio site." });
      return false;
    }
    return true;
  }
  app.get(
    "/api/mural",
    wrap(async (req, res) => {
      const after = String(req.query.after || "0");
      if (!/^\d{1,15}$/.test(after))
        return res.status(400).json({ error: "Cursor inválido." });
      const result = await pool.query(
        "SELECT id,author_name,strokes,revision::text,created_at,deleted FROM junto_mural WHERE revision>$1 ORDER BY revision LIMIT 30",
        [after],
      );
      const account = await accounts.accountFromRequest(req);
      res.json({
        items: result.rows,
        cursor: result.rows.at(-1)?.revision || after,
        more: result.rows.length === 30,
        canDraw: !!account,
        admin: admin.isAdmin(req),
        accountId: account?.id || null,
      });
    }),
  );
  app.post(
    "/api/mural",
    wrap(async (req, res) => {
      if (!sameOrigin(req, res)) return;
      const account = await accounts.accountFromRequest(req);
      if (!account)
        return res
          .status(401)
          .json({
            error: "Entre na sua conta para publicar. Seu desenho foi mantido.",
          });
      const id = req.body?.id;
      if (typeof id !== "string" || !UUID.test(id))
        return res.status(400).json({ error: "Identificador inválido." });
      let strokes;
      try {
        strokes = validateDrawing(req.body.strokes);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize revisions through commit: a polling cursor can never skip an uncommitted drawing.
        await client.query("SELECT pg_advisory_xact_lock(746321)");
        const duplicate = await client.query(
          "SELECT author_id FROM junto_mural WHERE id=$1",
          [id],
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return res
            .status(duplicate.rows[0].author_id === account.id ? 200 : 409)
            .json({ ok: duplicate.rows[0].author_id === account.id });
        }
        const recent = await client.query(
          "SELECT 1 FROM junto_mural WHERE author_id=$1 AND created_at>NOW()-INTERVAL '15 seconds' LIMIT 1",
          [account.id],
        );
        if (recent.rowCount) {
          await client.query("ROLLBACK");
          return res
            .status(429)
            .json({ error: "Espere 15 segundos entre publicações." });
        }
        const count = await client.query(
          "SELECT count(*)::int AS total FROM junto_mural WHERE NOT deleted",
        );
        if (count.rows[0].total >= 500) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({
              error:
                "Este muro está cheio. O administrador precisa liberar espaço.",
            });
        }
        await client.query(
          "INSERT INTO junto_mural(id,author_id,author_name,strokes) VALUES($1,$2,$3,$4)",
          [
            id,
            account.id,
            String(account.nickname || "Macaco").slice(0, 24),
            JSON.stringify(strokes),
          ],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      ns.emit("changed");
      res.status(201).json({ ok: true, id });
    }),
  );
  app.delete(
    "/api/mural/:id",
    wrap(async (req, res) => {
      if (!sameOrigin(req, res)) return;
      if (!admin.isAdmin(req))
        return res
          .status(403)
          .json({ error: "Somente o administrador pode remover publicações." });
      if (!UUID.test(req.params.id))
        return res.status(400).json({ error: "Identificador inválido." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(746321)");
        await client.query(
          "UPDATE junto_mural SET deleted=TRUE,strokes='[]'::jsonb,revision=nextval(pg_get_serial_sequence('junto_mural','revision')) WHERE id=$1 AND NOT deleted",
          [req.params.id],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      ns.emit("changed");
      res.json({ ok: true });
    }),
  );
  return { ready };
}
module.exports = { setupMural, validateDrawing };
