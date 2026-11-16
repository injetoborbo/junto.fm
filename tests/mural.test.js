"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { validateDrawing, setupMural } = require("../mural");
const drawing = () => [
  {
    tool: "brush",
    color: "#ff0011",
    width: 8,
    points: [
      [10, 20],
      [30, 40],
    ],
  },
];
test("mural validates bounds, tools, finite numbers and publication budgets", () => {
  assert.equal(validateDrawing(drawing()).length, 1);
  for (const strokes of [
    [],
    Array(101).fill(drawing()[0]),
    [{ ...drawing()[0], points: [[NaN, 0]] }],
    [{ ...drawing()[0], points: [[1537, 0]] }],
    [{ ...drawing()[0], points: Array(2001).fill([0, 0]) }],
    [{ ...drawing()[0], tool: "script" }],
    [{ ...drawing()[0], color: "url(x)" }],
  ])
    assert.throws(() => validateDrawing(strokes));
});
test(
  "mural database: parallel publications, retry, authorization, deletion cursor and reconnect",
  { skip: !process.env.PGLITE_TEST_MODULE && !process.env.TEST_DATABASE_URL },
  async () => {
    const express = require("express"),
      http = require("http"),
      { Server } = require("socket.io");
    let db, pool;
    if (process.env.PGLITE_TEST_MODULE) {
      const { PGlite } = require(process.env.PGLITE_TEST_MODULE);
      db = new PGlite();
      let tail = Promise.resolve();
      pool = {
        query: async (sql, args) => {
          await tail;
          return sql.includes("CREATE TABLE")
            ? db.exec(sql)
            : db.query(sql, args);
        },
        connect: async () => {
          const prev = tail;
          let unlock;
          tail = new Promise((r) => (unlock = r));
          await prev;
          return { query: (s, a) => db.query(s, a), release: unlock };
        },
      };
    } else {
      const { Pool } = require("pg");
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    }
    const a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      id1 = crypto.randomUUID(),
      id2 = crypto.randomUUID();
    await pool.query(
      "CREATE TABLE IF NOT EXISTS junto_accounts(id UUID PRIMARY KEY)",
    );
    await pool.query("INSERT INTO junto_accounts(id) VALUES($1),($2)", [a, b]);
    const app = express();
    app.use(express.json());
    const server = http.createServer(app),
      io = new Server(server);
    const accounts = {
      pool,
      ready: Promise.resolve(true),
      accountFromRequest: async (req) =>
        [a, b].includes(req.get("x-test-account"))
          ? { id: req.get("x-test-account"), nickname: "Autor" }
          : null,
    };
    const { ready } = setupMural(app, io, accounts, {
      isAdmin: (req) => req.get("x-test-admin") === "yes",
    });
    assert.equal(await ready, true);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const request = (method, path, body, account, admin = false) =>
      fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(account ? { "x-test-account": account } : {}),
          ...(admin ? { "x-test-admin": "yes" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    try {
      assert.equal(
        (await request("POST", "/api/mural", { id: id1, strokes: drawing() }))
          .status,
        401,
      );
      const results = await Promise.all([
        request("POST", "/api/mural", { id: id1, strokes: drawing() }, a),
        request("POST", "/api/mural", { id: id2, strokes: drawing() }, b),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [201, 201],
      );
      let initial = await (await request("GET", "/api/mural")).json();
      assert.equal(initial.items.length, 2);
      assert.equal(initial.canDraw, false);
      assert.equal(
        (
          await request(
            "POST",
            "/api/mural",
            { id: id1, strokes: drawing() },
            a,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "POST",
            "/api/mural",
            { id: crypto.randomUUID(), strokes: drawing() },
            a,
          )
        ).status,
        429,
      );
      assert.equal(
        (await request("DELETE", "/api/mural/" + id1, null, a)).status,
        403,
      );
      assert.equal(
        (await request("DELETE", "/api/mural/" + id1, null, null, true)).status,
        200,
      );
      const delta = await (
        await request("GET", "/api/mural?after=" + initial.cursor)
      ).json();
      assert.equal(delta.items.length, 1);
      assert.equal(delta.items[0].id, id1);
      assert.equal(delta.items[0].deleted, true);
      assert.deepEqual(delta.items[0].strokes, []);
      const reconnect = await (await request("GET", "/api/mural")).json();
      assert.equal(reconnect.items.filter((x) => !x.deleted).length, 1);
    } finally {
      await new Promise((r) => io.close(r));
      if (db) await db.close();
      else await pool.end();
    }
  },
);
