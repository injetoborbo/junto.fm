"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../public/junto-tv.js"), "utf8");

test("seek do arquivo local só publica a posição depois do evento seeked", () => {
  const start = source.indexOf("  function seekLocal(seconds){");
  const end = source.indexOf('  $("jfTvLocalBack").onclick', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const seek = source.slice(start, end);
  assert.match(seek, /addEventListener\("seeked",finishSeek\)/);
  assert.match(seek, /localState\(\)/);
  assert.ok(seek.indexOf('addEventListener("seeked"') < seek.indexOf("video.currentTime=target"),
    "O listener precisa estar instalado antes de pedir a mudança de posição.");
});

test("estado local evita reenviar o mesmo snapshot de pausa/reprodução", () => {
  assert.match(source, /lastLocalStateSignature/);
  assert.match(source, /if\(signature===lastLocalStateSignature\)return/);
  assert.match(source, /lastLocalStateSignature="";renderLocal\(\)/);
});
