"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
module.exports = function staticBandwidth(app, root) {
  const versions = Object.create(null);
  const compressed = new Map();
  function scan(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir,item.name);
      if (item.isDirectory()) { scan(file); continue; }
      const url = "/" + path.relative(root,file).split(path.sep).join("/");
      if (/\.(glb|gltf|fbx)$/i.test(file)) versions[url] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0,20);
      if (fs.existsSync(file+".gz") && fs.statSync(file+".gz").mtimeMs >= fs.statSync(file).mtimeMs) compressed.set(url,file);
    }
  }
  scan(root);
  const cache = (req, url) => versions[url] && req.query.assetv === versions[url]
    ? "public, max-age=31536000, immutable"
    : /\.(?:glb|gltf|fbx|png|jpe?g|webp|mp3|wav|ogg)$/i.test(url)
      ? "public, max-age=1800" : "public, max-age=0, must-revalidate";
  app.get("/asset-versions.json",(_req,res)=>res.set("Cache-Control","no-cache").json(versions));
  app.use((req,res,next)=>{
    if (!["GET","HEAD"].includes(req.method)) return next();
    let url;
    try { url=decodeURIComponent(req.path); } catch (_) { return next(); }
    if(url==="/")url="/index.html";
    const file=compressed.get(url);
    if(!file)return next();
    res.vary("Accept-Encoding");
    // Range requests keep the original representation and native Express support.
    if(req.headers.range || req.acceptsEncodings("gzip","identity")!=="gzip")return next();
    res.type(path.extname(file));
    res.set("Content-Encoding","gzip");
    res.set("Cache-Control",cache(req,url));
    res.sendFile(file+".gz",{cacheControl:false},error=>{if(error)next(error);});
  });
  app.use(express.static(root,{
    setHeaders(res,file) {
      const url="/"+path.relative(root,file).split(path.sep).join("/");
      res.setHeader("Cache-Control",cache(res.req,url));
      if(compressed.has(url))res.vary("Accept-Encoding");
    }
  }));
};
