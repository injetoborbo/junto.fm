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

    // Avisa os outros na sala que um novo peer chegou, enviando o id deste socket
    socket.to(safeRoom).emit("peer-joined", { peerId: socket.id });
    
    // Envia para quem entrou a lista de quem já está na sala
    const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(safeRoom) || []).filter(id => id !== socket.id);
    socket.emit("room-users", { users: clientsInRoom });
    
    socket.emit("joined-room", { room: safeRoom });
  });

  // Sinalização WebRTC direcionada (de um socket específico para outro específico)
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("room-command", ({ room, command }) => {
    if (socket.data.room && socket.data.room === room) {
      socket.to(room).emit("room-command", { command });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit("peer-left", { peerId: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Junto.fm a rodar em http://localhost:${PORT}`);
});