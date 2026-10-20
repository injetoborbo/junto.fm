"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const createJuntoTv = require("../junto-tv-server");

function setup() {
  const messages = [];
  const io = {
    listeners: [],
    on(event, cb) { if (event === "connection") this.listeners.push(cb); },
    to(room) { return { emit(event, payload) { messages.push({ room, event, payload }); } }; },
    sockets: { sockets: new Map() }
  };
  const api = createJuntoTv(io, (socket, room) =>
    socket.id === "owner" && socket.data.room === room, () => false);
  const connect = id => {
    const socket = {
      id, data: { room: "teste" }, callbacks: new Map(), outgoing: [],
      on(event, cb) { this.callbacks.set(event, cb); },
      emit(event, payload) { this.outgoing.push({ event, payload }); },
      send(event, payload) {
        const cb = this.callbacks.get(event);
        assert.ok(cb, "Missing socket listener: " + event);
        cb(payload);
      }
    };
    io.sockets.sockets.set(id, socket);
    io.listeners.forEach(cb => cb(socket));
    return socket;
  };
  return { api, messages, connect };
}

test("Somente o dono define YouTube e controla play/pause", () => {
  const { api, connect } = setup();
  const owner = connect("owner"), guest = connect("guest");
  guest.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  assert.ok(guest.outgoing.some(e => e.event === "tv:error"));
  owner.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  guest.send("tv:control", { action: "play" });
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing, false);
  owner.send("tv:control", { action: "play" });
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload.playing, true);
});
test("Rejeita IDs do YouTube não verificados", () => {
  const { api, connect } = setup();
  const owner = connect("owner");
  owner.send("tv:set-youtube", { videoId: "https://attacker.example" });
  api.joined(owner);
  assert.equal(owner.outgoing.at(-1).payload, null);
});
test("Convida só espectadores autorizados para transmissão P2P", () => {
  const { connect, messages } = setup();
  const owner = connect("owner"), guest = connect("guest"), stranger = connect("stranger");
  owner.send("tv:start-stream", { mode: "screen" });
  guest.send("tv:watch");
  assert.ok(messages.some(e => e.room === "owner" && e.event === "tv:viewer-joined"));
  stranger.send("tv:signal", { to: "owner", data: { type: "answer", sdp: "v=0" } });
  assert.equal(owner.outgoing.some(e => e.event === "tv:signal"), false);
  owner.send("tv:signal", { to: "guest", data: { type: "offer", sdp: "v=0" } });
  assert.ok(guest.outgoing.some(e => e.event === "tv:signal"));
  guest.send("tv:unwatch");
  assert.ok(messages.some(e => e.room === "owner" && e.event === "tv:viewer-left"));
});
test("Limita streaming a quatro espectadores", () => {
  const { connect } = setup();
  const owner = connect("owner");
  owner.send("tv:start-stream", { mode: "local" });
  for (let i = 0; i < 4; i++) connect("viewer" + i).send("tv:watch");
  const fifth = connect("fifth");
  fifth.send("tv:watch");
  assert.ok(fifth.outgoing.some(e => e.event === "tv:error"));
});
test("Parar a TV e sair da sala limpam o estado", () => {
  const { api, connect } = setup();
  const owner = connect("owner"), guest = connect("guest");
  owner.send("tv:start-stream", { mode: "screen" });
  api.leave("teste", "owner");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
  owner.send("tv:set-youtube", { videoId: "dQw4w9WgXcQ" });
  api.joined(guest);
  assert.ok(guest.outgoing.at(-1).payload);
  owner.send("tv:stop");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
  owner.send("tv:start-stream", { mode: "local" });
  owner.send("tv:stop");
  api.joined(guest);
  assert.equal(guest.outgoing.at(-1).payload, null);
});
