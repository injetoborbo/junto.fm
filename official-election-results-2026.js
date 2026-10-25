"use strict";
/*
 * Apuracao presidencial BR 2026 — consulta somente TSE.
 * Endpoint oficial deve vir de TSE_2026_PRESIDENT_RESULT_URL; sem URL validada
 * nao exibimos numero algum. Remover facilmente revertendo o PR temporario.
 */
const STOP_AT=Date.parse("2026-10-27T03:00:00.000Z");
const INTERVAL_MS=30000;
const HOST="resultados.tse.jus.br";
// Link fornecido pelo criador, sempre consultado pelo servidor e sem nocache fixo.
const DEFAULT_TSE_URL="https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws";
const SOURCE_URL=String(process.env.TSE_2026_PRESIDENT_RESULT_URL||DEFAULT_TSE_URL).trim();
const ENABLED=process.env.JF_ELECTION_LIVE_ENABLED!=="false";
// JSON ou JWS: e006258 no arquivo corresponde ao diretorio 6258.
function validateOfficialUrl(raw){
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.hostname!==HOST||url.port||url.username||url.password||url.hash)return null;
    if(url.search&&!/^\?nocache=\d{1,18}$/.test(url.search))return null;
    const m=url.pathname.match(/^\/oficial\/ele2026\/(\d{1,10})\/dados\/br\/br-c0001-e(\d{1,10})-(v\.json|u\.jws)$/);
    if(!m||Number(m[1])!==Number(m[2]))return null;
    // O cache buster muda a cada consulta; nao confiar em parametros extras.
    return url.origin+url.pathname;
  }catch(_){return null;}
}
// Le o envelope JWS recebido do HTTPS do TSE. Isto nao substitui a
// verificacao criptografica de assinatura do JWS com chave publica do TSE.
function decodeTseResponse(raw){
  if(typeof raw!=="string"||raw.length>2500000)throw Error("Resposta TSE invalida ou grande.");
  const source=raw.trim();
  if(!source)throw Error("Resposta vazia do TSE.");
  let header=null,encoded=null,payload=null;
  if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(source)){
    const parts=source.split(".");
    header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    encoded=parts[1];
  }else{
    const parsed=JSON.parse(source);
    if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&
       typeof parsed.payload==="string"&&(parsed.protected||Array.isArray(parsed.signatures))){
      const signature=parsed.protected||parsed.signatures?.[0]?.protected;
      if(typeof signature!=="string")throw Error("Cabecalho protegido JWS ausente.");
      header=JSON.parse(Buffer.from(signature,"base64url").toString("utf8"));
      encoded=parsed.payload;
    }else payload=parsed;
  }
  if(encoded!==null){
    if(!header||typeof header.alg!=="string"||header.alg==="none"||
       !/^(RS|PS|ES|EdDSA)/.test(header.alg))throw Error("Algoritmo JWS nao reconhecido.");
    if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error("Payload JWS invalido.");
    payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
  }
  if(typeof payload==="string")payload=JSON.parse(payload);
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw Error("Payload da apuracao nao e um objeto JSON.");
  return payload;
}
function numberOf(value){
  const text=String(value??"").trim();
  if(!/^\d+$/.test(text))return null;
  const n=Number(text);
  return Number.isSafeInteger(n)&&n>=0?n:null;
}
function percentage(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(String(value).replace(",","."));
  return Number.isFinite(n)&&n>=0&&n<=100?Number(n.toFixed(2)):null;
}
function keyOf(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
}
function parseOfficialPayload(payload){
  // O endpoint de apuracao geral do TSE precisa conter candidatos,
  // nao totais de municipios, de deputado ou uma pesquisa eleitoral.
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return null;
  if(payload.carper!=null&&String(payload.carper)!=="1")return null;
  const rows=Array.isArray(payload.cand)?payload.cand:null;
  if(!rows||rows.length<2)return null;
  const find=(number,search)=>rows.find(c=>{
    if(!c||typeof c!=="object")return false;
    const name=keyOf(c.nm??c.nome??"");
    return String(c.n??"")===number&&name.includes(search);
  });
  const lula=find("13","LULA");
  const flavio=find("22","FLAVIO");
  if(!lula||!flavio)return null;
  const votosLula=numberOf(lula.vap);
  const votosFlavio=numberOf(flavio.vap);
  if(votosLula===null||votosFlavio===null)return null;
  const pctLula=percentage(lula.pvap);
  const pctFlavio=percentage(flavio.pvap);
  // Se o TSE nao enviar percentuais, so calcular quando houver
  // exatamente dois candidatos, mantendo indicador 'calculado'.
  const both=rows.length===2&&votosLula+votosFlavio>0;
  return {
    lula:{name:String(lula.nm),votes:votosLula,percent:pctLula??(both?Number((votosLula*100/(votosLula+votosFlavio)).toFixed(2)):null)},
    flavio:{name:String(flavio.nm),votes:votosFlavio,percent:pctFlavio??(both?Number((votosFlavio*100/(votosLula+votosFlavio)).toFixed(2)):null)},
    percentSource:pctLula!==null&&pctFlavio!==null?"tse":"calculado-segundo-turno",
    reportedAt:typeof payload.ht==="string"?payload.ht:typeof payload.t==="string"?payload.t:null,
    status:typeof payload.tpabr==="string"?payload.tpabr:null,
    apuracao:percentage(payload.pst)
  };
}
module.exports=function registerOfficialElection2026(app,io){
  const endpoint=validateOfficialUrl(SOURCE_URL);
  let latest=null,lastFetch=0,lastSuccess=0,inflight=null,lastError=null;
  const isOpen=()=>ENABLED&&Date.now()<STOP_AT;
  const publicState=()=>({
    source:"TSE — resultados.tse.jus.br",official:true,
    enabled:isOpen(),expiresAt:new Date(STOP_AT).toISOString(),
    configured:Boolean(endpoint),lastReadAt:lastFetch?new Date(lastFetch).toISOString():null,
    lastSuccessAt:lastSuccess?new Date(lastSuccess).toISOString():null,
    error:lastError,result:latest
  });
  async function refresh(force=false){
    if(!isOpen())return publicState();
    if(!endpoint){lastError="URL da apuracao oficial do TSE ainda nao configurada.";return publicState();}
    if(inflight)return inflight;
    if(!force&&Date.now()-lastFetch<INTERVAL_MS)return publicState();
    inflight=(async()=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8000);
      try{
        const isJws=endpoint.endsWith(".jws");
        const feedUrl=endpoint+(isJws?"?nocache="+Date.now():"");
        const res=await fetch(feedUrl,{signal:controller.signal,redirect:"error",headers:{
          "Accept":isJws?"application/jose, application/json, text/plain":"application/json",
          "Cache-Control":"no-cache"}});
        if(!res.ok)throw Error("TSE retornou HTTP "+res.status);
        const size=Number(res.headers.get("content-length")||0);
        if(size>2500000)throw Error("Resposta do TSE excede limite seguro.");
        const raw=await res.text();
        if(raw.length>2500000)throw Error("Resposta do TSE excede limite seguro.");
        const parsed=parseOfficialPayload(decodeTseResponse(raw));
        if(!parsed)throw Error("Fonte nao informou Lula e Flavio com votos validos para presidente do Brasil.");
        latest=parsed;lastSuccess=Date.now();lastError=null;
      }catch(error){
        // Manter o ultimo dado valido com idade visivel; nunca usar 0 inventado.
        lastError="Sem atualizacao oficial: "+String(error.message||error).slice(0,180);
      }finally{clearTimeout(timeout);lastFetch=Date.now();}
      const state=publicState();
      io.emit("jf-election-official-update",state);
      return state;
    })();
    try{return await inflight;}finally{inflight=null;}
  }
  app.get("/api/official-election-2026",async(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json(await refresh());
  });
  io.on("connection",socket=>{
    socket.on("jf-election-official-get",async()=>socket.emit("jf-election-official-update",await refresh()));
  });
  if(isOpen()){
    const timer=setInterval(()=>{void refresh();},INTERVAL_MS);
    timer.unref?.();
    void refresh();
  }
  const expiry=setTimeout(()=>{
    latest=null;lastError=null;lastSuccess=0;
    io.emit("jf-election-official-update",publicState());
  },Math.max(0,STOP_AT-Date.now()));
  expiry.unref?.();
};
module.exports.parseOfficialPayload=parseOfficialPayload;
module.exports.validateOfficialUrl=validateOfficialUrl;
module.exports.decodeTseResponse=decodeTseResponse;
