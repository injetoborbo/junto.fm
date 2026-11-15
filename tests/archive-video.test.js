"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {archiveRequest,resolveArchiveVideo}=require("../archive-video");
const mock=files=>async(url,options)=>{assert.ok(url.startsWith("https://archive.org/metadata/"));assert.equal(options.redirect,"error");return{ok:true,text:async()=>JSON.stringify({files:files.map(name=>({name}))})};};
test("Converte todos os episódios usando os nomes reais e a versão H.264",async()=>{
 const files=Array.from({length:37},(_,i)=>`Episode ${String(i+1).padStart(2,"0")} - Title.ia.mp4`);
 for(let i=1;i<=37;i++){
  const name=`Episode ${String(i).padStart(2,"0")} - Title.mp4`;
  const request=archiveRequest("https://archive.org/details/series/"+name.replace(/ /g,"+"));
  const result=await resolveArchiveVideo(request,mock(files));
  assert.equal(result.url,"https://archive.org/download/series/"+encodeURIComponent(name.replace(/\.mp4$/,".ia.mp4")));
  assert.equal(result.format,"direct");
 }
});
test("Preserva + literal, aceita download e não inventa derivado ausente",async()=>{
 const request=archiveRequest("https://archive.org/download/series/A+B.mp4");
 assert.equal((await resolveArchiveVideo(request,mock(["A+B.mp4","A B.ia.mp4"]))).url,"https://archive.org/download/series/A%2BB.mp4");
});
test("Não troca silenciosamente de episódio nem aceita coleção sem arquivo",async()=>{
 assert.throws(()=>archiveRequest("https://archive.org/details/series"),/episódio/);
 await assert.rejects(resolveArchiveVideo({item:"series",filename:"missing.mp4"},mock(["other.ia.mp4"])),/não foi encontrado/);
 assert.equal(archiveRequest("https://other.example/video.mp4"),null);
});
