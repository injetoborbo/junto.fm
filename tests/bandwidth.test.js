"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),http=require("node:http"),zlib=require("node:zlib"),vm=require("node:vm");
const sendChat=require("../chat-bandwidth"),express=require("express"),installStatic=require("../static-bandwidth");
function socket(compact=true){return {handshake:{auth:{chatAvatars:compact?1:0}},data:{},sent:[],emit(event,payload){this.sent.push({event,payload});}};}
const photo="data:image/jpeg;base64,"+"x".repeat(30000);
const message={avatar:photo,text:"Olá",senderId:"a",name:"Ana",room:"teste",time:1};
function hydrate(){
 const source=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
 const code=source.slice(source.indexOf("  const jfChatAvatars="),source.indexOf("  socket.on(\"connect\"",source.indexOf("  const jfChatAvatars=")));
 return vm.runInNewContext(code+";hydrateChat");
}
test("chat preserves old tabs, restores photos for chat/dance and reduces repeated payloads",()=>{
 const old=socket(false),modern=socket(),decode=hydrate();
 sendChat(old,"chat-message",message);assert.deepEqual(old.sent[0].payload,message);
 sendChat(modern,"chat-message",message);sendChat(modern,"chat-message",{...message,text:"Segunda"});
 const first=modern.sent[0].payload,second=modern.sent[1].payload;
 assert.ok(JSON.stringify(second).length<JSON.stringify(message).length*.02);
 decode(first);decode(second);assert.equal(first.avatar,photo);assert.equal(second.avatar,photo);assert.equal(second.text,"Segunda");
 assert.equal(message.avatar,photo);
});
test("history deduplicates photos including disconnected users and preserves changed photos",()=>{
 const client=socket(),decode=hydrate();
 sendChat(client,"chat-history",{messages:[message,message,{...message,avatar:photo+"y"}]});
 const wire=client.sent[0].payload;assert.equal(Object.keys(wire.avatars).length,2);decode(wire);
 assert.deepEqual(wire.messages.map(m=>m.avatar),[photo,photo,photo+"y"]);
});
test("cache reset and reconnect resend all needed avatar data",()=>{
 const client=socket(),decode=hydrate();
 for(let i=0;i<600;i++){
   const original={...message,avatar:photo+i};sendChat(client,"chat-message",original);
   const wire=client.sent.at(-1).payload;decode(wire);assert.equal(wire.avatar,original.avatar);
   assert.ok(client.data.chatAvatarIds.size<=256);
 }
 const fresh=socket();sendChat(fresh,"chat-message",message);assert.equal(Object.values(fresh.sent[0].payload.avatars)[0],photo);
});
function get(port,url,headers={}){return new Promise((resolve,reject)=>{
 http.get({host:"127.0.0.1",port,path:url,headers},res=>{const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on("error",reject);
});}
test("HTTP compression is lossless, cache invalidates on model change, ranges and validators work",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"jf-static-"));
 const data=Buffer.from("glTF"+"model-data".repeat(500));
 fs.writeFileSync(path.join(root,"test.glb"),data);fs.writeFileSync(path.join(root,"test.glb.gz"),zlib.gzipSync(data));
 const app=express();installStatic(app,root);const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
 t.after(()=>{server.close();fs.rmSync(root,{recursive:true,force:true});});
 const port=server.address().port,manifest=JSON.parse((await get(port,"/asset-versions.json")).body),url="/test.glb?assetv="+manifest["/test.glb"];
 const gz=await get(port,url,{"Accept-Encoding":"gzip"});assert.equal(gz.headers["content-encoding"],"gzip");assert.deepEqual(zlib.gunzipSync(gz.body),data);assert.match(gz.headers["cache-control"],/immutable/);
 assert.equal((await get(port,url,{"Accept-Encoding":"gzip","If-None-Match":gz.headers.etag})).status,304);
 const plain=await get(port,url,{"Accept-Encoding":"identity"});assert.deepEqual(plain.body,data);assert.match(plain.headers.vary,/Accept-Encoding/);
 const range=await get(port,url,{"Accept-Encoding":"gzip",Range:"bytes=0-3"});assert.equal(range.status,206);assert.equal(range.headers["content-encoding"],undefined);assert.equal(range.body.toString(),"glTF");
 assert.doesNotMatch((await get(port,"/test.glb?assetv=old")).headers["cache-control"],/immutable/);
 fs.writeFileSync(path.join(root,"test.glb"),Buffer.from("new-model"));const changed=express();installStatic(changed,root);const updated=changed.listen(0,"127.0.0.1");await new Promise(r=>updated.once("listening",r));
 t.after(()=>updated.close());const next=JSON.parse((await get(updated.address().port,"/asset-versions.json")).body);assert.notEqual(next["/test.glb"],manifest["/test.glb"]);
});
test("model URL versioning preserves queries and external URLs; manifest failure falls back",async()=>{
 const source=fs.readFileSync(path.join(__dirname,"../public/asset-cache.js"),"utf8").replace(/^import[^\n]+\n/,"");
 for(const broken of [false,true]){
  let modifier;
  const context={THREE:{DefaultLoadingManager:{setURLModifier:fn=>modifier=fn}},location:{href:"https://junto.test/sala",origin:"https://junto.test"},URL,AbortSignal,console:{debug(){}},fetch:async()=>{if(broken)throw Error("offline");return {ok:true,json:async()=>({"/macaco.glb":"new-hash"})};}};
  await vm.runInNewContext("(async()=>{"+source+"})()",context);
  const raw="/macaco.glb?existing=1";
  if(broken)assert.equal(modifier(raw),raw);
  else{const url=new URL(modifier(raw));assert.equal(url.searchParams.get("existing"),"1");assert.equal(url.searchParams.get("assetv"),"new-hash");}
  assert.equal(modifier("https://external.test/macaco.glb"),"https://external.test/macaco.glb");
  assert.equal(modifier("blob:example"),"blob:example");
 }
});
