/* Conquistas e votações, compartilhadas por todos na sala. */
const bridge=window.jfDanceBridge, socket=bridge?.socket;
const $=id=>document.getElementById(id);
const inRoom=()=>Boolean(bridge?.getRoom?.());
const skip=$("jfSkipVote"),status=$("jfSkipStatus"),banana=$("jfBananaThrow"),count=$("jfBananaCount");
const panel=$("jfAchievementsPanel"),open=$("jfAchievementsOpen"),close=$("jfAchievementsClose");
let lastBanana=0,processedTrack="",skipPending=false;
function action(name){if(inRoom())socket?.emit("achievement-action",{action:name});}
function notice(message){if(status)status.textContent=message;}
async function refreshAchievements(){
  try{
    const response=await fetch("/api/achievements",{cache:"no-store"});
    const data=await response.json();
    const list=$("jfAchievementsList"),note=$("jfAchievementsNote");
    if(!list)return;
    list.replaceChildren();
    note.textContent=data.loggedIn
      ?"Suas conquistas ficam salvas na conta cadastrada."
      :"Visite o login Google para desbloquear e salvar suas conquistas.";
    for(const achievement of data.achievements||[]){
      const item=document.createElement("div");
      item.className="jf-achievement-item"+(achievement.unlocked?" unlocked":"");
      const icon=document.createElement("span");icon.className="jf-achievement-icon";icon.textContent=achievement.icon;
      const details=document.createElement("div"),heading=document.createElement("strong");
      heading.textContent=achievement.name+(achievement.unlocked?" ✓":"");
      const description=document.createElement("p");description.textContent=achievement.description;
      const rate=document.createElement("small");rate.textContent=achievement.percentage+"% dos usuários cadastrados desbloquearam";
      details.append(heading,description,rate);item.append(icon,details);list.append(item);
    }
  }catch(e){if($("jfAchievementsNote"))$("jfAchievementsNote").textContent="Não foi possível consultar as conquistas.";}
}
open?.addEventListener("click",()=>{
  panel.hidden=!panel.hidden;
  if(!panel.hidden)void refreshAchievements();
});
close?.addEventListener("click",()=>{panel.hidden=true;});
skip?.addEventListener("click",()=>{
  if(!inRoom())return notice("Entre em uma sala para votar.");
  action("skip");
  socket.emit("skip-track");
});
banana?.addEventListener("click",()=>{
  if(!inRoom())return notice("Entre em uma sala para jogar bananas.");
  if(Date.now()-lastBanana<2500)return;
  lastBanana=Date.now();action("banana");socket.emit("banana-throw");
});
const tracked=[
  ["jfClubTomato","tomato"],
  ["jfChatLauncher","chat"],
  ["jfChatEmojiToggle","emoji"],
  ["jfFriendsLauncher","friends"],
  ["jfOpenDance","dance"],
  ["jfOpenProfile","profile"],
  ["jfOpenWardrobe","wardrobe"]
];
for(const [id,name] of tracked){$(id)?.addEventListener("click",()=>action(name));}
function flyBanana(){
  const target=$("jfBananaProgress"),source=banana;
  if(!source||!target||document.hidden)return;
  const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
  const element=document.createElement("span");
  element.className="jf-banana-fly";element.textContent="🍌";
  element.style.left=(a.left+a.width/2)+"px";element.style.top=(a.top+a.height/2)+"px";
  document.body.append(element);
  requestAnimationFrame(()=>{element.style.transform=`translate(${b.left-a.left}px,${b.top-a.top-110}px) rotate(620deg) scale(.5)`;element.style.opacity=".15";});
  setTimeout(()=>element.remove(),600);
}
socket?.on("banana-fired",()=>flyBanana());
socket?.on("banana-progress",({count:current,goal})=>{
  if(count)count.textContent=current+"/"+goal;
  if($("jfBananaProgress"))$("jfBananaProgress").value=current;
});
socket?.on("banana-goal",({message})=>notice(message));
socket?.on("banana-error",({message})=>notice(message));
socket?.on("skip-votes",({votes,needed,participants})=>{
  notice(participants<2?"É preciso pelo menos 2 participantes para pular.":`${votes}/${needed} votos para pular.`);
});
socket?.on("skip-error",({message})=>notice(message));
socket?.on("skip-approved-notice",()=>notice("⏭ Votação aprovada! Solicitando skip ao DJ..."));
socket?.on("skip-approved",async({room})=>{
  if(room!==bridge?.getRoom?.())return;
  try{
    const result=await fetch("/api/spotify/skip",{method:"POST",credentials:"same-origin"});
    const data=await result.json();
    if(!result.ok)throw Error(data.error||"Spotify não permitiu pular a música.");
    notice("⏭ Música pulada pela votação!");
  }catch(error){notice("Votação aprovada, mas o Spotify não pulou: "+error.message);}
});
socket?.on("achievement-unlocked",({id})=>{
  void refreshAchievements();
  const names={welcome:"Bem-vindo a bordo",jorge:"Jorge, ô curioso"};
  notice("🏅 Conquista desbloqueada: "+(names[id]||id));
});
socket?.on("joined-room",()=>{
  // Emite somente depois de processar a entrada da sala no cliente.
  queueMicrotask(()=>{socket?.emit("social-join");});
});
socket?.on("track-update",track=>{
  if(!inRoom()||!track)return;
  // Apenas o DJ publica o identificador da faixa ao servidor.
});
function updateTrackKey(){
  if(!inRoom())return;
  const bridgeTrack=window.jfSocialCurrentTrack;
  if(!bridgeTrack?.key)return;
  if(bridgeTrack.key===processedTrack)return;
  processedTrack=bridgeTrack.key;
  socket.emit("skip-track-updated",{key:processedTrack});
}
window.addEventListener("jf-current-song",event=>{
  if(event.detail?.isDj!==true)return;
  window.jfSocialCurrentTrack=event.detail;
  updateTrackKey();
});
socket?.on("disconnect",()=>{processedTrack="";});
void refreshAchievements();
