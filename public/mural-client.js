/* Shared wall: immutable publications, private erasable draft, incremental sync. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    W = 1536,
    H = 1024,
    draft = $("draft"),
    pub = $("published"),
    viewport = $("viewport"),
    wall = $("wall");
  const ctx = draft.getContext("2d"),
    pc = pub.getContext("2d"),
    layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lc = layer.getContext("2d");
  let strokes = [],
    pendingId = crypto.randomUUID(),
    draftOwner = null,
    current = null,
    tool = "spray",
    scale = 1,
    cursor = "0",
    canDraw = false,
    isAdmin = false,
    accountId = null,
    busy = false,
    syncing = false,
    again = false,
    loaded = false,
    locked = false;
  const posts = new Map();
  const storageKey = "junto-mural-draft-v1";
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.strokes)) {
      strokes = saved.strokes;
      pendingId = saved.id || pendingId;
      draftOwner = saved.owner || null;
      locked = !!saved.locked;
    }
  } catch (_) {}
  function status(s) {
    $("status").textContent = s;
  }
  function save() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ id: pendingId, strokes, owner: draftOwner, locked }),
      );
    } catch (_) {
      status(
        "O navegador não conseguiu guardar o rascunho. Mantenha esta página aberta até publicar.",
      );
    }
  }
  function renderStroke(c, s) {
    c.save();
    c.globalCompositeOperation =
      s.tool === "erase" ? "destination-out" : "source-over";
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = s.width;
    if (s.tool === "spray") {
      c.globalAlpha = 0.45;
      c.shadowColor = s.color;
      c.shadowBlur = s.width * 0.65;
    }
    const pts = s.points;
    if (pts.length === 1) {
      c.beginPath();
      c.arc(pts[0][0], pts[0][1], s.width / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) c.lineTo(...pts[i]);
      c.stroke();
    }
    c.restore();
  }
  function renderDraft() {
    ctx.clearRect(0, 0, W, H);
    for (const s of strokes) renderStroke(ctx, s);
    if (current) renderStroke(ctx, current);
    $("undo").disabled = busy || locked || !strokes.length;
    $("clear").disabled = busy || locked || !strokes.length;
    $("publish").disabled =
      busy || !loaded || !canDraw || !strokes.some((s) => s.tool !== "erase");
  }
  function renderPosts() {
    pc.clearRect(0, 0, W, H);
    for (const p of [...posts.values()].sort(
      (a, b) => Number(a.revision) - Number(b.revision),
    )) {
      lc.clearRect(0, 0, W, H);
      for (const s of p.strokes) renderStroke(lc, s);
      pc.drawImage(layer, 0, 0);
    }
    $("count").textContent = posts.size + " marcas no muro";
    $("total").textContent = "(" + posts.size + ")";
    const list = $("authors");
    list.replaceChildren();
    for (const p of [...posts.values()].reverse()) {
      const li = document.createElement("li"),
        name = document.createElement("span"),
        date = document.createElement("small");
      name.textContent = p.author_name;
      date.textContent = new Date(p.created_at).toLocaleDateString("pt-BR");
      li.append(name, date);
      if (isAdmin) {
        const b = document.createElement("button");
        b.textContent = "Remover";
        b.onclick = async () => {
          if (!confirm("Remover esta publicação de " + p.author_name + "?"))
            return;
          b.disabled = true;
          try {
            await api("/api/mural/" + p.id, { method: "DELETE" });
            await sync();
          } catch (e) {
            status(e.message);
            b.disabled = false;
          }
        };
        li.append(b);
      }
      list.append(li);
    }
  }
  async function api(url, opts) {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      ...opts,
      headers: { "Content-Type": "application/json", ...opts?.headers },
    });
    const data = await r.json();
    if (!r.ok) {
      const e = Error(
        data.error || "Não foi possível concluir. Tente novamente.",
      );
      e.confirmedFailure = r.status < 500;
      throw e;
    }
    return data;
  }
  async function sync() {
    if (document.hidden) return;
    if (syncing) {
      again = true;
      return;
    }
    syncing = true;
    try {
      let more,
        changed = !loaded;
      do {
        const d = await api("/api/mural?after=" + cursor);
        changed = changed || d.items.length > 0 || isAdmin !== d.admin;
        canDraw = d.canDraw;
        isAdmin = d.admin;
        accountId = d.accountId;
        $("login").hidden = canDraw;
        for (const p of d.items) {
          if (p.deleted) posts.delete(p.id);
          else posts.set(p.id, p);
        }
        cursor = d.cursor;
        more = d.more;
      } while (more);
      if (changed) renderPosts();
      if (!loaded) {
        loaded = true;
        status(
          canDraw
            ? "O muro é seu. Escolha uma cor e deixe sua marca."
            : "Entre na sua conta para desenhar e publicar. Todos podem ver o muro.",
        );
      }
      renderDraft();
    } catch (e) {
      status(e.message);
    } finally {
      syncing = false;
      if (again) {
        again = false;
        sync();
      }
    }
  }
  function setScale(next) {
    const old = scale;
    scale = Math.max(viewport.clientWidth / W, Math.min(3, next));
    wall.style.width = W * scale + "px";
    wall.style.height = H * scale + "px";
    viewport.scrollLeft = (viewport.scrollLeft * scale) / old;
    viewport.scrollTop = (viewport.scrollTop * scale) / old;
  }
  $("fit").onclick = () => setScale(viewport.clientWidth / W);
  $("zoomIn").onclick = () => setScale(scale * 1.4);
  $("zoomOut").onclick = () => setScale(scale / 1.4);
  setScale(viewport.clientWidth / W);
  let lastWidth = viewport.clientWidth;
  new ResizeObserver(() => {
    const fitted = Math.abs(scale - lastWidth / W) < 0.02;
    lastWidth = viewport.clientWidth;
    if (fitted) setScale(lastWidth / W);
  }).observe(viewport);
  for (const b of document.querySelectorAll("[data-tool]"))
    b.onclick = () => {
      finish();
      tool = b.dataset.tool;
      draft.classList.toggle("moving", tool === "move");
      for (const x of document.querySelectorAll("[data-tool]"))
        x.setAttribute("aria-pressed", String(x === b));
    };
  $("width").oninput = () => ($("widthValue").value = $("width").value);
  function point(e) {
    const r = draft.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)),
      Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)),
    ];
  }
  let pointer = null,
    pan = null;
  draft.onpointerdown = (e) => {
    if (e.button !== 0 || pointer !== null) return;
    if (tool === "move") {
      if (e.pointerType === "mouse") {
        pan = {
          x: e.clientX,
          y: e.clientY,
          left: viewport.scrollLeft,
          top: viewport.scrollTop,
        };
        pointer = e.pointerId;
        draft.setPointerCapture(pointer);
      }
      return;
    }
    if (locked) {
      status(
        "Confirme a publicação anterior clicando em Publicar antes de continuar.",
      );
      return;
    }
    if (!canDraw || busy) {
      status("Entre na sua conta para desenhar.");
      return;
    }
    if (
      strokes.length >= 100 ||
      strokes.reduce((n, s) => n + s.points.length, 0) >= 2000
    ) {
      status("Publique esta parte antes de continuar.");
      return;
    }
    if (strokes.length && draftOwner && draftOwner !== accountId) {
      status(
        "Este rascunho pertence a outra conta. Entre nela ou limpe o rascunho.",
      );
      return;
    }
    draftOwner = accountId;
    pointer = e.pointerId;
    draft.setPointerCapture(pointer);
    current = {
      tool,
      color: $("color").value,
      width: Number($("width").value),
      points: [point(e)],
    };
    renderDraft();
  };
  draft.onpointermove = (e) => {
    if (e.pointerId !== pointer) return;
    if (pan) {
      viewport.scrollLeft = pan.left - (e.clientX - pan.x);
      viewport.scrollTop = pan.top - (e.clientY - pan.y);
      return;
    }
    if (!current) return;
    const p = point(e),
      prev = current.points.at(-1);
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 2) return;
    if (
      strokes.reduce((n, s) => n + s.points.length, 0) +
        current.points.length >=
      2000
    ) {
      finish();
      status("Limite desta publicação atingido. Publique para continuar.");
      return;
    }
    current.points.push(p);
    renderDraft();
  };
  function finish() {
    if (current) {
      strokes.push(current);
      current = null;
      save();
    }
    pointer = null;
    pan = null;
    renderDraft();
  }
  draft.onpointerup = finish;
  draft.onpointercancel = finish;
  draft.onlostpointercapture = finish;
  $("undo").onclick = () => {
    strokes.pop();
    pendingId = crypto.randomUUID();
    save();
    renderDraft();
  };
  $("clear").onclick = () => {
    if (!confirm("Limpar apenas seu rascunho?")) return;
    strokes = [];
    pendingId = crypto.randomUUID();
    draftOwner = accountId;
    save();
    renderDraft();
  };
  $("publish").onclick = async () => {
    finish();
    if (busy || !strokes.length) return;
    busy = true;
    renderDraft();
    status("Publicando sua marca…");
    try {
      await sync();
      if (draftOwner && draftOwner !== accountId)
        throw Error("Entre na conta que criou este rascunho para publicar.");
      locked = true;
      save();
      try {
        await api("/api/mural", {
          method: "POST",
          body: JSON.stringify({ id: pendingId, strokes }),
        });
      } catch (e) {
        if (e.confirmedFailure) {
          locked = false;
          save();
        }
        throw e;
      }
      locked = false;
      strokes = [];
      pendingId = crypto.randomUUID();
      save();
      await sync();
      status("Sua marca está no muro! Todo mundo já pode ver.");
    } catch (e) {
      status(e.message);
    } finally {
      busy = false;
      renderDraft();
    }
  };
  const socket = io("/mural", { autoConnect: false });
  socket.on("changed", sync);
  socket.on("connect", sync);
  socket.connect();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      finish();
      socket.disconnect();
    } else {
      socket.connect();
      sync();
    }
  });
  setInterval(() => {
    if (!document.hidden) sync();
  }, 15000);
  window.addEventListener("beforeunload", (e) => {
    if (strokes.length || current) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  renderDraft();
  sync();
})();
