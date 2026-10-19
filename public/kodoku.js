(() => {
  "use strict";
  // Emblema original em SVG: linhas limpas baseadas no esboço do mascote.
  // Não depende de imagem externa, evita peso de download e se adapta à tela.
  const sealMarkup=`<span class="jf-kodoku-seal" aria-hidden="true"><svg viewBox="0 0 100 100" focusable="false">
    <path d="M21 38Q19 13 40 12Q50 8 61 14Q80 19 80 40L78 66Q69 86 51 87Q27 87 21 66Z"/>
    <path d="M23 52Q8 42 10 59Q13 69 24 65M77 52Q92 41 91 57Q90 67 77 65"/>
    <path d="M29 31L43 42M71 31L57 42M34 43Q40 40 43 48M57 48Q60 40 67 43"/>
    <path d="M37 49L37 56M63 49L63 56M45 61Q50 57 55 61L50 66Z"/>
    <path d="M22 70Q50 62 78 70M31 78Q50 84 69 78"/>
  </svg></span>`;
  const makeFeature=()=>{
    const feature=document.createElement("div");
    feature.className="jf-kodoku-feature";
    feature.innerHTML=sealMarkup+'<strong>KODOKU</strong><span class="jf-kodoku-ornament">✧ ─── ◇ ─── ✧</span><p>Registros de uma sala em silêncio.</p>';
    return feature;
  };
  const place=()=>{
    const player=document.querySelector(".jf-player-panel");
    if(player&&!player.querySelector(".jf-kodoku-feature"))player.prepend(makeFeature());
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",place,{once:true});
  else place();
})();