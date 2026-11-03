"use strict";
const crypto = require("node:crypto");
// Negotiate the compact format so already-open tabs keep the legacy payload.
module.exports = function sendChat(socket, event, payload) {
  if (socket.handshake?.auth?.chatAvatars !== 1) return socket.emit(event, payload);
  const avatars = Object.create(null);
  const seen = socket.data.chatAvatarIds || (socket.data.chatAvatarIds = new Set());
  const avatarReset = seen.size + (payload.messages?.length || 1) > 256;
  if (avatarReset) seen.clear();
  const compact = message => {
    const {avatar = "", ...rest} = message;
    if (!avatar) return {...rest, avatarId:""};
    const id = crypto.createHash("sha256").update(avatar).digest("hex");
    if (!seen.has(id)) {
      // Bounded per-connection state. Clearing only causes a harmless resend.
      seen.add(id);
      avatars[id] = avatar;
    }
    return {...rest, avatarId:id};
  };
  const result = event === "chat-history"
    ? {...payload, messages:payload.messages.map(compact)} : compact(payload);
  socket.emit(event, {...result, avatars, avatarReset});
};
