const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  socket.on("join-room", ({ room }) => {
    const safeRoom = String(room || "noite").trim().slice(0, 40) || "noite";
    socket.join(safeRoom);
    socket.data.room = safeRoom;
    socket.to(safeRoom).emit("peer-ready");
    socket.emit("joined-room", { room: safeRoom });
  });

  socket.on("signal", ({ room, data }) => {
    if (socket.data.room && socket.data.room === room) {
      socket.to(room).emit("signal", data);
    }
  });

  socket.on("room-command", ({ room, command }) => {
    if (socket.data.room && socket.data.room === room) {
      socket.to(room).emit("room-command", { command });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.room) socket.to(socket.data.room).emit("peer-left");
  });
});

server.listen(PORT, () => {
  console.log(`Junto.fm rodando em http://localhost:${PORT}`);
});
