"use strict";
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const root=path.join(__dirname,"../public");
let before=0,after=0,count=0;
function scan(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory()){scan(file);continue;}
    if(!/\.(?:glb|gltf|fbx|js|mjs|css|html|svg|json)$/i.test(file))continue;
    const source=fs.readFileSync(file),gz=zlib.gzipSync(source,{level:9});
    if(source.length>=1024&&gz.length<source.length*.9){
      fs.writeFileSync(file+".gz",gz);before+=source.length;after+=gz.length;count++;
    }else if(fs.existsSync(file+".gz"))fs.unlinkSync(file+".gz");
  }
}
scan(root);
console.log(JSON.stringify({files:count,originalBytes:before,gzipBytes:after,savedBytes:before-after}));
