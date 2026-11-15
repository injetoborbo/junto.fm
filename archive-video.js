"use strict";

function archiveRequest(raw) {
  const url = new URL(raw);
  if (!["archive.org", "www.archive.org"].includes(url.hostname)) return null;
  const parts = url.pathname.split("/");
  if (!["details", "download"].includes(parts[1])) return null;
  const item = decodeURIComponent(parts[2] || "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(item)) throw new Error("Identificador do Archive.org inválido.");
  const filename = decodeURIComponent(parts.slice(3).join("/"));
  if (!filename) throw new Error("Abra o episódio no Archive.org e cole o link dele, incluindo o nome do arquivo.");
  return { item, filename };
}

async function resolveArchiveVideo(request, fetchImpl = globalThis.fetch) {
  // Only metadata is fetched. Video remains a direct browser-to-Archive request.
  const response = await fetchImpl("https://archive.org/metadata/" + encodeURIComponent(request.item), {
    signal: AbortSignal.timeout(8000), redirect: "error", headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Não foi possível consultar o Archive.org. Tente novamente em instantes.");
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error("A coleção do Archive.org é grande demais para consultar automaticamente.");
  const metadata = JSON.parse(text);
  if (metadata.is_dark || !Array.isArray(metadata.files)) throw new Error("Essa coleção do Archive.org não está disponível.");
  const files = new Set(metadata.files.filter(f => f.private !== true && f.private !== "true").map(f => f.name));
  // Preserve literal '+' when it is actually part of the filename. The theater
  // also shares paths with '+' standing for spaces, unlike direct download URLs.
  const names = [request.filename, request.filename.replace(/\+/g, " ")];
  for (const name of names) {
    const derivative = /(?<!\.ia)\.mp4$/i.test(name) ? name.replace(/\.mp4$/i, ".ia.mp4") : name;
    for (const candidate of [derivative, name]) {
      if (!files.has(candidate) || !/\.(mp4|webm|m3u8)$/i.test(candidate)) continue;
      return {
        url: "https://archive.org/download/" + encodeURIComponent(request.item) + "/" + candidate.split("/").map(encodeURIComponent).join("/"),
        format: /\.m3u8$/i.test(candidate) ? "hls" : "direct"
      };
    }
  }
  throw new Error("O episódio não foi encontrado nessa coleção. Copie o link do arquivo na lista de downloads do Archive.org.");
}
module.exports = { archiveRequest, resolveArchiveVideo };
